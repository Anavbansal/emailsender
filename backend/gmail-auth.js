const express = require("express");
const fs      = require("fs");
const path    = require("path");
const { google } = require("googleapis");

const router     = express.Router();
const TOKEN_PATH = path.join(__dirname, "tokens.json");

function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      client.setCredentials(
        JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"))
      );
      return client;
    } catch (e) {}
  }
  if (process.env.GMAIL_REFRESH_TOKEN) {
    client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });
  }
  return client;
}

function getGmailClient() {
  return google.gmail({ version: "v1", auth: getOAuthClient() });
}

// ─── Recursively extract best body from Gmail payload ─────────────────────────
function extractBody(payload) {
  if (!payload) return "";
  // Simple single-part message
  if (payload.body && payload.body.data) {
    const raw = Buffer.from(payload.body.data, "base64").toString("utf8");
    if (payload.mimeType === "text/plain")
      return `<div style="white-space:pre-wrap;font-family:'Segoe UI',sans-serif;font-size:14px;line-height:1.7;padding:8px 0;color:#374151;">${raw.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>`;
    return raw; // text/html
  }
  if (payload.parts) {
    // Prefer HTML over plain
    for (const mime of ["text/html", "text/plain"]) {
      for (const part of payload.parts) {
        if (part.mimeType === mime && part.body?.data) {
          const raw = Buffer.from(part.body.data, "base64").toString("utf8");
          if (mime === "text/plain")
            return `<div style="white-space:pre-wrap;font-family:'Segoe UI',sans-serif;font-size:14px;line-height:1.7;padding:8px 0;color:#374151;">${raw.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>`;
          return raw;
        }
      }
    }
    // Nested multipart
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }
  return "";
}

// ─── OAuth ────────────────────────────────────────────────────────────────────
router.get("/api/gmail/auth", (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI)
      return res.status(500).json({ success: false, message: "Google OAuth not configured in .env" });
    const url = getOAuthClient().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    });
    res.redirect(url);
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get("/api/gmail/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ success: false, message: "Missing OAuth code." });
    const auth = getOAuthClient();
    const { tokens } = await auth.getToken(code);
    auth.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");
    res.json({ success: true, message: "Gmail connected successfully." });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/gmail/inbox?q=...&max=...&pageToken=... ────────────────────────
// q: Gmail search query (default: in:inbox). pageToken: cursor for pagination.
router.get("/api/gmail/inbox", async (req, res) => {
  try {
    const gmail     = getGmailClient();
    const q         = req.query.q         || "in:inbox";
    const maxRes    = parseInt(req.query.max) || 30;
    const pageToken = req.query.pageToken || undefined;

    const listParams = { userId: "me", q, maxResults: maxRes };
    if (pageToken) listParams.pageToken = pageToken;

    const list     = await gmail.users.messages.list(listParams);
    const messages = await Promise.all(
      (list.data.messages || []).map(async item => {
        const d = await gmail.users.messages.get({ userId: "me", id: item.id, format: "metadata",
          metadataHeaders: ["Subject", "From", "To", "Date"] });
        const h       = d.data.payload.headers || [];
        const subject = h.find(x => x.name === "Subject")?.value || "(No Subject)";
        const from    = h.find(x => x.name === "From")?.value    || "Unknown";
        const to      = h.find(x => x.name === "To")?.value      || "";
        const date    = h.find(x => x.name === "Date")?.value    || "";
        const labels  = d.data.labelIds || [];
        return {
          id: item.id,
          threadId: d.data.threadId,
          from, to, subject, date,
          snippet:  d.data.snippet || "",
          isRead:   !labels.includes("UNREAD"),
          isSent:   labels.includes("SENT"),
          isReply:  /^re:/i.test(subject),
          labelIds: labels,
        };
      })
    );
    return res.json({ success: true, messages, nextPageToken: list.data.nextPageToken || null });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/gmail/thread/:threadId ─────────────────────────────────────────
// Returns every message in the thread including full HTML body
router.get("/api/gmail/thread/:threadId", async (req, res) => {
  try {
    const gmail  = getGmailClient();
    const thread = await gmail.users.threads.get({ userId: "me", id: req.params.threadId, format: "full" });
    const messages = (thread.data.messages || []).map(msg => {
      const h       = msg.payload.headers || [];
      const subject = h.find(x => x.name === "Subject")?.value || "";
      const from    = h.find(x => x.name === "From")?.value    || "";
      const to      = h.find(x => x.name === "To")?.value      || "";
      const date    = h.find(x => x.name === "Date")?.value    || "";
      const msgId   = h.find(x => x.name === "Message-ID")?.value || msg.id;
      const body    = extractBody(msg.payload);
      return {
        id: msg.id, threadId: msg.threadId, msgId,
        subject, from, to, date,
        snippet: msg.snippet || "",
        body,
        isRead: !(msg.labelIds || []).includes("UNREAD"),
        labelIds: msg.labelIds || [],
      };
    });
    return res.json({ success: true, messages, subject: messages[0]?.subject || "" });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/gmail/reply ────────────────────────────────────────────────────
// Send a reply in the same Gmail thread
router.post("/api/gmail/reply", async (req, res) => {
  try {
    const { threadId, messageId, to, subject, body } = req.body;
    if (!to || !body) return res.status(400).json({ success: false, message: "to and body are required." });

    const gmail  = getGmailClient();
    const rSubj  = subject && !subject.startsWith("Re:") ? `Re: ${subject}` : (subject || "Re:");

    const rawLines = [
      `To: ${to}`,
      `Subject: ${rSubj}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      messageId ? `In-Reply-To: ${messageId}` : "",
      messageId ? `References: ${messageId}`  : "",
      "",
      body,
    ].filter(l => l !== undefined);

    const raw = Buffer.from(rawLines.join("\r\n")).toString("base64url");
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId },
    });
    return res.json({ success: true, message: "Reply sent!" });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.get("/api/gmail/debug-tokens", (req, res) => {
  if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    res.json({ success: true, refresh_token: tokens.refresh_token });
  } else {
    res.json({ success: false, message: "No tokens found" });
  }
});

module.exports = router;
