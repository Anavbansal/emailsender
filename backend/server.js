require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const https = require("https");
const cron = require("node-cron");
const mongoose = require("mongoose");
const gmailAuthRoutes   = require("./gmail-auth");
const autoImportContacts = require("./auto-import");
const {
  createTrackingRecord, markTrackingOpened, updateTrackingMessageId,
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
const CRM_RESUME_PATH  = path.join(__dirname, "ANAV_BANSAL_CRMExpert.pdf");
const RESUME_DRIVE_LINK = "https://drive.google.com/file/d/1LKc-w9Ggd5I1eZ3t7Wvm9psU-4ITxHxr/view?usp=sharing";
const THREE_DAYS_MS    = 3 * 24 * 60 * 60 * 1000;

// ─── MongoDB connection ────────────────────────────────────────────────────────
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
      console.log("✅ MongoDB connected");
      // One-time import of HR contacts from xlsx — runs only if contacts_import.done doesn't exist
      setTimeout(() => autoImportContacts(SentEmailLog, mongoose), 3000);
    })
    .catch(e => console.error("❌ MongoDB error:", e.message));
} else {
  console.warn("⚠️  MONGODB_URI not set — scheduled emails will use local JSON fallback");
}

const ScheduledEmailSchema = new mongoose.Schema({
  jobId:         { type: String, required: true, unique: true },
  scheduledTime: { type: String, required: true },
  status:        { type: String, default: "pending" },
  emailData:     { type: mongoose.Schema.Types.Mixed },
  error:         { type: String },
}, { timestamps: true });

const ScheduledEmail = mongoose.models.ScheduledEmail ||
  mongoose.model("ScheduledEmail", ScheduledEmailSchema);

// ─── SentEmailLog — every email sent gets saved here ──────────────────────────
const SentEmailLogSchema = new mongoose.Schema({
  messageId:  { type: String },           // Gmail message ID
  threadId:   { type: String },           // Gmail thread ID (for reply threading)
  trackingId: { type: String },
  type:       { type: String, enum: ["application", "followup", "scheduled", "referral"], default: "application" },
  hrEmail:    { type: String, required: true },
  hrName:     { type: String, default: "" },
  company:    { type: String, default: "" },
  role:       { type: String, default: "" },
  subject:    { type: String, default: "" },
  sentAt:     { type: Date,   default: Date.now },
  opened:     { type: Boolean, default: false },
  openedAt:   { type: Date,   default: null },
  inReplyTo:    { type: String,  default: null },
  replied:      { type: Boolean, default: false },
  repliedAt:    { type: Date,    default: null },
  followupSent: { type: Boolean, default: false },
  notes:        { type: String,  default: "" },
  status:       { type: String,  default: "Sent" },
  source:       { type: String,  default: "app" },
}, { timestamps: true });

const SentEmailLog = mongoose.models.SentEmailLog ||
  mongoose.model("SentEmailLog", SentEmailLogSchema);

async function saveSentEmail(data) {
  try {
    if (mongoose.connection.readyState === 1) {
      await SentEmailLog.create(data);
    }
  } catch (e) {
    console.warn("⚠️ saveSentEmail failed:", e.message);
  }
}

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

async function sendViaGmailAPI({ to, subject, html, inReplyTo = null, references = null, threadId = null }) {
  const auth = getGmailAPITransport();
  const gmail = google.gmail({ version: "v1", auth });

  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;

  const boundary = "boundary_" + Date.now();
  const resumePath = path.join(__dirname, "ANAV_BANSAL_FullStackDeveloper.pdf");
  const resumeData = fs.readFileSync(resumePath).toString("base64");

  // Build threading headers when replying
  const extraHeaders = [];
  if (inReplyTo)  extraHeaders.push(`In-Reply-To: ${inReplyTo}`);
  if (references) extraHeaders.push(`References: ${references}`);

  const rawEmail = [
    `From: "Anav Bansal" <${process.env.GMAIL_USER}>`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    ...extraHeaders,
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

  const requestBody = { raw: encoded };
  if (threadId) requestBody.threadId = threadId;

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody,
  });
  console.log("✅ Email sent via Gmail API:", res.data.id, threadId ? `(thread: ${res.data.threadId})` : "");
  return res.data;
}

console.log("✅ Gmail API transport ready.");
// ─── Scheduled emails helpers ─────────────────────────────────────────────────
const SCHEDULED_FILE = path.join(__dirname, "scheduled-emails.json");

async function loadScheduled() {
  if (mongoose.connection.readyState === 1) {
    return ScheduledEmail.find().lean();
  }
  try { return JSON.parse(fs.readFileSync(SCHEDULED_FILE, "utf8")); } catch { return []; }
}

async function addScheduledJob(job) {
  if (mongoose.connection.readyState === 1) {
    await ScheduledEmail.create(job);
  } else {
    const jobs = await loadScheduled();
    jobs.push(job);
    fs.writeFileSync(SCHEDULED_FILE, JSON.stringify(jobs, null, 2), "utf8");
  }
}

async function updateJobStatus(jobId, status, error) {
  if (mongoose.connection.readyState === 1) {
    await ScheduledEmail.updateOne({ jobId }, { status, ...(error && { error }) });
  } else {
    const jobs = await loadScheduled();
    const j = jobs.find(x => x.jobId === jobId);
    if (j) { j.status = status; if (error) j.error = error; }
    fs.writeFileSync(SCHEDULED_FILE, JSON.stringify(jobs, null, 2), "utf8");
  }
}

async function deleteJob(jobId) {
  if (mongoose.connection.readyState === 1) {
    await ScheduledEmail.deleteOne({ jobId });
  } else {
    const jobs = (await loadScheduled()).filter(j => j.jobId !== jobId);
    fs.writeFileSync(SCHEDULED_FILE, JSON.stringify(jobs, null, 2), "utf8");
  }
}

function parseScheduledTime(scheduledTime) {
  // If no timezone info, treat as IST (UTC+5:30)
  if (!scheduledTime.includes("Z") && !scheduledTime.includes("+"))
    return new Date(scheduledTime + "+05:30").getTime();
  return new Date(scheduledTime).getTime();
}

cron.schedule("* * * * *", async () => {
  const jobs = await loadScheduled();
  const now  = Date.now();
  for (const job of jobs) {
    if (job.status === "pending" && parseScheduledTime(job.scheduledTime) <= now) {
      try {
        const { info, trackRecord } = await sendApplicationEmail(job.emailData);
        logToSheets([
          info.id,
          job.emailData.hrEmail,
          job.emailData.company || "",
          job.emailData.role    || "",
          new Date().toISOString(),
          trackRecord.trackingId,
          "Scheduled-Sent",
          "",
        ]);
        await saveSentEmail({
          messageId: info.id, threadId: info.threadId || null, trackingId: trackRecord.trackingId,
          type: "scheduled", hrEmail: job.emailData.hrEmail, hrName: job.emailData.hrName||"",
          company: job.emailData.company||"", role: job.emailData.role||"",
          subject: trackRecord.subject, sentAt: new Date(),
        });
        await deleteJob(job.jobId);
      } catch (e) {
        await updateJobStatus(job.jobId, "failed", e.message);
      }
    }
  }
});

// ─── Google Sheets ────────────────────────────────────────────────────────────
const SHEET_HEADERS = ["Mail ID","HR Email","Company","Role","Sent At","Tracking ID","Status","Opened At"];
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || "1Ctdcf2D-DnWH0kfkKtPtobH-g_pNBs9tvHdf_gvS2WQ";
const SHEET_TAB = process.env.SHEET_TAB || "Candidate_Status_Log";
let sheetsInitialized = false;

async function getSheetsClient() {
  const { google } = require("googleapis");
  const tokenPath = path.join(__dirname, "tokens.json");

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  if (fs.existsSync(tokenPath)) {
    auth.setCredentials(JSON.parse(fs.readFileSync(tokenPath, "utf8")));
  } else if (process.env.GMAIL_REFRESH_TOKEN) {
    auth.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });
  } else {
    throw new Error("No Gmail tokens — connect via /api/gmail/auth");
  }

  return google.sheets({ version: "v4", auth });
}

async function ensureSheetHeaders(sheets) {
  if (sheetsInitialized) return;
  const ex = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID, range: `${SHEET_TAB}!A1:H1`,
  });
  if ((ex.data.values?.[0] || [])[0] !== "Mail ID") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID, range: `${SHEET_TAB}!A1:H1`,
      valueInputOption: "USER_ENTERED", requestBody: { values: [SHEET_HEADERS] },
    });
    console.log(`✅ Headers written to ${SHEET_TAB}!A1:H1`);
  }
  sheetsInitialized = true;
}

async function logToSheets(row) {
  if (!GOOGLE_SHEET_ID) return;
  try {
    const sheets = await getSheetsClient();
    await ensureSheetHeaders(sheets);
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID, range: `${SHEET_TAB}!A:H`,
      valueInputOption: "USER_ENTERED", requestBody: { values: [row] },
    });
  } catch (e) { console.warn("⚠️ Sheets log failed:", e.message); }
}

// ─── GET /api/sheets/setup ────────────────────────────────────────────────────
app.get("/api/sheets/setup", async (req, res) => {
  if (!GOOGLE_SHEET_ID)
    return res.status(400).json({ success: false, message: "GOOGLE_SHEET_ID not set in .env" });
  try {
    const sheets = await getSheetsClient();
    sheetsInitialized = false;
    await ensureSheetHeaders(sheets);
    return res.json({
      success: true,
      message: `Connected! Headers written to tab "${SHEET_TAB}" row 1.`,
      sheetId: GOOGLE_SHEET_ID,
      tab: SHEET_TAB,
    });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/sheets/debug ────────────────────────────────────────────────────
app.get("/api/sheets/debug", async (req, res) => {
  if (!GOOGLE_SHEET_ID)
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

    const meta = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEET_ID });
    const tabs = meta.data.sheets.map(s => ({ name: s.properties.title, id: s.properties.sheetId }));

    const firstTab = tabs[0]?.name || "Sheet1";
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID, range: `${firstTab}!A1:H5`,
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
const CRM_HIGHLIGHTS = [
  "4.7+ years · Senior CRM Integration Expert",
  "ServiceNow (ITSM, CSM, Flow Designer, IntegrationHub, Virtual Agent, Scripted REST)",
  "Freshdesk (FDK, Marketplace Apps, CTI API) · Salesforce Open CTI · Zendesk Apps Framework",
  "3 published marketplace apps: ServiceNow Store · Freshdesk · Webex App Hub",
  "CTI Screen Pop · Click-to-Dial · Real-Time Ticket Automation · CRM-Telephony Sync",
];

// ─── Core send helper ─────────────────────────────────────────────────────────
async function sendApplicationEmail({
  hrEmail, hrName = "", company, role, customNote,
  templateType = "fullstack", readReceipt = false,
  customIntro = "", customHighlights = null, headerTheme = "blue",
}) {
  const subject = role
    ? `Application for ${role} Position — Anav Bansal`
    : templateType === "crm"
      ? `Job Application — Anav Bansal (Senior CRM & ServiceNow Expert)`
      : `Job Application — Anav Bansal (Senior Full Stack Developer)`;

  const trackRecord = createTrackingRecord({ hrEmail, hrName, company, role, subject, type: "application" });
  const trackUrl    = `${BASE_URL}/api/track/${trackRecord.trackingId}`;
  const tplOpts     = { hrName, company, role, customNote, trackUrl, customIntro, customHighlights, headerTheme };

  let html;
  if (templateType === "cti")         html = buildCTIHTML(tplOpts);
  else if (templateType === "formal") html = buildFormalHTML(tplOpts);
  else if (templateType === "crm")    html = buildCRMHTML(tplOpts);
  else                                html = buildFullstackHTML(tplOpts);

  storeEmailHtml(trackRecord.trackingId, html);

  const attachments = [];
  const resumeFile = templateType === "crm" && fs.existsSync(CRM_RESUME_PATH)
    ? { filename: "Anav_Bansal_CRMExpert.pdf", path: CRM_RESUME_PATH, contentType: "application/pdf" }
    : fs.existsSync(RESUME_PATH)
      ? { filename: "Anav_Bansal_Resume.pdf", path: RESUME_PATH, contentType: "application/pdf" }
      : null;
  if (resumeFile) attachments.push(resumeFile);

  const mailOpts = { from: `"Anav Bansal" <${process.env.GMAIL_USER}>`, to: hrEmail, subject, html, attachments };
  if (readReceipt) {
    mailOpts.headers = {
      "Disposition-Notification-To": process.env.GMAIL_USER,
      "Return-Receipt-To": process.env.GMAIL_USER,
    };
  }
  const info = await sendViaGmailAPI(mailOpts);
  console.log(`📤 Sent → ${hrEmail} | ${info.id}`);
  updateTrackingMessageId(trackRecord.trackingId, info.id);
  logToSheets([info.id, hrEmail, company||"", role||"", new Date().toISOString(), trackRecord.trackingId, "Sent", ""]);
  await saveSentEmail({
    messageId: info.id, threadId: info.threadId || null, trackingId: trackRecord.trackingId,
    type: "application", hrEmail, hrName: hrName||"", company: company||"", role: role||"",
    subject: trackRecord.subject, sentAt: new Date(),
  });
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


// ─── HTML: CRM Expert ─────────────────────────────────────────────────────────
function buildCRMHTML({ hrName, company, role, customNote, trackUrl = "", customIntro = "", customHighlights = null, headerTheme = "teal" }) {
  const gradient  = HEADER_THEMES[headerTheme] || HEADER_THEMES.teal;
  const greeting  = hrName ? `Dear ${hrName},` : "Dear Hiring Manager,";
  const roleText  = role   ? ` for the <strong>${role}</strong> position` : "";
  const noteBlock = customNote ? `<p style="color:#374151;line-height:1.8;margin:16px 0;">${customNote}</p>` : "";
  const pixel     = trackUrl   ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt=""/>` : "";
  const intro     = customIntro ||
    `I am writing to express my strong interest in joining <strong>${company||"your organization"}</strong>${roleText}.
     With <strong>4.7+ years as a CRM Integration Expert</strong>, I specialize in <strong>ServiceNow platform development</strong>
     (Flow Designer, IntegrationHub, Virtual Agent, Scripted REST APIs) and <strong>Freshdesk CTI integrations</strong> —
     delivering enterprise-grade solutions that automate ticket workflows, enable real-time telephony-to-CRM sync,
     and measurably reduce agent handle time.`;
  const items     = (customHighlights && customHighlights.length) ? customHighlights : CRM_HIGHLIGHTS;
  const hlHtml    = items.map(h => `<li>${h}</li>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:${gradient};padding:36px 40px;">
    <p style="margin:0 0 6px;color:#99f6e4;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Senior CRM Integration Expert</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Anav Bansal</h1>
    <p style="margin:6px 0 0;color:#99f6e4;font-size:14px;">ServiceNow · Freshdesk · Salesforce · Zendesk · MS Dynamics</p>
  </div>
  <div style="padding:36px 40px;">
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${greeting}</p>
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${intro}</p>
    ${noteBlock}
    <p style="color:#374151;line-height:1.8;margin:0 0 24px;">
      At <strong>Novelvox PVT Ltd</strong>, I published <strong>3 enterprise marketplace apps</strong>
      (ServiceNow Store, Freshdesk Marketplace, Webex App Hub) and delivered CRM integrations across
      <strong>6+ platforms</strong> — each reducing manual agent effort by 30–40%.
      Nominated for <em>Performance of the Year</em> and received three <em>'Pat on the Back'</em> awards.
    </p>
    <div style="background:#f0fdfa;border-left:4px solid #0d9488;border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-weight:600;color:#134e4a;font-size:14px;">🏆 CRM & ServiceNow Expertise</p>
      <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:2;">${hlHtml}</ul>
    </div>
    ${resumeBox("#0d9488")}
    <p style="color:#374151;line-height:1.8;margin:0;">Thank you for your time and consideration. I would love the opportunity to discuss how I can bring this expertise to your team.</p>
  </div>
  ${footer("#0d9488")}
</div>${pixel}</body></html>`;
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

// ─── HTML: Referral Request ───────────────────────────────────────────────────
function buildReferralHTML({ employeeName, company, role, customNote, trackUrl = "" }) {
  const greeting  = employeeName ? `Hi ${employeeName},` : "Hi,";
  const noteBlock = customNote ? `<p style="color:#374151;line-height:1.8;margin:16px 0;">${customNote}</p>` : "";
  const pixel     = trackUrl   ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt=""/>` : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#4c1d95 0%,#7c3aed 100%);padding:36px 40px;">
    <p style="margin:0 0 6px;color:#ddd6fe;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Referral Request</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Anav Bansal</h1>
    <p style="margin:6px 0 0;color:#ddd6fe;font-size:14px;">Senior Full Stack Developer · Node.js · Angular · AWS</p>
  </div>
  <div style="padding:36px 40px;">
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${greeting}</p>
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">
      I hope you don't mind me reaching out. I came across your profile and noticed you work at
      <strong>${company || "your organization"}</strong>. I'm very interested in the
      <strong>${role}</strong> role there and was hoping you might be open to referring me.
    </p>
    ${noteBlock}
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">
      A quick background — I have <strong>4.7+ years of experience</strong> in full-stack development
      with Node.js, Angular, AWS serverless, and enterprise CTI/Telephony integrations. I'd love the
      opportunity to contribute to your team.
    </p>
    <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:18px 24px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-weight:600;color:#5b21b6;font-size:14px;">📄 Resume</p>
      <a href="${RESUME_DRIVE_LINK}" style="color:#7c3aed;text-decoration:none;font-weight:500;font-size:14px;">🔗 View Resume on Google Drive →</a>
      <p style="margin:10px 0 0;font-size:13px;color:#6b7280;">
        LinkedIn: <a href="https://linkedin.com/in/anavbansal-51b191162" style="color:#7c3aed;text-decoration:none;">linkedin.com/in/anavbansal-51b191162</a>
      </p>
    </div>
    <p style="color:#374151;line-height:1.8;margin:0;">
      No pressure at all — even a quick internal recommendation or a heads-up to the hiring team would
      mean a lot. Thank you so much for your time!
    </p>
  </div>
  ${footer("#7c3aed")}
</div>${pixel}</body></html>`;
}

// ─── POST /api/send-referral ──────────────────────────────────────────────────
app.post("/api/send-referral", async (req, res) => {
  const { employeeEmail, employeeName = "", company, role, customNote } = req.body;
  if (!employeeEmail || !company || !role)
    return res.status(400).json({ success: false, message: "employeeEmail, company, and role are required." });

  const subject    = `Referral Request — ${role} at ${company}`;
  const trackRecord = createTrackingRecord({ hrEmail: employeeEmail, hrName: employeeName, company, role, subject, type: "referral" });
  const trackUrl   = `${BASE_URL}/api/track/${trackRecord.trackingId}`;
  const html       = buildReferralHTML({ employeeName, company, role, customNote, trackUrl });

  storeEmailHtml(trackRecord.trackingId, html);

  try {
    const info = await sendViaGmailAPI({ to: employeeEmail, subject, html });
    logToSheets([info.id, employeeEmail, company, role, new Date().toISOString(), trackRecord.trackingId, "Referral-Sent", ""]);
    await saveSentEmail({
      messageId: info.id, threadId: info.threadId || null, trackingId: trackRecord.trackingId,
      type: "referral", hrEmail: employeeEmail, hrName: employeeName||"", company: company||"", role: role||"",
      subject: trackRecord.subject, sentAt: new Date(),
    });
    return res.status(200).json({
      success: true,
      message: `Referral request sent to ${employeeEmail}!`,
      messageId: info.id,
      trackingId: trackRecord.trackingId,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Jooble search ────────────────────────────────────────────────────────────
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

app.post("/api/track/reset/:trackingId", (req, res) => {
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

// ─── GET /api/contacts ────────────────────────────────────────────────────────
app.get("/api/contacts", async (req, res) => {
  const byEmail = new Map();
  let sheetError = null;

  if (GOOGLE_SHEET_ID) {
    try {
      const sheets = await getSheetsClient();
      const resp   = await sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID,
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

  // ── Merge tracking.json records ──────────────────────────────────────────────
  const records = getTrackingRecords();
  const missingFromSheet = [];
  for (const r of records) {
    const key = r.hrEmail.toLowerCase();
    const c   = byEmail.get(key);
    if (!c) {
      byEmail.set(key, {
        hrEmail: r.hrEmail, hrName: r.hrName || "",
        company: r.company || "", role: r.role || "",
        latestSentAt: r.sentAt || 0, latestTrackingId: r.trackingId,
        latestMessageId: r.messageId || null,
        opened: r.opened || false, openedAt: r.openedAt || null,
        totalSent: 1, followupCount: 0,
      });
      missingFromSheet.push(r);
      continue;
    }
    if (r.opened && !c.opened) { c.opened = true; c.openedAt = r.openedAt; }
    if (!c.latestTrackingId && r.trackingId) c.latestTrackingId = r.trackingId;
    if (r.messageId && (r.sentAt || 0) >= (c.latestSentAt || 0)) {
      c.latestMessageId = r.messageId;
    }
  }

  // Backfill tracking.json contacts missing from Sheet
  for (const r of missingFromSheet) {
    logToSheets([
      r.messageId || "", r.hrEmail, r.company || "", r.role || "",
      r.sentAt ? new Date(r.sentAt).toISOString() : new Date().toISOString(),
      r.trackingId || "", r.type === "followup" ? "FollowUp-Sent" : "Sent", "",
    ]).catch(() => {});
  }

  // ── Merge ALL MongoDB SentEmailLog records ────────────────────────────────
  const contacts = [];
  if (mongoose.connection.readyState === 1) {
    // Get all unique contacts from DB grouped by email
    const dbContacts = await SentEmailLog.aggregate([
      { $sort: { sentAt: -1 } },
      { $group: {
        _id:          { $toLower: "$hrEmail" },
        hrEmail:      { $first: "$hrEmail" },
        hrName:       { $first: "$hrName" },
        company:      { $first: "$company" },
        role:         { $first: "$role" },
        latestSentAt: { $first: "$sentAt" },
        messageId:    { $first: "$messageId" },
        threadId:     { $first: "$threadId" },
        replied:      { $max:   "$replied" },
        repliedAt:    { $first: "$repliedAt" },
        followupSent: { $max:   "$followupSent" },
        notes:        { $first: "$notes" },
        totalSent:    { $sum: 1 },
      }}
    ]);

    for (const row of dbContacts) {
      const key = row._id;
      const existing = byEmail.get(key);
      if (!existing) {
        // DB-only contact — add to map
        byEmail.set(key, {
          hrEmail:          row.hrEmail || row._id,
          hrName:           row.hrName  || "",
          company:          row.company || "",
          role:             row.role    || "",
          latestSentAt:     row.latestSentAt ? new Date(row.latestSentAt).getTime() : 0,
          latestMessageId:  row.messageId    || null,
          latestThreadId:   row.threadId     || null,
          opened:           false,
          openedAt:         null,
          replied:          row.replied      || false,
          repliedAt:        row.repliedAt    || null,
          followupSent:     row.followupSent || false,
          notes:            row.notes        || "",
          totalSent:        row.totalSent    || 1,
          followupCount:    row.followupSent ? 1 : 0,
        });
      } else {
        // Enrich existing sheet/tracking contact with DB data
        existing.latestThreadId  = row.threadId  || existing.latestThreadId  || null;
        existing.latestMessageId = row.messageId || existing.latestMessageId || null;
        existing.replied         = row.replied   || existing.replied   || false;
        existing.repliedAt       = row.repliedAt || existing.repliedAt || null;
        existing.notes           = row.notes     || existing.notes     || "";
        if (!existing.latestSentAt && row.latestSentAt)
          existing.latestSentAt = new Date(row.latestSentAt).getTime();
      }
    }
  }

  for (const [, c] of byEmail) {
    const needsFollowUp = c.latestSentAt > 0
      && (Date.now() - c.latestSentAt) > THREE_DAYS_MS
      && c.followupCount === 0
      && !c.opened;

    contacts.push({
      hrEmail: c.hrEmail, hrName: c.hrName || "",
      company: c.company, role: c.role,
      lastSentAt: c.latestSentAt, lastTrackingId: c.latestTrackingId,
      lastMessageId: c.latestMessageId || null,
      lastThreadId: c.latestThreadId || null,       // ← frontend passes this for followup
      totalSent: c.totalSent, followupCount: c.followupCount,
      opened: c.opened, openedAt: c.openedAt,
      needsFollowUp,
    });
  }

  contacts.sort((a, b) => b.lastSentAt - a.lastSentAt);
  res.json({ success: true, contacts, fetchedAt: Date.now(), sheetError, sheetTab: SHEET_TAB });
});

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
// ─── GET /api/sent-log — all sent emails from DB with dates ──────────────────
app.get("/api/sent-log", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1)
      return res.json({ success: false, message: "MongoDB not connected", logs: [] });

    const { type, email, limit = 100 } = req.query;
    const filter = {};
    if (type)  filter.type  = type;
    if (email) filter.hrEmail = new RegExp(email, "i");

    const logs = await SentEmailLog
      .find(filter)
      .sort({ sentAt: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({ success: true, logs, total: logs.length });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message, logs: [] });
  }
});

// ─── GET /api/gmail/replies — inbox replies from tracked HR emails ─────────────
app.get("/api/gmail/replies", async (req, res) => {
  try {
    const tokenPath = path.join(__dirname, "tokens.json");
    if (!fs.existsSync(tokenPath)) return res.json({ success: true, replies: [] });
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI
    );
    auth.setCredentials(JSON.parse(fs.readFileSync(tokenPath, "utf8")));
    const gmail = google.gmail({ version: "v1", auth });

    // Pull tracked emails from DB (more complete) with fallback to tracking.json
    let trackedEmails;
    if (mongoose.connection.readyState === 1) {
      const dbEmails = await SentEmailLog.distinct("hrEmail");
      trackedEmails = [...new Set(dbEmails.map(e => e.toLowerCase()))];
    } else {
      trackedEmails = [...new Set(getTrackingRecords().map(r => r.hrEmail.toLowerCase()))];
    }
    if (!trackedEmails.length) return res.json({ success: true, replies: [] });

    // Build query: replies from any HR we emailed, in INBOX, newer than 90 days
    const fromClause = trackedEmails.slice(0, 20).map(e => `from:${e}`).join(" OR ");
    const query = `(${fromClause}) in:inbox newer_than:90d`;
    const list  = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 50 });

    if (!(list.data.messages || []).length) return res.json({ success: true, replies: [] });

    const replies = await Promise.all(
      (list.data.messages || []).map(async item => {
        const d = await gmail.users.messages.get({ userId: "me", id: item.id, format: "metadata",
          metadataHeaders: ["From", "Subject", "Date", "In-Reply-To", "References"] });
        const h = d.data.payload.headers || [];
        const from     = h.find(x => x.name === "From")?.value || "";
        const match    = from.match(/<(.+?)>/);
        const fromEmail = match ? match[1].toLowerCase() : from.toLowerCase();

        // Match back to our sent email log for context
        let sentContext = null;
        if (mongoose.connection.readyState === 1) {
          const sent = await SentEmailLog.findOne({ hrEmail: new RegExp(fromEmail, "i") })
            .sort({ sentAt: -1 }).lean();
          if (sent) sentContext = { company: sent.company, role: sent.role, sentAt: sent.sentAt };
        }

        return {
          id: item.id,
          threadId: d.data.threadId,
          from, fromEmail,
          subject:   h.find(x => x.name === "Subject")?.value || "(No Subject)",
          date:      h.find(x => x.name === "Date")?.value || "",
          snippet:   d.data.snippet || "",
          isReply:   !!(h.find(x => x.name === "In-Reply-To")?.value),
          sentContext,
        };
      })
    );

    // Sort newest first
    replies.sort((a, b) => new Date(b.date) - new Date(a.date));
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
      messageId: info.id, trackingId: trackRecord.trackingId,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/send-followup ──────────────────────────────────────────────────
app.post("/api/send-followup", async (req, res) => {
  const { hrEmail, hrName = "", company, role, originalDate, customNote, originalMessageId, originalSubject, originalThreadId } = req.body;
  if (!hrEmail || !company)
    return res.status(400).json({ success: false, message: "hrEmail and company are required." });

  // If originalThreadId not supplied, look it up from DB so old entries also work
  let resolvedThreadId = originalThreadId || null;
  if (!resolvedThreadId && originalMessageId && mongoose.connection.readyState === 1) {
    const prev = await SentEmailLog.findOne({ messageId: originalMessageId }).lean();
    if (prev && prev.threadId) resolvedThreadId = prev.threadId;
  }

  const baseSubject = originalSubject ||
    (role ? `Application for ${role} Position — Anav Bansal` : `Job Application — Anav Bansal`);
  const subject     = `Re: ${baseSubject}`;
  const trackRecord = createTrackingRecord({ hrEmail, hrName, company, role, subject, type: "followup" });
  const trackUrl    = `${BASE_URL}/api/track/${trackRecord.trackingId}`;
  const html        = buildFollowUpHTML({ hrName, company, role, originalDate, customNote, trackUrl });

  storeEmailHtml(trackRecord.trackingId, html);

  try {
    const info = await sendViaGmailAPI({
      to: hrEmail, subject, html,
      inReplyTo:  originalMessageId || null,
      references: originalMessageId || null,
      threadId:   resolvedThreadId,          // ← puts reply inside the SAME thread
    });
    logToSheets([info.id, hrEmail, company||"", role||"", new Date().toISOString(), trackRecord.trackingId, "FollowUp-Sent", ""]);
    await saveSentEmail({
      messageId: info.id, threadId: info.threadId || null, trackingId: trackRecord.trackingId,
      type: "followup", hrEmail, hrName: hrName||"", company: company||"", role: role||"",
      subject, sentAt: new Date(), inReplyTo: originalMessageId || null,
    });
    return res.status(200).json({ success: true, message: `Follow-up sent to ${hrEmail}!`, messageId: info.id });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/schedule-email ─────────────────────────────────────────────────
app.post("/api/schedule-email", async (req, res) => {
  const { hrEmail, company, scheduledTime, ...rest } = req.body;
  if (!hrEmail || !company || !scheduledTime)
    return res.status(400).json({ success: false, message: "hrEmail, company, scheduledTime required." });
  const jobId = Date.now().toString();
  await addScheduledJob({ jobId, scheduledTime, status: "pending", emailData: { hrEmail, company, ...rest } });
  return res.json({ success: true, message: `Scheduled for ${new Date(scheduledTime).toLocaleString("en-IN")}`, jobId });
});

app.get("/api/scheduled-emails", async (req, res) => {
  const jobs = await loadScheduled();
  res.json({ success: true, jobs });
});

app.delete("/api/scheduled-emails/:jobId", async (req, res) => {
  await deleteJob(req.params.jobId);
  res.json({ success: true });
});

// ─── GET /api/jobs/search ─────────────────────────────────────────────────────
app.get("/api/jobs/search", async (req, res) => {
  const { keywords = "", location = "India", page = 0, employment, datePosted, salary } = req.query;
  if (!keywords) return res.status(400).json({ success: false, message: "keywords required" });

  const indeedDate = datePosted === "1" ? "&fromage=1" : datePosted === "3" ? "&fromage=3" : datePosted === "7" ? "&fromage=7" : datePosted === "30" ? "&fromage=30" : "";
  const searchLinks = {
    naukri:    `https://www.naukri.com/${encodeURIComponent(keywords.toLowerCase().replace(/\s+/g, "-"))}-jobs-in-india`,
    indeed:    `https://in.indeed.com/jobs?q=${encodeURIComponent(keywords)}&l=${encodeURIComponent(location)}${indeedDate}`,
    linkedin:  `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}`,
    glassdoor: `https://www.glassdoor.co.in/Job/jobs.htm?suggestkeyword=${encodeURIComponent(keywords)}&locT=N&locId=115`,
    instahyre: `https://www.instahyre.com/search-jobs/?q=${encodeURIComponent(keywords)}`,
  };

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

    if (filter === "hr") {
      const hrKeywords = /\b(hr|human.?resource|recruit|talent|hiring|people|staffing|manpower|placement)\b/i;
      const hrEmails = emails.filter(e => hrKeywords.test(e.position) || hrKeywords.test(e.department));
      if (hrEmails.length > 0) emails = hrEmails;
    }

    return res.json({
      success: true, emails,
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
  else if (templateType === "crm")    html = buildCRMHTML(opts);
  else                                html = buildFullstackHTML(opts);
  res.json({ success: true, html });
});

// ─── LinkedIn Connections Sheet ───────────────────────────────────────────────
const LINKEDIN_SHEET_ID = "1xQAzAY8hRjmfYhMXB2R7oaw5HPqJZf13BjXM33wWQ5Q";
const LINKEDIN_TAB      = "Connections";

app.get("/api/linkedin/connections", async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const resp   = await sheets.spreadsheets.values.get({
      spreadsheetId: LINKEDIN_SHEET_ID,
      range: `${LINKEDIN_TAB}!A2:I5000`,
    });
    const rows = resp.data.values || [];
    let connections = rows
      .filter(row => (row[0] || row[1] || "").trim())
      .map((row, i) => ({
        rowIndex:    i + 2,
        firstName:   (row[0] || "").trim(),
        lastName:    (row[1] || "").trim(),
        name:        `${(row[0] || "").trim()} ${(row[1] || "").trim()}`.trim(),
        url:         (row[2] || "").trim(),
        email:       (row[3] || "").trim(),
        company:     (row[4] || "").trim(),
        position:    (row[5] || "").trim(),
        connectedOn: (row[6] || "").trim(),
        sent:        String(row[7] || "").toUpperCase() === "TRUE",
        replied:     String(row[8] || "").toUpperCase() === "TRUE",
      }));

    const { q, filter } = req.query;
    if (q) {
      const lq = q.toLowerCase();
      connections = connections.filter(c =>
        c.name.toLowerCase().includes(lq) ||
        c.company.toLowerCase().includes(lq) ||
        c.position.toLowerCase().includes(lq) ||
        c.email.toLowerCase().includes(lq)
      );
    }
    const HR_REGEX = /\b(hr|human.?resource|recruit|talent|hiring|people|staffing|placement|acquisition|manpower)\b/i;
    if (filter === "hr")          connections = connections.filter(c => HR_REGEX.test(c.position));
    else if (filter === "sent")    connections = connections.filter(c => c.sent);
    else if (filter === "replied") connections = connections.filter(c => c.replied);
    else if (filter === "notsent") connections = connections.filter(c => !c.sent);

    return res.json({ success: true, connections, total: connections.length });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message, connections: [] });
  }
});

app.post("/api/linkedin/update-connection", async (req, res) => {
  const { rowIndex, field, value } = req.body;
  if (!rowIndex || !field) return res.status(400).json({ success: false, message: "rowIndex and field required" });
  const col = field === "sent" ? "H" : field === "replied" ? "I" : null;
  if (!col) return res.status(400).json({ success: false, message: "field must be 'sent' or 'replied'" });
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: LINKEDIN_SHEET_ID,
      range: `${LINKEDIN_TAB}!${col}${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[value ? "TRUE" : "FALSE"]] },
    });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.get("/", (req, res) => res.json({ status: "ok" }));

// ─── POST /api/import-contacts — bulk import from xlsx/JSON ──────────────────
app.post("/api/import-contacts", async (req, res) => {
  if (mongoose.connection.readyState !== 1)
    return res.status(503).json({ success: false, message: "MongoDB not connected" });

  const { contacts } = req.body;
  if (!Array.isArray(contacts) || contacts.length === 0)
    return res.status(400).json({ success: false, message: "contacts array required" });

  let inserted = 0, skipped = 0, updated = 0;
  for (const c of contacts) {
    if (!c.hrEmail) { skipped++; continue; }
    try {
      const existing = await SentEmailLog.findOne({ hrEmail: new RegExp(`^${c.hrEmail}$`, "i") }).lean();
      if (existing) {
        // Update replied/notes if new info available
        const updates = {};
        if (c.replied && !existing.replied)      { updates.replied = true; }
        if (c.repliedAt && !existing.repliedAt)  { updates.repliedAt = new Date(c.repliedAt); }
        if (c.notes && !existing.notes)           { updates.notes = c.notes; }
        if (Object.keys(updates).length > 0) {
          await SentEmailLog.updateOne({ _id: existing._id }, { $set: updates });
          updated++;
        } else { skipped++; }
      } else {
        await SentEmailLog.create({
          hrEmail:    c.hrEmail,
          hrName:     c.hrName   || "",
          company:    c.company  || "",
          role:       c.role     || "",
          type:       c.type     || "application",
          status:     c.status   || "Sent",
          sentAt:     c.sentAt   ? new Date(c.sentAt) : new Date(),
          replied:    c.replied  || false,
          repliedAt:  c.repliedAt ? new Date(c.repliedAt) : null,
          followupSent: c.followupSent || false,
          notes:      c.notes    || "",
          source:     c.source   || "import",
        });
        inserted++;
      }
    } catch (e) { skipped++; }
  }
  res.json({ success: true, inserted, updated, skipped, total: contacts.length });
});


// ─── GET /api/sync-sent-emails ───────────────────────────────────────────────
// Fetches sent emails from Gmail after a given date and saves to MongoDB
app.get("/api/sync-sent-emails", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1)
      return res.status(503).json({ success: false, message: "MongoDB not connected" });

    const tokenPath = path.join(__dirname, "tokens.json");
    if (!fs.existsSync(tokenPath))
      return res.status(401).json({ success: false, message: "Gmail not connected. Please connect via /api/gmail/auth" });

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    auth.setCredentials(JSON.parse(fs.readFileSync(tokenPath, "utf8")));
    const gmail = google.gmail({ version: "v1", auth });

    // Default: after last sheet date (28 May 2026), or use query param
    const afterDate = req.query.after || "2026/05/28";
    const maxResults = parseInt(req.query.max || "200");

    // Gmail date query format: after:YYYY/MM/DD
    const query = `in:sent after:${afterDate}`;
    console.log(`📧 Syncing Gmail sent emails: ${query}`);

    let allMessages = [];
    let pageToken = null;

    // Paginate through results
    do {
      const listParams = { userId: "me", q: query, maxResults: 100 };
      if (pageToken) listParams.pageToken = pageToken;
      const list = await gmail.users.messages.list(listParams);
      const msgs = list.data.messages || [];
      allMessages = allMessages.concat(msgs);
      pageToken = list.data.nextPageToken || null;
      if (allMessages.length >= maxResults) break;
    } while (pageToken);

    console.log(`📬 Found ${allMessages.length} sent messages`);

    let inserted = 0, skipped = 0, updated = 0;
    const results = [];

    for (const msg of allMessages) {
      try {
        const detail = await gmail.users.messages.get({
          userId: "me", id: msg.id, format: "metadata",
          metadataHeaders: ["To", "Subject", "Date", "Message-ID"]
        });

        const headers = detail.data.payload.headers || [];
        const getH = (name) => headers.find(h => h.name === name)?.value || "";

        const toRaw   = getH("To");
        const subject = getH("Subject");
        const date    = getH("Date");
        const msgId   = getH("Message-ID") || msg.id;
        const threadId = detail.data.threadId;

        // Extract email address from "Name <email>" format
        const emailMatch = toRaw.match(/<([^>]+)>/);
        const hrEmail    = (emailMatch ? emailMatch[1] : toRaw).trim().toLowerCase();
        const hrName     = toRaw.replace(/<[^>]+>/, "").replace(/"/g, "").trim();

        // Skip non-email / self-emails / test emails
        if (!hrEmail.includes("@")) { skipped++; continue; }
        if (hrEmail === (process.env.GMAIL_USER || "").toLowerCase()) { skipped++; continue; }

        // Parse date
        const sentAt = date ? new Date(date) : new Date();

        // Detect company from email domain
        const domainMatch = hrEmail.match(/@([^.]+)\./);
        const company = domainMatch ? domainMatch[1] : "";

        // Check if already exists in DB
        const existing = await SentEmailLog.findOne({ messageId: msg.id }).lean();

        if (existing) {
          skipped++;
        } else {
          // Check by email to see if we sent before (for dedup)
          const prevByEmail = await SentEmailLog.findOne({
            hrEmail: new RegExp("^" + hrEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"),
            sentAt: { $gte: new Date(sentAt.getTime() - 60000) }  // within 1 min
          }).lean();

          if (prevByEmail) { skipped++; continue; }

          await SentEmailLog.create({
            messageId:  msg.id,
            threadId:   threadId || null,
            hrEmail,
            hrName:     hrName || "",
            company:    company || "",
            role:       "",
            subject:    subject || "",
            type:       "application",
            status:     "Sent",
            sentAt,
            source:     "gmail_sync",
          });
          inserted++;
          results.push({ hrEmail, company, sentAt: sentAt.toISOString(), subject });
        }
      } catch (e) {
        skipped++;
        console.warn("Skip msg:", msg.id, e.message);
      }
    }

    console.log(`✅ Gmail sync done: inserted=${inserted} updated=${updated} skipped=${skipped}`);
    res.json({
      success: true,
      message: `Sync complete! ${inserted} new contacts saved.`,
      inserted, updated, skipped,
      totalFetched: allMessages.length,
      sample: results.slice(0, 10),
    });

  } catch (e) {
    console.error("Gmail sync error:", e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});


// ─── GET /api/run-import — trigger import from browser (one-time) ─────────────
app.get("/api/run-import", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1)
      return res.status(503).send("❌ MongoDB not connected");
    await autoImportContacts(SentEmailLog, mongoose);
    const total = await SentEmailLog.countDocuments();
    res.send(`✅ Import triggered! Total contacts in DB: ${total}. <br><a href='/api/contacts'>Check contacts</a>`);
  } catch(e) {
    res.status(500).send("❌ Error: " + e.message);
  }
});

app.listen(PORT, () => console.log(`\n🚀 Job Mailer API → http://localhost:${PORT}\n`));
