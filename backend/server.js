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

cron.schedule("* * * * *", async () => {
  const jobs = await loadScheduled();
  const now  = Date.now();
  for (const job of jobs) {
    if (job.status === "pending" && parseScheduledTime(job.scheduledTime) <= now) {
      try {
        // Fetch the user who scheduled this email — so we use THEIR Gmail
        let jobUser = null, jobUserCfg = null;
        if (job.userId && job.userId !== "default" && mongoose.connection.readyState === 1) {
          jobUser = await User.findById(job.userId).lean().catch(() => null);
          if (jobUser) jobUserCfg = getUserConfig(jobUser);
        }
        if (!jobUser) {
          // Fallback to owner (anav) if no user found
          jobUser = await User.findOne({ username: process.env.OWNER_USERNAME || "anav" }).lean().catch(() => null);
          if (jobUser) jobUserCfg = getUserConfig(jobUser);
        }

        const { info, trackRecord } = await sendApplicationEmail({
          ...job.emailData, user: jobUser, userCfg: jobUserCfg,
        });
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
        const failedUsername = jobUser?.username || "unknown";
        await recordGmailFailure(failedUsername, e.message);
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

  // ── Filter out known bots & email clients that auto-prefetch ──────────────
  // Gmail proxy: GoogleImageProxy, Google Image Proxy
  // Outlook safe links, Apple Mail proxy, email scanners
  const BOT_PATTERNS = [
    "googleimageproxy",
    "google image proxy",
    "yahoo pipes",
    "msnbot",
    "bingbot",
    "facebookexternalhit",
    "twitterbot",
    "linkedinbot",
    "applebot",
    "imapfilter",
    "imapproxy",
    "mailchimp",
    "sendgrid",
    "preview",
    "prefetch",
    "outlook-ios",
    "microsoft office",
  ];

  const isBot = BOT_PATTERNS.some(p => ua.includes(p));

  // Also filter by IP: Google proxy ranges start with 66.102 or 74.125 or 209.85
  const isGoogleProxy = /^(66\.102\.|74\.125\.|209\.85\.|172\.217\.|142\.250\.)/.test(ip);

  if (!isBot && !isGoogleProxy) {
    // Real human open — mark it (only if not already opened)
    const record = markTrackingOpened(req.params.trackingId, ip, ua);
    if (record) {
      // Also update MongoDB SentEmailLog
      if (mongoose.connection.readyState === 1) {
        SentEmailLog.updateOne(
          { trackingId: req.params.trackingId, opened: { $ne: true } },
          { $set: { opened: true, openedAt: new Date() } }
        ).catch(() => {});
      }
      logToSheets([record.trackingId, record.hrEmail, record.company||"", record.role||"",
        new Date(record.sentAt).toISOString(), record.trackingId, "Opened", new Date(record.openedAt).toISOString()]);
      console.log(`👁 Real Open: ${record.company} | ${record.hrEmail} | UA: ${ua.slice(0,60)}`);
    }
  } else {
    console.log(`🤖 Bot/Proxy ignored: ${ua.slice(0,80)} | IP: ${ip}`);
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
app.post("/api/ai/write-email", requireAuth, async (req, res) => {
  try {
    const { hrName, company, role, templateType, tone = "professional", keyPoints = "" } = req.body;
    const userCfg   = getUserConfig(req.user);
    const userName  = userCfg.profileName  || req.user.displayName || "Anav Bansal";
    const exp       = userCfg.totalExp     || req.user.totalExp    || "4+ years";
    const skills    = userCfg.keySkills    || req.user.keySkills   || "Node.js, React, AWS";
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
        model: "llama-3.1-8b-instant",
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
        model: "llama-3.1-8b-instant",
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
    const notice    = userCfg.noticePeriod    || req.user.noticePeriod || "30 Days";
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
        model: "llama-3.1-8b-instant",
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
// AI ROUTES — Powered by Groq (llama-3.1-8b-instant)
// ═══════════════════════════════════════════════════════════════════════════════

async function groqChat(messages, maxTokens = 800, temperature = 0.8, model = "llama-3.1-8b-instant") {
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
app.post("/api/ai/write-email", requireAuth, async (req, res) => {
  try {
    const { hrName, company, role, templateType, tone = "professional", keyPoints = "" } = req.body;
    const cfg      = getUserConfig(req.user);
    const userName = cfg.profileName    || req.user.displayName || "Anav Bansal";
    const exp      = cfg.totalExp       || req.user.totalExp    || "4+ years";
    const skills   = cfg.keySkills      || req.user.keySkills   || "";
    const currCo   = cfg.currentCompany || req.user.currentCompany || "";
    const title    = cfg.profileTitle   || req.user.profileTitle || "Software Developer";
    const summary  = cfg.profileSummary || req.user.profileSummary || "";

    const toneMap = {
      professional: "formal and professional — impressive yet humble",
      confident:    "confident and assertive — like a top performer",
      friendly:     "warm and conversational — like talking to a colleague",
      concise:      "very brief and direct — max 2 short paragraphs, no fluff",
      creative:     "creative and memorable — stand out from 100 other applicants",
    };

    const text = await groqChat([{ role: "user", content:
`You are an expert job application email writer. Write a HIGHLY personalized email body.

CANDIDATE PROFILE:
- Name: ${userName}
- Title: ${title}
- Experience: ${exp}
- Current Company: ${currCo}
- Key Skills: ${skills}
- Summary: ${summary}
${keyPoints ? "- MUST highlight: " + keyPoints : ""}

TARGET:
- HR Name: ${hrName || "Hiring Manager"}
- Company: ${company || "the company"}
- Role: ${role || "this position"}
- Template: ${templateType}
- Tone: ${toneMap[tone] || toneMap.professional}

RULES:
- Write ONLY the email body paragraphs (no subject, no Dear/salutation, no signature)
- 2-3 focused paragraphs
- Reference specific skills matching the role
- Make it feel human and genuine — NOT a template
- Each word must earn its place — no fluff
- End with a strong call to action
- Output: just the email body, nothing else` }], 600, 0.85);

    res.json({ success: true, emailBody: text });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── 2. AI Subject Line Generator ────────────────────────────────────────────
app.post("/api/ai/write-subject", requireAuth, async (req, res) => {
  try {
    const { company, role, templateType } = req.body;
    const cfg      = getUserConfig(req.user);
    const userName = cfg.profileName || req.user.displayName || "Anav Bansal";
    const exp      = cfg.totalExp    || req.user.totalExp    || "4+ years";

    const text = await groqChat([{ role: "user", content:
`Generate 5 unique email subject lines for a job application.
Candidate: ${userName} (${exp} exp)
Role: ${role || "Software Developer"}
Company: ${company || "the company"}
Type: ${templateType}

Rules: Max 65 chars each. No emojis. Human sounding. Varied styles (direct/intriguing/value-prop/urgent/creative).
Output ONLY 5 lines numbered 1-5. Nothing else.` }], 200, 0.95);

    const subjects = text.split("\n").filter(l => /^\d+[.)]/.test(l)).map(l => l.replace(/^\d+[.)]+\s*/, "").trim())
      .filter(Boolean);
    res.json({ success: true, subjects });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

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
app.post("/api/ai/screening-reply", requireAuth, async (req, res) => {
  try {
    const { hrMessage = "" } = req.body;
    const cfg = getUserConfig(req.user);
    const u   = req.user;
    const profile = {
      name:      cfg.profileName     || u.displayName  || "Anav Bansal",
      skills:    cfg.keySkills       || u.keySkills    || "",
      exp:       cfg.totalExp        || u.totalExp     || "",
      currCo:    cfg.currentCompany  || u.currentCompany || "",
      currCTC:   cfg.currentCTC      || u.currentCTC   || "",
      expCTC:    cfg.expectedCTC     || u.expectedCTC  || "",
      notice:    cfg.noticePeriod    || u.noticePeriod || "30 Days",
      location:  cfg.currentLocation || u.currentLocation || "",
      prefLoc:   cfg.preferredLocation || u.preferredLocation || "PAN India",
      reason:    cfg.reasonForChange || u.reasonForChange || "Better growth opportunity",
      offer:     cfg.offerInHand     || u.offerInHand  || "No",
      title:     cfg.profileTitle    || u.profileTitle || "Software Developer",
    };

    const text = await groqChat([{ role: "user", content:
`You are ${profile.name}, a ${profile.title} with ${profile.exp} experience.
HR has sent you a screening message. Reply professionally and concisely.

YOUR PROFILE:
Skills: ${profile.skills}
Current Company: ${profile.currCo}
Current CTC: ${profile.currCTC}
Expected CTC: ${profile.expCTC}
Notice Period: ${profile.notice}
Current Location: ${profile.location}
Preferred Location: ${profile.prefLoc}
Reason for Change: ${profile.reason}
Offer in Hand: ${profile.offer}

HR's message: "${hrMessage}"

Rules:
- Answer ONLY what was asked
- Be direct and confident
- Keep under 120 words
- Sound natural — not like a template
- If they ask for profile, give a crisp summary
Output: just the reply, nothing else` }], 300, 0.7);

    res.json({ success: true, reply: text });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

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
}` }], 600, 0.3, "llama-3.3-70b-versatile");

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
}` }], 800, 0.5, "llama-3.3-70b-versatile");

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
}` }], 700, 0.5, "llama-3.3-70b-versatile");

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
    const isOwner = req.user.username === (process.env.OWNER_USERNAME || "anav");
    const userFilter = isOwner
      ? { $or: [{ userId: req.userId }, { userId: "default" }] }
      : { userId: req.userId };

    // Aggregate — group by hrEmail, pick the record with interviewDate set
    const interviews = await SentEmailLog.aggregate([
      { $match: {
        ...( isOwner
          ? { $or: [{ userId: req.userId }, { userId: "default" }] }
          : { userId: req.userId }
        ),
        $or: [
          { stage: { $in: ["Interview", "Interview Scheduled", "Offer", "Selected"] } },
          { interviewDate: { $ne: null } },
        ]
      }},
      { $sort: { interviewDate: 1, sentAt: -1 } },
      // Group by hrEmail — prefer record with interviewDate
      { $group: {
        _id:           "$hrEmail",
        docId:         { $first: "$_id" },
        hrEmail:       { $first: "$hrEmail" },
        hrName:        { $first: "$hrName" },
        company:       { $first: "$company" },
        role:          { $first: "$role" },
        stage:         { $first: "$stage" },
        interviewRound:{ $first: "$interviewRound" },
        interviewDate: { $max:   "$interviewDate" },   // latest date wins
        callLog:       { $first: "$callLog" },
        priority:      { $first: "$priority" },
        sentAt:        { $first: "$sentAt" },
      }},
      { $sort: { interviewDate: 1 } }
    ]);

    // Rename docId → _id for frontend
    const result = interviews.map(i => ({ ...i, _id: i.docId || i._id }));

    res.json({ success: true, interviews: result });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── PATCH /api/interviews/:id ───────────────────────────────────────────────
app.patch("/api/interviews/:id", requireAuth, async (req, res) => {
  try {
    const { stage, interviewRound, interviewDate, callLog, notes, priority } = req.body;
    const updates = {};
    if (stage         !== undefined) updates.stage         = stage;
    if (interviewRound !== undefined) updates.interviewRound = interviewRound;
    if (interviewDate !== undefined) updates.interviewDate  = interviewDate ? new Date(interviewDate) : null;
    if (callLog       !== undefined) updates.callLog        = callLog;
    if (notes         !== undefined) updates.notes          = notes;
    if (priority      !== undefined) updates.priority       = priority;

    await SentEmailLog.updateMany(
      { _id: req.params.id },
      { $set: updates }
    );
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
    const { contacts, templateType = "fullstack", customNote = "", useAI = false } = req.body;
    if (!contacts?.length) return res.status(400).json({ success: false, message: "No contacts" });
    if (contacts.length > 100) return res.status(400).json({ success: false, message: "Max 100 at a time" });

    const results = { sent: 0, failed: 0, errors: [] };
    const userCfg = getUserConfig(req.user);

    for (const contact of contacts) {
      try {
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
              body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: prompt }], max_tokens: 100, temperature: 0.9 })
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

    res.json({ success: true, message: `Sent ${results.sent}, Failed ${results.failed}`, ...results });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

app.listen(PORT, () => console.log(`\n🚀 Job Mailer API → http://localhost:${PORT}\n`));
