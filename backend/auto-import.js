const fs   = require("fs");
const path = require("path");

async function autoImportContacts(SentEmailLog, mongoose) {
  const importFile = path.join(__dirname, "contacts_import.json");
  const doneFile   = path.join(__dirname, "contacts_import.done");

  if (fs.existsSync(doneFile)) return;
  if (!fs.existsSync(importFile)) return;
  if (mongoose.connection.readyState !== 1) return;

  try {
    const contacts = JSON.parse(fs.readFileSync(importFile, "utf8"));
    let inserted = 0, updated = 0, skipped = 0;

    for (const c of contacts) {
      if (!c.hrEmail) { skipped++; continue; }
      try {
        const escaped  = c.hrEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const existing = await SentEmailLog.findOne({ hrEmail: new RegExp("^" + escaped + "$", "i") }).lean();
        if (existing) {
          const updates = {};
          if (c.replied && !existing.replied)        updates.replied   = true;
          if (c.repliedAt && !existing.repliedAt)    updates.repliedAt = new Date(c.repliedAt);
          if (c.notes && !existing.notes)            updates.notes     = c.notes;
          if (Object.keys(updates).length > 0) {
            await SentEmailLog.updateOne({ _id: existing._id }, { $set: updates });
            updated++;
          } else skipped++;
        } else {
          await SentEmailLog.create({
            hrEmail:      c.hrEmail,
            hrName:       c.hrName      || "",
            company:      c.company     || "",
            role:         c.role        || "",
            type:         "application",
            status:       c.status      || "Sent",
            sentAt:       c.sentAt      ? new Date(c.sentAt) : new Date(),
            replied:      c.replied     || false,
            repliedAt:    c.repliedAt   ? new Date(c.repliedAt) : null,
            followupSent: c.followupSent|| false,
            notes:        c.notes       || "",
            source:       c.source      || "import",
          });
          inserted++;
        }
      } catch { skipped++; }
    }

    fs.writeFileSync(doneFile, new Date().toISOString());
    console.log(`✅ Contact import done: inserted=${inserted} updated=${updated} skipped=${skipped}`);
  } catch (e) {
    console.error("❌ Contact import failed:", e.message);
  }
}

module.exports = autoImportContacts;
