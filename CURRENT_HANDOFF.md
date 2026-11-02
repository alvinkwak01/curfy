# Curfy — CURRENT HANDOFF (read this first)

**Updated:** 2026-11-02. **This is the short, canonical starting point for a new chat.** Consult `CURRENT_STATE.md` and `IOS_DEVICE_ACCEPTANCE.md` for chronological evidence and detailed historical test scenarios, but do not blindly follow their older, conflicting onboarding descriptions. Verify the live branch and CI before acting.

## Where to resume
- Repository: `alvinkwak01/curfy`.
- Active work: **draft PR #2**, https://github.com/alvinkwak01/curfy/pull/2, branch `feat/ios-shield-from-august`; base `backup/local-curfy-august`; **do not merge into main** until release gates are satisfied.
- Starting code checkpoint: `146b8bbc7d4da9c85378ad67ae35ab1c9c00a512` (2026-11-02). Re-fetch live HEAD; it may have progressed.
- Starting CI: https://github.com/alvinkwak01/curfy/actions/runs/41533865411 succeeded on that code: **206/206 Node tests**, TypeScript, **18/18 Expo Doctor**, lockfile, Expo iOS prebuild, and both local module autolinking checks. **The ios-native-compile job was SKIPPED.** None of these checks is signed iPhone evidence.
- The native Swift compile is the immediate prerequisite; the workflow `.github/workflows/curfy-checks.yml` only opts into macOS compilation on a `pull_request` event while the PR title includes `[native-ci]`. Do not mistake a skipped job for a pass. After the run, remove `[native-ci]` from the title to avoid repeat macOS costs.

## Approved product decisions (newer than 2026-10-22 baseline)
- iPhone/iOS first. **Actually shield the chosen apps using Apple Screen Time**, independent of Curfy being foregrounded. Do not describe Curfy as locking the whole phone or causing/measuring sleep.
- **Free:** exactly one explicitly selected app. **Premium:** multiple explicitly selected apps, no entire categories or websites at launch.
- **Premium pricing:** **$5.99 USD once, non-consumable**, no subscription/trial/account prerequisite. Product identifier `com.alvinkwak.curfy.premium` is proposed, **not confirmed configured in App Store Connect**.
- Every unlock requires the original uninterrupted **120-second hold**, releasing early resets. Premium selects exactly **one** protected app per hold; the other apps remain shielded. Exception lasts **up to 15 minutes**, capped by the original protection-window end. No automatic third-party app launch promised.
- User selects exact protection start **and** end times; one continuous native schedule. **Current approved onboarding = branded Welcome + nine setup steps, 10 screens total.** Preserve original dramatic/space branding and UX moments, but **no Evening/Morning/Both selector or separate current-habit clock question**. Prior five-screen, 13-step, routine-mode, fixed-6-a.m. descriptions are superseded. Do not reintroduce them.
- Native iOS shield can't host Curfy's React Native 120-second ring; truthful supported route is manually opening Curfy from Home and performing the hold there.

## Code that exists, and honest boundaries
- `lib/screenTime.ts`, `context/SleepContext.tsx`, iOS DeviceActivity/ManagedSettings extensions, `components/HoldButton.tsx`, `app/escape.tsx` implement the Free architecture. The latest patch avoids foreground re-shielding when the recurring native monitor is missing, to avoid leaving users stranded after the end time. **Automated mock-native test coverage is not physical-device proof.**
- `lib/pickerSettlement.ts` + `app/onboarding.tsx` address a native picker dismissal/save race, while retaining the exactly-one-app Free gate. **One-app Apple picker acceptance still failed on the previous installed preview and the fix has NOT been retested on an iPhone.**
- Screen Time permission state now handles a short `notDetermined` transition after authorization; unverified on device.
- `modules/curfy-storekit`, `modules/curfy-protected-apps`, `lib/premiumAppException.ts` and `lib/premiumExceptionRecovery.ts` contain dormant Premium foundations with verified-transaction ownership, private native labels/tickets, and independent app-exception recovery. **Multi-app UI, purchase checkout, and Premium feature activation remain OFF.** No signed StoreKit sandbox purchase/restore test.
- Previous iPhone QA found: incorrect shortened onboarding, TimePicker wheel scrolling the page, and selecting one app then receiving a rejection. The first two have source fixes; neither the revised UI nor the picker fix has passed new iPhone QA.

## Next smallest steps — in this order
1. **Get a clean unsigned macOS Xcode compilation of the CURRENT HEAD and every native extension.** Inspect actual GitHub Actions `ios-native-compile` outcome; fix real Swift compiler errors in small patches. Automated tests/Expo prebuild should stay green. Do not spend an EAS credit merely to discover compilation errors.
2. Once native compiles, complete a targeted code review of the Free onboarding → native schedule → 120-second hold → exact-15-minute native re-shield → cutoff paths. Keep scope tight; no cosmetic redesign or Premium activation.
3. Batch one signed **EAS preview build** only when code is ready, to be installed and tested on the user's physical iPhone. Previous preview `78de5ac0-91d1-4ad9-ad10-fd82f86f925c` FAILED Swift compile on older code; new source target is iOS 15.2. Confirm actual signing/entitlements on signed targets.
4. User's physical-iPhone acceptance: 10-screen UI order/clock drag, Apple picker Done → immediate Continue with exactly one individual app, scheduled shield while Curfy is closed, unrelated apps untouched, 119-second release reset, continuous 120-second hold, up-to-15-minute access/reblock while closed, cutoff release, denied/revoked permission, restarts and restart/setup reset. Record actual pass/fail, iOS/build/commit.
5. Only after Free device gates are proven, finish per-app Premium chooser/configuration and sandbox $5.99 one-time purchase/restore, distribution Family Controls entitlement verification, accessibility and App Store release checks.

## Continuity rules
- Preserve approved decisions, but prioritize verified CURRENT code and current CI over older prose. Treat historical entries in `CURRENT_STATE.md`, `PREMIUM_IMPLEMENTATION.md`, `IOS_DEVICE_ACCEPTANCE.md`, and the uploaded October project documents as a change log, **not automatically current requirements**.
- After each substantive milestone, update **this** short handoff with branch/commit, actual commands/tests and outcomes, open device/release blockers, and exact next action. Link it near the top of longer logs.
- Propose a **new chat before context becomes unwieldy** (e.g. after a major build/test milestone, or roughly 10–15 substantive exchanges); cannot observe exact chat storage. Make the handoff self-sufficient so the user never needs to recopy old conversations.
- Never claim a compiled, signed, approved or functioning iPhone build without evidence. Do not start background work, EAS builds, or paid services silently. No `main` merge.