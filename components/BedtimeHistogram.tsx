import { Colors, Fonts } from "@/constants/theme";
import React, { useMemo, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface BedtimeHistogramProps {
  bedtimes: string[]; // "HH:MM", 24-hour
}

// Below this many data points, a chart is more misleading than useful —
// one or two bedtimes render as a single 100%-height spike that implies
// a pattern that isn't there yet.
const MIN_SAMPLE_SIZE = 5;

// The real range of interest is narrow (people don't set bedtimes at
// 3pm), so instead of 24 mostly-empty hourly buckets, this is 8pm-1am in
// half-hour steps, flanked by two open-ended catch-alls for anything
// earlier or later. axisLabel is null for the half-hour ticks — those
// get a small dot instead of text, so the axis reads "hour, hour, hour"
// without every single tick cluttering it with text.
const BUCKETS: { key: string; axisLabel: string | null; fullLabel: string }[] = [
  { key: "early", axisLabel: "≤7PM", fullLabel: "7 PM or earlier" },
  { key: "20-0", axisLabel: "8PM", fullLabel: "8:00 PM" },
  { key: "20-30", axisLabel: null, fullLabel: "8:30 PM" },
  { key: "21-0", axisLabel: "9PM", fullLabel: "9:00 PM" },
  { key: "21-30", axisLabel: null, fullLabel: "9:30 PM" },
  { key: "22-0", axisLabel: "10PM", fullLabel: "10:00 PM" },
  { key: "22-30", axisLabel: null, fullLabel: "10:30 PM" },
  { key: "23-0", axisLabel: "11PM", fullLabel: "11:00 PM" },
  { key: "23-30", axisLabel: null, fullLabel: "11:30 PM" },
  { key: "0-0", axisLabel: "12AM", fullLabel: "12:00 AM" },
  { key: "0-30", axisLabel: null, fullLabel: "12:30 AM" },
  { key: "1-0", axisLabel: "1AM", fullLabel: "1:00 AM" },
  { key: "1-30", axisLabel: null, fullLabel: "1:30 AM" },
  { key: "late", axisLabel: "≥2AM", fullLabel: "2 AM or later" },
];

function bucketKeyFor(bedtime: string): string {
  const [hStr, mStr] = bedtime.split(":");
  const hour = parseInt(hStr, 10);
  const minute = parseInt(mStr, 10) || 0;
  if (Number.isNaN(hour)) return "early";
  // Normal window: 8pm through 1:59am, split into half-hour slots.
  if (hour >= 20 || hour <= 1) {
    const half = minute >= 30 ? 30 : 0;
    return `${hour}-${half}`;
  }
  // Everything else is one of the two open-ended catch-alls. Where
  // exactly to split "the dead zone" (2am-7pm) barely matters since real
  // bedtimes essentially never land there — noon is as good a seam as any.
  if (hour >= 12 && hour <= 19) return "early"; // noon through 7pm
  return "late"; // 2am through 11am
}

function bucketBedtimes(bedtimes: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const b of BUCKETS) counts[b.key] = 0;
  for (const bt of bedtimes) {
    const key = bucketKeyFor(bt);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

// Bar and its axis tick live in the same flex:1 column, so alignment
// between the two is automatic — no separate row trying to guess where
// a differently-laid-out bar landed.
function Column({
  count,
  max,
  height,
  isPeak,
  axisLabel,
}: {
  count: number;
  max: number;
  height: number;
  isPeak: boolean;
  axisLabel: string | null;
}) {
  const barHeight = count === 0 ? 2 : Math.max(4, (count / max) * height);
  return (
    <View style={styles.column}>
      <View style={[styles.barTrack, { height }]}>
        <View
          style={[
            styles.bar,
            {
              height: barHeight,
              backgroundColor: isPeak ? Colors.primaryCyan : Colors.accentViolet,
              opacity: isPeak ? 1 : 0.55,
            },
          ]}
        />
      </View>
      <View style={styles.labelSlot}>
        {axisLabel ? (
          <Text style={styles.axisLabel} numberOfLines={1}>
            {axisLabel}
          </Text>
        ) : (
          <View style={styles.axisDot} />
        )}
      </View>
    </View>
  );
}

function Chart({ counts, height }: { counts: Record<string, number>; height: number }) {
  const max = Math.max(1, ...Object.values(counts));
  return (
    <View style={styles.chartRow}>
      {BUCKETS.map((b) => (
        <Column
          key={b.key}
          count={counts[b.key] ?? 0}
          max={max}
          height={height}
          isPeak={counts[b.key] === max && counts[b.key] > 0}
          axisLabel={b.axisLabel}
        />
      ))}
    </View>
  );
}

export function BedtimeHistogram({ bedtimes }: BedtimeHistogramProps) {
  const [expanded, setExpanded] = useState(false);
  const counts = useMemo(() => bucketBedtimes(bedtimes), [bedtimes]);
  const total = bedtimes.length;

  if (total < MIN_SAMPLE_SIZE) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Bedtime Tracker</Text>
        <Text style={styles.empty}>Collecting data. Chart will be ready soon.</Text>
      </View>
    );
  }

  const breakdown = BUCKETS.filter((b) => (counts[b.key] ?? 0) > 0).sort(
    (a, b) => (counts[b.key] ?? 0) - (counts[a.key] ?? 0)
  );

  return (
    <>
      <TouchableOpacity style={styles.card} onPress={() => setExpanded(true)} activeOpacity={0.85}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Bedtime Tracker</Text>
          <Text style={styles.expandHint}>Tap to expand</Text>
        </View>
        <Chart counts={counts} height={56} />
      </TouchableOpacity>

      <Modal
        visible={expanded}
        animationType="fade"
        transparent
        onRequestClose={() => setExpanded(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Bedtime Tracker</Text>
              <TouchableOpacity onPress={() => setExpanded(false)}>
                <Text style={styles.closeText}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>
              {total} {total === 1 ? "person's" : "people's"} bedtime, 7 PM-2 AM
            </Text>

            <View style={{ marginTop: 18 }}>
              <Chart counts={counts} height={160} />
            </View>

            <View style={styles.breakdown}>
              {breakdown.map((b) => (
                <View key={b.key} style={styles.breakdownRow}>
                  <Text style={styles.breakdownHour}>{b.fullLabel}</Text>
                  <Text style={styles.breakdownCount}>
                    {counts[b.key]} {counts[b.key] === 1 ? "person" : "people"}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.semiBold },
  expandHint: { color: Colors.textGhost, fontSize: 11, fontFamily: Fonts.regular },
  empty: { color: Colors.textGhost, fontSize: 13, fontFamily: Fonts.regular },
  chartRow: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  column: { flex: 1, alignItems: "center" },
  barTrack: { width: "100%", justifyContent: "flex-end", alignItems: "center" },
  bar: { width: "70%", borderRadius: 2 },
  labelSlot: { height: 14, justifyContent: "center", alignItems: "center", marginTop: 4 },
  axisLabel: { color: Colors.textMuted, fontSize: 9, fontFamily: Fonts.regular },
  axisDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textGhost },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(4,4,10,0.85)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 22,
  },
  subtitle: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.regular, marginTop: 2 },
  closeText: { color: Colors.primaryCyan, fontSize: 14, fontFamily: Fonts.semiBold },
  breakdown: { marginTop: 20, gap: 10, maxHeight: 260 },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 8,
  },
  breakdownHour: { color: Colors.textPrimary, fontSize: 13, fontFamily: Fonts.medium },
  breakdownCount: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.regular },
});
