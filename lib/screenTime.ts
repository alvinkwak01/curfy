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

// Schedules the actual block: apps in `mode`'s selection lock at `bedtime`
// and unlock at `wakeTime`, every night, enforced by iOS itself via a
// separate system process — this keeps running even if Curfy is killed,
// which is the entire point (see CONTEXT.md §6c on why the old in-app lock
// didn't do this). Also points the native shield's button at "openApp", so
// tapping a blocked app during the window opens Curfy — which is what lets
// the existing HoldButton/LockScreen screen double as the escape hatch
// (Curfy's own bedtime-window check already shows that screen on open;
// nothing about that logic needed to change for this to work).
export async function configureBedtimeBlocking({
  bedtime,
  wakeTime,
  mode,
}: {
  bedtime: string;
  wakeTime: string;
  mode: BlockModeId;
}): Promise<void> {
  const selectionId = selectionIdForMode(mode);

  await DeviceActivity.startMonitoring(
    BEDTIME_ACTIVITY_NAME,
    {
      intervalStart: timeToDateComponents(bedtime),
      intervalEnd: timeToDateComponents(wakeTime),
      repeats: true,
    },
    []
  );

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

  DeviceActivity.updateShield(
    {
      title: "Blocked by Curfy",
      subtitle: "It's past your bedtime.",
      primaryButtonLabel: "Open Curfy",
    },
    {
      primary: {
        behavior: "close",
        actions: [{ type: "openApp" }],
      },
    }
  );
}

export function stopBedtimeBlocking(): void {
  DeviceActivity.stopMonitoring([BEDTIME_ACTIVITY_NAME]);
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
