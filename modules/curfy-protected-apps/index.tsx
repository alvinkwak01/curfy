import { requireNativeModule, requireNativeViewManager } from "expo-modules-core";
import type { ComponentType } from "react";
import { Platform } from "react-native";
import type { ViewProps } from "react-native";

export type CurfyProtectedAppsSnapshot = {
  count: number;
  revision: string;
};

type NativeProtectedApps = {
  getProtectedApps(selectionId: string): CurfyProtectedAppsSnapshot;
};

const validSelectionId = /^curfy-block-(social|most|custom)$/;
const validRevision = /^[a-f0-9]{64}$/;

function assertSelectionId(selectionId: string) {
  if (!validSelectionId.test(selectionId)) {
    throw new Error("Only an active Curfy protection selection is allowed.");
  }
}

/** App names and FamilyControls tokens never leave iOS native code. */
export function readProtectedAppChoices(selectionId: string): CurfyProtectedAppsSnapshot {
  assertSelectionId(selectionId);
  if (Platform.OS !== "ios") {
    throw new Error("Protected-app choices are only available on iPhone.");
  }
  const snapshot = requireNativeModule<NativeProtectedApps>("CurfyProtectedApps")
    .getProtectedApps(selectionId);
  if (!snapshot || !Number.isSafeInteger(snapshot.count) || snapshot.count < 1 ||
      typeof snapshot.revision !== "string" || !validRevision.test(snapshot.revision)) {
    throw new Error("iOS did not return a valid protected-app selection.");
  }
  return { count: snapshot.count, revision: snapshot.revision };
}

export type CurfyAppLabelProps = ViewProps & {
  selectionId: string;
  revision: string;
  index: number;
};

/**
 * Read-only Apple icon/name label embedded directly in Curfy. The token is
 * resolved again natively from a validated selection revision, never in JS.
 * The parent RN control is responsible for accessible press/selection UI.
 */
export function CurfyAppLabel(props: CurfyAppLabelProps) {
  assertSelectionId(props.selectionId);
  if (!validRevision.test(props.revision) ||
      !Number.isSafeInteger(props.index) || props.index < 0) {
    throw new Error("Invalid native app label reference.");
  }
  if (Platform.OS !== "ios") return null;
  const NativeLabel = requireNativeViewManager("CurfyProtectedApps")
    as ComponentType<CurfyAppLabelProps>;
  return <NativeLabel {...props} />;
}
