import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";

type Authorization = "approved" | "denied" | "notDetermined" | "unknown";

type ScreenTimeNative = {
  authorizationStatus(): Authorization;
  requestAuthorization(): Promise<Authorization>;
  selectAndShieldOneApp(): Promise<number>;
  clearShield(): void;
  isShieldConfigured(): boolean;
};

// Resolve lazily: existing Expo Go / web experiences must not fail at import.
function nativeModule(): ScreenTimeNative {
  if (Platform.OS !== "ios") throw new Error("Screen Time shielding is iOS-only.");
  try {
    return requireNativeModule<ScreenTimeNative>("CurfyScreenTime");
  } catch {
    throw new Error("Screen Time requires a custom iOS development build, not Expo Go.");
  }
}

export const screenTime = {
  authorizationStatus: () => nativeModule().authorizationStatus(),
  requestAuthorization: () => nativeModule().requestAuthorization(),
  selectAndShieldOneApp: () => nativeModule().selectAndShieldOneApp(),
  clearShield: () => nativeModule().clearShield(),
  isShieldConfigured: () => nativeModule().isShieldConfigured(),
};
