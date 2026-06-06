require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "sent-emails.json");

function loadEmails() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {}
  return [];
}

function saveEmail(record) {
  const emails = loadEmails();
  emails.unshift(record);
  fs.writeFileSync(DATA_FILE, JSON.stringify(emails, null, 2));
}

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Nodemailer Transporter ───────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// Verify Gmail authentication on startup
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Gmail authentication failed:", error.message);
    console.error(
      "   → Make sure GMAIL_USER and GMAIL_PASS are set correctly in .env"
    );
    console.error(
      "   → GMAIL_PASS must be a Google App Password, not your regular password."
    );
  } else {
    console.log("✅ Gmail transporter is ready to send emails.");
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Email Sender API is running." });
});

// GET /api/sent-emails
app.get("/api/sent-emails", (req, res) => {
  res.json(loadEmails());
});

// POST /api/send-email
app.post("/api/send-email", async (req, res) => {
  const { to, subject, message } = req.body;

  // Validation: all fields are required
  if (!to || !subject || !message) {
    return res.status(400).json({
      success: false,
      message:
        "Missing required fields. Please provide 'to', 'subject', and 'message'.",
    });
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({
      success: false,
      message: "Invalid recipient email address.",
    });
  }

  // Compose mail options
  const mailOptions = {
    from: `"Email Sender App" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text: message,
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 12px;">
        <div style="background: #fff; padding: 32px; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.07);">
          <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 18px;">📬 New Message</h2>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin-bottom: 20px;" />
          <p style="color: #374151; line-height: 1.7; white-space: pre-wrap;">${message}</p>
        </div>
        <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 16px;">
          Sent via Email Sender App
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📤 Email sent → ${to} | Message ID: ${info.messageId}`);
    saveEmail({
      id: info.messageId,
      to,
      subject,
      sentAt: new Date().toISOString(),
      status: "Sent",
    });
    return res.status(200).json({
      success: true,
      message: `Email successfully sent to ${to}!`,
      messageId: info.messageId,
    });
  } catch (error) {
    console.error("❌ Failed to send email:", error.message);
    return res.status(500).json({
      success: false,
      message:
        "Failed to send email. Please check your server credentials and try again.",
      error: error.message,
    });
  }
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Email Sender Backend running on http://localhost:${PORT}`);
  console.log(`   POST http://localhost:${PORT}/api/send-email\n`);
});
