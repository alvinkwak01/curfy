import { LockScreen } from "@/components/LockScreen";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";

/**
 * The shield extension cannot open this screen on the tested iOS 18 device.
 * Users open Curfy from their iPhone Home Screen, then use this route.
 */
export default function Escape() {
  const { appIndex, revision } = useLocalSearchParams<{ appIndex?: string; revision?: string }>();
  const choice = typeof appIndex === "string" && /^\d+$/.test(appIndex) && typeof revision === "string"
    ? { index: Number(appIndex), revision } : undefined;
  return <LockScreen choice={choice} mode="escape" onExit={() => router.replace("/(tabs)")} />;
}
