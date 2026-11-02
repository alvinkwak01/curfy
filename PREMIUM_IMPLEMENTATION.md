# Curfy Premium — one-time iOS purchase and per-app exception

Decision date: 2026-11-02. This supersedes the earlier pending-subscription/price discussion. No App Store product or live checkout is implied by this document.

## Confirmed commercial and product rules
- **Free:** always protect exactly one explicitly selected application.
- **Premium:** protect multiple explicitly selected applications. No whole categories or websites at launch.
- **Purchase:** **$5.99 USD once**, using one Apple **non-consumable** in-app purchase. **No subscription, trial, recurring charge, or account prerequisite**. App Store storefront localization/taxes must use Apple's returned product price; do not hard-code USD in a live purchase button.
- Proposed StoreKit product identifier: `com.alvinkwak.curfy.premium` (App Store Connect creation/status has not been verified).
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
- **IMPLEMENTED IN SOURCE, NOT DEVICE VERIFIED:** Local Swift StoreKit 2 module in `modules/curfy-storekit/`, exposing verified active non-consumable entitlements, product metadata/localized StoreKit price, non-consumable purchase and Apple Account restore. `lib/premiumStore.ts` does not trust a purchase-return value to grant Premium; it re-reads current entitlements, treats errors as unknown, and never writes a locally spoofable entitlement flag. `tests/premiumStore.test.cjs` covers failures, cancelled/pending purchases, product price from StoreKit and restore reconciliation. **114/114 tests passed** in CI `41484301143`; unsigned native compilation and StoreKit hardware behavior are not yet proven.
- **NOT IMPLEMENTED:** purchasable paywall and restore UI, ownership/transaction refresh on resume, multiple app native monitoring, app-specific unshield/reblock, private native app labels. The one-app limit remains enforced until full Premium functionality is proven; this is not a finished paid product.

## Integration next step
The solution uses an **app-local Expo Swift StoreKit 2 module** instead of a new third-party IAP dependency: Expo documents automatic discovery of local modules and Apple documents current verified entitlements. Verify macOS unsigned native compilation, then add transaction update/foreground reconciliation, minimal app-choice UI and token-specific 15-minute exception before advertising purchases. Validate StoreKit sandbox buying, restore, refunds and restart behavior. Use mocked/unit tests, unsigned native compilation, then a consolidated signed iPhone acceptance test. Preserve the existing draft PR #2 and `main` unchanged.

Sources checked 2026-11-02:
- Apple IAP product types: https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases
- Apple current entitlements: https://developer.apple.com/documentation/storekit/transaction/currententitlements
- Apple activity labels: https://developer.apple.com/documentation/familycontrols/displayingactivitylabels
- Library picker-category issue: https://github.com/kingstinct/react-native-device-activity/issues/95
- Expo local native modules: https://docs.expo.dev/modules/get-started/
- Expo autolinking: https://docs.expo.dev/modules/autolinking/
- Apple StoreKit transaction entitlements: https://developer.apple.com/documentation/storekit/transaction/currententitlements

## 2026-11-02 follow-up: actual StoreKit lifecycle

- Local module now observes Apple `Transaction.updates` while a listener is attached; JS only receives a product-specific change signal and always re-fetches current **verified** entitlements.
- `PremiumProvider` is mounted from root layout and re-queries on foreground, launch, and transaction updates; request generations guard against stale async responses. Ownership is never read from local AsyncStorage and cannot alter current native blocking by itself.
- A native-module autolinking assertion in `.github/workflows/curfy-checks.yml` checks the pod and module are present. GitHub Actions **`41486054714` passed 116/116 tests**, TypeScript, **18/18 Expo Doctor**, lockfile and Expo iOS project generation, with successful StoreKit pod discovery. This does **not** compile Swift.
- Unsigned Xcode run **`41484550157`** was still executing at this update, on an earlier commit lacking the newest observer. A new Swift compilation check is needed after any native-source changes, even if the older job succeeds.
- Per-app native token flow: third-party source `packages/react-native-device-activity/ios/Shared.swift` uses App Group `familyActivitySelectionIds` and encoded `FamilyActivitySelection`. Compare installed `0.6.1` before relying on source layouts. Do NOT emit app names/token strings into JS; instead use iOS native labels and indexed verified token selections.
- Premium purchase remains **not exposed** and multi-app protection remains **disabled** until app-specific shielding/unshielding is proven. Do not silently repurpose the one-app free selection path.

## 2026-11-02: native private protected-app labels foundation

- **Added** local Expo module `modules/curfy-protected-apps/` (iOS Swift + React Native wrapper), and `tests/protectedAppChoices.test.cjs`. The module fetches the saved, committed, app-only opaque `FamilyActivitySelection` from Curfy's App Group, in the exact pinned native library's 0.6.1 base64-JSON UserDefaults format.
- JS gets only `{ count, revision }`; no app names, bundle IDs, tokens, or per-app identifiers. Native `CurfyAppLabel` uses Apple's `Label(ApplicationToken)` via a `UIHostingController` and validates index/revision before rendering, replacing stale selections with a neutral unavailable label. The deterministic order lives inside Swift only.
- **123/123 Node tests, TypeScript, 18/18 Expo Doctor, lockfile, iOS project generation, and both native module autolinking checks passed** in GitHub Actions `41487260116` at code commit `79f3495`. This is code/static evidence, **not native Xcode compilation or iPhone proof**.
- Checkout stays disabled, the new label view is not yet placed on Home, and multi-app exception remains unimplemented. Next native slice must validate the exact chosen token, scope/unshield/reblock one token only, and recover automatically while Curfy is killed; no JS timer-only exception.
- Apple official native app label API: https://developer.apple.com/documentation/familycontrols/displayingactivitylabels

## 2026-11-02: scoped private app choice tickets

- Added `prepareProtectedAppChoice(committedSelectionId, revision, index)` and `validateProtectedAppChoice(ticketId)` in `modules/curfy-protected-apps/index.tsx`, backed by native Swift. iOS checks the committed app selection's exact revision and row membership, writes an opaque **singleton** `FamilyActivitySelection` under a random `curfy-single-app-UUID` key in the same App Group storage, then validates the saved singleton token again against the live committed set.
- Only a random identifier—not the app's bundle ID, label or token—crosses into JS; no native unshield action is possible in this slice. Ticket validation expires after 10 minutes; old singleton entries are eligible for pruning after one day. The future exception coordinator must not remove a scoped selection before the extension has reblocked it.
- CI **`41488530428` passed 127/127 tests**, TypeScript, 18/18 Expo Doctor, lockfile, iOS prebuild and both native module autolinking checks at commit `2e264a2`. The ORIGINAL StoreKit-only unsigned native compile **`41484550157` passed** at older commit `636bf38`; it is NOT evidence that this new ticket Swift code compiles. The chooser-only native compile `41487626181` was still queued when checked.
- **Critical missing runtime:** existing `curfy-active-exception` shared state in `lib/screenTime.ts` and `targets/ActivityMonitorExtension/DeviceActivityMonitorExtension.swift` can track only one active exception. This must be redesigned for independent per-app 15-minute reblocks or explicitly product-gated to prevent silent whole-selection unshielding. `grantBedtimeException` remains free-tier-only and safe.
- Apple's minimum native DeviceActivity monitoring length is 15 minutes: https://developer.apple.com/documentation/deviceactivity/deviceactivitycenter/monitoringerror/intervaltooshort

## 2026-11-02: independently scheduled per-app exception contract

- Added `lib/premiumExceptionPolicy.ts` for a strict map under `curfy-premium-active-exceptions`, with one monitor identity per opaque native app-choice ticket, a maximum 15-minute+1-second exception plan, immutable original cutoff, duplicate/stale detection, and malformed shared-state rejection.
- Added dormant native interval-start/interval-end guards to `targets/ActivityMonitorExtension/DeviceActivityMonitorExtension.swift`: the end callback checks a matching live entry and verified app-only singleton subset, ignores early stopMonitoring callbacks and stale callbacks after cutoff; late daily interval starts re-apply only still-valid singleton Premium exemptions. The existing Free `curfy-active-exception` code is preserved.
- GitHub Actions **`41494056030` passed 139/139 Node tests**, TypeScript, Expo Doctor 18/18, iOS project generation, both Expo native pod discovery checks and lockfile at commit `8e2276a`. Extension Swift is **not compiled** in that run.
- Previous macOS job **`41487626181` was cancelled** without native compilation. The earlier unsigned StoreKit-only macOS job `41484550157` passed. Neither is proof this new code compiles. Request a single new unsigned native CI run before enabling the feature.
- Still missing: actual grant/unshield/rollback coordinator, multiple-entry foreground cleanup, chooser-to-120s-hold flow, ability to configure/sell multiple app protection, signed real-device tests. No purchase UI has been enabled.

## 2026-11-02: actual, inaccessible per-app grant coordinator

- `lib/premiumAppException.ts` now contains an **internal** post-120-second-hold `grantPremiumAppException` sequence, gated on fresh StoreKit-verified owned status, active Screen Time permissions, app-only selection, native ticket revalidation and preexisting shield intersection. It registers a distinct native one-shot reblock monitor BEFORE unshielding exactly the chosen app's singleton; it verifies target and group shield intersection afterward.
- It refuses duplicate grants for the same token, avoids concurrent JS grants, and explicitly blocks use with an active legacy Free group-wide exception. Native monitor failures and swallowed unshield failures trigger compensating re-shield/monitor cleanup and verification; if recovery cannot be confirmed it keeps the native record and raises an explicit failure rather than claiming success.
- `tests/premiumAppException.test.cjs` provides fake native Screen Time/StoreKit dependency tests for separate overlapping app grants, duplicate tickets, authorization, ownership, stale selections, monitor failures, wrong/multiple app unshielding, native rollback, and near-cutoff behavior. CI `41496665378` passed **152/152 tests**, TypeScript, Expo Doctor 18/18, lockfile, iOS prebuild and native autolinking.
- **NOT RELEASED, NOT UI-WIRED, NOT PHYSICALLY TESTED**: Premium native multi-app schedule gating; recovery of expired independent records; accessible native app-choice screen; Swift native compile of the latest chooser/ticket extension; purchase UI. The existing Free scheduling restriction and hold remain unchanged. No paid transactions can start.
- Apple documents the real DeviceActivity callback timing is device-use-dependent: https://developer.apple.com/documentation/deviceactivity/deviceactivitycenter. The stated 15-minute end is the scheduled window, not proof that the callback executes exactly on time while the phone is idle.

## Native CI status update — 2026-11-02

The unsigned Xcode run `41494547150` (older native commit `0b4a04d`) ended with overall workflow failure **because the `ios-native-compile` job was cancelled before compiling Swift**; no compiler error or successful build can be inferred. The previous StoreKit-only run `41484550157` was successful but predates protected-app tickets and the Premium monitor extension. A fresh unsigned Xcode compile of the current branch is still a necessary gate. The 152/152 code tests in `41496665378` remain green.
