# Curfy — current release gates
Updated 2026-11-09. Draft PR #2, `feat/ios-shield-from-august` → `backup/local-curfy-august`. Read CURRENT_HANDOFF.md first. Historical checkpoints remain in Git and the handoff; this register describes current evidence only.

**NOT App Store-ready. No signed candidate has been requested.**

| Gate | Verified evidence | Remaining work |
|---|---|---|
| Code checks | 374/374 tests, TypeScript, iOS production export PASS; CI 42667878535 SUCCESS on 1a3bf11 | Recheck changes as needed; mocks do not prove iPhone behavior |
| Settings persistence | Recovery journal, native commit/abort receipt, verified local writes and restart tests | Real storage/process-kill/reboot/permission recovery |
| Native configuration | Prebuild/autolinking, four-target entitlement configuration PASS | Signed matching profiles and installed binary |
| Native compilation | Earlier full unsigned app/three-extension build; latest ShieldAction/ShieldConfiguration compiled as unsigned simulator libraries with SDK26.5 | Current signed archive/device proof; SDK26.5+ is required and now has a read-only preflight script |
| Shield → Curfy → hold | Open Curfy uses official API on iOS26.5+; older iOS retains explicit manual-open route; no shield mutation on handoff | Physical modern/older-iOS journey, foreground/background/terminated app, chosen-app hold, reblocking; existing download does not contain native changes |
| Free/Premium protection | One individual app in onboarding; StoreKit one-time purchase/restore; multiple private app rows and independent holds/monitor recovery in source | Signed sandbox purchase/pending/cancel/restore/refund/offline and per-app protection matrix |
| Backend deletion | Recovery v1 and legacy safeguards v3 deployed; source match; 18 live checks PASS on two disposable identities, both cleaned up | Signed app integration; exceptional lost anonymous session/fully revoked verification material; live rotation operating procedure |
| Leaderboard consent | Disclosure before uploads, leave/retry preserves local protection/history, provider tests PASS | Actual signed app consent/leave/rejoin and legacy-state matrix |
| Public profile privacy | Deployed RLS and own-write predicates, full-profile public SELECT, auth→profile cascade verified | Least-privilege grants and final retention/App Privacy review |
| Family Controls distribution | Apple portal shows Distribution ENABLED for main, ShieldAction, ShieldConfiguration and ActivityMonitor under team H735Q3WW8K | Portal has Ad Hoc profiles for four targets; main active through 2027/01/07 with capability. No Curfy App Store profile visible. Verify all signed entitlements/App Group and prepare correct distribution profiles |
| App Store record/name | Curfy is absent from current team app list. Creation attempt rejected: name “Curfy” already in use | Owner choice of listing-title alternative or ownership investigation; no app record/product created by failed attempt |
| Apple agreements | Updated Developer Program agreement notice observed | Account Holder review/acceptance of update; Paid Apps Agreement, banking, tax and DSA show Active in portal (read-only verification) |
| StoreKit setup | Source ID com.alvinkwak.curfy.premium; approved $5.99 USD non-consumable | Create/verify product after app record; localized metadata, price, review screenshot and sandbox test |
| Privacy/support | Draft pages prepared; verified backend facts updated | Real monitored public contact, operator confirmation, retention details, public URLs and in-app policy link |
| Accessibility/design | Existing Welcome + nine steps, ring, branding and 120-second hold preserved | VoiceOver, large text, Reduce Motion, small iPhone; explicit hold accommodation decision |
| Submission | Draft package and consolidated device matrix maintained | Final screenshots, name clearance, age/territory decisions, actual acceptance, TestFlight/App Review |

## Controls
No EAS development builds, paid action, main merge or submission without the required explicit authorization. Complete applicable code and external preflight first, then propose ONE consolidated signed candidate. No unsigned/mocked result passes a signed-device gate.

Team H735Q3WW8K. App `com.alvinkwak.curfy`; extensions `.ShieldConfiguration`, `.ShieldAction`, `.ActivityMonitor`. App Group `group.com.alvinkwak.curfy` (observed assigned to ActivityMonitor; all four show App Groups enabled, remaining exact assignments require verification).

Evidence: `docs/release-evidence/deletion-live-2026-11-09.json`, `RELEASE_PREFLIGHT_EVIDENCE.md`, current `CURRENT_HANDOFF.md`. Device test package: `CONSOLIDATED_DEVICE_ACCEPTANCE.md`; submission draft: `APP_STORE_SUBMISSION_PACKAGE.md`.
