import { LockScreen } from "@/components/LockScreen";
import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * This is a deliberate user-opened screen in Curfy, NOT an iOS shield view.
 * If a shield button can't deep-link to Curfy on a particular iOS version,
 * users can open Curfy normally and reach the same 120-second hold.
 */
export default function Escape() {
  const insets = useSafeAreaInsets();
  return (
    <>
      <LockScreen mode="escape" />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Cancel unlocking"
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
