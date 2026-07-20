# MEMORY.md — Session Log

Running log of what happened each session, in order. This is history — for current product/architecture truth, see `CONTEXT.md`. Don't edit past entries; append new ones.

---

## Session 1 — 2026-07-20 — Recovery audit & project reset

**Context:** Laptop crashed; this folder was recovered from disk. User wants to resume building toward App Store submission, working in vertical slices with `CONTEXT.md`/`MEMORY.md` keeping things on track.

**What we did:**
- Audited the full recovered folder. Confirmed `git log` shows a single "Initial commit" (raw `create-expo-app` template) and everything custom has sat as uncommitted working-tree changes since April.
- Identified that ~90% of the tree is untouched boilerplate; the only real product code is `app/onboarding/calibrate.tsx` (10s hold-still prototype), the home tab stub, and the Zustand store.
- Found and documented 5 concrete bugs (see `CONTEXT.md` §3): a case-collision between `constants/Colors.ts` (git) and `constants/colors.ts` (disk), dead tab-bar color logic, custom fonts referenced but never loaded (files don't even exist), onboarding not wired into root navigation, and the uncommitted-since-April state itself.
- Clarified the actual product concept with the user: it's a sleep + morning discipline app built around a 120-second hold-still mechanic during restricted windows, not a sleep-tracking app. The name "Hypnos" predates this concept and doesn't reflect it.
- Ran name availability checks:
  - "Lumi" — confirmed taken (per user).
  - "Kipply" — confirmed taken (live App Store app "Kipply: Swipe & Clean," a photo cleaner, + domain `kipplyapp.com`).
  - Checked ~14 other candidates. Nearly all short/cute invented words already have *some* App Store app using them — that's expected at ~2M+ apps and isn't a useful signal on its own. The real bar is: no same-category competitor, no obvious registered trademark. Landed on **"Stilla"** as working name (no same-category collision; unrelated apps only).
- User wants a design direction of "space background with blue moon," same font/color theme as current dark palette — hasn't shared the reference image yet.
- Wrote `CONTEXT.md` as the standing product/architecture spec, including a 7-slice roadmap (Slice 0: foundation repair → Slice 6: store readiness).

**Decisions made:** see `CONTEXT.md` §8 Decisions Log — not duplicating here.

**Not yet done / next session should pick up here:**
- Get user's sign-off on `CONTEXT.md` before touching any code.
- Slice 0 (foundation repair) has not started — no code has been changed yet, no commit made yet. The recovered working tree is still exactly as found.
- Need answer to the biggest open architectural question: OS-level lock vs. in-app soft lock (see `CONTEXT.md` §7.1) — this determines whether Expo alone is sufficient or native modules are needed. Should be resolved before Slice 1 design work.
- Need the design reference image.
- Need Apple Developer / Google Play account status.

---

## Session 2 — 2026-07-20 (same day) — DUSK recovered, Hypnos/Syndicate superseded, full rebuild from spec

**Context:** User committed the Session 1 baseline locally (commit `a7e7079`). Pushed back correctly on Session 1's process — questions were being asked one at a time without explaining jargon or laying out the full scope up front. Then shared 5 files by upload: a blue crescent-moon logo image, and 5 files pulled from an old email chain (self-sent from iCloud to a work address on 2026-05-14) — two "DUSK BLUEPRINT" PDFs (an exhaustive written spec for an app called DUSK, mascot "Lumi"), a "DUSK LOCKSCREEN EDIT" diff-style PDF, and two plain-text files that turned out to be real source code (`SleepContext.tsx`, `LockScreen.tsx`).

**Key discovery:** DUSK — not the "Hypnos/Syndicate" content already in this folder — is the project the user actually meant to send and wants rebuilt "as it was." DUSK is dated ~3 weeks after the Syndicate files (May 14 vs. April 24–26) and is a far more complete, deliberate spec: full color/font system, mascot personality, 28 rotating guilt messages across 4 escalating stages, milestone badges, notification copy, the works. The two recovered source files confirmed the architecture question from Session 1: it's an in-app soft lock (React Context + 30-second interval + AppState check + full-screen Modal), not OS-level.

**What we did:**
- User confirmed: DUSK supersedes Syndicate entirely; start bedtime-only (defer morning-lock mode).
- Rebuilt the full app from the blueprint spec this session: `constants/theme.ts`, `context/SleepContext.tsx` (recovered original, verbatim), `components/{StarBackground,HoldButton,Mascot,TimePicker,LockScreen,Btn}.tsx`, `app/onboarding.tsx` (all 5 steps), `app/(tabs)/index.tsx` (Home), `app/(tabs)/leaderboard.tsx`, `app/settings.tsx`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/+not-found.tsx`. Updated `app.json` (display name "DUSK", scheme `dusk`, dark splash, added `expo-notifications` plugin) and `package.json` (added `expo-notifications`, `react-native-svg`, `@expo-google-fonts/space-grotesk`; removed unused `zustand`/`@react-native-community/slider`).
- Mascot.tsx uses a **placeholder SVG owl** — the real `mascot.png` from the original build was never recovered.
- Old Syndicate-era files could not be deleted from this session (same sandbox/mount limitation that blocked git commit in Session 1 — file creation/edits work, deletion doesn't). They're listed in `CONTEXT.md` §3 and need a local `rm` pass.

**Not yet done / next session should pick up here:**
- **Nothing has been run yet.** This is untested code. First priority next session: run `npx expo install expo-notifications react-native-svg @expo-google-fonts/space-grotesk`, then actually launch it and fix whatever breaks.
- Ask user whether they found any more of the original DUSK code (another local folder, a cloud AI-builder account, more emails from the same May 14 thread) before investing more effort in the placeholder mascot — recovering the real `mascot.png` and any other original files would be strictly better than what's built now.
- Cleanup command to run locally (deletes now-orphaned Syndicate-era files):
  ```
  cd ~/Documents/Hypnos
  rm -f "app/(tabs)/two.tsx" app/modal.tsx app/onboarding/calibrate.tsx \
    components/ProgressBar.tsx components/EditScreenInfo.tsx components/Themed.tsx \
    components/StyledText.tsx components/ExternalLink.tsx \
    components/useColorScheme.ts components/useColorScheme.web.ts \
    components/useClientOnlyValue.ts components/useClientOnlyValue.web.ts \
    components/__tests__/StyledText-test.js constants/colors.ts constants/fonts.ts \
    store/useAppStore.ts
  rmdir components/__tests__ store app/onboarding 2>/dev/null
  git add -A && git commit -m "Rebuild DUSK from recovered blueprint; remove Syndicate-era files"
  ```
- Wire the blue-moon logo into `assets/images/icon.png` etc. once confirmed as final.
- Final public app name still open (see `CONTEXT.md` §5) — not blocking.
