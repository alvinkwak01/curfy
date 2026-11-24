import React, { useRef, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSleep } from "@/context/SleepContext";
import { isSupabaseConfigured } from "@/lib/supabase";

const disclosure = "Your public Curfy profile includes your display name, protection start time and streaks, stored with Supabase. The leaderboard displays your name and streaks and updates automatically. Your app selections and journal stay on your device. You can leave in Settings without losing local history, app protection or Premium.";
function useParticipationAction() {
  const { setLeaderboardParticipation } = useAuth();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const choose = async (join: boolean) => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { await setLeaderboardParticipation(join); }
    catch (error) { Alert.alert("Leaderboard preference wasn't completed", error instanceof Error ? error.message : "Please retry."); }
    finally { pending.current = false; setBusy(false); }
  };
  return { choose, busy };
}
export function LeaderboardConsentPrompt() {
  const { isOnboardingComplete, storageError } = useSleep();
  const { leaderboardConsent, isConsentLoading, consentError, isAuthLoading, isDeletingAccount } = useAuth();
  const { choose, busy } = useParticipationAction();
  const visible = isSupabaseConfigured && isOnboardingComplete && !storageError && !isAuthLoading &&
    !isConsentLoading && !consentError && !isDeletingAccount && leaderboardConsent === "unknown";
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) void choose(false); }}>
    <View style={styles.overlay}><ScrollView style={styles.card} contentContainerStyle={styles.cardContent}>
      <Text style={styles.title}>Join the Curfy leaderboard</Text>
      <Text style={styles.body}>{disclosure}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => { void choose(true); }}>
        <Text style={styles.buttonText}>{busy ? "Saving…" : "Join leaderboard"}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.link} onPress={() => { void choose(false); }}>
        <Text style={styles.linkText}>Not now</Text>
      </TouchableOpacity>
    </ScrollView></View>
  </Modal>;
}
export function LeaderboardSettings() {
  const { leaderboardConsent, isConsentLoading, consentError, retryConsent } = useAuth();
  const { choose, busy } = useParticipationAction();
  const join = () => Alert.alert("Join the Curfy leaderboard", disclosure, [
    { text: "Not now", style: "cancel" }, { text: "Join leaderboard", onPress: () => { void choose(true); } },
  ]);
  return <View style={styles.section}>
    <Text style={styles.label}>LEADERBOARD</Text>
    <Text style={styles.body}>{leaderboardConsent === "joined" ? "Your display name and streaks appear publicly and update automatically." :
      leaderboardConsent === "leaving" ? "Uploads are paused. Finish removing your public cloud profile; it may still be visible until removal succeeds." : "Join to share your display name and streaks. Your local history stays available either way."}</Text>
    <TouchableOpacity accessibilityRole="button" disabled={busy || isConsentLoading || !isSupabaseConfigured} style={styles.link}
      onPress={() => {
        if (consentError) { void retryConsent(); return; }
        if (leaderboardConsent === "joined" || leaderboardConsent === "leaving") { void choose(false); return; }
        join();
      }}>
      <Text style={styles.linkText}>{busy ? "Saving…" : !isSupabaseConfigured ? "Leaderboard connection unavailable" : consentError ? "Retry leaderboard preference" :
        leaderboardConsent === "leaving" ? "Finish leaving leaderboard" : leaderboardConsent === "joined" ? "Leave leaderboard" : "Join leaderboard"}</Text>
    </TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: Colors.surface, borderColor: Colors.border, borderWidth: 1, borderRadius: 20, maxHeight: "90%" },
  cardContent: { padding: 24, gap: 18 },
  title: { color: Colors.textPrimary, fontFamily: Fonts.semiBold, fontSize: 23 },
  body: { color: Colors.textMuted, fontFamily: Fonts.regular, fontSize: 14, lineHeight: 22 },
  button: { minHeight: 48, borderRadius: 14, backgroundColor: Colors.primaryCyan, justifyContent: "center", alignItems: "center", padding: 12 },
  buttonText: { color: Colors.background, fontFamily: Fonts.semiBold, fontSize: 15 },
  link: { minHeight: 44, justifyContent: "center" },
  linkText: { color: Colors.primaryCyan, fontFamily: Fonts.medium, fontSize: 14 },
  section: { gap: 12, marginBottom: 28 },
  label: { color: Colors.textMuted, fontFamily: Fonts.semiBold, fontSize: 12, letterSpacing: 1.5 },
});
