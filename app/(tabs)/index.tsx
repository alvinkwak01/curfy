import { Mascot } from "@/components/Mascot";
import { StarBackground } from "@/components/StarBackground";
import { Colors, Fonts } from "@/constants/theme";
import { useSleep } from "@/context/SleepContext";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 18) return "Good evening";
  return "Stay strong";
}

function minutesUntil(bedtime: string): number {
  const [h, m] = bedtime.split(":").map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

function getStreakEmoji(streak: number): string {
  if (streak === 0) return "💤";
  if (streak < 3) return "🌙";
  if (streak < 7) return "⭐";
  if (streak < 14) return "🔥";
  if (streak < 30) return "✨";
  return "🌟";
}

function getMilestoneBadge(streak: number): { label: string; color: string } | null {
  if (streak >= 100) return { label: "🌟 Century", color: Colors.gold };
  if (streak >= 60) return { label: "✨ 60 Nights", color: Colors.successGreen };
  if (streak >= 30) return { label: "🔥 30 Nights", color: Colors.orange };
  if (streak >= 14) return { label: "⚡ Two Weeks", color: Colors.accentViolet };
  if (streak >= 7) return { label: "🌙 One Week", color: Colors.primaryCyan };
  return null;
}

function getMoodMessage(streak: number, unlocks: number): string {
  if (unlocks > 0) return `You unlocked ${unlocks}x tonight. Don't push it.`;
  if (streak > 3) return `${streak}-night streak. Don't ruin it now.`;
  return "Tonight's the night. Lumi's ready.";
}

export default function Home() {
  const { userName, streak, todayUnlocks, bedtime, sleepLog } = useSleep();
  const [minsLeft, setMinsLeft] = useState(minutesUntil(bedtime));

  useEffect(() => {
    const id = setInterval(() => setMinsLeft(minutesUntil(bedtime)), 15000);
    return () => clearInterval(id);
  }, [bedtime]);

  const hours = Math.floor(minsLeft / 60);
  const mins = minsLeft % 60;
  const isUrgent = minsLeft <= 10;
  const isImminent = minsLeft <= 2;

  const milestone = getMilestoneBadge(streak);
  const mood = todayUnlocks > 2 ? "stern" : streak > 3 ? "happy" : "sleepy";

  const totalNights = sleepLog.length;
  const cleanNights = sleepLog.filter((e) => e.unlockAttempts === 0).length;
  const totalEscapes = sleepLog.reduce((sum, e) => sum + e.unlockAttempts, 0);

  return (
    <View style={styles.container}>
      <StarBackground />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View entering={FadeIn.duration(600)} style={styles.headerRow}>
          <Text style={styles.greeting}>{getGreeting(userName)}</Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/settings");
            }}
          >
            <Ionicons name="settings-outline" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.clockSection}>
          <Text style={styles.time}>
            {new Date().getHours().toString().padStart(2, "0")}:
            {new Date().getMinutes().toString().padStart(2, "0")}
          </Text>
          <View
            style={[
              styles.countdownPill,
              isUrgent && styles.countdownUrgent,
            ]}
          >
            <Text style={[styles.countdownText, isUrgent && styles.countdownUrgentText]}>
              {isImminent
                ? "Lumi activates NOW"
                : isUrgent
                ? `${minsLeft}m until lockdown`
                : `${hours}h ${mins}m until bedtime`}
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(200)} style={styles.mascotSection}>
          <Mascot size={100} mood={mood} animate />
          <Text style={styles.moodMessage}>{getMoodMessage(streak, todayUnlocks)}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(300)} style={styles.statsCard}>
          <View style={styles.statsLeft}>
            <Text style={styles.streakEmoji}>{getStreakEmoji(streak)}</Text>
            <Text style={styles.streakNum}>{streak}</Text>
            <Text style={styles.streakLabel}>nights streak</Text>
            {milestone && (
              <View style={[styles.milestonePill, { borderColor: milestone.color }]}>
                <Text style={[styles.milestoneText, { color: milestone.color }]}>
                  {milestone.label}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.divider} />
          <View style={styles.statsRight}>
            <View>
              <Text style={styles.quickStatLabel}>bedtime</Text>
              <Text style={styles.quickStatValue}>{bedtime}</Text>
            </View>
            <View>
              <Text style={styles.quickStatLabel}>unlocks tonight</Text>
              <Text
                style={[
                  styles.quickStatValue,
                  todayUnlocks > 0 && { color: Colors.dangerRed },
                ]}
              >
                {todayUnlocks}
              </Text>
            </View>
          </View>
        </Animated.View>

        {totalNights > 0 && (
          <Animated.View entering={FadeInDown.duration(500).delay(400)} style={styles.recordCard}>
            <View style={styles.recordHeader}>
              <Text style={styles.recordTitle}>Your Record</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/leaderboard")}>
                <Text style={styles.recordLink}>See all →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.recordRow}>
              <Text style={styles.recordLabel}>Total nights</Text>
              <Text style={styles.recordValue}>{totalNights}</Text>
            </View>
            <View style={styles.recordRow}>
              <Text style={styles.recordLabel}>Clean nights</Text>
              <Text style={styles.recordValue}>{cleanNights}</Text>
            </View>
            <View style={styles.recordRow}>
              <Text style={styles.recordLabel}>Total escapes</Text>
              <Text
                style={[
                  styles.recordValue,
                  totalEscapes > 5 && { color: Colors.dangerRed },
                ]}
              >
                {totalEscapes}
              </Text>
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40, gap: 28 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.regular },
  clockSection: { alignItems: "center", gap: 10 },
  time: { color: Colors.textPrimary, fontSize: 64, fontFamily: Fonts.bold, letterSpacing: -2 },
  countdownPill: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  countdownUrgent: {
    backgroundColor: "rgba(255, 68, 102, 0.08)",
    borderColor: Colors.dangerRed,
  },
  countdownText: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.regular },
  countdownUrgentText: { color: Colors.dangerRed },
  mascotSection: { alignItems: "center", gap: 10 },
  moodMessage: {
    color: Colors.textMuted,
    fontSize: 14,
    fontFamily: Fonts.regular,
    textAlign: "center",
    maxWidth: 240,
  },
  statsCard: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 20,
  },
  statsLeft: { flex: 1, alignItems: "flex-start", gap: 4 },
  streakEmoji: { fontSize: 20 },
  streakNum: { color: Colors.primaryCyan, fontSize: 48, fontFamily: Fonts.bold },
  streakLabel: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.regular },
  milestonePill: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  milestoneText: { fontSize: 11, fontFamily: Fonts.semiBold },
  divider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 16 },
  statsRight: { justifyContent: "space-between", gap: 16 },
  quickStatLabel: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.regular },
  quickStatValue: { color: Colors.textPrimary, fontSize: 18, fontFamily: Fonts.semiBold, marginTop: 2 },
  recordCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 20,
    gap: 10,
  },
  recordHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  recordTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: Fonts.semiBold },
  recordLink: { color: Colors.primaryCyan, fontSize: 13, fontFamily: Fonts.medium },
  recordRow: { flexDirection: "row", justifyContent: "space-between" },
  recordLabel: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.regular },
  recordValue: { color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.semiBold },
});
