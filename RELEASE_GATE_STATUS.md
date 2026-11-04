# Curfy — release blockers and proof gates
Updated 2026-11-04. Branch: feat/ios-shield-from-august (draft PR #2). The canonical product decisions are in CURRENT_HANDOFF.md. Historical IOS_DEVICE_ACCEPTANCE.md contains superseded onboarding details.

## Proven so far
- Source code implements Free one-individually-selected-app shielding, Apple's native app identity label, a real 120-second native long-press, DeviceActivity scheduling, and a planned 15-minute exception.
- The user saw the actual protected Instagram icon/name on an installed iPhone build. That does NOT prove closed-app shielding, exception or reblocking.
- The dormant StoreKit 2 module uses verified current transactions; Premium checkout, multi-app choice and purchase activation are NOT enabled.
- Current non-EAS CI runs Node tests, TypeScript, Metro iOS release export, Expo Doctor, iOS prebuild, and native-module autolinking.
- NEW: scripts/verify-ios-native-config.cjs checks source-level Family Controls + App Group configuration across the main target and three extensions. It cannot prove Apple distribution approval.
- GitHub macOS unsigned app and three-extension build **succeeded** at 15f4d17 (run 41900003098). No Swift changes since then. This is not a signed App Store archive or a tested iPhone restriction.
- Server profile and journal persistence recovery are source-tested. Latest source CI at `982c4e7` (https://github.com/alvinkwak01/curfy/actions/runs/41926008701) passed **258/258 tests**, TypeScript, Expo Doctor 18/18, production iOS Metro bundle, and all four entitlement config checks. Supabase deployed-account deletion/consent remain UNKNOWN.
- **Hard cost rule (user request, 2026-11-04):** Do not request or start another EAS build during ongoing code changes. Previous incremental previews consumed paid build resources without delivering consolidated release verification. Keep this branch in development and use free source checks; no final build until one stable candidate and external entitlement prerequisites are ready.

## November 4 no-EAS engineering checkpoint

- **Verified in code and automated tests:** Free and dormant Premium exception records now cap logical access at 15 minutes while preserving the separate 15m+1s DeviceActivity minimum monitor interval; concurrent Free native exception grants are serialized. Real iOS callback timing remains a device gate.
- **Verified in code and automated tests:** malformed Free exception records cannot impersonate the recurring `curfy-bedtime` monitor and clear its cutoff actions.
- **Verified in code and automated tests (latest):** if a Free temporary monitor refuses to stop, Curfy restores its native reblocking callback and keeps the exception ledger for retry. Stop Protection now preflights corrupted exception state before changing the recurring schedule and verifies exception-ledger removal instead of silently claiming cleanup. **Still open:** a partially stopped recurring/exception monitor pair needs an atomic teardown/recovery proof, plus actual delayed-callback/reboot/iPhone testing; source tests cannot certify signed device behavior.
- **Verified in code and automated tests:** Delete Account removes Curfy-private native singleton selection tickets and exception ledgers only after monitors stop, with confirmed native readback; local Journal wipe failure now stops the account-deletion operation and reports failure rather than disappearing behind an empty catch.
- **Verified in code and automated tests:** saved-settings storage read failure shows a safe retry screen instead of starting onboarding or hanging indefinitely. Journal storage writes are serialized and checked before success; the user keeps their draft after failed saves. Real React provider tests exercise failed writes, corrupted/unreadable hydration, concurrent saves and deletion while a write is pending.
- **Verified in code/React provider simulations:** the Supabase Edge Function now rejects non-POST deletion requests and missing/invalid auth before admin deletion. A verified server deletion receipt is persisted locally before auth sign-out; an interrupted cleanup can retry **even after the deleted user's session is invalidated**, without deleting a different account or creating a replacement anonymous leaderboard profile. Local deletion clears this receipt only at the end. **Not verified deployed**: server auth/RLS/cascade, actual backend responses, and recovery if device storage refuses the receipt write immediately after server deletion.
- **No signed device proof added.** Native Swift source unchanged since prior successful unsigned Xcode compile. Neither Apple distribution approval nor actual native re-shield timings are inferred from JS tests.
- **Public policy and consent:** see `APP_PRIVACY_DATA_INVENTORY.md`; automatic Supabase anonymous public leaderboard enrollment is STILL a material consent decision requiring approval before release. Do not silently turn it on/off or invent support URLs.
- **Hard limit:** no more EAS builds during development. All the above work used GitHub commits and existing CI only.

## P0 gates — each requires evidence, not assumptions

| Gate | Status now | PASS means |
| --- | --- | --- |
| Apple Family Controls distribution approval | UNKNOWN | Apple's Certificates, Identifiers & Profiles lists Family Controls (Distribution) as Assigned for each of main app + 3 extensions; actual provisioning supports distribution. |
| Native Swift compile and signing | PARTIAL: unsigned Debug simulator Xcode compilation PASS (41900003098); signed distribution UNKNOWN | App and extensions built in Xcode on current Swift sources; App Store distribution profiles/capabilities and signed archive still need authorization and proof. |
| Free single-app selection | PARTIAL DEVICE EVIDENCE | One app accepted; second app/categories/websites rejected; choice persists; clear/delete does not inherit checkmarks. |
| Scheduled shielding and cutoff | UNVERIFIED ON CLOSED APP | Selected app shielded at start when Curfy is killed; unrelated apps work; opens after schedule end; permission/restart/time-zone cases. |
| 120-second hold and 15-min exception | UNVERIFIED ON PHYSICAL DEVICE | Release at 119s and background resets; 120s continuous hold works; exactly one app opens for <=15m, then re-shields with Curfy closed, subject to cutoff. |
| Premium $5.99 non-consumable | NOT END-TO-END | StoreKit product configured; explicit purchase + Restore UI, sandbox purchase/pending/refund/restart; multiple selected apps with one chosen per 120s hold; all other apps stay shielded and each exception reblocks independently. |
| Privacy / remote accounts | OPEN | Confirm whether implicit anonymous Supabase leaderboard enrollment is retained and how consent works; deployed Edge Function delete-account tested and privacy disclosure truthful. |
| Privacy policy and support | OPEN | Public privacy policy URL, in-app link, accurate App Privacy disclosures, verified support contact/URL, retention/deletion terms. |
| Accessibility and store metadata | OPEN | VoiceOver and Dynamic Type/hold accommodation reviewed, screenshots/age rating/Review Notes, privacy/entitlement and IAP checks, App Store review. |

## Exact Apple identifiers from current app.json
- Main: com.alvinkwak.curfy
- ShieldConfiguration: com.alvinkwak.curfy.ShieldConfiguration
- ShieldAction: com.alvinkwak.curfy.ShieldAction
- DeviceActivity monitor: com.alvinkwak.curfy.ActivityMonitor
- App Group: group.com.alvinkwak.curfy
- Apple team: H735Q3WW8K

Per-app AND per-extension entitlement application:
https://developer.apple.com/documentation/familycontrols/requesting-the-family-controls-entitlement
Expo app extension provisioning: https://docs.expo.dev/build-reference/app-extensions/

## Stop spending EAS credits on code checks
Before another EAS build: CI code/unit/native-config green, unsigned native compile green, relevant Apple distribution/signing status confirmed, and consolidated real-device test plan ready.
Run locally at no EAS cost: npm ci; npm run test:unit; npx tsc --noEmit; npx expo export --platform ios; npx expo prebuild --platform ios --no-install; node scripts/verify-ios-native-config.cjs.
Only then produce one signed preview/TestFlight candidate and record its exact EAS link, git SHA, iOS model/version, selected app, start/end time, interrupt hold results, reblock and cutoff results. Do not merge main or call it App Store-ready from CI alone.

## Launch scope decision (still required)
Current app/_layout.tsx and AuthContext.tsx silently create an anonymous Supabase community profile after onboarding whenever Supabase is configured. To launch responsibly, either retain cloud leaderboard with clear informed opt-in and tested deletion, or defer cloud participation while preserving existing local history. This is a material scope/consent choice and must not be silently changed. Do not claim a privacy policy is complete until actual shipping configuration, contact details and data flows are verified.

## Evidence format
Each milestone records: branch/commit, verified in code, verified by test, device/build proof or UNKNOWN, remaining blocker, next action. Older documents are historical evidence, not proof of the current code.
