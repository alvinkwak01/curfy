# CONTEXT.md — Project Spec & State

This file is the source of truth for what this app is and where it stands. Read it at the start of every work session before touching code. Update it whenever a product or architecture decision changes. Session-by-session progress/history lives in `MEMORY.md`, not here — this file should stay a clean current-state snapshot, not a changelog.

---

## 1. Product

**Working name:** Stilla (provisional — see Decisions Log. Not yet trademark-cleared.)

**One-liner:** A friction-based discipline app for bedtime and morning phone use. Instead of blocking apps or nagging, it forces the user to physically hold a button and stay completely motionless for 120 seconds before their phone unlocks during a restricted window. The mechanic is deliberately silly and mildly humiliating — the point is that doing it feels dumb enough that most people won't bother, and the ones who do are laughing at themselves the whole time.

**Core mechanic (as described by user, 2026-07-20):**
- User configures a restricted window: a bedtime lock (e.g. 11:30pm–7am) and/or a morning lock (e.g. first N minutes after wake).
- During the restricted window, using the phone requires holding a button and staying still (no movement of the device) for 120 seconds continuously.
- Any movement/release resets the timer to zero — same failure logic already prototyped in `app/onboarding/calibrate.tsx` (10s version).
- Gamification layer: streaks for successful restraint / successful holds, framed around "discipline" (existing code has `streak`, tab framed as "Syndicate," "DAYS OF DISCIPLINE").

**Explicitly NOT yet decided:**
- Whether the lock is a true OS-level screen lock (would require a native module / Screen Time API / Android equivalent — significant engineering lift) or an in-app soft lock (a full-screen overlay inside this app only, easy to build with Expo, but trivially bypassed by just... not opening the app, or force-quitting it). **This is the single biggest open technical question and should be resolved before Slice 1 is built.** See Open Questions.
- Exact schedule config UX (fixed times vs. sunset/wake-based vs. manual daily toggle).
- Whether morning lock and bedtime lock are the same mechanic/timer length or tuned differently.

**Platforms:** iOS + Android (via Expo/React Native — already the stack in place).

---

## 2. Tech Stack (as inherited from recovered project)

- Expo Router (`~6.0.23`), React Native `0.81.5`, React `19.1.0`
- Zustand `5.0.12` + AsyncStorage for persisted state (`store/useAppStore.ts`)
- TypeScript, typed routes enabled
- No backend/API yet. No auth. No analytics. No push notifications wired up (will be required for a lock-schedule app).
- No testing setup beyond the default Expo template's one snapshot test.

---

## 3. Current State of the Recovered Code (audited 2026-07-20)

Bottom line: **this is closer to a fresh scaffold than a partially-built app.** Roughly 90% of the file tree is the untouched `create-expo-app` starter template. Custom work amounts to three files' worth of product logic.

**What's actually custom / real:**
- `app/onboarding/calibrate.tsx` — a 10-second hold-still gesture screen. This is the prototype of the core mechanic, but hardcoded to 10s and to onboarding only (not reusable as the recurring lock screen yet).
- `app/(tabs)/index.tsx` — home screen stub showing a streak counter and a name. No real data behind "Next Lock: 11:30 PM" (hardcoded string).
- `store/useAppStore.ts` — `name`, `isCalibrated`, `streak`, `lastHoldDate`. No schedule/settings state yet, no lock-history data.
- `components/Btn.tsx`, `components/ProgressBar.tsx` — small reusable UI atoms, fine to keep.
- `constants/colors.ts` / `constants/fonts.ts` — dark palette (amber accent, black bg) and font name constants for Fraunces + Plus Jakarta Sans.

**Everything else** (`app/(tabs)/two.tsx`, `app/modal.tsx`, `components/Themed.tsx`, `components/EditScreenInfo.tsx`, `useColorScheme*`, `__tests__/StyledText-test.js`) is default Expo Router boilerplate, never touched. It should be deleted once the real navigation structure replaces it, not built around.

**Known bugs / landmines found in the audit (unfixed as of this writing):**

1. **Case-collision file bug:** git tracks `constants/Colors.ts` (capital, original template file). The working tree now has `constants/colors.ts` (lowercase, the real dark-palette file) instead. These resolved to the same file on macOS's case-insensitive filesystem, masking the fact that git's index is out of sync with disk. This will break the first time the project is built on a case-sensitive filesystem (e.g. EAS Build's Linux runners) — `@/constants/colors` imports will fail to resolve. **Must fix before first EAS build.**
2. **Dead tab-bar color logic:** `app/(tabs)/_layout.tsx` still calls `Colors[colorScheme ?? 'light'].tint`, but the custom `colors.ts` has no `light`/`dark`/`tint` structure (it's a flat dark-only palette). This silently does nothing right now.
3. **Fonts referenced but never loaded:** `Fonts.frauncesBold`, `Fonts.jakarta`, etc. are used throughout custom screens, but `app/_layout.tsx`'s `useFonts()` call only loads `SpaceMono` + FontAwesome icons. The actual Fraunces/Plus Jakarta Sans `.ttf` files don't exist in `assets/fonts/` at all. Text is silently falling back to system font everywhere right now — this has probably been invisible because it doesn't crash, it just doesn't look like the intended design.
4. **Onboarding is unreachable:** `app/_layout.tsx` always routes straight to `(tabs)`. There is no first-run check (`isCalibrated`, or any "has this user completed onboarding" gate), so `/onboarding/calibrate` is dead code from the app's perspective — you'd have to manually type the URL to see it.
5. **Uncommitted work sitting dirty since April:** `git log` shows exactly one commit ("Initial commit," the raw template). Everything described above as "custom" has never been committed — it's been sitting as uncommitted working-tree changes this whole time. That's how it survived the crash at all (recovered from disk, not git), but it means there is no history, no rollback point, and no diff record of what changed. **First real action of Slice 0 should be committing this recovered state as a baseline**, so from here on there's an actual safety net.

---

## 4. Design Direction

- Dark theme, black background, current accent color is amber/gold (`#C8943A`). User's new direction: **space background with a blue moon**, matching "our app theme" font/colors — needs reconciling: does the accent shift toward blue, or does blue apply only to the moon/background art while amber stays the UI accent? **Open question, needs the reference image.**
- Fonts: Fraunces (serif, headlines) + Plus Jakarta Sans (sans, body/UI). Chosen already, just not wired up (see bug #3 above).
- User has a visual reference in mind ("I think I have an example") — not yet shared. Needed before any visual/UI slice starts.

---

## 5. Naming

- "Lumi" — unavailable (taken).
- "Kipply" — unavailable. Live App Store app "Kipply: Swipe & Clean" (photo cleaner) + registered domain `kipplyapp.com`. Reusing risks App Store rejection and/or trademark dispute, not just a naming coincidence.
- Current working name: **Stilla** (evokes "stillness" — the core mechanic — and reads close to "Stella"/star, which fits a space/moon visual theme). No same-category (sleep/discipline/screen-time) App Store app found using this name; existing "Stilla" apps are in unrelated categories (skincare, hair salon, a motion-capture device), which is a low confusion/legal-risk profile.
- **This is a web-search-based check only, not a real trademark clearance.** A proper USPTO / trademark search (and equivalent in any other market being targeted) should happen before final commitment, and definitely before App Store submission. Web search cannot tell you if a name is legally clear — only whether an identical live app already exists.
- Naming is not blocking engineering. Every reference to the app name in code/config can be renamed in minutes; this is intentionally not being treated as a gate on Slice 0/1 work.

---

## 6. Roadmap (Vertical Slices)

Each slice should ship something a user could actually experience end-to-end, not a layer (e.g. "backend" or "UI polish"). Status updated here as slices complete; details of what happened in each session go in `MEMORY.md`.

| # | Slice | Goal | Status |
|---|-------|------|--------|
| 0 | Foundation repair | Commit recovered baseline, fix case-collision bug, load real fonts, fix/remove dead color logic, decide OS-lock vs in-app-lock architecture | Not started |
| 1 | Onboarding → Home, wired end-to-end | Name entry → schedule setup → calibration demo → lands on home tab; onboarding gate actually works on first run | Not started |
| 2 | Real lock mechanic | Replace hardcoded 10s/"Next Lock: 11:30 PM" with actual configurable schedule + working restricted-window enforcement | Not started |
| 3 | Visual identity | Space/blue-moon background, full color system, fonts rendering correctly on both platforms | Not started |
| 4 | Streak/gamification | Persisted lock history, real streak logic, "Syndicate" framing fleshed out | Not started |
| 5 | Notifications | Local notifications for upcoming lock windows, wake reminders | Not started |
| 6 | Store readiness | Real icons/splash, privacy policy, App Store Connect + Google Play Console setup, TestFlight/internal testing build | Not started |

---

## 7. Open Questions (need answers before relevant slice starts)

1. **OS-level lock vs. in-app soft lock** — determines whether this is buildable in Expo alone or needs native modules / a dev-client / possibly Screen Time API (iOS) or Android's equivalent. Blocks Slice 1/2 architecture.
2. Design reference image — not yet shared.
3. Final app name confirmation + real trademark check.
4. Apple Developer Program account status — do you have one already? (Required for TestFlight/App Store; $99/yr.)
5. Google Play Console account status — do you have one already? ($25 one-time.)
6. Exact schedule UX (fixed clock times vs. dynamic/sunset-based vs. manual per-day toggle).

---

## 8. Decisions Log

- **2026-07-20** — Confirmed product concept: sleep + morning discipline app, core mechanic is a 120-second hold-still challenge during restricted windows. (Not a sleep-tracking app.)
- **2026-07-20** — Platform target: iOS + Android.
- **2026-07-20** — "Lumi" and "Kipply" ruled out (both taken). Working name set to "Stilla," provisional.
- **2026-07-20** — Design direction: space background + blue moon, reference image pending.
