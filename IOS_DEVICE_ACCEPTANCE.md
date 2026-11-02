# Curfy iPhone native acceptance — before the next EAS build

Updated 2026-11-02. **NOT a claim of device testing.** Use this after the next single signed development/TestFlight build. No new EAS build was triggered when preparing this checklist.

## Release test setup
- Use a real iPhone with iOS 17+/18+/19+ as available, signed with a valid app **and all required Screen Time extensions**. Record iPhone model, iOS version, signed build number, Git commit, local timezone, granted Family Controls entitlement and any extension provisioning errors.
- Keep one ordinary nonessential third-party app for testing. Do not include Phone, Messages, emergency-critical apps, a whole category, or a website. Have notifications/Screen Time permission settings reachable.
- One actual test build should include the existing 120-second HoldButton, native ShieldConfiguration/ShieldAction/ActivityMonitorExtension, the new swipe clocks, five-step Evening/Morning/Both onboarding, and Settings schedule rollback.
- Do **not** mark any step pass from TypeScript, simulator or unsigned Xcode compilation.

## Fast smoke path (no overnight waiting)
1. Open Curfy; confirm the **first page** asks Evening / Morning / Both, without a splash or sleep questionnaire. Select one. Verify clock wheels scroll multiple values with a swipe (not just one number per tap), show neighboring digits and support VoiceOver increment/decrement.
2. Set protection **start 2–4 minutes in the future** and **end at least 20 minutes later**. Confirm on the summary that end says same-day or next-day correctly. Grant Screen Time permission and select exactly **one** app.
3. Force-quit Curfy BEFORE the start time. At/after start, launch the selected test app: Apple shield should appear. Launch one unselected app to confirm it is unaffected. Do not count a JS modal as an OS shield.
4. On the shield, confirm **Not now** closes the blocked-app attempt, without falsely promising a deep link. Open Curfy manually from Home. Start the ring: release at e.g. 5 seconds and 119 seconds, and confirm each release resets to zero. Background/lock Curfy mid-hold; confirm it never grants an exception.
5. Hold continuously for full **120 seconds**; only then should iOS remove the selected app's shield. Curfy should show an exception ending at a concrete local time, with a maximum duration of approximately **15 minutes**, or earlier if the scheduled protection window ends.
6. Force-quit Curfy during the exception. At exception expiration, launch the selected app again: it must be shielded again while still inside the configured protection window.
7. At the configured window end, launch that same app: restriction must be gone. If it remains shielded, reopen Curfy once to test foreground recovery, but mark **closed-app cutoff FAIL**, since the core requirement must not depend on opening Curfy.

## Schedule and migration
- Evening: default 11 PM → 6 AM next day. Morning: 6 AM → 9 AM same day. Both: 11 PM → 9 AM next day, continuously shielded through 6 AM. Use nearby custom clock times for fast acceptance rather than waiting for each default period.
- Confirm switching routine proposes corresponding hours, but the user can edit both; saving shows the actual next/same-day end.
- Change chosen app in Settings. Confirm Cancel/Back without Save leaves the prior app protected; saving a new app releases the old one and shields ONLY the new selection during active protection. A failed save must preserve the prior app/hours and surface a clear error.
- Select 2 apps, a whole category, or a website in Apple's picker. The free app must reject these before enabling a monitor; no hidden multi-app unlock.
- Existing beta install with a customized protection start/end must preserve both values after upgrade; default its routine label to Evening if the new routine key is absent.

## Recovery, privacy and boundaries
- Permission denied/revoked, then reauthorized; app force-quit, device restart, offline mode; user switches timezones; DST transition via manual date/time adjustment only on a dedicated testing device. Test app background/foreground while window begins/ends.
- Stop/restart setup during active protection must require the same 120-second exception, except genuine iOS permission recovery. Account deletion must be reachable, should not strand selected apps shielded, and must actually remove remote account information when the backend is configured; test with sandbox account, never a real personal account.
- On a diagnostic device or via controlled native-failure injection, make `stopMonitoring` fail while its recurring schedule remains registered. Confirm Curfy does **not** discard opaque tokens/clock boundaries, the native extension still has BOTH start and end actions, and a previously earned 15-minute exception still has its automatic reblock monitor. Retry stop and confirm actions, monitors, and shields clear only after success.
- Simulate onboarding's initial iOS monitor registration succeeding followed by failure to persist an onboarding setting. Confirm Curfy attempts to stop that monitor before offering a retry; if native stop fails too, the user sees iOS Screen Time permission recovery guidance rather than being shown a false success.
- Onboard a Morning user and confirm NO 'bedtime approaching' notification at 5:50 a.m. Confirm Home's cutoff and stats don't claim to measure sleep, and no average bedtime is shown for a mixed Morning+Evening cohort.
- Check Dynamic Type/VoiceOver/Reduce Motion and an explicit accessibility alternative to the continuous hold; document emergency-access expectations (Curfy protects selected distracting apps, not emergency calls or the whole phone).
- After native cases pass: separately verify IAP sandbox purchase, Restore Purchases, cancellation/refunds, offline status, downgrade to one selected app, App Store privacy/support data and Family Controls distribution entitlements for **app and extensions**.
- **StoreKit build checks:** verify `CurfyStoreKit` local pod appears in CocoaPods/autolinking (not just TypeScript imports); check the signed app's In-App Purchase capability and configured product ID `com.alvinkwak.curfy.premium`. Fetch the localized price from Apple, not a UI constant.
- **Non-consumable sandbox matrix:** successful purchase changes verified current entitlement to owned; cancellation leaves free; Ask-to-Buy pending remains non-owned; app restart and offline refresh do not erase a surviving native shielding schedule; restore with same Apple Account re-detects entitlement; a different Apple Account with no purchase is free; refund/revocation no longer grants new multi-app changes. StoreKit/App Store errors must not delete configured shields.
- **Launch gate:** do not enable the Premium buy button until an uninterrupted 120-second hold can target one selected app, with independently scheduled 15-minute re-shielding while all other chosen apps remain blocked, verified on hardware.

- Verify that resuming Curfy or receiving an Apple StoreKit transaction update rechecks **verified current entitlements**; a cancelled/pending/invalid/refunded purchase must not authorize new multi-app configuration. Failed entitlement refresh must show unknown status without erasing a surviving native restriction. The purchase button stays hidden until the complete multi-app one-app-per-hold behavior is signed-device verified.

- **Private selected-app chooser:** on a signed iPhone with 2+ manually selected individual apps, verify the chosen native row displays the correct Apple app icon/name with VoiceOver, scrolls on a smaller phone, never exposes names/tokens to JS or network, detects a changed selected-app list and refuses to unlock a stale row. On iOS picker category promotion, show a recoverable selection error rather than presenting an unrelated app. The new native label module is *not yet exposed* in a shipping UI; these are future acceptance cases, not passed tests.

- **Scoped choice-ticket safety:** select app A in native chooser, then change the committed protected selection before completing a hold: the prepared ticket must refuse revalidation (never unlock B). Reject invalid row indices, category picker promotion, and expired choice tickets. Early release, cancel or background must not call any unshield method; native singleton selections used for actual reblocking must not be deleted before their monitor ends. Verify two sequential/overlapping 120-second holds for different protected apps independently, with separate ~15-minute re-shielding and after app termination; current code does NOT yet support this.

- **Independent Premium exception callback matrix (not yet implemented end-to-end):** Start two holds for different protected apps several minutes apart; check each gets a distinct monitor name, each native end callback re-shields only its own token, and a delayed daily start preserves only currently active exceptions. A stopMonitoring-triggered early end must never reblock a still-active exception; a callback after cutoff must not re-shield. A changed committed selection, corrupted ledger, invalid singleton, or revoked Screen Time authorization must never silently unlock an unselected app. Confirm behavior with Curfy force-quit/reboot and at a time-zone boundary. This is NOT verified by CI source assertions.

- **Per-app post-hold coordinator (currently internal-only):** signed iPhone must prove fresh verified ownership required, permission required, chosen native ticket still belongs to the committed app-only selection, and every completed hold unshields exactly one specific selected app. Check simultaneous app A/B exceptions, individual expiry, old group-wide exception conflict, monitor-start failure, swallowed block/unblock native errors, and independent group shield counts. DeviceActivity end callbacks depend on device use; record actual time-to-reblock instead of inventing exact wall-clock guarantees. All of these remain UNVERIFIED on hardware.

- **Premium foreground recovery (automated mocks passed, iPhone not tested):** allow app A's 15-minute exception to expire while B still has several minutes, then reopen Curfy. A must re-shield if the original protection window still runs; B must stay unshielded. Reopen again; no duplicate monitors or unexpected shield. At/after the original cutoff and after changing committed app selections, old tickets must NOT re-shield an unrelated app. Revoke Screen Time permission and confirm recovery defers without discarding native state. Inject failed shield/stop calls and confirm warning plus retry metadata survive; ensure the Free one-app hold still works unchanged.

## Evidence record (fill after actual testing)

| Case | Status | Observed build/iPhone/iOS | Repro/log/video |
| --- | --- | --- | --- |
| One-app shield with Curfy terminated | **NOT TESTED in latest build** | | |
| Swipe clocks on physical iPhone | **NOT TESTED** | | |
| Uninterrupted 120s / interrupted hold reset | **NOT TESTED in latest build** | | |
| Shielded app available for 15m, then re-shielded with Curfy closed | **NOT TESTED** | | |
| Native cutoff with Curfy closed | **NOT TESTED** | | |
| Evening / Morning / Both default + custom hours | **NOT TESTED** | | |
| Failed Settings save restores native schedule | **MOCKED only** | | |
| Failed native stop preserves start/end callbacks and earned 15-minute exception | **MOCKED only** | | |
| Local onboarding failure after native registration stops shielding or shows a recovery path | **Source-guarded only** | | |
| Permission/reboot/DST/timezone recovery | **NOT TESTED** | | |
| Account deletion with live backend | **NOT TESTED** | | |
| Sandbox Premium purchase and restore | **NOT IMPLEMENTED** | | |
| Signed Family Controls distribution entitlements | **UNKNOWN** | | |

## Actual launch blockers
- User-approved Premium product type/pricing/product IDs and an Apple-compliant purchase, restore and entitlement integration.
- For Premium with multiple protected apps: select **one app per 120-second hold** or unlock the **whole selected group**; no silent product decision. Current native unblock action operates on the whole selected token group.
- Signed on-device native completion of the above OS tests; accessibility alternative; valid distribution entitlement on the app and applicable extensions; live remote account deletion; privacy, support URL, branding, screenshots, TestFlight and App Review.

**Rollback:** Keep `main` untouched. Use draft PR #2 on `feat/ios-shield-from-august`; revert specific faulty commits rather than discarding the branch.
