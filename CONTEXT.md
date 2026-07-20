# CONTEXT.md — Project Spec & State

This file is the source of truth for what this app is and where it stands. Read it at the start of every work session before touching code. Update it whenever a product or architecture decision changes. Session-by-session progress/history lives in `MEMORY.md`, not here.

---

## 1. Product

**Name:** DUSK. No mascot character. Tagline: "Bedtime. For real."

**One-liner:** A bedtime-only phone lock. At your set bedtime, the phone locks behind a 120-second hold button that resets if you move or let go. The app guilt-trips you the whole time with escalating, increasingly unhinged commentary — no named character, just the app's voice. It tracks a nightly streak, rates each night (Flawless / Slipped once / Tried hard / Chaotic), and sends a morning "report card" notification.

**2026-07-20, later in the same session:** the user saw the app running and asked to remove the "Lumi" owl mascot entirely — both the visual character and the name/personality from all copy. This reverses a core piece of the original blueprint (the mascot was a named, deliberate part of the spec), so it's called out here explicitly: **do not reintroduce "Lumi" or a mascot character without the user asking for it.** `components/Mascot.tsx` still exists on disk but is now unused/orphaned everywhere — nothing imports it. It's on the cleanup list in `MEMORY.md`.

**This supersedes the earlier "Hypnos/Syndicate" direction** (amber palette, Fraunces/Jakarta fonts, "Enter the Syndicate" copy) that was sitting in this project folder. That was an earlier, abandoned experiment from April 2026. DUSK is a separate, later, far more fully-designed concept from May 2026 that the user explicitly wants back — see `MEMORY.md` Session 2 for how this was discovered.

**Scope right now: bedtime-only.** No morning-lock mode. The user confirmed (2026-07-20) to start with exactly what the original spec covers — lock from bedtime until a fixed 6:00 AM — and revisit a morning mode later as a separate addition, not bundled into this build.

**Platforms:** iOS + Android (Expo/React Native).

**Architecture (confirmed):** In-app soft lock. Not an OS-level/Screen Time lock. A React Context (`SleepContext`) checks every 30 seconds and on every app-foreground whether the current time is inside the bedtime window; if so, a full-screen Modal (`LockScreen`) renders over the whole app. This is bypassable by force-quitting the app — that's a known, accepted limitation of this architecture, not an oversight.

---

## 2. Where This Spec Came From

On 2026-07-20 the user uploaded 5 files recovered from email (sent from their iCloud address to their work address on 2026-05-14, evidently as a manual backup during an earlier build session with an AI coding tool):

- **"DUSK BLUEPRINT - TEXT.pdf"** (8 pages) + **"DUSK BLUEPRINT - TEXT 2.pdf"** (1 page) — an exhaustive written spec: every color, font, screen, animation, and piece of copy in the app. Treated as the ground-truth spec for this rebuild.
- **"DUSK SLEEP CONTEXT"** — real source code for `SleepContext.tsx` (state/logic). Dropped into this project verbatim at `context/SleepContext.tsx`.
- **"DUSK LOCKSCREEN"** — real source code for `LockScreen.tsx`. Dropped in verbatim at `components/LockScreen.tsx` (with one addition: a "Bedtime. For real." tagline line, per a later edit shown in the third PDF).
- **"DUSK LOCKSCREEN EDIT.pdf"** — a messy diff-style export showing one revision to `LockScreen.tsx`. Used only to confirm the tagline addition; not treated as clean source.

**The actual original DUSK codebase (onboarding screens, Home, Leaderboard, Settings, HoldButton, Mascot, StarBackground, and the mascot.png art asset) was never recovered.** The user doesn't know if it exists anywhere retrievable (another local folder, a cloud AI-builder account, etc.) — see Open Questions. Everything except the two files above was rebuilt from the text spec, not recovered.

---

## 3. Build Status (as of 2026-07-20, this session)

**Rebuilt and in place:**
- `constants/theme.ts` — full DUSK color + font tokens from the blueprint.
- `context/SleepContext.tsx` — recovered original, verbatim.
- `components/LockScreen.tsx` — recovered original, verbatim + tagline.
- `components/StarBackground.tsx` — rebuilt from spec (80 twinkling stars, sine-eased opacity, random delay/duration).
- `components/HoldButton.tsx` — rebuilt from spec: SVG progress ring, 120s hold, spring-back on early release, haptics, all 28 rotating guilt messages across the 4 escalating stages.
- `components/Mascot.tsx` — rebuilt from spec (breathe animation, glow, 3 moods) **but the owl art itself is a placeholder SVG, not the original mascot.png.** See Open Questions #2 — this needs either the recovered original asset or new art.
- `components/TimePicker.tsx` — rebuilt from spec, shared by onboarding and Settings.
- `app/onboarding.tsx` — all 5 steps rebuilt from spec (Wake Up Call, How It Works, Meet Lumi, Set Bedtime, Name), single screen with internal step state, slide transitions.
- `app/(tabs)/index.tsx` (Home) — rebuilt from spec.
- `app/(tabs)/leaderboard.tsx` (Sleep History) — rebuilt from spec.
- `app/settings.tsx` — rebuilt from spec.
- `app/_layout.tsx` — wraps app in `SleepProvider`, loads Space Grotesk, gates onboarding vs. main app, renders `LockScreen` as a Modal when locked.
- `app/(tabs)/_layout.tsx` — two tabs (Home, Leaderboard), dark-only.
- `app.json` — display name set to "DUSK", scheme `dusk`, dark splash background, `expo-notifications` plugin added. **`slug` deliberately left as `Hypnos`** — changing it affects EAS/Expo project identity, not something to change casually. Revisit when the public app name is finalized (see Open Questions #4).
- `package.json` — added `expo-notifications`, `react-native-svg`, `@expo-google-fonts/space-grotesk`. Removed `zustand` (superseded by the Context-based state from the recovered original) and `@react-native-community/slider` (unused template cruft). **Not yet installed** — needs `npx expo install expo-notifications react-native-svg @expo-google-fonts/space-grotesk` run locally so Expo resolves the exact compatible versions for SDK 54.

**Known gaps / not done:**
- Mascot art is a placeholder (see above).
- Old "Hypnos/Syndicate" files are still sitting on disk, unreferenced: `app/(tabs)/two.tsx`, `app/modal.tsx`, `app/onboarding/calibrate.tsx`, `components/ProgressBar.tsx`, `components/EditScreenInfo.tsx`, `components/Themed.tsx`, `components/StyledText.tsx`, `components/ExternalLink.tsx`, `components/useColorScheme.ts`/`.web.ts`, `components/useClientOnlyValue.ts`/`.web.ts`, `components/__tests__/StyledText-test.js`, `constants/colors.ts`, `constants/fonts.ts`, `store/useAppStore.ts`. These are harmless (nothing imports them) but should be deleted for cleanliness — the sandbox this was built in can create/edit files but can't delete them (same mount restriction as git). One cleanup pass locally will remove them; the exact command is in `MEMORY.md` Session 2.
- Nothing has been run yet. This has not been tested in an actual Expo Go / simulator session. Treat it as "should work, unverified" until it's actually launched once.
- No app icon/splash art beyond the original Expo defaults, other than the blue-moon logo the user shared (a strong candidate, not yet wired in as the actual icon file).
- Local notification behavior (10-min/2-min warnings, morning summary) is coded per spec but untested — notification permissions and exact-time daily triggers are exactly the kind of thing that behaves differently on a real device than in a simulator.

---

## 4. Design System (from the blueprint — do not deviate without updating this file)

Dark-only, no light mode. `backgroundColor: #080810` on every screen. Cards: `#0D0D1E` surface, `#1A1A35` 1px border, 18px radius, 20px padding. Buttons: 14px radius, 18px vertical padding. 24px horizontal screen padding.

| Token | Hex | Used for |
|---|---|---|
| Background | #080810 | every screen |
| Surface | #0D0D1E | cards, buttons, inputs |
| Border | #1A1A35 | all card/input borders |
| Primary Cyan | #00E5FF | streak numbers, CTAs, progress ring |
| Accent Violet | #7B2FFF | "Slipped once" rating, milestone badge |
| Text Primary | #E8E8FF | headings, main numbers |
| Text Muted | #5A5A8A | subtitles, labels |
| Text Ghost | #2A2A4A | disabled/fine print |
| Danger Red | #FF4466 | unlock counts, "Chaotic" rating |
| Warning Amber | #FFB800 | "Tried hard" rating |
| Success Green | #00FF9D | save confirmation, high clean rate |
| Orange | #FF6B35 | 30-night milestone |
| Gold | #FFD700 | 100-night Century milestone |

Font: Space Grotesk, 4 weights (400/500/600/700) via `@expo-google-fonts/space-grotesk`.

Full screen-by-screen spec (copy, layout, animation timing) lives in the original blueprint PDFs the user has by email — refer back to those for anything not captured here rather than guessing.

---

## 5. Naming

- "Lumi" (as an app name) — unavailable, taken.
- "Kipply" — unavailable. Live App Store app "Kipply: Swipe & Clean" + registered domain.
- "DUSK" as a public App Store name — likely **not** clear. Web search found an existing ResMed sleep product called "Dusk" and a separate "Dusk" AI sleep app already live. Using "DUSK" as the internal working name/mascot-adjacent branding is fine; using it as the literal App Store listing name is risky and probably needs a different public-facing name.
- This is not resolved and does not need to be resolved yet — it only matters at store-listing time (`app.json`'s `slug`, bundle identifiers, App Store Connect listing). Don't let it block engineering.

---

## 6. Roadmap (Vertical Slices)

| # | Slice | Goal | Status |
|---|-------|------|--------|
| 0 | Foundation repair | Commit recovered baseline, fix case-collision bug, resolve architecture (in-app lock, confirmed) | Done (baseline committed; case bug resolved by moving off the old filenames entirely) |
| 1 | DUSK rebuild from spec | Onboarding → Home → Leaderboard → Settings → Lock screen, all wired end-to-end per the recovered blueprint | Code written this session, **not yet run or tested** |
| 2 | First real run | Install dependencies, launch in Expo Go/simulator, fix whatever breaks on first boot (there will be something) | Not started |
| 3 | Mascot art | Replace placeholder SVG owl with real art (recovered original or newly generated) | Not started |
| 4 | Store readiness | Real icons/splash using the blue-moon logo, privacy policy, App Store Connect + Google Play Console setup, TestFlight | Not started |
| 5 | (Future, out of scope for now) Morning-lock mode | A second restricted window in the morning, on top of the bedtime lock | Not started, explicitly deferred |

---

## 7. Open Questions

1. **Does the real, original DUSK codebase exist anywhere retrievable?** (Another local folder on the crashed machine, a cloud AI app-builder account, a repo.) Not resolved — user wasn't sure. Worth a quick check (Spotlight search on the Mac for filenames like "SleepContext" or "HoldButton"; search the icloud.com email inbox around 2026-05-14 for more attachments — the ones already found look like they were sent mid-session, so more may exist in the same thread).
2. **Mascot art** — need either the recovered original `mascot.png` or a decision to commission/generate new owl art to replace the current placeholder.
3. **Final public app name** — not blocking, resolve before store submission.
4. **`app.json` slug/bundle identifier** — currently still "Hypnos", deliberately unchanged pending the naming decision.
5. Apple Developer Program / Google Play Console account status — still unknown.
6. The blue-moon logo the user shared — confirmed direction for app icon, not yet wired into `assets/images/`.

---

## 8. Decisions Log

- **2026-07-20** — Confirmed product concept, ruled out "Lumi"/"Kipply" names, explored alternatives (see `MEMORY.md` Session 1).
- **2026-07-20** — User clarified DUSK (not the "Hypnos/Syndicate" files) is the real project, recovered via email attachments. Superseding Syndicate entirely.
- **2026-07-20** — Scope: bedtime-only for now, morning-lock deferred.
- **2026-07-20** — Architecture confirmed as in-app soft lock (not OS-level), based on the recovered original `SleepContext.tsx`.
