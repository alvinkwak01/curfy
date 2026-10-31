# Curfy — current engineering state

Updated: 2026-10-31. Source of truth: current branch and device observations, not older claims in CONTEXT.md.

## Goal

At the user's configured bedtime, shield only the apps they explicitly selected using iOS Screen Time APIs, independent of whether Curfy is running. Complete the continuous 120-second hold before temporarily lifting the native shield, then restore shielding after the exception. Default 6:00 a.m. end time remains a product decision to reconcile with the historical user-editable wake time currently used by code.

## Current branch

`feat/ios-shield-from-august`, draft PR #2 (base `backup/local-curfy-august`). `main` is untouched. Existing August native implementation and EAS iOS extension targets are preserved.

## Milestone: native bedtime scheduler reliability (2026-10-31)

- `lib/screenTime.ts`: registers DeviceActivity interval-start and interval-end actions *before* `startMonitoring()`, since Apple may invoke the interval-start callback immediately for an ongoing window. Refuses to schedule when Screen Time permission is missing or the persisted app selection is empty.
- `app/onboarding.tsx`: no longer completes setup after a native scheduling failure; shows the reason and allows retry.
- `app/settings.tsx`: no longer shows a false 'Saved' success when scheduling fails.
- Earlier in this branch: `components/TimePicker.tsx` ascending/native wheel direction and app-extension identifier alignment.

**Evidence:** source inspected against the current GitHub branch; changes checked for action ordering, guards, and success-path ordering. Apple's DeviceActivity documentation and the library's published example both register actions before monitoring starts. **Not verified:** TypeScript build on current commit, native compilation, live Screen Time shielding or start/end events on physical iPhone. Do not treat earlier EAS preview builds as proof of current commits.

## Known P0 gaps

1. **Real-device proof:** select one nonessential app, schedule bedtime shortly ahead, close Curfy, confirm that app receives an iOS shield while a different app remains usable; verify it unblocks at scheduled end. Also check no-permission/empty-selection error.
2. **Shield escape path:** the third-party `openApp` action goes through a ShieldAction extension and tries a custom URL. Opening Curfy from a shield has not been proven on iOS 18. Confirm a safe manual-open path if it fails. Do not promise shield UI can render the React Native hold screen.
3. **15-minute exception:** the React Native `unlockScreen()` only dismisses Curfy's modal and stores a JS cooldown. It does **not** lift the native ManagedSettings shield or schedule native automatic re-shielding. Implement separately after P0 shielding proof.
4. **Schedule switching/clock:** changing the selected preset may leave old managed shields; reconcile native state when switching selections and changing windows. Test DST, timezone, reboot, permission revocation.
5. **Product gate:** current UI's three presets and editable wake time do not yet enforce the approved 'one free app / multi premium' and 6:00 a.m. default; resolve before release.
6. **Shipping gates:** pricing and StoreKit, entitlement validation in distribution, truthful privacy/App Store claims, unsupported sleep statistics, account deletion, full QA.

## Next smallest action

Use the already installed, earlier EAS preview build to attempt one focused real-device scheduled-shield test without paying for another cloud build. If it fails or behaves inconsistently, first pull this branch on the Mac, run `npx tsc --noEmit`, then make **one** physical-device preview build of the batched scheduler fixes and repeat. Tests cannot be run from this GitHub-only environment. Avoid EAS for pure UI work.

## Decisions and rollback

No new product decision was made in this engineering slice. Code commits were made only on the development branch. Reverting the three scheduler-related commits restores the previous code, including its known failure-suppression and callback ordering risks.
