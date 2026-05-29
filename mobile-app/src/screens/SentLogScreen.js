// SentLogScreen.js
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

export default function SentLogScreen() {
  const [log, setLog] = useState([]);

  useFocusEffect(
    useCallback(() => {
      loadLog();
    }, [])
  );

  const loadLog = async () => {
    const stored = JSON.parse((await AsyncStorage.getItem("sentLog")) || "[]");
    setLog(stored);
  };

  const clearLog = () => {
    Alert.alert("Clear Log", "Delete all sent history?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear", style: "destructive",
        onPress: async () => { await AsyncStorage.removeItem("sentLog"); setLog([]); },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.count}>{log.length} emails sent</Text>
        {log.length > 0 && (
          <TouchableOpacity onPress={clearLog}><Text style={styles.clearBtn}>Clear All</Text></TouchableOpacity>
        )}
      </View>

      {log.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>📭 No emails sent yet</Text>
          <Text style={styles.emptySubText}>Applications and follow-ups will appear here</Text>
        </View>
      ) : (
        log.map((entry) => (
          <View key={entry.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.company}>{entry.company}</Text>
              <View style={[styles.badge, entry.type === "application" ? styles.badgeBlue : styles.badgeGreen]}>
                <Text style={[styles.badgeText, entry.type === "application" ? styles.badgeBlueText : styles.badgeGreenText]}>
                  {entry.type === "application" ? "Applied" : "Follow-up"}
                </Text>
              </View>
            </View>
            {entry.role ? <Text style={styles.role}>{entry.role}</Text> : null}
            <Text style={styles.email}>{entry.hrEmail}</Text>
            <Text style={styles.time}>{entry.time}</Text>
          </View>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f4ff", padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  count: { fontSize: 14, fontWeight: "700", color: "#334155" },
  clearBtn: { fontSize: 13, color: "#ef4444", fontWeight: "600" },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: 18, color: "#94a3b8", fontWeight: "600", marginBottom: 8 },
  emptySubText: { fontSize: 13, color: "#cbd5e1" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#e2e8f8" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  company: { fontWeight: "700", fontSize: 15, color: "#0f172a" },
  role: { fontSize: 12, color: "#64748b", marginBottom: 3 },
  email: { fontSize: 12, color: "#94a3b8", marginBottom: 2 },
  time: { fontSize: 11, color: "#cbd5e1", fontFamily: "monospace" },
  badge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeBlue: { backgroundColor: "#dbeafe", borderColor: "#bfdbfe" },
  badgeGreen: { backgroundColor: "#d1fae5", borderColor: "#6ee7b7" },
  badgeText: { fontSize: 11, fontWeight: "700" },
  badgeBlueText: { color: "#1d4ed8" },
  badgeGreenText: { color: "#059669" },
});
