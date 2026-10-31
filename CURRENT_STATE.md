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

## Milestone: avoid locking Curfy itself (2026-10-31)

- User observed that Curfy's full-screen in-app hold modal appeared while the selected app did not appear shielded. Root cause for the Curfy self-lock: `SleepContext.checkLock()` directly called `setIsLocked(true)` for every bedtime window, independent of native Screen Time behavior.
- `context/SleepContext.tsx` now logs the current bedtime window but does **not** automatically display Curfy's own lock modal. Explicit preview remains accessible. This does **not** itself repair native shielding; verify selected app shield separately.
- Static source checks only. The installed iPhone build predates this fix. No new EAS build was triggered.

## Milestone: 120-second hold → temporary native unshield → re-shield (2026-10-31)

**Implemented on branch, still NOT verified on iPhone.** Scope is an intentionally user-opened escape screen in Curfy; the iOS native shield's "Open Curfy" deep link remains unproven.

- `lib/bedtimeWindow.ts`: local calendar window and one-shot DateComponents; fixed offsets distinguish repeated hours across DST.
- `lib/screenTime.ts`: verifies Screen Time approval and currently shielded selection before granting a 15-minute exception; starts a nonrepeating native DeviceActivity monitor with an `intervalDidEnd → blockSelection` action *before* unshielding. If native scheduling or unshield fails, rolls back and preserves restrictions. Less than 15 minutes until wake: exception ends at normal native wake boundary without a too-short monitor. Shared native app-group metadata survives app termination.
- `targets/ActivityMonitorExtension/DeviceActivityMonitorExtension.swift`: rejects early, stale, superseded or post-wake monitor callbacks, including stopMonitoring-triggered events.
- `context/SleepContext.tsx`: only records an escape after native unshield verification; startup, foreground and 30-second foreground checks recover expired exceptions.
- `components/HoldButton.tsx`: interrupt/background resets continuous hold; asynchronous unlock failure remains visible. `components/LockScreen.tsx`: preview can't grant access. `app/escape.tsx` / home screen: deliberate user-invoked hold, no automatic Curfy lock; home warns rather than making user hold if no selected app is shielded.
- `tests/bedtimeWindow.test.cjs`, `tests/screenTimeException.test.cjs`: 11 unit cases with a mocked native bridge, plus `.github/workflows/curfy-checks.yml` for unit and TypeScript checks. One initial CI failure was incorrect DST test expectations (6/8 elapsed hours for 23:00–06:00 across spring/fall); corrected, and additional timezone-offset assertions added.

**Evidence:** reviewed current branch source, exact dependency `kingstinct/react-native-device-activity` v0.6.1 API/types/Swift implementation, Apple DeviceActivity minimum-15-minute rule and deferred-on-device-use callbacks. GitHub CI for commit `a275862` completed successfully; later commits may require fresh CI check. The mock tests do NOT simulate real Screen Time callbacks, signing, force-quit behavior, or actual installed app shielding. **No EAS build triggered.**

## Known P0 gaps

1. **Real-device proof:** select one nonessential app, schedule bedtime shortly ahead, close Curfy, confirm that app receives an iOS shield while a different app remains usable; verify it unblocks at scheduled end. Also check no-permission/empty-selection error.
2. **Shield escape path:** the third-party `openApp` action goes through a ShieldAction extension and tries a custom URL. Opening Curfy from a shield has not been proven on iOS 18. Confirm a safe manual-open path if it fails. Do not promise shield UI can render the React Native hold screen.
3. **15-minute exception:** now implemented against the real device activity library, with a new native one-shot monitor and Swift guard, but **not yet built or verified on physical iPhone**. DeviceActivity callbacks can be delayed until the device is used; verify exact timing and error cases. Repeated trials, force-quits, reboot, DST and wake boundaries remain essential.
4. **Schedule switching/clock:** changing the selected preset may leave old managed shields; reconcile native state when switching selections and changing windows. Test DST, timezone, reboot, permission revocation.
5. **Product gate:** current UI's three presets and editable wake time do not yet enforce the approved 'one free app / multi premium' and 6:00 a.m. default; resolve before release.
6. **Shipping gates:** pricing and StoreKit, entitlement validation in distribution, truthful privacy/App Store claims, unsupported sleep statistics, account deletion, full QA.

## Next smallest action

After the latest GitHub unit/TypeScript checks are green, pull this branch on the Mac and prepare ONE batched physical-iPhone preview build. First confirm selected app is actually shielded while Curfy is closed; then reopen Curfy manually, tap the new exception action, hold 120 seconds, confirm temporary app access, force-quit Curfy, and verify the selected app re-shields after ~15 minutes of actual device use. Test interrupted holds and wake-time boundary separately. Apple system scheduling is not hard real-time. Do not merge or call the native cycle complete until the device logs prove it.

## Decisions and rollback

No new product decision was made in this engineering slice. Code commits were made only on the development branch. Reverting the three scheduler-related commits restores the previous code, including its known failure-suppression and callback ordering risks.
