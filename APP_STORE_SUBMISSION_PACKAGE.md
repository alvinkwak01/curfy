# Curfy — App Store submission preparation
Updated 2026-11-09. Draft package, NOT approved/submitted/published.

## Confirmed inputs
- Name/brand: Curfy; “Bedtime. For real.”; iPhone first.
- Bundle ID `com.alvinkwak.curfy`, Team `H735Q3WW8K`, App Group `group.com.alvinkwak.curfy`.
- Extensions: `com.alvinkwak.curfy.ShieldConfiguration`, `com.alvinkwak.curfy.ShieldAction`, `com.alvinkwak.curfy.ActivityMonitor`.
- Source version 1.0.0. Production build number is remotely managed in EAS; actual next build number UNKNOWN.
- Premium: non-consumable; proposed product ID `com.alvinkwak.curfy.premium`; US price $5.99 once; localized StoreKit pricing elsewhere. Product not yet configured because app-record creation hit a name conflict. Paid Apps, banking, tax and DSA verified Active; owner reports accepting updated Developer Program agreement.

## Listing draft (owner approval and actual screenshots still required)
Name: Curfy (creation blocked; Apple support case 30000010262818 pending, no alternative approved)
Subtitle: Bedtime. For real.

Description draft:
Curfy helps you keep a boundary with distracting apps. Choose the iPhone app you want to protect and set your protection start and end times. Curfy uses Apple's Screen Time controls to shield your selection during that window.

Need temporary access? Open Curfy and complete an uninterrupted 120-second hold. Releasing early resets the timer. A completed hold gives the chosen app up to 15 minutes of access, ending sooner when your protection window finishes.

Protect one app free. Curfy Premium adds multiple individually selected apps through a one-time purchase. Every app still requires its own hold, and your other protected apps stay shielded.

An optional public leaderboard lets you share your display name and streaks after you agree to join. You can leave from Settings. Curfy does not measure sleep or lock your whole phone.

Do not use this text to imply exact-second iOS callback guarantees. Review final claims against signed-device observations.

## Review Notes draft
Curfy requests individual Family Controls authorization to shield only applications selected by the user. Onboarding selects one individual app. Schedule times are configurable. On iOS 26.5+, the native shield offers Open Curfy using Apple’s supported controlling-app response. On older supported iOS, follow the shield’s instruction to open Curfy manually from the Home Screen. In Curfy, use Home and tap the protected app’s row to access its hold screen. Opening Curfy alone never unlocks the protected app. This journey requires signed-device verification before these review notes are finalized.

The uninterrupted 120-second hold is intentional. Releasing or backgrounding before completion resets it. For Premium, tap the individual app's Home row; the hold releases only that application, up to 15 minutes and no later than the selected window end. Other apps remain restricted. Settings offers a one-time non-consumable purchase and Restore purchases.

Leaderboard participation requires a disclosure/confirmation after setup and can be withdrawn in Settings. App protection and Premium do not require a Curfy cloud account. Delete Everything is available in Settings; backend deletion recovery passed 18 live checks; signed-app integration still requires acceptance before submitting these notes.

Supply review instructions with exact test window and current build; do not provide fabricated account credentials or claim unverified entitlement approval.

## External items still required
- Distribution capability verified enabled for main app AND all three extensions; actual signed archive entitlement/provisioning inspection remains.
- App Store Connect app record, product type/ID/localized name/description/$5.99 US tier, agreements/tax/banking, sandbox tester.
- Public privacy-policy URL, in-app accessible link, support URL and real contact. None supplied or verified; no placeholder URL should ship.
- Supabase deployment/RLS/cascade/deletion verified, including 18 live checks. Finish provider retention/processors and least-privilege review. Public profiles expose start time and ID as well as displayed name/streaks.
- App Privacy answers based on final binary/backend. No advertising/tracking SDK found in focused source review, but full SDK/provider audit remains required.
- Age rating, territorial availability, branding clearance, accessible hold accommodation, real iPhone screenshots and metadata review.
- Consolidated signed iPhone acceptance PASS, sandbox purchase/restore/refund evidence, TestFlight acceptance and Apple review outcome.

## References checked 2026-11-07
- Apple privacy/consent/account rules: https://developer.apple.com/app-store/review/guidelines/#privacy
- StoreKit current verified entitlements: https://developer.apple.com/documentation/storekit/transaction/currententitlements
- DeviceActivity activity enumeration: https://developer.apple.com/documentation/deviceactivity/deviceactivitycenter/activities
- DeviceActivity callbacks: https://developer.apple.com/documentation/deviceactivity/deviceactivitymonitor/intervaldidend(for:)
- Expo module linking: https://docs.expo.dev/modules/autolinking/

No EAS build, store upload, paid action or publication was performed by this preparation.
