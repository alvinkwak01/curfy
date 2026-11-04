import { StarBackground } from "@/components/StarBackground";
import { Colors, Fonts } from "@/constants/theme";
import { useSleep } from "@/context/SleepContext";
import {
  CurfyAppLabel,
  readProtectedAppChoices,
  type CurfyProtectedAppsSnapshot,
} from "@/modules/curfy-protected-apps";
import { isBedtimeWindowActive } from "@/lib/bedtimeWindow";
import { clockLabel } from "@/lib/protectionRoutine";
import { activeExceptionExpiresAt, getBedtimeProtectionStatus, BlockModeId, selectionIdForMode } from "@/lib/screenTime";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

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
  if (streak >= 60) return { label: "✨ 60 Windows", color: Colors.successGreen };
  if (streak >= 30) return { label: "🔥 30 Windows", color: Colors.orange };
  if (streak >= 14) return { label: "⚡ Two Weeks", color: Colors.accentViolet };
  if (streak >= 7) return { label: "🌙 One Week", color: Colors.primaryCyan };
  return null;
}

function getMoodMessage(streak: number, unlocks: number): string {
  if (unlocks > 0) return `You've requested ${unlocks} temporary app exception${unlocks === 1 ? "" : "s"} in this window.`;
  if (streak > 3) return `${streak} protection windows logged in a row. Keep your boundary.`;
  return "Make the next tap intentional.";
}

export default function Home() {
  const { userName, streak, todayUnlocks, bedtime, wakeTime, blockMode, sleepLog } = useSleep();
  const [minsLeft, setMinsLeft] = useState(minutesUntil(bedtime));
  // Apple's SwiftUI Label(ApplicationToken) shows the real chosen app icon
  // and name without handing its identifier to React Native.
  const [protectedApp, setProtectedApp] = useState<CurfyProtectedAppsSnapshot | null>(null);
  const selectedMode: BlockModeId | null =
    blockMode === "social" || blockMode === "most" || blockMode === "custom"
      ? blockMode : null;
  const inBedtimeWindow = !!selectedMode &&
    isBedtimeWindowActive(new Date(), bedtime, wakeTime);
  useFocusEffect(useCallback(() => {
    if (!inBedtimeWindow || !selectedMode) {
      setProtectedApp(null);
      return;
    }
    try {
      const snapshot = readProtectedAppChoices(selectionIdForMode(selectedMode));
      // Free protects exactly one app, never the first of several.
      setProtectedApp(snapshot.count === 1 ? snapshot : null);
    } catch {
      // Missing/changed iOS selection or permission: never fabricate an app name.
      setProtectedApp(null);
    }
  }, [selectedMode, inBedtimeWindow]));

  useEffect(() => {
    const id = setInterval(() => setMinsLeft(minutesUntil(bedtime)), 15000);
    return () => clearInterval(id);
  }, [bedtime]);

  const hours = Math.floor(minsLeft / 60);
  const mins = minsLeft % 60;
  const isUrgent = minsLeft <= 10;
  const isImminent = minsLeft <= 2;

  const milestone = getMilestoneBadge(streak);
  const exceptionExpiresAt = inBedtimeWindow ? activeExceptionExpiresAt() : null;
  const protectionStatus = inBedtimeWindow && blockMode &&
    (blockMode === "social" || blockMode === "most" || blockMode === "custom")
    ? getBedtimeProtectionStatus(blockMode as BlockModeId)
    : null;
  // The start/end clocks define the protection window; no routine classification is shown.
  const needsSetup = protectionStatus === "permission-required" ||
    protectionStatus === "selection-required";

  const totalNights = sleepLog.length;
  const cleanNights = sleepLog.filter((e) => e.unlockAttempts === 0).length;
  const totalEscapes = sleepLog.reduce((sum, e) => sum + e.unlockAttempts, 0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
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
              {inBedtimeWindow
                ? (exceptionExpiresAt
                    ? `Temporary access until ${clockLabel(new Date(exceptionExpiresAt).getHours().toString().padStart(2, "0") + ":" + new Date(exceptionExpiresAt).getMinutes().toString().padStart(2, "0"))}`
                    : `Protection scheduled until ${clockLabel(wakeTime)}`)
                : isImminent
                ? "App protection starts soon"
                : isUrgent
                ? `${minsLeft}m until app protection starts`
                : `${hours}h ${mins}m until app protection starts`}
            </Text>
          </View>
        </Animated.View>

        {inBedtimeWindow && (
          exceptionExpiresAt ? (
            <View style={styles.escapeCard}>
              <Text style={styles.escapeLabel}>Temporary app access is active</Text>
              <Text style={styles.escapeHint}>
                Scheduled to end at {new Date(exceptionExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </Text>
            </View>
          ) : needsSetup ? (
            <TouchableOpacity
              style={styles.escapeCard}
              accessibilityRole="button"
              accessibilityLabel="Open Settings to complete app protection setup"
              onPress={() => router.push("/settings")}
            >
              <Text style={styles.escapeLabel}>Finish app protection setup</Text>
              <Text style={styles.escapeHint}>
                {protectionStatus === "permission-required"
                  ? "Screen Time permission is needed. Open Settings to grant access."
                  : "Choose exactly one individual app in Settings (no categories or websites)."}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Unlock your chosen protected app"
              accessibilityHint="Opens Curfy's uninterrupted 120-second hold. Lifting your finger resets it."
              onPress={() => router.push("/escape")}
              activeOpacity={0.84}
              style={styles.unlockCard}
            >
              <View style={styles.unlockMain}>
                <View style={styles.unlockCopy}>
                  <View style={styles.unlockStatus}>
                    <View style={styles.unlockStatusDot} />
                    <Text style={styles.unlockEyebrow}>PROTECTED</Text>
                  </View>
                  <View style={styles.unlockTitleRow}>
                    <Text style={styles.unlockVerb}>Unlock</Text>
                    {protectedApp && selectedMode ? (
                      // Apple renders the REAL protected app icon and name.
                      // No app title, opaque token or bundle ID enters JS.
                      <CurfyAppLabel
                        key={protectedApp.revision}
                        selectionId={selectionIdForMode(selectedMode)}
                        revision={protectedApp.revision}
                        index={0}
                        style={styles.unlockNativeAppLabel}
                      />
                    ) : (
                      <Text style={styles.unlockFallback}>your app</Text>
                    )}
                  </View>
                </View>
                <View style={styles.unlockArrow}>
                  <Ionicons name="arrow-forward" size={18} color={Colors.primaryCyan} />
                </View>
              </View>
              {protectionStatus !== "shield-active" && (
                <Text style={styles.unlockCaution}>
                  iOS hasn't confirmed protection. Check the selected app before unlocking.
                </Text>
              )}
            </TouchableOpacity>
          )
        )}

        <Animated.View entering={FadeInDown.duration(500).delay(200)} style={styles.messageSection}>
          <Text style={styles.moodMessage}>{getMoodMessage(streak, todayUnlocks)}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(300)} style={styles.statsCard}>
          <View style={styles.statsLeft}>
            <Text style={styles.streakEmoji}>{getStreakEmoji(streak)}</Text>
            <Text style={styles.streakNum}>{streak}</Text>
            <Text style={styles.streakLabel}>Curfy windows logged</Text>
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
              <Text style={styles.quickStatLabel}>app protection starts</Text>
              <Text style={styles.quickStatValue}>{bedtime}</Text>
            </View>
            <View>
              <Text style={styles.quickStatLabel}>exceptions this window</Text>
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
              <Text style={styles.recordLabel}>Windows logged</Text>
              <Text style={styles.recordValue}>{totalNights}</Text>
            </View>
            <View style={styles.recordRow}>
              <Text style={styles.recordLabel}>No-exception windows</Text>
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
    </SafeAreaView>
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
  escapeCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 16,
  },
  // One deliberately quiet, repeatable row. When Premium is implemented,
  // render one of these per app; never concatenate native app labels.
  unlockCard: {
    backgroundColor: "#131829",
    borderWidth: 1,
    borderColor: "#2C3552",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    minHeight: 91,
  },
  unlockMain: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    gap: 12,
  },
  unlockCopy: { flex: 1, minWidth: 0, gap: 8 },
  unlockStatus: { flexDirection: "row", alignItems: "center", gap: 7 },
  unlockStatusDot: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.primaryCyan,
  },
  unlockEyebrow: {
    color: "#8D94AE", fontFamily: Fonts.medium,
    fontSize: 10, letterSpacing: 1.4,
  },
  unlockTitleRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    minWidth: 0, minHeight: 30,
  },
  unlockVerb: {
    color: Colors.textPrimary, fontFamily: Fonts.semiBold,
    fontSize: 22, letterSpacing: -0.5,
  },
  unlockNativeAppLabel: { flex: 1, minWidth: 0, height: 29 },
  unlockFallback: {
    color: Colors.textPrimary, fontFamily: Fonts.medium,
    fontSize: 19, flexShrink: 1,
  },
  unlockArrow: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,229,255,0.055)",
    borderWidth: 1, borderColor: "#284555",
    alignItems: "center", justifyContent: "center",
  },
  unlockCaution: {
    color: Colors.textMuted, fontFamily: Fonts.regular,
    fontSize: 11, lineHeight: 17, marginTop: 10,
  },
  escapeLabel: { color: Colors.primaryCyan, fontSize: 16, fontFamily: Fonts.semiBold },
  escapeHint: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.regular, marginTop: 6 },
  messageSection: { alignItems: "center", gap: 10 },
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
