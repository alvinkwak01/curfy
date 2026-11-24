# Curfy — current release gates
Updated 2026-11-24. Draft PR #2, `feat/ios-shield-from-august` → `backup/local-curfy-august`. Read CURRENT_HANDOFF.md first. Historical checkpoints remain in Git and the handoff; this register describes current evidence only.

**NOT App Store-ready. No signed candidate has been requested.**

| Gate | Verified evidence | Remaining work |
|---|---|---|
| Code checks | 383/383 tests, TypeScript, iOS production export PASS locally Nov 24; prior CI 43071652613 SUCCESS on 120518d | Recheck changes as needed; mocks do not prove iPhone behavior |
| Settings persistence | Recovery journal, native commit/abort receipt, verified local writes and restart tests | Real storage/process-kill/reboot/permission recovery |
| Native configuration | Prebuild/autolinking, four-target entitlement configuration PASS | Signed matching profiles and installed binary |
| Native compilation | 2026-11-11 full unsigned Debug simulator app + three extensions BUILD SUCCEEDED; all four built manifests inspected | Current signed archive/device proof; SDK26.5+ is required and now has a read-only preflight script |
| Shield → Curfy → hold | Open Curfy uses official API on iOS26.5+; older iOS retains explicit manual-open route; no shield mutation on handoff | Physical modern/older-iOS journey, foreground/background/terminated app, chosen-app hold, reblocking; existing download does not contain native changes |
| Free/Premium protection | One individual app in onboarding; StoreKit one-time purchase/restore; multiple private app rows and independent holds/monitor recovery in source | Signed sandbox purchase/pending/cancel/restore/refund/offline and per-app protection matrix |
| Backend deletion | Recovery v1 and legacy safeguards v3 deployed; source match; 18 live checks PASS on two disposable identities, both cleaned up | Signed app integration; exceptional lost anonymous session/fully revoked verification material; live rotation operating procedure |
| Backend uptime | Restored paused project Nov 24; ACTIVE_HEALTHY, both deletion functions ACTIVE | Free-plan low-activity pausing remains an operational risk; no paid upgrade or synthetic keepalive |
| Leaderboard reliability/moderation | Failed loads now show Retry; timeout/race and tied-rank fixes covered by nine new tests | Public-name filtering, reporting/blocking and response procedure before submission (Apple 1.2) |
| Store availability | Free app price, 175 current storefronts, manual release, Mac/Vision Pro disabled; Premium 175 | China AIGC and Security Assessment show Active/No; ICP applicability remains open; selecting countries is not regulatory clearance |
| Leaderboard consent | Disclosure before uploads, leave/retry preserves local protection/history, provider tests PASS | Actual signed app consent/leave/rejoin and legacy-state matrix |
| Public profile privacy | Deployed RLS and own-write predicates, full-profile public SELECT, auth→profile cascade verified | Live client privileges narrowed and verified: anon SELECT; authenticated SELECT/INSERT/UPDATE. Final retention/App Privacy and signed-app acceptance remain |
| Family Controls distribution | Apple portal shows Distribution ENABLED for main, ShieldAction, ShieldConfiguration and ActivityMonitor under team H735Q3WW8K | Portal has Ad Hoc profiles for four targets; main active through 2027/01/07 with capability. No Curfy App Store profile visible. Verify all signed entitlements/App Group and prepare correct distribution profiles |
| App Store record/name | Owner-approved Curfy: Bedtime. For real. accepted; app ID 6838811413 created Nov 24, Prepare for Submission | Name setup gate closed; app branding/bundle unchanged. Final metadata and release checks remain |
| Apple agreements | Developer portal explicitly shows updated agreement accepted Nov 9, verified Nov 24; Paid Apps/banking/tax/DSA previously Active | Recheck commercial status at final submission; no legal acceptance by agent |
| StoreKit setup | Non-Consumable product 6838811684 created; source ID com.alvinkwak.curfy.premium matches; $5.99 US base price and English name/description saved | Availability saved for all 175 current storefronts; actual review screenshot, app-version submission and signed sandbox acceptance still required |
| Privacy manifests | App-group defaults reason added to all four targets; generated resource checks PASS; all three unsigned Release simulator extension bundles contain manifest | Ten SDK manifests reviewed/aggregated and linked nontracking data disclosures added; all four built simulator bundle manifests checked. Signed archive report/provider retention/App Store validation remain |
| Privacy/support | Public support/privacy pages deployed; Apple URLs saved, Settings links implemented | Owner supplied sleepingcurfy@gmail.com and approved legal operator identification. Public support/privacy pages deployed at curfy-support.pages.dev on Cloudflare Pages; previous name-containing Sites address is now owner-only; legal operator identified only in policy. Settings links added; unauthenticated HTTPS and browser checks passed. Remaining: final retention/territorial privacy review, mailbox delivery and signed-device link acceptance |
| Accessibility/design | Existing Welcome + nine steps, ring, branding and 120-second hold preserved | VoiceOver, large text, Reduce Motion, small iPhone; explicit hold accommodation decision |
| Submission | Draft package and consolidated device matrix maintained | Final screenshots, age rating and regional compliance, actual acceptance, TestFlight/App Review |

## Controls
No EAS development builds, paid action, main merge or submission without the required explicit authorization. Complete applicable code and external preflight first, then propose ONE consolidated signed candidate. No unsigned/mocked result passes a signed-device gate.

Team H735Q3WW8K. App `com.alvinkwak.curfy`; extensions `.ShieldConfiguration`, `.ShieldAction`, `.ActivityMonitor`. App Group `group.com.alvinkwak.curfy` (exact assignment observed for main and ActivityMonitor previously, and ShieldAction/ShieldConfiguration on Nov 24; all four verified).

Evidence: `docs/release-evidence/deletion-live-2026-11-09.json`, `RELEASE_PREFLIGHT_EVIDENCE.md`, current `CURRENT_HANDOFF.md`. Device test package: `CONSOLIDATED_DEVICE_ACCEPTANCE.md`; submission draft: `APP_STORE_SUBMISSION_PACKAGE.md`.
