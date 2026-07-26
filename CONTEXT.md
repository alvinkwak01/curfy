# CONTEXT.md — Project Spec & State

This file is the source of truth for what this app is and where it stands. Read it at the start of every work session before touching code. Update it whenever a product or architecture decision changes. Session-by-session progress/history lives in `MEMORY.md`, not here.

---

## 1. Product

**Name:** Curfy (public/App Store name, decided 2026-07-20 — see §5 Naming). No mascot character. Tagline: "Bedtime. For real." **"DUSK" is the internal/historical codename** — it's the name of the original recovered blueprint documents and is still used throughout this codebase's comments, `CONTEXT.md`/`MEMORY.md` history, and design-system provenance notes. Those historical references are accurate and were deliberately left alone. All user-facing text (wordmark, `app.json` name/slug/scheme, in-app copy) has been updated to Curfy — see §5 for the full list of what changed.

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
- `components/Mascot.tsx` — **stale entry, moot.** The mascot was removed entirely later the same session (see §1, Decisions Log) — this file is orphaned, nothing imports it, and no mascot art is needed since there's no mascot. On the cleanup list to delete, not on a list to source better art for.
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

### Voice & Tone (revised 2026-07-20 — this supersedes the original blueprint's copy register)

No mascot, no named character (see §1). The app's copy still has a personality: **a competent friend who's visibly unimpressed, not a generic assistant.** Three registers, used situationally, not as separate "modes":

1. **Default: dry, passive-aggressive, understated.** Judgment implied, never stated outright. Favor rhetorical questions and trailing ellipses over direct insults. ("Are you sure about this?" / "You look ridiculous right now..." / "That's a choice.")
2. **Escalation: direct commands, no hedging.** Used when the moment calls for real urgency (deep into a hold-button escape attempt, the 2-minute-to-bedtime notification). ("GO TO SLEEP!" / "Let's see some discipline." / "Enough.")
3. **Earned warmth: genuine, not sarcastic.** Used only when the user has actually done well (good streaks, clean nights, milestones). The sincerity lands harder because the default register isn't nice. ("One night down. Let's make it two." / "Okay. I see you.")

Explicitly rejected: a user-selectable tone/persona picker (aggressive / insulting / playful / passive-aggressive / etc.). Reasoning discussed with the user — a single committed voice is a stronger, more memorable product than a customizable one, and building multiple parallel copy sets multiplies writing/maintenance cost for a feature with no validated demand yet. If real usage data later shows the tone is costing retention (bad reviews, uninstalls citing meanness), the cheap fix is a two-way soft/savage toggle, not a full persona system — revisit then, not now.

This voice applies to: hold-button guilt messages (`components/HoldButton.tsx`), lock-screen streak messages (`components/LockScreen.tsx`), Home screen mood messages (`app/(tabs)/index.tsx`), and all notification copy (`context/SleepContext.tsx`). Keep new copy consistent with this register rather than drifting back to the original blueprint's more purely sarcastic/roast-y tone.

---

## 5. Naming

**Decided, 2026-07-20: the public/App Store name is "Curfy."** Chosen after "Lumi," "Kipply," and "DUSK" were all ruled out (see history below), plus a further round where "Drowsi" was picked, then reversed the same session after a closer search surfaced real collision risk (see below). Applied everywhere user-facing: `app.json` (`name: "Curfy"`, `slug: "curfy"`, `scheme: "curfy"`), the wordmark on the welcome screen (`app/onboarding.tsx`) and lock screen (`components/LockScreen.tsx`), the bedtime hint copy in `app/settings.tsx`, and the console warning tag in `lib/supabase.ts`. "DUSK" remains correct and untouched as the historical/internal codename in comments and doc history (see §1) — that's intentional, not leftover cruft.

**How it was checked:** web search for exact-name App Store/Google Play listings, trademark mentions, and domain registration — run per-candidate individually, since combining multiple candidate names into one search query was found to dilute/hide real collisions (this happened once with "Drowsi," caught and corrected the same session). This is a reasonable first pass, not a substitute for the two authoritative checks before final commitment: a live search in the App Store app itself, and a real USPTO trademark search at tmsearch.uspto.gov. Neither has been done yet — worth doing before store submission, not urgent now.

**Naming history, ruled out in order:**
- "Lumi" — unavailable, taken.
- "Kipply" — unavailable. Live App Store app "Kipply: Swipe & Clean" + registered domain.
- "DUSK" as a public App Store name — likely not clear. An existing ResMed sleep product called "Dusk" and a separate "Dusk" AI sleep app are already live.
- "Drowsi" — initially looked clear, but a focused follow-up search found real risk: "Drowsie" is a live, near-identical commercial sleep product (pillow speaker company), and "Drowsy" (phonetically identical) has two separate registered trademark holders in sleep-related goods (sleep masks/pillowcases; sleep-disorder assessment software) plus two live apps ("Drowsy - Dream Journal," "Drowsy Driving Alert"). Reversed same session before any code changed.
- Also checked and ruled out for exact-name collisions in this session's broader brainstorm: Snoozle, Nooka, Tuckly, Lully, Hushly, Loomy, Quilo, Nima, Dimly, Fenn, Snuggo, Yona, Wimble, Snorby, Fidge, Zumo, Bimble, Wynd, Nestly, Nokk, Quenzy, Vellby, Wrenly, Mynn, Tillo.
- Confirmed clean but not chosen: Noddi, Wisply, Dozle, Snoozby, Puffn, Wynne, Fira — logged here in case Curfy needs a fallback later.

---

## 6. Roadmap (Vertical Slices)

| # | Slice | Goal | Status |
|---|-------|------|--------|
| 0 | Foundation repair | Commit recovered baseline, fix case-collision bug, resolve architecture (in-app lock, confirmed) | Done (baseline committed; case bug resolved by moving off the old filenames entirely) |
| 1 | DUSK rebuild from spec | Onboarding → Home → Leaderboard → Settings → Lock screen, all wired end-to-end per the recovered blueprint | Code written this session, **not yet run or tested** |
| 2 | First real run | Install dependencies, launch in Expo Go/simulator, fix whatever breaks on first boot (there will be something) | Not started |
| 3 | ~~Mascot art~~ | N/A — mascot removed entirely per user decision (see §1, Decisions Log). `components/Mascot.tsx` just needs deleting as cleanup, not replacing. | Moot |
| 4 | Store readiness | Real icons/splash using the blue-moon logo, privacy policy, App Store Connect + Google Play Console setup, TestFlight | Not started |
| 5 | (Future, out of scope for now) Morning-lock mode | A second restricted window in the morning, on top of the bedtime lock | Not started, explicitly deferred |
| 6 | (Future, deferred 2026-07-20) Moon-phase app icon | iOS alternate-icon switching (8 pre-rendered phase variants) on app launch, matching `MoonGlyph`'s style. Android has no clean native equivalent — community activity-alias hack is fragile, may be skipped. Requires a custom dev client build, not plain Expo Go. A real WidgetKit/Android Widget (true auto-updating, no app-open needed) was also discussed as the more "correct" tool for this idea, but is a bigger native project — separate future consideration, not this slice. | Deferred, not started |
| 7 | Real accounts + global leaderboard | Supabase auth (email/password), `profiles` table, top-3-styled global leaderboard toggling Current/All-Time streak | Code written this session (see §6a). **Blocked on the user creating the Supabase project by hand** and handing back the URL + anon key — nothing in this slice can be tested end-to-end until that lands in `.env`. |

---

## 6a. Accounts (built 2026-07-20 — triggered by the global leaderboard request)

Real accounts existed only as an unscoped future idea until the user asked for a global, all-users leaderboard with special top-3 styling — that request cannot be built without server-side identity, so this became the trigger to build it now rather than later.

**What exists:**
- **Backend:** Supabase, email + password auth. No Supabase project could be created via this session's connected account — it's on the Pro plan ($10/mo per project) and the user wanted a genuinely free project instead, which lives under a different Supabase login (the one that also owns "munchify"). That account isn't connected to this session's Supabase MCP tools, so **the user is creating the project by hand** and will hand back the project URL + anon key. See `MEMORY.md` for the exact handoff steps and `supabase/schema.sql` for the schema to paste into that project's SQL Editor.
- **Schema:** one `profiles` table — `id` (matches `auth.users.id`), `display_name`, `current_streak`, `longest_streak`, `updated_at`. RLS: readable by everyone (the leaderboard is public), writable only by the row's own owner.
- **Client:** `lib/supabase.ts` (client, reads `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` from `.env` — copy `.env.example`, not committed), `context/AuthContext.tsx` (session state, signUp/signIn/signOutRemote, `syncStreak`, `fetchLeaderboard`). `context/SleepContext.tsx` gained a persisted `longestStreak` field (never decreases, even when the current streak breaks) and its existing `signOut()`/`deleteAccount()` now also end the real Supabase session.
- **Sign-up flow:** deliberately not folded into onboarding. A "Join the leaderboard" card appears inline on the Leaderboard tab for signed-out users — email + password only; the display name already set locally (onboarding) is reused as the public leaderboard name, so the user isn't asked twice.
- **Leaderboard UI:** `app/(tabs)/leaderboard.tsx` — toggle between "Current" streak and "All-Time" best, top 50 fetched from `profiles`, top 3 rows get theme-colored bordering (cyan/violet/amber, not literal gold/silver/bronze), the viewer's own row is tagged "YOU". The board itself is publicly viewable even when signed out; only appearing on it requires an account.

**Known gaps, called out rather than silently skipped:**
- `deleteAccount()` wipes local storage and signs out of Supabase, but does **not** delete the remote auth user or `profiles` row — that requires an admin-privileged call the client can't make with just the anon key. A real "delete my account everywhere" needs a server-side function (Supabase Edge Function with the service role key), which is not built. This matters for App Store guideline 5.1.1(v) before shipping with real accounts live.
- No password reset flow.
- Duplicate display names are allowed — nothing enforces uniqueness. Low-stakes for a leaderboard label, but worth knowing.

**2026-07-20, later same session — leaderboard UI restructure + community stats:**
- Leaderboard tab restructured so the global board is the top-level content (title "Leaderboard", Current/All-Time toggle right under it), with the personal streak/stats/night-log demoted below a "Your Record" divider — it was previously duplicating Home and burying the actual leaderboard partway down the screen.
- Leaderboard list now shows top 4 + the signed-in viewer's own row (with a real computed rank, via a count query — `fetchMyRank` in `AuthContext.tsx`) if they're outside the top 4, plus a "View all"/"Show less" toggle over the rest of the fetched top-50.
- Added a `bedtime` column to `profiles` (see `supabase/schema.sql`) and a "Community Stats" section: average bedtime across everyone synced (`averageBedtime()` in `leaderboard.tsx` — uses a shifted/circular mean so times don't break across the midnight boundary, e.g. 23:00 and 01:00 correctly average to ~00:00, not ~12:00 like a naive linear mean would give), plus `components/BedtimeHistogram.tsx`, a tap-to-expand bar chart of bedtime-by-hour (plain flexbox `View` bars, not `react-native-svg` — simpler and naturally responsive for this shape of chart).
- **Deliberately not built: average wake-up time.** DUSK's lock window ends at a fixed 6 AM for every user (see §1 — bedtime-only scope, no per-user wake time exists anywhere in the data model). Faking this stat would show "6:00 AM" for 100% of users, which is noise, not insight. Real wake-time personalization requires the deferred morning-lock mode (roadmap #5) to exist first. The UI says this plainly rather than omitting it silently.

## 7. Open Questions

1. **Does the real, original DUSK codebase exist anywhere retrievable?** (Another local folder on the crashed machine, a cloud AI app-builder account, a repo.) Not resolved — user wasn't sure. Worth a quick check (Spotlight search on the Mac for filenames like "SleepContext" or "HoldButton"; search the icloud.com email inbox around 2026-05-14 for more attachments — the ones already found look like they were sent mid-session, so more may exist in the same thread).
2. ~~Mascot art~~ — **moot, resolved by the mascot's removal.** `components/Mascot.tsx` is orphaned; delete it as cleanup, don't source art for it.
3. ~~Final public app name~~ — **resolved 2026-07-20: "Curfy."** See §5.
4. ~~`app.json` slug/bundle identifier~~ — **resolved 2026-07-20**: `slug`/`scheme`/`name` all updated to "curfy"/"Curfy". Safe to do now since no EAS project has been created yet — this is exactly the moment CONTEXT.md previously flagged as the right time to make this change.
5. Apple Developer Program / Google Play Console account status — still unknown.
6. The blue-moon logo the user shared — confirmed direction for app icon, not yet wired into `assets/images/`.
7. Real account system (see §6a) — auth provider, backend, sync design, all unscoped.
8. Live App Store name-availability check and a real USPTO trademark search for "Curfy" — not yet done, web search was used as a first pass only (see §5). Do before store submission.

---

## 8. Decisions Log

- **2026-07-20** — Confirmed product concept, ruled out "Lumi"/"Kipply" names, explored alternatives (see `MEMORY.md` Session 1).
- **2026-07-20** — User clarified DUSK (not the "Hypnos/Syndicate" files) is the real project, recovered via email attachments. Superseding Syndicate entirely.
- **2026-07-20** — Scope: bedtime-only for now, morning-lock deferred.
- **2026-07-20** — Architecture confirmed as in-app soft lock (not OS-level), based on the recovered original `SleepContext.tsx`.
- **2026-07-20** — Public app name decided: **Curfy**. "DUSK" retained as internal/historical codename only. See §5 for the full naming history and what changed in-app.
