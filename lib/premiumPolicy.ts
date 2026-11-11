/**
 * Curfy Premium's purchase is a single, restorable, non-consumable iOS IAP.
 * This is the proposed product identifier; App Store Connect creation and a
 * verified native StoreKit integration are still required before it can be sold.
 *
 * Never infer "owned" from AsyncStorage, a paywall tap, a user profile or a
 * purchase callback alone. Only a verified current Apple transaction may
 * produce "owned". Keep an existing native shield configuration intact while
 * entitlement status is unknown; do not revoke previously protected apps.
 */
export const CURFY_PREMIUM_PRODUCT_ID = "com.alvinkwak.curfy.premium";

export type PremiumEntitlement = "unknown" | "free" | "owned";

export type IndividualAppSelectionMetadata = {
  applicationCount: number;
  categoryCount: number;
  webDomainCount: number;
  includeEntireCategory?: boolean;
};

/**
 * The installed react-native-device-activity@0.6.1 exposes two DIFFERENT
 * website-count keys across its iOS bridge:
 *
 * - onSelectionChange event: "webDomainCount" (camelCase)
 * - activitySelectionMetadata()/intersection() Swift record: "webdomainCount"
 *
 * The package's TypeScript declaration incorrectly promises webDomainCount
 * for the latter. Rejecting a valid 1-app selection because this field reads
 * as undefined trapped onboarding on an actual iPhone. Normalize both native
 * shapes strictly: never quietly treat an absent/invalid count as zero.
 */
export type NativeActivitySelectionMetadata = {
  applicationCount?: number;
  categoryCount?: number;
  webDomainCount?: number;
  webdomainCount?: number;
  includeEntireCategory?: boolean;
};

export function normalizeActivitySelectionMetadata(
  raw: NativeActivitySelectionMetadata | null | undefined
): IndividualAppSelectionMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.webDomainCount !== undefined && raw.webdomainCount !== undefined &&
      raw.webDomainCount !== raw.webdomainCount) return null;

  const websiteCount = raw.webDomainCount ?? raw.webdomainCount;
  if (![raw.applicationCount, raw.categoryCount, websiteCount].every(
    count => Number.isSafeInteger(count) && (count as number) >= 0
  )) return null;
  if (raw.includeEntireCategory !== undefined &&
      typeof raw.includeEntireCategory !== "boolean") return null;

  return {
    applicationCount: raw.applicationCount!,
    categoryCount: raw.categoryCount!,
    webDomainCount: websiteCount!,
    includeEntireCategory: raw.includeEntireCategory,
  };
}

export type SelectionPolicyIssue =
  | "choose-one-app"
  | "categories-and-websites-not-supported"
  | "premium-required"
  | "purchase-status-unavailable";

/**
 * The paid tier adds individually selected APPLICATIONS, not categories or
 * websites. Native iOS may auto-promote picker selections into category tokens;
 * such a selection must be rejected rather than treated as N individual apps.
 *
 * This is a pure policy helper, not proof of entitlement or native support.
 * It can approve a multi-app *draft* only after StoreKit verification and the
 * per-app native escape implementation are in place.
 */
export function selectionIssueForEntitlement(
  metadata: NativeActivitySelectionMetadata | null | undefined,
  entitlement: PremiumEntitlement
): SelectionPolicyIssue | null {
  if (!metadata) return "choose-one-app";
  const normalized = normalizeActivitySelectionMetadata(metadata);
  if (!normalized) return "categories-and-websites-not-supported";
  const { applicationCount, categoryCount, webDomainCount, includeEntireCategory } = normalized;
  if (categoryCount !== 0 || webDomainCount !== 0 || includeEntireCategory === true) {
    return "categories-and-websites-not-supported";
  }
  if (applicationCount === 0) return "choose-one-app";
  if (applicationCount === 1) return null;
  if (entitlement === "owned") return null;
  return entitlement === "unknown" ? "purchase-status-unavailable" : "premium-required";
}
