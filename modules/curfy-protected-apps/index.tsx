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
  prepareProtectedApp(selectionId: string, revision: string, index: number): string;
  validatePreparedApp(ticketId: string): boolean;
};

const validSelectionId = /^curfy-block-(social|most|custom)$/;
const validRevision = /^[a-f0-9]{64}$/;
const scopedTicketPattern = /^curfy-single-app-[0-9A-Fa-f]{8}-(?:[0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}$/;

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


/**
 * Prepares exactly one opaque protected application for a future 120-second
 * hold. This does NOT unshield anything or bypass the free tier.
 * The ticket is random metadata, not an app identity or ApplicationToken.
 */
export function prepareProtectedAppChoice(
  selectionId: string, revision: string, index: number
): string {
  assertSelectionId(selectionId);
  if (!validRevision.test(revision) || !Number.isSafeInteger(index) || index < 0) {
    throw new Error("Invalid protected-app choice.");
  }
  if (Platform.OS !== "ios") {
    throw new Error("Protected-app choices are only available on iPhone.");
  }
  const ticket = requireNativeModule<NativeProtectedApps>("CurfyProtectedApps")
    .prepareProtectedApp(selectionId, revision, index);
  if (typeof ticket !== "string" ||
      !scopedTicketPattern.test(ticket)) {
    throw new Error("iOS did not prepare a valid protected-app choice.");
  }
  return ticket;
}

/** Re-read Apple's saved opaque selection immediately before any later unlock. */
export function validateProtectedAppChoice(ticketId: string): boolean {
  if (!scopedTicketPattern.test(ticketId)) {
    throw new Error("Invalid prepared protected-app choice.");
  }
  if (Platform.OS !== "ios") {
    throw new Error("Protected-app choices are only available on iPhone.");
  }
  const valid = requireNativeModule<NativeProtectedApps>("CurfyProtectedApps")
    .validatePreparedApp(ticketId);
  if (valid !== true) throw new Error("Protected-app choice has changed. Choose the app again.");
  return true;
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
  const NativeLabel = requireNativeViewManager("CurfyProtectedApps") as ComponentType<CurfyAppLabelProps>;
  return <NativeLabel {...props} />;
}
