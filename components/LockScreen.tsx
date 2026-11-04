import { Ionicons } from "@expo/vector-icons";
import { StarBackground } from "@/components/StarBackground";
import { HoldButton } from "@/components/HoldButton";
import {
  CurfyAppLabel,
  readProtectedAppChoices,
  type CurfyProtectedAppsSnapshot,
} from "@/modules/curfy-protected-apps";
import { selectionIdForMode, type BlockModeId } from "@/lib/screenTime";
import { Colors, Fonts } from "@/constants/theme";
import { useSleep } from "@/context/SleepContext";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
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
  /** Leaving never grants access or alters the selected-app shield. */
  onExit?: () => void;
};

/**
 * The circular 120-second hold runs inside Curfy, not Apple's shield extension.
 * A single top-right X is the only exit action. It never unlocks any app.
 */
export function LockScreen({ mode = "preview", onExit }: LockScreenProps) {
  const { unlockScreen, devDismissLock, blockMode } = useSleep();
  const { top, bottom } = useSafeAreaInsets();
  const [unlockPending, setUnlockPending] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const isPreview = mode === "preview";
  const [protectedApp, setProtectedApp] = useState<CurfyProtectedAppsSnapshot | null>(null);
  const selectedMode: BlockModeId | null =
    blockMode === "social" || blockMode === "most" || blockMode === "custom"
      ? blockMode : null;

  useFocusEffect(useCallback(() => {
    if (isPreview || !selectedMode) {
      setProtectedApp(null);
      return;
    }
    try {
      const snapshot = readProtectedAppChoices(selectionIdForMode(selectedMode));
      // Free mode must only display the exact saved individual app.
      setProtectedApp(snapshot.count === 1 ? snapshot : null);
    } catch {
      // Missing/revoked Screen Time selection: never guess the app name.
      setProtectedApp(null);
    }
  }, [isPreview, selectedMode]));

  const finishHold = async () => {
    if (isPreview) {
      Alert.alert("Preview complete", "This was a preview. No apps were unlocked.");
      return;
    }
    setUnlockPending(true);
    try {
      // Only navigate after iOS confirms the protected-app exception.
      await unlockScreen();
      setUnlockPending(false);
      router.replace("/(tabs)");
    } catch (error) {
      setUnlockPending(false);
      Alert.alert(
        "Couldn't unlock selected apps",
        error instanceof Error ? error.message : "Please try again."
      );
      // Propagate failure so the ring resets, rather than faking success.
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
          {
            paddingTop: (Platform.OS === "web" ? 42 : top) + 12,
            paddingBottom: (Platform.OS === "web" ? 24 : bottom) + 18,
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <Ionicons name="moon-outline" size={18} color={Colors.primaryCyan} />
            <Text style={styles.brandName}>CURFY</Text>
          </View>
          {(onExit || __DEV__) && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close unlock screen without unlocking"
              accessibilityHint="Returns to Curfy. Your app remains protected."
              disabled={unlockPending}
              onPress={onExit ?? devDismissLock}
              activeOpacity={0.7}
              style={[styles.closeControl, unlockPending && styles.closeDisabled]}
              hitSlop={10}
            >
              <Ionicons name="close" size={23} color={Colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.holdArea}>
          <View style={styles.unlockTitleRow}>
            <Text style={styles.unlockTitle}>
              {isPreview ? "Hold preview" : "Unlocking"}
            </Text>
            {!isPreview && protectedApp && selectedMode ? (
              <CurfyAppLabel
                key={protectedApp.revision}
                selectionId={selectionIdForMode(selectedMode)}
                revision={protectedApp.revision}
                index={0}
                style={styles.nativeAppLabel}
              />
            ) : !isPreview ? (
              <Text style={styles.appFallback}>your app</Text>
            ) : null}
          </View>
          <HoldButton
            onUnlock={finishHold}
            unlockCount={0}
            onHoldingChange={setIsHolding}
            idleHint={isPreview
              ? "Preview only · no app access granted"
              : "Hold 120s · up to 15 min access"}
            showIdleMessage={false}
            showUnlockCount={false}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  topBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    minHeight: 46,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandName: {
    fontFamily: Fonts.bold, fontSize: 12, letterSpacing: 3.1,
    color: Colors.textPrimary,
  },
  closeControl: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1, borderColor: "#373954",
    backgroundColor: "rgba(22,24,44,0.82)",
    alignItems: "center", justifyContent: "center",
  },
  closeDisabled: { opacity: 0.4 },
  holdArea: {
    flexGrow: 1, minHeight: 300,
    alignItems: "center", justifyContent: "center",
    paddingBottom: 35, gap: 30,
  },
  unlockTitleRow: {
    alignSelf: "stretch", flexDirection: "row",
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 4, gap: 9, minHeight: 37,
  },
  unlockTitle: {
    color: Colors.textPrimary, fontFamily: Fonts.semiBold,
    fontSize: 23, letterSpacing: -0.45,
  },
  nativeAppLabel: {
    flex: 1, minWidth: 0, height: 36,
    maxWidth: 215,
  },
  appFallback: {
    color: Colors.primaryCyan, fontFamily: Fonts.medium,
    fontSize: 20, flexShrink: 1,
  },
});
