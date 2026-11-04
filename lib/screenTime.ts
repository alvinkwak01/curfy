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
import { normalizeActivitySelectionMetadata, selectionIssueForEntitlement } from "@/lib/premiumPolicy";
import { assertMonitorableBedtimeSchedule, currentBedtimeWindow, nativeDateComponents } from "@/lib/bedtimeWindow";

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

/**
 * Start each genuinely fresh onboarding picker from an empty native selection.
 * The older build could leave curfy-block-custom tokens in the shared iOS
 * app group after Delete Everything. Opening the persisted sheet previously
 * displayed those old checkmarks, so choosing "one" new app meant 2+ tokens.
 *
 * Called only on the first picker open in a new onboarding session, AFTER
 * protection has been stopped on account deletion/restart. If iOS refuses to
 * clear the old selection, show an error rather than presenting a stale picker.
 */
export function beginFreshOnboardingAppSelection(mode: BlockModeId): void {
  // A fresh chooser must never mutate the selection of a still-monitored
  // schedule. Restart/Delete must stop real iOS protection first.
  if (DeviceActivity.getActivities().includes("curfy-bedtime")) {
    throw new Error("An existing Curfy protection schedule is still active. Stop it before restarting setup.");
  }
  const id = selectionIdForMode(mode);
  const selections = DeviceActivity.userDefaultsGet<unknown>("familyActivitySelectionIds");
  if (selections == null) return;
  if (typeof selections !== "object" || Array.isArray(selections)) {
    throw new Error("Couldn't reset the previous app selection.");
  }
  const saved = selections as Record<string, unknown>;
  if (!(id in saved)) return;
  const fresh = { ...saved };
  delete fresh[id];
  DeviceActivity.userDefaultsSet("familyActivitySelectionIds", fresh);
  const after = DeviceActivity.userDefaultsGet<Record<string, unknown>>("familyActivitySelectionIds");
  if (!after || id in after) {
    throw new Error("iOS didn't clear the previous app choice. Try restarting Curfy.");
  }
}

/** Editing is isolated from the tokens used by the live DeviceActivity monitor. */
export function draftSelectionIdForMode(mode: BlockModeId): string {
  return `curfy-draft-${mode}`;
}

/**
 * Reading the same opaque token selection in Settings is not a change.
 * iOS picker reopens should not cancel a 15-minute exception or force
 * a fresh 120-second hold just because somebody viewed their chosen app.
 */
export function selectionDraftChanged(mode: BlockModeId): boolean {
  return DeviceActivity.getFamilyActivitySelectionId(draftSelectionIdForMode(mode)) !==
    DeviceActivity.getFamilyActivitySelectionId(selectionIdForMode(mode));
}

/** Existing saved app tokens, not app identities, are cloned into a draft. */
export function prepareSelectionDraft(mode: BlockModeId): string {
  const id = draftSelectionIdForMode(mode);
  const existing = DeviceActivity.getFamilyActivitySelectionId(selectionIdForMode(mode));
  if (existing) {
    DeviceActivity.setFamilyActivitySelectionId({ id, familyActivitySelection: existing });
  } else {
    // Abandoned drafts live in shared storage across Settings sessions.
    // Fresh users must not accidentally inherit an unsaved selection.
    restoreSelection(id, undefined);
  }
  return id;
}

function restoreSelection(id: string, previous: string | undefined): void {
  if (previous) {
    DeviceActivity.setFamilyActivitySelectionId({ id, familyActivitySelection: previous });
    return;
  }
  // A new user had no committed selection. Restore that exact state.
  const all = DeviceActivity.userDefaultsGet<Record<string, string>>("familyActivitySelectionIds") ?? {};
  const copy = { ...all };
  delete copy[id];
  DeviceActivity.userDefaultsSet("familyActivitySelectionIds", copy);
}

const BEDTIME_ACTIVITY_NAME = "curfy-bedtime";
const SCHEDULED_SELECTION_ID_KEY = "curfy-scheduled-selection-id";
const BEDTIME_CLOCK_KEY = "curfy-bedtime-clock-window";

type BedtimeClockWindow = { startMinute: number; endMinute: number };

function clockMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function restoreBedtimeClockWindow(previous: BedtimeClockWindow | undefined): void {
  if (previous) DeviceActivity.userDefaultsSet(BEDTIME_CLOCK_KEY, previous);
  else DeviceActivity.userDefaultsRemove(BEDTIME_CLOCK_KEY);
}

function persistBedtimeClockWindow(bedtime: string, wakeTime: string): void {
  const value = { startMinute: clockMinutes(bedtime), endMinute: clockMinutes(wakeTime) };
  DeviceActivity.userDefaultsSet(BEDTIME_CLOCK_KEY, value);
  const saved = DeviceActivity.userDefaultsGet<BedtimeClockWindow>(BEDTIME_CLOCK_KEY);
  if (saved?.startMinute !== value.startMinute || saved?.endMinute !== value.endMinute) {
    throw new Error("iOS couldn't save bedtime boundary information for native monitoring.");
  }
}

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
    // A denied iOS system prompt may reject; read the authoritative status.
  }
  // Upstream react-native-device-activity documents a short native status
  // propagation lag after the user grants permission. Without retry, Curfy
  // could falsely insist that an approved user is still unauthorized.
  let status = mapAuthStatus(DeviceActivity.getAuthorizationStatus());
  for (let attempt = 0; attempt < 4 && status === "notDetermined"; attempt++) {
    await new Promise<void>(resolve => setTimeout(resolve, 200));
    status = mapAuthStatus(DeviceActivity.getAuthorizationStatus());
  }
  return status;
}

export function getScreenTimeAccessStatus(): ScreenTimeAuthStatus {
  return mapAuthStatus(DeviceActivity.getAuthorizationStatus());
}

function timeToDateComponents(time: string): DeviceActivity.DateComponents {
  const [hour, minute] = time.split(":").map(Number);
  return { hour, minute };
}

// Register the native start/end actions BEFORE starting monitoring.
// Apple documents that startMonitoring with the SAME activity name overwrites
// its previous schedule. Saving Settings therefore needs an explicit rollback.
function dateComponentsForMinuteOfDay(value: number): DeviceActivity.DateComponents {
  return { hour: Math.floor(value / 60), minute: value % 60 };
}

function clearBedtimeActions(): void {
  for (const callbackName of ["intervalDidStart", "intervalDidEnd"] as const) {
    DeviceActivity.configureActions({
      activityName: BEDTIME_ACTIVITY_NAME, callbackName, actions: [],
    });
  }
}

async function restorePreviousBedtimeMonitor({
  previousSelectionId,
  previousClockWindow,
  previouslyMonitored,
}: {
  previousSelectionId: string | null;
  previousClockWindow: BedtimeClockWindow | undefined;
  previouslyMonitored: boolean;
}): Promise<void> {
  // Restore extension-visible time and tokens BEFORE re-registering a monitor
  // that could synchronously call intervalDidStart.
  restoreBedtimeClockWindow(previousClockWindow);
  if (previousSelectionId) configureBedtimeActions(previousSelectionId);
  else clearBedtimeActions();

  if (previouslyMonitored && previousSelectionId && previousClockWindow) {
    await DeviceActivity.startMonitoring(BEDTIME_ACTIVITY_NAME, {
      intervalStart: dateComponentsForMinuteOfDay(previousClockWindow.startMinute),
      intervalEnd: dateComponentsForMinuteOfDay(previousClockWindow.endMinute),
      repeats: true,
    }, []);
    if (!DeviceActivity.getActivities().includes(BEDTIME_ACTIVITY_NAME)) {
      throw new Error("iOS did not restore the previous native schedule.");
    }
  } else if (!previouslyMonitored) {
    DeviceActivity.stopMonitoring([BEDTIME_ACTIVITY_NAME]);
  } else {
    // A legacy monitored install without saved boundaries cannot be safely
    // reconstructed. Never claim its schedule was restored.
    throw new Error("Previous native schedule has no saved clock boundaries.");
  }
}

export async function configureBedtimeBlocking({
  bedtime,
  wakeTime,
  mode,
  now = new Date(),
  draftSelectionId,
}: {
  bedtime: string;
  wakeTime: string;
  mode: BlockModeId;
  now?: Date;
  /** Settings stages picker changes independently of live opaque tokens. */
  draftSelectionId?: string;
}): Promise<void> {
  if (getScreenTimeAccessStatus() !== "authorized") {
    throw new Error("Screen Time permission is required to protect selected apps.");
  }
  assertMonitorableBedtimeSchedule(bedtime, wakeTime);
  currentBedtimeWindow(now, bedtime, wakeTime);
  const selectionId = selectionIdForMode(mode);
  const pendingId = draftSelectionId ?? selectionId;
  assertOneFreeAppSelected(pendingId);
  if (draftSelectionId && draftSelectionId !== draftSelectionIdForMode(mode)) {
    throw new Error("Unexpected app selection draft. Open the picker and try again.");
  }

  // Snapshot the previous native schedule, not only its opaque selection.
  // Otherwise an unsuccessful Settings save could leave new hours installed,
  // despite the UI still showing the old hours.
  const previousSelectionId = previousScheduledSelectionId();
  const previousClockWindow = DeviceActivity.userDefaultsGet<BedtimeClockWindow>(BEDTIME_CLOCK_KEY);
  const previouslyMonitored = DeviceActivity.getActivities().includes(BEDTIME_ACTIVITY_NAME);
  const previousTokens = DeviceActivity.getFamilyActivitySelectionId(selectionId);
  const previousException = readException();
  let blocksChanged = false;
  let nativeScheduleTouched = false;

  try {
    if (draftSelectionId) {
      const draftTokens = DeviceActivity.getFamilyActivitySelectionId(draftSelectionId);
      if (!draftTokens) throw new Error("Choose an app in the picker before saving.");
      DeviceActivity.setFamilyActivitySelectionId({
        id: selectionId, familyActivitySelection: draftTokens,
      });
    }

    persistBedtimeClockWindow(bedtime, wakeTime);
    configureBedtimeActions(selectionId);
    refreshBedtimeShieldAppearance();
    // startMonitoring can overwrite a previously monitored activity.
    nativeScheduleTouched = true;
    await DeviceActivity.startMonitoring(BEDTIME_ACTIVITY_NAME, {
      intervalStart: timeToDateComponents(bedtime),
      intervalEnd: timeToDateComponents(wakeTime),
      repeats: true,
    }, []);
    if (!DeviceActivity.getActivities().includes(BEDTIME_ACTIVITY_NAME)) {
      throw new Error("iOS did not register bedtime monitoring. Please retry.");
    }

    // Do not cancel an earned exception until the new restriction state has
    // been applied and independently verified. A failed schedule edit must
    // not silently steal minutes from a valid 120-second hold.
    blocksChanged = true;
    DeviceActivity.resetBlocks("curfy-schedule-change-clear-old-apps");
    // The library's reset is synchronous but may swallow native errors.
    // If yesterday's selected app is STILL shielded, don't add another app
    // and claim a clean update: the user could end up with two locked apps
    // even though they only chose one.
    if (DeviceActivity.isShieldActive()) {
      throw new Error("iOS did not clear the old app restrictions. Your previous schedule was kept.");
    }
    if (currentBedtimeWindow(now, bedtime, wakeTime)) {
      DeviceActivity.blockSelection(
        { activitySelectionId: selectionId }, "curfy-schedule-change-current-window"
      );
      if (!DeviceActivity.isShieldActive()) {
        throw new Error("iOS did not apply the selected app restrictions. Please retry.");
      }
    }
    DeviceActivity.userDefaultsSet(SCHEDULED_SELECTION_ID_KEY, selectionId);
    cancelExceptionForScheduleChange();
  } catch (error) {
    if (draftSelectionId) restoreSelection(selectionId, previousTokens);
    // A failure after writing the new ID cannot leave JS and the extension
    // disagreeing about which opaque app selection was last committed.
    if (previousSelectionId) {
      DeviceActivity.userDefaultsSet(SCHEDULED_SELECTION_ID_KEY, previousSelectionId);
    } else {
      DeviceActivity.userDefaultsRemove(SCHEDULED_SELECTION_ID_KEY);
    }

    let rollbackError: unknown = null;
    if (nativeScheduleTouched) {
      try {
        await restorePreviousBedtimeMonitor({
          previousSelectionId, previousClockWindow, previouslyMonitored,
        });
      } catch (restoreError) {
        rollbackError = restoreError;
      }
    } else {
      restoreBedtimeClockWindow(previousClockWindow);
      if (previousSelectionId) configureBedtimeActions(previousSelectionId);
      else clearBedtimeActions();
    }

    // A reset of the app-owned blocklist must also be undone. Don't replace
    // a currently active exception with a shield during failure recovery.
    if (blocksChanged) {
      DeviceActivity.resetBlocks("curfy-schedule-rollback-clear");
      const exceptionStillActive = previousException &&
        previousException.expiresAt > now.getTime() &&
        previousException.bedtimeEndAt > now.getTime();
      if (!exceptionStillActive && previousSelectionId && previousClockWindow) {
        const oldStart = dateComponentsForMinuteOfDay(previousClockWindow.startMinute);
        const oldEnd = dateComponentsForMinuteOfDay(previousClockWindow.endMinute);
        const oldTime = (value: DeviceActivity.DateComponents) =>
          `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
        if (currentBedtimeWindow(now, oldTime(oldStart), oldTime(oldEnd))) {
          DeviceActivity.blockSelection(
            { activitySelectionId: previousSelectionId }, "curfy-schedule-rollback-old-app"
          );
          if (!DeviceActivity.isShieldActive()) {
            rollbackError = new Error("The previous app shield could not be restored.");
          }
        }
      }
    }

    // Do not report normal "save failed" if old protections may have been
    // lost. State exactly what must be checked on the phone.
    if (rollbackError) {
      throw new Error("New schedule failed and Curfy couldn't confirm the previous native protection was restored. Open Curfy Settings and check your protected app and hours.");
    }
    throw error;
  }
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

export function stopBedtimeBlocking(now = new Date()): void {
  // Validate all recovery state before touching either native monitor.
  // A corrupted one-shot activity must never impersonate the daily cutoff.
  const previousException = readException(true);
  const previousSelectionId = previousScheduledSelectionId();
  const previousClockWindow = DeviceActivity.userDefaultsGet<BedtimeClockWindow>(
    BEDTIME_CLOCK_KEY
  );
  const dailyIsRunning = DeviceActivity.getActivities().includes(BEDTIME_ACTIVITY_NAME);

  // Stop the one-shot exception FIRST. In the former order, stopping the
  // recurring monitor succeeded and a refused exception stop left a still-
  // running reblock callback with no daily cutoff to release its new shield.
  // Do not stop an active exception until the selected app is re-shielded:
  // a refused daily stop must leave the still-running daily schedule safe.
  // Stop Protection / Restart Setup explicitly ends the temporary exception.
  if (previousException) {
    if (dailyIsRunning && previousException.selectionId !== previousSelectionId) {
      throw new Error("Curfy's temporary app exception does not match its scheduled app. Check Screen Time Settings before stopping protection.");
    }
    const withinPreviousWindow = !!previousClockWindow &&
      Number.isInteger(previousClockWindow.startMinute) &&
      Number.isInteger(previousClockWindow.endMinute) &&
      currentBedtimeWindow(
        now,
        `${String(Math.floor(previousClockWindow.startMinute / 60)).padStart(2, "0")}:${String(previousClockWindow.startMinute % 60).padStart(2, "0")}`,
        `${String(Math.floor(previousClockWindow.endMinute / 60)).padStart(2, "0")}:${String(previousClockWindow.endMinute % 60).padStart(2, "0")}`
      ) !== null;
    if (dailyIsRunning && withinPreviousWindow &&
        now.getTime() < previousException.bedtimeEndAt) {
      DeviceActivity.blockSelection(
        { activitySelectionId: previousException.selectionId },
        "curfy-stop-restore-shield-before-exception-cancel"
      );
      const overlap = selectedShieldCountOrNull(previousException.selectionId);
      if ((overlap ?? 0) === 0 && !DeviceActivity.isShieldActive()) {
        throw new Error("iOS did not confirm Curfy's app was re-shielded before stopping the temporary monitor.");
      }
    }
    // A refused stop restores the one-shot intervalDidEnd action and throws;
    // the daily monitor has NOT yet been touched. Do not erase either record.
    cancelExceptionForScheduleChange();
  }

  // Keep the committed selection until BOTH native monitoring and shields
  // have stopped. Stopping can synchronously invoke intervalDidEnd, so its
  // actions must first be cleared, but a FAILED stop must restore them.
  try {
    // Even clearing action metadata can fail. Keep that operation inside the
    // rollback boundary, so a partly-cleared action set is reconstructed.
    clearBedtimeActions();
    DeviceActivity.stopMonitoring([BEDTIME_ACTIVITY_NAME]);
    if (DeviceActivity.getActivities().includes(BEDTIME_ACTIVITY_NAME)) {
      throw new Error("iOS still has Curfy's protection schedule. Try stopping protection again.");
    }
    DeviceActivity.resetBlocks("curfy-stop-blocking");
    if (DeviceActivity.isShieldActive()) {
      throw new Error("iOS still reports protected apps after stopping Curfy. Retry before deleting local setup.");
    }
  } catch (error) {
    // If the recurring monitor survived, it must KEEP its start/end actions;
    // otherwise a later device-use callback cannot release the blocked app
    // even after the scheduled cutoff. Never replace a missing monitor here.
    try {
      if (previousSelectionId &&
          DeviceActivity.getActivities().includes(BEDTIME_ACTIVITY_NAME)) {
        configureBedtimeActions(previousSelectionId);
      }
    } catch (restoreError) {
      console.warn("[Curfy] Failed restoring actions after unsuccessful native stop", restoreError);
      throw new Error("Curfy couldn't stop protection or confirm the original native callbacks were restored. Open Curfy Settings and retry.");
    }
    throw error;
  }
  DeviceActivity.userDefaultsRemove(SCHEDULED_SELECTION_ID_KEY);
  DeviceActivity.userDefaultsRemove(BEDTIME_CLOCK_KEY);
}

/**
 * Only after iOS has confirmed the daily schedule and shields are stopped,
 * erase the onboarding picker selections for a deleted Curfy account.
 * Restart Setup intentionally does NOT call this: it preserves the account.
 *
 * Other apps' UserDefaults keys are untouched. Premium per-app tickets need
 * their own monitor-aware cleanup before Premium becomes user-facing.
 */
export function clearCurfyOnboardingSelectionsAfterAccountDeletion(): void {
  // Never erase the ONLY opaque one-app ticket that a still-running iOS
  // exception monitor could need to re-shield a protected app. The caller
  // must have stopped protection first; check all exception monitor names.
  const running = DeviceActivity.getActivities();
  if (running.some(name =>
      name === BEDTIME_ACTIVITY_NAME ||
      name.startsWith(EXCEPTION_ACTIVITY_PREFIX) ||
      name.startsWith("curfy-premium-exception-"))) {
    throw new Error("Curfy still has a native protection or exception monitor. Stop it before erasing app selections.");
  }
  const key = "familyActivitySelectionIds";
  const ticketKey = "curfy-prepared-app-choice-tickets";
  const premiumRecoveryKey = "curfy-premium-active-exceptions";
  const saved = DeviceActivity.userDefaultsGet<unknown>(key);
  const isOwnedSelection = (id: string) =>
    /^curfy-(?:block|draft)-(?:social|most|custom)$/.test(id) ||
    id.startsWith("curfy-single-app-");

  if (saved !== null && saved !== undefined) {
    if (typeof saved !== "object" || Array.isArray(saved)) {
      throw new Error("iOS protected-app selections could not be cleared safely.");
    }
    const oldSelections = saved as Record<string, unknown>;
    const retained = Object.fromEntries(
      Object.entries(oldSelections).filter(([id]) => !isOwnedSelection(id))
    );
    DeviceActivity.userDefaultsSet(key, retained);
    const after = DeviceActivity.userDefaultsGet<unknown>(key);
    if (!after || typeof after !== "object" || Array.isArray(after) ||
        Object.keys(after).some(isOwnedSelection)) {
      throw new Error("iOS did not confirm the old Curfy app selections were erased.");
    }
  }

  // Even when the main selection dictionary is absent, private ticket
  // metadata or an old expired Premium ledger can still survive in App Group.
  // No native Curfy monitor may remain by the guard above.
  for (const ownedKey of [ticketKey, premiumRecoveryKey, EXCEPTION_STATE_KEY]) {
    DeviceActivity.userDefaultsRemove(ownedKey);
    if (DeviceActivity.userDefaultsGet<unknown>(ownedKey) != null) {
      throw new Error("iOS did not confirm removal of Curfy's private app-access records.");
    }
  }
}

// Reads back how many apps/categories are in a preset's already-persisted
// selection, without opening the picker — used by Settings to show
// "N apps blocked" for the current mode. Returns null if nothing's been
// selected for that preset yet (e.g. it was never picked during onboarding).
export function getSelectionCount(mode: BlockModeId): number | null {
  const metadata = normalizeActivitySelectionMetadata(selectionMetadata(mode));
  if (!metadata) return null;
  return metadata.applicationCount + metadata.categoryCount + metadata.webDomainCount;
}

/**
 * The MVP has no paid entitlement implemented. Therefore exactly ONE explicit
 * app is supported, regardless of which older preset was saved. A category
 * can cover hundreds of apps and is not a valid substitute for one app.
 * The native picker itself does not enforce a maximum, so validate the
 * persisted opaque-token metadata before scheduling or granting an exception.
 */
function selectionMetadata(mode: BlockModeId) {
  return DeviceActivity.activitySelectionMetadata({
    activitySelectionId: selectionIdForMode(mode),
  });
}

export type FreeSelectionIssue = "choose-one-app" | "too-many-apps-or-categories";

/** A null issue means exactly one application and no category/domain tokens. */
export function freeSelectionIssue(modeOrSelectionId: BlockModeId | string): FreeSelectionIssue | null {
  const id = modeOrSelectionId.startsWith("curfy-")
    ? modeOrSelectionId
    : selectionIdForMode(modeOrSelectionId as BlockModeId);
  return freeSelectionIssueForMetadata(
    DeviceActivity.activitySelectionMetadata({ activitySelectionId: id })
  );
}

/** Used by both native scheduling and the iOS picker immediately on dismiss. */
export function freeSelectionIssueForMetadata(
  meta: Pick<DeviceActivity.ActivitySelectionMetadata,
    "applicationCount" | "categoryCount" | "webDomainCount" | "includeEntireCategory"> | null | undefined
): FreeSelectionIssue | null {
  // Until real StoreKit verification AND one-app-per-hold exceptions ship,
  // every native call continues to enforce the safe one-app free behavior.
  // Reuse the shared premium policy so future gates cannot silently diverge.
  const issue = selectionIssueForEntitlement(meta, "free");
  if (!issue) return null;
  return issue === "choose-one-app"
    ? "choose-one-app"
    : "too-many-apps-or-categories";
}

function assertOneFreeAppSelected(selectionId: string): void {
  const issue = freeSelectionIssue(selectionId);
  if (issue === "choose-one-app") {
    throw new Error("Select one app to protect. The free version protects one app.");
  }
  if (issue) {
    throw new Error("The free version protects one individual app. Remove extra apps, categories and websites in Apple's picker.");
  }
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

function readException(strict = false): ActiveException | null {
  const raw = DeviceActivity.userDefaultsGet<unknown>(EXCEPTION_STATE_KEY);
  if (raw === null || raw === undefined) return null;
  const state = raw as Partial<ActiveException>;
  const valid = typeof raw === "object" && !Array.isArray(raw) &&
    typeof state.selectionId === "string" &&
    /^curfy-block-(social|most|custom)$/.test(state.selectionId) &&
    typeof state.activityName === "string" &&
    (state.activityName === "" ||
      /^curfy-exception-\d{12,16}$/.test(state.activityName)) &&
    Number.isSafeInteger(state.expiresAt) && (state.expiresAt ?? 0) > 0 &&
    Number.isSafeInteger(state.bedtimeEndAt) && (state.bedtimeEndAt ?? 0) > 0 &&
    state.expiresAt! <= state.bedtimeEndAt!;
  if (!valid) {
    // Keep the Home status query nonthrowing, but NEVER overwrite a corrupt
    // existing record while preparing a native monitor. In particular, an
    // arbitrary activityName could otherwise clear the recurring bedtime
    // intervalDidEnd action and strand a selected app behind its shield.
    if (strict) {
      throw new Error("Curfy couldn't verify a previous app-access record. Check Screen Time protection in Settings before requesting another unlock.");
    }
    return null;
  }
  return state as ActiveException;
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
  if (freeSelectionIssue(mode)) return "selection-required";
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
  const verified = normalizeActivitySelectionMetadata(overlap);
  if (!verified) throw new Error("iOS couldn't confirm the current app restrictions.");
  return verified.applicationCount + verified.categoryCount + verified.webDomainCount;
}

/** Native token introspection may be unavailable even when a real OS shield
 * exists. Return null only for the probe; fall back to the app-owned native
 * ManagedSettingsStore state, never to an optimistic success. */
function selectedShieldCountOrNull(selectionId: string): number | null {
  try {
    return selectedAppShieldCount(selectionId);
  } catch (error) {
    console.warn("[Curfy] Native selected-token overlap unavailable", error);
    return null;
  }
}

function stopExceptionMonitor(state: ActiveException): void {
  if (!state.activityName) return;
  // stopMonitoring can synchronously dispatch intervalDidEnd, so clear the
  // callback first. But native implementations sometimes return without
  // removing the monitor: in that case we MUST restore its re-shield action
  // instead of silently leaving a running monitor without recovery.
  const reblockAction = [{
    type: "blockSelection" as const,
    familyActivitySelectionId: state.selectionId,
  }];
  DeviceActivity.configureActions({
    activityName: state.activityName,
    callbackName: "intervalDidEnd",
    actions: [],
  });
  let stopped = false;
  try {
    DeviceActivity.stopMonitoring([state.activityName]);
    stopped = !DeviceActivity.getActivities().includes(state.activityName);
  } finally {
    if (!stopped) {
      // If this throws, the caller must surface an explicit failure and keep
      // its App Group recovery record instead of claiming exception cleanup.
      DeviceActivity.configureActions({
        activityName: state.activityName,
        callbackName: "intervalDidEnd",
        actions: reblockAction,
      });
    }
  }
  if (!stopped) {
    throw new Error("iOS didn't stop Curfy's temporary app-access monitor. Protection recovery was kept; retry in Settings.");
  }
}

// A second concurrent monitor registration could overwrite the first one's
// shared reblocking state. Never allow two native Free exception grants at once.
let freeExceptionGrantInProgress = false;

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
  if (freeExceptionGrantInProgress) {
    throw new Error("Another Curfy app unlock is already being prepared.");
  }
  freeExceptionGrantInProgress = true;
  try {
  if (getScreenTimeAccessStatus() !== "authorized") {
    throw new Error("Screen Time access is needed to unlock protected apps.");
  }
  const window = currentBedtimeWindow(now, bedtime, wakeTime);
  if (!window) throw new Error("Your selected apps are not in a bedtime blocking window.");
  const selectionId = selectionIdForMode(mode);
  assertOneFreeAppSelected(selectionId);

  // A failed/revoked native daily monitor can leave a visible orphan shield.
  // Never register a fresh 15-minute reblock that might persist past the
  // user's chosen end time when there is no recurring cutoff callback.
  // Existing simulated-native tests without an installed schedule keep their
  // separate direct-grant fixture; real configured installs save BOTH values.
  const savedSelection = previousScheduledSelectionId();
  const savedWindow = DeviceActivity.userDefaultsGet<BedtimeClockWindow>(BEDTIME_CLOCK_KEY);
  if ((savedSelection !== null || savedWindow !== undefined) &&
      (savedSelection !== selectionId ||
       !DeviceActivity.getActivities().includes(BEDTIME_ACTIVITY_NAME))) {
    throw new Error(
      "Curfy's recurring iOS protection schedule is missing or changed. Open Settings and restore protection before requesting an app exception."
    );
  }

  // If a previous exception is still active, tell the user before probing
  // managed shields: an already-unblocked app correctly has no shield, but
  // that's not a missing or failed Screen Time configuration.
  const previous = readException(true);
  if (previous && previous.expiresAt > now.getTime()) {
    throw new Error("An app-unlock exception is already active.");
  }

  // A token intersection can produce a false negative for an actual
  // category shield. Require either explicit token overlap or an active
  // native ManagedSettingsStore shield before starting the exception.
  const overlapBefore = selectedShieldCountOrNull(selectionId);
  const anyShieldBefore = DeviceActivity.isShieldActive();
  if ((overlapBefore ?? 0) === 0 && !anyShieldBefore) {
    throw new Error("iOS is not reporting any active Curfy app restrictions.");
  }

  if (previous) {
    stopExceptionMonitor(previous);
    DeviceActivity.userDefaultsRemove(EXCEPTION_STATE_KEY);
  }

  // Apple rejects native monitoring intervals shorter than 15 whole
  // minutes. DateComponents are second-precision, so the native monitor
  // extends from the floored start to 15m+1s. This is distinct from the
  // logical user-facing expiry, which must NEVER exceed 15 actual minutes.
  // iOS may still delay physical callbacks; only device testing can prove
  // practical re-shield timing.
  const scheduledStart = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const scheduledEnd = new Date(scheduledStart.getTime() + EXCEPTION_DURATION_MS + 1000);
  const logicalExpiry = Math.min(now.getTime() + EXCEPTION_DURATION_MS, window.end.getTime());
  const needsMonitor = scheduledEnd.getTime() < window.end.getTime();
  const activityName = needsMonitor
    ? EXCEPTION_ACTIVITY_PREFIX + now.getTime()
    : "";

  const state: ActiveException = {
    activityName,
    selectionId,
    expiresAt: logicalExpiry,
    bedtimeEndAt: window.end.getTime(),
  };

  // Store in the native shared app group so the monitor extension can reject
  // stale callbacks (including stopMonitoring) and never block after wake.
  DeviceActivity.userDefaultsSet(EXCEPTION_STATE_KEY, state);
  if (!readException()) {
    throw new Error("iOS couldn't save the exception for native recovery.");
  }

  let monitorRequested = false;
  let unshieldAttempted = false;
  try {
    if (activityName) {
      // Native monitoring APIs can fail AFTER installing a monitor.
      // The rollback path must know to inspect and stop it in either case.
      monitorRequested = true;
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
      if (!DeviceActivity.getActivities().includes(activityName)) {
        throw new Error("iOS did not register the automatic reblocking monitor.");
      }
    }
    // The third-party library catches native blocking exceptions, so verify
    // resulting managed settings instead of assuming its call succeeded.
    unshieldAttempted = true;
    DeviceActivity.unblockSelection({ activitySelectionId: selectionId }, "curfy-120-second-hold");
    // Only count an unlock after independent native verification. If our
    // selected-token intersection was already zero despite a visible shield,
    // we require the actual ManagedSettingsStore shield to clear instead.
    const overlapAfter = selectedShieldCountOrNull(selectionId);
    // A positive token overlap is always failure. When either probe is
    // unavailable or previously returned zero despite a real shield,
    // require the native ManagedSettingsStore shield to disappear too.
    const stillShielded = (overlapAfter !== null && overlapAfter > 0) ||
      ((overlapBefore === null || overlapBefore === 0 || overlapAfter === null) &&
        DeviceActivity.isShieldActive());
    if (stillShielded) {
      throw new Error("iOS did not release the selected app restrictions.");
    }
    return state.expiresAt;
  } catch (error) {
    // A failed native method can have already changed the shield. Re-apply
    // the one selected app FIRST, and verify ManagedSettings. If this fails,
    // keep both the shared recovery state and the monitor's reblock action:
    // otherwise force-quitting Curfy could strand the app unshielded.
    let shieldRestored = false;
    try {
      if (unshieldAttempted) {
        DeviceActivity.blockSelection(
          { activitySelectionId: selectionId }, "curfy-exception-rollback"
        );
      }
      const overlap = selectedShieldCountOrNull(selectionId);
      shieldRestored = (overlap !== null && overlap > 0) || DeviceActivity.isShieldActive();
    } catch (restoreError) {
      console.warn("[Curfy] Failed verifying exception rollback shield", restoreError);
    }

    let monitorStopped = !monitorRequested;
    if (monitorRequested && shieldRestored) {
      try {
        stopExceptionMonitor(state);
        monitorStopped = !DeviceActivity.getActivities().includes(activityName);
        if (!monitorStopped) {
          // stopMonitoring sometimes returns without actually stopping. The
          // live monitor must KEEP a reblock action for its own expiry.
          DeviceActivity.configureActions({
            activityName, callbackName: "intervalDidEnd",
            actions: [{ type: "blockSelection", familyActivitySelectionId: selectionId }],
          });
        }
      } catch (stopError) {
        console.warn("[Curfy] Failed stopping the partial native exception monitor", stopError);
        monitorStopped = false;
        try {
          DeviceActivity.configureActions({
            activityName, callbackName: "intervalDidEnd",
            actions: [{ type: "blockSelection", familyActivitySelectionId: selectionId }],
          });
        } catch (restoreActionError) {
          console.warn("[Curfy] Failed recovering native exception reblock action", restoreActionError);
        }
      }
    }

    if (shieldRestored && monitorStopped) {
      DeviceActivity.userDefaultsRemove(EXCEPTION_STATE_KEY);
      if (DeviceActivity.userDefaultsGet<unknown>(EXCEPTION_STATE_KEY) !== null &&
          DeviceActivity.userDefaultsGet<unknown>(EXCEPTION_STATE_KEY) !== undefined) {
        throw new Error("Curfy couldn't confirm cleanup of the failed app-access record. Check Screen Time protection.");
      }
      throw error;
    }
    // Failed rollback is NOT a normal denied unlock. Preserve native
    // recovery metadata for foreground restart and the extension callback.
    throw new Error(
      "Curfy couldn't confirm recovery of the selected app restriction. Open Settings and check native protection."
    );
  }
  } finally {
    freeExceptionGrantInProgress = false;
  }
}

/**
 * Foreground reconciliation for the *entire* recurring app-protection window.
 * iOS may defer start/end callbacks until the device is used; if someone
 * reopens Curfy after the cutoff, clear stale shields immediately instead
 * of leaving an Evening app blocked well into the day.
 *
 * The native DeviceActivity monitor still owns restrictions with Curfy
 * terminated. This is only a best-effort foreground repair.
 */
export function reconcileProtectionWindow(
  bedtime: string,
  wakeTime: string,
  mode: BlockModeId,
  now = new Date()
): void {
  if (getScreenTimeAccessStatus() !== "authorized") return;
  // Never manually shield apps unless iOS confirms a recurring monitor that
  // can release them at the user's chosen cutoff, even with Curfy closed.
  // A lost monitor after an OS update/restart must fail OPEN, not turn the
  // foreground recovery into an indefinite block.
  if (!DeviceActivity.getActivities().includes(BEDTIME_ACTIVITY_NAME)) {
    if (DeviceActivity.isShieldActive()) {
      DeviceActivity.resetBlocks("curfy-orphan-shield-without-recurring-monitor");
      if (DeviceActivity.isShieldActive()) {
        throw new Error(
          "Curfy's recurring iOS protection schedule is missing and the existing app shield could not be cleared. Check Screen Time permission and retry setup."
        );
      }
    }
    return;
  }
  const withinWindow = currentBedtimeWindow(now, bedtime, wakeTime) !== null;
  if (!withinWindow) {
    if (!DeviceActivity.isShieldActive()) return;
    DeviceActivity.resetBlocks("curfy-window-ended-foreground-recovery");
    if (DeviceActivity.isShieldActive()) {
      throw new Error("iOS still reports Curfy app restrictions after the window ended.");
    }
    return;
  }
  if (freeSelectionIssue(mode)) return;
  const state = readException();
  if (state && now.getTime() < state.expiresAt &&
      now.getTime() < state.bedtimeEndAt) {
    return; // Never cancel an active exception earned by the 120-second hold.
  }
  if (DeviceActivity.isShieldActive()) return;
  DeviceActivity.blockSelection(
    { activitySelectionId: selectionIdForMode(mode) },
    "curfy-window-start-foreground-recovery"
  );
  if (!DeviceActivity.isShieldActive()) {
    throw new Error("iOS didn't restore the selected app restriction. Please retry.");
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

  // An expired exception must not resurrect a shield when the daily iOS
  // monitor has disappeared: there would be no reliable end-of-window
  // callback to release the app while Curfy is closed.
  if (withinBedtime && !DeviceActivity.getActivities().includes(BEDTIME_ACTIVITY_NAME)) {
    if (DeviceActivity.isShieldActive()) {
      DeviceActivity.resetBlocks("curfy-orphan-exception-without-recurring-monitor");
      if (DeviceActivity.isShieldActive()) {
        throw new Error("iOS lost Curfy's recurring monitor and could not clear an orphaned app shield.");
      }
    }
    stopExceptionMonitor(state);
    DeviceActivity.userDefaultsRemove(EXCEPTION_STATE_KEY);
    return;
  }

  if (withinBedtime) {
    DeviceActivity.blockSelection(
      { activitySelectionId: state.selectionId }, "curfy-exception-foreground-recovery"
    );
    // Token intersection is not always available for a genuine native shield.
    // Require either verified selected-token overlap or the native shield.
    const overlap = selectedShieldCountOrNull(state.selectionId);
    if ((overlap ?? 0) === 0 && !DeviceActivity.isShieldActive()) {
      return; // neither native probe confirms re-shielding; retry later
    }
  } else {
    // This is AFTER the configured cutoff. Never re-shield a stale exception.
    DeviceActivity.unblockSelection(
      { activitySelectionId: state.selectionId }, "curfy-exception-bedtime-ended"
    );
    const overlap = selectedShieldCountOrNull(state.selectionId);
    // If token introspection is unavailable, require the native managed
    // shield to be absent before dropping our recovery record.
    if (overlap === null
      ? DeviceActivity.isShieldActive()
      : overlap > 0 || DeviceActivity.isShieldActive()) return;
  }
  stopExceptionMonitor(state);
  DeviceActivity.userDefaultsRemove(EXCEPTION_STATE_KEY);
}

/** Cancels an existing exception when a new bedtime/selection is saved. */
function cancelExceptionForScheduleChange(): void {
  // The caller must not abandon a malformed exception record: an unknown
  // activity name might still own the only native re-shield callback.
  const state = readException(true);
  if (!state) return;
  stopExceptionMonitor(state);
  DeviceActivity.userDefaultsRemove(EXCEPTION_STATE_KEY);
  if (DeviceActivity.userDefaultsGet<unknown>(EXCEPTION_STATE_KEY) != null) {
    throw new Error("iOS didn't confirm removal of the old Curfy app-access record. Retry protection setup.");
  }
}
