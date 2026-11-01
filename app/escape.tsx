import { LockScreen } from "@/components/LockScreen";
import { router } from "expo-router";
import React from "react";

/**
 * The shield extension cannot open this screen on the tested iOS 18 device.
 * Users open Curfy from their iPhone Home Screen, then use this route.
 */
export default function Escape() {
  return <LockScreen mode="escape" onExit={() => router.replace("/(tabs)")} />;
}
