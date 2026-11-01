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

**Evidence:** reviewed current branch source, exact dependency `kingstinct/react-native-device-activity` v0.6.1 API/types/Swift implementation, Apple DeviceActivity minimum-15-minute rule and deferred-on-device-use callbacks. GitHub Actions CI run `41183596596` for code/test commit `257c9b4` **passed**: all 11 unit tests and `npx tsc --noEmit`. This is automated/mocked proof, NOT an iPhone or Swift native build. Added explicit same-time/malformed bedtime handling to prevent a Home render crash. The mock tests do NOT simulate real Screen Time callbacks, signing, force-quit behavior, or actual installed app shielding. **No EAS build triggered.**

## Milestone: physical-iPhone shield proof and honest iOS 18 fallback (2026-10-31)

**User-observed / physically evidenced:** A selected distracting app showed Apple's native **"Blocked by Curfy"** shield while Curfy Home remained accessible (screenshots IMG_7413/IMG_7416). The native shield's **"Open Curfy" button failed**, closing the blocked app without launching Curfy. Home incorrectly displayed **"App blocking needs attention"** at 23:01 with a configured 22:03 bedtime, while a real shield was present; countdown misleadingly read 24h 1m to bedtime.

**Root cause verified in code and official Apple APIs:** `lib/screenTime.ts` configured the third-party library's `openApp` action; its Swift implementation calls `NSExtensionContext.open("device-activity://")` and then responds with `.close`. Apple does not support launching the parent application from this shield extension on the user's iOS 18 version. The old Home signal used a selected-token intersection which can be zero for an actual category shield. Home's countdown always targeted the *next* bedtime even during tonight's blocking window.

**Corrective code commits on feature branch, not main:**
- `lib/screenTime.ts`: branded, static Apple shield UI with moon icon and truthful "For a 2-minute hold to unlock, open Curfy from your Home Screen." The button now says **"Not now"** and only closes the blocked app, not a false "Open Curfy" promise. Reusable `refreshBedtimeShieldAppearance()` updates persisted native shield configuration on existing installs without restarting monitoring.
- `context/SleepContext.tsx`: refresh persisted shield UI after hydration for users updating an already installed preview.
- `app/(tabs)/index.tsx`: during the configured bedtime window show bedtime status rather than "24h until bedtime"; only show a setup warning for actual missing Screen Time authorization or selection. A native ManagedSettingsStore shield, not the unreliable per-selection intersection alone, establishes the positive active-shield status. A conspicuous, labeled **Start 120-second hold** action opens the existing Curfy ring screen.
- `app/onboarding.tsx`: copy and shield mock preview now show the *actual* two-environment path, no impossible hold button inside Apple's system shield.
- Native exception code: accepts a native active shield for category-token false-negative cases and verifies a true reduction in shielding before counting an unlock; recovery likewise clears its exception if the global native shield is restored.
- Added automated unit cases for category intersection false-negative, migration of saved shield configuration, and no false unlocking.

**Unverified:** These *new* fixes are only on GitHub, not in the user's installed preview. iOS Swift build/real-device end-to-end 120s unlock and 15-minute re-shield still need a new consolidated iPhone build. An astronaut animation is deferred until P0 escape/reblock proof. No new EAS build triggered.

## Milestone: in-app escape screen polish and honest exit (2026-10-31)

**Implemented in GitHub branch (not yet visually or device tested):** At the user's request, made the in-Curfy 120-second hold a dedicated, visually polished space screen. The iOS shield remains a separate, simple native screen; this does not introduce unsupported shield-to-app launching.

- `components/LockScreen.tsx`: redesigned the dedicated hold screen with a clear Curfy header, restrained space/orbit styling, deliberate choice copy, larger hero ring, explicit top-right **Exit** and full-width **Back to Home** button. Both are independent of `unlockScreen()` and have accessibility labels. Exiting never changes iOS restrictions or the unlock count. The existing 120-second uninterrupted hold still calls the native exception only after completing. The preview screen is explicitly non-unlocking.
- `components/HoldButton.tsx`: enlarged ring/center target and clarified seconds-remaining/press instructions; pending native request shows a spinner, disables extra holds, and failure remains visible; early release/background/unmount cancels the full hold. Ring duration remains 120000 ms.
- `app/escape.tsx`: routes **Exit** to Curfy Home rather than a tiny overlay close button. `app/preview-lock.tsx`: closes back to Settings, same new screen but no actual unlock.
- **Verified by GitHub Actions on final UI-code commit `e0a28b5`**: all 18 existing unit cases and `npx tsc --noEmit` passed (workflow run `41280946296`). Scroll gestures are disabled while the hold is active to prevent an inadvertent scroll cancellation. No Xcode/native build or physical-phone visual/interaction test was run; older installed iPhone app does NOT contain this UI.
- No new astronaut asset, mascot, premium mode, feature or animation was added. Existing twinkling stars and restrained orbit decoration preserve the current brand without shipping optional polish ahead of critical functionality.
- User must verify on iPhone: ring visibility/sizing on iPhone 13, Exit during an incomplete hold (without granting access), preview never unblocks, continuous 120s → iOS unshield → 15m re-shield with Curfy closed, and accessible alternative for users unable to maintain a long press. The native iOS 18 shield cannot host the React Native ring, so manual launch of Curfy remains the tested journey.

## Pre-build gate passed — no cloud build used (2026-10-31/11-01)

User correctly requested preflight before spending an EAS build. The repo's `package-lock.json` still contained Expo dev-client v57.0.10 and `^57.0.10` at root, despite the app using Expo SDK 54 and `expo-dev-client ~6.0.21`. Existing CI ran `npm install` rather than catching lockfile drift.

**Changed on feature branch only:**
- `package.json`: align Expo patch declarations with Expo Doctor: `expo ~54.0.37`, `expo-constants ~18.0.14`.
- `package-lock.json`: regenerated using the exact diff produced by the project's GitHub Actions `npm install` on Node 22; verified all 36 unified diff hunks against old contents, JSON parsing, and installed versions (`expo 54.0.38`, `expo-dev-client 6.0.21`, `expo-constants 18.0.14`). Committed the dependency lockfile to GitHub without user Mac intervention.
- `.github/workflows/curfy-checks.yml`: enforce `npx expo-doctor`, `git diff --exit-code -- package-lock.json`, and `npx expo prebuild --platform ios --no-install` in addition to unit tests and TypeScript. The generated iOS project isn't checked in.

**Verified by test, full CI**: Workflow `41281583164` (commit `7b10caa`) passed **all 18 unit cases**, TypeScript, Expo Doctor, clean lockfile, and native project generation (Expo prebuild) on GitHub Linux runner. **NOT verified:** Xcode Swift compilation, signing, installed latest preview, 120-second long-press on device, iOS native selected-app unshield or return to shield after the 15-minute exception. The previous user screenshot proved native shielding on an earlier preview only.

**Decision:** No more speculative feature or polish work before next targeted real-device verification. Using EAS preview for the native cycle is now justified. Build on the Mac from the latest feature branch with `npx eas-cli build --platform ios --profile preview`, then install the QR-based internal distribution. Record exact build SHA and physical iPhone results; never claim launch-ready from CI alone. No paid EAS cloud build was triggered by these corrections.

## Milestone: core native reliability before another iPhone build (2026-10-31/11-01)

**Changed on draft PR #2, no new EAS build.** In response to the user's concern about spending on incomplete features, this slice fixes concrete reliability risks rather than adding UI.

- **App selection/schedule reconciliation** (`lib/screenTime.ts`): `configureBedtimeBlocking` now registers an actual native monitor first and reads back its registration from the library's public `getActivities()`. On success, it clears Curfy's own accumulated blocklist and reapplies only the current selection during an active bedtime window. This prevents old previously selected apps remaining shielded after Settings changes. It persists the last successfully scheduled selection ID in shared native UserDefaults. On monitoring failure, existing blocklist is retained and previous callback selection restored where known. Outside bedtime, stale blocks are cleared. Deliberate scope: Curfy currently owns this entire managed-settings blocklist, so `resetBlocks` does not affect unrelated apps' stores; do not silently add unrelated blocking modes to this store.
- **Native iOS callback guard** (`targets/ActivityMonitorExtension/DeviceActivityMonitorExtension.swift`): delayed `curfy-bedtime` interval-start events do not override an unexpired 15-minute exception. Reads shared numeric timestamps using `NSNumber` bridging. An expired exception still allows normal shielding.
- **True continuous native hold** (`components/HoldButton.tsx`, `app/_layout.tsx`): existing native `react-native-gesture-handler` long-press recognizer with `minDuration(120000)` is authoritative. `setInterval` updates the UI countdown only and cannot call `onUnlock` by itself. The gesture fails upon early release, movement outside the button or cancellation; app background still invalidates the hold. Added GestureHandlerRootView. Important: iOS touch cancellation, delayed callbacks, native re-shield and accessibility still need physical-device proof.
- **Fail closed if iOS silently fails registration:** `configureBedtimeBlocking` and `grantBedtimeException` read back the native monitor name from `getActivities()` after `startMonitoring`. If not present, they reject without unshielding or falsely claiming saved protection.
- **Tests:** expanded `tests/screenTimeException.test.cjs` with previous/new selection ordering, failed scheduling preserving shields, outside-window cleanup, missing monitor registration prevention, and stop cleanup. `configureBedtimeBlocking` supports an optional injected `now` for deterministic calendar tests. Earlier 18 cases expanded to 24 total (including bedtime-window tests). See GitHub Actions result for current commit; these tests mock native bridge and **do not prove Swift compiled or physical iOS**.
- **Verified API facts:** Apple documents minimum 15-minute DeviceActivity interval and that interval callbacks can be delivered on subsequent device use. The installed `react-native-device-activity` v0.6.1 JS wrapper exposes `getActivities()` (not the internal Swift `activities()` symbol). An intermediate CI type error using the Swift symbol was caught and corrected. No native device build or Apple entitlement test was performed.

**Next smallest gate:** confirm full green GitHub checks, then a local Mac Xcode dev build (`npx expo run:ios --device`, if signing configured), or one intentional EAS iPhone preview if local build not feasible. Do not call native hold, unblock, automatic return or reboot behavior complete until a real iPhone demonstrates it. Explicitly note that StoreKit, premium enforcement and the agreed 6:00 a.m. default remain separate release gates.

## Known P0 gaps

1. **Real-device proof:** user has provided screenshot of Apple's native "Blocked by Curfy" shield on selected app. Still verify app isolation, Curfy not foregrounded, permission denial, schedule start/end, and whether the *latest branch* retains native blocking.
2. **Shield escape path:** user confirmed the third-party `openApp` shield action does NOT open Curfy on iOS 18. Do not retry unsupported extension launch tricks. Current code presents an honest close action, plus manual Curfy Home → 120-second ring; needs actual test. Reassess supported system `openParentalControlsApp` only for applicable newer iOS SDK/OS, never as an iOS 18 promise.
3. **15-minute exception:** now implemented against the real device activity library, with a new native one-shot monitor and Swift guard, but **not yet built or verified on physical iPhone**. DeviceActivity callbacks can be delayed until the device is used; verify exact timing and error cases. Repeated trials, force-quits, reboot, DST and wake boundaries remain essential.
4. **Schedule switching/clock:** changing the selected preset may leave old managed shields; reconcile native state when switching selections and changing windows. Test DST, timezone, reboot, permission revocation.
5. **Product gate:** current UI's three presets and editable wake time do not yet enforce the approved 'one free app / multi premium' and 6:00 a.m. default; resolve before release.
6. **Shipping gates:** pricing and StoreKit, entitlement validation in distribution, truthful privacy/App Store claims, unsupported sleep statistics, account deletion, full QA.

## Next smallest action

After fresh GitHub unit/TypeScript CI is green, pull the branch and make ONE batched iPhone preview build. Launch Curfy once after install to refresh the shared native shield UI. Confirm the blocked app's shield now says "Not now" and instructs manual Curfy access; Home shows an accurate bedtime state and **Start 120-second hold** action. Tap it to enter the existing circular ring screen, hold without interruption for 120s, confirm real temporary access, close Curfy, and verify restrictions return after the 15-minute exception. Verify an early-released hold resets and the scheduled wake boundary unblocks again. No EAS builds were used for code/test fixes.

## Decisions and rollback

No new product decision was made in this engineering slice. Code commits were made only on the development branch. Reverting the three scheduler-related commits restores the previous code, including its known failure-suppression and callback ordering risks.
