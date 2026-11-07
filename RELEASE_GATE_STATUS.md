# Curfy — release gate register
Updated 2026-11-07. Draft PR #2, branch `feat/ios-shield-from-august`. Canonical decisions: `CURRENT_HANDOFF.md`. Latest code checkpoint `8c3565d28fa21238e4b5b5fb12aacf0b120334ca` (Settings recovery); prior native integrated checkpoint `a1a400b324bf244f0d6b2fe336647cad0a60bb5f`.

| Gate | Evidence / status | Still required |
|---|---|---|
| Settings persistence | IMPLEMENTED / mocked tests PASS: write-ahead journal, native commit/abort receipts, verified local writes, startup/retry recovery, stale-state guards | Signed process-kill/reboot and real storage/permission failure recovery; native disk durability not proven |
| Code tests | Latest local **340/340 PASS**, TypeScript PASS; React provider/hold-route tests plus native mocks | [GitHub CI `42426493789`](https://github.com/alvinkwak01/curfy/actions/runs/42426493789) PASS at `8c3565d`; integration review continues; no mock proves iPhone behavior |
| Production JS | iOS Hermes export PASS | Signed binary using same reviewed source |
| Expo/native config | Latest CI Doctor, prebuild/autolinking, app + 3 entitlement-config checks PASS (prior local Doctor **18/18 PASS**) | Actual distribution profiles/capabilities |
| Swift compilation | Local Xcode 26.6, Simulator SDK 26.5, unsigned Debug app + 3 extensions **BUILD SUCCEEDED**; final callback source compiled arm64/x86_64 | Signed archive/real-device behavior; simulator compilation is not Screen Time proof |
| Existing design | Onboarding and HoldButton files unchanged; source regressions PASS | New Premium/consent controls visually reviewed on small iPhone, large text and VoiceOver |
| Free native flow | Source/tests present; old device picker/icon observations only | Current signed closed-app shield/hold/reblock/cutoff, denial/revocation/reboot/time-zone matrix |
| Premium integration | NOW wired in code: StoreKit Settings purchase/restore; fresh entitlement-gated multi-selection; private per-app Home/hold; independent monitor recovery/stop/rollback | StoreKit product setup and signed sandbox purchase/pending/cancel/restore/refund/offline; per-app closed-app reblocking |
| Leaderboard consent | Interrupted finalization stays `leaving` and cannot auto-rejoin; USER APPROVED: disclosure before first upload, then automatic sync, Settings leave. Source and React provider tests PASS incl. leave during signup | Real deployed backend verification, legacy-account migration behavior and privacy-policy wording |
| Remote deletion | Client finalization/receipt readback/startup gates repaired and tested. **OPEN CODE/BACKEND BLOCKER:** lost success response leaves deleted caller unable to authenticate retry | Implement authenticated prepare/commit/status recovery, then deployed Edge Function/auth/RLS/cascade test; see `RELEASE_PREFLIGHT_EVIDENCE.md` |
| Public profile data | Source RLS allows public profile rows including start time/ID; disclosure says start time is public | Verify deployed schema; final data minimization/retention/App Privacy review |
| Distribution approval | UNKNOWN for main + three extensions | Apple's assigned Family Controls DISTRIBUTION capability and matching profiles for each target |
| StoreKit configuration | UNKNOWN; proposed ID `com.alvinkwak.curfy.premium`, approved $5.99 USD non-consumable | Actual product configuration, commerce agreements, sandbox readiness |
| Privacy/support | OPEN; no verified URLs/contact supplied | Public policy, accessible in-app policy link, support destination, final provider/SDK disclosures |
| Accessibility | OPEN | VoiceOver/native labels, large text, Reduce Motion, explicitly approved continuous-hold accommodation |
| Submission | Draft package prepared; NOT submitted | Real screenshots, age rating/territories, name clearance, signed device acceptance, TestFlight/App Review |

## Cost and release control
No EAS build or paid cloud action during development. No main merge. Finish code review/checks and external preflight first; then obtain explicit approval for ONE consolidated signed candidate. The release gate is not passed by TypeScript, mocked tests, native source entitlements, or unsigned compilation.

## Apple identities
Main `com.alvinkwak.curfy`; extensions `com.alvinkwak.curfy.ShieldConfiguration`, `com.alvinkwak.curfy.ShieldAction`, `com.alvinkwak.curfy.ActivityMonitor`; group `group.com.alvinkwak.curfy`; team `H735Q3WW8K`.

Current test package: `CONSOLIDATED_DEVICE_ACCEPTANCE.md`. Submission draft: `APP_STORE_SUBMISSION_PACKAGE.md`. Handoff has exact changed files/checks/limitations and local log locations.

Latest review: `RELEASE_PREFLIGHT_EVIDENCE.md` contains access state, exact open deletion-recovery failure, source references and preflight steps. Metadata-only `supabase/preflight/release-readonly.sql` is prepared but NOT run against a deployed database.
