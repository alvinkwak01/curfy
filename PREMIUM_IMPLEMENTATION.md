# Curfy Premium — one-time iOS purchase and per-app exception

Decision date: 2026-11-02. This supersedes the earlier pending-subscription/price discussion. No App Store product or live checkout is implied by this document.

## Confirmed commercial and product rules
- **Free:** always protect exactly one explicitly selected application.
- **Premium:** protect multiple explicitly selected applications. No whole categories or websites at launch.
- **Purchase:** **$5.99 USD once**, using one Apple **non-consumable** in-app purchase. **No subscription, trial, recurring charge, or account prerequisite**. App Store storefront localization/taxes must use Apple's returned product price; do not hard-code USD in a live purchase button.
- Proposed StoreKit product identifier: `com.alvinkwak.curfy.premium` (not created in App Store Connect yet).
- Restore purchases and cross-device entitlement must follow the user's Apple Account, not Curfy's optional Supabase profile.
- **Unlock:** choose exactly one protected application and complete the usual uninterrupted **120-second hold** for up to **15 minutes** of access. All other protected apps remain shielded. Exit/back to Curfy Home must never unlock anything. No 120-second shortcut for paying users.
- **Free flow:** skip app choice when only one app is protected. **Premium flow:** Home's Unlock an app action first presents only the user's protected apps with minimal private Apple labels; a specific choice precedes the hold. Do not claim third-party launch/deep-link support.

## Safety and implementation requirements
1. `StoreKit 2` native transaction verification is authoritative for non-consumable ownership. Do not trust a boolean from AsyncStorage, a client-side paywall tap, a Supabase profile, or an unverified callback. Refunds/revocations remove new premium editing rights. When Apple cannot establish status, retain the current protected schedule and retry; never silently clear a shield or delete extra saved selections.
2. The core OS shield scheduling, entitlement, purchase/restore, and per-app exception features must work in one cohesive signed iOS build. A mock test does not prove native correctness.
3. Native per-app unlocking requires a **token-level subset** of the currently protected application selection. Apple obfuscates app identity; use supported SwiftUI `Label(ApplicationToken)`-style displays, not invented app names or private token decoding. Verify the chosen token belongs to the protected selection before calling any unshield action. Validate re-shield for that same token with Curfy terminated, with independent exceptions and the main window's cutoff. If a safe subset cannot be demonstrated, keep Premium multi-app purchase disabled and escalate the product/implementation blocker.
4. The third-party `react-native-device-activity@0.6.1` picker has a documented iOS issue where choosing multiple apps can be auto-promoted into a category token. Reject category tokens rather than representing them as explicit apps. Investigate picker behavior before enabling paid multi-selection.
5. Native app and extension distribution entitlements and a real StoreKit sandbox purchase/restore/refund test are release gates. EAS build credits are not consumed just to validate TypeScript.

## Current technical state
- `lib/premiumPolicy.ts` defines the product ID, known/unknown/owned model and a pure app-only selection policy; `tests/premiumPolicy.test.cjs` checks free, paid, unknown, category promotion and corrupt metadata.
- `lib/screenTime.ts` reuses that policy but still enforces **free one-app mode** everywhere. This is deliberate until StoreKit AND selected-app exception are implemented.
- **NOT IMPLEMENTED:** StoreKit payment module/paywall, native verified entitlement source, dynamic store price, restore purchase UI, multiple app monitoring, app-specific unshield and native label selector. This milestone is a correctness foundation only, not a finished Premium product.

## Integration next step
Verify an `expo-iap` release compatible with **Expo SDK 54 / React Native 0.81**, lockfile and native targets. Implement a single non-consumable product with native verified current entitlements and restore; ensure purchase cancellation/errors cannot activate Premium. Then implement minimal app-choice UI and token-specific 15-minute exception before advertising purchases. Use mocked/unit tests, unsigned native compilation, then a consolidated signed iPhone acceptance test. Preserve the existing draft PR #2 and `main` unchanged.

Sources checked 2026-11-02:
- Apple IAP product types: https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases
- Apple current entitlements: https://developer.apple.com/documentation/storekit/transaction/currententitlements
- Apple activity labels: https://developer.apple.com/documentation/familycontrols/displayingactivitylabels
- Library picker-category issue: https://github.com/kingstinct/react-native-device-activity/issues/95
- OpenIAP Expo setup: https://www.openiap.dev/docs/setup/expo
