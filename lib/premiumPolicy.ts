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
  metadata: IndividualAppSelectionMetadata | null | undefined,
  entitlement: PremiumEntitlement
): SelectionPolicyIssue | null {
  if (!metadata) return "choose-one-app";
  const { applicationCount, categoryCount, webDomainCount, includeEntireCategory } = metadata;
  if (![applicationCount, categoryCount, webDomainCount].every(
    (count) => Number.isSafeInteger(count) && count >= 0
  )) return "categories-and-websites-not-supported";
  if (categoryCount !== 0 || webDomainCount !== 0 || includeEntireCategory === true) {
    return "categories-and-websites-not-supported";
  }
  if (applicationCount === 0) return "choose-one-app";
  if (applicationCount === 1) return null;
  if (entitlement === "owned") return null;
  return entitlement === "unknown" ? "purchase-status-unavailable" : "premium-required";
}
