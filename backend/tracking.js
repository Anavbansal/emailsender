const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const TRACKING_FILE   = path.join(__dirname, "tracking.json");
const EMAILS_DIR      = path.join(__dirname, "emails");
const TRANSPARENT_GIF = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function loadTrackingData() {
  try {
    const raw    = fs.readFileSync(TRACKING_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveTrackingData(records) {
  fs.writeFileSync(TRACKING_FILE, JSON.stringify(records, null, 2), "utf8");
}

function storeEmailHtml(trackingId, html) {
  if (!html) return;
  if (!fs.existsSync(EMAILS_DIR)) fs.mkdirSync(EMAILS_DIR);
  fs.writeFileSync(path.join(EMAILS_DIR, `${trackingId}.html`), html, "utf8");
}

function getEmailHtml(trackingId) {
  const p = path.join(EMAILS_DIR, `${trackingId}.html`);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function createTrackingRecord({ hrEmail, hrName = "", company, role, subject = "", sentAt = Date.now(), type = "application", username = null }) {
  const trackingId = randomUUID();
  const record = { trackingId, type, hrEmail, hrName, company, role, subject, sentAt, opened: false, openedAt: null, username };
  const records = loadTrackingData();
  records.push(record);
  saveTrackingData(records);
  return record;
}

function markTrackingOpened(trackingId, ip, userAgent) {
  const records = loadTrackingData();
  const idx = records.findIndex(r => r.trackingId === trackingId);
  if (idx === -1) return null;
  // Only mark once — ignore repeat pixel fires
  if (records[idx].opened) {
    console.log(`👁 Already opened — ignoring repeat: ${trackingId}`);
    return null;
  }
  records[idx] = { ...records[idx], opened: true, openedAt: Date.now(), ip, userAgent };
  saveTrackingData(records);
  return records[idx];
}

function updateTrackingMessageId(trackingId, messageId) {
  const records = loadTrackingData();
  const idx = records.findIndex(r => r.trackingId === trackingId);
  if (idx === -1) return;
  records[idx].messageId = messageId;
  saveTrackingData(records);
}

function getTrackingRecords() { return loadTrackingData(); }
function getPixelBuffer()     { return Buffer.from(TRANSPARENT_GIF, "base64"); }

module.exports = {
  createTrackingRecord, markTrackingOpened, updateTrackingMessageId,
  getTrackingRecords, getPixelBuffer, storeEmailHtml, getEmailHtml,
};
