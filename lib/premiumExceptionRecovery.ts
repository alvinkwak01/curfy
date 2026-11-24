/**
 * Native foreground recovery for independent Premium per-app exceptions.
 * This does NOT grant access, launch an app, or trust JavaScript timers as
 * the only reblocking mechanism. It repairs delayed iOS DeviceActivity
 * callbacks when Curfy is reopened; the extension remains the closed-app
 * re-shield owner.
 */
import * as DeviceActivity from "react-native-device-activity";
import { normalizeActivitySelectionMetadata } from "@/lib/premiumPolicy";
import {
  PREMIUM_EXCEPTIONS_KEY,
  parsePremiumExceptionLedger,
  type PremiumExceptionEntry,
  type PremiumExceptionLedger,
} from "@/lib/premiumExceptionPolicy";

const SCHEDULED_SELECTION_ID_KEY = "curfy-scheduled-selection-id";
const CLOCK_WINDOW_KEY = "curfy-bedtime-clock-window";

function overlap(a: string, b: { currentBlocklist: true } | { activitySelectionId: string }): number {
  const result = DeviceActivity.intersection(
    { activitySelectionId: a }, b, { stripToken: true }
  );
  const counts = normalizeActivitySelectionMetadata(result);
  if (!counts || counts.categoryCount !== 0 || counts.webDomainCount !== 0) {
    throw new Error("iOS cannot confirm the protected app's native shield state.");
  }
  return counts.applicationCount;
}
function isSameOriginalWindow(now: Date, entry: PremiumExceptionEntry): boolean {
  if (now.getTime() >= entry.bedtimeEndAt ||
      DeviceActivity.userDefaultsGet<unknown>(SCHEDULED_SELECTION_ID_KEY) !==
        entry.committedSelectionId) return false;
  const clock = DeviceActivity.userDefaultsGet<{
    startMinute?: number; endMinute?: number;
  }>(CLOCK_WINDOW_KEY);
  if (!clock) return false;
  const { startMinute, endMinute } = clock;
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute) ||
      startMinute === undefined || endMinute === undefined ||
      startMinute < 0 || startMinute >= 1440 || endMinute < 0 ||
      endMinute >= 1440 || startMinute === endMinute) return false;
  const minute = now.getHours() * 60 + now.getMinutes();
  return startMinute < endMinute
    ? minute >= startMinute && minute < endMinute
    : minute >= startMinute || minute < endMinute;
}
function assertNativeSingleton(entry: PremiumExceptionEntry): boolean {
  const meta = normalizeActivitySelectionMetadata(
    DeviceActivity.activitySelectionMetadata({ activitySelectionId: entry.selectionId })
  );
  if (!meta || meta.applicationCount !== 1 ||
      meta.categoryCount !== 0 || meta.webDomainCount !== 0 ||
      meta.includeEntireCategory === true) {
    throw new Error("A saved Premium app exception no longer has one valid app token.");
  }
  // A changed committed list no longer owns this token. Do NOT re-shield a
  // stale, formerly protected app based on yesterday's exception.
  return overlap(entry.selectionId, {
    activitySelectionId: entry.committedSelectionId,
  }) === 1;
}
export function persistPremiumExceptionLedger(ledger: PremiumExceptionLedger): void {
  DeviceActivity.userDefaultsSet(PREMIUM_EXCEPTIONS_KEY, ledger);
  const readBack = parsePremiumExceptionLedger(
    DeviceActivity.userDefaultsGet(PREMIUM_EXCEPTIONS_KEY)
  );
  const keys = Object.keys(ledger).sort();
  if (JSON.stringify(Object.keys(readBack).sort()) !== JSON.stringify(keys) ||
      keys.some(key => Object.entries(ledger[key]).some(
        ([field, value]) =>
          readBack[key]?.[field as keyof PremiumExceptionEntry] !== value
      ))) {
    throw new Error("iOS could not confirm removal of a completed app exception.");
  }
}
export function closePremiumReblockMonitor(entry: PremiumExceptionEntry): void {
  const previousAction = [{
    type: "blockSelection" as const, familyActivitySelectionId: entry.selectionId,
  }];
  // Clearing actions first is vital: stopMonitoring may itself trigger
  // intervalDidEnd. If stop fails while a monitor survives, restore the
  // callback or the app could remain exposed after Curfy quits.
  let stopped = false;
  try {
    DeviceActivity.configureActions({
      activityName: entry.activityName, callbackName: "intervalDidEnd", actions: [],
    });
    if (DeviceActivity.getActivities().includes(entry.activityName)) {
      DeviceActivity.stopMonitoring([entry.activityName]);
    }
    stopped = !DeviceActivity.getActivities().includes(entry.activityName);
  } finally {
    if (!stopped) {
      DeviceActivity.configureActions({
        activityName: entry.activityName,
        callbackName: "intervalDidEnd", actions: previousAction,
      });
    }
  }
  if (!stopped) {
    throw new Error("iOS could not stop an expired app's re-shield monitor.");
  }
}

/**
 * Only removes an entry after a verified single-app re-shield (while the
 * SAME original protection window is active), or after the original cutoff
 * when re-shielding that OLD app would be incorrect.
 *
 * Never removes an unconfirmed entry. Never changes the Free exception key.
 * Repeated calls are idempotent for already-reconciled records.
 */
export function reconcilePremiumAppExceptions(now = new Date()): number {
  const raw = DeviceActivity.userDefaultsGet<unknown>(PREMIUM_EXCEPTIONS_KEY);
  if (raw == null) return 0; // Free tier: absolutely no change.
  const ledger = parsePremiumExceptionLedger(raw); // Reject corruption.
  if (Object.keys(ledger).length === 0) return 0;
  if (DeviceActivity.getAuthorizationStatus() !== DeviceActivity.AuthorizationStatus.approved) {
    return 0; // Permission revoked: do not alter or discard native recovery.
  }
  const ms = now.getTime();
  if (!Number.isFinite(ms)) throw new Error("Invalid native recovery clock.");
  let recovered = 0;
  // Oldest first; each successful recovery is persisted independently, so
  // a later failure leaves previously verified entries safely removed.
  for (const entry of Object.values(ledger).sort((a, b) => a.expiresAt - b.expiresAt)) {
    if (ms < entry.expiresAt) continue;
    const current = parsePremiumExceptionLedger(
      DeviceActivity.userDefaultsGet<unknown>(PREMIUM_EXCEPTIONS_KEY)
    );
    if (!current[entry.activityName]) continue;
    if (isSameOriginalWindow(now, entry)) {
      // A singleton re-shield without the daily monitor could outlive the
      // chosen cutoff. Preserve recovery state and never create that shield.
      if (!DeviceActivity.getActivities().includes("curfy-bedtime")) {
        throw new Error("Curfy's recurring protection monitor is missing. Restore protection in Settings before recovering app exceptions.");
      }
      const belongs = assertNativeSingleton(entry);
      if (!belongs) {
        throw new Error("A protected-app selection changed before recovery. Check Curfy Settings.");
      }
      const activeOthers = Object.values(current).filter(other =>
        other.activityName !== entry.activityName &&
        other.startedAt <= ms && ms < other.expiresAt && ms < other.bedtimeEndAt
      );
      for (const other of activeOthers) {
        if (overlap(other.selectionId, { currentBlocklist: true }) !== 0) {
          throw new Error("Another active app exception is not currently unshielded.");
        }
      }
      const before = overlap(entry.selectionId, { currentBlocklist: true });
      if (before !== 0 && before !== 1) {
        throw new Error("An expired exception contains more than one shielded app.");
      }
      const groupBefore = overlap(entry.committedSelectionId, { currentBlocklist: true });
      if (before === 0) {
        DeviceActivity.blockSelection(
          { activitySelectionId: entry.selectionId },
          "curfy-premium-expired-foreground-recovery"
        );
      }
      const after = overlap(entry.selectionId, { currentBlocklist: true });
      const groupAfter = overlap(entry.committedSelectionId, { currentBlocklist: true });
      if (after !== 1 || groupAfter !== groupBefore + (before === 0 ? 1 : 0)) {
        throw new Error("iOS did not confirm single-app re-shielding during recovery.");
      }
      for (const other of activeOthers) {
        if (overlap(other.selectionId, { currentBlocklist: true }) !== 0) {
          throw new Error("Recovery re-shielded another app's still-active exception.");
        }
      }
    }
    // If the old cutoff already passed or the scheduled selection changed,
    // do not apply stale protection to an app from yesterday.
    closePremiumReblockMonitor(entry);
    const next = { ...current };
    delete next[entry.activityName];
    persistPremiumExceptionLedger(next);
    recovered++;
  }
  return recovered;
}
