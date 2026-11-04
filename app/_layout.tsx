import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import "react-native-reanimated";

import { Colors, Fonts } from "@/constants/theme";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { JournalProvider } from "@/context/JournalContext";
import { SleepProvider, useSleep } from "@/context/SleepContext";
import { PremiumProvider } from "@/context/PremiumContext";
import Onboarding from "./onboarding";

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <JournalProvider>
        <AuthProvider>
          <PremiumProvider>
          <SleepProvider>
            <EnsureLeaderboardIdentity />
            <StreakSync />
            <RootLayoutNav />
          </SleepProvider>
          </PremiumProvider>
        </AuthProvider>
      </JournalProvider>
    </GestureHandlerRootView>
  );
}

// Every user is on the global leaderboard automatically — no visible
// "Join"/create-account step. The first time onboarding finishes (i.e. a
// display name exists) and there's no session yet, this silently signs
// the device into an anonymous Supabase auth session and seeds a
// `profiles` row with that name. Renders nothing; needs both contexts in
// scope, same reasoning as StreakSync below.
function EnsureLeaderboardIdentity() {
  const { userName, isOnboardingComplete, storageError } = useSleep();
  const { isSignedIn, isAuthLoading, ensureAnonymousProfile } = useAuth();

  useEffect(() => {
    if (storageError || !isOnboardingComplete || isAuthLoading || isSignedIn) return;
    void ensureAnonymousProfile(userName).catch((error) => {
      // A cloud leaderboard failure must not interrupt native protection.
      console.warn("[Curfy] Online leaderboard profile creation failed", error);
    });
  }, [isOnboardingComplete, isAuthLoading, isSignedIn, userName, storageError, ensureAnonymousProfile]);

  return null;
}

// Keeps each signed-in user's `profiles` row current (bedtime, both streak
// numbers, and display name) so the global leaderboard and community
// bedtime chart reflect reality without either screen having to know when
// something changed. Renders nothing — it only needs both contexts in
// scope, which requires it to sit inside both providers (see above).
function StreakSync() {
  const { bedtime, streak, longestStreak, userName, storageError } = useSleep();
  const { isSignedIn, syncProfile } = useAuth();

  useEffect(() => {
    if (storageError || !isSignedIn) return;
    void syncProfile(bedtime, streak, longestStreak, userName).catch((error) => {
      // Do not silently discard failed cloud writes. The local history and
      // the iOS Screen Time schedule are independent from this optional sync.
      console.warn("[Curfy] Online leaderboard sync failed", error);
    });
  }, [isSignedIn, bedtime, streak, longestStreak, userName, storageError, syncProfile]);

  return null;
}

function RootLayoutNav() {
  const { isLoading, isOnboardingComplete, storageError, retryLoadSavedSettings } = useSleep();

  if (isLoading) {
    // Splash screen is still visible at this point.
    return null;
  }

  if (storageError) {
    // Do not offer "start over" while an existing iOS shield may still be
    // active and the stored schedule cannot be read. Retry is non-destructive.
    return (
      <View style={styles.recovery}>
        <Text style={styles.recoveryTitle}>Couldn't load Curfy</Text>
        <Text style={styles.recoveryBody}>
          {storageError} Your existing iOS app restrictions may still be active.
          Try again without deleting or resetting your saved protection.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Retry loading saved Curfy settings"
          onPress={() => { void retryLoadSavedSettings(); }}
          style={styles.recoveryButton}
        >
          <Text style={styles.recoveryButtonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!isOnboardingComplete) {
    // Onboarding is a self-contained multi-step flow, not part of the
    // router stack — it doesn't need back/forward navigation.
    return (
      <View style={styles.fill}>
        <Onboarding />
      </View>
    );
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen
          name="preview-lock"
          options={{ presentation: "fullScreenModal", headerShown: false }}
        />
        <Stack.Screen
          name="escape"
          options={{ presentation: "fullScreenModal", headerShown: false }}
        />
      </Stack>

     </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Colors.background },
  recovery: {
    flex: 1, backgroundColor: Colors.background,
    justifyContent: "center", alignItems: "center",
    paddingHorizontal: 30, gap: 20,
  },
  recoveryTitle: {
    color: Colors.textPrimary, fontFamily: Fonts.bold,
    fontSize: 29, textAlign: "center",
  },
  recoveryBody: {
    color: Colors.textMuted, fontFamily: Fonts.regular,
    fontSize: 15, lineHeight: 23, textAlign: "center",
  },
  recoveryButton: {
    backgroundColor: Colors.primaryCyan, borderRadius: 14,
    minHeight: 50, paddingHorizontal: 32,
    justifyContent: "center", alignItems: "center",
  },
  recoveryButtonText: {
    color: Colors.background, fontFamily: Fonts.semiBold, fontSize: 16,
  },
});
