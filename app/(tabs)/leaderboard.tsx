import { BedtimeHistogram } from "@/components/BedtimeHistogram";
import Btn from "@/components/Btn";
import { StarBackground } from "@/components/StarBackground";
import { Colors, Fonts } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { SleepEntry, useSleep } from "@/context/SleepContext";
import { isSupabaseConfigured, LeaderboardProfile } from "@/lib/supabase";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

type Metric = "current_streak" | "longest_streak";

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

// Special bordering for the top 3 — same palette as the rest of the app
// (cyan/violet/amber), not literal gold/silver/bronze, so it doesn't
// clash with the space theme.
function getRankStyle(rank: number): { borderColor: string; badgeColor: string } | null {
  if (rank === 1) return { borderColor: Colors.primaryCyan, badgeColor: Colors.primaryCyan };
  if (rank === 2) return { borderColor: Colors.accentViolet, badgeColor: Colors.accentViolet };
  if (rank === 3) return { borderColor: Colors.warningAmber, badgeColor: Colors.warningAmber };
  return null;
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

function LeaderboardRow({
  profile,
  rank,
  metric,
  isYou,
}: {
  profile: LeaderboardProfile;
  rank: number;
  metric: Metric;
  isYou: boolean;
}) {
  const rankStyle = getRankStyle(rank);
  const value = metric === "current_streak" ? profile.current_streak : profile.longest_streak;

  return (
    <View
      style={[
        styles.lbRow,
        rankStyle && { borderColor: rankStyle.borderColor, borderWidth: 1.5 },
        isYou && styles.lbRowYou,
      ]}
    >
      <View style={[styles.lbRank, rankStyle && { borderColor: rankStyle.borderColor }]}>
        <Text style={[styles.lbRankText, rankStyle && { color: rankStyle.badgeColor }]}>
          {rank}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.lbName} numberOfLines={1}>
          {profile.display_name || "Sleeper"}
        </Text>
      </View>
      {isYou && (
        <View style={styles.youChip}>
          <Text style={styles.youChipText}>YOU</Text>
        </View>
      )}
      <Text style={[styles.lbValue, rankStyle && { color: rankStyle.badgeColor }]}>
        {value}
      </Text>
    </View>
  );
}

function JoinLeaderboardCard() {
  const { userName } = useSleep();
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<"join" | "signin">("join");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError("Email and password, please. Both of them.");
      return;
    }
    setLoading(true);
    const result =
      mode === "join"
        ? await signUp(email.trim(), password, userName)
        : await signIn(email.trim(), password);
    setLoading(false);
    if (result.error) {
      // signUp() returns this specific message (not a real error) when
      // email confirmation is required — show it as info, not a failure.
      if (result.error.startsWith("Check your email")) {
        setInfo(result.error);
      } else {
        setError(result.error);
      }
    }
  };

  return (
    <View style={styles.authCard}>
      <Text style={styles.authTitle}>
        {mode === "join" ? "Join the leaderboard" : "Sign back in"}
      </Text>
      <Text style={styles.authSub}>
        {mode === "join"
          ? `Your streaks sync under "${userName || "Sleeper"}." Everyone can see your name and numbers — nothing else.`
          : "Already have an account? Sign in to sync this device."}
      </Text>

      <TextInput
        style={styles.authInput}
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={Colors.textGhost}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.authInput}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={Colors.textGhost}
        secureTextEntry
        autoCapitalize="none"
      />

      {error && <Text style={styles.authError}>{error}</Text>}
      {info && <Text style={styles.authInfo}>{info}</Text>}

      <Btn
        label={mode === "join" ? "Create account" : "Sign in"}
        onPress={submit}
        loading={loading}
      />

      <TouchableOpacity onPress={() => setMode(mode === "join" ? "signin" : "join")}>
        <Text style={styles.authToggle}>
          {mode === "join" ? "Already have an account? Sign in" : "New here? Create an account"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function GlobalLeaderboard() {
  const { isSignedIn, isAuthLoading, session, fetchLeaderboard, fetchMyRank } = useAuth();
  const { streak, longestStreak, userName } = useSleep();
  const [metric, setMetric] = useState<Metric>("current_streak");
  const [profiles, setProfiles] = useState<LeaderboardProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [myRank, setMyRank] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchLeaderboard(metric);
    setProfiles(data);
    setLoading(false);
  }, [metric, fetchLeaderboard]);

  // The board itself is public — load it whether or not the viewer is
  // signed in. Only *appearing* on it requires an account.
  useEffect(() => {
    load();
  }, [load]);

  // Collapse back to the compact top-4 view whenever the sort changes —
  // "expanded" for Current Streak shouldn't silently carry over to All-Time.
  useEffect(() => {
    setExpanded(false);
  }, [metric]);

  const myValue = metric === "current_streak" ? streak : longestStreak;
  const topFour = profiles.slice(0, 4);
  const rest = profiles.slice(4);
  const isYouInTopFour = topFour.some((p) => p.id === session?.user.id);

  useEffect(() => {
    if (!isSignedIn || !session?.user) {
      setMyRank(null);
      return;
    }
    // Already in the fetched top-50 — its index is the real rank, no
    // extra query needed.
    const idxInFetched = profiles.findIndex((p) => p.id === session.user.id);
    if (idxInFetched !== -1) {
      setMyRank(idxInFetched + 1);
      return;
    }
    let cancelled = false;
    fetchMyRank(metric, myValue).then((rank) => {
      if (!cancelled) setMyRank(rank);
    });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, session, profiles, metric, myValue, fetchMyRank]);

  return (
    <View style={{ gap: 14 }}>
      <View style={[styles.metricToggle, { alignSelf: "stretch" }]}>
        <TouchableOpacity
          onPress={() => setMetric("current_streak")}
          style={[styles.metricBtn, { flex: 1 }, metric === "current_streak" && styles.metricBtnActive]}
        >
          <Text
            style={[
              styles.metricBtnText,
              { textAlign: "center" },
              metric === "current_streak" && styles.metricBtnTextActive,
            ]}
          >
            Current Streak
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMetric("longest_streak")}
          style={[styles.metricBtn, { flex: 1 }, metric === "longest_streak" && styles.metricBtnActive]}
        >
          <Text
            style={[
              styles.metricBtnText,
              { textAlign: "center" },
              metric === "longest_streak" && styles.metricBtnTextActive,
            ]}
          >
            All-Time Best
          </Text>
        </TouchableOpacity>
      </View>

      {!isSupabaseConfigured ? (
        <Text style={styles.lbEmpty}>Leaderboard isn't set up yet — check back soon.</Text>
      ) : loading ? (
        <ActivityIndicator color={Colors.primaryCyan} style={{ marginVertical: 20 }} />
      ) : profiles.length === 0 ? (
        <Text style={styles.lbEmpty}>
          Nobody's on the board yet. Be the first — start a streak.
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {topFour.map((p, i) => (
            <LeaderboardRow
              key={p.id}
              profile={p}
              rank={i + 1}
              metric={metric}
              isYou={p.id === session?.user.id}
            />
          ))}

          {!expanded && isSignedIn && !isYouInTopFour && myRank != null && (
            <>
              <Text style={styles.rankGap}>···</Text>
              <LeaderboardRow
                profile={{
                  id: session!.user.id,
                  display_name: userName || "Sleeper",
                  current_streak: streak,
                  longest_streak: longestStreak,
                }}
                rank={myRank}
                metric={metric}
                isYou
              />
            </>
          )}

          {expanded &&
            rest.map((p, i) => (
              <LeaderboardRow
                key={p.id}
                profile={p}
                rank={i + 5}
                metric={metric}
                isYou={p.id === session?.user.id}
              />
            ))}

          {rest.length > 0 && (
            <TouchableOpacity onPress={() => setExpanded((e) => !e)} style={styles.viewAllBtn}>
              <Text style={styles.viewAllText}>{expanded ? "Show less" : "View all"}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {isSupabaseConfigured && !isAuthLoading && !isSignedIn && <JoinLeaderboardCard />}
    </View>
  );
}

// Averages a set of "HH:MM" bedtimes correctly across the midnight
// boundary. A naive linear mean breaks here — e.g. 23:00 and 01:00 should
// average to ~00:00, not ~12:00. Fix: shift the reference point to noon
// (a time nobody sets as a bedtime), average in that shifted space, then
// shift back. Returns null if there's nothing to average.
function averageBedtime(bedtimes: string[]): string | null {
  if (bedtimes.length === 0) return null;
  const NOON = 12 * 60;
  const shifted = bedtimes.map((bt) => {
    const [h, m] = bt.split(":").map(Number);
    const minutes = h * 60 + m;
    return (minutes - NOON + 1440) % 1440;
  });
  const avgShifted = shifted.reduce((a, b) => a + b, 0) / shifted.length;
  const avgMinutes = Math.round((avgShifted + NOON) % 1440);
  const h = Math.floor(avgMinutes / 60);
  const m = avgMinutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${m.toString().padStart(2, "0")} ${period}`;
}

function CommunityStats() {
  const { fetchCommunityBedtimes } = useAuth();
  const [bedtimes, setBedtimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchCommunityBedtimes();
      if (!cancelled) {
        setBedtimes(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCommunityBedtimes]);

  const avg = useMemo(() => averageBedtime(bedtimes), [bedtimes]);

  if (!isSupabaseConfigured) {
    // Same "inert, not invisible" rule as GlobalLeaderboard — silently
    // returning null here made this whole section disappear with no clue
    // it was ever there, which is exactly the confusing behavior that
    // got reported. Say why it's missing instead of just hiding it.
    return (
      <View style={{ gap: 14 }}>
        <View>
          <Text style={styles.sectionTitle}>COMMUNITY STATS</Text>
          <Text style={styles.subtitleSmall}>Across everyone who's signed in</Text>
        </View>
        <Text style={styles.lbEmpty}>Community stats aren't set up yet — check back soon.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <View>
        <Text style={styles.sectionTitle}>COMMUNITY STATS</Text>
        <Text style={styles.subtitleSmall}>Across everyone who's signed in</Text>
      </View>

      <View style={styles.communityAvgCard}>
        <Text style={styles.heroLabel}>AVERAGE BEDTIME</Text>
        {loading ? (
          <ActivityIndicator color={Colors.primaryCyan} style={{ marginTop: 8, alignSelf: "flex-start" }} />
        ) : (
          <Text style={styles.communityAvgValue}>{avg ?? "—"}</Text>
        )}
        {/* No average wake-up here on purpose: Curfy's lock window ends at a
            fixed 6 AM for everyone (see CONTEXT.md — bedtime-only scope,
            morning mode deferred), so there's no real per-user wake data
            to average yet. Showing "6:00 AM" for 100% of users would just
            be noise dressed up as a stat. */}
        <Text style={styles.communityNote}>
          Wake time's fixed at 6 AM for now — nothing to compare there yet.
        </Text>
      </View>

      {!loading && <BedtimeHistogram bedtimes={bedtimes} />}
    </View>
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StarBackground />
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.scroll}
        ListHeaderComponent={
          <View style={{ gap: 20, marginBottom: 20 }}>
            <View>
              <Text style={styles.title}>Leaderboard</Text>
              <Text style={styles.subtitle}>Everyone's streaks. Judge freely.</Text>
            </View>

            <GlobalLeaderboard />

            <View style={styles.divider} />

            <CommunityStats />

            <View style={styles.divider} />

            <View>
              <Text style={styles.sectionTitle}>YOUR RECORD</Text>
              <Text style={styles.subtitleSmall}>
                {userName ? `${userName}'s personal history` : "Your personal history"}
              </Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  title: { color: Colors.textPrimary, fontSize: 28, fontFamily: Fonts.bold, letterSpacing: -0.5 },
  subtitle: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.regular, marginTop: 2 },
  subtitleSmall: { color: Colors.textGhost, fontSize: 12, fontFamily: Fonts.regular, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.border },
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

  // Global leaderboard
  lbHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metricToggle: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 3,
  },
  metricBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  metricBtnActive: { backgroundColor: Colors.border },
  metricBtnText: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.semiBold },
  metricBtnTextActive: { color: Colors.textPrimary },
  lbEmpty: {
    color: Colors.textGhost,
    fontSize: 13,
    fontFamily: Fonts.regular,
    textAlign: "center",
    paddingVertical: 20,
  },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  lbRowYou: {
    backgroundColor: "#10122a",
  },
  lbRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  lbRankText: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.bold },
  lbName: { color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.medium },
  lbValue: { color: Colors.textPrimary, fontSize: 16, fontFamily: Fonts.bold, minWidth: 28, textAlign: "right" },
  youChip: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.primaryCyan,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  youChipText: { color: Colors.primaryCyan, fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 0.5 },
  rankGap: {
    color: Colors.textGhost,
    fontSize: 16,
    fontFamily: Fonts.bold,
    textAlign: "center",
    letterSpacing: 2,
  },
  viewAllBtn: { alignItems: "center", paddingVertical: 10 },
  viewAllText: { color: Colors.primaryCyan, fontSize: 13, fontFamily: Fonts.semiBold },

  // Community stats
  communityAvgCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 20,
    gap: 4,
  },
  communityAvgValue: { color: Colors.primaryCyan, fontSize: 32, fontFamily: Fonts.bold, marginTop: 2 },
  communityNote: { color: Colors.textGhost, fontSize: 12, fontFamily: Fonts.regular, marginTop: 6 },

  // Join / sign in
  authCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 20,
    gap: 10,
    marginTop: 4,
  },
  authTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: Fonts.semiBold },
  authSub: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.regular, lineHeight: 19, marginBottom: 4 },
  authInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
  },
  authError: { color: Colors.dangerRed, fontSize: 12, fontFamily: Fonts.regular },
  authInfo: { color: Colors.primaryCyan, fontSize: 12, fontFamily: Fonts.regular },
  authToggle: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.regular,
    textAlign: "center",
    marginTop: 2,
  },
});
