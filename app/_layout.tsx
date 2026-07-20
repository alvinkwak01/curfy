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
    <SleepProvider>
      <RootLayoutNav />
    </SleepProvider>
  );
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
