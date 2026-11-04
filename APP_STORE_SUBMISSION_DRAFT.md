# Curfy — App Store submission draft (NOT YET APPROVED)
Updated 2026-11-04. This draft is intentionally **not** a submission. Do not paste unchecked fields into App Store Connect. Read RELEASE_GATE_STATUS.md for blockers and proof requirements.

## Customer-facing description (draft; only publish after device proof)

**Curfy — Bedtime. For real.**

Protect your evenings from the app you keep reopening.

Choose a distracting app and set the hours you want it out of reach. During those hours, Curfy uses iOS Screen Time to shield that selected app, even when Curfy itself is closed.

Need to get in anyway? Open Curfy and hold the circular button without lifting your finger for two uninterrupted minutes. After the hold succeeds and iOS confirms the exception, you can use the selected app temporarily—up to 15 minutes—before protection returns.

Curfy protects selected apps, not your entire phone. It doesn't measure or guarantee sleep.

### Feature claims to keep OUT until tested/activated
- Premium multiple-app protection (code foundations exist but checkout is disabled).
- Guaranteed blocking under all permission changes, time-zone changes or device restarts.
- Direct link/automatic handoff from Apple's native app shield into the Curfy hold.
- Health, sleep improvement or measured outcomes not collected by the app.
- Subscription/trial language; the confirmed proposed paid option is $5.99 once, non-consumable, NOT a subscription.

## App Review notes (draft)

Curfy is a self-control app that uses Apple's Screen Time frameworks to shield **one user-selected third-party app** during an explicitly chosen daily time window. It requests Family Controls authorization for the individual device owner; the selected app is represented by Apple's private app token.

### Steps reviewers can follow (only after pass on signed TestFlight build)

1. Open Curfy. Onboard without creating a password-based account.
2. Authorize Screen Time when iOS asks. Select ONE ordinary nonessential installed app in Apple's Family Activity picker (no categories or websites).
3. Choose a window starting within a few minutes, ending at least 25 minutes later. Finish onboarding. Close or force-quit Curfy.
4. At the configured start time, open the chosen app and confirm Apple's Curfy shield appears. An unrelated app remains available.
5. On the shield, the supported action closes the attempt. Open Curfy manually from the iPhone Home Screen.
6. Tap the Unlock [chosen app] action. The user must hold the Curfy ring continuously for 120 seconds. Releasing early resets; the hold cannot be skipped by a tap.
7. After native confirmation, the app becomes available for at most 15 minutes (or until the original window ends). When the exception ends, the app should be shielded again; after the original cutoff it should be available.
8. The user can manage app choice and schedule in Curfy Settings. Revoking Screen Time authorization in iOS Settings necessarily affects enforcement.

The shield is an iOS extension; it cannot display a React Native screen or automatically launch the app. Curfy intentionally directs users to open Curfy from Home for the hold.

### Entitlement explanation

Screen Time / Family Controls is necessary because Curfy restricts specific apps selected privately by the device owner using ManagedSettings and DeviceActivity, including when Curfy is not running. The app uses a shared App Group with Shield Configuration, Shield Action, and Device Activity Monitor extensions. Reviewers must evaluate the **signed distribution** entitlements for the main app and the three extensions; the source configuration is insufficient.

### Purchases

StoreKit purchase integration and multi-app Premium are not enabled in the current Free preview. Do not advertise a purchase that cannot be completed and restored. Once enabled, the product is a single restorable non-consumable with localized price returned from Apple, and paid users must still complete the same 120-second hold before an exception to one chosen app.

## App Store Connect completion checklist (unknown external data)

- [ ] Seller/provider name, support website/URL, and a monitored support contact — **not supplied/verified**.
- [ ] Public privacy policy URL and in-app Privacy link — **not published/verified**.
- [ ] Exact app version/build and submitted Git SHA — **not signed/recorded**.
- [ ] Family Controls distribution: **Assigned** for all four App IDs; matching Store provisioning — **not verified**.
- [ ] Real screenshots of release build on supported iPhone sizes; no mockups substituting for app use.
- [ ] iOS version/compatibility, accessibility answers, age-rating questionnaire, categories, keywords and localization.
- [ ] App Privacy answers reflecting actual enabled Supabase identity/leaderboard and third-party SDK data.
- [ ] Online account deletion Edge Function deployed/verified if anonymous community accounts ship.
- [ ] StoreKit non-consumable product created, purchase/restore/refund sandbox verified, paid feature active **before** Premium claims; otherwise hold Premium from listing pending explicit launch-scope approval.
- [ ] App Review notes and demo workflow verified on the exact submitted build; entitlement and App Group evidence.
- [ ] TestFlight beta passed; no unresolved P0 bugs.

Official references:
- App Review Guidelines https://developer.apple.com/app-store/review/guidelines/
- Family Controls distribution https://developer.apple.com/documentation/familycontrols/requesting-the-family-controls-entitlement
- Expo extension provisioning https://docs.expo.dev/build-reference/app-extensions/
- App Privacy https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
