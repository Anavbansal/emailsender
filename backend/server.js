require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const https = require("https");
const cron = require("node-cron");
const gmailAuthRoutes = require("./gmail-auth");
const {
  createTrackingRecord, markTrackingOpened,
  getTrackingRecords, getPixelBuffer,
  storeEmailHtml, getEmailHtml,
} = require("./tracking");

const app  = express();
const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());
app.use(gmailAuthRoutes);

const RESUME_PATH      = path.join(__dirname, "ANAV_BANSAL_FullStackDeveloper.pdf");
const RESUME_DRIVE_LINK = "https://drive.google.com/file/d/1LKc-w9Ggd5I1eZ3t7Wvm9psU-4ITxHxr/view?usp=sharing";
const SCHEDULED_FILE   = path.join(__dirname, "scheduled-emails.json");
const THREE_DAYS_MS    = 3 * 24 * 60 * 60 * 1000;

// ─── Transporter ──────────────────────────────────────────────────────────────
const { google } = require("googleapis");

function getGmailAPITransport() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  return oauth2Client;
}

async function sendViaGmailAPI({ to, subject, html }) {
  const auth = getGmailAPITransport();
  const gmail = google.gmail({ version: "v1", auth });

  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
  
  const boundary = "boundary_" + Date.now();
  const resumePath = path.join(__dirname, "ANAV_BANSAL_FullStackDeveloper.pdf");
  const resumeData = fs.readFileSync(resumePath).toString("base64");

  const rawEmail = [
    `From: "Anav Bansal" <${process.env.GMAIL_USER}>`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(html).toString("base64"),
    ``,
    `--${boundary}`,
    `Content-Type: application/pdf; name="Anav_Bansal_Resume.pdf"`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="Anav_Bansal_Resume.pdf"`,
    ``,
    resumeData,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  const encoded = Buffer.from(rawEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
  console.log("✅ Email sent via Gmail API:", res.data.id);
  return res.data;
}

console.log("✅ Gmail API transport ready.");
// ─── Scheduled emails ─────────────────────────────────────────────────────────
function loadScheduled() {
  try { return JSON.parse(fs.readFileSync(SCHEDULED_FILE, "utf8")); } catch { return []; }
}
function saveScheduled(jobs) {
  fs.writeFileSync(SCHEDULED_FILE, JSON.stringify(jobs, null, 2), "utf8");
}
cron.schedule("* * * * *", async () => {
  const jobs = loadScheduled();
  const now  = Date.now();
  let changed = false;
  for (const job of jobs) {
    if (job.status === "pending" && new Date(job.scheduledTime).getTime() <= now) {
      try { await sendApplicationEmail(job.emailData); job.status = "sent"; }
      catch (e) { job.status = "failed"; job.error = e.message; }
      changed = true;
    }
  }
  if (changed) saveScheduled(jobs);
});

// ─── Google Sheets ────────────────────────────────────────────────────────────
const SHEET_HEADERS = ["Mail ID","HR Email","Company","Role","Sent At","Tracking ID","Status","Opened At"];
// Sheet tab name — Google Sheets defaults to "Sheet1". Override via SHEET_TAB in .env
const SHEET_TAB = process.env.SHEET_TAB || "Sheet1";
let sheetsInitialized = false;

async function getSheetsClient() {
  const { google } = require("googleapis");
  const tokenPath = path.join(__dirname, "tokens.json");
  
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  // File se try karo pehle
  if (fs.existsSync(tokenPath)) {
    auth.setCredentials(JSON.parse(fs.readFileSync(tokenPath, "utf8")));
  }
  // Env variable se load karo agar file nahi hai
  else if (process.env.GMAIL_REFRESH_TOKEN) {
    auth.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });
  }
  // Dono nahi hain toh error
  else {
    throw new Error("No Gmail tokens — connect via /api/gmail/auth");
  }

  return google.sheets({ version: "v4", auth });
}

async function ensureSheetHeaders(sheets) {
  if (sheetsInitialized) return;
  const ex = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID, range: `${SHEET_TAB}!A1:H1`,
  });
  if ((ex.data.values?.[0] || [])[0] !== "Mail ID") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID, range: `${SHEET_TAB}!A1:H1`,
      valueInputOption: "USER_ENTERED", requestBody: { values: [SHEET_HEADERS] },
    });
    console.log(`✅ Headers written to ${SHEET_TAB}!A1:H1`);
  }
  sheetsInitialized = true;
}

async function logToSheets(row) {
  if (!process.env.GOOGLE_SHEET_ID) return;
  try {
    const sheets = await getSheetsClient();
    await ensureSheetHeaders(sheets);
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID, range: `${SHEET_TAB}!A:H`,
      valueInputOption: "USER_ENTERED", requestBody: { values: [row] },
    });
  } catch (e) { console.warn("⚠️ Sheets log failed:", e.message); }
}

// ─── GET /api/sheets/setup ────────────────────────────────────────────────────
app.get("/api/sheets/setup", async (req, res) => {
  if (!process.env.GOOGLE_SHEET_ID)
    return res.status(400).json({ success: false, message: "GOOGLE_SHEET_ID not set in .env" });
  try {
    const sheets = await getSheetsClient();
    sheetsInitialized = false;
    await ensureSheetHeaders(sheets);
    return res.json({
      success: true,
      message: `Connected! Headers written to tab "${SHEET_TAB}" row 1.`,
      sheetId: process.env.GOOGLE_SHEET_ID,
      tab: SHEET_TAB,
    });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/sheets/debug ────────────────────────────────────────────────────
// Diagnose sheet connection and show actual tab names + row count
app.get("/api/sheets/debug", async (req, res) => {
  if (!process.env.GOOGLE_SHEET_ID)
    return res.json({ ok: false, message: "GOOGLE_SHEET_ID not set" });
  try {
    const { google } = require("googleapis");
    const tokenPath = path.join(__dirname, "tokens.json");
    if (!fs.existsSync(tokenPath))
      return res.json({ ok: false, message: "No Gmail tokens — connect via /api/gmail/auth" });
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI
    );
    auth.setCredentials(JSON.parse(fs.readFileSync(tokenPath, "utf8")));
    const sheets = google.sheets({ version: "v4", auth });

    // Get sheet metadata — tab names
    const meta = await sheets.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID });
    const tabs = meta.data.sheets.map(s => ({ name: s.properties.title, id: s.properties.sheetId }));

    // Try to read first tab
    const firstTab = tabs[0]?.name || "Sheet1";
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID, range: `${firstTab}!A1:H5`,
    }).catch(() => ({ data: { values: [] } }));

    return res.json({
      ok: true,
      configuredTab: SHEET_TAB,
      actualTabs: tabs,
      warning: tabs.some(t => t.name === SHEET_TAB) ? null : `Tab "${SHEET_TAB}" not found! Add SHEET_TAB=${firstTab} to .env`,
      firstFiveRows: data.data.values || [],
    });
  } catch (e) {
    return res.json({ ok: false, message: e.message });
  }
});

// ─── Header theme gradients ───────────────────────────────────────────────────
const HEADER_THEMES = {
  blue:   "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)",
  purple: "linear-gradient(135deg,#4c1d95 0%,#7c3aed 100%)",
  green:  "linear-gradient(135deg,#064e3b 0%,#059669 100%)",
  dark:   "linear-gradient(135deg,#111827 0%,#374151 100%)",
  teal:   "linear-gradient(135deg,#134e4a 0%,#0d9488 100%)",
  orange: "linear-gradient(135deg,#92400e 0%,#d97706 100%)",
};
const DEFAULT_HIGHLIGHTS = [
  "4.7+ years · Node.js, AngularJS, ReactJS, Express.js",
  "AWS Lambda · DynamoDB · S3 · Amazon Connect",
  "10+ enterprise CTI integrations (Avaya, Genesys, Webex, Zoom)",
  "CRM: ServiceNow, Salesforce, Freshdesk, MS Dynamics, CDK Global",
  "AI-assisted development: Claude, GitHub Copilot, ChatGPT",
];
const CTI_HIGHLIGHTS = [
  "4.7+ years · CTI/Telephony Integration Specialist",
  "Avaya (AACC, AES, IPO) · Genesys · Webex · Zoom · Amazon Connect",
  "10+ enterprise CTI integrations delivered end-to-end",
  "CRM: ServiceNow, Salesforce, Freshdesk, Zendesk, CDK Global",
  "AWS Lambda · DynamoDB · IVR/ACD Design · Chatbot Development",
];

// ─── Core send helper ─────────────────────────────────────────────────────────
async function sendApplicationEmail({
  hrEmail, hrName = "", company, role, customNote,
  templateType = "fullstack", readReceipt = false,
  customIntro = "", customHighlights = null, headerTheme = "blue",
}) {
  const subject = role
    ? `Application for ${role} Position — Anav Bansal`
    : `Job Application — Anav Bansal (Senior Full Stack Developer)`;

  const trackRecord = createTrackingRecord({ hrEmail, hrName, company, role, subject, type: "application" });
  const trackUrl    = `${BASE_URL}/api/track/${trackRecord.trackingId}`;
  const tplOpts     = { hrName, company, role, customNote, trackUrl, customIntro, customHighlights, headerTheme };

  let html;
  if (templateType === "cti")         html = buildCTIHTML(tplOpts);
  else if (templateType === "formal") html = buildFormalHTML(tplOpts);
  else                                html = buildFullstackHTML(tplOpts);

  storeEmailHtml(trackRecord.trackingId, html);

  const attachments = [];
  if (fs.existsSync(RESUME_PATH))
    attachments.push({ filename: "Anav_Bansal_Resume.pdf", path: RESUME_PATH, contentType: "application/pdf" });

  const mailOpts = { from: `"Anav Bansal" <${process.env.GMAIL_USER}>`, to: hrEmail, subject, html, attachments };
  if (readReceipt) {
    mailOpts.headers = {
      "Disposition-Notification-To": process.env.GMAIL_USER,
      "Return-Receipt-To": process.env.GMAIL_USER,
    };
  }
  const info = await sendViaGmailAPI(mailOpts);
  console.log(`📤 Sent → ${hrEmail} | ${info.messageId}`);
  logToSheets([info.messageId, hrEmail, company||"", role||"", new Date().toISOString(), trackRecord.trackingId, "Sent", ""]);
  return { info, trackRecord };
}

// ─── HTML builder helpers ─────────────────────────────────────────────────────
function footer(accentColor = "#2563eb") {
  return `<div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 40px;">
    <p style="margin:0;font-weight:600;color:#111827;">Anav Bansal</p>
    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">
      📞 +91 7827855635 &nbsp;·&nbsp;
      ✉️ <a href="mailto:anavbansal06@gmail.com" style="color:${accentColor};text-decoration:none;">anavbansal06@gmail.com</a> &nbsp;·&nbsp;
      <a href="https://linkedin.com/in/anavbansal-51b191162" style="color:${accentColor};text-decoration:none;">LinkedIn</a>
    </p>
    <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;">Alwar, Rajasthan, India</p>
  </div>`;
}

function resumeBox(accentColor = "#2563eb") {
  return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:18px 24px;margin-bottom:24px;">
    <p style="margin:0 0 10px;font-weight:600;color:#111827;font-size:14px;">📎 Resume / CV</p>
    <p style="margin:0;font-size:14px;color:#374151;">Attached and available online:<br/>
      <a href="${RESUME_DRIVE_LINK}" style="color:${accentColor};text-decoration:none;font-weight:500;">🔗 View on Google Drive →</a>
    </p>
  </div>`;
}

// ─── HTML: Full Stack Developer ───────────────────────────────────────────────
function buildFullstackHTML({ hrName, company, role, customNote, trackUrl = "", customIntro = "", customHighlights = null, headerTheme = "blue" }) {
  const gradient  = HEADER_THEMES[headerTheme] || HEADER_THEMES.blue;
  const greeting  = hrName ? `Dear ${hrName},` : "Dear Hiring Manager,";
  const roleText  = role   ? ` for the <strong>${role}</strong> position` : "";
  const noteBlock = customNote ? `<p style="color:#374151;line-height:1.8;margin:16px 0;">${customNote}</p>` : "";
  const pixel     = trackUrl   ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt=""/>` : "";
  const intro     = customIntro ||
    `I am writing to express my strong interest in joining <strong>${company||"your organization"}</strong>${roleText}.
     With <strong>4.7+ years of hands-on experience</strong> as a Senior Full-Stack Developer, I have architected and
     shipped production-grade applications across Node.js, AngularJS, AWS Lambda, and REST APIs — with deep expertise
     in CTI/Telephony integrations for enterprise platforms.`;
  const items     = (customHighlights && customHighlights.length) ? customHighlights : DEFAULT_HIGHLIGHTS;
  const hlHtml    = items.map(h => `<li>${h}</li>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:${gradient};padding:36px 40px;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Anav Bansal</h1>
    <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px;">Senior Full Stack Developer · Node.js · Angular · AWS</p>
  </div>
  <div style="padding:36px 40px;">
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${greeting}</p>
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${intro}</p>
    ${noteBlock}
    <p style="color:#374151;line-height:1.8;margin:0 0 24px;">
      At <strong>Novelvox PVT Ltd</strong>, I delivered 10+ full-stack products across contact center ecosystems,
      published apps on ServiceNow, Freshdesk, and Webex marketplaces, and received three <em>'Pat on the Back'</em> awards.
    </p>
    <div style="background:#f0f7ff;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-weight:600;color:#1e3a5f;font-size:14px;">⚡ Quick Highlights</p>
      <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:2;">${hlHtml}</ul>
    </div>
    ${resumeBox("#2563eb")}
    <p style="color:#374151;line-height:1.8;margin:0;">Thank you for your time and consideration.</p>
  </div>
  ${footer("#2563eb")}
</div>${pixel}</body></html>`;
}

// ─── HTML: CTI Expert ─────────────────────────────────────────────────────────
function buildCTIHTML({ hrName, company, role, customNote, trackUrl = "", customIntro = "", customHighlights = null, headerTheme = "purple" }) {
  const gradient  = HEADER_THEMES[headerTheme] || HEADER_THEMES.purple;
  const greeting  = hrName ? `Dear ${hrName},` : "Dear Hiring Manager,";
  const roleText  = role   ? ` for the <strong>${role}</strong> position` : "";
  const noteBlock = customNote ? `<p style="color:#374151;line-height:1.8;margin:16px 0;">${customNote}</p>` : "";
  const pixel     = trackUrl   ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt=""/>` : "";
  const intro     = customIntro ||
    `I am writing to express my strong interest in joining <strong>${company||"your organization"}</strong>${roleText}.
     With <strong>4.7+ years specializing in CTI/Telephony integrations</strong>, I have architected enterprise-grade solutions
     across Avaya AACC, Avaya AES, Genesys, Webex Contact Center, Zoom, and Amazon Connect — enabling seamless agent workflows,
     real-time call controls, screen popups, and CRM synchronization at scale.`;
  const items     = (customHighlights && customHighlights.length) ? customHighlights : CTI_HIGHLIGHTS;
  const hlHtml    = items.map(h => `<li>${h}</li>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:${gradient};padding:36px 40px;">
    <p style="margin:0 0 6px;color:#ddd6fe;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">CTI &amp; Telephony Integration Specialist</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Anav Bansal</h1>
    <p style="margin:6px 0 0;color:#ddd6fe;font-size:14px;">Avaya · Genesys · Webex · Amazon Connect · CRM Integration</p>
  </div>
  <div style="padding:36px 40px;">
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${greeting}</p>
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${intro}</p>
    ${noteBlock}
    <p style="color:#374151;line-height:1.8;margin:0 0 24px;">
      At <strong>Novelvox PVT Ltd</strong>, I engineered serverless AWS Lambda pipelines for Amazon Connect, built
      multi-channel campaign automation, and delivered CTI integrations across 6+ CRM platforms.
      Nominated for <em>Performance of the Year</em> and received three <em>'Pat on the Back'</em> awards.
    </p>
    <div style="background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-weight:600;color:#4c1d95;font-size:14px;">📞 CTI Expertise Highlights</p>
      <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:2;">${hlHtml}</ul>
    </div>
    ${resumeBox("#7c3aed")}
    <p style="color:#374151;line-height:1.8;margin:0;">Thank you for your time and consideration.</p>
  </div>
  ${footer("#7c3aed")}
</div>${pixel}</body></html>`;
}

// ─── HTML: Formal ─────────────────────────────────────────────────────────────
function buildFormalHTML({ hrName, company, role, customNote, trackUrl = "", customIntro = "", customHighlights = null, headerTheme = "blue" }) {
  const gradient  = HEADER_THEMES[headerTheme] || HEADER_THEMES.blue;
  const greeting  = hrName ? `Dear ${hrName},` : "Dear Hiring Manager,";
  const roleText  = role   ? ` for the <strong>${role}</strong> position` : "";
  const noteBlock = customNote ? `<p style="color:#374151;line-height:1.8;margin:16px 0;">${customNote}</p>` : "";
  const pixel     = trackUrl   ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt=""/>` : "";
  const intro     = customIntro ||
    `I am respectfully submitting my application${roleText} at <strong>${company||"your organization"}</strong>.
     I am a Senior Software Developer with <strong>4.7+ years of professional experience</strong> in full-stack development,
     cloud architecture, and enterprise system integrations.`;
  const items  = (customHighlights && customHighlights.length) ? customHighlights : DEFAULT_HIGHLIGHTS;
  const hlHtml = items.map(h => `<li>${h}</li>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:${gradient};padding:36px 40px;">
    <p style="margin:0 0 6px;color:#bfdbfe;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Senior Software Developer</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Anav Bansal</h1>
    <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px;">B.Tech Computer Science · 4.7+ Years Experience</p>
  </div>
  <div style="padding:36px 40px;">
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${greeting}</p>
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${intro}</p>
    ${noteBlock}
    <p style="color:#374151;line-height:1.8;margin:0 0 24px;">
      Throughout my career at <strong>Novelvox PVT Ltd</strong>, I consistently delivered high-quality software
      for enterprise clients. Recognised with three <em>'Pat on the Back'</em> awards and nominated for Performance of the Year.
    </p>
    <div style="background:#f0f7ff;border-left:4px solid #1d4ed8;border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-weight:600;color:#1e3a5f;font-size:14px;">📋 Professional Qualifications</p>
      <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:2;">${hlHtml}</ul>
    </div>
    ${resumeBox("#1d4ed8")}
    <p style="color:#374151;line-height:1.8;margin:0;">Thank you for your time and consideration.</p>
  </div>
  ${footer("#1d4ed8")}
</div>${pixel}</body></html>`;
}

// ─── HTML: Follow-up ──────────────────────────────────────────────────────────
function buildFollowUpHTML({ hrName, company, role, originalDate, customNote, trackUrl = "" }) {
  const greeting  = hrName ? `Dear ${hrName},` : "Dear Hiring Manager,";
  const roleText  = role   ? ` for the <strong>${role}</strong> role` : "";
  const dateText  = originalDate ? ` on <strong>${originalDate}</strong>` : " recently";
  const noteBlock = customNote ? `<p style="color:#374151;line-height:1.8;margin:16px 0;">${customNote}</p>` : "";
  const pixel     = trackUrl   ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt=""/>` : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#064e3b 0%,#059669 100%);padding:36px 40px;">
    <p style="margin:0 0 6px;color:#a7f3d0;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Follow-Up</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Anav Bansal</h1>
    <p style="margin:6px 0 0;color:#a7f3d0;font-size:14px;">Senior Full Stack Developer · Node.js · Angular · AWS</p>
  </div>
  <div style="padding:36px 40px;">
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${greeting}</p>
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">
      I hope this message finds you well. I am following up on my application${roleText} at
      <strong>${company||"your organization"}</strong>, which I submitted${dateText}.
    </p>
    ${noteBlock}
    <p style="color:#374151;line-height:1.8;margin:0 0 24px;">
      I remain very enthusiastic and confident that my <strong>4.7+ years of experience</strong> in full-stack
      development, Node.js, AWS serverless architectures, and enterprise CTI/Telephony integrations would be
      a strong fit for your team.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:18px 24px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-weight:600;color:#065f46;font-size:14px;">📎 Resume (Re-attached)</p>
      <a href="${RESUME_DRIVE_LINK}" style="color:#059669;text-decoration:none;font-weight:500;font-size:14px;">🔗 View on Google Drive →</a>
    </div>
    <p style="color:#374151;line-height:1.8;margin:0;">Thank you again for your time and consideration.</p>
  </div>
  ${footer("#059669")}
</div>${pixel}</body></html>`;
}

// ─── Jooble helper ────────────────────────────────────────────────────────────
// ─── Jooble search (accepts full body for advanced filters) ──────────────────
function joobleSearch(bodyObj) {
  return new Promise((resolve, reject) => {
    if (!process.env.JOOBLE_API_KEY) return resolve({ jobs: [], totalCount: 0, noKey: true });
    const body = JSON.stringify({ resultsOnPage: 20, ...bodyObj });
    const opts = {
      hostname: "jooble.org", port: 443,
      path: `/api/${process.env.JOOBLE_API_KEY}`, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    };
    const req = https.request(opts, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { reject(new Error("Bad Jooble response")); } });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Hunter.io domain/company prospect search ─────────────────────────────────
function hunterSearch(queryString) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.hunter.io", port: 443,
      path: `/v2/domain-search?${queryString}&limit=30`, method: "GET",
    };
    const req = https.request(opts, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { reject(new Error("Bad Hunter response")); } });
    });
    req.on("error", reject);
    req.end();
  });
}

// ═══════════════════════════════ ROUTES ══════════════════════════════════════

// ─── Tracking ─────────────────────────────────────────────────────────────────
app.get("/api/track/status", (req, res) => res.json({ success: true, records: getTrackingRecords() }));

// Reset a single tracking record's opened status (clears false positives from self-preview)
app.post("/api/track/reset/:trackingId", (req, res) => {
  const { getTrackingRecords: load, markTrackingOpened } = require("./tracking");
  const fs2 = require("fs");
  const path2 = require("path");
  const file = path2.join(__dirname, "tracking.json");
  try {
    const records = JSON.parse(fs2.readFileSync(file, "utf8"));
    const idx = records.findIndex(r => r.trackingId === req.params.trackingId);
    if (idx === -1) return res.status(404).json({ success: false, message: "Record not found." });
    records[idx] = { ...records[idx], opened: false, openedAt: null, ip: undefined, userAgent: undefined };
    fs2.writeFileSync(file, JSON.stringify(records, null, 2), "utf8");
    res.json({ success: true, message: "Opened status cleared." });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get("/api/track/:trackingId", (req, res) => {
  const record = markTrackingOpened(
    req.params.trackingId,
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
    req.headers["user-agent"] || ""
  );
  if (record) {
    logToSheets([record.trackingId, record.hrEmail, record.company||"", record.role||"",
      new Date(record.sentAt).toISOString(), record.trackingId, "Opened", new Date(record.openedAt).toISOString()]);
    console.log(`👁 Opened: ${record.company} | ${record.hrEmail}`);
  }
  const pixel = getPixelBuffer();
  res.writeHead(200, { "Content-Type": "image/gif", "Content-Length": pixel.length, "Cache-Control": "no-store" });
  res.end(pixel);
});

// ─── GET /api/contacts — Google Sheet is the ONLY source of truth ─────────────
// If a contact is not in the sheet it will not appear in the app.
// tracking.json is only used to enrich "opened" status and trackingId.
app.get("/api/contacts", async (req, res) => {
  const byEmail = new Map();
  let sheetError = null;

  // 1. Primary source: Google Sheet
  if (process.env.GOOGLE_SHEET_ID) {
    try {
      const sheets = await getSheetsClient();
      const resp   = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `${SHEET_TAB}!A2:H5000`,
      });
      const rows = resp.data.values || [];
      if (rows.length === 0) {
        sheetError = `Sheet "${SHEET_TAB}" is connected but has no data rows yet. Send an application email first — it will be logged automatically.`;
      }
      for (const row of rows) {
        const hrEmail = (row[1] || "").trim();
        if (!hrEmail) continue;
        const key      = hrEmail.toLowerCase();
        const sentAt   = row[4] ? new Date(row[4]).getTime() : 0;
        const status   = (row[6] || "").toLowerCase();
        const isOpened = status.includes("open");
        const openedAt = isOpened && row[7] ? new Date(row[7]).getTime() : null;
        const trackId  = (row[5] || "").trim();

        const existing = byEmail.get(key);
        if (!existing) {
          byEmail.set(key, {
            hrEmail, company: (row[2] || "").trim(),
            role:    (row[3] || "").trim(),
            latestSentAt: sentAt, latestTrackingId: trackId,
            opened: isOpened, openedAt,
            totalSent: 1, followupCount: 0,
          });
        } else {
          existing.totalSent++;
          if (sentAt > existing.latestSentAt) {
            existing.latestSentAt   = sentAt;
            existing.latestTrackingId = trackId;
          }
          if (status.includes("follow")) existing.followupCount++;
          if (isOpened && !existing.opened) { existing.opened = true; existing.openedAt = openedAt; }
        }
      }
    } catch (e) {
      sheetError = e.message;
      console.warn("⚠️ Sheet read failed:", e.message);
    }
  } else {
    sheetError = "GOOGLE_SHEET_ID not set in .env";
  }

  // 2. Enrich with tracking.json — only update open status for contacts already in sheet
  const records = getTrackingRecords();
  for (const r of records) {
    const key = r.hrEmail.toLowerCase();
    const c   = byEmail.get(key);
    if (!c) continue; // not in sheet → skip
    if (r.opened && !c.opened) { c.opened = true; c.openedAt = r.openedAt; }
    if (!c.latestTrackingId && r.trackingId) c.latestTrackingId = r.trackingId;
  }

  // 3. Build result array
  const contacts = [];
  for (const [, c] of byEmail) {
    const needsFollowUp = c.latestSentAt > 0
      && (Date.now() - c.latestSentAt) > THREE_DAYS_MS
      && c.followupCount === 0
      && !c.opened;

    contacts.push({
      hrEmail: c.hrEmail, hrName: c.hrName || "",
      company: c.company, role: c.role,
      lastSentAt: c.latestSentAt, lastTrackingId: c.latestTrackingId,
      totalSent: c.totalSent, followupCount: c.followupCount,
      opened: c.opened, openedAt: c.openedAt,
      needsFollowUp,
    });
  }

  contacts.sort((a, b) => b.lastSentAt - a.lastSentAt);
  res.json({ success: true, contacts, fetchedAt: Date.now(), sheetError, sheetTab: SHEET_TAB });
});

// Strip tracking pixel so previewing the email in the app doesn't fire tracking
function stripTrackingPixel(html) {
  return html.replace(/<img[^>]*\/api\/track\/[^>]*\/?>/gi, "");
}

// ─── GET /api/emails/:trackingId ──────────────────────────────────────────────
app.get("/api/emails/:trackingId", (req, res) => {
  const { trackingId } = req.params;
  const stored = getEmailHtml(trackingId);
  if (stored) return res.json({ success: true, html: stripTrackingPixel(stored) });

  const record = getTrackingRecords().find(r => r.trackingId === trackingId);
  if (!record) return res.status(404).json({ success: false, message: "Tracking record not found." });

  const html = record.type === "followup"
    ? buildFollowUpHTML({ hrName: record.hrName, company: record.company, role: record.role, originalDate: new Date(record.sentAt).toLocaleDateString("en-IN"), customNote: "" })
    : buildFullstackHTML({ hrName: record.hrName, company: record.company, role: record.role, customNote: "" });

  storeEmailHtml(trackingId, html);
  res.json({ success: true, html: stripTrackingPixel(html), reconstructed: true });
});

// ─── GET /api/gmail/replies ───────────────────────────────────────────────────
app.get("/api/gmail/replies", async (req, res) => {
  try {
    const { google } = require("googleapis");
    const tokenPath = path.join(__dirname, "tokens.json");
    if (!fs.existsSync(tokenPath)) return res.json({ success: true, replies: [] });
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI
    );
    auth.setCredentials(JSON.parse(fs.readFileSync(tokenPath, "utf8")));
    const gmail = google.gmail({ version: "v1", auth });

    const trackedEmails = [...new Set(getTrackingRecords().map(r => r.hrEmail.toLowerCase()))];
    if (!trackedEmails.length) return res.json({ success: true, replies: [] });

    const query = trackedEmails.slice(0, 10).map(e => `from:${e}`).join(" OR ");
    const list  = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 30 });

    const replies = await Promise.all(
      (list.data.messages || []).map(async item => {
        const d = await gmail.users.messages.get({ userId: "me", id: item.id });
        const h = d.data.payload.headers || [];
        const from = h.find(x => x.name === "From")?.value || "";
        const match = from.match(/<(.+?)>/);
        return {
          id: item.id,
          from, fromEmail: match ? match[1] : from,
          subject: h.find(x => x.name === "Subject")?.value || "(No Subject)",
          date: h.find(x => x.name === "Date")?.value || "",
          snippet: d.data.snippet || "",
        };
      })
    );
    res.json({ success: true, replies });
  } catch (e) {
    res.json({ success: true, replies: [], error: e.message });
  }
});

// ─── POST /api/send-application ───────────────────────────────────────────────
app.post("/api/send-application", async (req, res) => {
  const { hrEmail, company, force, customIntro, customHighlights, headerTheme, ...rest } = req.body;
  if (!hrEmail || !company)
    return res.status(400).json({ success: false, message: "hrEmail and company are required." });

  if (!force) {
    const prev = getTrackingRecords()
      .filter(r => r.hrEmail.toLowerCase() === hrEmail.toLowerCase())
      .sort((a, b) => b.sentAt - a.sentAt)[0];
    if (prev) return res.status(200).json({
      isDuplicate: true, success: false,
      lastSentAt: prev.sentAt, lastCompany: prev.company,
      message: `Already contacted on ${new Date(prev.sentAt).toLocaleString("en-IN")}`,
    });
  }

  try {
    const { info, trackRecord } = await sendApplicationEmail({
      hrEmail, company, customIntro, customHighlights, headerTheme, ...rest,
    });
    return res.status(200).json({
      success: true, message: `Application sent to ${hrEmail}!`,
      messageId: info.messageId, trackingId: trackRecord.trackingId,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/send-followup ──────────────────────────────────────────────────
app.post("/api/send-followup", async (req, res) => {
  const { hrEmail, hrName = "", company, role, originalDate, customNote, originalMessageId, originalSubject } = req.body;
  if (!hrEmail || !company)
    return res.status(400).json({ success: false, message: "hrEmail and company are required." });

  const baseSubject = originalSubject ||
    (role ? `Application for ${role} Position — Anav Bansal` : `Job Application — Anav Bansal`);
  const subject     = `Re: ${baseSubject}`;
  const trackRecord = createTrackingRecord({ hrEmail, hrName, company, role, subject, type: "followup" });
  const trackUrl    = `${BASE_URL}/api/track/${trackRecord.trackingId}`;
  const html        = buildFollowUpHTML({ hrName, company, role, originalDate, customNote, trackUrl });

  storeEmailHtml(trackRecord.trackingId, html);

  const attachments = [];
  if (fs.existsSync(RESUME_PATH))
    attachments.push({ filename: "Anav_Bansal_Resume.pdf", path: RESUME_PATH, contentType: "application/pdf" });

  const extraHeaders = {};
  if (originalMessageId) {
    extraHeaders["In-Reply-To"] = originalMessageId;
    extraHeaders["References"]  = originalMessageId;
  }

  try {
   const info = await sendViaGmailAPI({
      from: `"Anav Bansal" <${process.env.GMAIL_USER}>`,
      to: hrEmail, subject, html, attachments, headers: extraHeaders,
    });
    logToSheets([info.messageId, hrEmail, company||"", role||"", new Date().toISOString(), trackRecord.trackingId, "FollowUp-Sent", ""]);
    return res.status(200).json({ success: true, message: `Follow-up sent to ${hrEmail}!`, messageId: info.messageId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/schedule-email ─────────────────────────────────────────────────
app.post("/api/schedule-email", (req, res) => {
  const { hrEmail, company, scheduledTime, ...rest } = req.body;
  if (!hrEmail || !company || !scheduledTime)
    return res.status(400).json({ success: false, message: "hrEmail, company, scheduledTime required." });
  const jobs  = loadScheduled();
  const jobId = Date.now().toString();
  jobs.push({ jobId, scheduledTime, status: "pending", emailData: { hrEmail, company, ...rest } });
  saveScheduled(jobs);
  return res.json({ success: true, message: `Scheduled for ${new Date(scheduledTime).toLocaleString("en-IN")}`, jobId });
});

app.get("/api/scheduled-emails",           (req, res) => res.json({ success: true, jobs: loadScheduled() }));
app.delete("/api/scheduled-emails/:jobId", (req, res) => { saveScheduled(loadScheduled().filter(j => j.jobId !== req.params.jobId)); res.json({ success: true }); });

// ─── GET /api/jobs/search ─────────────────────────────────────────────────────
app.get("/api/jobs/search", async (req, res) => {
  const { keywords = "", location = "India", page = 0, employment, datePosted, salary } = req.query;
  if (!keywords) return res.status(400).json({ success: false, message: "keywords required" });

  // Build portal search links (include date filter where supported)
  const indeedDate = datePosted === "1" ? "&fromage=1" : datePosted === "3" ? "&fromage=3" : datePosted === "7" ? "&fromage=7" : datePosted === "30" ? "&fromage=30" : "";
  const searchLinks = {
    naukri:    `https://www.naukri.com/${encodeURIComponent(keywords.toLowerCase().replace(/\s+/g, "-"))}-jobs-in-india`,
    indeed:    `https://in.indeed.com/jobs?q=${encodeURIComponent(keywords)}&l=${encodeURIComponent(location)}${indeedDate}`,
    linkedin:  `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}`,
    glassdoor: `https://www.glassdoor.co.in/Job/jobs.htm?suggestkeyword=${encodeURIComponent(keywords)}&locT=N&locId=115`,
    instahyre: `https://www.instahyre.com/search-jobs/?q=${encodeURIComponent(keywords)}`,
  };

  // Build Jooble body with advanced filters
  const joobleBody = { keywords, location, page: parseInt(page) };
  if (employment && employment !== "any") joobleBody.employment = employment;
  if (datePosted  && datePosted  !== "0") joobleBody.datePosted = parseInt(datePosted);
  if (salary      && parseInt(salary) > 0) joobleBody.salary = parseInt(salary);

  try {
    const data = await joobleSearch(joobleBody);
    return res.json({ success: true, jobs: data.jobs||[], totalCount: data.totalCount||0, searchLinks, hasApiKey: !data.noKey });
  } catch {
    return res.json({ success: true, jobs: [], totalCount: 0, searchLinks, hasApiKey: false });
  }
});

// ─── GET /api/prospect ────────────────────────────────────────────────────────
app.get("/api/prospect", async (req, res) => {
  const { company = "", domain = "", filter = "hr" } = req.query;
  if (!company && !domain) return res.status(400).json({ success: false, message: "company or domain required" });

  const linkedinUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((company || domain) + " HR Recruiter Talent")}&title=HR%20Recruiter%20Talent`;

  if (!process.env.HUNTER_API_KEY) {
    return res.json({
      success: true, emails: [], pattern: null, organization: company,
      noKey: true, linkedinUrl,
      message: "Add HUNTER_API_KEY to .env for email discovery. Free at hunter.io",
    });
  }

  try {
    const params = new URLSearchParams({ api_key: process.env.HUNTER_API_KEY });
    if (domain)  params.set("domain", domain);
    else         params.set("company", company);

    const result = await hunterSearch(params.toString());

    if (result.errors) {
      return res.json({ success: false, message: result.errors[0]?.details || "Hunter API error", emails: [], linkedinUrl });
    }

    let emails = (result.data?.emails || []).map(e => ({
      email:     e.value,
      firstName: e.first_name || "",
      lastName:  e.last_name  || "",
      name:      [e.first_name, e.last_name].filter(Boolean).join(" ") || "Unknown",
      position:  e.position   || "",
      department:e.department || "",
      linkedin:  e.linkedin   || "",
      confidence:e.confidence || 0,
    }));

    // Filter for HR / recruiting roles
    if (filter === "hr") {
      const hrKeywords = /\b(hr|human.?resource|recruit|talent|hiring|people|staffing|manpower|placement)\b/i;
      const hrEmails = emails.filter(e => hrKeywords.test(e.position) || hrKeywords.test(e.department));
      // Fall back to all if HR filter returns nothing
      if (hrEmails.length > 0) emails = hrEmails;
    }

    return res.json({
      success: true,
      emails,
      pattern:      result.data?.pattern || null,
      organization: result.data?.organization || company,
      domain:       result.data?.domain || domain,
      total:        result.data?.meta?.results || emails.length,
      linkedinUrl,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message, emails: [], linkedinUrl });
  }
});

// ─── POST /api/preview-email ──────────────────────────────────────────────────
app.post("/api/preview-email", (req, res) => {
  const { hrName, company, role, customNote, templateType = "fullstack", customIntro, customHighlights, headerTheme } = req.body;
  const opts = { hrName, company, role, customNote, customIntro, customHighlights, headerTheme };
  let html;
  if (templateType === "cti")         html = buildCTIHTML(opts);
  else if (templateType === "formal") html = buildFormalHTML(opts);
  else                                html = buildFullstackHTML(opts);
  res.json({ success: true, html });
});

app.get("/", (req, res) => res.json({ status: "ok" }));
app.listen(PORT, () => console.log(`\n🚀 Job Mailer API → http://localhost:${PORT}\n`));
