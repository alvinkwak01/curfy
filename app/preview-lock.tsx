import { LockScreen } from "@/components/LockScreen";
import { router } from "expo-router";
import React from "react";

/** Same circular hold UI for demonstration, but no native unlock or escape count. */
export default function PreviewLock() {
  return <LockScreen mode="preview" onExit={() => router.back()} />;
}
