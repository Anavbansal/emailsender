import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Linking, KeyboardAvoidingView, Platform,
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, DRIVE_LINK } from "../config";

const BLUE = "#2563eb";
const GREEN = "#059669";

export default function ApplyScreen() {
  const [form, setForm] = useState({ hrEmail: "", hrName: "", company: "", role: "", customNote: "" });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [showReminder, setShowReminder] = useState(false);
  const [lastSent, setLastSent] = useState(null);
  const [reminderDate, setReminderDate] = useState("");

  const handle = (key, val) => {
    setForm((p) => ({ ...p, [key]: val }));
    if (status) setStatus(null);
  };

  const submit = async () => {
    if (!form.hrEmail || !form.company) {
      Alert.alert("Missing Fields", "HR Email and Company are required.");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const res = await axios.post(`${API_URL}/api/send-application`, form);
      setStatus({ type: "success", text: res.data.message });
      const entry = {
        id: Date.now().toString(),
        type: "application",
        company: form.company,
        role: form.role,
        hrEmail: form.hrEmail,
        hrName: form.hrName,
        time: new Date().toLocaleString(),
        messageId: res.data.threadMessageId,
        subject: form.role
          ? `Application for ${form.role} Position — Anav Bansal`
          : "Job Application — Anav Bansal",
      };
      // Save to log
      const existing = JSON.parse((await AsyncStorage.getItem("sentLog")) || "[]");
      await AsyncStorage.setItem("sentLog", JSON.stringify([entry, ...existing]));
      setLastSent(entry);
      setShowReminder(true);
      setForm({ hrEmail: "", hrName: "", company: "", role: "", customNote: "" });
    } catch (err) {
      setStatus({ type: "error", text: err.response?.data?.message || "Failed to send. Check backend." });
    } finally {
      setLoading(false);
    }
  };

  const saveReminder = async () => {
    if (!reminderDate) { Alert.alert("Pick a date", "Enter reminder date first."); return; }
    const reminders = JSON.parse((await AsyncStorage.getItem("reminders")) || "[]");
    const newReminder = {
      id: Date.now().toString(),
      company: lastSent.company,
      role: lastSent.role,
      hrEmail: lastSent.hrEmail,
      reminderDate: new Date(reminderDate).toISOString(),
      daysAgo: "a few days",
      notified: false,
      createdAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem("reminders", JSON.stringify([...reminders, newReminder]));
    setShowReminder(false);
    setReminderDate("");
    Alert.alert("Reminder Set!", `You'll be notified on ${reminderDate}`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">

        {/* Profile strip */}
        <View style={styles.profileStrip}>
          <View style={styles.avatar}><Text style={styles.avatarText}>AB</Text></View>
          <View>
            <Text style={styles.profileName}>Anav Bansal</Text>
            <Text style={styles.profileTitle}>Senior Full Stack Developer</Text>
          </View>
          <TouchableOpacity onPress={() => Linking.openURL(DRIVE_LINK)} style={styles.resumeBtn}>
            <Text style={styles.resumeBtnText}>📄 Resume</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Send Application</Text>
          <Text style={styles.cardSubtitle}>Resume auto-attached + Drive link included</Text>

          <Field label="HR Email *" value={form.hrEmail} onChangeText={(v) => handle("hrEmail", v)}
            placeholder="recruiter@company.com" keyboardType="email-address" />
          <Field label="HR Name" value={form.hrName} onChangeText={(v) => handle("hrName", v)}
            placeholder="e.g. Priya Sharma" />
          <Field label="Company *" value={form.company} onChangeText={(v) => handle("company", v)}
            placeholder="e.g. Google, TCS, Startup XYZ" />
          <Field label="Role" value={form.role} onChangeText={(v) => handle("role", v)}
            placeholder="e.g. Senior Full Stack Developer" />
          <Field label="Custom Note" value={form.customNote} onChangeText={(v) => handle("customNote", v)}
            placeholder="Add a personalized line..." multiline rows={3} />

          {/* Preview */}
          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>📧 Email Preview</Text>
            <Text style={styles.previewLine}>
              <Text style={{ fontWeight: "600" }}>Subject: </Text>
              {form.role ? `Application for ${form.role} — Anav Bansal` : "Job Application — Anav Bansal"}
            </Text>
            <Text style={styles.previewLine}>
              <Text style={{ fontWeight: "600" }}>To: </Text>{form.hrEmail || "—"}{form.hrName ? ` (${form.hrName})` : ""}
            </Text>
            <Text style={styles.previewLine}>
              <Text style={{ fontWeight: "600" }}>Attachment: </Text>Anav_Bansal_Resume.pdf + Drive link
            </Text>
          </View>

          {status && (
            <View style={[styles.alert, status.type === "success" ? styles.alertSuccess : styles.alertError]}>
              <Text style={status.type === "success" ? styles.alertSuccessText : styles.alertErrorText}>
                {status.type === "success" ? "✓ " : "✕ "}{status.text}
              </Text>
            </View>
          )}

          <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]}
            onPress={submit} disabled={loading || !form.hrEmail || !form.company}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>↑ Send Application</Text>}
          </TouchableOpacity>
        </View>

        {/* Reminder prompt */}
        {showReminder && (
          <View style={styles.reminderCard}>
            <Text style={styles.reminderTitle}>🔔 Set Follow-up Reminder?</Text>
            <Text style={styles.reminderSub}>When should we remind you to follow up with {lastSent?.company}?</Text>
            <TextInput style={styles.input} placeholder="YYYY-MM-DD (e.g. 2026-06-07)"
              value={reminderDate} onChangeText={setReminderDate} />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: GREEN }]} onPress={saveReminder}>
                <Text style={styles.btnText}>Set Reminder</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnGhost, { flex: 1 }]} onPress={() => setShowReminder(false)}>
                <Text style={styles.btnGhostText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, rows }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { height: 80, textAlignVertical: "top" }]}
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor="#9ca3af" keyboardType={keyboardType || "default"}
        multiline={multiline} numberOfLines={rows || 1} autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f4ff", padding: 16 },
  profileStrip: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 12, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: "#e2e8f8",
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: BLUE, alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  profileName: { fontWeight: "700", fontSize: 14, color: "#0f172a" },
  profileTitle: { fontSize: 11, color: "#64748b", marginTop: 1 },
  resumeBtn: {
    marginLeft: "auto", backgroundColor: "#dbeafe",
    borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5,
  },
  resumeBtnText: { fontSize: 12, color: BLUE, fontWeight: "600" },
  card: {
    backgroundColor: "#fff", borderRadius: 14,
    padding: 18, borderWidth: 1, borderColor: "#e2e8f8", marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a", marginBottom: 3 },
  cardSubtitle: { fontSize: 12, color: "#64748b", marginBottom: 18 },
  label: { fontSize: 11, fontWeight: "700", color: "#334155", textTransform: "uppercase", marginBottom: 5, letterSpacing: 0.5 },
  input: {
    backgroundColor: "#f8faff", borderWidth: 1.5, borderColor: "#e2e8f8",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: "#0f172a",
  },
  previewBox: { backgroundColor: "#f0f7ff", borderRadius: 8, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#e0e9ff" },
  previewTitle: { fontSize: 11, fontWeight: "700", color: BLUE, textTransform: "uppercase", marginBottom: 6 },
  previewLine: { fontSize: 12, color: "#374151", lineHeight: 20 },
  alert: { borderRadius: 8, padding: 12, marginBottom: 14, borderWidth: 1 },
  alertSuccess: { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
  alertError: { backgroundColor: "#fff1f2", borderColor: "#fecaca" },
  alertSuccessText: { color: "#15803d", fontSize: 13, fontWeight: "500" },
  alertErrorText: { color: "#b91c1c", fontSize: 13, fontWeight: "500" },
  btn: {
    backgroundColor: BLUE, borderRadius: 8,
    paddingVertical: 13, alignItems: "center", marginTop: 4,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnGhost: { borderWidth: 1.5, borderColor: "#e2e8f8", borderRadius: 8, paddingVertical: 13, alignItems: "center" },
  btnGhostText: { color: "#64748b", fontWeight: "600", fontSize: 14 },
  reminderCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: "#bbf7d0", marginBottom: 16,
  },
  reminderTitle: { fontSize: 15, fontWeight: "700", color: "#065f46", marginBottom: 5 },
  reminderSub: { fontSize: 12, color: "#374151", marginBottom: 12 },
});
