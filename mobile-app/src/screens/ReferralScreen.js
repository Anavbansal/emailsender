import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Linking, KeyboardAvoidingView, Platform,
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, DRIVE_LINK } from "../config";

const PURPLE = "#7c3aed";
const BLUE   = "#2563eb";

export default function ReferralScreen() {
  const [form, setForm] = useState({
    employeeEmail: "", employeeName: "", company: "", role: "", customNote: "",
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState(null);

  const handle = (key, val) => {
    setForm((p) => ({ ...p, [key]: val }));
    if (status) setStatus(null);
  };

  const submit = async () => {
    if (!form.employeeEmail || !form.company || !form.role) {
      Alert.alert("Missing Fields", "Employee Email, Company, and Role are required.");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const res = await axios.post(`${API_URL}/api/send-referral`, {
        employeeEmail: form.employeeEmail,
        employeeName:  form.employeeName,
        company:       form.company,
        role:          form.role,
        customNote:    form.customNote,
      });
      setStatus({ type: "success", text: res.data.message });
      const entry = {
        id:           Date.now().toString(),
        type:         "referral",
        company:      form.company,
        role:         form.role,
        hrEmail:      form.employeeEmail,
        hrName:       form.employeeName,
        time:         new Date().toLocaleString(),
        messageId:    res.data.messageId,
        subject:      `Referral Request — ${form.role} at ${form.company}`,
      };
      const existing = JSON.parse((await AsyncStorage.getItem("sentLog")) || "[]");
      await AsyncStorage.setItem("sentLog", JSON.stringify([entry, ...existing]));
      setForm({ employeeEmail: "", employeeName: "", company: "", role: "", customNote: "" });
    } catch (err) {
      setStatus({ type: "error", text: err.response?.data?.message || "Failed to send. Check backend." });
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = form.employeeEmail && form.company && form.role;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">

        {/* Profile strip */}
        <View style={styles.profileStrip}>
          <View style={styles.avatar}><Text style={styles.avatarText}>AB</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>Anav Bansal</Text>
            <Text style={styles.profileTitle}>Senior Full Stack Developer</Text>
          </View>
          <TouchableOpacity onPress={() => Linking.openURL(DRIVE_LINK)} style={styles.resumeBtn}>
            <Text style={styles.resumeBtnText}>📄 Resume</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>🤝 Request Referral</Text>
          <Text style={styles.cardSubtitle}>Send a referral request to a company employee</Text>

          <Field label="Employee Email *" value={form.employeeEmail} onChangeText={(v) => handle("employeeEmail", v)}
            placeholder="employee@company.com" keyboardType="email-address" />
          <Field label="Employee Name" value={form.employeeName} onChangeText={(v) => handle("employeeName", v)}
            placeholder="e.g. Rahul Sharma" />
          <Field label="Company *" value={form.company} onChangeText={(v) => handle("company", v)}
            placeholder="e.g. Google, Flipkart, Razorpay" />
          <Field label="Role *" value={form.role} onChangeText={(v) => handle("role", v)}
            placeholder="e.g. Senior Full Stack Developer" />
          <Field label="Personal Note" value={form.customNote} onChangeText={(v) => handle("customNote", v)}
            placeholder="Add a personal touch — how you know them, why this role..." multiline rows={3} />

          {/* Preview */}
          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>✉ Message Preview</Text>
            <Text style={styles.previewLine}>
              <Text style={{ fontWeight: "600" }}>Subject: </Text>
              {form.role && form.company
                ? `Referral Request — ${form.role} at ${form.company}`
                : "Referral Request — (fill role & company)"}
            </Text>
            <Text style={styles.previewLine}>
              <Text style={{ fontWeight: "600" }}>To: </Text>
              {form.employeeEmail || "—"}{form.employeeName ? ` (${form.employeeName})` : ""}
            </Text>
            <Text style={styles.previewLine}>
              <Text style={{ fontWeight: "600" }}>Includes: </Text>Resume Drive link + LinkedIn
            </Text>
          </View>

          {status && (
            <View style={[styles.alert, status.type === "success" ? styles.alertSuccess : styles.alertError]}>
              <Text style={status.type === "success" ? styles.alertSuccessText : styles.alertErrorText}>
                {status.type === "success" ? "✓ " : "✕ "}{status.text}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, (!canSubmit || loading) && styles.btnDisabled]}
            onPress={submit}
            disabled={!canSubmit || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>🤝 Send Referral Request</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>💡 Tips for a good referral message</Text>
          <Text style={styles.tipItem}>• Keep it short and respectful — they're doing you a favour</Text>
          <Text style={styles.tipItem}>• Mention the specific role you're interested in</Text>
          <Text style={styles.tipItem}>• Add a personal note if you have a mutual connection</Text>
          <Text style={styles.tipItem}>• Include your LinkedIn so they can verify your profile</Text>
        </View>

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
  container: { flex: 1, backgroundColor: "#f5f3ff", padding: 16 },
  profileStrip: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 12, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: "#ede9fe",
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: PURPLE, alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  profileName: { fontWeight: "700", fontSize: 14, color: "#0f172a" },
  profileTitle: { fontSize: 11, color: "#64748b", marginTop: 1 },
  resumeBtn: {
    marginLeft: "auto", backgroundColor: "#ede9fe",
    borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5,
  },
  resumeBtnText: { fontSize: 12, color: PURPLE, fontWeight: "600" },
  card: {
    backgroundColor: "#fff", borderRadius: 14,
    padding: 18, borderWidth: 1, borderColor: "#ede9fe", marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a", marginBottom: 3 },
  cardSubtitle: { fontSize: 12, color: "#64748b", marginBottom: 18 },
  label: { fontSize: 11, fontWeight: "700", color: "#334155", textTransform: "uppercase", marginBottom: 5, letterSpacing: 0.5 },
  input: {
    backgroundColor: "#faf5ff", borderWidth: 1.5, borderColor: "#ede9fe",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: "#0f172a",
  },
  previewBox: {
    backgroundColor: "#f5f3ff", borderRadius: 8, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: "#ddd6fe",
  },
  previewTitle: { fontSize: 11, fontWeight: "700", color: PURPLE, textTransform: "uppercase", marginBottom: 6 },
  previewLine: { fontSize: 12, color: "#374151", lineHeight: 20 },
  alert: { borderRadius: 8, padding: 12, marginBottom: 14, borderWidth: 1 },
  alertSuccess: { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
  alertError: { backgroundColor: "#fff1f2", borderColor: "#fecaca" },
  alertSuccessText: { color: "#15803d", fontSize: 13, fontWeight: "500" },
  alertErrorText: { color: "#b91c1c", fontSize: 13, fontWeight: "500" },
  btn: {
    backgroundColor: PURPLE, borderRadius: 8,
    paddingVertical: 13, alignItems: "center", marginTop: 4,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  tipCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: "#ede9fe", marginBottom: 16,
  },
  tipTitle: { fontSize: 13, fontWeight: "700", color: "#5b21b6", marginBottom: 10 },
  tipItem: { fontSize: 12, color: "#4b5563", lineHeight: 22 },
});
