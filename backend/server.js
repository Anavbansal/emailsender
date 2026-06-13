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
const CTI_RESUME_PATH  = path.join(__dirname, "Anav_Bansal_TelephonyExpert.pdf");
const MOHIT_RESUME_PATH = path.join(__dirname, "Mohit_Singh_CV.pdf");
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
  gmailMsgId:   { type: String,  default: null },
  replySnippet: { type: String,  default: "" },
  conversation: { type: Array,   default: [] },
  userId:       { type: String,  default: "default" }, // multi-user support
  // Contact tracker fields
  phone:           { type: String,  default: "" },
  stage:           { type: String,  default: "Applied" },
  priority:        { type: String,  default: "Normal" },
  interviewRound:  { type: String,  default: "" },
  interviewDate:   { type: Date,    default: null },
  callLog:         { type: String,  default: "" },
}, { timestamps: true });

const SentEmailLog = mongoose.models.SentEmailLog ||
  mongoose.model("SentEmailLog", SentEmailLogSchema);


// ─── User Model ───────────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  displayName:  { type: String, default: "" },
  // Per-user Gmail & Sheet credentials (override global env)
  gmailUser:          { type: String, default: "" },
  gmailRefreshToken:  { type: String, default: "" },
  gmailAccessToken:   { type: String, default: "" },
  googleSheetId:      { type: String, default: "" },
  sheetTab:           { type: String, default: "Candidate_Status_Log" },
  linkedinSheetId:    { type: String, default: "" },
  resumePath:         { type: String, default: "" },
  // Profile info
  profileName:        { type: String, default: "Anav Bansal" },
  profilePhone:       { type: String, default: "+91 7827855635" },
  profileLinkedIn:    { type: String, default: "linkedin.com/in/anavbansal-51b191162" },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", UserSchema);

// ── JWT helpers ───────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || "emailsender_secret_2026";
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

// ── Auth middleware ───────────────────────────────────────────────────────────
async function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: "No token" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId  = decoded.userId;
    const user    = await User.findById(userId).lean();
    if (!user) return res.status(401).json({ success: false, message: "User not found" });

    const isAdminUser  = user.username === (process.env.ADMIN_USERNAME  || "superadmin");
    const hasAdminFlag = !!user.isAdmin;

    if (!isAdminUser && !hasAdminFlag)
      return res.status(403).json({ success: false, message: "Admin access required" });

    req.user   = user;
    req.userId = String(userId);
    next();
  } catch(e) {
    console.error("requireAdmin error:", e.message);
    res.status(401).json({ success: false, message: "Invalid token: " + e.message });
  }
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: "Login required" });
  try {
    const { userId } = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(userId).lean();
    if (!user) return res.status(401).json({ success: false, message: "User not found" });
    req.user   = user;
    req.userId = String(user._id);
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

// ── Get Gmail auth for a specific user ───────────────────────────────────────
function getUserGmailAuth(user) {
  const isOwner = user && (user.username === (process.env.OWNER_USERNAME || "anav"));
  const refreshToken  = user?.gmailRefreshToken ||
    (isOwner ? process.env.GMAIL_REFRESH_TOKEN : null);
  const accessToken   = user?.gmailAccessToken || null;

  if (!refreshToken && !accessToken) {
    throw new Error("Gmail not connected. Please connect via /api/gmail/auth?username=" + (user?.username || ""));
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  const creds = {};
  if (refreshToken) creds.refresh_token = refreshToken;
  if (accessToken)  creds.access_token  = accessToken;
  oauth2Client.setCredentials(creds);
  return oauth2Client;
}

// ── Get Sheets client for a specific user ────────────────────────────────────
function getUserSheetsClient(user) {
  const auth = getUserGmailAuth(user);
  return google.sheets({ version: "v4", auth });
}

// ── Get user-specific config ──────────────────────────────────────────────────
function getUserConfig(user) {
  const isOwner = user.username === (process.env.OWNER_USERNAME || "anav");
  return {
    gmailUser:        user.gmailUser        || (isOwner ? process.env.GMAIL_USER      : "") || "",
    sheetId:          user.googleSheetId    || (isOwner ? process.env.GOOGLE_SHEET_ID : "") || "",
    sheetTab:         user.sheetTab         || process.env.SHEET_TAB || "Candidate_Status_Log",
    linkedinSheetId:  user.linkedinSheetId  || (isOwner ? (process.env.LINKEDIN_SHEET_ID || "") : ""),
    resumePath:       user.resumePath       || "",  // only set for Priyal, Anav uses templateType
    resumeFileName:   user.resumeFileName   || "",
    profileName:      user.profileName      || (isOwner ? "Anav Bansal" : user.displayName || ""),
    profilePhone:     user.profilePhone     || (isOwner ? "+91 7827855635" : ""),
    profileLinkedIn:  user.profileLinkedIn  || (isOwner ? "linkedin.com/in/anavbansal-51b191162" : ""),
    profileEmail:     user.profileEmail     || user.gmailUser || "",
    profileLocation:  user.profileLocation  || (isOwner ? "Faridabad, Haryana" : ""),
    profileTitle:     user.profileTitle     || (isOwner ? "Senior Full Stack Developer" : ""),
    keySkills:        user.keySkills        || (isOwner ? "Node.js, Angular, AWS, ExpressJS, TypeScript, CTI Integrations, ServiceNow, Chatbot Development" : ""),
    currentCompany:   user.currentCompany   || (isOwner ? "NovelVox Pvt. Ltd." : ""),
    currentCTC:       user.currentCTC       || (isOwner ? "₹9 LPA" : ""),
    expectedCTC:      user.expectedCTC      || (isOwner ? "₹15 LPA" : ""),
    noticePeriod:     user.noticePeriod     || (isOwner ? "30 Days" : ""),
    currentLocation:  user.currentLocation  || (isOwner ? "Faridabad, Haryana" : ""),
    preferredLocation:user.preferredLocation|| (isOwner ? "PAN India" : ""),
    totalExp:         user.totalExp         || (isOwner ? "4.7+ Years" : ""),
    relevantExp:         user.relevantExp         || (isOwner ? "4.7+ Years" : ""),
    // Gmail credentials — critical for sending emails
    gmailRefreshToken:   user.gmailRefreshToken   || (isOwner ? process.env.GMAIL_REFRESH_TOKEN : ""),
    gmailAccessToken:    user.gmailAccessToken    || "",
  };
}

async function saveSentEmail(data, userId = "default") {
  try {
    if (mongoose.connection.readyState === 1) {
      await SentEmailLog.create({ ...data, userId });
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

async function sendViaGmailAPI({ to, subject, html, inReplyTo = null, references = null, threadId = null, userConfig = null, user = null, templateType = "fullstack" }) {
  // Use full user object if provided (has gmailRefreshToken directly from DB)
  // Fallback to userConfig, then env var
  let auth;
  if (user && user.gmailRefreshToken) {
    auth = getUserGmailAuth(user);
  } else if (userConfig && userConfig.gmailRefreshToken) {
    auth = getUserGmailAuth({ gmailRefreshToken: userConfig.gmailRefreshToken });
  } else {
    auth = getGmailAPITransport();
  }
  const gmail = google.gmail({ version: "v1", auth });

  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;

  const boundary       = "boundary_" + Date.now();
  const isPriyalGmail  = !!(userConfig?.profileName?.toLowerCase().includes("priyal") || user?.profileName?.toLowerCase().includes("priyal"));
  const isMohitGmail   = !!(userConfig?.profileName?.toLowerCase().includes("mohit")  || user?.profileName?.toLowerCase().includes("mohit"));

  let resumeFile, resumeName;
  if (isMohitGmail && fs.existsSync(MOHIT_RESUME_PATH)) {
    resumeFile = MOHIT_RESUME_PATH;
    resumeName = "Mohit_Singh_CV.pdf";
  } else if (isPriyalGmail && user?.resumePath && fs.existsSync(user.resumePath)) {
    resumeFile = user.resumePath;
    resumeName = user.resumeFileName || "Priyal_Goyal_Resume.pdf";
  } else if (!isPriyalGmail && !isMohitGmail && templateType === "crm" && fs.existsSync(CRM_RESUME_PATH)) {
    resumeFile = CRM_RESUME_PATH;
    resumeName = "Anav_Bansal_CRMExpert.pdf";
  } else if (!isPriyalGmail && !isMohitGmail && templateType === "cti" && fs.existsSync(CTI_RESUME_PATH)) {
    resumeFile = CTI_RESUME_PATH;
    resumeName = "Anav_Bansal_TelephonyExpert.pdf";
  } else {
    resumeFile = path.join(__dirname, "ANAV_BANSAL_FullStackDeveloper.pdf");
    resumeName = "Anav_Bansal_Resume.pdf";
  }
  const senderName  = userConfig?.profileName || "Anav Bansal";
  const senderEmail = userConfig?.gmailUser   || process.env.GMAIL_USER || "";
  const resumeData = fs.readFileSync(resumeFile).toString("base64");

  // Build threading headers when replying
  const extraHeaders = [];
  if (inReplyTo)  extraHeaders.push(`In-Reply-To: ${inReplyTo}`);
  if (references) extraHeaders.push(`References: ${references}`);

  const rawEmail = [
    `From: "${senderName}" <${senderEmail}>`,
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
    `Content-Type: application/pdf; name="${resumeName}"`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="${resumeName}"`,
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
  userCfg = null, user = null,
}) {
  const userName = userCfg?.profileName || "Anav Bansal";
  const subject = role
    ? `Application for ${role} Position — ${userName}`
    : templateType === "crm"
      ? `Job Application — ${userName} (Senior CRM & ServiceNow Expert)`
      : `Job Application — ${userName}`;

  const trackRecord = createTrackingRecord({ hrEmail, hrName, company, role, subject, type: "application" });
  const trackUrl    = `${BASE_URL}/api/track/${trackRecord.trackingId}`;
  const tplOpts     = { hrName, company, role, customNote, trackUrl, customIntro, customHighlights, headerTheme };

  let html;
  const isPriyal = !!(userCfg?.profileName?.toLowerCase().includes("priyal") || user?.profileName?.toLowerCase().includes("priyal"));
  const isMohit  = !!(userCfg?.profileName?.toLowerCase().includes("mohit")  || user?.profileName?.toLowerCase().includes("mohit"));

  // Check if user has a custom DB template
  let dbTemplate = null;
  if (mongoose.connection.readyState === 1 && user?._id) {
    dbTemplate = await EmailTemplate.findOne({ userId: String(user._id), templateId: templateType }).lean();
  }

  if (dbTemplate) {
    // Use dynamic DB template
    html = buildDynamicHTML({ ...tplOpts, dbTemplate, userName: userCfg?.profileName || "Anav Bansal" });
  } else if (isMohit) {
    html = buildMohitHTML({ ...tplOpts, templateType });
  } else if (isPriyal) {
    html = buildPriyalHTML({ ...tplOpts, templateType });
  } else if (templateType === "cti")    html = buildCTIHTML(tplOpts);
  else if (templateType === "formal")   html = buildFormalHTML(tplOpts);
  else if (templateType === "crm")      html = buildCRMHTML(tplOpts);
  else                                  html = buildFullstackHTML(tplOpts);

  storeEmailHtml(trackRecord.trackingId, html);

  const attachments = [];
  // Resume selection priority:
  // Resume: templateType decides for Anav, Priyal uses her own
  const isPriyalUser  = !!(userCfg?.profileName?.toLowerCase().includes("priyal") ||
                           user?.profileName?.toLowerCase().includes("priyal"));
  const isMohitUser   = !!(userCfg?.profileName?.toLowerCase().includes("mohit") ||
                           user?.profileName?.toLowerCase().includes("mohit"));

  // Check DB template resume URL
  const dbTplForResume = (mongoose.connection.readyState === 1 && user?._id)
    ? await EmailTemplate.findOne({ userId: String(user._id), templateId: templateType }).lean()
    : null;

  let resolvedResume;
  if (dbTplForResume?.resumeFileName && dbTplForResume?.resumeUrl) {
    // DB template has custom resume — use local file path if saved, else skip attachment
    // (URL-based resumes are linked in email body, not attached)
    resolvedResume = null; // handled in HTML
  } else if (isMohitUser && fs.existsSync(MOHIT_RESUME_PATH)) {
    resolvedResume = { filename: "Mohit_Singh_CV.pdf", path: MOHIT_RESUME_PATH, contentType: "application/pdf" };
  } else if (isPriyalUser && user?.resumePath && fs.existsSync(user.resumePath)) {
    resolvedResume = { filename: user.resumeFileName || "Priyal_Goyal_Resume.pdf", path: user.resumePath, contentType: "application/pdf" };
  } else if (!isPriyalUser && !isMohitUser && templateType === "cti" && fs.existsSync(CTI_RESUME_PATH)) {
    resolvedResume = { filename: "Anav_Bansal_TelephonyExpert.pdf", path: CTI_RESUME_PATH, contentType: "application/pdf" };
  } else if (!isPriyalUser && !isMohitUser && templateType === "crm" && fs.existsSync(CRM_RESUME_PATH)) {
    resolvedResume = { filename: "Anav_Bansal_CRMExpert.pdf", path: CRM_RESUME_PATH, contentType: "application/pdf" };
  } else {
    resolvedResume = { filename: "Anav_Bansal_Resume.pdf", path: RESUME_PATH, contentType: "application/pdf" };
  }
  if (resolvedResume) attachments.push(resolvedResume);

  const mailOpts = { to: hrEmail, subject, html, attachments, userConfig: userCfg, user, templateType };
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




// ─── HTML: Dynamic DB Template ───────────────────────────────────────────────
function buildDynamicHTML({ hrName, company, role, customNote, trackUrl = "", dbTemplate, userName = "Anav Bansal" }) {
  const greeting   = hrName ? `Dear ${hrName},` : "Dear Hiring Manager,";
  const co         = company || "your organization";
  const roleText   = role ? ` for the <strong>${role}</strong> position` : "";
  const noteBlock  = (customNote || dbTemplate.customNote)
    ? `<p style="color:#374151;line-height:1.8;margin:16px 0;">${customNote || dbTemplate.customNote}</p>` : "";
  const pixel      = trackUrl ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt=""/>` : "";
  const accent     = dbTemplate.accent || "#2563eb";
  const intro      = dbTemplate.intro  || `I am writing to express my strong interest in joining <strong>${co}</strong>${roleText}.`;
  const highlights = (dbTemplate.highlights || []).map(h => `<li>${h}</li>`).join("");
  const resumeName = dbTemplate.resumeFileName || "Resume.pdf";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:${accent};padding:36px 40px;">
    <p style="margin:0 0 6px;color:rgba(255,255,255,0.8);font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">${dbTemplate.name || "Job Application"}</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${userName}</h1>
  </div>
  <div style="padding:36px 40px;">
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${greeting}</p>
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${intro}</p>
    ${noteBlock}
    ${highlights ? `<div style="background:#f8fafc;border-left:4px solid ${accent};border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-weight:600;font-size:14px;">🏆 Key Highlights</p>
      <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:2;">${highlights}</ul>
    </div>` : ""}
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px 18px;margin:18px 0;">
      <p style="margin:0 0 4px;font-weight:700;font-size:13px;">📎 Resume Attached</p>
      <p style="margin:0;font-size:12px;color:#0369a1;">${resumeName}</p>
    </div>
    <p style="color:#374151;line-height:1.8;margin:0;">Thank you for your time and consideration. I would love to discuss this opportunity further.</p>
  </div>
</div></body></html>`;
}

// ─── HTML: Mohit Singh — Backend/CRM Template ────────────────────────────────
function buildMohitHTML({ hrName, company, role, customNote, trackUrl = "", templateType = "backend" }) {
  const greeting  = hrName ? `Dear ${hrName},` : "Dear Hiring Manager,";
  const roleText  = role   ? ` for the <strong>${role}</strong> position` : "";
  const noteBlock = customNote ? `<p style="color:#374151;line-height:1.8;margin:16px 0;">${customNote}</p>` : "";
  const pixel     = trackUrl  ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt=""/>` : "";

  const intros = {
    backend:  `I am writing to express my strong interest in joining <strong>${company||"your organization"}</strong>${roleText}. With <strong>4.7+ years of experience</strong> as a Senior Software Backend Engineer, I specialize in Java, Spring Boot, Microservices, REST APIs, and enterprise CRM/CTI integrations across Microsoft Dynamics 365, ServiceNow, Salesforce, HubSpot, and Cisco Finesse.`,
    crm:      `I am reaching out regarding${roleText} at <strong>${company||"your organization"}</strong>. My 4.7+ years specializing in CRM/CTI integrations — including MS Dynamics 365, ServiceNow, Salesforce, and Cisco Finesse — have enabled me to deliver enterprise-grade solutions, resolve critical P1/P2 incidents, and mentor junior developers.`,
    java:     `I am applying${roleText} at <strong>${company||"your organization"}</strong>. As a Senior Java Developer with 4.7+ years in Spring Boot, Microservices, REST APIs, and SQL, I have independently owned end-to-end projects from design to production — delivering high-performance, scalable solutions in Agile environments.`,
    formal:   `I am respectfully submitting my application${roleText} at <strong>${company||"your organization"}</strong>. With 4.7+ years of enterprise software development experience, I am confident my background aligns with your requirements.`,
  };

  const intro = intros[templateType] || intros.backend;

  const highlights = [
    "4.7+ Years · Java, Spring Boot, Microservices, REST APIs",
    "CRM/CTI: MS Dynamics 365, ServiceNow, Salesforce, HubSpot, Cisco Finesse",
    "8 'Pat on the Back' Awards + Performance of the Year — NovelVox",
    "P1/P2 Incident Management · Root Cause Analysis · Client Management",
    "Enterprise integrations: Bank Albilad, J&K Bank, Misr Digital Innovation",
  ].map(h => `<li>${h}</li>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:36px 40px;">
    <p style="margin:0 0 6px;color:#93c5fd;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Senior Software Developer · CRM & CTI Specialist</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Mohit Singh</h1>
    <p style="margin:6px 0 0;color:#93c5fd;font-size:14px;">Java · Spring Boot · Microservices · MS Dynamics 365 · ServiceNow · Salesforce</p>
  </div>
  <div style="padding:36px 40px;">
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${greeting}</p>
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${intro}</p>
    ${noteBlock}
    <div style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-weight:600;color:#1e3a5f;font-size:14px;">🏆 Key Highlights</p>
      <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:2;">${highlights}</ul>
    </div>
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0 0 4px;font-weight:700;color:#0c4a6e;font-size:14px;">📎 Resume Attached</p>
      <p style="margin:0;font-size:12px;color:#0369a1;">Mohit_Singh_CV.pdf</p>
    </div>
    <p style="color:#374151;line-height:1.8;margin:0;">Thank you for your time and consideration. I would welcome the opportunity to discuss how my experience can contribute to your team.</p>
  </div>
  <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:12px;color:#64748b;">
      Mohit Singh · <a href="mailto:mohit310ggn@gmail.com" style="color:#2563eb;">mohit310ggn@gmail.com</a> ·
      <a href="tel:+917982092042" style="color:#2563eb;">+91 7982092042</a> ·
      Gurugram, Haryana
    </p>
  </div>
</div></body></html>`;
}

// ─── HTML: Priyal Finance/Credit Template ─────────────────────────────────────
function buildPriyalHTML({ hrName, company, role, customNote, trackUrl = "", templateType = "finance" }) {
  const greeting  = hrName ? `Dear ${hrName},` : "Dear Hiring Manager,";
  const roleText  = role   ? ` for the <strong>${role}</strong> position` : "";
  const noteBlock = customNote ? `<p style="color:#374151;line-height:1.8;margin:16px 0;">${customNote}</p>` : "";
  const pixel     = trackUrl   ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt=""/>` : "";

  const intros = {
    finance: `I am writing to express my strong interest in joining <strong>${company||"your organization"}</strong>${roleText}. With <strong>2+ years as a Finance Professional</strong> at Tata Capital Limited, I bring expertise in digital lending, credit risk assessment, and GenAI-based automation — having contributed to a <strong>2.9% reduction in TAT</strong> and improvement in credit quality.`,
    credit:  `I am writing to apply${roleText} at <strong>${company||"your organization"}</strong>. As a <strong>Credit Manager at Tata Capital</strong>, I evaluate secured retail auto loan proposals, manage a monthly productivity target of 250+ cases, and lead cross-functional collaboration across credit, operations and technology teams.`,
    genai:   `I am reaching out regarding${roleText} at <strong>${company||"your organization"}</strong>. I have hands-on experience contributing to <strong>GenAI-powered credit automation</strong> platforms, SLOS integration, and AI-driven workflow optimization — reducing TAT by 2.9% at Tata Capital Limited.`,
    formal:  `I am respectfully submitting my application${roleText} at <strong>${company||"your organization"}</strong>. With a strong foundation in digital lending, credit risk, and financial analysis, I am confident my experience aligns well with your requirements.`,
  };

  const intro = intros[templateType] || intros.finance;

  const highlights = [
    "2+ Years · Digital Lending & Credit Risk · Tata Capital Limited",
    "Credit Underwriting · FOIR/LTV Analysis · Portfolio Monitoring",
    "GenAI Automation · SLOS Integration · AI-driven Workflow Optimization",
    "Tools: FinnOne, SLOS, SFDC, FICO, Jocata, Power BI, Advanced Excel",
    "COO Achiever's Club Award — Tata Capital (Q1 FY26)",
  ].map(h => `<li>${h}</li>`).join("");

  const resumeBox = `
    <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:16px 20px;margin:20px 0;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <p style="margin:0 0 4px;font-weight:700;color:#134e4a;font-size:14px;">📎 Resume Attached</p>
        <p style="margin:0;font-size:12px;color:#0d9488;">Priyal_Goyal_Resume.pdf</p>
      </div>
    </div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#0f766e,#0d9488);padding:36px 40px;">
    <p style="margin:0 0 6px;color:#99f6e4;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Finance Professional · Credit Manager</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Priyal Goyal</h1>
    <p style="margin:6px 0 0;color:#99f6e4;font-size:14px;">Digital Lending · Credit Risk · GenAI Automation · Tata Capital</p>
  </div>
  <div style="padding:36px 40px;">
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${greeting}</p>
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${intro}</p>
    ${noteBlock}
    <div style="background:#f0fdfa;border-left:4px solid #0d9488;border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-weight:600;color:#134e4a;font-size:14px;">🏆 Key Highlights</p>
      <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:2;">${highlights}</ul>
    </div>
    ${resumeBox}
    <p style="color:#374151;line-height:1.8;margin:0;">Thank you for your time and consideration. I would love the opportunity to discuss how my experience can contribute to your team.</p>
  </div>
  <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:12px;color:#64748b;">
      Priyal Goyal · <a href="mailto:priyalgoyal1702@gmail.com" style="color:#0d9488;">priyalgoyal1702@gmail.com</a> ·
      <a href="tel:+917665941798" style="color:#0d9488;">+91 7665941798</a> ·
      <a href="https://linkedin.com/in/priyal--goyal/" style="color:#0d9488;">LinkedIn</a>
    </p>
  </div>
</div></body></html>`;
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
function buildFollowUpHTML({ hrName, company, role, originalDate, customNote, trackUrl = "", userCfg = null }) {
  const greeting  = hrName ? `Dear ${hrName},` : "Dear Hiring Manager,";
  const roleText  = role   ? ` for the <strong>${role}</strong> role` : "";
  const dateText  = originalDate ? ` on <strong>${originalDate}</strong>` : " recently";
  const noteBlock = customNote ? `<p style="color:#374151;line-height:1.8;margin:16px 0;">${customNote}</p>` : "";
  const pixel     = trackUrl   ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt=""/>` : "";

  const isPriyal  = userCfg?.profileName?.toLowerCase().includes("priyal");
  const senderName  = userCfg?.profileName  || "Anav Bansal";
  const senderTitle = isPriyal
    ? "Finance Professional · Credit Manager · Digital Lending"
    : "Senior Full Stack Developer · Node.js · Angular · AWS";
  const bodyText = isPriyal
    ? `I remain very enthusiastic and confident that my <strong>2+ years of experience</strong> in digital lending, credit risk assessment, and GenAI automation at Tata Capital would be a strong fit for your team.`
    : `I remain very enthusiastic and confident that my <strong>4.7+ years of experience</strong> in full-stack development, Node.js, AWS serverless architectures, and enterprise CTI/Telephony integrations would be a strong fit for your team.`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#064e3b 0%,#059669 100%);padding:36px 40px;">
    <p style="margin:0 0 6px;color:#a7f3d0;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Follow-Up</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${senderName}</h1>
    <p style="margin:6px 0 0;color:#a7f3d0;font-size:14px;">${senderTitle}</p>
  </div>
  <div style="padding:36px 40px;">
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${greeting}</p>
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">
      I hope this message finds you well. I am following up on my application${roleText} at
      <strong>${company||"your organization"}</strong>, which I submitted${dateText}.
    </p>
    ${noteBlock}
    <p style="color:#374151;line-height:1.8;margin:0 0 24px;">${bodyText}</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:18px 24px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-weight:600;color:#065f46;font-size:14px;">📎 Resume (Re-attached)</p>
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
app.post("/api/send-referral", requireAuth, async (req, res) => {
  const { employeeEmail, employeeName = "", company, role, customNote } = req.body;
  if (!employeeEmail || !company || !role)
    return res.status(400).json({ success: false, message: "employeeEmail, company, and role are required." });

  const subject    = `Referral Request — ${role} at ${company}`;
  const trackRecord = createTrackingRecord({ hrEmail: employeeEmail, hrName: employeeName, company, role, subject, type: "referral" });
  const trackUrl   = `${BASE_URL}/api/track/${trackRecord.trackingId}`;
  const html       = buildReferralHTML({ employeeName, company, role, customNote, trackUrl });

  storeEmailHtml(trackRecord.trackingId, html);

  try {
    const info = await sendViaGmailAPI({ to: employeeEmail, subject, html, userConfig: getUserConfig(req.user), user: req.user });
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
app.get("/api/contacts", requireAuth, async (req, res) => {
  const isOwner = req.user.username === (process.env.OWNER_USERNAME || "anav");

  // Non-owner with no sheet: return only their MongoDB data
  if (!isOwner && !req.user.googleSheetId) {
    if (mongoose.connection.readyState === 1) {
      const toMs = (v) => { if (!v) return null; if (typeof v === "number") return v; const d = new Date(v); return isNaN(d.getTime()) ? null : d.getTime(); };
      const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
      const rows = await SentEmailLog.aggregate([
        { $match: { userId: req.userId } },
        { $sort: { sentAt: -1 } },
        { $group: {
          _id: { $toLower: "$hrEmail" },
          hrEmail: { $first: "$hrEmail" }, hrName: { $first: "$hrName" },
          company: { $first: "$company" }, role: { $first: "$role" },
          latestSentAt: { $first: "$sentAt" }, messageId: { $first: "$messageId" },
          threadId: { $first: "$threadId" }, replied: { $max: "$replied" },
          repliedAt: { $first: "$repliedAt" }, followupSent: { $max: "$followupSent" },
          notes: { $first: "$notes" }, totalSent: { $sum: 1 },
        }}
      ]);
      const contacts = rows.map(r => {
        const ls = toMs(r.latestSentAt) || 0;
        return {
          hrEmail: r.hrEmail||"", hrName: r.hrName||"", company: r.company||"", role: r.role||"",
          lastSentAt: ls, lastMessageId: r.messageId||null, lastThreadId: r.threadId||null,
          totalSent: r.totalSent||1, followupCount: 0, opened: false, openedAt: null,
          replied: r.replied||false, repliedAt: toMs(r.repliedAt)||null,
          followupSent: r.followupSent||false, notes: typeof r.notes==="string"?r.notes:"",
          needsFollowUp: ls>0 && (Date.now()-ls)>THREE_DAYS_MS && !r.replied,
          lastTrackingId: null,
        };
      }).sort((a,b) => b.lastSentAt - a.lastSentAt);
      return res.json({ success: true, contacts, fetchedAt: Date.now(), sheetError: null, sheetTab: "" });
    }
    return res.json({ success: true, contacts: [], fetchedAt: Date.now(), sheetError: null, sheetTab: "" });
  }

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
      { $match: { $or: [
        { userId: req.userId },
        // First registered user (owner) also sees legacy "default" data
        ...(req.user.username === (process.env.OWNER_USERNAME || "anav")
          ? [{ userId: "default" }, { userId: { $exists: false } }]
          : [])
      ] } },
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
          lastFollowupAt:   row.lastFollowupAt ? new Date(row.lastFollowupAt).getTime() : null,
          totalSent:        row.totalSent    || 1,
          followupCount:    row.followupSent ? 1 : 0,
        });
      } else {
        // Enrich existing sheet/tracking contact with DB data
        existing.latestThreadId  = row.threadId  || existing.latestThreadId  || null;
        existing.latestMessageId = row.messageId || existing.latestMessageId || null;
        existing.replied         = row.replied      || existing.replied      || false;
        existing.repliedAt       = row.repliedAt   || existing.repliedAt   || null;
        existing.followupSent    = row.followupSent|| existing.followupSent || false;
        existing.notes           = row.notes       || existing.notes       || "";
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

    // Ensure all date fields are numbers (ms), not Date objects or strings
    const toMs = (v) => {
      if (!v) return null;
      if (typeof v === "number") return v;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d.getTime();
    };

    contacts.push({
      hrEmail:       c.hrEmail       || "",
      hrName:        c.hrName        || "",
      company:       c.company       || "",
      role:          c.role          || "",
      lastSentAt:    toMs(c.latestSentAt) || 0,
      lastTrackingId:c.latestTrackingId   || null,
      lastMessageId: c.latestMessageId    || null,
      lastThreadId:  c.latestThreadId     || null,
      totalSent:     c.totalSent          || 1,
      followupCount: c.followupCount      || 0,
      opened:        c.opened             || false,
      openedAt:      toMs(c.openedAt)     || null,
      replied:       c.replied            || false,
      repliedAt:     toMs(c.repliedAt)    || null,
      followupSent:  c.followupSent       || false,
      notes:         typeof c.notes === "string" ? c.notes : "",
      phone:         c.phone          || "",
      stage:         c.stage          || "Applied",
      priority:      c.priority       || "Normal",
      interviewRound:c.interviewRound || "",
      interviewDate: c.interviewDate  ? new Date(c.interviewDate).getTime() : null,
      callLog:       c.callLog        || "",
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

  // Reconstruct using user's template
  const _uCfg = getUserConfig(req.user);
  const _isMohit  = !!(_uCfg?.profileName?.toLowerCase().includes("mohit")  || req.user?.profileName?.toLowerCase().includes("mohit"));
  const _isPriyal = !!(_uCfg?.profileName?.toLowerCase().includes("priyal") || req.user?.profileName?.toLowerCase().includes("priyal"));
  const _opts = { hrName: record.hrName, company: record.company, role: record.role, customNote: "" };
  const html = record.type === "followup"
    ? buildFollowUpHTML({ ..._opts, originalDate: new Date(record.sentAt).toLocaleDateString("en-IN"), userCfg: _uCfg })
    : _isMohit  ? buildMohitHTML(_opts)
    : _isPriyal ? buildPriyalHTML(_opts)
    : buildFullstackHTML(_opts);

  storeEmailHtml(trackingId, html);
  res.json({ success: true, html: stripTrackingPixel(html), reconstructed: true });
});

// ─── GET /api/gmail/replies ───────────────────────────────────────────────────
// ─── GET /api/sent-log — all sent emails from DB with dates ──────────────────
app.get("/api/sent-log", requireAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1)
      return res.json({ success: false, message: "MongoDB not connected", logs: [] });

    const { type, email, limit = 100 } = req.query;
    const isOwner = req.user.username === (process.env.OWNER_USERNAME || "anav");
    const filter = isOwner
      ? { $or: [{ userId: req.userId }, { userId: "default" }, { userId: { $exists: false } }] }
      : { userId: req.userId };
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
app.get("/api/gmail/replies", requireAuth, async (req, res) => {
  try {
    // Use refresh token from env (works on Render without tokens.json)
    const cfg7 = getUserConfig(req.user);
    if (!cfg7.gmailUser && !process.env.GMAIL_REFRESH_TOKEN) return res.json({ success: true, replies: [] });
    const auth = getUserGmailAuth(req.user);
    const gmail = google.gmail({ version: "v1", auth });

    // Pull tracked emails from DB (more complete) with fallback to tracking.json
    let trackedEmails;
    if (mongoose.connection.readyState === 1) {
      const isOwner2 = req.user.username === (process.env.OWNER_USERNAME || "anav");
      const emailFilter = isOwner2
        ? { $or: [{ userId: req.userId }, { userId: "default" }, { userId: { $exists: false } }] }
        : { userId: req.userId };
      const dbEmails = await SentEmailLog.distinct("hrEmail", emailFilter);
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
app.post("/api/send-application", requireAuth, async (req, res) => {
  const { hrEmail, company, force, customIntro, customHighlights, headerTheme, ...rest } = req.body;
  if (!hrEmail)
    return res.status(400).json({ success: false, message: "hrEmail is required." });

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
      userCfg: getUserConfig(req.user),
      user:    req.user,
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
app.post("/api/send-followup", requireAuth, async (req, res) => {
  const { hrEmail, hrName = "", company, role, originalDate, customNote, originalMessageId, originalSubject, originalThreadId } = req.body;
  if (!hrEmail || !company)
    return res.status(400).json({ success: false, message: "hrEmail and company are required." });

  // If originalThreadId not supplied, look it up from DB so old entries also work
  let resolvedThreadId = originalThreadId || null;
  if (!resolvedThreadId && originalMessageId && mongoose.connection.readyState === 1) {
    const prev = await SentEmailLog.findOne({ messageId: originalMessageId }).lean();
    if (prev && prev.threadId) resolvedThreadId = prev.threadId;
  }

  const fuUserName  = getUserConfig(req.user).profileName || "Anav Bansal";
  const baseSubject = originalSubject ||
    (role ? `Application for ${role} Position — ${fuUserName}` : `Job Application — ${fuUserName}`);
  const subject     = `Re: ${baseSubject}`;
  const trackRecord = createTrackingRecord({ hrEmail, hrName, company, role, subject, type: "followup" });
  const trackUrl    = `${BASE_URL}/api/track/${trackRecord.trackingId}`;
  const html        = buildFollowUpHTML({ hrName, company, role, originalDate, customNote, trackUrl, userCfg: getUserConfig(req.user) });

  storeEmailHtml(trackRecord.trackingId, html);

  try {
    const fuCfg  = getUserConfig(req.user);
    const fuTplType = req.body.templateType || "fullstack";
    const info = await sendViaGmailAPI({
      to: hrEmail, subject, html,
      inReplyTo:    originalMessageId || null,
      references:   originalMessageId || null,
      threadId:     resolvedThreadId,
      userConfig:   fuCfg,
      user:         req.user,
      templateType: fuTplType,
    });
    logToSheets([info.id, hrEmail, company||"", role||"", new Date().toISOString(), trackRecord.trackingId, "FollowUp-Sent", ""]);
    await saveSentEmail({
      messageId: info.id, threadId: info.threadId || null, trackingId: trackRecord.trackingId,
      type: "followup", hrEmail, hrName: hrName||"", company: company||"", role: role||"",
      subject, sentAt: new Date(), inReplyTo: originalMessageId || null,
    });
    return res.status(200).json({ success: true, message: `Follow-up sent to ${hrEmail}!`, messageId: info.id });
  } catch (err) {
    const msg = err.message?.includes("Gmail not connected")
      ? "Gmail not connected. Please connect Gmail first: /api/gmail/auth?username=" + req.user.username
      : err.message?.includes("invalid_grant") || err.message?.includes("Token")
      ? "Gmail token expired. Please reconnect Gmail."
      : err.message;
    return res.status(500).json({ success: false, message: msg });
  }
});

// ─── POST /api/schedule-email ─────────────────────────────────────────────────
app.post("/api/schedule-email", requireAuth, async (req, res) => {
  const { hrEmail, company, scheduledTime, ...rest } = req.body;
  if (!hrEmail || !company || !scheduledTime)
    return res.status(400).json({ success: false, message: "hrEmail, company, scheduledTime required." });
  const jobId = Date.now().toString();
  await addScheduledJob({
    jobId, scheduledTime, status: "pending",
    userId: req.userId || "default",          // ← save userId
    emailData: { hrEmail, company, ...rest }
  });
  return res.json({ success: true, message: `Scheduled for ${new Date(scheduledTime).toLocaleString("en-IN")}`, jobId });
});

app.get("/api/scheduled-emails", requireAuth, async (req, res) => {
  const allJobs = await loadScheduled();
  const isOwner = req.user.username === (process.env.OWNER_USERNAME || "anav");
  const jobs = allJobs.filter(j =>
    isOwner
      ? (!j.userId || j.userId === req.userId || j.userId === "default")  // owner sees legacy too
      : (j.userId === req.userId)  // others see only their own
  );
  res.json({ success: true, jobs });
});

app.delete("/api/scheduled-emails/:jobId", requireAuth, async (req, res) => {
  // Only allow deleting own jobs
  const allJobs = await loadScheduled();
  const job = allJobs.find(j => j.jobId === req.params.jobId);
  if (job && job.userId && job.userId !== req.userId && job.userId !== "default")
    return res.status(403).json({ success: false, message: "Not your job" });
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
app.post("/api/preview-email", requireAuth, async (req, res) => {
  const { hrName, company, role, customNote, templateType = "fullstack", customIntro, customHighlights, headerTheme } = req.body;
  const opts     = { hrName, company, role, customNote, customIntro, customHighlights, headerTheme };
  const userCfg  = getUserConfig(req.user);
  const isPriyal = !!(userCfg?.profileName?.toLowerCase().includes("priyal") || req.user?.profileName?.toLowerCase().includes("priyal"));
  const isMohit  = !!(userCfg?.profileName?.toLowerCase().includes("mohit")  || req.user?.profileName?.toLowerCase().includes("mohit"));
  let html;
  if (isMohit)                        html = buildMohitHTML({ ...opts, templateType });
  else if (isPriyal)                  html = buildPriyalHTML({ ...opts, templateType });
  else if (templateType === "cti")    html = buildCTIHTML(opts);
  else if (templateType === "formal") html = buildFormalHTML(opts);
  else if (templateType === "crm")    html = buildCRMHTML(opts);
  else                                html = buildFullstackHTML(opts);
  res.json({ success: true, html });
});

// ─── LinkedIn Connections Sheet ───────────────────────────────────────────────
const LINKEDIN_SHEET_ID = "1xQAzAY8hRjmfYhMXB2R7oaw5HPqJZf13BjXM33wWQ5Q";
const LINKEDIN_TAB      = "Connections";

app.get("/api/linkedin/connections", requireAuth, async (req, res) => {
  try {
    const cfg    = getUserConfig(req.user);
    const isOwner = req.user.username === (process.env.OWNER_USERNAME || "anav");
    // Non-owner with no sheet set gets empty list — not owner's data
    const liSheetId = req.user.linkedinSheetId ||
      (isOwner ? (process.env.LINKEDIN_SHEET_ID || LINKEDIN_SHEET_ID) : null);
    if (!liSheetId) return res.json({ success: true, connections: [], total: 0 });
    const sheets = getUserSheetsClient(req.user);
    const resp   = await sheets.spreadsheets.values.get({
      spreadsheetId: liSheetId,
      range: `${LINKEDIN_TAB}!A2:J5000`,  // J = ignored flag
    });
    const rows = resp.data.values || [];
    let connections = rows
      // Assign rowIndex FIRST (before any filtering) so sheet row numbers stay correct
      .map((row, i) => ({
        rowIndex:    i + 2,                              // actual sheet row number
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
        ignored:     String(row[9] || "").toUpperCase() === "IGNORED",
      }))
      .filter(c => c.name.trim())                        // skip empty rows
      .filter(c => !c.ignored);                          // skip ignored rows

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

app.post("/api/linkedin/update-connection", requireAuth, async (req, res) => {
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



// ─── POST /api/linkedin/add-connection — add manually ─────────────────────────
app.post("/api/linkedin/add-connection", requireAuth, async (req, res) => {
  const { firstName, lastName, company, position, email, url, connectedOn } = req.body;
  if (!firstName && !lastName)
    return res.status(400).json({ success: false, message: "Name required" });
  try {
    const cfg = getUserConfig(req.user);
    const liSheetId = cfg.linkedinSheetId || LINKEDIN_SHEET_ID;
    const sheets = getUserSheetsClient(req.user);
    await sheets.spreadsheets.values.append({
      spreadsheetId: liSheetId,
      range: `${LINKEDIN_TAB}!A:J`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          firstName || "", lastName || "", url || "", email || "",
          company || "", position || "", connectedOn || "", "FALSE", "FALSE", ""
        ]]
      },
    });
    return res.json({ success: true, message: `${firstName} ${lastName} added to connections sheet` });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// ─── POST /api/linkedin/ignore-connection — permanently delete row ─────────────
app.post("/api/linkedin/ignore-connection", requireAuth, async (req, res) => {
  const { rowIndex } = req.body;
  if (!rowIndex) return res.status(400).json({ success: false, message: "rowIndex required" });
  try {
    const cfg       = getUserConfig(req.user);
    const liSheetId = cfg.linkedinSheetId || LINKEDIN_SHEET_ID;
    const sheets     = getUserSheetsClient(req.user);
    const sheetsMeta = await sheets.spreadsheets.get({ spreadsheetId: liSheetId });

    const tabMeta = sheetsMeta.data.sheets.find(
      s => s.properties.title === LINKEDIN_TAB
    );
    if (!tabMeta) return res.status(400).json({ success: false, message: `Tab "${LINKEDIN_TAB}" not found` });

    const sheetId = tabMeta.properties.sheetId;

    // Delete the actual row from sheet — permanent
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: liSheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension:  "ROWS",
              startIndex: rowIndex - 1,  // 0-based
              endIndex:   rowIndex,       // exclusive
            }
          }
        }]
      }
    });

    console.log(`🗑 Deleted row ${rowIndex} from ${LINKEDIN_TAB}`);
    return res.json({ success: true, message: `Row ${rowIndex} permanently deleted` });
  } catch (e) {
    console.error("Ignore/delete error:", e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.get("/", (req, res) => res.json({ status: "ok" }));

// ─── POST /api/import-contacts — bulk import from xlsx/JSON ──────────────────
app.post("/api/import-contacts", requireAuth, async (req, res) => {
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
          sentAt:     c.sentAt   ? new Date(c.sentAt) : null,  // null = unknown date
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
// Fetches sent emails from Gmail, saves threadId, detects replies, stores conversation
app.get("/api/sync-sent-emails", requireAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1)
      return res.status(503).json({ success: false, message: "MongoDB not connected" });

    const cfg8 = getUserConfig(req.user);
    if (!req.user.gmailRefreshToken && !process.env.GMAIL_REFRESH_TOKEN)
      return res.status(401).json({ success: false, message: "Gmail not connected" });

    const auth = getUserGmailAuth(req.user);
    const gmail = google.gmail({ version: "v1", auth });

    const afterDate  = req.query.after  || "2026/05/28";
    const beforeDate = req.query.before || "";
    const maxResults = parseInt(req.query.max || "100");
    const myEmail    = (cfg8.gmailUser || process.env.GMAIL_USER || "").toLowerCase();

    const query = beforeDate
      ? `in:sent after:${afterDate} before:${beforeDate}`
      : `in:sent after:${afterDate}`;
    console.log(`📧 Syncing Gmail sent emails: ${query} (max: ${maxResults})`);

    let allMessages = [];
    let pageToken = null;
    do {
      const listParams = { userId: "me", q: query, maxResults: Math.min(100, maxResults) };
      if (pageToken) listParams.pageToken = pageToken;
      const list = await gmail.users.messages.list(listParams);
      allMessages = allMessages.concat(list.data.messages || []);
      pageToken = list.data.nextPageToken || null;
      if (allMessages.length >= maxResults) break;
    } while (pageToken);

    // Trim to exact max
    allMessages = allMessages.slice(0, maxResults);

    console.log(`📬 Found ${allMessages.length} sent messages`);

    let inserted = 0, skipped = 0, updated = 0, repliesFound = 0;
    const results = [];

    let batchCount = 0;
    for (const msg of allMessages) {
      try {
        // Small delay every 10 messages to avoid Gmail rate limits
        if (++batchCount % 10 === 0) await new Promise(r => setTimeout(r, 200));

        // ── Step 1: Get sent message details ────────────────────────────────
        const detail = await gmail.users.messages.get({
          userId: "me", id: msg.id, format: "metadata",
          metadataHeaders: ["To", "Subject", "Date", "Message-ID"]
        });

        const headers  = detail.data.payload.headers || [];
        const getH     = (name) => headers.find(h => h.name === name)?.value || "";
        const toRaw    = getH("To");
        const subject  = getH("Subject");
        const date     = getH("Date");
        const gmailMsgId = getH("Message-ID") || msg.id;
        const threadId   = detail.data.threadId;

        const emailMatch = toRaw.match(/<([^>]+)>/);
        const hrEmail    = (emailMatch ? emailMatch[1] : toRaw).trim().toLowerCase();
        const hrName     = toRaw.replace(/<[^>]+>/, "").replace(/"/g, "").trim();

        if (!hrEmail.includes("@")) { skipped++; continue; }
        if (hrEmail === myEmail)    { skipped++; continue; }

        const sentAt = date ? new Date(date) : new Date();
        const domainMatch = hrEmail.match(/@([^.]+)\./);
        const company = domainMatch ? domainMatch[1] : "";

        // ── Step 2: Fetch full thread to detect replies + build history ──────
        let replied       = false;
        let repliedAt     = null;
        let replySnippet  = "";
        let conversation  = [];  // [{from, date, snippet, isReply}]

        if (threadId) {
          try {
            const thread = await gmail.users.threads.get({
              userId: "me", id: threadId, format: "metadata",
              metadataHeaders: ["From", "To", "Subject", "Date"]
            });

            const threadMsgs = thread.data.messages || [];

            for (const tm of threadMsgs) {
              const th = tm.payload?.headers || [];
              const getth = (n) => th.find(h => h.name === n)?.value || "";
              const fromH  = getth("From");
              const dateH  = getth("Date");

              const fromMatch  = fromH.match(/<([^>]+)>/);
              const fromEmail  = (fromMatch ? fromMatch[1] : fromH).trim().toLowerCase();
              const isHRReply  = fromEmail !== myEmail && fromEmail === hrEmail;
              const isMyMsg    = fromEmail === myEmail;

              conversation.push({
                from:    fromH,
                date:    dateH,
                snippet: tm.snippet || "",
                isReply: isHRReply,
                isMine:  isMyMsg,
              });

              // Mark replied if HR sent a message in this thread
              if (isHRReply && !replied) {
                replied      = true;
                repliedAt    = dateH ? new Date(dateH) : null;
                replySnippet = tm.snippet || "";
                repliesFound++;
              }
            }
          } catch (threadErr) {
            console.warn("Thread fetch failed:", threadErr.message);
          }
        }

        // ── Step 3: Save or update in MongoDB ────────────────────────────────
        const existing = await SentEmailLog.findOne({ messageId: msg.id }).lean();

        if (existing) {
          // Update thread data if missing or reply newly found
          const needsUpdate = (!existing.threadId && threadId) ||
                              (replied && !existing.replied) ||
                              (conversation.length > 0 && !existing.conversation?.length);
          if (needsUpdate) {
            await SentEmailLog.updateOne({ messageId: msg.id }, { $set: {
              threadId:     threadId || existing.threadId,
              replied:      replied  || existing.replied,
              repliedAt:    repliedAt|| existing.repliedAt,
              replySnippet: replySnippet || existing.replySnippet || "",
              conversation: conversation.length ? conversation : (existing.conversation || []),
            }});
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Check dedup by email+time
          const escaped = hrEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const prevByEmail = await SentEmailLog.findOne({
            hrEmail: new RegExp("^" + escaped + "$", "i"),
            sentAt:  { $gte: new Date(sentAt.getTime() - 60000) }
          }).lean();
          if (prevByEmail) { skipped++; continue; }

          await SentEmailLog.create({
            messageId:    msg.id,
            threadId:     threadId || null,
            gmailMsgId:   gmailMsgId,
            hrEmail,
            hrName:       hrName || "",
            company:      company || "",
            role:         "",
            subject:      subject || "",
            type:         "application",
            status:       "Sent",
            sentAt,
            replied,
            repliedAt:    repliedAt || null,
            replySnippet: replySnippet,
            conversation: conversation,
            source:       "gmail_sync",
          });
          inserted++;
          results.push({
            hrEmail, company,
            sentAt:  sentAt.toISOString(),
            subject, threadId,
            replied, repliedAt: repliedAt?.toISOString() || null,
          });
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
app.get("/api/run-import", requireAuth, async (req, res) => {
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


// ─── GET /api/thread/:messageId — full conversation history ──────────────────
app.get("/api/thread/:messageId", requireAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1)
      return res.status(503).json({ success: false, message: "MongoDB not connected" });

    // Try messageId first, then threadId as fallback
    let log = await SentEmailLog.findOne({ messageId: req.params.messageId, userId: req.userId }).lean();
    if (!log) log = await SentEmailLog.findOne({ threadId: req.params.messageId, userId: req.userId }).lean();
    if (!log) {
      // Try to fetch directly from Gmail if not in DB yet
      if (!process.env.GMAIL_REFRESH_TOKEN)
        return res.status(404).json({ success: false, message: "Email not found. Run Gmail Sync first." });
      // Return minimal response so frontend can show something
      return res.json({
        success: true, threadId: req.params.messageId,
        hrEmail: "", hrName: "", company: "", subject: "Unknown",
        replied: false, repliedAt: null, replySnippet: "",
        conversation: [],
        note: "Email not in DB yet — click Sync Gmail Sent to import it first."
      });
    }

    // If conversation already cached in DB, return it
    if (log.conversation && log.conversation.length > 0) {
      return res.json({
        success:      true,
        threadId:     log.threadId,
        hrEmail:      log.hrEmail,
        hrName:       log.hrName,
        company:      log.company,
        subject:      log.subject,
        replied:      log.replied,
        repliedAt:    log.repliedAt,
        replySnippet: log.replySnippet,
        conversation: log.conversation,
        cached:       true,
      });
    }

    // Else fetch live from Gmail
    if (!req.user.gmailRefreshToken && !process.env.GMAIL_REFRESH_TOKEN || !log.threadId)
      return res.json({ success: true, conversation: [], cached: false });

    const auth  = getUserGmailAuth(req.user);
    const gmail = google.gmail({ version: "v1", auth });
    const myEmail = (getUserConfig(req.user).gmailUser || process.env.GMAIL_USER || "").toLowerCase();

    const thread = await gmail.users.threads.get({
      userId: "me", id: log.threadId, format: "full"
    });

    const conversation = (thread.data.messages || []).map(tm => {
      const th     = tm.payload?.headers || [];
      const getth  = (n) => th.find(h => h.name === n)?.value || "";
      const fromH  = getth("From");
      const fromMatch = fromH.match(/<([^>]+)>/);
      const fromEmail = (fromMatch ? fromMatch[1] : fromH).trim().toLowerCase();

      // Extract body text
      let body = "";
      const extractBody = (part) => {
        if (!part) return;
        if (part.mimeType === "text/plain" && part.body?.data)
          body = Buffer.from(part.body.data, "base64").toString("utf8").slice(0, 1000);
        if (part.parts) part.parts.forEach(extractBody);
      };
      extractBody(tm.payload);

      return {
        from:      fromH,
        fromEmail,
        date:      getth("Date"),
        subject:   getth("Subject"),
        snippet:   tm.snippet || "",
        body:      body || tm.snippet || "",
        isReply:   fromEmail === log.hrEmail.toLowerCase(),
        isMine:    fromEmail === myEmail,
      };
    });

    // Cache in DB
    const replied    = conversation.some(m => m.isReply);
    const firstReply = conversation.find(m => m.isReply);
    await SentEmailLog.updateOne({ messageId: req.params.messageId }, { $set: {
      conversation,
      replied:      replied,
      repliedAt:    firstReply?.date ? new Date(firstReply.date) : null,
      replySnippet: firstReply?.snippet || "",
    }});

    res.json({
      success: true, threadId: log.threadId,
      hrEmail: log.hrEmail, hrName: log.hrName,
      company: log.company, subject: log.subject,
      replied, repliedAt: firstReply?.date || null,
      replySnippet: firstReply?.snippet || "",
      conversation, cached: false,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── GET /api/resync-replies — re-check all threads for new replies ────────────
app.get("/api/resync-replies", requireAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1)
      return res.status(503).json({ success: false, message: "MongoDB not connected" });
    if (!process.env.GMAIL_REFRESH_TOKEN)
      return res.status(401).json({ success: false, message: "GMAIL_REFRESH_TOKEN not set" });

    const auth    = getGmailAPITransport();
    const gmail   = google.gmail({ version: "v1", auth });
    const myEmail = (process.env.GMAIL_USER || "").toLowerCase();

    // Get all logs that have a threadId but no reply yet
    const logs = await SentEmailLog.find({
      threadId: { $ne: null },
      replied:  { $ne: true },
      source:   { $ne: "import" },
    }).lean().limit(200);

    let newReplies = 0, checked = 0;
    for (const log of logs) {
      try {
        const thread = await gmail.users.threads.get({
          userId: "me", id: log.threadId, format: "metadata",
          metadataHeaders: ["From", "Date"]
        });
        const threadMsgs = thread.data.messages || [];
        const hrReply = threadMsgs.find(tm => {
          const h = tm.payload?.headers || [];
          const from = h.find(x => x.name === "From")?.value || "";
          const fromMatch = from.match(/<([^>]+)>/);
          const fromEmail = (fromMatch ? fromMatch[1] : from).trim().toLowerCase();
          return fromEmail === log.hrEmail.toLowerCase() && fromEmail !== myEmail;
        });

        if (hrReply) {
          const h = hrReply.payload?.headers || [];
          const dateH = h.find(x => x.name === "Date")?.value || "";
          await SentEmailLog.updateOne({ _id: log._id }, { $set: {
            replied:      true,
            repliedAt:    dateH ? new Date(dateH) : new Date(),
            replySnippet: hrReply.snippet || "",
          }});
          newReplies++;
        }
        checked++;
      } catch { /* skip */ }
    }

    res.json({ success: true, checked, newReplies,
      message: `Checked ${checked} threads, found ${newReplies} new replies` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});


// ─── PATCH /api/contact/update — manually update contact status ───────────────
app.patch("/api/contact/update", requireAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1)
      return res.status(503).json({ success: false, message: "MongoDB not connected" });

    const { hrEmail, replied, repliedAt, notes, followupSent, status,
            phone, stage, priority, interviewRound, interviewDate, callLog } = req.body;
    if (!hrEmail) return res.status(400).json({ success: false, message: "hrEmail required" });

    const updates = {};
    if (replied        !== undefined) updates.replied        = replied;
    if (repliedAt      !== undefined) updates.repliedAt      = repliedAt ? new Date(repliedAt) : new Date();
    if (notes          !== undefined) updates.notes          = notes;
    if (followupSent   !== undefined) updates.followupSent   = followupSent;
    if (status         !== undefined) updates.status         = status;
    if (phone          !== undefined) updates.phone          = phone;
    if (stage          !== undefined) updates.stage          = stage;
    if (priority       !== undefined) updates.priority       = priority;
    if (interviewRound !== undefined) updates.interviewRound = interviewRound;
    if (interviewDate  !== undefined) updates.interviewDate  = interviewDate ? new Date(interviewDate) : null;
    if (callLog        !== undefined) updates.callLog        = callLog;

    // Update ALL records for this email (multiple sends)
    const escaped = hrEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const result = await SentEmailLog.updateMany(
      { hrEmail: new RegExp("^" + escaped + "$", "i"),
        $or: req.user.username === (process.env.OWNER_USERNAME || "anav")
          ? [{ userId: req.userId }, { userId: "default" }, { userId: { $exists: false } }]
          : [{ userId: req.userId }]
      },
      { $set: updates }
    );

    // If marking as replied, also add replySnippet
    if (replied && req.body.replyNote) {
      await SentEmailLog.updateMany(
        { hrEmail: new RegExp("^" + hrEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") },
        { $set: { replySnippet: req.body.replyNote } }
      );
    }

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} record(s) for ${hrEmail}`,
      modifiedCount: result.modifiedCount,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});


// ─── POST /api/auth/change-password ─────────────────────────────────────────
app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4)
    return res.status(400).json({ success: false, message: "Password too short" });
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await User.updateOne({ _id: req.userId }, { $set: { passwordHash: hash } });
    res.json({ success: true, message: "Password updated!" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── POST /api/auth/register ──────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  const { username, password, displayName, inviteCode } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: "Username and password required" });
  // Simple invite code protection
  const INVITE = process.env.INVITE_CODE || "emailsender2026";
  if (inviteCode !== INVITE)
    return res.status(403).json({ success: false, message: "Invalid invite code" });
  try {
    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(409).json({ success: false, message: "Username already taken" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.toLowerCase(), passwordHash,
      displayName: displayName || username,
    });
    const token = signToken(String(user._id));
    res.json({ success: true, token, user: { id: user._id, username: user.username, displayName: user.displayName } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: "Username and password required" });
  try {
    const user = await User.findOne({ username: username.toLowerCase() }).lean();
    if (!user) return res.status(401).json({ success: false, message: "Invalid username or password" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, message: "Invalid username or password" });
    const token = signToken(String(user._id));

    // Claim any unclaimed ("default") records on first login
    if (mongoose.connection.readyState === 1) {
      const unclaimed = await SentEmailLog.countDocuments({
        $or: [{ userId: "default" }, { userId: { $exists: false } }]
      });
      if (unclaimed > 0) {
        await SentEmailLog.updateMany(
          { $or: [{ userId: "default" }, { userId: { $exists: false } }] },
          { $set: { userId: String(user._id) } }
        );
        console.log(`✅ Claimed ${unclaimed} legacy records for user ${user.username}`);
      }
    }

    const isOwner      = user.username === (process.env.OWNER_USERNAME || "anav");
    const isAdminUser  = user.username === (process.env.ADMIN_USERNAME  || "superadmin");
    res.json({
      success: true, token,
      user: {
        id:             user._id,
        username:       user.username,
        displayName:    user.displayName    || user.username,
        gmailUser:      user.gmailUser      || "",
        profileName:    user.profileName    || user.displayName || user.username,
        profilePhone:   user.profilePhone   || "",
        profileEmail:   user.profileEmail   || "",
        profileLinkedIn:user.profileLinkedIn|| "",
        profileTitle:   user.profileTitle   || "",
        currentCompany: user.currentCompany || "",
        keySkills:      user.keySkills      || "",
        totalExp:       user.totalExp       || "",
        hasGmail:       !!(user.gmailRefreshToken || (isOwner && process.env.GMAIL_REFRESH_TOKEN)),
        hasSheet:       !!(user.googleSheetId || process.env.GOOGLE_SHEET_ID),
        isAdmin:        !!(user.isAdmin || isAdminUser),
        userTemplates:  user.userTemplates  || [],
        resumePath:     user.resumePath     || "",
        resumeFileName: user.resumeFileName || "",
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
app.get("/api/auth/me", requireAuth, async (req, res) => {
  const u = req.user;
  res.json({
    success: true,
    user: {
      id:             u._id,
      username:       u.username,
      displayName:    u.displayName    || u.username,
      gmailUser:      u.gmailUser      || "",
      profileName:    u.profileName    || u.displayName || u.username,
      profilePhone:   u.profilePhone   || "",
      profileEmail:   u.profileEmail   || "",
      profileLinkedIn:u.profileLinkedIn|| "",
      profileTitle:   u.profileTitle   || "",
      currentCompany: u.currentCompany || "",
      keySkills:      u.keySkills      || "",
      totalExp:       u.totalExp       || "",
      hasGmail:       !!(u.gmailRefreshToken || (u.username===(process.env.OWNER_USERNAME||"anav") && process.env.GMAIL_REFRESH_TOKEN)),
      hasSheet:       !!(u.googleSheetId || process.env.GOOGLE_SHEET_ID),
      isAdmin:        !!(u.isAdmin || u.username===(process.env.ADMIN_USERNAME||"superadmin")),
      userTemplates:  u.userTemplates  || [],
      resumePath:     u.resumePath     || "",
      resumeFileName: u.resumeFileName || "",
    }
  });
});

// ─── PATCH /api/auth/settings — update user credentials ──────────────────────
app.patch("/api/auth/settings", requireAuth, async (req, res) => {
  try {
    const allowed = ["displayName","gmailUser","gmailRefreshToken","googleSheetId",
                     "sheetTab","linkedinSheetId","profileName","profilePhone","profileLinkedIn",
                     "profileEmail","profileLocation","profileTitle","profileSummary","keySkills",
                     "currentCompany","currentCTC","expectedCTC","noticePeriod","currentLocation",
                     "preferredLocation","totalExp","relevantExp","resumePath","resumeFileName",
                     "reasonForChange","offerInHand","profileSummary","profileTitle",
                     "profilePhone","profileEmail","profileLinkedIn","profileLocation"];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    await User.updateOne({ _id: req.userId }, { $set: updates });
    res.json({ success: true, message: "Settings updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});



// ─── POST /api/auth/init-mohit — one-time setup for Mohit's profile ──────────
app.post("/api/auth/init-mohit", async (req, res) => {
  const { secret } = req.body;
  if (secret !== (process.env.JWT_SECRET || "emailsender_secret_2026"))
    return res.status(403).json({ success: false, message: "Forbidden" });
  try {
    const result = await User.updateOne(
      { username: "mohit" },
      { $set: {
        displayName:      "Mohit Singh",
        profileName:      "Mohit Singh",
        profilePhone:     "+91 7982092042",
        profileEmail:     "mohit310ggn@gmail.com",
        profileLinkedIn:  "linkedin.com/in/mohit-singh",
        profileLocation:  "Gurugram, Haryana",
        profileTitle:     "Senior Software Developer | CRM & CTI Integration Specialist",
        profileSummary:   "Senior Software Backend Engineer with 4.7 years of experience in Java, Spring Boot, REST APIs, Microservices, and CRM/CTI integrations including MS Dynamics 365, ServiceNow, HubSpot, Salesforce, and Cisco Finesse.",
        keySkills:        "Java, Spring Boot, Microservices, REST APIs, SQL, MySQL, CRM Integration, CTI Integration, Cisco Finesse, Salesforce, Microsoft Dynamics 365, ServiceNow, HubSpot, Git, CI/CD, Postman",
        currentCompany:   "NovelVox Pvt Ltd",
        totalExp:         "4.7+ Years",
        relevantExp:      "4.7+ Years",
        noticePeriod:     "30 Days",
        currentLocation:  "Gurugram, Haryana",
        preferredLocation:"PAN India",
        currentCTC:       "",
        expectedCTC:      "",
        resumePath:       require("path").join(__dirname, "Mohit_Singh_CV.pdf"),
        resumeFileName:   "Mohit_Singh_CV.pdf",
      }}
    );
    res.json({ success: true, message: "Mohit profile initialized", modified: result.modifiedCount });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── POST /api/auth/init-priyal — one-time setup for Priyal's profile ─────────
app.post("/api/auth/init-priyal", async (req, res) => {
  const { secret } = req.body;
  if (secret !== (process.env.JWT_SECRET || "emailsender_secret_2026"))
    return res.status(403).json({ success: false, message: "Forbidden" });
  try {
    const result = await User.updateOne(
      { username: "priyal" },
      { $set: {
        displayName:      "Priyal Goyal",
        profileName:      "Priyal Goyal",
        profilePhone:     "+91 7665941798",
        profileEmail:     "priyalgoyal1702@gmail.com",
        profileLinkedIn:  "linkedin.com/in/priyal--goyal/",
        profileLocation:  "Mumbai, India",
        profileTitle:     "Finance Professional | Credit Manager | Digital Lending",
        profileSummary:   "Finance professional with experience in digital lending, credit risk and product implementation within secured retail lending. Exposure to GenAI-based automation, SLOS integration, AI-driven workflow optimization. Skilled in FinnOne, SLOS, SFDC, FICO and Jocata.",
        keySkills:        "Digital Lending, Credit Risk Assessment, Product Implementation, GenAI Automation, Business Analysis, UAT Support, FinnOne, SLOS, SFDC, FICO, Jocata, Power BI, Advanced Excel",
        currentCompany:   "Tata Capital Limited",
        totalExp:         "2+ Years",
        relevantExp:      "2+ Years",
        noticePeriod:     "30 Days",
        currentLocation:  "Mumbai, India",
        preferredLocation:"PAN India",
        currentCTC:       "",
        expectedCTC:      "",
        resumePath:       require("path").join(__dirname, "Priyal_G_Resume.pdf"),
        resumeFileName:   "Priyal_Goyal_Resume.pdf",
      }}
    );
    res.json({ success: true, message: "Priyal profile initialized", modified: result.modifiedCount });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});


// ─── GET /api/auth/gmail-status — check if Gmail connected ───────────────────
app.get("/api/auth/gmail-status", requireAuth, async (req, res) => {
  const user = req.user;
  res.json({
    username:           user.username,
    hasRefreshToken:    !!(user.gmailRefreshToken),
    hasAccessToken:     !!(user.gmailAccessToken),
    gmailUser:          user.gmailUser || null,
    refreshTokenLength: user.gmailRefreshToken?.length || 0,
    connectUrl:         `/api/gmail/auth?username=${user.username}`,
  });
});

// ─── POST /api/auth/save-gmail-token — manually save token ───────────────────
app.post("/api/auth/save-gmail-token", requireAuth, async (req, res) => {
  const { refreshToken, gmailUser } = req.body;
  if (!refreshToken) return res.status(400).json({ success: false, message: "refreshToken required" });
  try {
    await User.updateOne(
      { _id: req.userId },
      { $set: { gmailRefreshToken: refreshToken, gmailUser: gmailUser || req.user.gmailUser || "" } }
    );
    res.json({ success: true, message: "Gmail token saved!" });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
});



// ─── DEBUG: Resume selection test ────────────────────────────────────────────
app.post("/api/debug/resume", requireAuth, async (req, res) => {
  const { templateType = "fullstack" } = req.body;
  const userCfg = getUserConfig(req.user);
  const user    = req.user;

  const isPriyalUser  = !!(userCfg?.profileName?.toLowerCase().includes("priyal") ||
                           user?.profileName?.toLowerCase().includes("priyal"));
  const priyalResPath = user?.resumePath || userCfg?.resumePath || "";

  let resumeName = "UNKNOWN";
  if (isPriyalUser && priyalResPath && fs.existsSync(priyalResPath)) {
    resumeName = "Priyal_Goyal_Resume.pdf";
  } else if (!isPriyalUser && templateType === "cti" && fs.existsSync(CTI_RESUME_PATH)) {
    resumeName = "Anav_Bansal_TelephonyExpert.pdf";
  } else if (!isPriyalUser && templateType === "crm" && fs.existsSync(CRM_RESUME_PATH)) {
    resumeName = "Anav_Bansal_CRMExpert.pdf";
  } else {
    resumeName = "Anav_Bansal_Resume.pdf (default)";
  }

  res.json({
    templateType,
    isPriyalUser,
    priyalResPath,
    ctiExists: fs.existsSync(CTI_RESUME_PATH),
    crmExists: fs.existsSync(CRM_RESUME_PATH),
    CTI_RESUME_PATH,
    CRM_RESUME_PATH,
    selectedResume: resumeName,
    userProfileName: userCfg?.profileName,
  });
});


// ─── GET /api/templates — get user's templates ───────────────────────────────
app.get("/api/templates", requireAuth, async (req, res) => {
  try {
    const templates = await EmailTemplate.find({ userId: req.userId }).sort({ createdAt: 1 });
    res.json({ success: true, templates });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/templates — create/update template ────────────────────────────
app.post("/api/templates", requireAuth, async (req, res) => {
  try {
    const { templateId, name, icon, accent, headerTheme, resumeUrl, resumeFileName,
            subject, customNote, intro, highlights, isDefault } = req.body;
    if (!templateId) return res.status(400).json({ success: false, message: "templateId required" });

    const tpl = await EmailTemplate.findOneAndUpdate(
      { userId: req.userId, templateId },
      { $set: { name, icon, accent, headerTheme, resumeUrl, resumeFileName,
                subject, customNote, intro, highlights: highlights || [], isDefault } },
      { upsert: true, new: true }
    );
    res.json({ success: true, template: tpl });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── DELETE /api/templates/:templateId — delete template ─────────────────────
app.delete("/api/templates/:templateId", requireAuth, async (req, res) => {
  try {
    await EmailTemplate.deleteOne({ userId: req.userId, templateId: req.params.templateId });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/templates/:templateId — get single template ────────────────────
app.get("/api/templates/:templateId", requireAuth, async (req, res) => {
  try {
    const tpl = await EmailTemplate.findOne({ userId: req.userId, templateId: req.params.templateId });
    res.json({ success: true, template: tpl || null });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});


// ─── GET /api/templates — get user's templates ───────────────────────────────
app.get("/api/templates", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).lean();
    res.json({ success: true, templates: user.userTemplates || [] });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/templates — save all templates ─────────────────────────────────
app.post("/api/templates", requireAuth, async (req, res) => {
  try {
    const { templates } = req.body;
    if (!Array.isArray(templates) || templates.length > 4)
      return res.status(400).json({ success: false, message: "Max 4 templates allowed" });
    await User.updateOne({ _id: req.userId }, { $set: { userTemplates: templates } });
    res.json({ success: true, message: "Templates saved" });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/templates/upload-resume — upload resume for a template ─────────
app.post("/api/templates/upload-resume", requireAuth, async (req, res) => {
  try {
    const multer = require("multer");
    const storage = multer.diskStorage({
      destination: __dirname,
      filename: (req, file, cb) => cb(null, `resume_${req.userId}_${Date.now()}.pdf`)
    });
    const upload = multer({ storage, limits: { fileSize: 5*1024*1024 },
      fileFilter: (req, file, cb) => cb(null, file.mimetype === "application/pdf")
    }).single("resume");

    upload(req, res, async (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      if (!req.file) return res.status(400).json({ success: false, message: "No PDF uploaded" });
      res.json({ success: true, path: req.file.path, filename: req.file.originalname });
    });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});



// ─── Send Welcome Email to new user ──────────────────────────────────────────
async function sendWelcomeEmail({ displayName, username, password, profileEmail, appUrl }) {
  try {
    const auth   = getGmailAPITransport();
    const gmail  = google.gmail({ version: "v1", auth });
    const from   = process.env.GMAIL_USER || "anavbansal06@gmail.com";
    const to     = profileEmail;
    if (!to) return;

    const subject = `Welcome to Job Mailer — Your Account is Ready! 🚀`;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:36px 40px;text-align:center;">
    <div style="font-size:40px;margin-bottom:12px;">🚀</div>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:800;">Welcome to Job Mailer!</h1>
    <p style="margin:8px 0 0;color:#93c5fd;font-size:14px;">Your Job Hunt Automation App</p>
  </div>

  <!-- Body -->
  <div style="padding:36px 40px;">
    <p style="color:#374151;font-size:15px;line-height:1.8;">Hi <strong>${displayName}</strong>,</p>
    <p style="color:#374151;font-size:14px;line-height:1.8;">
      Your account has been created successfully. Here are your login credentials:
    </p>

    <!-- Credentials Box -->
    <div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:10px;padding:20px 24px;margin:20px 0;">
      <p style="margin:0 0 8px;font-weight:700;color:#0c4a6e;font-size:13px;">🔐 Your Login Details</p>
      <table style="width:100%;font-size:14px;color:#374151;">
        <tr><td style="padding:4px 0;color:#6b7280;width:120px;">App URL:</td><td><a href="${appUrl}" style="color:#2563eb;font-weight:600;">${appUrl}</a></td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Username:</td><td><strong>${username}</strong></td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Password:</td><td><strong>${password}</strong></td></tr>
      </table>
    </div>

    <p style="color:#374151;font-size:14px;line-height:1.8;font-weight:700;margin-top:24px;">
      📋 Getting Started — 3 Simple Steps:
    </p>

    <!-- Step 1 -->
    <div style="display:flex;gap:14px;margin-bottom:16px;align-items:flex-start;">
      <div style="background:#2563eb;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;text-align:center;line-height:28px;">1</div>
      <div>
        <div style="font-weight:700;color:#1e3a5f;font-size:14px;margin-bottom:4px;">Login to the App</div>
        <div style="color:#6b7280;font-size:13px;line-height:1.7;">
          Open <a href="${appUrl}" style="color:#2563eb;">${appUrl}</a> and login with your credentials above.
          After login, go to <strong>Settings → Profile</strong> to update your details.
        </div>
      </div>
    </div>

    <!-- Step 2 -->
    <div style="display:flex;gap:14px;margin-bottom:16px;align-items:flex-start;">
      <div style="background:#059669;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;text-align:center;line-height:28px;">2</div>
      <div>
        <div style="font-weight:700;color:#1e3a5f;font-size:14px;margin-bottom:4px;">Connect Your Gmail 📧</div>
        <div style="color:#6b7280;font-size:13px;line-height:1.7;">
          This is the most important step — all your job application emails will be sent from YOUR Gmail.<br/><br/>
          Click this link to connect:<br/>
          <a href="${BASE_URL}/api/gmail/auth?username=${username}"
             style="display:inline-block;margin-top:8px;padding:8px 16px;background:#059669;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">
            🔗 Connect Gmail
          </a><br/><br/>
          <div style="margin-top:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;font-size:12px;color:#065f46;">
            <strong>Or copy this link:</strong><br/>
            <span style="word-break:break-all;color:#059669;">${BASE_URL}/api/gmail/auth?username=${username}</span>
          </div><br/>
          <span style="color:#9ca3af;font-size:12px;">
            ⚠️ Login with YOUR Gmail account. After clicking Allow, you'll see "Gmail Connected!" ✅
          </span>
        </div>
      </div>
    </div>

    <!-- Step 3 -->
    <div style="display:flex;gap:14px;margin-bottom:24px;align-items:flex-start;">
      <div style="background:#7c3aed;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;text-align:center;line-height:28px;">3</div>
      <div>
        <div style="font-weight:700;color:#1e3a5f;font-size:14px;margin-bottom:4px;">Update Your Profile & Send Applications 🎯</div>
        <div style="color:#6b7280;font-size:13px;line-height:1.7;">
          Go to <strong>Settings → Profile</strong> to fill in your details (name, skills, experience, CTC).<br/>
          Then go to <strong>Send Application</strong>, select a template, fill HR's email and send!<br/><br/>
          <strong>Features you can use:</strong>
          <ul style="margin:8px 0;padding-left:16px;color:#6b7280;font-size:13px;line-height:2;">
            <li>📤 <strong>Send Application</strong> — Email directly to HR</li>
            <li>📅 <strong>Schedule</strong> — Send later at a specific time</li>
            <li>🔁 <strong>Follow-up</strong> — Auto follow-up on unanswered emails</li>
            <li>📥 <strong>Inbox</strong> — See replies from HR</li>
            <li>🔗 <strong>Connections</strong> — LinkedIn outreach messages</li>
          </ul>
        </div>
      </div>
    </div>

    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px;font-size:12px;color:#713f12;">
      💡 <strong>Tip:</strong> Change your password after first login from Settings → Account tab.
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      Job Mailer — Built by Anav Bansal<br/>
      <a href="mailto:anavbansal06@gmail.com" style="color:#2563eb;">anavbansal06@gmail.com</a>
    </p>
  </div>
</div>
</body></html>`;

    const boundary = "wb_" + Date.now();
    const raw = [
      `From: "Job Mailer" <${from}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      ``,
      html,
      `--${boundary}--`,
    ].join("\r\n");

    const encoded = Buffer.from(raw).toString("base64url");
    await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });
    console.log(`✅ Welcome email sent to ${to}`);
  } catch(e) {
    console.error("Welcome email failed:", e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/users — list all users ────────────────────────────────────
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, {
      username:1, displayName:1, profileEmail:1, profilePhone:1,
      isAdmin:1, gmailUser:1, gmailRefreshToken:1, resumePath:1,
      createdAt:1, userTemplates:1, profileTitle:1, currentCompany:1,
    }).lean();
    res.json({ success: true, users: users.map(u => ({
      ...u,
      hasGmail: !!(u.gmailRefreshToken),
      hasResume: !!(u.resumePath),
    }))});
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/admin/users — create new user ─────────────────────────────────
app.post("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const { username, password, displayName, profileEmail, profilePhone,
            profileTitle, currentCompany, keySkills, totalExp, isAdmin = false } = req.body;

    if (!username || !password) return res.status(400).json({ success: false, message: "username and password required" });
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) return res.status(400).json({ success: false, message: "Username already exists" });

    const bcrypt      = require("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 10);
    const user   = new User({
      username: username.toLowerCase(),
      passwordHash, displayName, profileEmail, profilePhone,
      profileTitle, currentCompany, keySkills, totalExp,
      isAdmin,
    });
    await user.save();

    // Send welcome email
    const APP_URL = process.env.FRONTEND_URL || "https://emailsender-gl5q.vercel.app";
    if (profileEmail) {
      const BACKEND_URL = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://emailsender-v8a4.onrender.com";
      sendWelcomeEmail({
        displayName:  displayName || username,
        username:     username.toLowerCase(),
        password:     password,
        profileEmail,
        appUrl:       APP_URL,
        backendUrl:   BACKEND_URL,
      }).catch(e => console.error("Welcome email error:", e.message));
    }

    res.json({ success: true, message: "User created" + (profileEmail ? " — Welcome email sent!" : ""), userId: user._id });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── PATCH /api/admin/users/:id — update user ────────────────────────────────
app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const allowed = ["displayName","profileEmail","profilePhone","profileTitle",
                     "currentCompany","keySkills","totalExp","noticePeriod",
                     "currentCTC","expectedCTC","currentLocation","preferredLocation",
                     "isAdmin","resumePath","resumeFileName","profileLinkedIn",
                     "profileSummary","keySkills"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    await User.updateOne({ _id: req.params.id }, { $set: updates });
    res.json({ success: true, message: "User updated" });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── DELETE /api/admin/users/:id — delete user ───────────────────────────────
app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.username === (process.env.OWNER_USERNAME || "anav"))
      return res.status(400).json({ success: false, message: "Cannot delete owner" });
    await User.deleteOne({ _id: req.params.id });
    // Also delete their email logs
    await SentEmailLog.deleteMany({ userId: req.params.id });
    res.json({ success: true, message: "User deleted" });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/admin/users/:id/resume — upload resume for user ───────────────
app.post("/api/admin/users/:id/resume", requireAdmin, async (req, res) => {
  try {
    const multer  = require("multer");
    const storage = multer.diskStorage({
      destination: __dirname,
      filename: (req2, file, cb) => {
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        cb(null, safe);
      }
    });
    const upload = multer({ storage, limits: { fileSize: 10*1024*1024 },
      fileFilter: (r, f, cb) => cb(null, f.mimetype === "application/pdf")
    }).single("resume");

    upload(req, res, async (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      if (!req.file) return res.status(400).json({ success: false, message: "No PDF" });
      await User.updateOne({ _id: req.params.id }, { $set: {
        resumePath:     req.file.path,
        resumeFileName: req.file.originalname,
      }});
      res.json({ success: true, path: req.file.path, filename: req.file.originalname });
    });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/admin/stats — dashboard stats ───────────────────────────────────
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const totalUsers    = await User.countDocuments();
    const totalEmails   = await SentEmailLog.countDocuments();
    const todayEmails   = await SentEmailLog.countDocuments({
      sentAt: { $gte: new Date(Date.now() - 24*60*60*1000) }
    });
    const repliedEmails = await SentEmailLog.countDocuments({ replied: true });
    const users = await User.find({}, { username:1, displayName:1, gmailRefreshToken:1 }).lean();
    res.json({ success: true, stats: {
      totalUsers, totalEmails, todayEmails, repliedEmails,
      replyRate: totalEmails > 0 ? Math.round(repliedEmails/totalEmails*100) : 0,
      users: users.map(u => ({ username: u.username, displayName: u.displayName, hasGmail: !!u.gmailRefreshToken }))
    }});
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/admin/init — create separate admin account (one-time) ───────────
app.post("/api/admin/init", async (req, res) => {
  try {
    const { secret } = req.body;
    if (secret !== (process.env.JWT_SECRET || "emailsender_secret_2026"))
      return res.status(403).json({ success: false, message: "Forbidden" });

    const bcrypt = require("bcryptjs");

    // 1. Make owner (anav) also admin
    await User.updateOne(
      { username: process.env.OWNER_USERNAME || "anav" },
      { $set: { isAdmin: true } }
    );

    // 2. Create dedicated admin account if not exists
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "superadmin";
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@9911";
    const existing = await User.findOne({ username: ADMIN_USERNAME });
    if (!existing) {
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await User.create({
        username:     ADMIN_USERNAME,
        passwordHash,
        displayName:  "Super Admin",
        profileName:  "Super Admin",
        isAdmin:      true,
      });
    } else {
      await User.updateOne({ username: ADMIN_USERNAME }, { $set: { isAdmin: true } });
    }

    res.json({
      success: true,
      message:  "Admin initialized",
      adminUsername: ADMIN_USERNAME,
      adminPassword: existing ? "(unchanged — already exists)" : ADMIN_PASSWORD,
    });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

app.listen(PORT, () => console.log(`\n🚀 Job Mailer API → http://localhost:${PORT}\n`));
