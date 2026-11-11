/** Shared lifecycle for Premium's individual app monitors. No purchase or UI. */
import * as DeviceActivity from "react-native-device-activity";
import { currentBedtimeWindow, nativeDateComponents } from "@/lib/bedtimeWindow";
import { normalizeActivitySelectionMetadata } from "@/lib/premiumPolicy";
import {
  parsePremiumExceptionLedger, PREMIUM_EXCEPTIONS_KEY,
  type PremiumExceptionLedger, type PremiumExceptionEntry,
} from "@/lib/premiumExceptionPolicy";
import { closePremiumReblockMonitor, persistPremiumExceptionLedger } from "@/lib/premiumExceptionRecovery";

export function readPremiumLedger(): PremiumExceptionLedger {
  return parsePremiumExceptionLedger(DeviceActivity.userDefaultsGet(PREMIUM_EXCEPTIONS_KEY));
}
function overlap(id: string, other: { currentBlocklist: true } | { activitySelectionId: string }): number {
  const counts = normalizeActivitySelectionMetadata(DeviceActivity.intersection(
    { activitySelectionId: id }, other, { stripToken: true }
  ));
  if (!counts || counts.categoryCount || counts.webDomainCount) {
    throw new Error("iOS couldn't verify individual app protection.");
  }
  return counts.applicationCount;
}
function withinSavedWindow(now: Date): boolean {
  const clock = DeviceActivity.userDefaultsGet<{ startMinute: number; endMinute: number }>("curfy-bedtime-clock-window");
  if (!clock) return false;
  const asTime = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  if (![clock.startMinute, clock.endMinute].every(n => Number.isInteger(n) && n >= 0 && n < 1440)) {
    throw new Error("Curfy's saved protection hours are invalid.");
  }
  return !!currentBedtimeWindow(now, asTime(clock.startMinute), asTime(clock.endMinute));
}
function assertSingleton(entry: PremiumExceptionEntry): void {
  const counts = normalizeActivitySelectionMetadata(DeviceActivity.activitySelectionMetadata({ activitySelectionId: entry.selectionId }));
  if (!counts || counts.applicationCount !== 1 || counts.categoryCount || counts.webDomainCount || counts.includeEntireCategory ||
      overlap(entry.selectionId, { activitySelectionId: entry.committedSelectionId }) !== 1) {
    throw new Error("A saved app exception no longer belongs to the protected selection.");
  }
}

/** Call before removing daily cutoff. Re-shield first; a refused stop preserves recovery. */
export function stopPremiumExceptionsBeforeDaily(now = new Date()): void {
  const ledger = readPremiumLedger();
  const daily = DeviceActivity.getActivities().includes("curfy-bedtime");
  for (const entry of Object.values(ledger)) {
    if (daily && withinSavedWindow(now) && now.getTime() < entry.bedtimeEndAt) {
      if (DeviceActivity.userDefaultsGet("curfy-scheduled-selection-id") !== entry.committedSelectionId) {
        throw new Error("The saved app exception and daily protection do not match.");
      }
      assertSingleton(entry);
      DeviceActivity.blockSelection({ activitySelectionId: entry.selectionId }, "curfy-stop-premium-before-daily");
      if (overlap(entry.selectionId, { currentBlocklist: true }) !== 1) {
        throw new Error("iOS couldn't restore an app's shield before stopping its exception.");
      }
    }
    closePremiumReblockMonitor(entry);
    delete ledger[entry.activityName];
    persistPremiumExceptionLedger(ledger);
  }
  assertNoPremiumMonitors();
}

function assertNoPremiumMonitors(): void {
  if (DeviceActivity.getActivities().some(name => name.startsWith("curfy-premium-exception-"))) {
    throw new Error("An unrecognized Curfy app exception monitor still exists. Keep the daily schedule and retry recovery.");
  }
}

/** New restrictions already applied; retire old monitors before committing the edit. */
export function cancelPremiumExceptionsAfterScheduleChange(): void {
  const ledger = readPremiumLedger();
  for (const entry of Object.values(ledger)) {
    closePremiumReblockMonitor(entry);
    delete ledger[entry.activityName];
    persistPremiumExceptionLedger(ledger);
  }
  assertNoPremiumMonitors();
}

/** Rollback uses ORIGINAL deadlines, never a new 15-minute allowance. */
export async function restorePremiumExceptions(
  snapshot: PremiumExceptionLedger, now = new Date()
): Promise<void> {
  if (!Object.keys(snapshot).length) return;
  // Restore ledger before installing a monitor that can immediately call the extension.
  persistPremiumExceptionLedger(snapshot);
  const validWindow = DeviceActivity.getActivities().includes("curfy-bedtime") && withinSavedWindow(now);
  for (const entry of Object.values(snapshot)) {
    if (!validWindow || now.getTime() >= entry.expiresAt || now.getTime() >= entry.bedtimeEndAt) continue;
    if (DeviceActivity.userDefaultsGet("curfy-scheduled-selection-id") !== entry.committedSelectionId) {
      throw new Error("Couldn't restore the original app-exception selection.");
    }
    assertSingleton(entry);
    const start = Math.floor(entry.startedAt / 1000) * 1000;
    const monitorEnd = start + 901_000;
    if (monitorEnd < entry.bedtimeEndAt) {
      DeviceActivity.configureActions({ activityName: entry.activityName, callbackName: "intervalDidEnd",
        actions: [{ type: "blockSelection", familyActivitySelectionId: entry.selectionId }] });
      await DeviceActivity.startMonitoring(entry.activityName, {
        intervalStart: nativeDateComponents(new Date(start)),
        intervalEnd: nativeDateComponents(new Date(monitorEnd)), repeats: false,
      }, []);
      if (!DeviceActivity.getActivities().includes(entry.activityName)) {
        throw new Error("iOS couldn't restore the original app reblock monitor.");
      }
    }
    DeviceActivity.unblockSelection({ activitySelectionId: entry.selectionId }, "curfy-restore-earned-premium-exception");
    if (overlap(entry.selectionId, { currentBlocklist: true }) !== 0) {
      throw new Error("iOS couldn't restore the original app exception.");
    }
  }
}

/** Repair missing individual shields without interrupting other earned exceptions. */
export function reconcilePremiumProtectedSelection(selectionId: string, now = new Date()): void {
  const metadata = normalizeActivitySelectionMetadata(DeviceActivity.activitySelectionMetadata({ activitySelectionId: selectionId }));
  if (!metadata || metadata.applicationCount < 2 || metadata.categoryCount || metadata.webDomainCount || metadata.includeEntireCategory) return;
  const active = Object.values(readPremiumLedger()).filter(entry =>
    entry.committedSelectionId === selectionId && entry.startedAt <= now.getTime() &&
    now.getTime() < entry.expiresAt && now.getTime() < entry.bedtimeEndAt
  );
  for (const [index, entry] of active.entries()) {
    assertSingleton(entry);
    const needsMonitor = Math.floor(entry.startedAt / 1000) * 1000 + 901_000 < entry.bedtimeEndAt;
    if (needsMonitor && !DeviceActivity.getActivities().includes(entry.activityName)) {
      DeviceActivity.blockSelection({ activitySelectionId: entry.selectionId }, "curfy-missing-premium-reblock-monitor");
      throw new Error("An app's reblock monitor is missing. Its exception needs recovery in Curfy Settings.");
    }
    if (active.slice(0, index).some(other => overlap(entry.selectionId, { activitySelectionId: other.selectionId }) !== 0)) {
      throw new Error("Two saved app exceptions refer to the same application.");
    }
  }
  // Compute a private native selection difference: blocking the whole group
  // first would briefly cancel every still-valid exception on each resume.
  const recoveryId = "curfy-premium-recovery-selection";
  let desiredId = selectionId;
  let expected = metadata.applicationCount;
  for (const entry of active) {
    const difference = normalizeActivitySelectionMetadata(DeviceActivity.difference(
      { activitySelectionId: desiredId }, { activitySelectionId: entry.selectionId },
      { stripToken: true, persistAsActivitySelectionId: recoveryId }
    ));
    expected--;
    if (!difference || difference.applicationCount !== expected || difference.categoryCount || difference.webDomainCount) {
      throw new Error("iOS couldn't isolate apps that still need protection.");
    }
    desiredId = recoveryId;
  }
  for (const entry of active) {
    if (overlap(entry.selectionId, { activitySelectionId: desiredId }) !== 0) {
      throw new Error("An active app exception is still present in the re-shield selection.");
    }
  }
  if (expected > 0) DeviceActivity.blockSelection({ activitySelectionId: desiredId }, "curfy-premium-window-recovery");
  for (const entry of active) {
    DeviceActivity.unblockSelection({ activitySelectionId: entry.selectionId }, "curfy-preserve-active-premium-exception");
    if (overlap(entry.selectionId, { currentBlocklist: true }) !== 0) {
      throw new Error("iOS couldn't preserve an active app exception.");
    }
  }
  if (overlap(selectionId, { currentBlocklist: true }) !== metadata.applicationCount - active.length) {
    throw new Error("iOS couldn't confirm protection for each selected app.");
  }
}

/** A single Premium hold must never authorize changing ALL other protected apps. */
export function allPremiumAppsHaveActiveExceptions(selectionId: string, now = Date.now()): boolean {
  const counts = normalizeActivitySelectionMetadata(DeviceActivity.activitySelectionMetadata({ activitySelectionId: selectionId }));
  if (!counts || counts.applicationCount < 2 || counts.categoryCount || counts.webDomainCount || counts.includeEntireCategory) return false;
  const active = Object.values(readPremiumLedger()).filter(entry => entry.committedSelectionId === selectionId &&
    entry.startedAt <= now && now < entry.expiresAt && now < entry.bedtimeEndAt);
  if (active.length !== counts.applicationCount) return false;
  for (const [index, entry] of active.entries()) {
    assertSingleton(entry);
    if (active.slice(0,index).some(other => overlap(entry.selectionId, { activitySelectionId: other.selectionId }) !== 0)) return false;
  }
  return overlap(selectionId, { currentBlocklist: true }) === 0;
}

/** Read only; prepared tickets are opaque and private to the native app group. */
export function premiumAccessExpiresAt(ticketId: string, now = Date.now()): number | null {
  const active = Object.values(readPremiumLedger()).filter(entry => entry.startedAt <= now && now < entry.expiresAt && now < entry.bedtimeEndAt);
  const found = active.find(entry => overlap(ticketId, { activitySelectionId: entry.selectionId }) === 1);
  return found && overlap(ticketId, { currentBlocklist: true }) === 0 ? found.expiresAt : null;
}
