/**
 * Dormant Premium per-app exception coordinator. Intentionally NOT mounted
 * in the escape route and NOT reachable from checkout until native iPhone
 * evidence proves exact one-app reblock and permission/cutoff behavior.
 *
 * Caller must gate this behind a completed uninterrupted 120-second HoldButton.
 * No app identity or Screen Time token crosses this React Native boundary.
 */
import * as DeviceActivity from "react-native-device-activity";
import { validateProtectedAppChoice } from "@/modules/curfy-protected-apps";
import { reconcilePremiumAppExceptions } from "@/lib/premiumExceptionRecovery";
import { refreshPremiumEntitlement } from "@/lib/premiumStore";
import { normalizeActivitySelectionMetadata, selectionIssueForEntitlement } from "@/lib/premiumPolicy";
import { currentBedtimeWindow, nativeDateComponents } from "@/lib/bedtimeWindow";
import { getScreenTimeAccessStatus, type BlockModeId, selectionIdForMode } from "@/lib/screenTime";
import {
  parsePremiumExceptionLedger, planPremiumAppException,
  PREMIUM_EXCEPTIONS_KEY, type PremiumExceptionEntry, type PremiumExceptionLedger,
} from "@/lib/premiumExceptionPolicy";

let grantInProgress = false;

function readLedger(): PremiumExceptionLedger {
  return parsePremiumExceptionLedger(
    DeviceActivity.userDefaultsGet<unknown>(PREMIUM_EXCEPTIONS_KEY)
  );
}
function persistLedger(value: PremiumExceptionLedger): void {
  DeviceActivity.userDefaultsSet(PREMIUM_EXCEPTIONS_KEY, value);
  const stored = readLedger();
  const expected = Object.keys(value).sort();
  if (JSON.stringify(Object.keys(stored).sort()) !== JSON.stringify(expected) ||
      expected.some(key => Object.entries(value[key]).some(
        ([field, fieldValue]) => stored[key]?.[field as keyof PremiumExceptionEntry] !== fieldValue
      ))) {
    throw new Error("iOS did not save the Premium exception recovery record.");
  }
}
function exactOverlap(a: string, b: { activitySelectionId: string } | { currentBlocklist: true }): number {
  const value = DeviceActivity.intersection(
    { activitySelectionId: a }, b, { stripToken: true }
  );
  const counts = normalizeActivitySelectionMetadata(value);
  if (!counts || counts.categoryCount !== 0 || counts.webDomainCount !== 0) {
    throw new Error("iOS cannot verify the exact app shields. No unlock was granted.");
  }
  return counts.applicationCount;
}
function nativeOneAppSelection(ticketId: string): void {
  // Native validates the ticket is still the same single app within the
  // saved selection. Never assume the JS identifier proves membership.
  if (validateProtectedAppChoice(ticketId) !== true) {
    throw new Error("Choose the protected app again before unlocking.");
  }
  const metadata = normalizeActivitySelectionMetadata(
    DeviceActivity.activitySelectionMetadata({ activitySelectionId: ticketId })
  );
  if (!metadata || metadata.applicationCount !== 1 ||
      metadata.categoryCount !== 0 || metadata.webDomainCount !== 0 ||
      metadata.includeEntireCategory === true) {
    throw new Error("iOS could not verify a single selected app.");
  }
}
function clearEndAction(activityName: string): void {
  DeviceActivity.configureActions({
    activityName, callbackName: "intervalDidEnd", actions: [],
  });
}

/**
 * Internal-only post-hold function. Assumes a genuinely completed 120-second
 * gesture; never bind this to a simple press, shield button or payment action.
 * The returned timestamp is a planned native cutoff, NOT proof of
 * instantaneous callback delivery while the phone is idle.
 */
export async function grantPremiumAppException({
  bedtime, wakeTime, mode, ticketId, now = new Date(),
}: {
  bedtime: string;
  wakeTime: string;
  mode: BlockModeId;
  ticketId: string;
  now?: Date;
}): Promise<number> {
  if (grantInProgress) throw new Error("Another Curfy app unlock is already being prepared.");
  grantInProgress = true;
  try {
    if (getScreenTimeAccessStatus() !== "authorized") {
      throw new Error("Screen Time access is required for an app exception.");
    }
    const window = currentBedtimeWindow(now, bedtime, wakeTime);
    if (!window) throw new Error("No protected-app window is active.");
    // StoreKit owns this decision. AsyncStorage, subscription/profile flags,
    // and a successful purchase callback cannot authorize multi-app access.
    if (await refreshPremiumEntitlement() !== "owned") {
      throw new Error("Curfy Premium ownership has not been verified by Apple.");
    }
    const committedId = selectionIdForMode(mode);
    const selected = DeviceActivity.activitySelectionMetadata({ activitySelectionId: committedId });
    if (selectionIssueForEntitlement(selected, "owned") !== null ||
        !selected || selected.applicationCount < 2) {
      throw new Error("Premium requires two or more explicitly selected apps.");
    }
    // A legacy free-tier exception unshields the WHOLE selected group.
    // Never mix that behavior with isolated Premium exceptions.
    const old = DeviceActivity.userDefaultsGet<{ expiresAt: number }>("curfy-active-exception");
    if (old && typeof old.expiresAt === "number" && old.expiresAt > now.getTime()) {
      throw new Error("Finish the existing app exception before choosing another app.");
    }
    nativeOneAppSelection(ticketId);
    // Expired records are reconciled before planning a new native monitor;
    // only their own singleton may be re-shielded, never still-active apps.
    // If iOS cannot confirm recovery, refuse the next unlock.
    reconcilePremiumAppExceptions(now);
    const existing = readLedger();
    for (const entry of Object.values(existing)) {
      if (exactOverlap(ticketId, { activitySelectionId: entry.selectionId }) > 0) {
        throw new Error("That app is already temporarily unlocked.");
      }
    }
    const targetBefore = exactOverlap(ticketId, { currentBlocklist: true });
    const groupBefore = exactOverlap(committedId, { currentBlocklist: true });
    if (targetBefore !== 1 || groupBefore < 1) {
      throw new Error("The selected app must be actively protected before a hold can unlock it.");
    }
    const planned = planPremiumAppException({
      ticketId, committedSelectionId: committedId,
      bedtimeEndAt: window.end.getTime(), nowMs: now.getTime(),
      currentLedger: existing,
    });
    const { needsMonitor, ...entry } = planned;
    const ledger = { ...existing, [entry.activityName]: entry };
    let persisted = false;
    let monitorRequested = false;
    let unshieldAttempted = false;
    try {
      // The extension needs these exact records BEFORE a monitor can fire,
      // and a native reblock action MUST be registered before unshielding.
      persistLedger(ledger);
      persisted = true;
      if (needsMonitor) {
        DeviceActivity.configureActions({
          activityName: entry.activityName,
          callbackName: "intervalDidEnd",
          actions: [{ type: "blockSelection", familyActivitySelectionId: ticketId }],
        });
        monitorRequested = true; // startMonitoring may install then throw.
        // Same minimum-15-minute+1s convention as Curfy's existing Free hold.
        const roundedStart = new Date(Math.floor(now.getTime() / 1000) * 1000);
        const endDate = new Date(entry.expiresAt);
        await DeviceActivity.startMonitoring(entry.activityName, {
          intervalStart: nativeDateComponents(roundedStart),
          intervalEnd: nativeDateComponents(endDate), repeats: false,
        }, []);
        if (!DeviceActivity.getActivities().includes(entry.activityName)) {
          throw new Error("iOS did not register this app's automatic re-shield.");
        }
      }
      // A changed committed picker selection must never turn a stored row
      // into a different app while the Xcode monitor is being installed.
      nativeOneAppSelection(ticketId);
      if (exactOverlap(ticketId, { currentBlocklist: true }) !== 1 ||
          exactOverlap(committedId, { currentBlocklist: true }) !== groupBefore) {
        throw new Error("The protected selection changed during the unlock.");
      }
      unshieldAttempted = true;
      DeviceActivity.unblockSelection(
        { activitySelectionId: ticketId }, "curfy-premium-120-second-hold"
      );
      const targetAfter = exactOverlap(ticketId, { currentBlocklist: true });
      const groupAfter = exactOverlap(committedId, { currentBlocklist: true });
      if (targetAfter !== 0 || groupAfter !== groupBefore - 1) {
        throw new Error("iOS did not release exactly the chosen app.");
      }
      return entry.expiresAt;
    } catch (failure) {
      // The pinned third-party module can swallow native blocking errors.
      // Always try to re-shield the exact singleton and VERIFY the result.
      let reblocked = !unshieldAttempted;
      if (unshieldAttempted) {
        try {
          DeviceActivity.blockSelection(
            { activitySelectionId: ticketId }, "curfy-premium-exception-rollback"
          );
          // Native APIs sometimes swallow errors or unshield more than the
          // requested token. Confirm all originally blocked *other* apps
          // are shielded again before claiming rollback recovered.
          reblocked = exactOverlap(ticketId, { currentBlocklist: true }) === 1 &&
            exactOverlap(committedId, { currentBlocklist: true }) === groupBefore;
        } catch { reblocked = false; }
      }
      let stopped = !monitorRequested;
      if (monitorRequested && reblocked) {
        try {
          // stopMonitoring may call intervalDidEnd; the extension's expiry
          // guard ensures an early stop cannot re-shield another app.
          clearEndAction(entry.activityName);
          DeviceActivity.stopMonitoring([entry.activityName]);
          stopped = !DeviceActivity.getActivities().includes(entry.activityName);
          if (!stopped) {
            // Reinstall callback action on a still-live monitor so it can
            // restore this single app at expiry, even if Curfy is killed.
            DeviceActivity.configureActions({
              activityName: entry.activityName,
              callbackName: "intervalDidEnd",
              actions: [{ type: "blockSelection", familyActivitySelectionId: ticketId }],
            });
          }
        } catch { stopped = false; }
      }
      // Keep the native ledger and reblock callback if rollback cannot be
      // verified. Never erase the only record for an potentially unshielded app.
      if (persisted && reblocked && stopped) {
        try { persistLedger(existing); } catch {
          throw new Error("Curfy could not confirm removal of failed exception records. Check Screen Time protection.");
        }
      }
      if (!reblocked || !stopped) {
        throw new Error("Curfy could not confirm recovery of the selected app restriction. Open Curfy Settings and check protection.");
      }
      throw failure;
    }
  } finally {
    grantInProgress = false;
  }
}

/** Read-only query for future Premium Home status; never relies on JS timers. */
export function getPremiumExceptions(): PremiumExceptionEntry[] {
  return Object.values(readLedger());
}
