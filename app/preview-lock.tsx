import { LockScreen } from "@/components/LockScreen";
import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Preview-only wrapper: renders the real LockScreen exactly as it appears
// during a real bedtime lock (same streak text, same 120-second hold
// button — completing it for real will count as a real unlock tonight).
// The only addition is a small close control bottom-center, since the
// real lock screen has no way out except holding the button for real.
export default function PreviewLock() {
  const insets = useSafeAreaInsets();
  return (
    <>
      <LockScreen />
      <TouchableOpacity
        style={[styles.exit, { bottom: insets.bottom + 90 }]}
        onPress={() => router.back()}
        hitSlop={12}
      >
        <Ionicons name="close" size={18} color={Colors.textMuted} />
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  exit: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
