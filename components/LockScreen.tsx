import React, { useEffect, useState } from "react";
import {
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HoldButton } from "@/components/HoldButton";
import { StarBackground } from "@/components/StarBackground";
import { Colors, Fonts } from "@/constants/theme";
import { useSleep } from "@/context/SleepContext";

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function getStreakMessage(streak: number, unlocks: number): string {
  if (streak === 0 && unlocks === 0) return "First night. Make it count.";
  if (streak === 0 && unlocks > 0) return "You broke your streak. Start over tonight.";
  if (unlocks > 2) return `${streak}-night streak and you've already escaped. Disgusting.`;
  if (unlocks > 0) return `${streak}-night streak. You slipped once. Don't make it worse.`;
  if (streak >= 30) return `${streak} nights. You've ascended. Don't be stupid now.`;
  if (streak >= 14) return `${streak}-night streak. Genuinely impressive.`;
  if (streak >= 7) return `${streak} nights straight. You're actually doing it.`;
  if (streak >= 3) return `${streak}-night streak. Don't ruin it now.`;
  if (streak === 1) return "One night down. Let's make it two.";
  return `${streak}-night streak. Hold the line.`;
}

function getStreakEmoji(streak: number): string {
  if (streak === 0) return "💤";
  if (streak < 3) return "🌙";
  if (streak < 7) return "⭐";
  if (streak < 14) return "🔥";
  if (streak < 30) return "✨";
  return "🌟";
}

export function LockScreen() {
  const { unlockScreen, todayUnlocks, streak } = useSleep();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const streakMsg = getStreakMessage(streak, todayUnlocks);
  const emoji = getStreakEmoji(streak);

  return (
    <View style={[styles.container, { paddingTop: topPad + 16, paddingBottom: bottomPad + 16 }]}>
      {Platform.OS !== "web" && <StatusBar barStyle="light-content" />}
      <StarBackground />

      <View style={styles.header}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.appName}>DUSK</Text>
            <Text style={styles.tagline}>Bedtime. For real.</Text>
          </View>
          {streak > 0 && (
            <View style={styles.streakPill}>
              <Text style={styles.streakEmoji}>{emoji}</Text>
              <Text style={styles.streakCount}>{streak}</Text>
              <Text style={styles.streakNights}>{streak === 1 ? "night" : "nights"}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.clockSection}>
        <Text style={styles.time}>{formatTime(now)}</Text>
        <Text style={styles.date}>{formatDate(now)}</Text>
      </View>

      <View style={styles.messageSection}>
        <Text style={styles.streakMessage}>{streakMsg}</Text>
      </View>

      <View style={styles.buttonSection}>
        <HoldButton onUnlock={unlockScreen} unlockCount={todayUnlocks} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerNote}>Returns in 15 min if unlocked</Text>
        <Text style={styles.callNote}>📞 Incoming calls always come through</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  header: {
    width: "100%",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  appName: {
    color: Colors.primaryCyan,
    fontSize: 13,
    fontFamily: Fonts.bold,
    letterSpacing: 6,
    opacity: 0.8,
  },
  tagline: {
    color: Colors.textGhost,
    fontSize: 10,
    fontFamily: Fonts.regular,
    letterSpacing: 1,
    marginTop: 2,
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  streakEmoji: {
    fontSize: 14,
  },
  streakCount: {
    color: Colors.primaryCyan,
    fontSize: 15,
    fontFamily: Fonts.bold,
  },
  streakNights: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.regular,
  },
  clockSection: {
    alignItems: "center",
    gap: 6,
  },
  time: {
    color: Colors.textPrimary,
    fontSize: 64,
    fontFamily: Fonts.bold,
    letterSpacing: -2,
  },
  date: {
    color: Colors.textMuted,
    fontSize: 15,
    fontFamily: Fonts.regular,
    letterSpacing: 0.3,
  },
  messageSection: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
  },
  streakMessage: {
    color: "#8A8ABF",
    fontSize: 14,
    fontFamily: Fonts.regular,
    textAlign: "center",
    lineHeight: 20,
  },
  buttonSection: {
    alignItems: "center",
  },
  footer: {
    alignItems: "center",
    gap: 6,
  },
  footerNote: {
    color: Colors.textGhost,
    fontSize: 12,
    fontFamily: Fonts.regular,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  callNote: {
    color: Colors.textGhost,
    fontSize: 11,
    fontFamily: Fonts.regular,
    textAlign: "center",
    letterSpacing: 0.2,
  },
});
