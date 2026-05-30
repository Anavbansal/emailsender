import React, { useEffect, useRef, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text, Platform } from "react-native";

import ApplyScreen from "./src/screens/ApplyScreen";
import FollowUpScreen from "./src/screens/FollowUpScreen";
import ReferralScreen from "./src/screens/ReferralScreen";
import SentLogScreen from "./src/screens/SentLogScreen";
import RemindersScreen from "./src/screens/RemindersScreen";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const Tab = createBottomTabNavigator();

const BLUE = "#2563eb";
const GREEN = "#059669";
const GRAY = "#9ca3af";

function TabIcon({ name, focused, color }) {
  const icons = {
    Apply: focused ? "✉" : "✉",
    FollowUp: focused ? "🔁" : "🔁",
    Referral: focused ? "🤝" : "🤝",
    SentLog: focused ? "📋" : "📋",
    Reminders: focused ? "🔔" : "🔔",
  };
  return <Text style={{ fontSize: 20 }}>{icons[name]}</Text>;
}

export default function App() {
  const notificationListener = useRef();
  const responseListener = useRef();
  const [expoPushToken, setExpoPushToken] = useState("");

  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      if (token) setExpoPushToken(token);
    });

    // Check reminders every minute
    const interval = setInterval(checkReminders, 60000);
    checkReminders(); // immediate check

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log("Notification received:", notification);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log("Notification tapped:", response);
      });

    return () => {
      clearInterval(interval);
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={route.name} focused={focused} color={color} />
          ),
          tabBarActiveTintColor: BLUE,
          tabBarInactiveTintColor: GRAY,
          tabBarStyle: {
            backgroundColor: "#ffffff",
            borderTopColor: "#e5e7eb",
            paddingBottom: 5,
            height: 60,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
          headerStyle: { backgroundColor: BLUE },
          headerTintColor: "#ffffff",
          headerTitleStyle: { fontWeight: "700" },
        })}
      >
        <Tab.Screen
          name="Apply"
          component={ApplyScreen}
          options={{ title: "Apply", headerTitle: "Send Application" }}
        />
        <Tab.Screen
          name="FollowUp"
          component={FollowUpScreen}
          options={{ title: "Follow-up", headerTitle: "Send Follow-up" }}
        />
        <Tab.Screen
          name="Referral"
          component={ReferralScreen}
          options={{ title: "Referral", headerTitle: "Request Referral" }}
        />
        <Tab.Screen
          name="SentLog"
          component={SentLogScreen}
          options={{ title: "Sent Log", headerTitle: "Sent History" }}
        />
        <Tab.Screen
          name="Reminders"
          component={RemindersScreen}
          options={{ title: "Reminders", headerTitle: "Follow-up Reminders" }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

async function registerForPushNotificationsAsync() {
  let token;
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;
    token = (await Notifications.getExpoPushTokenAsync()).data;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reminders", {
      name: "Follow-up Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563eb",
    });
  }
  return token;
}

async function checkReminders() {
  try {
    const stored = await AsyncStorage.getItem("reminders");
    if (!stored) return;
    const reminders = JSON.parse(stored);
    const today = new Date().toDateString();

    const updated = await Promise.all(
      reminders.map(async (r) => {
        if (!r.notified && new Date(r.reminderDate).toDateString() === today) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Follow-up Reminder: ${r.company}`,
              body: `You applied ${r.daysAgo || "recently"}. Time to follow up with ${r.hrEmail}!`,
              data: { screen: "FollowUp", data: r },
            },
            trigger: null, // immediate
          });
          return { ...r, notified: true };
        }
        return r;
      })
    );
    await AsyncStorage.setItem("reminders", JSON.stringify(updated));
  } catch (e) {
    console.log("Reminder check error:", e);
  }
}
