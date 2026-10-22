import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Modal, StyleSheet, View } from "react-native";
import "react-native-reanimated";

import { LockScreen } from "@/components/LockScreen";
import { Colors } from "@/constants/theme";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { JournalProvider } from "@/context/JournalContext";
import { SleepProvider, useSleep } from "@/context/SleepContext";
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
    <JournalProvider>
      <AuthProvider>
        <SleepProvider>
          <EnsureLeaderboardIdentity />
          <StreakSync />
          <RootLayoutNav />
        </SleepProvider>
      </AuthProvider>
    </JournalProvider>
  );
}

// Every user is on the global leaderboard automatically — no visible
// "Join"/create-account step. The first time onboarding finishes (i.e. a
// display name exists) and there's no session yet, this silently signs
// the device into an anonymous Supabase auth session and seeds a
// `profiles` row with that name. Renders nothing; needs both contexts in
// scope, same reasoning as StreakSync below.
function EnsureLeaderboardIdentity() {
  const { userName, isOnboardingComplete } = useSleep();
  const { isSignedIn, isAuthLoading, ensureAnonymousProfile } = useAuth();

  useEffect(() => {
    if (!isOnboardingComplete || isAuthLoading || isSignedIn) return;
    ensureAnonymousProfile(userName);
  }, [isOnboardingComplete, isAuthLoading, isSignedIn, userName, ensureAnonymousProfile]);

  return null;
}

// Keeps each signed-in user's `profiles` row current (bedtime, both streak
// numbers, and display name) so the global leaderboard and community
// bedtime chart reflect reality without either screen having to know when
// something changed. Renders nothing — it only needs both contexts in
// scope, which requires it to sit inside both providers (see above).
function StreakSync() {
  const { bedtime, streak, longestStreak, userName } = useSleep();
  const { isSignedIn, syncProfile } = useAuth();

  useEffect(() => {
    if (!isSignedIn) return;
    syncProfile(bedtime, streak, longestStreak, userName);
  }, [isSignedIn, bedtime, streak, longestStreak, userName, syncProfile]);

  return null;
}

function RootLayoutNav() {
  const { isLoading, isOnboardingComplete, isLocked } = useSleep();

  if (isLoading) {
    // Splash screen is still visible at this point.
    return null;
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
      </Stack>

      <Modal visible={isLocked} animationType="fade" statusBarTranslucent>
        <LockScreen />
      </Modal>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Colors.background },
});
