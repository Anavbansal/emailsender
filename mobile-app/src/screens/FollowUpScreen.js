import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../config";

const GREEN = "#059669";

export default function FollowUpScreen() {
  const [sentLog, setSentLog] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    hrEmail: "", hrName: "", company: "", role: "",
    originalDate: "", customNote: "", originalMessageId: "", originalSubject: "",
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    loadLog();
  }, []);

  const loadLog = async () => {
    const log = JSON.parse((await AsyncStorage.getItem("sentLog")) || "[]");
    setSentLog(log.filter((e) => e.type === "application"));
  };

  const selectEntry = (entry) => {
    setSelected(entry);
    setForm({
      hrEmail: entry.hrEmail || "",
      hrName: entry.hrName || "",
      company: entry.company || "",
      role: entry.role || "",
      originalDate: entry.time || "",
      customNote: "",
      originalMessageId: entry.messageId || "",
      originalSubject: entry.subject || "",
    });
    if (status) setStatus(null);
  };

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
      const res = await axios.post(`${API_URL}/api/send-followup`, form);
      setStatus({ type: "success", text: res.data.message });
      const entry = {
        id: Date.now().toString(),
        type: "followup",
        company: form.company,
        role: form.role,
        hrEmail: form.hrEmail,
        hrName: form.hrName,
        time: new Date().toLocaleString(),
        messageId: res.data.messageId,
        subject: form.originalSubject,
      };
      const existing = JSON.parse((await AsyncStorage.getItem("sentLog")) || "[]");
      await AsyncStorage.setItem("sentLog", JSON.stringify([entry, ...existing]));
      setForm({ hrEmail: "", hrName: "", company: "", role: "", originalDate: "", customNote: "", originalMessageId: "", originalSubject: "" });
      setSelected(null);
    } catch (err) {
      setStatus({ type: "error", text: err.response?.data?.message || "Failed to send." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">

        {sentLog.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>⚡ Quick Fill from Sent Applications</Text>
            {sentLog.slice(0, 5).map((entry) => (
              <TouchableOpacity key={entry.id} style={[styles.logItem, selected?.id === entry.id && styles.logItemSelected]}
                onPress={() => selectEntry(entry)}>
                <Text style={styles.logCompany}>{entry.company}</Text>
                {entry.role ? <Text style={styles.logRole}>{entry.role}</Text> : null}
                <Text style={styles.logEmail}>{entry.hrEmail}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Follow-up Email</Text>
          <Text style={styles.cardSubtitle}>Sends in the same thread as your original application</Text>

          {["hrEmail *", "hrName", "company *", "role", "originalDate"].map((f) => {
            const key = f.replace(" *", "");
            const labels = { hrEmail: "HR Email *", hrName: "HR Name", company: "Company *", role: "Role", originalDate: "Original Application Date" };
            const placeholders = { hrEmail: "recruiter@company.com", hrName: "e.g. Priya Sharma", company: "Company Name", role: "e.g. Senior Dev", originalDate: "e.g. 25 May 2026" };
            return (
              <View key={key} style={{ marginBottom: 12 }}>
                <Text style={styles.label}>{labels[key]}</Text>
                <TextInput style={styles.input} value={form[key]} onChangeText={(v) => handle(key, v)}
                  placeholder={placeholders[key]} placeholderTextColor="#9ca3af"
                  autoCapitalize="none" keyboardType={key === "hrEmail" ? "email-address" : "default"} />
              </View>
            );
          })}

          <View style={{ marginBottom: 12 }}>
            <Text style={styles.label}>Custom Note</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]}
              value={form.customNote} onChangeText={(v) => handle("customNote", v)}
              placeholder="Add a personal line..." placeholderTextColor="#9ca3af" multiline />
          </View>

          {form.originalMessageId ? (
            <View style={styles.threadNotice}>
              <Text style={styles.threadText}>🧵 This will reply in the same thread as your original email.</Text>
            </View>
          ) : null}

          {status && (
            <View style={[styles.alert, status.type === "success" ? styles.alertSuccess : styles.alertError]}>
              <Text style={status.type === "success" ? styles.alertSuccessText : styles.alertErrorText}>
                {status.type === "success" ? "✓ " : "✕ "}{status.text}
              </Text>
            </View>
          )}

          <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]}
            onPress={submit} disabled={loading || !form.hrEmail || !form.company}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>↑ Send Follow-up</Text>}
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f4ff", padding: 16 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 18, borderWidth: 1, borderColor: "#e2e8f8", marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a", marginBottom: 3 },
  cardSubtitle: { fontSize: 12, color: "#64748b", marginBottom: 18 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#059669", marginBottom: 12 },
  logItem: { backgroundColor: "#f8faff", borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "#e2e8f8" },
  logItemSelected: { borderColor: "#6ee7b7", backgroundColor: "#f0fdf4" },
  logCompany: { fontWeight: "700", fontSize: 13, color: "#0f172a" },
  logRole: { fontSize: 11, color: "#64748b", marginTop: 1 },
  logEmail: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  label: { fontSize: 11, fontWeight: "700", color: "#334155", textTransform: "uppercase", marginBottom: 5 },
  input: { backgroundColor: "#f8faff", borderWidth: 1.5, borderColor: "#e2e8f8", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0f172a" },
  threadNotice: { backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#6ee7b7", borderRadius: 8, padding: 10, marginBottom: 14 },
  threadText: { fontSize: 12, color: "#065f46" },
  alert: { borderRadius: 8, padding: 12, marginBottom: 14, borderWidth: 1 },
  alertSuccess: { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
  alertError: { backgroundColor: "#fff1f2", borderColor: "#fecaca" },
  alertSuccessText: { color: "#15803d", fontSize: 13, fontWeight: "500" },
  alertErrorText: { color: "#b91c1c", fontSize: 13, fontWeight: "500" },
  btn: { backgroundColor: GREEN, borderRadius: 8, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
