import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

export default function RemindersScreen() {
  const [reminders, setReminders] = useState([]);

  useFocusEffect(useCallback(() => { loadReminders(); }, []));

  const loadReminders = async () => {
    const stored = JSON.parse((await AsyncStorage.getItem("reminders")) || "[]");
    setReminders(stored.sort((a, b) => new Date(a.reminderDate) - new Date(b.reminderDate)));
  };

  const deleteReminder = async (id) => {
    const updated = reminders.filter((r) => r.id !== id);
    await AsyncStorage.setItem("reminders", JSON.stringify(updated));
    setReminders(updated);
  };

  const snoozeReminder = async (id) => {
    const updated = reminders.map((r) => {
      if (r.id !== id) return r;
      const newDate = new Date(r.reminderDate);
      newDate.setDate(newDate.getDate() + 2);
      return { ...r, reminderDate: newDate.toISOString(), notified: false };
    });
    await AsyncStorage.setItem("reminders", JSON.stringify(updated));
    setReminders(updated.sort((a, b) => new Date(a.reminderDate) - new Date(b.reminderDate)));
    Alert.alert("Snoozed!", "Reminder pushed by 2 days.");
  };

  const getDaysLeft = (dateStr) => {
    const diff = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return "Overdue!";
    if (diff === 0) return "Today!";
    return `In ${diff} day${diff !== 1 ? "s" : ""}`;
  };

  const getUrgencyColor = (dateStr) => {
    const diff = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return "#ef4444";
    if (diff <= 1) return "#f59e0b";
    return "#059669";
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.info}>
        Reminders are checked every minute. Make sure notifications are enabled for this app.
      </Text>

      {reminders.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>🔔 No reminders set</Text>
          <Text style={styles.emptySub}>Set reminders after sending applications</Text>
        </View>
      ) : (
        reminders.map((r) => (
          <View key={r.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.company}>{r.company}</Text>
              <Text style={[styles.daysLeft, { color: getUrgencyColor(r.reminderDate) }]}>
                {getDaysLeft(r.reminderDate)}
              </Text>
            </View>
            {r.role ? <Text style={styles.role}>{r.role}</Text> : null}
            <Text style={styles.email}>{r.hrEmail}</Text>
            <Text style={styles.date}>📅 {new Date(r.reminderDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
            {r.notified && <Text style={styles.notified}>✓ Notified</Text>}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.snoozeBtn} onPress={() => snoozeReminder(r.id)}>
                <Text style={styles.snoozeBtnText}>⏰ Snooze 2d</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteReminder(r.id)}>
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f4ff", padding: 16 },
  info: { fontSize: 12, color: "#64748b", backgroundColor: "#dbeafe", borderRadius: 8, padding: 10, marginBottom: 16, lineHeight: 18 },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: 18, color: "#94a3b8", fontWeight: "600", marginBottom: 8 },
  emptySub: { fontSize: 13, color: "#cbd5e1" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#e2e8f8" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  company: { fontWeight: "700", fontSize: 15, color: "#0f172a" },
  daysLeft: { fontSize: 13, fontWeight: "700" },
  role: { fontSize: 12, color: "#64748b", marginBottom: 3 },
  email: { fontSize: 12, color: "#94a3b8", marginBottom: 4 },
  date: { fontSize: 12, color: "#64748b", marginBottom: 4 },
  notified: { fontSize: 11, color: "#059669", fontWeight: "600", marginBottom: 8 },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  snoozeBtn: { flex: 1, backgroundColor: "#fef9c3", borderRadius: 8, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: "#fde68a" },
  snoozeBtnText: { fontSize: 12, fontWeight: "600", color: "#92400e" },
  deleteBtn: { flex: 1, backgroundColor: "#fee2e2", borderRadius: 8, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: "#fecaca" },
  deleteBtnText: { fontSize: 12, fontWeight: "600", color: "#b91c1c" },
});
