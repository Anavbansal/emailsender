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
const MOHIT_RESUME_PATH = path.join(__dirname, "Mohit_Singh_CRMExpert_v3.pdf");
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
  status:        { type: String, default: "pending" },  // pending | held | failed
  emailData:     { type: mongoose.Schema.Types.Mixed },
  error:         { type: String },
  reminderSent:  { type: Boolean, default: false },     // for "held" jobs — reminder email already sent
  holdReason:    { type: String, default: "" },         // "manual" | "duplicate" — why a job is held
  userId:        { type: String, default: "default" },
}, { timestamps: true });

const ScheduledEmail = mongoose.models.ScheduledEmail ||
  mongoose.model("ScheduledEmail", ScheduledEmailSchema);

// ─── SentEmailLog — every email sent gets saved here ──────────────────────────
const SentEmailLogSchema = new mongoose.Schema({
  messageId:  { type: String },           // Gmail message ID
  threadId:   { type: String },           // Gmail thread ID (for reply threading)
  trackingId: { type: String },
  type:       { type: String, enum: ["application", "followup", "scheduled", "referral"], default: "application" },
  templateType: { type: String, default: "" },  // tracks which template (crm/cti/fullstack/formal) was used
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
  followupScheduled: { type: Boolean, default: false },
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

// ─── Interview Model (dedicated — not mixed into SentEmailLog) ───────────────
const InterviewSchema = new mongoose.Schema({
  userId:         { type: String, required: true },
  hrEmail:        { type: String, required: true },
  hrName:         { type: String, default: "" },
  company:        { type: String, default: "" },
  role:           { type: String, default: "" },
  stage:          { type: String, default: "Interview" },
  interviewRound: { type: String, default: "" },
  interviewDate:  { type: Date,   default: null },
  priority:       { type: String, default: "Normal" },
  callLog:        { type: String, default: "" },
  calendarEventId:{ type: String, default: "" },  // Google Calendar event ID once synced
}, { timestamps: true });
InterviewSchema.index({ userId: 1, hrEmail: 1 }, { unique: true });
const Interview = mongoose.model("Interview", InterviewSchema);

// ─── EmailTemplate Model ─────────────────────────────────────────────────────
const emailTemplateSchema = new mongoose.Schema({
  userId:      { type: String, required: true },
  templateId:  { type: String, required: true },
  name:        { type: String, default: "" },
  icon:        { type: String, default: "⚡" },
  accent:      { type: String, default: "#2563eb" },
  subject:     { type: String, default: "" },
  customNote:  { type: String, default: "" },
  intro:       { type: String, default: "" },
  highlights:  [{ type: String }],
  resumeType:  { type: String, default: "default" },
  resumeDriveUrl:   { type: String, default: "" },
  resumeUploadPath: { type: String, default: "" },
  resumeFileName:   { type: String, default: "" },
}, { timestamps: true });
emailTemplateSchema.index({ userId: 1, templateId: 1 }, { unique: true });
const EmailTemplate = mongoose.model("EmailTemplate", emailTemplateSchema);

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

// ── Sync interview to Google Calendar (best-effort, never blocks the response) ─
// ── Smart company name from email domain when company field is blank ──────────
function companyFromEmail(email = "", fallback = "your organization") {
  if (!email) return fallback;
  const domain = email.split("@")[1] || "";
  if (!domain) return fallback;
  // Strip common email service domains — not company names
  const genericDomains = ["gmail.com","yahoo.com","hotmail.com","outlook.com","rediffmail.com",
    "naukri.com","linkedin.com","jobstreet.com","indeed.com","shine.com","monsterindia.com"];
  if (genericDomains.includes(domain)) return fallback;
  // Extract company name from domain (strip .com/.in/.org etc., capitalize)
  const parts = domain.split(".");
  const name = parts[parts.length > 2 ? parts.length - 2 : 0];
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

async function syncInterviewToCalendar(user, interview) {
  try {
    if (!interview.interviewDate) return null;
    const auth = getUserGmailAuth(user);
    const calendar = google.calendar({ version: "v3", auth });

    const start = new Date(interview.interviewDate);
    const end   = new Date(start.getTime() + 60 * 60000); // 1 hour default
    const summary = `Interview: ${interview.company || "Company"}${interview.interviewRound ? " — " + interview.interviewRound : ""}`;
    const description = [
      interview.role ? `Role: ${interview.role}` : "",
      interview.hrEmail ? `Contact: ${interview.hrEmail}` : "",
      interview.callLog ? `Notes: ${interview.callLog}` : "",
    ].filter(Boolean).join("\n");

    const event = {
      summary, description,
      start: { dateTime: start.toISOString(), timeZone: "Asia/Kolkata" },
      end:   { dateTime: end.toISOString(),   timeZone: "Asia/Kolkata" },
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }, { method: "popup", minutes: 1440 }] },
    };

    if (interview.calendarEventId) {
      // Update existing event
      const res = await calendar.events.update({ calendarId: "primary", eventId: interview.calendarEventId, requestBody: event });
      return res.data.id;
    } else {
      const res = await calendar.events.insert({ calendarId: "primary", requestBody: event });
      return res.data.id;
    }
  } catch (e) {
    console.warn("⚠️ Calendar sync failed (non-critical):", e.message);
    return null;
  }
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
    noticePeriod:     user.noticePeriod     || (isOwner ? "Serving Notice Period" : ""),
    currentLocation:  user.currentLocation  || (isOwner ? "Faridabad, Haryana" : ""),
    preferredLocation:user.preferredLocation|| (isOwner ? "PAN India" : ""),
    totalExp:         user.totalExp         || (isOwner ? "4.8+ Years" : ""),
    relevantExp:         user.relevantExp         || (isOwner ? "4.8+ Years" : ""),
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
    resumeName = "Mohit_Singh_CRMExpert_v3.pdf";
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

async function updateJobStatus(jobId, status, error, holdReason) {
  if (mongoose.connection.readyState === 1) {
    await ScheduledEmail.updateOne({ jobId }, { status, ...(error !== undefined && { error }), ...(holdReason !== undefined && { holdReason }) });
  } else {
    const jobs = await loadScheduled();
    const j = jobs.find(x => x.jobId === jobId);
    if (j) { j.status = status; if (error !== undefined) j.error = error; if (holdReason !== undefined) j.holdReason = holdReason; }
    fs.writeFileSync(SCHEDULED_FILE, JSON.stringify(jobs, null, 2), "utf8");
  }
}

async function markJobReminderSent(jobId, value = true) {
  if (mongoose.connection.readyState === 1) {
    await ScheduledEmail.updateOne({ jobId }, { reminderSent: value });
  } else {
    const jobs = await loadScheduled();
    const j = jobs.find(x => x.jobId === jobId);
    if (j) j.reminderSent = value;
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


// ─── LinkedInStatus Model (stores sent/replied without needing Sheets) ───────
const linkedInStatusSchema = new mongoose.Schema({
  userId:    { type: String, required: true },
  rowIndex:  { type: String, required: true },
  sent:      { type: Boolean, default: false },
  replied:   { type: Boolean, default: false },
  ignored:   { type: Boolean, default: false },
}, { timestamps: true });
linkedInStatusSchema.index({ userId: 1, rowIndex: 1 }, { unique: true });
const LinkedInStatus = mongoose.model("LinkedInStatus", linkedInStatusSchema);

// ═══════════════════════════════════════════════════════════════════════════════
// GMAIL TOKEN HEALTH MONITORING
// ═══════════════════════════════════════════════════════════════════════════════
const ALERT_FILE = path.join(__dirname, "gmail-alerts.json");

function loadAlerts() {
  try { return JSON.parse(fs.readFileSync(ALERT_FILE, "utf8")); } catch { return {}; }
}
function saveAlerts(alerts) {
  fs.writeFileSync(ALERT_FILE, JSON.stringify(alerts, null, 2), "utf8");
}

// Send an alert email using a DIFFERENT auth path (raw fetch to a backup, or console+DB flag)
// Since the user's own Gmail might be broken, we store the alert in DB/file and show it
// prominently in the dashboard. We also attempt a best-effort email via any working account.
async function recordGmailFailure(username, errorMessage) {
  const alerts = loadAlerts();
  const key = username;
  const prevCount = alerts[key]?.count || 0;

  alerts[key] = {
    username,
    error: errorMessage,
    lastFailedAt: new Date().toISOString(),
    count: prevCount + 1,
    acknowledged: false,
  };
  saveAlerts(alerts);

  // Try to notify via any OTHER connected user's Gmail (in case this user's token is dead)
  if (errorMessage.includes("invalid_grant") || errorMessage.includes("invalid_rapt")) {
    try {
      const otherUsers = await User.find({
        username: { $ne: username },
        gmailRefreshToken: { $exists: true, $ne: null },
      }).lean();

      for (const altUser of otherUsers) {
        try {
          const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI
          );
          oauth2Client.setCredentials({ refresh_token: altUser.gmailRefreshToken });
          const gmail = google.gmail({ version: "v1", auth: oauth2Client });

          const notifyEmail = process.env.OWNER_NOTIFY_EMAIL || "anavbansal06@gmail.com";
          const subject = `=?UTF-8?B?${Buffer.from(`⚠️ Gmail Token Expired — ${username}`).toString("base64")}?=`;
          const html = `<div style="font-family:sans-serif;max-width:500px;margin:20px auto;border:2px solid #fee2e2;border-radius:12px;overflow:hidden;">
            <div style="background:#dc2626;color:#fff;padding:16px 24px;font-weight:700;font-size:16px;">⚠️ Gmail Connection Lost</div>
            <div style="padding:20px 24px;color:#374151;font-size:14px;line-height:1.7;">
              <p><strong>User:</strong> ${username}</p>
              <p><strong>Error:</strong> ${errorMessage}</p>
              <p><strong>Time:</strong> ${new Date().toLocaleString("en-IN")}</p>
              <p style="margin-top:16px;">Scheduled emails for this user will FAIL until reconnected.</p>
              <a href="${BASE_URL}/api/gmail/auth?username=${username}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">🔗 Reconnect Now</a>
            </div>
          </div>`;
          const raw = [
            `From: "Job Mailer Alert" <${altUser.gmailUser || "anavbansal06@gmail.com"}>`,
            `To: ${notifyEmail}`, `Subject: ${subject}`, `MIME-Version: 1.0`,
            `Content-Type: text/html; charset="UTF-8"`, ``, html,
          ].join("\r\n");
          await gmail.users.messages.send({ userId:"me", requestBody:{ raw: Buffer.from(raw).toString("base64url") }});
          console.log(`✅ Alert email sent via ${altUser.username}'s Gmail`);
          break; // success, stop trying other accounts
        } catch (innerErr) {
          continue; // try next user
        }
      }
    } catch(e) {
      console.error("Could not send alert email:", e.message);
    }
  }
}

async function clearGmailAlert(username) {
  const alerts = loadAlerts();
  if (alerts[username]) {
    delete alerts[username];
    saveAlerts(alerts);
  }
}

// ── Notify user by email when a scheduled job fires (success or failure) ──────
// ── Notify user that a HELD job's time has arrived — they need to send manually ──
// ── Notify user that a scheduled job was auto-held due to a detected duplicate ─
async function notifyDuplicateHold(jobUser, jobUserCfg, job, existing) {
  try {
    if (!jobUser) return;
    const auth = getUserGmailAuth(jobUser);
    const gmail = google.gmail({ version: "v1", auth });
    const senderEmail = jobUserCfg?.gmailUser || jobUser.gmailUser || "";
    const subject = `⏸ Scheduled email paused — already applied to ${job.emailData.company || job.emailData.hrEmail}`;
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
    const html = `<div style="font-family:Segoe UI,sans-serif;max-width:480px;margin:20px auto;border:1px solid #fde047;border-radius:12px;overflow:hidden;">
      <div style="background:#d97706;color:#fff;padding:16px 24px;font-weight:700;font-size:15px;">⏸ Scheduled email paused — duplicate detected</div>
      <div style="padding:20px 24px;color:#374151;font-size:14px;line-height:1.7;">
        <p>This email was about to be auto-sent, but you already applied to this contact on <strong>${new Date(existing.sentAt).toLocaleString("en-IN")}</strong>, so it was <strong>not sent automatically</strong>.</p>
        <p><strong>Company:</strong> ${job.emailData.company || "—"}</p>
        <p><strong>To:</strong> ${job.emailData.hrEmail}</p>
        <p><strong>Role:</strong> ${job.emailData.role || "—"}</p>
        <p style="margin-top:16px;">If you still want to send it (e.g. different role, follow-up reason), open the app's <strong>Scheduled → Reminders</strong> tab and tap <strong>Send Now</strong>. Otherwise you can safely delete it.</p>
      </div>
    </div>`;
    const raw = [
      `From: "Job Mailer" <${senderEmail}>`, `To: ${senderEmail}`,
      `Subject: ${encodedSubject}`, `MIME-Version: 1.0`,
      `Content-Type: text/html; charset="UTF-8"`, ``, html,
    ].join("\r\n");
    await gmail.users.messages.send({ userId: "me", requestBody: { raw: Buffer.from(raw).toString("base64url") } });
  } catch (e) {
    console.warn("⚠️ Duplicate-hold notification failed (non-critical):", e.message);
  }
}

async function notifyHeldReminder(jobUser, jobUserCfg, job) {
  try {
    if (!jobUser) return;
    const auth = getUserGmailAuth(jobUser);
    const gmail = google.gmail({ version: "v1", auth });
    const senderEmail = jobUserCfg?.gmailUser || jobUser.gmailUser || "";
    const subject = `🔔 Reminder — send application to ${job.emailData.company || job.emailData.hrEmail}`;
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
    const html = `<div style="font-family:Segoe UI,sans-serif;max-width:480px;margin:20px auto;border:1px solid #fde047;border-radius:12px;overflow:hidden;">
      <div style="background:#d97706;color:#fff;padding:16px 24px;font-weight:700;font-size:15px;">🔔 Time to send this application</div>
      <div style="padding:20px 24px;color:#374151;font-size:14px;line-height:1.7;">
        <p><strong>Company:</strong> ${job.emailData.company || "—"}</p>
        <p><strong>To:</strong> ${job.emailData.hrEmail}</p>
        <p><strong>Role:</strong> ${job.emailData.role || "—"}</p>
        <p>You set this as a manual reminder — it has <strong>not</strong> been sent automatically. Open the app's Scheduled page and tap <strong>Send Now</strong> when you're ready.</p>
      </div>
    </div>`;
    const raw = [
      `From: "Job Mailer" <${senderEmail}>`, `To: ${senderEmail}`,
      `Subject: ${encodedSubject}`, `MIME-Version: 1.0`,
      `Content-Type: text/html; charset="UTF-8"`, ``, html,
    ].join("\r\n");
    await gmail.users.messages.send({ userId: "me", requestBody: { raw: Buffer.from(raw).toString("base64url") } });
  } catch (e) {
    console.warn("⚠️ Held reminder email failed (non-critical):", e.message);
  }
}

async function notifyScheduledResult(jobUser, jobUserCfg, job, status, detail) {
  try {
    if (!jobUser) return;
    const auth = getUserGmailAuth(jobUser);
    const gmail = google.gmail({ version: "v1", auth });
    const senderEmail = jobUserCfg?.gmailUser || jobUser.gmailUser || "";
    const isSuccess = status === "sent";
    const subject = isSuccess
      ? `✅ Scheduled email sent — ${job.emailData.company || job.emailData.hrEmail}`
      : `⚠️ Scheduled email failed — ${job.emailData.company || job.emailData.hrEmail}`;
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
    const html = `<div style="font-family:Segoe UI,sans-serif;max-width:480px;margin:20px auto;border:1px solid ${isSuccess?"#bbf7d0":"#fecaca"};border-radius:12px;overflow:hidden;">
      <div style="background:${isSuccess?"#059669":"#dc2626"};color:#fff;padding:16px 24px;font-weight:700;font-size:15px;">
        ${isSuccess ? "✅ Scheduled Email Sent" : "⚠️ Scheduled Email Failed"}
      </div>
      <div style="padding:20px 24px;color:#374151;font-size:14px;line-height:1.7;">
        <p><strong>Company:</strong> ${job.emailData.company || "—"}</p>
        <p><strong>To:</strong> ${job.emailData.hrEmail}</p>
        <p><strong>Scheduled for:</strong> ${new Date(job.scheduledTime).toLocaleString("en-IN")}</p>
        ${isSuccess
          ? `<p style="color:#059669;">Email was sent automatically as scheduled.</p>`
          : `<p style="color:#dc2626;"><strong>Error:</strong> ${detail}</p><p>Go to the Scheduled page in the app to retry manually.</p>`
        }
      </div>
    </div>`;
    const raw = [
      `From: "Job Mailer" <${senderEmail}>`, `To: ${senderEmail}`,
      `Subject: ${encodedSubject}`, `MIME-Version: 1.0`,
      `Content-Type: text/html; charset="UTF-8"`, ``, html,
    ].join("\r\n");
    await gmail.users.messages.send({ userId: "me", requestBody: { raw: Buffer.from(raw).toString("base64url") } });
  } catch (e) {
    console.warn("⚠️ Scheduled notification email failed (non-critical):", e.message);
  }
}

cron.schedule("* * * * *", async () => {
  const jobs = await loadScheduled();
  const now  = Date.now();
  for (const job of jobs) {
    if (job.status === "held" && parseScheduledTime(job.scheduledTime) <= now && !job.reminderSent) {
      // Held jobs: just send a reminder email — don't auto-send
      let holdUser = null, holdCfg = null;
      try {
        if (job.userId && job.userId !== "default" && mongoose.connection.readyState === 1) {
          holdUser = await User.findById(job.userId).lean().catch(() => null);
          if (holdUser) holdCfg = getUserConfig(holdUser);
        }
        if (!holdUser) holdUser = await User.findOne({ username: process.env.OWNER_USERNAME || "anav" }).lean().catch(() => null);
        await notifyHeldReminder(holdUser, holdCfg, job);
        await markJobReminderSent(job.jobId);
      } catch(e) { console.warn("Held reminder failed:", e.message); }
      continue;
    }
    if (job.status === "pending" && parseScheduledTime(job.scheduledTime) <= now) {
      let jobUser = null, jobUserCfg = null;
      try {
        // Fetch the user who scheduled this email — so we use THEIR Gmail
        if (job.userId && job.userId !== "default" && mongoose.connection.readyState === 1) {
          jobUser = await User.findById(job.userId).lean().catch(() => null);
          if (jobUser) jobUserCfg = getUserConfig(jobUser);
        }
        if (!jobUser) {
          jobUser = await User.findOne({ username: process.env.OWNER_USERNAME || "anav" }).lean().catch(() => null);
          if (jobUser) jobUserCfg = getUserConfig(jobUser);
        }

        // ── Duplicate check right before auto-sending ──────────────────────
        // If this hrEmail was already applied to since this job was scheduled,
        // DON'T auto-send — instead hold the job and notify the user so they
        // can review and send manually if they still want to.
        if (mongoose.connection.readyState === 1 && job.emailData?.hrEmail) {
          const escapedDup = job.emailData.hrEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const existing = await SentEmailLog.findOne({
            hrEmail: new RegExp("^" + escapedDup + "$", "i"),
            userId: job.userId && job.userId !== "default" ? job.userId : (jobUser?._id ? String(jobUser._id) : undefined),
            type: "application",
          }).sort({ sentAt: -1 }).lean();

          if (existing) {
            await updateJobStatus(job.jobId, "held", null, "duplicate");
            await markJobReminderSent(job.jobId, true); // already notified via notifyDuplicateHold below — don't double-notify
            await notifyDuplicateHold(jobUser, jobUserCfg, job, existing);
            continue;
          }
        }

        const { info, trackRecord } = await sendApplicationEmail({
          ...job.emailData, user: jobUser, userCfg: jobUserCfg,
        });
        logToSheets([
          info.id, job.emailData.hrEmail, job.emailData.company || "", job.emailData.role || "",
          new Date().toISOString(), trackRecord.trackingId, "Scheduled-Sent", "",
        ]);
        await saveSentEmail({
          messageId: info.id, threadId: info.threadId || null, trackingId: trackRecord.trackingId,
          type: "scheduled", hrEmail: job.emailData.hrEmail, hrName: job.emailData.hrName||"",
          company: job.emailData.company||"", role: job.emailData.role||"",
          subject: trackRecord.subject, sentAt: new Date(),
        });
        await deleteJob(job.jobId);
        // ✅ Auto-sent silently — no email notification for successful sends
        console.log(`✅ Scheduled email sent to ${job.emailData?.hrEmail} (${job.emailData?.company})`);
      } catch (e) {
        await updateJobStatus(job.jobId, "failed", e.message);
        const failedUsername = jobUser?.username || "unknown";
        await recordGmailFailure(failedUsername, e.message);
        // ⚠️ Notify ONLY on failure — user needs to know so they can retry
        notifyScheduledResult(jobUser, jobUserCfg, job, "failed", e.message).catch(() => {});
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
  "4.8+ years · Node.js, AngularJS, Express.js, REST APIs, AWS Lambda, DynamoDB/MySQL",
  "Serverless Architecture: AWS Lambda · DynamoDB · S3 · Amazon Connect · Render · Vercel",
  "10+ enterprise CTI integrations (Avaya, Genesys, Webex, Zoom, Amazon Connect)",
  "CRM: ServiceNow, Salesforce, Freshdesk, MS Dynamics, CDK Global, COX Automotive",
  "AI-assisted development: Claude, GitHub Copilot, ChatGPT",
];
const CTI_HIGHLIGHTS = [
  "4.8+ years · CTI/Telephony Integration Specialist",
  "Avaya (AACC, AES, IPO) · Genesys · Webex · Zoom · Amazon Connect",
  "10+ enterprise CTI integrations delivered end-to-end",
  "CRM: ServiceNow, Salesforce, Freshdesk, Zendesk, CDK Global",
  "AWS Lambda · DynamoDB · IVR/ACD Design · Chatbot Development",
];
const CRM_HIGHLIGHTS = [
  "4.8+ years · Senior CRM Integration Expert",
  "ServiceNow: ITSM · HRSD · CSM · Flow Designer · IntegrationHub · Virtual Agent · Scripted REST APIs · Marketplace Listing",
  "Freshdesk (FDK, Marketplace Apps, CTI API) · Salesforce Open CTI · Zendesk Apps Framework · MS Dynamics 365",
  "3 published enterprise marketplace apps: ServiceNow Store · Freshdesk · Webex App Hub",
  "CTI Screen Pop · Click-to-Dial · Real-Time Ticket Automation · CRM-Telephony Sync",
];

// ─── Core send helper ─────────────────────────────────────────────────────────
async function sendApplicationEmail({
  hrEmail, hrName = "", company, role, customNote,
  templateType = "fullstack", readReceipt = false,
  customIntro = "", customHighlights = null, headerTheme = "blue",
  userCfg = null, user = null,
}) {
  // If company is blank, try to derive it from the HR email domain
  if (!company && hrEmail) company = companyFromEmail(hrEmail, "");
  const userName = userCfg?.profileName || "Anav Bansal";
  const companyStr = company ? ` at ${company}` : "";
  const subject = role
    ? `Application for ${role} Position${companyStr} — ${userName}`
    : templateType === "crm"
      ? `Job Application — ${userName} (Senior CRM & ServiceNow Expert)${companyStr}`
      : `Job Application — ${userName}${companyStr}`;

  const trackRecord = createTrackingRecord({ hrEmail, hrName, company, role, subject, type: "application" });
  const trackUrl    = `${BASE_URL}/api/track/${trackRecord.trackingId}`;
  const tplOpts     = { hrName, company, role, customNote, trackUrl, customIntro, customHighlights, headerTheme };

  let html;
  const isPriyal = !!(userCfg?.profileName?.toLowerCase().includes("priyal") || user?.profileName?.toLowerCase().includes("priyal"));
  const isMohit  = !!(userCfg?.profileName?.toLowerCase().includes("mohit")  || user?.profileName?.toLowerCase().includes("mohit"));

  // Built-in hardcoded templates ALWAYS take priority for Anav/Mohit/Priyal —
  // their professional templates are curated and should not be overridden by
  // half-edited DB templates from the Settings page editor.
  const isBuiltInUser = isMohit || isPriyal ||
    (userCfg?.profileName?.toLowerCase().includes("anav") || user?.profileName?.toLowerCase().includes("anav"));

  // Check if user has a custom DB template (only applies to NON built-in users)
  let dbTemplate = null;
  if (!isBuiltInUser && mongoose.connection.readyState === 1 && user?._id) {
    dbTemplate = await EmailTemplate.findOne({ userId: String(user._id), templateId: templateType }).lean();
  }

  // Fetch user's permanent template overrides (intro/highlights saved via Settings)
  let userOverride = null;
  if (mongoose.connection.readyState === 1 && user?._id) {
    userOverride = await EmailTemplate.findOne({
      userId: String(user._id), templateId: templateType, isOverride: true
    }).lean().catch(() => null);
  }
  // Merge override into tplOpts (only overrides what user actually customized)
  if (userOverride) {
    if (userOverride.intro)      tplOpts.customIntro      = userOverride.intro;
    if (userOverride.highlights?.length) tplOpts.customHighlights = userOverride.highlights;
    if (userOverride.customNote) tplOpts.customNote       = tplOpts.customNote || userOverride.customNote;
  }

  if (isMohit) {
    html = buildMohitHTML({ ...tplOpts, templateType });
  } else if (isPriyal) {
    html = buildPriyalHTML({ ...tplOpts, templateType });
  } else if (isBuiltInUser) {
    // Anav — built-in templates with optional user overrides merged in
    if (templateType === "cti")         html = buildCTIHTML(tplOpts);
    else if (templateType === "formal") html = buildFormalHTML(tplOpts);
    else if (templateType === "crm")    html = buildCRMHTML(tplOpts);
    else                                html = buildFullstackHTML(tplOpts);
  } else if (dbTemplate) {
    // Custom users (newly added team members) — use their DB-configured template
    html = buildDynamicHTML({ ...tplOpts, dbTemplate, userName: userCfg?.profileName || user?.displayName || "Candidate" });
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
    resolvedResume = { filename: "Mohit_Singh_CRMExpert_v3.pdf", path: MOHIT_RESUME_PATH, contentType: "application/pdf" };
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
    subject: trackRecord.subject, sentAt: new Date(), templateType: templateType || "fullstack",
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

// resumeBox removed — resume attached directly


// ─── HTML: CRM Expert ─────────────────────────────────────────────────────────
function buildCRMHTML({ hrName, company, role, customNote, trackUrl = "", customIntro = "", customHighlights = null, headerTheme = "teal" }) {
  const gradient  = HEADER_THEMES[headerTheme] || HEADER_THEMES.teal;
  const greeting  = hrName ? `Dear ${hrName},` : "Dear Hiring Manager,";
  const roleText  = role   ? ` for the <strong>${role}</strong> position` : "";
  const noteBlock = customNote ? `<p style="color:#374151;line-height:1.8;margin:16px 0;">${customNote}</p>` : "";
  const pixel     = trackUrl   ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt=""/>` : "";
  const intro     = customIntro ||
    `I am writing to express my strong interest in joining <strong>${company||"your organization"}</strong>${roleText}.
     With <strong>4.8+ years as a CRM Integration Expert</strong>, I specialize in <strong>ServiceNow platform development</strong>
     (ITSM, HRSD, CSM, Flow Designer, IntegrationHub, Virtual Agent, Scripted REST APIs, Marketplace Listing) and
     <strong>CTI integrations</strong> across Freshdesk, Salesforce, Zendesk, and MS Dynamics —
     delivering enterprise-grade solutions that automate ticket workflows, enable real-time telephony-to-CRM sync,
     and measurably reduce agent handle time. I am currently serving my notice period at NovelVox and am available to join by late August 2026 or earlier for the right opportunity.`;
  const items     = (customHighlights && customHighlights.length) ? customHighlights : CRM_HIGHLIGHTS;
  const hlHtml    = items.map(h => `<li>${h}</li>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:${gradient};padding:36px 40px;">
    <p style="margin:0 0 6px;color:#99f6e4;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Senior CRM Integration Expert</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Anav Bansal</h1>
    <p style="margin:6px 0 0;color:#99f6e4;font-size:14px;">ServiceNow (ITSM · HRSD · CSM) · Freshdesk · Salesforce · Zendesk · MS Dynamics</p>
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
    <p style="color:#374151;line-height:1.8;margin:0;">Thank you for your time and consideration. I would love the opportunity to discuss how I can bring this expertise to your team.</p>
  </div>
  ${footer("#0d9488")}
</div>${pixel}</body></html>`;
}




// ─── HTML: Dynamic DB Template ───────────────────────────────────────────────
function buildDynamicHTML({ hrName, company, role, customNote, trackUrl = "", dbTemplate, userName = "Anav Bansal" }) {
  const greeting   = hrName ? `Dear ${hrName},` : "Dear Hiring Manager,";
  const co         = company||"your organization";
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
function buildMohitHTML({ hrName, company, role, customNote, trackUrl = "", templateType = "crm" }) {
  const greeting  = hrName ? `Dear ${hrName},` : "Dear Hiring Manager,";
  const roleText  = role   ? ` for the <strong>${role}</strong> position` : "";
  const noteBlock = customNote ? `<p style="color:#374151;line-height:1.8;margin:16px 0;">${customNote}</p>` : "";
  const pixel     = trackUrl  ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt=""/>` : "";

  // Template-specific content (intro + highlights — no repetition)
  const templates = {
    crm: {
      intro: `I am writing to express my strong interest in joining <strong>${company||"your organization"}</strong>${roleText}. With <b>4.8+ years</b> specializing in <b>CRM & CTI integrations</b> across MS Dynamics 365, ServiceNow, Salesforce, HubSpot, and Cisco Finesse, I have delivered 7+ enterprise solutions for Fortune 500 clients — resolving critical P1/P2 incidents and leading end-to-end projects from requirement gathering to production support.`,
      highlights: [
        "7+ Enterprise CRM Integrations — MS Dynamics 365, ServiceNow, Salesforce, HubSpot, Zoho CRM, Cisco Finesse",
        "Key Clients: Bank Albilad, J&K Bank (Salesforce + Cisco Finesse), Misr Digital Innovation, Deliverect",
        "P1/P2 Incident Management · Root Cause Analysis · Technical Mentoring · Client Stakeholder Management",
        "8 'Pat on the Back' Awards + Performance of the Year — NovelVox PVT Ltd",
        "Cloud & Infra: AWS S3, CloudFront, Apache Reverse Proxy, Tomcat Clustering, CI/CD, Git",
      ]
    },
    backend: {
      intro: `I am writing to express my strong interest in joining <strong>${company||"your organization"}</strong>${roleText}. With <b>4.8+ years</b> as a Senior Backend Developer, I specialize in <b>Java, Spring Boot, Node.js, Microservices, REST APIs, and Webhook-driven architectures</b> — delivering scalable, high-availability backend solutions across banking and enterprise contact center domains.`,
      highlights: [
        "Backend Stack: Java, Spring Boot, Node.js, Express.js, REST APIs, Webhook Architecture, Microservices",
        "Databases: MySQL, SQL, Hibernate JPA, Query Optimization, Cisco UCCE Data Integration",
        "High-Availability Deployments: Apache Reverse Proxy + Tomcat Clustering for Bank Albilad (banking ops)",
        "Cloud: AWS S3, CloudFront, Azure — serverless and containerized architectures",
        "8 'Pat on the Back' Awards + Performance of the Year — NovelVox PVT Ltd",
      ]
    },
    java: {
      intro: `I am applying${roleText} at <strong>${company||"your organization"}</strong>. As a Senior Java Developer with <b>4.8+ years</b> in <b>Spring Boot, Microservices, REST APIs, SQL, Apache Tomcat</b>, and Apache HTTP Server, I have owned full project lifecycles — including high-availability deployments for Bank Albilad and J&K Bank using clustering and reverse proxy configurations.`,
      highlights: [
        "Java · Spring Boot · Microservices · REST APIs · Hibernate JPA · SQL · Apache Tomcat",
        "Delivered Bank Albilad CTI-CRM (MS Dynamics 365 + ServiceNow) — 15 months, production-grade",
        "Delivered Misr Digital Innovation CTI-CRM (MS Dynamics 365) — 14 months, Java/Spring Boot stack",
        "High-Availability Architecture: Apache Reverse Proxy + Tomcat Clustering for banking operations",
        "8 'Pat on the Back' Awards + Performance of the Year — NovelVox PVT Ltd",
      ]
    },
    formal: {
      intro: `I am respectfully submitting my application${roleText} at <strong>${company||"your organization"}</strong>. With 4.8+ years of enterprise software development experience — spanning CRM integrations, backend engineering, and contact center solutions across banking and Fortune 500 clients — I am confident my background aligns strongly with your requirements.`,
      highlights: [
        "4.8+ Years · Senior Software Developer · CRM & CTI Integration Specialist",
        "7+ Enterprise Integrations: MS Dynamics 365, ServiceNow, Salesforce, HubSpot, Zoho CRM",
        "Key Clients: Bank Albilad, J&K Bank, Misr Digital Innovation, Deliverect, iLearna",
        "8 'Pat on the Back' Awards + Performance of the Year — NovelVox PVT Ltd",
        "Languages & Tools: Java, Spring Boot, Node.js, REST APIs, MySQL, Git, CI/CD, Agile",
      ]
    },
  };

  const tpl = templates[templateType] || templates.crm;
  const highlights = tpl.highlights.map(h => `<li>${h}</li>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e3a5f,#1d4ed8);padding:36px 40px;">
    <p style="margin:0 0 4px;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;">Senior Software Developer · CRM & CTI Integration Specialist</p>
    <h1 style="margin:0 0 6px;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Mohit Singh</h1>
    <p style="margin:0;color:#bfdbfe;font-size:12.5px;line-height:1.6;">Java · Spring Boot · Node.js · ServiceNow · MS Dynamics 365 · Salesforce · HubSpot · Cisco Finesse</p>
  </div>

  <!-- Body -->
  <div style="padding:32px 40px;">

    <p style="color:#374151;line-height:1.8;margin:0 0 14px;font-size:14px;">${greeting}</p>
    <p style="color:#374151;line-height:1.8;margin:0 0 18px;font-size:14px;">${tpl.intro}</p>

    ${noteBlock}

    <!-- Highlights -->
    <div style="background:#f0f6ff;border-left:4px solid #1d4ed8;border-radius:0 10px 10px 0;padding:18px 24px;margin-bottom:22px;">
      <p style="margin:0 0 10px;font-weight:700;color:#1e3a5f;font-size:13px;letter-spacing:0.3px;">🏆 KEY HIGHLIGHTS</p>
      <ul style="margin:0;padding-left:18px;color:#1e293b;font-size:13.5px;line-height:1.9;">${highlights}</ul>
    </div>

    <!-- Resume attached -->
    <div style="background:#f8faff;border:1px solid #c7d7f9;border-radius:10px;padding:14px 20px;margin-bottom:22px;display:flex;align-items:center;gap:14px;">
      <span style="font-size:22px;">📎</span>
      <div>
        <p style="margin:0 0 2px;font-weight:700;color:#1e3a5f;font-size:13px;">Resume Attached</p>
        <p style="margin:0;font-size:12px;color:#2563eb;">Mohit_Singh_CRMExpert_v3.pdf</p>
      </div>
    </div>

    <p style="color:#374151;line-height:1.8;margin:0;font-size:14px;">Thank you for your time. I would welcome the opportunity to discuss how my background can contribute to <strong>${company||"your team"}</strong>'s goals.</p>

  </div>

  <!-- Footer -->
  <div style="background:#f1f5f9;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:12px;color:#64748b;line-height:1.8;">
      <strong style="color:#1e3a5f;">Mohit Singh</strong> &nbsp;·&nbsp;
      <a href="mailto:mohit310ggn@gmail.com" style="color:#1d4ed8;text-decoration:none;">mohit310ggn@gmail.com</a> &nbsp;·&nbsp;
      <a href="tel:+917982092042" style="color:#1d4ed8;text-decoration:none;">+91 7982092042</a> &nbsp;·&nbsp;
      Gurugram, Haryana
    </p>
  </div>

</div>${pixel}</body></html>`;
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
     With <strong>4.8+ years of hands-on experience</strong> as a Senior Full-Stack Developer, I have architected and
     shipped production-grade applications across Node.js, AngularJS, Express.js, REST APIs, AWS Lambda, and DynamoDB/MySQL — with deep expertise
     in CTI/Telephony integrations for enterprise platforms. I am currently serving my notice period with a 4.8-year tenure at NovelVox, and am available to join by late August 2026 or earlier for the right opportunity.`;
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
     With <strong>4.8+ years specializing in CTI/Telephony integrations</strong>, I have architected enterprise-grade solutions
     across Avaya AACC, Avaya AES, Genesys, Webex Contact Center, Zoom, and Amazon Connect — enabling seamless agent workflows,
     real-time call controls, screen popups, and CRM synchronization at scale. I am currently serving my notice period with a 4.8-year tenure at NovelVox, and am available to join by late August 2026 or earlier for the right opportunity.`;
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
     I am a Senior Software Developer with <strong>4.8+ years of professional experience</strong> in full-stack development,
     cloud architecture, and enterprise system integrations. I am currently serving my notice period with a 4.8-year tenure at NovelVox, and am available to join by late August 2026 or earlier for the right opportunity.`;
  const items  = (customHighlights && customHighlights.length) ? customHighlights : DEFAULT_HIGHLIGHTS;
  const hlHtml = items.map(h => `<li>${h}</li>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:${gradient};padding:36px 40px;">
    <p style="margin:0 0 6px;color:#bfdbfe;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Senior Software Developer</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Anav Bansal</h1>
    <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px;">B.Tech Computer Science · 4.8+ Years Experience</p>
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
    <p style="color:#374151;line-height:1.8;margin:0;">Thank you for your time and consideration.</p>
  </div>
  ${footer("#1d4ed8")}
</div>${pixel}</body></html>`;
}

// ─── HTML: Follow-up ──────────────────────────────────────────────────────────
function buildFollowUpHTML({ hrName, company, role, originalDate, customNote, trackUrl = "", userCfg = null, templateType = "fullstack" }) {
  const greeting  = hrName ? `Dear ${hrName},` : "Dear Hiring Manager,";
  const roleText  = role   ? ` for the <strong>${role}</strong> role` : "";
  const dateText  = originalDate ? ` on <strong>${originalDate}</strong>` : " recently";
  const noteBlock = customNote ? `<p style="color:#374151;line-height:1.8;margin:16px 0;">${customNote}</p>` : "";
  const pixel     = trackUrl   ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt=""/>` : "";

  const isPriyal  = userCfg?.profileName?.toLowerCase().includes("priyal");
  const isMohit   = userCfg?.profileName?.toLowerCase().includes("mohit");
  const senderName  = userCfg?.profileName  || "Anav Bansal";

  // Theme + title + resume note vary by templateType — matches the original application
  const THEMES = {
    crm:       { gradient: "#0d4f3c 0%,#0d9488 100%",  accent: "#0d9488", title: "Senior CRM & ServiceNow Expert · Follow-Up",      resumeName: "Anav_Bansal_CRMExpert.pdf" },
    cti:       { gradient: "#3b0764 0%,#7c3aed 100%",  accent: "#7c3aed", title: "CTI/Telephony Integration Specialist · Follow-Up", resumeName: "Anav_Bansal_TelephonyExpert.pdf" },
    formal:    { gradient: "#1e3a8a 0%,#1d4ed8 100%",  accent: "#1d4ed8", title: "Senior Software Developer · Follow-Up",           resumeName: "Anav_Bansal_Resume.pdf" },
    fullstack: { gradient: "#064e3b 0%,#059669 100%",  accent: "#059669", title: "Senior Full Stack Developer · Follow-Up",         resumeName: "Anav_Bansal_Resume.pdf" },
  };

  let theme = THEMES[templateType] || THEMES.fullstack;
  let senderTitle = theme.title;
  let bodyText = `I remain very enthusiastic and confident that my <strong>4.8+ years of experience</strong> in full-stack development, Node.js, AWS serverless architectures, and enterprise CTI/Telephony integrations would be a strong fit for your team. I am currently in my notice period and available to join by late August 2026.`;
  let resumeNote = theme.resumeName;

  if (isMohit) {
    theme = { gradient: "#1e3a5f 0%,#1d4ed8 100%", accent: "#1d4ed8" };
    senderTitle = "Senior Software Developer · CRM & CTI Integration Specialist · Follow-Up";
    bodyText = `I remain very enthusiastic about this opportunity and confident that my <strong>4.8+ years</strong> in CRM & CTI integrations across MS Dynamics 365, ServiceNow, Salesforce, and Cisco Finesse would be a strong fit for your team.`;
    resumeNote = "Mohit_Singh_CRMExpert_v3.pdf";
  } else if (isPriyal) {
    theme = { gradient: "#7c2d12 0%,#ea580c 100%", accent: "#ea580c" };
    senderTitle = "Finance Professional · Credit Manager · Digital Lending · Follow-Up";
    bodyText = `I remain very enthusiastic and confident that my <strong>2+ years of experience</strong> in digital lending, credit risk assessment, and GenAI automation at Tata Capital would be a strong fit for your team.`;
    resumeNote = "Priyal_Goyal_Resume.pdf";
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,${theme.gradient});padding:36px 40px;">
    <p style="margin:0 0 6px;color:rgba(255,255,255,0.75);font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Follow-Up</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${senderName}</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${senderTitle}</p>
  </div>
  <div style="padding:36px 40px;">
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">${greeting}</p>
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">
      I hope this message finds you well. I am following up on my application${roleText} at
      <strong>${company||"your organization"}</strong>, which I submitted${dateText}.
    </p>
    ${noteBlock}
    <p style="color:#374151;line-height:1.8;margin:0 0 24px;">${bodyText}</p>
    <div style="background:${theme.accent}0d;border:1px solid ${theme.accent}33;border-radius:8px;padding:18px 24px;margin-bottom:24px;">
      <p style="margin:0;font-weight:600;color:${theme.accent};font-size:14px;">📎 Resume (Re-attached): ${resumeNote}</p>
    </div>
    <p style="color:#374151;line-height:1.8;margin:0;">Thank you again for your time and consideration.</p>
  </div>
  ${footer(theme.accent)}
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
      <strong>${company||"your organization"}</strong>. I'm very interested in the
      <strong>${role}</strong> role there and was hoping you might be open to referring me.
    </p>
    ${noteBlock}
    <p style="color:#374151;line-height:1.8;margin:0 0 16px;">
      A quick background — I have <strong>4.8+ years of experience</strong> in full-stack development
      with Node.js, Angular, AWS serverless, and enterprise CTI/Telephony integrations. I'd love the
      opportunity to contribute to your team.
    </p>
    <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:18px 24px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-weight:600;color:#5b21b6;font-size:14px;">📄 Resume</p>

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
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";

  // ── Bot detection — ONLY filter clearly automated scanners/crawlers ────────
  // NOTE: Gmail/Outlook/Yahoo route ALL images (including real human opens)
  // through their own proxy servers (e.g. ggpht.com, outlook proxy). This is
  // NORMAL and does NOT mean it's a bot — it's how every modern webmail works.
  // We only filter out things that are clearly non-human: security scanners,
  // social media link-preview crawlers, and SEO bots — NOT email image proxies.
  const BOT_PATTERNS = [
    "msnbot", "bingbot", "facebookexternalhit", "twitterbot", "linkedinbot",
    "applebot", "slackbot", "discordbot", "telegrambot", "whatsapp",
    "googlebot", "ahrefsbot", "semrushbot", "mj12bot", "petalbot",
    "barkrowler", "dataforseo", "curl/", "wget/", "python-requests",
    "headlesschrome", "phantomjs", "puppeteer",
  ];
  const isBot = BOT_PATTERNS.some(p => ua.includes(p));

  // Track ALL non-bot pixel fetches (including Gmail/Outlook image proxies —
  // these represent REAL opens since the proxy only fires when a human
  // actually views/renders the email, not on delivery).
  if (!isBot) {
    const record = markTrackingOpened(req.params.trackingId, ip, ua);
    if (record) {
      if (mongoose.connection.readyState === 1) {
        SentEmailLog.updateOne(
          { trackingId: req.params.trackingId, opened: { $ne: true } },
          { $set: { opened: true, openedAt: new Date() } }
        ).catch(() => {});
      }
      logToSheets([record.trackingId, record.hrEmail, record.company||"", record.role||"",
        new Date(record.sentAt).toISOString(), record.trackingId, "Opened", new Date(record.openedAt).toISOString()]);
      console.log(`👁 Open tracked: ${record.company} | ${record.hrEmail} | UA: ${ua.slice(0,60)}`);
    }
  } else {
    console.log(`🤖 Bot ignored: ${ua.slice(0,80)} | IP: ${ip}`);
  }

  const pixel = getPixelBuffer();
  res.writeHead(200, {
    "Content-Type":  "image/gif",
    "Content-Length": pixel.length,
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma":        "no-cache",
    "Expires":       "0",
  });
  res.end(pixel);
});

// ─── GET /api/contacts ────────────────────────────────────────────────────────
app.get("/api/contacts", requireAuth, async (req, res) => {
  try {
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
      followupScheduled: c.followupScheduled || false,
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
  } catch(e) { console.error("contacts error:", e.message); res.status(500).json({ success:false, message:e.message }); }
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
    const cfg7 = getUserConfig(req.user);
    if (!cfg7.gmailUser && !process.env.GMAIL_REFRESH_TOKEN) return res.json({ success: true, replies: [] });
    const auth  = getUserGmailAuth(req.user);
    const gmail = google.gmail({ version: "v1", auth });

    // ── FAST PATH: Return DB-already-marked replies immediately (no Gmail API call) ──
    const isOwner2 = req.user.username === (process.env.OWNER_USERNAME || "anav");
    const userFilter2 = isOwner2
      ? { $or: [{ userId: req.userId }, { userId: "default" }, { userId: { $exists: false } }] }
      : { userId: req.userId };

    let fastReplies = [];
    if (mongoose.connection.readyState === 1) {
      const dbReplied = await SentEmailLog.find({
        ...userFilter2,
        replied: true,
      }, { hrEmail:1, hrName:1, company:1, role:1, repliedAt:1, replySnippet:1, sentAt:1 })
        .sort({ repliedAt: -1 }).lean();

      fastReplies = dbReplied.map(r => ({
        id: r._id.toString(),
        fromEmail: r.hrEmail.toLowerCase(),
        from: r.hrName ? `${r.hrName} <${r.hrEmail}>` : r.hrEmail,
        subject: `Re: Application — ${r.company || r.hrEmail}`,
        date: r.repliedAt || r.sentAt,
        snippet: r.replySnippet || "",
        isReply: true,
        sentContext: { company: r.company, role: r.role, sentAt: r.sentAt },
      }));
    }

    // ── GMAIL LIVE FETCH: also check live inbox for NEW replies not yet in DB ──
    // Run in background — don't block the response
    (async () => {
      try {
        const emailFilter2 = isOwner2
          ? { $or: [{ userId: req.userId }, { userId: "default" }, { userId: { $exists: false } }] }
          : { userId: req.userId };
        const dbEmails = await SentEmailLog.distinct("hrEmail", emailFilter2);
        const trackedEmails = [...new Set(dbEmails.map(e => e.toLowerCase()))];
        if (!trackedEmails.length) return;

        // Use domain-level search which is more reliable than exact email match.
        // Batch 25 emails per query. Also search wider — job board replies often
        // come from a different subdomain/address than what we emailed.
        const CHUNK = 25;
        for (let i = 0; i < trackedEmails.length; i += CHUNK) {
          const chunk = trackedEmails.slice(i, i + CHUNK);
          // Build domain-aware query: match by exact email OR domain of that email
          const fromClause = chunk.map(e => {
            const domain = e.split("@")[1];
            // Use exact email match — domain match causes too many false positives
            return `from:${e}`;
          }).join(" OR ");
          const query = `(${fromClause}) newer_than:180d -from:me`;
          try {
            const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 50 });
            for (const msg of list.data.messages || []) {
              const d = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "metadata",
                metadataHeaders: ["From", "Date", "In-Reply-To", "References"] });
              const h = d.data.payload?.headers || [];
              const from = h.find(x => x.name === "From")?.value || "";
              const fMatch = from.match(/<([^>]+)>/);
              const fromEmail = (fMatch ? fMatch[1] : from).trim().toLowerCase();
              const dateH = h.find(x => x.name === "Date")?.value;
              const inReplyTo = h.find(x => x.name === "In-Reply-To")?.value || "";
              const refs = h.find(x => x.name === "References")?.value || "";

              // Update DB if not already marked
              const escapedFE = fromEmail.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
              const existing = await SentEmailLog.findOne({
                hrEmail: new RegExp("^" + escapedFE + "$", "i"),
                ...emailFilter2,
              }).lean();
              if (existing && !existing.replied) {
                await SentEmailLog.updateMany(
                  { hrEmail: new RegExp("^" + escapedFE + "$", "i"), ...emailFilter2 },
                  { $set: { replied: true, repliedAt: dateH ? new Date(dateH) : new Date(), replySnippet: d.data.snippet || "" } }
                );
              }
            }
          } catch { /* skip chunk */ }
        }
      } catch { /* background task — ignore errors */ }
    })();

    // Return fast path immediately
    res.json({ success: true, replies: fastReplies });
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
    // MongoDB-backed duplicate check — persistent + per-user, survives restarts
    let prev = null;
    if (mongoose.connection.readyState === 1) {
      const escaped = hrEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      prev = await SentEmailLog.findOne({
        hrEmail: new RegExp("^" + escaped + "$", "i"),
        userId: req.userId,
        type: "application",
      }).sort({ sentAt: -1 }).lean();
    }
    // Fallback to in-memory tracking (covers same-session sends before DB write completes)
    if (!prev) {
      const fallback = getTrackingRecords()
        .filter(r => r.hrEmail.toLowerCase() === hrEmail.toLowerCase())
        .sort((a, b) => b.sentAt - a.sentAt)[0];
      if (fallback) prev = { sentAt: fallback.sentAt, company: fallback.company };
    }
    if (prev) return res.status(200).json({
      isDuplicate: true, success: false,
      lastSentAt: prev.sentAt, lastCompany: prev.company,
      message: `Already applied to ${prev.company || company || "this contact"} on ${new Date(prev.sentAt).toLocaleString("en-IN")}`,
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
  let resolvedTemplateType = req.body.templateType || null;
  if (mongoose.connection.readyState === 1) {
    if (!resolvedThreadId && originalMessageId) {
      const prev = await SentEmailLog.findOne({ messageId: originalMessageId }).lean();
      if (prev && prev.threadId) resolvedThreadId = prev.threadId;
      if (!resolvedTemplateType && prev?.templateType) resolvedTemplateType = prev.templateType;
    }
    // If still no templateType, look up the original APPLICATION email sent to this hrEmail
    if (!resolvedTemplateType) {
      const escaped = hrEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const originalApp = await SentEmailLog.findOne({
        hrEmail: { $regex: new RegExp("^" + escaped + "$", "i") },
        userId: String(req.user._id),
        type: "application",
        templateType: { $exists: true, $ne: "" },
      }).sort({ sentAt: -1 }).lean();
      if (originalApp?.templateType) resolvedTemplateType = originalApp.templateType;
    }
  }
  const fuTplType = resolvedTemplateType || "fullstack";

  const fuUserName  = getUserConfig(req.user).profileName || "Anav Bansal";
  const baseSubject = originalSubject ||
    (role ? `Application for ${role} Position — ${fuUserName}` : `Job Application — ${fuUserName}`);
  const subject     = `Re: ${baseSubject}`;
  const trackRecord = createTrackingRecord({ hrEmail, hrName, company, role, subject, type: "followup" });
  const trackUrl    = `${BASE_URL}/api/track/${trackRecord.trackingId}`;
  // Use the SAME branded template as the original application (theme color + resume match)
  const html        = buildFollowUpHTML({ hrName, company, role, originalDate, customNote, trackUrl, userCfg: getUserConfig(req.user), templateType: fuTplType });

  storeEmailHtml(trackRecord.trackingId, html);

  try {
    const fuCfg  = getUserConfig(req.user);
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
      subject, sentAt: new Date(), inReplyTo: originalMessageId || null, templateType: fuTplType,
    });
    // Mark followupSent, clear needsFollowUp and followupScheduled
    if (mongoose.connection.readyState === 1) {
      await SentEmailLog.updateMany(
        { hrEmail: { $regex: new RegExp("^" + hrEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"), userId: String(req.user._id) } },
        { $set: { followupSent: true, needsFollowUp: false, followupScheduled: false } }
      ).catch(() => {});
    }
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
  try {
    const { hrEmail, company, scheduledTime, autoSend = true, ...rest } = req.body;
    if (!hrEmail || !company || !scheduledTime)
      return res.status(400).json({ success: false, message: "hrEmail, company, scheduledTime required." });
    const jobId = Date.now().toString();
    // autoSend=false → status "held": cron skips it, user gets reminder email and sends manually
    await addScheduledJob({
      jobId, scheduledTime, status: autoSend ? "pending" : "held",
      holdReason: autoSend ? "" : "manual",
      userId: req.userId || "default",
      emailData: { hrEmail, company, ...rest }
    });
    return res.json({
      success: true,
      message: autoSend
        ? `Scheduled for ${new Date(scheduledTime).toLocaleString("en-IN")} — will send automatically`
        : `Reminder set for ${new Date(scheduledTime).toLocaleString("en-IN")} — you'll get an email, send manually`,
      jobId,
    });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/scheduled-emails/:jobId/send-now — manually trigger a held job ─
app.post("/api/scheduled-emails/:jobId/send-now", requireAuth, async (req, res) => {
  try {
    const jobs = await loadScheduled();
    const job = jobs.find(j => j.jobId === req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    if (job.userId && job.userId !== req.userId && job.userId !== "default")
      return res.status(403).json({ success: false, message: "Not your job" });

    const userCfg = getUserConfig(req.user);
    const { info, trackRecord } = await sendApplicationEmail({
      ...job.emailData, user: req.user, userCfg,
    });
    await saveSentEmail({
      messageId: info.id, threadId: info.threadId || null, trackingId: trackRecord.trackingId,
      type: "scheduled", hrEmail: job.emailData.hrEmail, hrName: job.emailData.hrName||"",
      company: job.emailData.company||"", role: job.emailData.role||"",
      subject: trackRecord.subject, sentAt: new Date(),
    });
    await deleteJob(job.jobId);
    res.json({ success: true, message: `Sent to ${job.emailData.hrEmail}!` });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get("/api/scheduled-emails", requireAuth, async (req, res) => {
  const isOwner = req.user.username === (process.env.OWNER_USERNAME || "anav");
  let jobs;
  if (mongoose.connection.readyState === 1) {
    // Query DB directly with userId filter — much more efficient
    const query = isOwner
      ? { $or: [{ userId: req.userId }, { userId: "default" }, { userId: { $exists: false } }] }
      : { userId: req.userId };
    jobs = await ScheduledEmail.find(query).sort({ scheduledTime: 1 }).lean();
  } else {
    const allJobs = await loadScheduled();
    jobs = allJobs.filter(j =>
      isOwner
        ? (!j.userId || j.userId === req.userId || j.userId === "default")
        : (j.userId === req.userId)
    );
  }
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

// ─── POST /api/scheduled-emails/:jobId/retry — retry a single failed job ─────
app.post("/api/scheduled-emails/:jobId/retry", requireAuth, async (req, res) => {
  try {
    const allJobs = await loadScheduled();
    const job = allJobs.find(j => j.jobId === req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    if (job.userId && job.userId !== req.userId && job.userId !== "default")
      return res.status(403).json({ success: false, message: "Not your job" });

    const jobUser   = req.user;
    const jobUserCfg = getUserConfig(jobUser);

    const { info, trackRecord } = await sendApplicationEmail({
      ...job.emailData, user: jobUser, userCfg: jobUserCfg,
    });

    logToSheets([
      info.id, job.emailData.hrEmail, job.emailData.company || "", job.emailData.role || "",
      new Date().toISOString(), trackRecord.trackingId, "Retry-Sent", "",
    ]);
    await saveSentEmail({
      messageId: info.id, threadId: info.threadId || null, trackingId: trackRecord.trackingId,
      type: "scheduled", hrEmail: job.emailData.hrEmail, hrName: job.emailData.hrName || "",
      company: job.emailData.company || "", role: job.emailData.role || "",
      subject: trackRecord.subject, sentAt: new Date(),
    });
    await deleteJob(job.jobId);

    res.json({ success: true, message: "Email sent successfully!" });
  } catch(e) {
    await updateJobStatus(req.params.jobId, "failed", e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── POST /api/scheduled-emails/retry-all-failed — retry every failed job ────
app.post("/api/scheduled-emails/retry-all-failed", requireAuth, async (req, res) => {
  try {
    const allJobs = await loadScheduled();
    const isOwner = req.user.username === (process.env.OWNER_USERNAME || "anav");
    const myFailedJobs = allJobs.filter(j =>
      j.status === "failed" &&
      (isOwner ? (!j.userId || j.userId === req.userId || j.userId === "default") : j.userId === req.userId)
    );

    const jobUser    = req.user;
    const jobUserCfg = getUserConfig(jobUser);

    let sent = 0, failed = 0;
    for (const job of myFailedJobs) {
      try {
        const { info, trackRecord } = await sendApplicationEmail({
          ...job.emailData, user: jobUser, userCfg: jobUserCfg,
        });
        await saveSentEmail({
          messageId: info.id, threadId: info.threadId || null, trackingId: trackRecord.trackingId,
          type: "scheduled", hrEmail: job.emailData.hrEmail, hrName: job.emailData.hrName || "",
          company: job.emailData.company || "", role: job.emailData.role || "",
          subject: trackRecord.subject, sentAt: new Date(),
        });
        await deleteJob(job.jobId);
        sent++;
        await new Promise(r => setTimeout(r, 300)); // gentle rate limit
      } catch(e) {
        await updateJobStatus(job.jobId, "failed", e.message);
        failed++;
      }
    }

    res.json({ success: true, message: `Retried ${myFailedJobs.length} jobs — ${sent} sent, ${failed} failed`, sent, failed, total: myFailedJobs.length });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
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
  if (!["sent","replied"].includes(field)) return res.status(400).json({ success: false, message: "field must be sent or replied" });

  // Save to MongoDB (primary — always works)
  try {
    await LinkedInStatus.findOneAndUpdate(
      { userId: req.userId, rowIndex: String(rowIndex) },
      { $set: { [field]: value } },
      { upsert: true, new: true }
    );
  } catch(dbErr) {
    console.error("MongoDB LinkedIn save error:", dbErr.message);
  }

  // Also try Google Sheets (secondary — ignore failure)
  try {
    const col = field === "sent" ? "H" : "I";
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: LINKEDIN_SHEET_ID,
      range: `${LINKEDIN_TAB}!${col}${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[value ? "TRUE" : "FALSE"]] },
    });
  } catch(sheetsErr) {
    console.warn("Sheets update failed (non-critical):", sheetsErr.message);
  }

  return res.json({ success: true });
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

  // Save ignored to MongoDB
  try {
    await LinkedInStatus.findOneAndUpdate(
      { userId: req.userId, rowIndex: String(rowIndex) },
      { $set: { ignored: true } },
      { upsert: true, new: true }
    );
  } catch(dbErr) {
    console.error("MongoDB ignore error:", dbErr.message);
  }

  // Try Sheets too (non-critical)
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: LINKEDIN_SHEET_ID,
      range: `${LINKEDIN_TAB}!J${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["IGNORED"]] },
    });
  } catch(e) { console.warn("Sheets ignore failed:", e.message); }

  return res.json({ success: true });
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

    // Use the REQUESTING USER's Gmail auth (not hardcoded owner token)
    const auth  = getUserGmailAuth(req.user);
    const gmail = google.gmail({ version: "v1", auth });
    const cfg   = getUserConfig(req.user);
    const myEmail = (cfg.gmailUser || req.user.gmailUser || "").toLowerCase();

    const isOwner2 = req.user.username === (process.env.OWNER_USERNAME || "anav");
    const userFilter = isOwner2
      ? { $or: [{ userId: req.userId }, { userId: "default" }, { userId: { $exists: false } }] }
      : { userId: req.userId };

    // Strategy A: check all threads that have a threadId
    const logsWithThread = await SentEmailLog.find({
      ...userFilter,
      threadId: { $ne: null },
      replied:  { $ne: true },
      type:     "application",
    }).sort({ sentAt: -1 }).lean().limit(500);

    let newReplies = 0, checkedThread = 0;

    for (const log of logsWithThread) {
      try {
        const thread = await gmail.users.threads.get({
          userId: "me", id: log.threadId, format: "metadata",
          metadataHeaders: ["From", "Date", "Subject"]
        });
        const threadMsgs = thread.data.messages || [];
        // Look for any message NOT from us
        const hrReply = threadMsgs.find(tm => {
          const h = tm.payload?.headers || [];
          const from = h.find(x => x.name === "From")?.value || "";
          const fromMatch = from.match(/<([^>]+)>/);
          const fromEmail = (fromMatch ? fromMatch[1] : from).trim().toLowerCase();
          return fromEmail !== myEmail && fromEmail.includes("@");
        });

        if (hrReply) {
          const h = hrReply.payload?.headers || [];
          const dateH = h.find(x => x.name === "Date")?.value || "";
          await SentEmailLog.updateMany(
            { hrEmail: new RegExp("^" + log.hrEmail.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&") + "$", "i"), ...userFilter },
            { $set: { replied: true, repliedAt: dateH ? new Date(dateH) : new Date(), replySnippet: hrReply.snippet || "" } }
          );
          newReplies++;
        }
        checkedThread++;
      } catch { /* skip individual thread errors */ }
    }

    // Strategy B: also search inbox for emails FROM our tracked HRs
    // (catches cases where HR replied in a new thread — no threadId match)
    const trackedHRs = await SentEmailLog.distinct("hrEmail", {
      ...userFilter, replied: { $ne: true }, type: "application"
    });

    let checkedInbox = 0;
    const CHUNK = 25;
    for (let i = 0; i < Math.min(trackedHRs.length, 200); i += CHUNK) {
      const chunk = trackedHRs.slice(i, i + CHUNK);
      const fromClause = chunk.map(e => `from:${e}`).join(" OR ");
      try {
        const list = await gmail.users.messages.list({
          userId: "me", q: `(${fromClause}) newer_than:90d`, maxResults: 50
        });
        for (const msg of list.data.messages || []) {
          const d = await gmail.users.messages.get({
            userId: "me", id: msg.id, format: "metadata",
            metadataHeaders: ["From", "Date", "Subject"]
          });
          const h = d.data.payload?.headers || [];
          const from = h.find(x => x.name === "From")?.value || "";
          const fromMatch = from.match(/<([^>]+)>/);
          const fromEmail = (fromMatch ? fromMatch[1] : from).trim().toLowerCase();
          const dateH = h.find(x => x.name === "Date")?.value;

          const existing = await SentEmailLog.findOne({
            hrEmail: new RegExp("^" + fromEmail.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&") + "$", "i"),
            ...userFilter, replied: { $ne: true }
          }).lean();

          if (existing) {
            await SentEmailLog.updateMany(
              { hrEmail: new RegExp("^" + fromEmail.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&") + "$", "i"), ...userFilter },
              { $set: { replied: true, repliedAt: dateH ? new Date(dateH) : new Date(), replySnippet: d.data.snippet || "" } }
            );
            newReplies++;
          }
          checkedInbox++;
        }
      } catch { /* skip chunk */ }
    }

    res.json({ success: true, checkedThread, checkedInbox, newReplies,
      message: `Checked ${checkedThread} threads + ${checkedInbox} inbox msgs, found ${newReplies} new replies` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});


// ─── PATCH /api/contact/update — manually update contact status ───────────────
app.patch("/api/contact/update", requireAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1)
      return res.status(503).json({ success: false, message: "MongoDB not connected" });

    const { hrEmail, replied, repliedAt, notes, followupSent, followupScheduled, status,
            phone, stage, priority, interviewRound, interviewDate, callLog } = req.body;
    if (!hrEmail) return res.status(400).json({ success: false, message: "hrEmail required" });

    const updates = {};
    if (replied        !== undefined) updates.replied        = replied;
    if (repliedAt      !== undefined) updates.repliedAt      = repliedAt ? new Date(repliedAt) : new Date();
    if (notes          !== undefined) updates.notes          = notes;
    if (followupSent      !== undefined) updates.followupSent      = followupSent;
    if (followupScheduled !== undefined) updates.followupScheduled = followupScheduled;
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

    // If no records found (contact not in sent log) but interview data given — create a record
    if (result.modifiedCount === 0 && (updates.stage || updates.interviewDate)) {
      const newLog = new SentEmailLog({
        userId:        String(req.user._id),
        hrEmail:       hrEmail,
        hrName:        req.body.hrName || "",
        company:       req.body.company || "",
        role:          req.body.role    || "",
        subject:       req.body.subject || "Interview Scheduled",
        type:          "manual",
        sentAt:        new Date(),
        ...updates,
      });
      await newLog.save().catch(() => {});
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
        noticePeriod:     "Serving Notice Period",
        currentLocation:  "Gurugram, Haryana",
        preferredLocation:"PAN India",
        currentCTC:       "",
        expectedCTC:      "",
        resumePath:       require("path").join(__dirname, "Mohit_Singh_CRMExpert_v3.pdf"),
        resumeFileName:   "Mohit_Singh_CRMExpert_v3.pdf",
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
        noticePeriod:     "Serving Notice Period",
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

// ─── POST /api/templates — create/update template(s) ─────────────────────────
app.post("/api/templates", requireAuth, async (req, res) => {
  try {
    // Accept BOTH: single template object OR { templates: [...] } array (from Save All)
    if (Array.isArray(req.body.templates)) {
      // Bulk save from Settings page
      const saved = [];
      for (const tpl of req.body.templates) {
        if (!tpl.id && !tpl.templateId) continue;
        const tid = tpl.templateId || tpl.id;
        const doc = await EmailTemplate.findOneAndUpdate(
          { userId: req.userId, templateId: tid },
          { $set: {
            name:           tpl.name          || tid,
            icon:           tpl.icon          || "⚡",
            accent:         tpl.accent        || "#2563eb",
            headerTheme:    tpl.headerTheme   || "blue",
            subject:        tpl.subject       || "",
            customNote:     tpl.customNote    || "",
            intro:          tpl.intro         || "",
            highlights:     Array.isArray(tpl.highlights) ? tpl.highlights.filter(Boolean) : [],
            resumeUrl:      tpl.resumeUrl     || "",
            resumeFileName: tpl.resumeFileName|| "",
          }},
          { upsert: true, new: true }
        );
        saved.push(doc);
      }
      return res.json({ success: true, templates: saved });
    }

    // Single template save (from TemplatesPage edit modal)
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
async function sendWelcomeEmail({ displayName, username, password, profileEmail, appUrl, backendUrl }) {
  if (!profileEmail) { console.log("No email — skip welcome"); return; }
  const gmailConnectUrl = (backendUrl || BASE_URL) + "/api/gmail/auth?username=" + username;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:36px 40px;text-align:center;">
    <div style="font-size:40px;margin-bottom:12px;">🚀</div>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:800;">Welcome to Job Mailer!</h1>
    <p style="margin:8px 0 0;color:#93c5fd;font-size:14px;">Your Job Hunt Automation App</p>
  </div>
  <div style="padding:36px 40px;">
    <p style="color:#374151;font-size:15px;line-height:1.8;">Hi <strong>${displayName}</strong>,</p>
    <p style="color:#374151;font-size:14px;line-height:1.8;">Your account has been created. Here are your login credentials:</p>
    <div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:10px;padding:20px 24px;margin:20px 0;">
      <p style="margin:0 0 8px;font-weight:700;color:#0c4a6e;font-size:13px;">🔐 Your Login Details</p>
      <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6b7280;width:120px;">App URL:</td><td><a href="${appUrl}" style="color:#2563eb;font-weight:600;">${appUrl}</a></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Username:</td><td><strong>${username}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Password:</td><td><strong>${password}</strong></td></tr>
      </table>
    </div>
    <p style="color:#374151;font-size:14px;font-weight:700;margin-top:24px;">📋 3 Simple Steps to Get Started:</p>
    <p style="color:#374151;font-size:14px;line-height:1.8;"><strong>1. Login</strong> — Open the app URL above and login with your credentials.</p>
    <p style="color:#374151;font-size:14px;line-height:1.8;"><strong>2. Connect Gmail</strong> — Click below to connect your Gmail account. All job emails will be sent from YOUR Gmail.</p>
    <div style="text-align:center;margin:16px 0;">
      <a href="${gmailConnectUrl}" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">🔗 Connect Your Gmail</a>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:12px;color:#065f46;margin-bottom:16px;word-break:break-all;">
      Or copy: <strong>${gmailConnectUrl}</strong>
    </div>
    <p style="color:#374151;font-size:14px;line-height:1.8;"><strong>3. Update Profile & Apply</strong> — Go to Settings → fill your details, then Send Application to HRs!</p>
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px;font-size:12px;color:#713f12;margin-top:16px;">
      💡 Change your password after first login from Settings → Account tab.
    </div>
  </div>
  <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">Job Mailer · Built by Anav Bansal · <a href="mailto:anavbansal06@gmail.com" style="color:#2563eb;">anavbansal06@gmail.com</a></p>
  </div>
</div></body></html>`;

  // Send via Anav's Gmail (owner) — get fresh token from MongoDB
  const ownerUsername  = process.env.OWNER_USERNAME || "anav";
  const ownerUserDoc   = await User.findOne({ username: ownerUsername }).lean().catch(() => null);
  const ownerToken     = ownerUserDoc?.gmailRefreshToken || process.env.GMAIL_REFRESH_TOKEN;

  if (!ownerToken) throw new Error("Owner Gmail not connected");

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: ownerToken });
  const gmail  = google.gmail({ version: "v1", auth: oauth2Client });
  const from   = process.env.GMAIL_USER || "anavbansal06@gmail.com";
  const subjectEncoded = `=?UTF-8?B?${Buffer.from("Welcome to Job Mailer — Your Account is Ready! 🚀").toString("base64")}?=`;

  const boundary = "welcome_" + Date.now();
  const rawEmail = [
    `From: "Job Mailer" <${from}>`,
    `To: ${profileEmail}`,
    `Subject: ${subjectEncoded}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    html,
    `--${boundary}--`,
  ].join("\r\n");

  const encoded = Buffer.from(rawEmail).toString("base64url");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });
  console.log("✅ Welcome email sent to", profileEmail);
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
    const APP_URL     = process.env.FRONTEND_URL  || "https://emailsender-gl5q.vercel.app";
    const BACKEND_URL = process.env.BASE_URL       || "https://emailsender-v8a4.onrender.com";
    let emailStatus = "";
    if (profileEmail) {
      try {
        await sendWelcomeEmail({
          displayName:  displayName || username,
          username:     username.toLowerCase(),
          password:     password,
          profileEmail,
          appUrl:       APP_URL,
          backendUrl:   BACKEND_URL,
        });
        emailStatus = " — Welcome email sent!";
        console.log("✅ Welcome email sent to", profileEmail);
      } catch(e) {
        emailStatus = " — (email failed: " + e.message + ")";
        console.error("❌ Welcome email error:", e.message);
      }
    }

    res.json({ success: true, message: "User created" + emailStatus, userId: user._id });
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


// ─── POST /api/ai/write-email — AI powered email writer ──────────────────────

// ─── POST /api/ai/chat — unified smart assistant (extracts fields itself) ────
app.post("/api/ai/chat", requireAuth, async (req, res) => {
  try {
    const { tool, message, history = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, message: "Message required" });

    const userCfg = getUserConfig(req.user);
    const pf = {
      name:      userCfg?.profileName    || req.user.displayName || "Candidate",
      exp:       userCfg?.totalExp       || "4.8+",
      skills:    userCfg?.keySkills      || "Full Stack, CRM, CTI",
      company:   userCfg?.currentCompany || "NovelVox",
      notice:    userCfg?.noticePeriod   || "Serving Notice Period",
      curCTC:    userCfg?.currentCTC     || "",
      expCTC:    userCfg?.expectedCTC    || "",
      location:  userCfg?.currentLocation|| "Delhi NCR",
      reason:    userCfg?.reasonForChange|| "Growth & better opportunity",
    };
    const PROFILE = `
CANDIDATE PROFILE:
- Name: ${pf.name}
- Total Experience: ${pf.exp} years
- Key Skills: ${pf.skills}
- Current Company: ${pf.company}
- Notice Period: ${pf.notice}
- Current CTC: ${pf.curCTC}
- Expected CTC: ${pf.expCTC}
- Location: ${pf.location}
- Reason for Change: ${pf.reason}
`.trim();

    // Model selection: heavy reasoning tasks get 70B, fast tasks get 8B
    const HEAVY_TOOLS = ["interview", "salary", "ats", "analyzejd", "career", "strategy", "resume_review", "company_research"];
    const model = HEAVY_TOOLS.includes(tool) ? "openai/gpt-oss-120b" : "openai/gpt-oss-120b";
    const maxTok = HEAVY_TOOLS.includes(tool) ? 1500 : 800;

    const SYSTEM_PROMPTS = {

      // ── OUTREACH TOOLS ──────────────────────────────────────────────────────
      email: `You are a world-class career email strategist. ${PROFILE}

Your job: produce EXACTLY what the user requests — intro paragraph, subject line, highlights, custom note, or full email. Read their instruction carefully.
- Language: confident, specific, naturally professional. No hollow phrases like "I am excited to bring my passion".
- Personalize to role/company when mentioned.
- For intro: 3-4 sentences, highlight the most relevant skills for this specific role.
- For subject lines: return 3 options as JSON array ["Sub1","Sub2","Sub3"].
- For highlights: return 5 punchy bullets as JSON array, each under 80 chars.
- Output ONLY the requested content. No preamble, no sign-off unless asked.`,

      followup: `You are a follow-up email specialist. ${PROFILE}

Write a follow-up email that:
1. References the original application (company/role if mentioned)
2. Reaffirms genuine interest with ONE specific reason (not generic)
3. Adds ONE new piece of value or context (recent win, skill update, etc.)
4. Ends with a clear soft CTA
Length: 3-5 sentences. Tone: warm but professional. No fluff.
Output ONLY the email body.`,

      screening: `You are the candidate ${pf.name} replying to an HR screening email. ${PROFILE}

STRICT RULES — read and follow every one:
1. Read the HR email word by word. List what they SPECIFICALLY asked.
2. Answer ONLY those specific items. Nothing more.
3. One question = one line answer. Multiple questions = bullet list.
4. NEVER dump all profile fields unprompted.
5. If they ask CTC: give current + expected. If they ask notice: give exactly that. 
6. Tone: warm, direct, confident. No "as per your request", no corporate speak.
7. End with name + phone number only.
Output ONLY the reply body.`,

      linkedin: `You are a LinkedIn outreach expert. ${PROFILE}

Write a connection request message that:
- Is under 300 characters (LinkedIn limit)
- Mentions ONE specific thing about them or their company
- States a clear reason to connect
- Feels human, not template-y
Output ONLY the message. No quotes around it.`,

      referral: `You are writing a referral request. ${PROFILE}

Write a referral request message for WhatsApp/email that:
- Opens by acknowledging the relationship
- States the specific role and company clearly
- Explains in one sentence why you're a fit
- Asks for referral/intro specifically, not vaguely
- Is warm, not desperate
Keep it under 150 words. Output ONLY the message.`,

      // ── RESEARCH & ANALYSIS TOOLS ───────────────────────────────────────────
      interview: `You are a senior technical interview coach with 10+ years experience. ${PROFILE}

Given the company/role/round, provide:

**1. Likely Questions (5-7)**
For each question: the question + why they ask it + 2-3 bullet points on how to answer it well.

**2. Round-Specific Tips (3-4)**
Tactical advice specific to this round type and company culture.

**3. Questions to Ask Them (3)**
Smart questions that show strategic thinking and genuine interest.

**4. Watch Out For**
1-2 common mistakes candidates make in this specific round/company.

Be specific to the company if mentioned. Use **bold** for headers.`,

      salary: `You are an elite salary negotiation coach. ${PROFILE}

Given the offer details, provide:

**1. Market Analysis**
Is this offer above/below/at market for this role + location + experience? Give a range.

**2. Negotiation Strategy**
Step-by-step: what to say, when to push, when to hold. Include exact scripts.

**3. Counter-Offer Numbers**
Specific CTC/take-home/hike% targets. Justify them.

**4. Non-Salary Levers**
What else to negotiate: joining bonus, WFH days, notice buyout, ESOPs, review cycle.

**5. Red Flags**
Any warning signs in the offer to watch out for.

Use **bold** headers. Be specific with INR numbers if salary is mentioned.`,

      analyzejd: `You are a JD analyzer and career strategist. 

Analyze this job description and provide:

**1. Role Summary** (2-3 sentences: what this role actually does day-to-day)

**2. Must-Have Skills** (hard requirements, be specific)

**3. Nice-to-Have Skills** (mentioned but not dealbreakers)

**4. Company Culture Signals** (what the language tells you about the team)

**5. Realistic Candidate Profile** (years of exp, background type they want)

**6. Hidden Requirements** (things implied but not stated explicitly)

**7. Interview Focus Areas** (based on what they emphasized, what will they test)

**8. Red Flags** (anything concerning about this role/company)

${PROFILE}
**9. Your Match Score** (0-100% and why, based on candidate profile above)

Use **bold** headers.`,

      ats: `You are an ATS optimization expert. ${PROFILE}

Given the JD, perform a full ATS analysis:

**Match Score: X%**
(Calculate honestly based on skills + experience + keywords)

**Matched Keywords**
List every keyword from JD that also appears in candidate profile.

**Missing Keywords**  
Critical JD keywords NOT in profile — these hurt ATS ranking.

**Experience Gap Analysis**
Where candidate is over/under the stated requirements.

**ATS Optimization Tips (Top 5)**
Specific resume changes to improve score — exact phrases to add, sections to restructure.

**Recruiter Scan (First 6 seconds)**
What a human recruiter sees first and whether it grabs attention.

Use **bold** headers. Be brutally honest about gaps.`,

      // ── NEW POWER TOOLS ─────────────────────────────────────────────────────
      career: `You are a senior career strategist with deep knowledge of the Indian tech job market. ${PROFILE}

Answer the user's career question with:
- Honest, specific advice (not generic "network more" advice)
- India-specific market context where relevant  
- Actionable next steps
- Realistic timelines and expectations
- Things most people don't tell you

Be direct. If something is a bad idea, say so clearly.`,

      company_research: `You are a company research analyst helping a job seeker. 
Given the company name/URL, provide everything a candidate needs before applying or interviewing:

**1. Company Overview** (what they actually do, business model, scale)
**2. Tech Stack** (what technologies they use)  
**3. Culture Signals** (Glassdoor patterns, LinkedIn activity, what employees say)
**4. Interview Process** (typical rounds, what to expect)
**5. Pros for This Candidate** (why this could be a good fit: ${pf.skills})
**6. Potential Concerns** (things to verify or watch out for)
**7. Smart Questions to Ask Them** (show you've done research)

Use **bold** headers.`,

      resume_review: `You are a professional resume reviewer and ATS expert. ${PROFILE}

Review the resume/content shared and provide:

**Overall Score: X/10**

**What's Working Well** (keep these — don't change them)

**Critical Issues** (will get resume rejected — fix immediately)

**ATS Problems** (formatting, keywords, structure issues)

**Impact Improvements** (how to quantify achievements better)

**Missing Sections/Content** (what should be added)

**Rewritten Examples** (show 2-3 bullet rewrites from weak → strong)

Be specific. Quote actual lines and show how to improve them.`,

      strategy: `You are a job search strategist. ${PROFILE}

The user needs strategic advice on their job search. Provide:
- A clear diagnosis of their situation
- A prioritized action plan with specific steps
- Timeline expectations (realistic, India market)
- Metrics to track progress
- What to stop doing / what to start doing
- One contrarian insight most people miss

Be direct, specific, and actionable.`,
    };

    const sys = SYSTEM_PROMPTS[tool] || SYSTEM_PROMPTS.email;

    const messages = [
      { role: "system", content: sys },
      ...history.slice(-8).map(h => ({ role: h.role === "user" ? "user" : "assistant", content: h.text })),
      { role: "user", content: message },
    ];

    const reply = await groqChat(messages, maxTok, 0.75, model);
    res.json({ success: true, reply: reply.trim(), model, tool });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message || "AI request failed" });
  }
});

app.post("/api/ai/write-email", requireAuth, async (req, res) => {
  try {
    const { hrName, company, role, templateType, tone = "professional", keyPoints = "" } = req.body;
    const userCfg   = getUserConfig(req.user);
    const userName  = userCfg.profileName  || req.user.displayName || "Anav Bansal";
    const exp       = userCfg.totalExp     || req.user.totalExp    || "4+ years";
    const skills    = userCfg.keySkills    || req.user.keySkills   || "Node.js, AngularJS, AWS";
    const company2  = userCfg.currentCompany || req.user.currentCompany || "NovelVox";
    const title     = userCfg.profileTitle || req.user.profileTitle || "Software Developer";

    const toneMap = {
      professional: "formal and professional",
      confident:    "confident and assertive",
      friendly:     "warm and conversational",
      concise:      "brief and to the point — max 3 short paragraphs",
    };

    const prompt = `You are an expert job application email writer. Write a personalized job application email with these details:

Candidate: ${userName}
Title: ${title}
Experience: ${exp}
Current Company: ${company2}
Key Skills: ${skills}
${keyPoints ? "Key Points to highlight: " + keyPoints : ""}

HR Name: ${hrName || "Hiring Manager"}
Company: ${company || "the company"}
Role: ${role || "this position"}
Template Type: ${templateType || "fullstack"}
Tone: ${toneMap[tone] || toneMap.professional}

Write ONLY the email body (no subject line, no "Dear" salutation — start from first paragraph, end before signature).
- 2-3 paragraphs max
- Mention specific skills relevant to the role
- Sound human and genuine, not robotic
- Each email must feel unique and personalized
- Do NOT use placeholder text like [Your Name]
- End with a call to action`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ success: false, message: err.error?.message || "AI failed" });
    }

    const data    = await response.json();
    const emailBody = data.choices?.[0]?.message?.content?.trim() || "";
    res.json({ success: true, emailBody });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── POST /api/ai/write-subject — AI subject line generator ──────────────────
app.post("/api/ai/write-subject", requireAuth, async (req, res) => {
  try {
    const { hrName, company, role, templateType } = req.body;
    const userCfg  = getUserConfig(req.user);
    const userName = userCfg.profileName || req.user.displayName || "Anav Bansal";
    const exp      = userCfg.totalExp    || "4+ years";

    const prompt = `Generate 3 unique, catchy email subject lines for a job application.
Candidate: ${userName} (${exp} experience)
Role: ${role || "Software Developer"}
Company: ${company || "the company"}
Template: ${templateType || "fullstack"}

Rules:
- Each must be different in style
- Max 60 characters each
- Sound human, not generic
- No emojis
- Format: just the 3 lines, numbered 1. 2. 3.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.9,
      }),
    });

    const data     = await response.json();
    const raw      = data.choices?.[0]?.message?.content?.trim() || "";
    const subjects = raw.split("\n").filter(l => l.match(/^\d+\./)).map(l => l.replace(/^\d+\.\s*/, "").trim());
    res.json({ success: true, subjects });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── POST /api/ai/screening-reply — AI screening reply generator ───────────────
app.post("/api/ai/screening-reply", requireAuth, async (req, res) => {
  try {
    const { hrMessage = "" } = req.body;
    const userCfg   = getUserConfig(req.user);
    const userName  = userCfg.profileName     || req.user.displayName  || "Anav Bansal";
    const skills    = userCfg.keySkills       || req.user.keySkills    || "";
    const exp       = userCfg.totalExp        || req.user.totalExp     || "";
    const currCTC   = userCfg.currentCTC      || req.user.currentCTC   || "";
    const expCTC    = userCfg.expectedCTC     || req.user.expectedCTC  || "";
    const notice    = userCfg.noticePeriod    || req.user.noticePeriod || "Serving Notice Period";
    const location  = userCfg.currentLocation || req.user.currentLocation || "";
    const company   = userCfg.currentCompany  || req.user.currentCompany  || "";

    const prompt = `You are ${userName}, a job seeker. An HR has sent you a screening message.

Your Profile:
- Skills: ${skills}
- Experience: ${exp}
- Current Company: ${company}
- Current CTC: ${currCTC}
- Expected CTC: ${expCTC}
- Notice Period: ${notice}
- Location: ${location}

HR's message: "${hrMessage || "Please share your profile details"}"

Write a professional, concise reply covering the relevant screening questions.
- Be direct and confident
- Only answer what was asked
- Keep it under 150 words
- Sound natural, not robotic`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    const data  = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "";
    res.json({ success: true, reply });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// AI ROUTES — Powered by Groq (moonshotai/kimi-k2-instruct)
// ═══════════════════════════════════════════════════════════════════════════════

async function groqChat(messages, maxTokens = 800, temperature = 0.8, model = "openai/gpt-oss-120b") {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "Groq API failed");
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ─── 1. AI Email Writer ───────────────────────────────────────────────────────

// ─── 2. AI Subject Line Generator ────────────────────────────────────────────

// ─── 3. AI Follow-up Writer ───────────────────────────────────────────────────
app.post("/api/ai/write-followup", requireAuth, async (req, res) => {
  try {
    const { company, role, originalDate, daysSince = 7, previousEmail = "" } = req.body;
    const cfg      = getUserConfig(req.user);
    const userName = cfg.profileName || req.user.displayName || "Anav Bansal";
    const skills   = cfg.keySkills   || req.user.keySkills   || "";

    const text = await groqChat([{ role: "user", content:
`Write a follow-up email body for a job application.

Candidate: ${userName}
Applied for: ${role || "Software Developer"} at ${company || "your company"}
Applied on: ${originalDate || `${daysSince} days ago`}
Days since application: ${daysSince}
Key Skills: ${skills}
${previousEmail ? "Previous email summary: " + previousEmail.slice(0, 200) : ""}

Rules:
- Brief and polite — 2 short paragraphs max
- Reiterate interest without being desperate  
- Add ONE new value point not in original email
- Professional but warm tone
- Strong call to action
- Output: just the email body paragraphs, nothing else` }], 350, 0.8);

    res.json({ success: true, emailBody: text });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── 4. AI Screening Reply ────────────────────────────────────────────────────

// ─── 5. AI LinkedIn Connection Message ────────────────────────────────────────
app.post("/api/ai/linkedin-msg", requireAuth, async (req, res) => {
  try {
    const { personName, personTitle, company, purpose = "job", mutualInfo = "" } = req.body;
    const cfg      = getUserConfig(req.user);
    const userName = cfg.profileName || req.user.displayName || "Anav Bansal";
    const skills   = cfg.keySkills   || req.user.keySkills   || "";
    const exp      = cfg.totalExp    || req.user.totalExp    || "4+ years";

    const purposeMap = {
      job:      "job opportunity or referral at their company",
      network:  "professional networking and knowledge sharing",
      referral: "a referral for an open position at their company",
      connect:  "connecting as professionals in the same industry",
    };

    const text = await groqChat([{ role: "user", content:
`Write a LinkedIn connection message (max 300 chars — LinkedIn limit).

From: ${userName} (${exp} exp in ${skills.split(",")[0]?.trim()})
To: ${personName || "HR/Recruiter"} (${personTitle || "Professional"} at ${company || "their company"})
Purpose: ${purposeMap[purpose] || purposeMap.job}
${mutualInfo ? "Mutual info: " + mutualInfo : ""}

Rules:
- MUST be under 300 characters (LinkedIn limit — very strict)
- Personal, warm, specific — NOT generic
- Clear ask in last sentence
- No hashtags, no emojis
Output: just the message text` }], 150, 0.9);

    const msg = text.slice(0, 300);
    res.json({ success: true, message: msg, chars: msg.length });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── 6. AI Referral Message ───────────────────────────────────────────────────
app.post("/api/ai/referral-msg", requireAuth, async (req, res) => {
  try {
    const { personName, company, role, platform = "whatsapp" } = req.body;
    const cfg      = getUserConfig(req.user);
    const userName = cfg.profileName || req.user.displayName || "Anav Bansal";
    const skills   = cfg.keySkills   || req.user.keySkills   || "";
    const exp      = cfg.totalExp    || req.user.totalExp    || "4+ years";
    const title    = cfg.profileTitle || req.user.profileTitle || "Software Developer";

    const text = await groqChat([{ role: "user", content:
`Write a ${platform === "whatsapp" ? "WhatsApp" : "email"} referral request message.

From: ${userName} — ${title}, ${exp} experience
To: ${personName || "connection"}
Company: ${company || "their company"}
Role: ${role || "Software Developer"}
Key Skills: ${skills}

Rules:
- ${platform === "whatsapp" ? "Conversational, brief — WhatsApp style. 3-4 sentences max." : "Professional email format. 3 short paragraphs."}
- Mention specific skills relevant to company/role
- Clear ask for referral
- End with a strong reason why they should refer you
- Sound genuine — NOT desperate
Output: just the message` }], 350, 0.85);

    res.json({ success: true, message: text });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── 7. AI ATS Resume Score ───────────────────────────────────────────────────
app.post("/api/ai/ats-score", requireAuth, async (req, res) => {
  try {
    const { jobDescription } = req.body;
    if (!jobDescription) return res.status(400).json({ success: false, message: "Job description required" });
    const cfg    = getUserConfig(req.user);
    const skills = cfg.keySkills || req.user.keySkills || "";
    const exp    = cfg.totalExp  || req.user.totalExp  || "";
    const title  = cfg.profileTitle || req.user.profileTitle || "";
    const summary = cfg.profileSummary || req.user.profileSummary || "";

    const text = await groqChat([{ role: "user", content:
`You are an ATS (Applicant Tracking System) expert. Analyze how well this candidate matches the job.

CANDIDATE:
Title: ${title}
Experience: ${exp}
Skills: ${skills}
Summary: ${summary}

JOB DESCRIPTION:
${jobDescription.slice(0, 2000)}

Provide a detailed analysis in this EXACT JSON format (no markdown, no backticks):
{
  "score": 85,
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill3", "skill4"],
  "strengths": ["point1", "point2", "point3"],
  "improvements": ["tip1", "tip2"],
  "verdict": "Strong match — apply with confidence",
  "emailTips": "Focus on X and Y in your email"
}` }], 600, 0.3, "openai/gpt-oss-120b");

    try {
      const cleaned = text.replace(/```json|```/g, "").trim();
      const result  = JSON.parse(cleaned);
      res.json({ success: true, result });
    } catch {
      res.json({ success: true, result: { score: 0, verdict: text, matchedSkills: [], missingSkills: [], strengths: [], improvements: [], emailTips: "" } });
    }
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── 8. AI Interview Prep ─────────────────────────────────────────────────────
app.post("/api/ai/interview-prep", requireAuth, async (req, res) => {
  try {
    const { company, role, round = "technical" } = req.body;
    const cfg    = getUserConfig(req.user);
    const skills = cfg.keySkills || req.user.keySkills || "";
    const exp    = cfg.totalExp  || req.user.totalExp  || "4+ years";

    const text = await groqChat([{ role: "user", content:
`Generate interview preparation guide for:
Company: ${company || "a tech company"}
Role: ${role || "Software Developer"}
Round: ${round}
Candidate Skills: ${skills}
Experience: ${exp}

Provide in EXACT JSON (no markdown):
{
  "questions": [
    {"q": "question", "hint": "key points to cover"},
    {"q": "question", "hint": "key points to cover"},
    {"q": "question", "hint": "key points to cover"},
    {"q": "question", "hint": "key points to cover"},
    {"q": "question", "hint": "key points to cover"}
  ],
  "tips": ["tip1", "tip2", "tip3"],
  "companyInsights": "Brief info about company culture and what they look for",
  "redFlags": ["avoid1", "avoid2"]
}` }], 800, 0.5, "openai/gpt-oss-120b");

    try {
      const result = JSON.parse(text.replace(/```json|```/g, "").trim());
      res.json({ success: true, result });
    } catch {
      res.json({ success: true, result: { questions: [], tips: [text], companyInsights: "", redFlags: [] } });
    }
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── 9. AI Salary Negotiation ─────────────────────────────────────────────────
app.post("/api/ai/salary-negotiate", requireAuth, async (req, res) => {
  try {
    const { offeredCTC, role, company, yearsExp } = req.body;
    const cfg    = getUserConfig(req.user);
    const expCTC = cfg.expectedCTC || req.user.expectedCTC || "";
    const skills = cfg.keySkills   || req.user.keySkills   || "";

    const text = await groqChat([{ role: "user", content:
`You are a salary negotiation expert. Analyze this job offer and provide strategy.

Role: ${role || "Software Developer"}
Company: ${company || "the company"}
Offered CTC: ${offeredCTC} LPA
Expected CTC: ${expCTC} LPA
Years Experience: ${yearsExp || "4+"}
Skills: ${skills}

Provide in EXACT JSON (no markdown):
{
  "strategy": "negotiate|accept|counter",
  "counterOffer": 18,
  "marketRate": "16-22 LPA for this role/exp",
  "confidence": "high|medium|low",
  "emailScript": "Full negotiation email body here...",
  "phoneScript": "What to say on call...",
  "keyArguments": ["arg1", "arg2", "arg3"],
  "walkawayPoint": 15,
  "tips": ["tip1", "tip2"]
}` }], 700, 0.5, "openai/gpt-oss-120b");

    try {
      const result = JSON.parse(text.replace(/```json|```/g, "").trim());
      res.json({ success: true, result });
    } catch {
      res.json({ success: true, result: { strategy: "negotiate", emailScript: text, keyArguments: [], tips: [] } });
    }
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── 10. AI Job Description Analyzer ─────────────────────────────────────────
app.post("/api/ai/analyze-jd", requireAuth, async (req, res) => {
  try {
    const { jobDescription } = req.body;
    const text = await groqChat([{ role: "user", content:
`Analyze this job description and extract key info in EXACT JSON (no markdown):
{
  "role": "extracted role title",
  "company": "company name if mentioned",
  "requiredSkills": ["skill1", "skill2"],
  "niceToHave": ["skill1"],
  "experience": "3-5 years",
  "salaryRange": "if mentioned, else null",
  "workMode": "remote|hybrid|onsite",
  "redFlags": ["any concerning requirements"],
  "keyResponsibilities": ["resp1", "resp2", "resp3"],
  "applicationTips": "What to focus on in cover letter"
}

JOB DESCRIPTION:
${jobDescription?.slice(0, 2000)}` }], 500, 0.3);

    try {
      const result = JSON.parse(text.replace(/```json|```/g, "").trim());
      res.json({ success: true, result });
    } catch {
      res.json({ success: true, result: { applicationTips: text } });
    }
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});


// ─── GET /api/gmail/alerts — check for Gmail health issues ──────────────────
app.get("/api/gmail/alerts", requireAuth, async (req, res) => {
  try {
    const alerts = loadAlerts();
    const myAlert = alerts[req.user.username] || null;
    res.json({ success: true, alert: myAlert });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/gmail/alerts/clear — dismiss alert ─────────────────────────────
app.post("/api/gmail/alerts/clear", requireAuth, async (req, res) => {
  try {
    await clearGmailAlert(req.user.username);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});


// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/analytics/dashboard ────────────────────────────────────────────
app.get("/api/analytics/dashboard", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const isOwner = req.user.username === (process.env.OWNER_USERNAME || "anav");
    const userFilter = isOwner
      ? { $or: [{ userId }, { userId: "default" }, { userId: { $exists: false } }] }
      : { userId };

    const [totalSent, totalOpened, totalReplied, totalFollowup, byTemplate, byDay, byHour, topCompanies, recentTrend] = await Promise.all([
      // Total counts
      SentEmailLog.countDocuments({ ...userFilter }),
      SentEmailLog.countDocuments({ ...userFilter, opened: true }),
      SentEmailLog.countDocuments({ ...userFilter, replied: true }),
      SentEmailLog.countDocuments({ ...userFilter, followupSent: true }),

      // By template type
      SentEmailLog.aggregate([
        { $match: { ...userFilter, type: "application" } },
        { $group: { _id: "$type", count: { $sum: 1 }, opened: { $sum: { $cond: ["$opened", 1, 0] } }, replied: { $sum: { $cond: ["$replied", 1, 0] } } } },
      ]),

      // Emails by day of week (0=Sun, 1=Mon...)
      SentEmailLog.aggregate([
        { $match: userFilter },
        { $group: { _id: { $dayOfWeek: "$sentAt" }, count: { $sum: 1 }, replied: { $sum: { $cond: ["$replied", 1, 0] } } } },
        { $sort: { "_id": 1 } }
      ]),

      // Emails by hour
      SentEmailLog.aggregate([
        { $match: userFilter },
        { $group: { _id: { $hour: "$sentAt" }, count: { $sum: 1 }, replied: { $sum: { $cond: ["$replied", 1, 0] } } } },
        { $sort: { "_id": 1 } }
      ]),

      // Top responding companies
      SentEmailLog.aggregate([
        { $match: { ...userFilter, replied: true, company: { $ne: "" } } },
        { $group: { _id: "$company", replies: { $sum: 1 }, sent: { $sum: 1 } } },
        { $sort: { replies: -1 } },
        { $limit: 10 }
      ]),

      // Last 30 days trend
      SentEmailLog.aggregate([
        { $match: { ...userFilter, sentAt: { $gte: new Date(Date.now() - 30*24*60*60*1000) } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$sentAt" } }, sent: { $sum: 1 }, replied: { $sum: { $cond: ["$replied", 1, 0] } } } },
        { $sort: { "_id": 1 } }
      ])
    ]);

    const openRate  = totalSent > 0 ? Math.round(totalOpened  / totalSent * 100) : 0;
    const replyRate = totalSent > 0 ? Math.round(totalReplied / totalSent * 100) : 0;

    res.json({ success: true, data: {
      summary: { totalSent, totalOpened, totalReplied, totalFollowup, openRate, replyRate },
      byTemplate, byDay, byHour, topCompanies, recentTrend
    }});
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTERVIEW TRACKER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/interviews ─────────────────────────────────────────────────────
app.get("/api/interviews", requireAuth, async (req, res) => {
  try {
    const interviews = await Interview.find({ userId: req.userId }).sort({ interviewDate: 1 }).lean();
    res.json({ success: true, interviews });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/interviews — create/schedule a new interview ──────────────────
app.post("/api/interviews", requireAuth, async (req, res) => {
  try {
    const { hrEmail, hrName, company, role, stage, interviewRound, interviewDate, priority, callLog } = req.body;
    if (!hrEmail) return res.status(400).json({ success: false, message: "hrEmail required" });

    let doc = await Interview.findOneAndUpdate(
      { userId: req.userId, hrEmail: hrEmail.toLowerCase() },
      { $set: {
        hrEmail: hrEmail.toLowerCase(), hrName: hrName || "", company: company || "", role: role || "",
        stage: stage || "Interview", interviewRound: interviewRound || "",
        interviewDate: interviewDate ? new Date(interviewDate) : null,
        priority: priority || "Normal", callLog: callLog || "",
      }},
      { upsert: true, new: true }
    );

    // Also reflect stage on the contact record so HR Contacts stays in sync
    if (mongoose.connection.readyState === 1) {
      const escaped = hrEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      await SentEmailLog.updateMany(
        { hrEmail: new RegExp("^" + escaped + "$", "i"), userId: req.userId },
        { $set: { stage: stage || "Interview" } }
      ).catch(() => {});
    }

    // Sync to Google Calendar (best-effort)
    const eventId = await syncInterviewToCalendar(req.user, doc);
    if (eventId && eventId !== doc.calendarEventId) {
      doc = await Interview.findByIdAndUpdate(doc._id, { $set: { calendarEventId: eventId } }, { new: true });
    }

    res.json({ success: true, interview: doc, calendarSynced: !!eventId });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── PATCH /api/interviews/:id ───────────────────────────────────────────────
app.patch("/api/interviews/:id", requireAuth, async (req, res) => {
  try {
    const { stage, interviewRound, interviewDate, callLog, priority } = req.body;
    const updates = {};
    if (stage          !== undefined) updates.stage          = stage;
    if (interviewRound !== undefined) updates.interviewRound = interviewRound;
    if (interviewDate  !== undefined) updates.interviewDate  = interviewDate ? new Date(interviewDate) : null;
    if (callLog        !== undefined) updates.callLog        = callLog;
    if (priority       !== undefined) updates.priority       = priority;

    let doc = await Interview.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { $set: updates },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: "Interview not found" });

    // Keep contact stage in sync
    if (stage && mongoose.connection.readyState === 1) {
      const escaped = doc.hrEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      await SentEmailLog.updateMany(
        { hrEmail: new RegExp("^" + escaped + "$", "i"), userId: req.userId },
        { $set: { stage } }
      ).catch(() => {});
    }

    // Re-sync calendar if date/round/stage changed
    if (interviewDate !== undefined || stage !== undefined || interviewRound !== undefined) {
      const eventId = await syncInterviewToCalendar(req.user, doc);
      if (eventId && eventId !== doc.calendarEventId) {
        doc = await Interview.findByIdAndUpdate(doc._id, { $set: { calendarEventId: eventId } }, { new: true });
      }
    }

    res.json({ success: true, interview: doc });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── DELETE /api/interviews/:id ───────────────────────────────────────────────
app.delete("/api/interviews/:id", requireAuth, async (req, res) => {
  try {
    const doc = await Interview.findOne({ _id: req.params.id, userId: req.userId });
    if (doc?.calendarEventId) {
      try {
        const auth = getUserGmailAuth(req.user);
        const calendar = google.calendar({ version: "v3", auth });
        await calendar.events.delete({ calendarId: "primary", eventId: doc.calendarEventId });
      } catch(e) { console.warn("Calendar delete failed (non-critical):", e.message); }
    }
    await Interview.deleteOne({ _id: req.params.id, userId: req.userId });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// KANBAN / PIPELINE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/pipeline ───────────────────────────────────────────────────────
app.get("/api/pipeline", requireAuth, async (req, res) => {
  try {
    const isOwner = req.user.username === (process.env.OWNER_USERNAME || "anav");
    const userFilter = isOwner
      ? { $or: [{ userId: req.userId }, { userId: "default" }] }
      : { userId: req.userId };

    const contacts = await SentEmailLog.aggregate([
      { $match: userFilter },
      { $sort: { sentAt: -1 } },
      { $group: {
        _id: "$hrEmail",
        company:       { $first: "$company" },
        hrName:        { $first: "$hrName" },
        role:          { $first: "$role" },
        stage:         { $first: "$stage" },
        priority:      { $first: "$priority" },
        replied:       { $max:   "$replied" },
        opened:        { $max:   "$opened" },
        sentAt:        { $first: "$sentAt" },
        interviewDate: { $first: "$interviewDate" },
        notes:         { $first: "$notes" },
        docId:         { $first: "$_id" },
      }},
    ]);

    // Group by stage
    const STAGES = ["Applied", "Opened", "Replied", "Interview", "Offer", "Rejected"];
    const pipeline = {};
    STAGES.forEach(s => { pipeline[s] = []; });

    contacts.forEach(c => {
      const stage = c.stage && STAGES.includes(c.stage) ? c.stage
        : c.replied ? "Replied"
        : c.opened  ? "Opened"
        : "Applied";
      if (!pipeline[stage]) pipeline[stage] = [];
      pipeline[stage].push({ ...c, stage });
    });

    res.json({ success: true, pipeline, stages: STAGES });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── PATCH /api/pipeline/move — move card to different stage ─────────────────
app.patch("/api/pipeline/move", requireAuth, async (req, res) => {
  try {
    const { hrEmail, stage } = req.body;
    if (!hrEmail || !stage) return res.status(400).json({ success: false, message: "hrEmail and stage required" });
    const escaped = hrEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await SentEmailLog.updateMany(
      { hrEmail: { $regex: new RegExp("^" + escaped + "$", "i") }, userId: req.userId },
      { $set: { stage } }
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BULK EMAIL WITH AI PERSONALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /api/bulk-send — send personalized emails to multiple HRs ──────────
app.post("/api/bulk-send", requireAuth, async (req, res) => {
  try {
    const { contacts, templateType = "fullstack", customNote = "", useAI = false, skipDuplicates = true } = req.body;
    if (!contacts?.length) return res.status(400).json({ success: false, message: "No contacts" });
    if (contacts.length > 100) return res.status(400).json({ success: false, message: "Max 100 at a time" });

    const results = { sent: 0, failed: 0, skipped: 0, errors: [], skippedContacts: [] };
    const userCfg = getUserConfig(req.user);

    for (const contact of contacts) {
      try {
        // Skip if already applied (duplicate guard)
        if (skipDuplicates && mongoose.connection.readyState === 1) {
          const escaped = contact.hrEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const existing = await SentEmailLog.findOne({
            hrEmail: new RegExp("^" + escaped + "$", "i"),
            userId: req.userId, type: "application",
          }).lean();
          if (existing) {
            results.skipped++;
            results.skippedContacts.push({ email: contact.hrEmail, company: contact.company, lastSentAt: existing.sentAt });
            continue;
          }
        }
        let personalNote = customNote;

        // AI personalization if enabled
        if (useAI && process.env.GROQ_API_KEY) {
          const prompt = `Write 2 sentences personalized email opening for:
HR: ${contact.hrName || "Hiring Manager"} at ${contact.company || "the company"}
Role: ${contact.role || "Software Developer"}
Candidate: ${userCfg.profileName || req.user.displayName}, ${userCfg.totalExp || "4+"} years, skills: ${(userCfg.keySkills || "").split(",").slice(0,3).join(",")}
Output: just the 2 sentences, nothing else`;
          try {
            const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "user", content: prompt }], max_tokens: 100, temperature: 0.9 })
            });
            const aiData = await aiRes.json();
            personalNote = aiData.choices?.[0]?.message?.content?.trim() || customNote;
          } catch {}
        }

        const emailData = {
          hrEmail: contact.hrEmail, hrName: contact.hrName || "",
          company: contact.company || "", role: contact.role || "",
          customNote: personalNote, templateType,
          userCfg, user: req.user
        };
        await sendApplicationEmail(emailData);
        results.sent++;
        await new Promise(r => setTimeout(r, 500)); // rate limit
      } catch(e) {
        results.failed++;
        results.errors.push({ email: contact.hrEmail, error: e.message });
      }
    }

    res.json({ success: true, message: `Sent ${results.sent}, Skipped ${results.skipped} (duplicates), Failed ${results.failed}`, ...results });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});


// ═══════════════════════════════════════════════════════════════════════════════
// CHROME EXTENSION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /api/extension/parse-job — extract company/role/HR email from page text ─
app.post("/api/extension/parse-job", requireAuth, async (req, res) => {
  try {
    const { pageText, pageUrl, pageTitle } = req.body;
    if (!pageText?.trim()) return res.status(400).json({ success: false, message: "pageText required" });

    const truncated = pageText.slice(0, 6000); // keep prompt small & fast

    const prompt = `Extract job application details from this job posting page. Return ONLY valid JSON, no markdown, no explanation.

Page URL: ${pageUrl || "unknown"}
Page Title: ${pageTitle || "unknown"}
Page Content:
${truncated}

Return JSON in this exact shape:
{
  "company": "company name or empty string",
  "role": "job title/role or empty string",
  "hrEmail": "recruiter/HR email if visible on the page, else empty string",
  "hrName": "recruiter/HR name if visible, else empty string",
  "location": "job location if visible, else empty string",
  "confidence": "high" | "medium" | "low"
}`;

    const reply = await groqChat([{ role: "user", content: prompt }], 300, 0.2, "openai/gpt-oss-120b");

    let parsed;
    try {
      const cleaned = reply.trim().replace(/^```json\n?/, "").replace(/```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { company: "", role: "", hrEmail: "", hrName: "", location: "", confidence: "low" };
    }

    res.json({ success: true, ...parsed });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/extension/whoami — lightweight check that the token still works ──
app.get("/api/extension/whoami", requireAuth, async (req, res) => {
  res.json({ success: true, username: req.user.username, displayName: req.user.displayName });
});


// ─── POST /api/template-override — permanently save user's template customizations ─
// Stores intro + highlights in EmailTemplate model — backend merges them into
// the built-in templates at send time (instead of replacing them entirely).
app.post("/api/template-override", requireAuth, async (req, res) => {
  try {
    const { templateId, intro, highlights, subject, customNote } = req.body;
    if (!templateId) return res.status(400).json({ success: false, message: "templateId required" });

    await EmailTemplate.findOneAndUpdate(
      { userId: req.userId, templateId },
      { $set: {
        templateId,
        ...(intro       !== undefined && { intro }),
        ...(highlights  !== undefined && { highlights: highlights.filter(Boolean) }),
        ...(subject     !== undefined && { subject }),
        ...(customNote  !== undefined && { customNote }),
        isOverride: true,  // flag: only override specific fields, don't replace full template
      }},
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Template customization saved permanently ✅" });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/template-override — get user's saved overrides ─────────────────
app.get("/api/template-override", requireAuth, async (req, res) => {
  try {
    const overrides = await EmailTemplate.find({ userId: req.userId, isOverride: true }).lean();
    const map = {};
    overrides.forEach(o => { map[o.templateId] = o; });
    res.json({ success: true, overrides: map });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

app.listen(PORT, () => console.log(`\n🚀 Job Mailer API → http://localhost:${PORT}\n`));
