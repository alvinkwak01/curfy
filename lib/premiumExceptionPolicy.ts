/**
 * Pure, fail-closed contract for future independent, per-application
 * DeviceActivity exception monitors. NO code here unshields apps or starts
 * monitors. The existing one-app Free exception remains untouched.
 */
export const PREMIUM_EXCEPTIONS_KEY = "curfy-premium-active-exceptions";
export const PREMIUM_EXCEPTION_ACTIVITY_PREFIX = "curfy-premium-exception-";
const APP_TICKET_PATTERN =
  /^curfy-single-app-([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i;
const MAX_EXCEPTION_DURATION_MS = 15 * 60_000;
const NATIVE_MONITOR_SLACK_MS = 1_000;

export type PremiumExceptionEntry = {
  activityName: string;
  selectionId: string; // ephemeral, opaque singleton native selection ID
  committedSelectionId: string; // e.g. curfy-block-custom
  expiresAt: number;
  bedtimeEndAt: number;
  startedAt: number;
};
export type PremiumExceptionLedger = Record<string, PremiumExceptionEntry>;

function validTime(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0;
}
function activityForTicket(ticketId: string): string | null {
  const match = APP_TICKET_PATTERN.exec(ticketId);
  return match ? PREMIUM_EXCEPTION_ACTIVITY_PREFIX + match[1].toLowerCase() : null;
}
function validEntry(value: unknown, activityName: string): value is PremiumExceptionEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Partial<PremiumExceptionEntry>;
  const expectedActivity = typeof v.selectionId === "string"
    ? activityForTicket(v.selectionId) : null;
  return expectedActivity === activityName && v.activityName === activityName &&
    typeof v.committedSelectionId === "string" &&
    /^curfy-block-(social|most|custom)$/.test(v.committedSelectionId) &&
    validTime(v.expiresAt) && validTime(v.bedtimeEndAt) && validTime(v.startedAt) &&
    v.startedAt < v.expiresAt && v.expiresAt <= v.bedtimeEndAt &&
    v.expiresAt - v.startedAt <= MAX_EXCEPTION_DURATION_MS;
}

/** Malformed shared state is an error, never silently treated as an empty ledger. */
export function parsePremiumExceptionLedger(raw: unknown): PremiumExceptionLedger {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Curfy's per-app exception records could not be read.");
  }
  const input = raw as Record<string, unknown>;
  const entries = Object.entries(input);
  if (entries.length > 50) throw new Error("Curfy's per-app exception limit was exceeded.");
  const result: PremiumExceptionLedger = {};
  for (const [activityName, item] of entries) {
    if (!validEntry(item, activityName)) {
      throw new Error("Curfy's per-app exception records are invalid. Check protection in Settings.");
    }
    result[activityName] = item;
  }
  return result;
}

/** A record may re-shield ONLY on its own expiry, within its original window. */
export function premiumReblockIsDue(
  rawLedger: unknown, activityName: string, nowMs: number, withinWindow: boolean
): boolean {
  if (!validTime(nowMs) || !withinWindow) return false;
  const ledger = parsePremiumExceptionLedger(rawLedger);
  const entry = ledger[activityName];
  return !!entry && entry.expiresAt <= nowMs && nowMs < entry.bedtimeEndAt;
}

export function activePremiumExceptions(rawLedger: unknown, nowMs: number): PremiumExceptionEntry[] {
  if (!validTime(nowMs)) return [];
  const ledger = parsePremiumExceptionLedger(rawLedger);
  return Object.values(ledger).filter(entry =>
    entry.startedAt <= nowMs && nowMs < entry.expiresAt && nowMs < entry.bedtimeEndAt
  );
}

/**
 * Plan a *future* monitor with a unique activity per prepared native token.
 * Apple rejects monitoring intervals shorter than fifteen minutes. If the
 * scheduled cutoff comes sooner, the recurring protection cutoff owns release.
 * Scheduling and actual unshielding MUST happen in a separate native-proof step.
 */
export function planPremiumAppException({
  ticketId, committedSelectionId, bedtimeEndAt, nowMs, currentLedger,
}: {
  ticketId: string;
  committedSelectionId: string;
  bedtimeEndAt: number;
  nowMs: number;
  currentLedger: unknown;
}): PremiumExceptionEntry & { needsMonitor: boolean; monitorEndAt: number } {
  const activityName = activityForTicket(ticketId);
  if (!activityName || !/^curfy-block-(social|most|custom)$/.test(committedSelectionId)) {
    throw new Error("Choose a valid protected app before holding to unlock.");
  }
  if (!validTime(nowMs) || !validTime(bedtimeEndAt) || nowMs >= bedtimeEndAt) {
    throw new Error("The protection window has already ended.");
  }
  const ledger = parsePremiumExceptionLedger(currentLedger);
  if (Object.values(ledger).some(item => item.selectionId === ticketId)) {
    throw new Error("This app already has an exception. Choose another protected app.");
  }
  // A stale monitor must be reconciled before installing another. Otherwise
  // replacing the dictionary entry could strand an unshielded old token.
  if (Object.values(ledger).some(item => item.expiresAt <= nowMs)) {
    throw new Error("An expired exception needs native recovery before another unlock.");
  }
  if (Object.keys(ledger).length >= 50) {
    throw new Error("Too many app exceptions are scheduled.");
  }
  // Distinguish logical entitlement expiry from DeviceActivity's
  // minimum 15-minute native monitoring window and second precision.
  // The native callback may arrive slightly later; this record never grants
  // more than 15m of *planned* access or extends past the chosen cutoff.
  const roundedStart = Math.floor(nowMs / 1000) * 1000;
  const nativeEnd = roundedStart + MAX_EXCEPTION_DURATION_MS + NATIVE_MONITOR_SLACK_MS;
  const logicalExpiry = Math.min(nowMs + MAX_EXCEPTION_DURATION_MS, bedtimeEndAt);
  const needsMonitor = nativeEnd < bedtimeEndAt;
  return {
    activityName,
    selectionId: ticketId,
    committedSelectionId,
    startedAt: nowMs,
    expiresAt: logicalExpiry,
    bedtimeEndAt,
    needsMonitor,
    // Transient scheduling value: intentionally NOT persisted in the shared
    // recovery ledger. Native Swift compares logical expiresAt only.
    monitorEndAt: nativeEnd,
  };
}
