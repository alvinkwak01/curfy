// Real wrapper over Apple's Screen Time APIs (FamilyControls / ManagedSettings
// / DeviceActivity), fronted by react-native-device-activity. This replaces
// the stub that shipped while the native module wasn't installed yet —
// every function here now calls the actual package, verified against its
// real, installed type declarations (node_modules/react-native-device-activity/build/*.d.ts),
// not guessed from the README summary alone.
//
// Only works on a real iOS device with a dev-client/production build that
// has this native module compiled in — it is a no-op-shaped API surface on
// the JS side, but nothing here functions in Expo Go or the iOS Simulator
// (Apple's Screen Time frameworks don't run in Simulator at all).
import * as DeviceActivity from "react-native-device-activity";
import { currentBedtimeWindow, nativeDateComponents } from "@/lib/bedtimeWindow";

export type ScreenTimeAuthStatus = "notDetermined" | "authorized" | "denied";

export type BlockModeId = "social" | "most" | "custom";

export interface BlockModePreset {
  id: BlockModeId;
  title: string;
  description: string;
  icon: "flame-outline" | "shield-outline" | "hand-left-outline";
  // Shown as the native picker sheet's header — the closest thing to
  // steering the preset's intent, since Apple's picker itself can't be
  // silently pre-filled (the user always has to make the actual selection
  // through Apple's own sheet, every time — see the onboarding fineprint).
  pickerHint: string;
}

export const BLOCK_MODE_PRESETS: BlockModePreset[] = [
  {
    id: "social",
    title: "Just the distractions",
    description: "Social media, games, and short-video apps.",
    icon: "flame-outline",
    pickerHint: "Pick your social media, games, and video apps",
  },
  {
    id: "most",
    title: "Almost everything",
    description: "Every app except Phone and Messages.",
    icon: "shield-outline",
    pickerHint: "Pick everything you want blocked (Phone and Messages stay free)",
  },
  {
    id: "custom",
    title: "I'll choose myself",
    description: "Pick exact apps from your full list.",
    icon: "hand-left-outline",
    pickerHint: "Choose exactly which apps to block",
  },
];

// One stable id per preset — passed to both the native picker (so it can
// persist/reload the right selection) and to blockSelection/unblockSelection
// (so the schedule below always references the same selection the user
// actually picked, whichever preset they used to get there).
export function selectionIdForMode(mode: BlockModeId): string {
  return `curfy-block-${mode}`;
}

const BEDTIME_ACTIVITY_NAME = "curfy-bedtime";
const SCHEDULED_SELECTION_ID_KEY = "curfy-scheduled-selection-id";

/** Last successfully configured app selection, shared with the native extensions. */
function previousScheduledSelectionId(): string | null {
  const value = DeviceActivity.userDefaultsGet<unknown>(SCHEDULED_SELECTION_ID_KEY);
  return typeof value === "string" && value.startsWith("curfy-block-") ? value : null;
}

/** Install both actions together before startMonitoring can invoke a callback. */
function configureBedtimeActions(selectionId: string): void {
  DeviceActivity.configureActions({
    activityName: BEDTIME_ACTIVITY_NAME,
    callbackName: "intervalDidStart",
    actions: [{ type: "blockSelection", familyActivitySelectionId: selectionId }],
  });
  DeviceActivity.configureActions({
    activityName: BEDTIME_ACTIVITY_NAME,
    callbackName: "intervalDidEnd",
    actions: [{ type: "unblockSelection", familyActivitySelectionId: selectionId }],
  });
}

function mapAuthStatus(status: DeviceActivity.AuthorizationStatusType): ScreenTimeAuthStatus {
  if (status === DeviceActivity.AuthorizationStatus.approved) return "authorized";
  if (status === DeviceActivity.AuthorizationStatus.denied) return "denied";
  return "notDetermined";
}

export async function requestScreenTimeAccess(): Promise<ScreenTimeAuthStatus> {
  try {
    await DeviceActivity.requestAuthorization("individual");
  } catch (_) {
    // Rejects when the user declines the system prompt — the real outcome
    // either way is read back below via getAuthorizationStatus().
  }
  return mapAuthStatus(DeviceActivity.getAuthorizationStatus());
}

export function getScreenTimeAccessStatus(): ScreenTimeAuthStatus {
  return mapAuthStatus(DeviceActivity.getAuthorizationStatus());
}

function timeToDateComponents(time: string): DeviceActivity.DateComponents {
  const [hour, minute] = time.split(":").map(Number);
  return { hour, minute };
}

// Register the native start/end actions BEFORE starting monitoring.
// DeviceActivity may invoke intervalDidStart immediately when the schedule
// is already active, so starting it first can lose the very first shield.
// The shield-to-Curfy handoff is still unverified on a physical iPhone:
// "openApp" is a library action, not proof that iOS will open our app.
export async function configureBedtimeBlocking({
  bedtime,
  wakeTime,
  mode,
}: {
  bedtime: string;
  wakeTime: string;
  mode: BlockModeId;
}): Promise<void> {
  if (getScreenTimeAccessStatus() !== "authorized") {
    throw new Error("Screen Time permission is required to protect selected apps.");
  }
  // Reject equal/invalid endpoints rather than creating an ambiguous
  // all-day interval or crashing the Home screen later.
  currentBedtimeWindow(new Date(), bedtime, wakeTime);
  const selectedCount = getSelectionCount(mode);
  if (selectedCount === null || selectedCount < 1) {
    throw new Error("Choose at least one app in Apple's app picker before continuing.");
  }
  const selectionId = selectionIdForMode(mode);
  const previousSelectionId = previousScheduledSelectionId();

  // Register the proposed actions before starting the monitor, because an
  // immediately-active schedule can call intervalDidStart synchronously.
  // Do not clear existing restrictions or cancel an active exception until
  // startMonitoring has actually succeeded.
  configureBedtimeActions(selectionId);
  refreshBedtimeShieldAppearance();
  try {
    await DeviceActivity.startMonitoring(
      BEDTIME_ACTIVITY_NAME,
      {
        intervalStart: timeToDateComponents(bedtime),
        intervalEnd: timeToDateComponents(wakeTime),
        repeats: true,
      },
      []
    );
  } catch (error) {
    // The old monitor may still be running. Restore its callbacks rather
    // than leaving them pointed at a selection that was never saved.
    if (previousSelectionId) configureBedtimeActions(previousSelectionId);
    throw error;
  }

  // This is Curfy's dedicated managed-settings blocklist. Native
  // blockSelection unions tokens, so merely changing the selection in
  // Settings leaves OLD apps blocked. Rebuild only after monitoring succeeds.
  cancelExceptionForScheduleChange();
  DeviceActivity.resetBlocks("curfy-schedule-change-clear-old-apps");
  if (currentBedtimeWindow(new Date(), bedtime, wakeTime)) {
    DeviceActivity.blockSelection(
      { activitySelectionId: selectionId }, "curfy-schedule-change-current-window"
    );
    if (!DeviceActivity.isShieldActive()) {
      // Restore prior protection when possible rather than silently claim
      // the newly saved selection is protected.
      if (previousSelectionId) {
        DeviceActivity.blockSelection(
          { activitySelectionId: previousSelectionId }, "curfy-schedule-change-rollback"
        );
      }
      throw new Error("iOS did not apply the selected app restrictions. Please retry.");
    }
  }
  DeviceActivity.userDefaultsSet(SCHEDULED_SELECTION_ID_KEY, selectionId);
}

/**
 * Applied during setup AND on subsequent app launches, since the native
 * shield configuration is persisted between preview build installations.
 * Existing installs must not keep the old broken "Open Curfy" button.
 */
export function refreshBedtimeShieldAppearance(): void {
  // A ShieldAction extension on iOS 18 cannot reliably launch Curfy.
  // "openApp" in this library attempts NSExtensionContext.open with a
  // different scheme and visibly just closes the blocked app. Never promise
  // a handoff that Apple's supported iOS 18 shield API cannot provide.
  // The full 120-second ring is available inside Curfy via Home → Escape.
  DeviceActivity.updateShield(
    {
      title: "Blocked by Curfy",
      subtitle: "For a 2-minute hold to unlock, open Curfy from your Home Screen.",
      iconSystemName: "moon.stars.fill",
      backgroundColor: { red: 8, green: 8, blue: 16, alpha: 1 },
      titleColor: { red: 239, green: 239, blue: 255, alpha: 1 },
      subtitleColor: { red: 183, green: 186, blue: 219, alpha: 1 },
      iconTint: { red: 0, green: 215, blue: 241, alpha: 1 },
      primaryButtonLabel: "Not now",
      primaryButtonBackgroundColor: { red: 24, green: 27, blue: 49, alpha: 1 },
      primaryButtonLabelColor: { red: 239, green: 239, blue: 255, alpha: 1 },
    },
    { primary: { behavior: "close" } }
  );

}

export function stopBedtimeBlocking(): void {
  cancelExceptionForScheduleChange();
  // Stop may cause intervalDidEnd, so clear its native action first.
  DeviceActivity.configureActions({
    activityName: BEDTIME_ACTIVITY_NAME,
    callbackName: "intervalDidStart",
    actions: [],
  });
  DeviceActivity.configureActions({
    activityName: BEDTIME_ACTIVITY_NAME,
    callbackName: "intervalDidEnd",
    actions: [],
  });
  DeviceActivity.stopMonitoring([BEDTIME_ACTIVITY_NAME]);
  // A user deleting their Curfy account must not leave orphaned app shields.
  DeviceActivity.resetBlocks("curfy-stop-blocking");
  DeviceActivity.userDefaultsRemove(SCHEDULED_SELECTION_ID_KEY);
}

// Reads back how many apps/categories are in a preset's already-persisted
// selection, without opening the picker — used by Settings to show
// "N apps blocked" for the current mode. Returns null if nothing's been
// selected for that preset yet (e.g. it was never picked during onboarding).
export function getSelectionCount(mode: BlockModeId): number | null {
  const metadata = DeviceActivity.activitySelectionMetadata({
    activitySelectionId: selectionIdForMode(mode),
  });
  if (!metadata) return null;
  return metadata.applicationCount + metadata.categoryCount;
}

/** One non-repeating native monitor per deliberate hold; JS timers alone are insufficient. */
const EXCEPTION_ACTIVITY_PREFIX = "curfy-exception-";
const EXCEPTION_STATE_KEY = "curfy-active-exception";
export const EXCEPTION_DURATION_MS = 15 * 60 * 1000;

type ActiveException = {
  activityName: string;
  selectionId: string;
  expiresAt: number;
  bedtimeEndAt: number;
};

/** Returns the currently scheduled exception for UI display (not proof of unshielding). */
export function activeExceptionExpiresAt(now = Date.now()): number | null {
  const state = readException();
  return state && state.expiresAt > now ? state.expiresAt : null;
}

function readException(): ActiveException | null {
  const state = DeviceActivity.userDefaultsGet<ActiveException>(EXCEPTION_STATE_KEY);
  if (!state || typeof state.selectionId !== "string" ||
      typeof state.expiresAt !== "number" || typeof state.bedtimeEndAt !== "number" ||
      typeof state.activityName !== "string") {
    return null;
  }
  return state;
}

export type BedtimeProtectionStatus =
  | "permission-required"
  | "selection-required"
  | "shield-active"
  | "unconfirmed";

/**
 * Dashboard status: only claim a problem when authorization/selection is
 * explicitly absent. Token intersections can return zero while an actual
 * native shield is visible (for example category shielding), so a zero
 * intersection must never assert that iOS did not block the app.
 *
 * isShieldActive() reads the app's ManagedSettingsStore directly. It confirms
 * a Curfy-owned shield exists, but cannot prove which individual app it covers.
 */
export function getBedtimeProtectionStatus(mode: BlockModeId): BedtimeProtectionStatus {
  if (getScreenTimeAccessStatus() !== "authorized") return "permission-required";
  if ((getSelectionCount(mode) ?? 0) < 1) return "selection-required";
  try {
    if (DeviceActivity.isShieldActive()) return "shield-active";
    if (selectedAppShieldCount(selectionIdForMode(mode)) > 0) return "shield-active";
  } catch (error) {
    console.warn("[Curfy] Could not confirm current native shield state", error);
  }
  return "unconfirmed";
}

function selectedAppShieldCount(selectionId: string): number {
  const overlap = DeviceActivity.intersection(
    { activitySelectionId: selectionId },
    { currentBlocklist: true },
    { stripToken: true }
  );
  if (!overlap) throw new Error("iOS couldn't confirm the current app restrictions.");
  return overlap.applicationCount + overlap.categoryCount + overlap.webDomainCount;
}

function stopExceptionMonitor(state: ActiveException): void {
  if (!state.activityName) return;
  // Apple's stopMonitoring can itself produce intervalDidEnd. Remove its
  // action FIRST, and the Swift extension additionally guards expired events.
  DeviceActivity.configureActions({
    activityName: state.activityName,
    callbackName: "intervalDidEnd",
    actions: [],
  });
  DeviceActivity.stopMonitoring([state.activityName]);
}

/**
 * Completing the hold earns up to 15 minutes on the selected apps, never
 * extending beyond this bedtime window. Apple's monitor requires >=15 minutes,
 * so a hold within 15 minutes of wake time simply runs to the normal wake-end.
 *
 * The native extension is responsible for re-shielding after 15 minutes even
 * if Curfy is terminated; JS reconciliation handles delayed system callbacks.
 * The user must explicitly finish the hold before this function is called.
 */
export async function grantBedtimeException({
  bedtime, wakeTime, mode, now = new Date(),
}: {
  bedtime: string;
  wakeTime: string;
  mode: BlockModeId;
  now?: Date;
}): Promise<number> {
  if (getScreenTimeAccessStatus() !== "authorized") {
    throw new Error("Screen Time access is needed to unlock protected apps.");
  }
  const window = currentBedtimeWindow(now, bedtime, wakeTime);
  if (!window) throw new Error("Your selected apps are not in a bedtime blocking window.");
  const selectionId = selectionIdForMode(mode);
  if ((getSelectionCount(mode) ?? 0) < 1) {
    throw new Error("Choose an app to protect in Settings first.");
  }

  // A token intersection can produce a false negative for an actual
  // category shield. Require either explicit token overlap or an active
  // native ManagedSettingsStore shield before starting the exception.
  const overlapBefore = selectedAppShieldCount(selectionId);
  const anyShieldBefore = DeviceActivity.isShieldActive();
  if (overlapBefore === 0 && !anyShieldBefore) {
    throw new Error("iOS is not reporting any active Curfy app restrictions.");
  }

  const previous = readException();
  if (previous && previous.expiresAt > now.getTime()) {
    throw new Error("An app-unlock exception is already active.");
  }
  if (previous) {
    stopExceptionMonitor(previous);
    DeviceActivity.userDefaultsRemove(EXCEPTION_STATE_KEY);
  }

  // End one second after the rounded-down start to guarantee at least
  // Apple's minimum 15-minute interval in whole DateComponents.
  const scheduledStart = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const scheduledEnd = new Date(scheduledStart.getTime() + EXCEPTION_DURATION_MS + 1000);
  const needsMonitor = scheduledEnd.getTime() < window.end.getTime();
  const activityName = needsMonitor
    ? EXCEPTION_ACTIVITY_PREFIX + now.getTime()
    : "";

  const state: ActiveException = {
    activityName,
    selectionId,
    expiresAt: needsMonitor ? scheduledEnd.getTime() : window.end.getTime(),
    bedtimeEndAt: window.end.getTime(),
  };

  // Store in the native shared app group so the monitor extension can reject
  // stale callbacks (including stopMonitoring) and never block after wake.
  DeviceActivity.userDefaultsSet(EXCEPTION_STATE_KEY, state);
  if (!readException()) {
    throw new Error("iOS couldn't save the exception for native recovery.");
  }

  try {
    if (activityName) {
      DeviceActivity.configureActions({
        activityName,
        callbackName: "intervalDidEnd",
        actions: [{ type: "blockSelection", familyActivitySelectionId: selectionId }],
      });
      await DeviceActivity.startMonitoring(activityName, {
        intervalStart: nativeDateComponents(scheduledStart),
        intervalEnd: nativeDateComponents(scheduledEnd),
        repeats: false,
      }, []);
    }
    // The third-party library catches native blocking exceptions, so verify
    // resulting managed settings instead of assuming its call succeeded.
    DeviceActivity.unblockSelection({ activitySelectionId: selectionId }, "curfy-120-second-hold");
    // Only count an unlock after independent native verification. If our
    // selected-token intersection was already zero despite a visible shield,
    // we require the actual ManagedSettingsStore shield to clear instead.
    const overlapAfter = selectedAppShieldCount(selectionId);
    if (overlapBefore > 0 ? overlapAfter > 0 : DeviceActivity.isShieldActive()) {
      throw new Error("iOS did not release the selected app restrictions.");
    }
    return state.expiresAt;
  } catch (error) {
    if (activityName) stopExceptionMonitor(state);
    DeviceActivity.userDefaultsRemove(EXCEPTION_STATE_KEY);
    // Fail closed: restore protection if partial native setup failed.
    DeviceActivity.blockSelection({ activitySelectionId: selectionId }, "curfy-exception-rollback");
    throw error;
  }
}

/** Foreground/restart recovery for callbacks iOS may defer until device use. */
export function reconcileBedtimeException(
  bedtime: string, wakeTime: string, now = new Date()
): void {
  const state = readException();
  if (!state || now.getTime() < state.expiresAt) return;

  const withinBedtime = currentBedtimeWindow(now, bedtime, wakeTime) !== null;
  if (getScreenTimeAccessStatus() !== "authorized") return;

  if (withinBedtime) {
    DeviceActivity.blockSelection(
      { activitySelectionId: state.selectionId }, "curfy-exception-foreground-recovery"
    );
    if (selectedAppShieldCount(state.selectionId) === 0 && !DeviceActivity.isShieldActive()) {
      return; // neither token overlap nor native shield confirms reblocking; retry later
    }
  } else {
    // The standard bedtime end should already have unshielded the apps.
    // This also repairs an old exception callback that arrived late.
    DeviceActivity.unblockSelection(
      { activitySelectionId: state.selectionId }, "curfy-exception-bedtime-ended"
    );
    if (selectedAppShieldCount(state.selectionId) !== 0) return;
  }
  stopExceptionMonitor(state);
  DeviceActivity.userDefaultsRemove(EXCEPTION_STATE_KEY);
}

/** Cancels an existing exception when a new bedtime/selection is saved. */
function cancelExceptionForScheduleChange(): void {
  const state = readException();
  if (!state) return;
  stopExceptionMonitor(state);
  DeviceActivity.userDefaultsRemove(EXCEPTION_STATE_KEY);
}
