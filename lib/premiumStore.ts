import { curfyStoreKit } from "@/modules/curfy-storekit";
import { CURFY_PREMIUM_PRODUCT_ID, PremiumEntitlement } from "@/lib/premiumPolicy";

export type PremiumProduct = {
  productId: string;
  displayName: string;
  displayPrice: string; // StoreKit's localized storefront price, never a hard-coded USD amount.
};
export type PremiumPurchaseOutcome = "owned" | "pending" | "cancelled";

function verifyEntitlementResult(result: string): "owned" | "free" {
  if (result !== "owned" && result !== "free") {
    throw new Error("The App Store returned an unrecognized entitlement status.");
  }
  return result;
}

/** Every read comes from StoreKit 2's verified current entitlements. */
export async function refreshPremiumEntitlement(): Promise<"owned" | "free"> {
  return verifyEntitlementResult(
    await curfyStoreKit().getEntitlement(CURFY_PREMIUM_PRODUCT_ID)
  );
}

/** Failure is UNKNOWN, not a free downgrade or a reason to rewrite native shields. */
export async function loadPremiumEntitlement(): Promise<PremiumEntitlement> {
  try {
    return await refreshPremiumEntitlement();
  } catch (error) {
    console.warn("[Curfy] StoreKit entitlement unavailable", error);
    return "unknown";
  }
}

export async function fetchPremiumProduct(): Promise<PremiumProduct> {
  const product = await curfyStoreKit().getProduct(CURFY_PREMIUM_PRODUCT_ID);
  if (!product || product.available !== true ||
      product.productId !== CURFY_PREMIUM_PRODUCT_ID ||
      !product.displayName?.trim() || !product.displayPrice?.trim()) {
    throw new Error("Curfy Premium pricing is not available from the App Store.");
  }
  return {
    productId: product.productId,
    displayName: product.displayName,
    displayPrice: product.displayPrice,
  };
}

/**
 * Internal purchase plumbing only. Do NOT expose a Buy button until actual
 * multi-app shielding and per-app exceptions both pass release checks.
 * Purchase dispatch or a "purchased" message does NOT grant ownership.
 */
export async function purchasePremium(): Promise<PremiumPurchaseOutcome> {
  const outcome = await curfyStoreKit().purchase(CURFY_PREMIUM_PRODUCT_ID);
  if (outcome === "cancelled" || outcome === "pending") return outcome;
  if (outcome !== "purchased") {
    throw new Error("The App Store returned an unrecognized purchase result.");
  }
  if (await refreshPremiumEntitlement() !== "owned") {
    throw new Error("The App Store has not confirmed Curfy Premium ownership yet.");
  }
  return "owned";
}

/** StoreKit.sync is not itself proof of ownership; always re-read entitlements. */
export async function restorePremium(): Promise<"owned" | "free"> {
  const nativeResult = await curfyStoreKit().restore(CURFY_PREMIUM_PRODUCT_ID);
  verifyEntitlementResult(nativeResult);
  return refreshPremiumEntitlement();
}
