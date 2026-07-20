import { StarBackground } from "@/components/StarBackground";
import { Colors, Fonts } from "@/constants/theme";
import { SleepEntry, useSleep } from "@/context/SleepContext";
import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

function formatEntryDate(dateStr: string): string {
  const entryDate = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(entryDate, today)) return "Today";
  if (sameDay(entryDate, yesterday)) return "Yesterday";
  return entryDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getRating(unlocks: number): { label: string; color: string } {
  if (unlocks === 0) return { label: "Flawless", color: Colors.primaryCyan };
  if (unlocks === 1) return { label: "Slipped once", color: Colors.accentViolet };
  if (unlocks === 2) return { label: "Tried hard", color: Colors.warningAmber };
  return { label: "Chaotic", color: Colors.dangerRed };
}

function EntryRow({ entry, index }: { entry: SleepEntry; index: number }) {
  const rating = getRating(entry.unlockAttempts);
  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 60)} style={styles.entryRow}>
      <View>
        <Text style={styles.entryDate}>{formatEntryDate(entry.date)}</Text>
        <Text style={styles.entryBedtime}>{entry.targetBedtime}</Text>
      </View>
      <View style={styles.entryRight}>
        {entry.unlockAttempts > 0 && (
          <Text style={styles.entryEscapes}>{entry.unlockAttempts} escape{entry.unlockAttempts === 1 ? "" : "s"}</Text>
        )}
        <View style={[styles.ratingPill, { borderColor: rating.color }]}>
          <Text style={[styles.ratingText, { color: rating.color }]}>{rating.label}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function Leaderboard() {
  const { userName, streak, sleepLog } = useSleep();

  const totalNights = sleepLog.length;
  const cleanNights = sleepLog.filter((e) => e.unlockAttempts === 0).length;
  const cleanRate = totalNights > 0 ? Math.round((cleanNights / totalNights) * 100) : 0;
  const totalEscapes = sleepLog.reduce((sum, e) => sum + e.unlockAttempts, 0);

  const cleanRateColor =
    cleanRate >= 70 ? Colors.successGreen : cleanRate >= 40 ? Colors.warningAmber : Colors.dangerRed;

  const sorted = [...sleepLog].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <View style={styles.container}>
      <StarBackground />
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.scroll}
        ListHeaderComponent={
          <View style={{ gap: 20, marginBottom: 20 }}>
            <View>
              <Text style={styles.title}>{userName ? `${userName}'s Record` : "Your Record"}</Text>
              <Text style={styles.subtitle}>Your personal sleep history</Text>
            </View>

            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>CURRENT STREAK</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <Text style={styles.heroNumber}>{streak}</Text>
                <Text style={styles.heroUnit}>nights</Text>
              </View>
              {streak === 0 && (
                <Text style={styles.heroHint}>Start tonight to build your streak.</Text>
              )}
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{totalNights}</Text>
                <Text style={styles.statLabel}>Total nights</Text>
              </View>
              <View style={styles.gridDivider} />
              <View style={styles.statBlock}>
                <Text style={[styles.statValue, { color: Colors.primaryCyan }]}>{cleanNights}</Text>
                <Text style={styles.statLabel}>Clean nights</Text>
              </View>
              <View style={styles.gridDivider} />
              <View style={styles.statBlock}>
                <Text style={[styles.statValue, { color: cleanRateColor }]}>{cleanRate}%</Text>
                <Text style={styles.statLabel}>Clean rate</Text>
              </View>
              <View style={styles.gridDivider} />
              <View style={styles.statBlock}>
                <Text
                  style={[
                    styles.statValue,
                    { color: totalEscapes > 10 ? Colors.dangerRed : Colors.textPrimary },
                  ]}
                >
                  {totalEscapes}
                </Text>
                <Text style={styles.statLabel}>Total escapes</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>NIGHT BY NIGHT</Text>
          </View>
        }
        renderItem={({ item, index }) => <EntryRow entry={item} index={index} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No nights logged yet</Text>
            <Text style={styles.emptySub}>
              Your first locked-in bedtime will show up here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  title: { color: Colors.textPrimary, fontSize: 28, fontFamily: Fonts.bold, letterSpacing: -0.5 },
  subtitle: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.regular, marginTop: 2 },
  heroCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 24,
    gap: 6,
  },
  heroLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.medium,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  heroNumber: { color: Colors.primaryCyan, fontSize: 56, fontFamily: Fonts.bold },
  heroUnit: { color: Colors.textMuted, fontSize: 18, fontFamily: Fonts.regular },
  heroHint: { color: Colors.textGhost, fontSize: 13, fontFamily: Fonts.regular, marginTop: 4 },
  statsGrid: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 20,
  },
  statBlock: { flex: 1, alignItems: "center", gap: 4 },
  gridDivider: { width: 1, backgroundColor: Colors.border },
  statValue: { color: Colors.textPrimary, fontSize: 20, fontFamily: Fonts.bold },
  statLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular, textAlign: "center" },
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.medium,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  entryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  entryDate: { color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.medium },
  entryBedtime: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.regular, marginTop: 2 },
  entryRight: { alignItems: "flex-end", gap: 4 },
  entryEscapes: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.regular },
  ratingPill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ratingText: { fontSize: 12, fontFamily: Fonts.semiBold },
  emptyState: { alignItems: "center", paddingTop: 40, gap: 6 },
  emptyTitle: { color: Colors.textGhost, fontSize: 16, fontFamily: Fonts.medium },
  emptySub: { color: Colors.textGhost, fontSize: 13, fontFamily: Fonts.regular, textAlign: "center" },
});
