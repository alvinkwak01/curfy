import { Ionicons } from "@expo/vector-icons";
import { StarBackground } from "@/components/StarBackground";
import { HoldButton } from "@/components/HoldButton";
import { Colors, Fonts } from "@/constants/theme";
import { useSleep } from "@/context/SleepContext";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type LockScreenProps = {
  mode?: "preview" | "escape";
  /** Leaving this screen never changes Screen Time restrictions or counts as an escape. */
  onExit?: () => void;
};

/**
 * The circular 120-second hold runs inside Curfy, not in Apple's shield
 * extension. The user can leave this screen at any time without unlocking.
 */
export function LockScreen({ mode = "preview", onExit }: LockScreenProps) {
  const { unlockScreen, todayUnlocks, devDismissLock } = useSleep();
  const { top, bottom } = useSafeAreaInsets();
  const [unlockPending, setUnlockPending] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const isPreview = mode === "preview";

  const finishHold = async () => {
    if (isPreview) {
      Alert.alert("Preview complete", "This was a preview. No apps were unlocked.");
      return;
    }
    setUnlockPending(true);
    try {
      // Only navigate after the native Screen Time exception succeeds.
      await unlockScreen();
      setUnlockPending(false);
      router.replace("/(tabs)");
    } catch (error) {
      setUnlockPending(false);
      Alert.alert(
        "Couldn't unlock selected apps",
        error instanceof Error ? error.message : "Please try again."
      );
      // Propagate to HoldButton so it visibly resets after a native failure.
      throw error;
    }
  };

  return (
    <View style={styles.screen}>
      {Platform.OS !== "web" && <StatusBar barStyle="light-content" />}
      <StarBackground />
      <ScrollView
        scrollEnabled={!isHolding}
        contentContainerStyle={[
          styles.content,
          { paddingTop: (Platform.OS === "web" ? 42 : top) + 16,
            paddingBottom: (Platform.OS === "web" ? 24 : bottom) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.brandIcon}>
              <Ionicons name="moon-outline" size={19} color={Colors.primaryCyan} />
            </View>
            <View>
              <Text style={styles.brandName}>CURFY</Text>
              <Text style={styles.brandTagline}>BEDTIME. FOR REAL.</Text>
            </View>
          </View>
          {onExit ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Exit to Curfy Home without unlocking apps"
              disabled={unlockPending}
              onPress={onExit}
              activeOpacity={0.75}
              style={styles.exitTop}
              hitSlop={8}
            >
              <Ionicons name="close" size={19} color={Colors.textPrimary} />
              <Text style={styles.exitTopText}>Exit</Text>
            </TouchableOpacity>
          ) : __DEV__ ? (
            <TouchableOpacity
              onPress={devDismissLock}
              style={styles.devExit}
              accessibilityRole="button"
              accessibilityLabel="Development: dismiss preview lock"
            >
              <Text style={styles.devExitText}>DEV: Skip</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.hero}>
          <View style={styles.eyebrow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrowText}>
              {isPreview ? "ESCAPE SCREEN PREVIEW" : "YOUR CURFY BOUNDARY"}
            </Text>
          </View>
          <Text style={styles.heading}>
            {isPreview ? "A moment to\ndecide." : "Still want\nto go in?"}
          </Text>
          <Text style={styles.description}>
            {isPreview
              ? "This is the deliberate pause before an exception. Trying it here won't unlock any apps."
              : "Hold the circle for two uninterrupted minutes to request up to 15 minutes of access."}
          </Text>
        </View>

        <View style={styles.holdCard}>
          <HoldButton
            onUnlock={finishHold}
            unlockCount={todayUnlocks}
            onHoldingChange={setIsHolding}
          />
        </View>

        <View style={styles.bottom}>
          <View style={styles.resetHint}>
            <Ionicons name="refresh-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.resetHintText}>Let go early and the timer starts over.</Text>
          </View>
          {onExit && (
            <TouchableOpacity
              onPress={onExit}
              disabled={unlockPending}
              accessibilityRole="button"
              accessibilityLabel="Back to Home without unlocking apps"
              activeOpacity={0.8}
              style={[styles.homeButton, unlockPending && styles.homeButtonDisabled]}
            >
              <Ionicons name="arrow-back" size={19} color={Colors.textPrimary} />
              <Text style={styles.homeButtonText}>Back to Curfy Home</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.footer}>
            {unlockPending
              ? "Requesting access from iOS…"
              : isPreview
              ? "Preview only · No apps will be unlocked"
              : "No hold, no unlock. Your selected apps stay protected."}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    gap: 20,
  },
  topBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: {
    width: 37, height: 37, borderRadius: 12,
    justifyContent: "center", alignItems: "center",
    backgroundColor: "#10202C", borderWidth: 1, borderColor: "#214358",
  },
  brandName: {
    fontFamily: Fonts.bold, fontSize: 14, letterSpacing: 3.1,
    color: Colors.textPrimary,
  },
  brandTagline: {
    fontFamily: Fonts.medium, color: Colors.textMuted, fontSize: 9,
    letterSpacing: 1.5, marginTop: 3,
  },
  exitTop: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderColor: "#333451", borderRadius: 18,
    backgroundColor: "#121423", paddingVertical: 10, paddingHorizontal: 12,
    minHeight: 44,
  },
  exitTopText: { fontFamily: Fonts.semiBold, color: Colors.textPrimary, fontSize: 13 },
  devExit: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.warningAmber },
  devExitText: { fontFamily: Fonts.medium, fontSize: 12, color: Colors.warningAmber },
  hero: { alignItems: "center", gap: 10, paddingHorizontal: 8 },
  eyebrow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(0,229,255,0.055)", borderRadius: 20,
    borderWidth: 1, borderColor: "#174252",
    paddingHorizontal: 14, paddingVertical: 7,
  },
  eyebrowDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.primaryCyan },
  eyebrowText: {
    color: Colors.primaryCyan, fontFamily: Fonts.semiBold,
    letterSpacing: 1.7, fontSize: 10,
  },
  heading: {
    color: Colors.textPrimary, fontFamily: Fonts.bold,
    fontSize: 40, lineHeight: 43, letterSpacing: -1.7,
    textAlign: "center",
  },
  description: {
    maxWidth: 320, textAlign: "center",
    color: "#A3A3C5", fontFamily: Fonts.regular,
    fontSize: 14, lineHeight: 21,
  },
  holdCard: {
    minHeight: 235, alignItems: "center", justifyContent: "center",
    alignSelf: "stretch",
  },
  bottom: { alignItems: "center", gap: 16 },
  resetHint: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingHorizontal: 6,
  },
  resetHintText: {
    color: "#8888AF", fontSize: 12, fontFamily: Fonts.regular,
    textAlign: "center", flexShrink: 1,
  },
  homeButton: {
    width: "100%", minHeight: 56, borderRadius: 16,
    backgroundColor: "#17192C", borderWidth: 1, borderColor: "#393A60",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 11,
  },
  homeButtonDisabled: { opacity: 0.4 },
  homeButtonText: { fontFamily: Fonts.semiBold, fontSize: 16, color: Colors.textPrimary },
  footer: {
    fontFamily: Fonts.regular, color: Colors.textMuted,
    fontSize: 11, textAlign: "center", lineHeight: 17,
  },
});
