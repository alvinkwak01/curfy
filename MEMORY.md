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
