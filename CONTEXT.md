# CONTEXT.md — Project Spec & State

This file is the source of truth for what this app is and where it stands. Read it at the start of every work session before touching code. Update it whenever a product or architecture decision changes. Session-by-session progress/history lives in `MEMORY.md`, not here.

---

## 0. Current State — read this first (updated 2026-08-14)

**The rest of this file is a chronological decisions/history log, not a live status board — early sections (especially §1's "Architecture" line and the §6 roadmap table) describe the *original* plan and are now superseded. This section is the actual current state; trust this over anything earlier in the file that contradicts it.**

- **Architecture is real OS-level app blocking, not an in-app lock.** §1's "Architecture (confirmed): In-app soft lock... bypassable by force-quitting" is **wrong/obsolete** — that was the original design and it was a real, fundamental flaw, corrected starting 2026-07-26. The actual mechanism now: Apple's Screen Time frameworks (`FamilyControls`/`ManagedSettings`/`DeviceActivity` via `react-native-device-activity`) apply a real, iOS-enforced shield to apps the user picks, scheduled to the user's bedtime/wake window, running in a separate system process independent of whether Curfy itself is open. Full detail and rationale: **§6c**.
- **Onboarding is a personalized 12-step flow**, not the original spec's 5 steps (§3's "5 steps... Meet Lumi..." is a stale historical snapshot, not current). Current flow: hook → "what keeps you up" → self-reported current bedtime → goal bedtime → wake time → a computed sleep-loss reveal → sourced benefit stats → how-it-works → Screen Time authorization → app-block picker (Apple's native sheet) → a preview of the shield UI → name. Full detail: **§6d**.
- **All Screen Time integration work is done and verified on-device**: Apple Developer Program confirmed active (Team ID `H735Q3WW8K`), all 4 App IDs registered with Family Controls + App Groups capabilities, entitlement approved, dev client builds successfully (local `prebuild` + `eas build --profile development`), `lib/screenTime.ts` calls the real native APIs (not stubbed), onboarding + Settings both wire the real block/unblock schedule. User confirmed the flow "looks good" on their physical device. Full detail: **§6c**.
- **Not yet done** (only remaining real gaps):
  1. ~~Deploy the account-deletion Edge Function~~ — **deployed 2026-08-14**, via the Supabase Dashboard's in-browser editor (this session's connected Supabase MCP account doesn't have access to the actual project — different login, same split described in §6a — so the CLI path wasn't usable from here). Verified live via the dashboard's own Test panel (returns the function's real `401 "Invalid session"` for a non-user token, confirming deployed code is running, not stubbed). Not yet verified: an actual successful deletion end-to-end with a real user token — worth doing before shipping account deletion to real users. See `MEMORY.md` Session 5.
  2. **Explicitly verify the shield-tap escape hatch** — tapping a blocked app's shield → opening Curfy → completing the 120s hold → that app actually unblocking. The scheduling/blocking itself is confirmed; this specific loop hasn't been walked through and confirmed yet. Requires the user's physical device — not something a coding session can drive remotely.
  3. TestFlight internal testing, then App Store submission prep (real trademark/name-availability check for "Curfy" — see §5 — plus App Store Connect setup). **Audited 2026-08-14**: zero production builds and zero submissions exist yet for the `curfy` EAS project — only two old `development`-profile builds. A valid Apple Distribution Certificate and an App Store Connect API Key are already on the account, so `eas build --profile production --platform ios` and `eas submit --platform ios --latest` should run non-interactively once the user kicks them off from their own terminal (needs their network; the build itself runs on EAS's cloud infra, not local Xcode). Likely blocking step before submit will work: an App Store Connect app record for `com.alvinkwak.curfy` needs to exist first (`eas submit` doesn't create one automatically) — checking this needs the user's own Apple ID login (2FA-gated), not something to do on their behalf. See `MEMORY.md` Session 5.
  4. Smaller/low-stakes: duplicate leaderboard display names allowed (no uniqueness check); app icon — the user said they'd handle this themselves ("I'll deal with app icon... I have mine submitted for now"), not an open task for Claude.
- **All planning tasks in the task tool are marked completed** as of this writing — the 3 items above are real but weren't formally tracked as tasks; recreate them at the start of the next session if using the task tool.
- **Supabase project "Curfy"**: flagged by Supabase for inactivity pausing (free tier auto-pauses after 7 days with too little real database activity — confirmed via Supabase's own docs, 2026-08-14). Visiting the project in the Supabase Dashboard, or generating real API/database activity from the app, resets the clock and prevents the pause once a warning email has been sent. To prevent this recurring: either upgrade to the Pro plan (paid projects are never auto-paused), or set up a periodic automated ping (e.g. a free Uptime Robot monitor hitting the project, or a scheduled GitHub Action) — not yet set up, worth doing since this will keep coming back otherwise.

---

## 1. Product

**Name:** Curfy (public/App Store name, decided 2026-07-20 — see §5 Naming). No mascot character. Tagline: "Bedtime. For real." **"DUSK" is the internal/historical codename** — it's the name of the original recovered blueprint documents and is still used throughout this codebase's comments, `CONTEXT.md`/`MEMORY.md` history, and design-system provenance notes. Those historical references are accurate and were deliberately left alone. All user-facing text (wordmark, `app.json` name/slug/scheme, in-app copy) has been updated to Curfy — see §5 for the full list of what changed.

**One-liner:** A bedtime-only phone lock. At your set bedtime, the phone locks behind a 120-second hold button that resets if you move or let go. The app guilt-trips you the whole time with escalating, increasingly unhinged commentary — no named character, just the app's voice. It tracks a nightly streak, rates each night (Flawless / Slipped once / Tried hard / Chaotic), and sends a morning "report card" notification.

**2026-07-20, later in the same session:** the user saw the app running and asked to remove the "Lumi" owl mascot entirely — both the visual character and the name/personality from all copy. This reverses a core piece of the original blueprint (the mascot was a named, deliberate part of the spec), so it's called out here explicitly: **do not reintroduce "Lumi" or a mascot character without the user asking for it.** `components/Mascot.tsx` still exists on disk but is now unused/orphaned everywhere — nothing imports it. It's on the cleanup list in `MEMORY.md`.

**This supersedes the earlier "Hypnos/Syndicate" direction** (amber palette, Fraunces/Jakarta fonts, "Enter the Syndicate" copy) that was sitting in this project folder. That was an earlier, abandoned experiment from April 2026. DUSK is a separate, later, far more fully-designed concept from May 2026 that the user explicitly wants back — see `MEMORY.md` Session 2 for how this was discovered.

**Scope right now: bedtime-only.** No morning-lock mode. The user confirmed (2026-07-20) to start with exactly what the original spec covers — lock from bedtime until a fixed 6:00 AM — and revisit a morning mode later as a separate addition, not bundled into this build.

**Platforms:** iOS + Android (Expo/React Native).

**Architecture (confirmed):** In-app soft lock. Not an OS-level/Screen Time lock. A React Context (`SleepContext`) checks every 30 seconds and on every app-foreground whether the current time is inside the bedtime window; if so, a full-screen Modal (`LockScreen`) renders over the whole app. This is bypassable by force-quitting the app — that's a known, accepted limitation of this architecture, not an oversight.

> **⚠️ SUPERSEDED 2026-07-26 — see §0 and §6c.** This paragraph describes the *original* architecture and is kept here only as a historical record. The real, current mechanism is OS-level blocking via Apple's Screen Time APIs — the in-app lock's "bypassable by force-quitting" gap turned out to be a fundamental flaw, not an acceptable trade-off, and it's been replaced. Do not build against this paragraph.

**Dev-only auto-lock bypass (added 2026-07-26):** the real bedtime lock was blocking the user from testing other screens (e.g. the new Journal tab) whenever the current time happened to fall inside their configured bedtime window. Settings now has a "Disable auto-lock" switch that's rendered only when `__DEV__` is true — it's gated at both render time (Settings) and read time (`checkLock()` in `SleepContext.tsx`), so it's dead code in any production/release build and can never become a real-user cheat toggle, regardless of what ends up in `AsyncStorage`. "Preview Lock Screen" (already existed) still works normally for testing the lock UI itself while this is on.

**Follow-up, same day — the Settings switch alone was a deadlock.** The real `LockScreen` modal covers the *entire* app, including the tab bar, so once actually locked there was no way to navigate to Settings to flip the switch in the first place — reported by the user as "I still am locked from seeing the app." Fixed by adding a second dev-only escape hatch directly on `LockScreen.tsx` itself: a small "DEV: Skip Lock" button (amber-bordered, `__DEV__`-gated, invisible in production the same way) that calls `devDismissLock()` — this both hides the current lock and flips `devSkipLock` on (so it doesn't just re-lock 30 seconds later), without touching `todayUnlocks`/`sleepLog` the way actually completing the 120-second hold does. That distinction matters: the dev bypass must never look like a real escape in the user's own streak/history data.

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

**This table is a historical snapshot from 2026-07-20 — several rows below are now stale/resolved. See §0 for current state.**

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
- ~~`deleteAccount()` wipes local storage and signs out of Supabase, but does **not** delete the remote auth user or `profiles` row~~ — **fixed 2026-08-01, deployed 2026-08-14.** See below (this gap is restated further down in this same section as it was closed).
- No password reset flow.
- Duplicate display names are allowed — nothing enforces uniqueness. Low-stakes for a leaderboard label, but worth knowing.

**2026-07-20, later same session — leaderboard UI restructure + community stats:**
- Leaderboard tab restructured so the global board is the top-level content (title "Leaderboard", Current/All-Time toggle right under it), with the personal streak/stats/night-log demoted below a "Your Record" divider — it was previously duplicating Home and burying the actual leaderboard partway down the screen.
- Leaderboard list now shows top 4 + the signed-in viewer's own row (with a real computed rank, via a count query — `fetchMyRank` in `AuthContext.tsx`) if they're outside the top 4, plus a "View all"/"Show less" toggle over the rest of the fetched top-50.
- Added a `bedtime` column to `profiles` (see `supabase/schema.sql`) and a "Community Stats" section: average bedtime across everyone synced (`averageBedtime()` in `leaderboard.tsx` — uses a shifted/circular mean so times don't break across the midnight boundary, e.g. 23:00 and 01:00 correctly average to ~00:00, not ~12:00 like a naive linear mean would give), plus `components/BedtimeHistogram.tsx`, a tap-to-expand bar chart of bedtime-by-hour (plain flexbox `View` bars, not `react-native-svg` — simpler and naturally responsive for this shape of chart).
- **Deliberately not built: average wake-up time.** DUSK's lock window ends at a fixed 6 AM for every user (see §1 — bedtime-only scope, no per-user wake time exists anywhere in the data model). Faking this stat would show "6:00 AM" for 100% of users, which is noise, not insight. Real wake-time personalization requires the deferred morning-lock mode (roadmap #5) to exist first. The UI says this plainly rather than omitting it silently.

**2026-07-26 — switched from email/password to silent anonymous auth.** The user asked why there was a separate "Join the leaderboard" sign-up step at all when every user could just be on it automatically. Fixed by replacing `signUp`/`signIn` with `ensureAnonymousProfile()` in `AuthContext.tsx` — the moment onboarding completes, `EnsureLeaderboardIdentity` (`app/_layout.tsx`) silently creates an anonymous Supabase auth session and a matching `profiles` row using the display name from onboarding. No email, no password, no visible signup UI at all; the "Join the leaderboard" card is deleted from `leaderboard.tsx`. RLS didn't need to change — the existing policies already key off `auth.uid()`, which anonymous sessions have too. Requires "Allow anonymous sign-ins" enabled in the Supabase dashboard's Auth → Providers settings (done, confirmed working).

This closes the password-reset gap below by making it moot (there's no password), but opens a different, real trade-off: an anonymous session lives only on that device/install, with no email to recover it. Deleting the app or switching devices orphans that leaderboard row permanently. Accepted deliberately for zero-friction participation at this stage — revisit if it becomes a real complaint (a "claim this profile with an email" upgrade path would be the fix, not reverting to a signup screen).

Also fixed as a direct consequence: `SleepContext.signOut()` no longer ends the Supabase session. It used to, back when signing out meant "you can sign back in later" — but an anonymous session can't be signed back into, so ending it there was quietly creating an abandoned duplicate `profiles` row on the public leaderboard every time "Sign Out" was used. `deleteAccount()` still ends the session (see known gaps below — deliberate full wipe, not a "come back later" flow).

**Known gaps, updated:**
- ~~No password reset flow~~ — **moot.** There's no password to reset; see above.
- ~~`deleteAccount()` doesn't delete the remote auth user or `profiles` row~~ — **fixed 2026-08-01.** `supabase/functions/delete-account/index.ts` (Deno Edge Function) deletes the real auth user using the service-role key, which never ships in the app — the function derives *which* user from the caller's own access token (never a client-supplied id), and deletes only that one. Removing the auth user cascades to `profiles` automatically via its `on delete cascade` FK, so no separate profile delete was needed. Client side: `AuthContext.deleteRemoteAccount()` calls it via `supabase.functions.invoke("delete-account")`; `SleepContext.deleteAccount()` calls that before the local wipe, best-effort — a failed/offline remote call never blocks the local wipe, so the device always ends up clean either way. **Deployed 2026-08-14** via the Supabase Dashboard's in-browser function editor (see §0 and `MEMORY.md` Session 5 for why the CLI path wasn't available and how deployment was verified). Excluded `supabase/functions/**` from the app's `tsconfig.json` since it's Deno code, a different runtime than the RN app — the app's own `tsc --noEmit` doesn't (and shouldn't) type-check it.
- Duplicate display names still allowed — more visible now that a name is the *only* identity concept exposed, not just a label next to an email. Not fixed; still low-stakes for a leaderboard, worth knowing.

---

## 6b. Journal tab (built 2026-07-26)

The user asked for a "thought map" — somewhere to jot random nightly thoughts/diary entries, with a floating view and a calendar view. Scoped down deliberately after discussion: floating visualization is real engineering risk (physics-style rendering gets expensive as entries pile up, and it's polish on an unvalidated habit) for a feature nobody's used yet, so v1 ships as list + calendar only; floating is a possible fast-follow once the writing habit itself proves out.

**What exists:**
- `context/JournalContext.tsx` — local-only (AsyncStorage, `@dusk/journal_entries`), never touches Supabase. Diary content is more sensitive than a streak number; unlike `profiles`, nothing here is public or synced. Wiped by `deleteAccount()`.
- `app/(tabs)/journal.tsx` — third tab. List view (reverse-chronological cards + a "what's keeping you up tonight" composer) and Calendar view (custom-built month grid, no new dependency, cyan dot per day with entries) behind a segmented toggle, same visual pattern as the leaderboard's Current/All-Time toggle. Tapping a card opens a full-screen edit/delete sheet.
- **2026-07-26, later same session — intro card + help icon.** The user wanted the "why journal before bed" rationale actually surfaced in-app, not just explained in chat. `JournalIntroModal` in `journal.tsx` shows once automatically on the first-ever visit to the tab (gated by `hasSeenIntro`/`markIntroSeen` in `JournalContext.tsx`, persisted so it doesn't reappear every visit) and is reopenable any time via a help icon in the tab header. The copy's claim is real, not invented for flavor: writing down open loops before bed — "cognitive offloading" — is studied in sleep research and is a technique used in CBT-I. Source: Scullin et al., "The effects of bedtime writing on difficulty falling asleep," *Journal of Experimental Psychology: General*, 2018 (57-participant RCT; a to-do-list-writing group fell asleep faster than a completed-tasks-writing group). Worth knowing: the strongest evidence there is specifically for writing concrete to-dos/worries, not necessarily open-ended diary prose — the in-app copy is worded to reflect the general "get it out of your head" mechanism rather than overclaiming the exact study design.

---

## 6c. Real app-blocking via Screen Time API (started 2026-07-26) — supersedes the in-app "lock"

**This is the single most important architecture correction in the project's history.** The user pointed out — correctly, and after having to say it more than once — that locking Curfy's *own* screen achieves nothing, since nobody needs to be inside Curfy at bedtime in the first place. Pressing the home button escapes the existing `LockScreen` Modal instantly and completely; it was never a phone lock, just an in-app screen that's easy to walk away from. The actual goal has always been to stop *phone use in general* at bedtime, which the old architecture never did. §1's "in-app soft lock... bypassable by force-quitting... known, accepted limitation" framing undersold how fundamental this gap is — it should have been raised as a blocking design flaw the first time it came up, not filed away as a footnote.

**Direction confirmed with the user:** replace this with real OS-level app blocking, iOS first. Library chosen: `react-native-device-activity` (Kingstinct), a maintained Expo module wrapping Apple's actual Screen Time frameworks — confirmed by inspecting the real package contents and README directly (not assumed from general knowledge), since this is a specialized, fast-evolving API surface worth verifying precisely.

**How the real mechanism works (Apple's Screen Time APIs, WWDC21):**
- `FamilyControls` — user grants authorization (`requestAuthorization()`) and picks which apps/categories to restrict via a native picker (`DeviceActivitySelectionSheetView`/`DeviceActivitySelectionView`).
- `ManagedSettings` — applies the actual system-level shield to the selected apps. The block screen the user sees is Apple's own UI, not anything Curfy renders — this is the part that makes it a real block instead of an in-app modal.
- `DeviceActivity` — schedules when the shield turns on/off (`startMonitoring(activityName, { intervalStart, intervalEnd, repeats }, events)`) and, critically, runs in a separate system extension process that fires even if Curfy itself is force-quit or not running. This is exactly the property the old architecture lacked.
- Shield UI/behavior customized via `updateShield()` and `configureActions()` (native-side actions like `blockSelection`/`unblockSelection` tied to `intervalDidStart`/`intervalDidEnd`).

**Hard requirements/blockers, confirmed from the library's own docs — not optional, not skippable:**
1. Requires a **custom dev client** (`expo-dev-client`) and `npx expo prebuild --platform ios` — Expo Go cannot run this, full stop. This is why moving off Expo Go was the first step.
2. Requires the **`com.apple.developer.family-controls` entitlement approved by Apple** (request form: developer.apple.com/contact/request/family-controls-distribution) for **four separate bundle identifiers** (`<bundleId>`, `<bundleId>.ActivityMonitor`, `<bundleId>.ShieldAction`, `<bundleId>.ShieldConfiguration`). Apple approval turnaround is not instant — request this as early as possible.
3. **Until that approval lands, the project is stuck on local Xcode builds** — per the library's own docs, you can't even build an Expo Dev Client via EAS cloud builds without it. This means real device testing of this feature requires a Mac with Xcode during the pre-approval period, not just `eas build` from any machine.
4. Requires an **Apple Developer Program membership** (paid, individual/org verified) to request the entitlement at all — status unknown as of this writing (see Open Questions, previously flagged, now directly load-bearing rather than a someday-item).

**What's been done so far (code side, this session):**
- `app.json` — added `expo-build-properties` (iOS deployment target 15.1) and `react-native-device-activity` plugin config with placeholder `appleTeamId`/`appGroup`/`bundleIdentifier` values that need real inputs from the user before `prebuild` will work correctly.
- Package installation attempted directly in the sandbox; `npm view`/`npm pack` succeeded (used to inspect real source), but a full `npm install` timed out over the sandbox's network — consistent with this session's established pattern where package-affecting installs need to be run by the user locally, not through this sandbox.

**Progress, 2026-07-26 (continued same session):**
- Apple Developer Program: confirmed active (Individual, Team ID `H735Q3WW8K`, confirmed via developer.apple.com/account).
- Bundle identifier decided: `com.alvinkwak.curfy`. Set in `app.json` along with `appleTeamId` and `appGroup` (`group.com.alvinkwak.curfy`) in the `react-native-device-activity` plugin config.
- **Family Controls (Distribution) entitlement: approved and assigned**, confirmed via Apple's confirmation email ("The entitlement for Family Controls (Distribution) has been assigned to your account"). This turned out to be a fast, mostly self-serve terms-acceptance flow at developer.apple.com/contact/request/family-controls-distribution (pre-filled name/email/Team ID + an acknowledgment that the app's purpose is "personal device usage management," which Curfy's bedtime-blocking use case fits cleanly), not the longer human-review wait the library's README implied. Worth knowing for future reference in case this changes.

**Progress, 2026-08-01:**
- All four App IDs registered on developer.apple.com: `com.alvinkwak.curfy` ("Curfy"), `com.alvinkwak.curfy.ActivityMonitor`, `com.alvinkwak.curfy.ShieldAction`, `com.alvinkwak.curfy.ShieldConfiguration`. User is confirming Family Controls (Development + Distribution) and App Groups (`group.com.alvinkwak.curfy`) capabilities are checked on each — App Groups matters here specifically because it's what lets the three extension targets share data with the main app, and it's a separate capability from Family Controls so easy to miss.
- **Resolved: the old `LockScreen`/`HoldButton` mechanic is not being removed** — it's repurposed. It no longer shows proactively at the user's bedtime (that job now belongs entirely to Apple's native shield on the blocked apps). Instead, tapping through Apple's shield opens Curfy directly to this same screen; completing the existing 120-second hold temporarily lifts the block on that one app via the existing 15-minute-cooldown pattern, optionally redirecting back into the app that was blocked. No new "unlock" UI needed — Apple's `ManagedSettings`/`DeviceActivity` side just needs to call back into the app for this screen instead of Curfy showing its own modal at bedtime.
- **Onboarding reworked** (`app/onboarding.tsx`) to match the corrected architecture — was 4 steps, now 6: Wake Up Call → How It Works (copy corrected: "We lock the apps. Not the phone.", replacing the old "We lock you out. Completely." framing that started this whole correction) → **Screen Time Access** (new) → **Choose What to Block** (new) → Set Bedtime → Name. Welcome screen copy also corrected ("locks your distracting apps," not "locks your phone").
  - New screen 1 asks for Screen Time authorization with a two-column trust card (what this permission does / doesn't let Curfy see) rather than a bare system-permission dialog with no context.
  - New screen 2 presents three preset "modes" as selectable cards — Just the distractions / Almost everything / I'll choose myself — matching the existing card visual language, plus a "N apps selected" summary chip once a preset opens the (eventually native) picker.
  - **Correction made mid-build, worth remembering**: the user's original ask included "a page of which apps they're blocking," implying a custom app-icon list. That's not fully buildable — Apple's `FamilyActivitySelection` result is an opaque token set for privacy; Curfy can get an app *count* back but can't enumerate bundle IDs/icons/names to render its own list. The one place real app identities can be shown is inside Apple's own picker/selection view re-presented in a read-only mode, not a custom React Native component. Onboarding copy is worded to set this expectation honestly ("Apple's own picker handles the exact app list — Curfy applies the lock but never sees which specific apps you chose").
  - Also explicitly scoped **out**: a "how much screen time you're losing" stat. That needs a *different* Apple API (`DeviceActivityReport`, not the blocking APIs already being integrated) with its own extension target, and the same privacy sandboxing means raw per-app numbers can't be pulled into Curfy's own React state/Supabase/leaderboard — only shown inside Apple's own sandboxed SwiftUI report view. User chose to skip this rather than take on a 4th extension target for a feature that can't feed the rest of the app anyway. Revisit as a standalone feature later if wanted.
  - Built against `lib/screenTime.ts`, a new stub module with the real function signatures/shapes (`requestScreenTimeAccess`, `openAppPicker`, the three preset definitions) but mocked bodies — this lets the onboarding UI/UX be built, previewed, and iterated on in Expo Go right now, decoupled from the native install. Every stubbed function has a `TODO(task #3)` pointing to exactly what real `react-native-device-activity` call replaces it once the dev client build exists.

**Progress, 2026-08-01 (continued):**
- All portal setup finished: 4 App IDs registered and capability-verified, App Group `group.com.alvinkwak.curfy` registered and linked. `expo-build-properties` was missing from `package.json` despite being in the plugins list — installed. `app.json` needed `ios.appleTeamId` at the top level (not just inside the plugin's own config) — the `@bacons/apple-targets` plugin reads it from there specifically.
- Local build pipeline works end to end: `npx expo prebuild --platform ios` → CocoaPods installed via Homebrew → `eas build --profile development --platform ios` reached a real Xcode compile.
- **Bug found and fixed**: the `react-native-device-activity` config plugin scaffolds its `ActivityMonitorExtension` target folder under `targets/` with that exact name, which auto-derives the bundle ID `com.alvinkwak.curfy.ActivityMonitorExtension` — different from `com.alvinkwak.curfy.ActivityMonitor`, the one actually registered on the portal with Family Controls + App Groups. EAS silently auto-registered the mismatched ID and toggled capabilities on it, but Apple's backend wouldn't actually issue an entitlement-bearing provisioning profile for it, so the build failed at the Xcode signing step. Fixed by overriding `bundleIdentifier: ".ActivityMonitor"` in `targets/ActivityMonitorExtension/expo-target.config.js`, and setting `"copyToTargetFolder": false` in the plugin's `app.json` config — without that flag, the plugin re-copies its bundled template into `targets/` on every prebuild and silently wipes this override.
- Installed dev client on a physical device successfully. Two testing-workflow notes worth remembering: (1) a dev client build needs `npx expo start --dev-client` running and reachable (same wifi, or tunnel) every time it's opened — it loads JS from Metro at runtime, unlike a real store build; a stopped server presents as a hard crash before the JS ever mounts, not a friendly error. (2) **Apple's Screen Time APIs (FamilyControls/ManagedSettings/DeviceActivity) do not work in the iOS Simulator at all** — this is a hard Apple platform restriction, not a config issue. Simulator (`npx expo run:ios`) is fine for iterating on everything else, but the actual blocking feature can only ever be verified on a real device.
- Also flagged: don't go straight from one `eas build` to `eas submit --auto-submit`/TestFlight/App Store. `lib/screenTime.ts` is still fully stubbed (see below) — shipping now would put a non-functional "blocking" feature in front of real users, worse than not having the feature visible at all.

**Real integration wired, 2026-08-01 (task #3):**
`lib/screenTime.ts` is no longer a stub — every function calls the actual `react-native-device-activity` API, checked directly against the installed package's real `.d.ts` files (not just the README) since this is a fast-evolving, easy-to-misremember surface:
- `requestScreenTimeAccess()` → `requestAuthorization("individual")` + `getAuthorizationStatus()`, mapped to the same `"notDetermined"|"authorized"|"denied"` shape the UI already expected — no onboarding UI changes needed, just the implementation underneath.
- The app-picker step (`StepChooseApps` in `app/onboarding.tsx`) now renders Apple's real native sheet (`DeviceActivitySelectionSheetViewPersisted`) instead of calling a fake async function. Per the library's documented pattern, it's mounted only while open and renders as an invisible 1x1 anchor — the actual picker UI is presented natively by iOS. Keyed by a stable per-preset id (`selectionIdForMode`, e.g. `curfy-block-social`) so the same id can be referenced later when actually applying the block.
- `configureBedtimeBlocking({ bedtime, wakeTime, mode })` — the real scheduling. Calls `startMonitoring` with an interval from bedtime to wakeTime (repeating daily), `configureActions` to fire `blockSelection` on `intervalDidStart` and `unblockSelection` on `intervalDidEnd` (both referencing the same selection id from the picker step), and `updateShield` to set the shield's button to `type: "openApp"`.
- Wired into `app/onboarding.tsx`'s final step: on completing onboarding, the chosen block mode is persisted (`SleepContext.blockMode`, new field alongside `bedtime`/`wakeTime`) and `configureBedtimeBlocking` is called with the real values. Best-effort — a failure (e.g. Screen Time access was denied a few steps back) doesn't block finishing onboarding.
- `stopBedtimeBlocking()` added and wired into `SleepContext.deleteAccount()` — otherwise the native schedule would keep blocking apps forever on-device even after every trace of the account is wiped locally.

**The shield → HoldButton handoff turned out to need no new code.** Realized while wiring this: the old `LockScreen`'s trigger logic (`SleepContext.checkLock()`, showing the Modal whenever the app is open during the bedtime window) doesn't need to be torn out or rewired at all. Now that the shield's button is configured as `openApp`, tapping a *blocked app* during the bedtime window opens Curfy — and Curfy's existing, untouched bedtime-window check immediately shows the same hold-to-unlock screen it always has. The mechanism naturally repurposes itself once Apple's shield is the thing actually gatekeeping other apps; opening Curfy directly during the window still shows the same screen too, which is fine (reinforces the ritual, shows streak status) rather than something that needed preventing.

**Honest scope limit, not yet closed:** changing bedtime in `app/settings.tsx` updates `SleepContext.bedtime` but does **not** call `configureBedtimeBlocking()` again — the native schedule silently keeps using whatever time was set during onboarding until this is wired. Settings also has no UI yet to change the block-mode/app selection after onboarding (the original task #4 title mentioned this; only the onboarding half got built). Both are real, known gaps — flagging explicitly rather than letting them look done because the onboarding half works.

**Testing note:** none of this required a new native build — no new native dependencies were added, only JS/TS calling the module that was already compiled into the existing dev client from the earlier `eas build`. Reload the JS bundle on the same dev-client install to test; no `prebuild`/`eas build` needed for this pass. Still only testable on the physical device, not Simulator (see the Screen-Time-doesn't-work-in-Simulator note above).

**Verified working on-device, 2026-08-01** — user confirmed the onboarding flow (authorization → picker → scheduled block) looks right on a real physical device build.

**Settings gap closed, same day (task #7):** `app/settings.tsx` now has a WAKE UP time picker (wake time was previously onboarding-only, no way to change it afterward) and a BLOCKED APPS section — the same three presets as onboarding, each opening the same native `DeviceActivitySelectionSheetViewPersisted` sheet keyed by the same per-preset id (`selectionIdForMode`), so changing a selection here updates the exact same native selection onboarding created. Saving calls `configureBedtimeBlocking()` again with whatever bedtime/wakeTime/mode are current, so the real schedule actually updates instead of staying frozen at whatever onboarding originally set. Added `getSelectionCount()` to `lib/screenTime.ts` (wraps `activitySelectionMetadata`) so Settings can show "N apps selected" for each preset by reading the already-persisted native selection directly, without needing to reopen the picker just to know the count.

**Not yet done / next up:**
1. TestFlight internal testing before any App Store submission.
2. Full end-to-end verification of the shield → HoldButton → temporary unblock loop specifically (onboarding/scheduling confirmed working; the tap-through-shield escape hatch itself — completing the 120s hold while a blocked app's shield is up — hasn't been explicitly confirmed yet).

---

## 6d. Onboarding rework — personalized, self-reported sleep-loss reveal (2026-08-01)

The user shared reference screenshots from a habit-tracking app ("Pushscroll") whose onboarding personalizes itself: asks why the user is there, current vs. desired habit, computes a dramatic "here's what this costs you" reveal, then benefit slides, then an example of the actual blocking UI. Asked for the same shape applied to Curfy's bedtime problem, wanting onboarding to feel more involved rather than a quick generic form.

**Important distinction, worth remembering**: this is a different mechanism from the "how much time you're losing" feature that was explicitly scoped out in §6c. That one needed real per-app device usage data (`DeviceActivityReport`, blocked by Apple's privacy sandboxing). This one computes purely from what the user tells Curfy directly — current bedtime, goal bedtime, wake time — during onboarding. No native API involved, no sandboxing constraint, fully buildable in JS.

`app/onboarding.tsx` grew from 6 steps to 12: Wake Up Call (hook, trimmed) → **Why do you stay up?** (multi-select reasons, up to 3) → **What time do you actually fall asleep?** (self-reported current bedtime) → Set bedtime (existing, reframed as "...instead?" to contrast with the previous step) → **What time do you wake up?** (new `wakeTime`, now also persisted on `SleepContext`, not just used transiently) → **Reveal** (computes nightly/weekly/yearly sleep deficit between current and goal bedtime; has a distinct positive-only branch if the user's current bedtime is already close to their goal, rather than manufacturing a negative number) → **Benefits** (two real, sourced stats — CDC's "1 in 3 adults don't get enough sleep," and the sleep-deprivation-equals-legally-drunk reaction-time finding — plus one general, uncited consistency-framing card) → How It Works (existing, moved later so it lands after emotional buy-in) → Screen Time Access → Choose What to Block → **Preview** (new — a stylized mock of the actual native shield screen, so there are no surprises about what blocking looks like) → Name.

`reasons` and the self-reported `currentBedtime` are onboarding-local state only, not persisted — nothing downstream currently reads them. `wakeTime` is persisted on `SleepContext` (`@dusk/wake_time`, included in `deleteAccount()`'s wipe) since it's generally useful state, not just a one-time input for the reveal math.

Note: there's an existing, separate `motivation` field on `SleepContext`/Settings (freeform text) from the original recovered blueprint — currently write-only, not displayed anywhere in the app. Left untouched; not the same thing as the new `reasons` multi-select, and not clear yet whether it's meant to resurface somewhere (e.g. lock-screen guilt copy) or is dead weight. Worth a decision later.

## 7. Open Questions

1. **Does the real, original DUSK codebase exist anywhere retrievable?** (Another local folder on the crashed machine, a cloud AI app-builder account, a repo.) Not resolved — user wasn't sure. Worth a quick check (Spotlight search on the Mac for filenames like "SleepContext" or "HoldButton"; search the icloud.com email inbox around 2026-05-14 for more attachments — the ones already found look like they were sent mid-session, so more may exist in the same thread).
2. ~~Mascot art~~ — **moot, resolved by the mascot's removal.** `components/Mascot.tsx` is orphaned; delete it as cleanup, don't source art for it.
3. ~~Final public app name~~ — **resolved 2026-07-20: "Curfy."** See §5.
4. ~~`app.json` slug/bundle identifier~~ — **resolved 2026-07-20**: `slug`/`scheme`/`name` all updated to "curfy"/"Curfy". Safe to do now since no EAS project has been created yet — this is exactly the moment CONTEXT.md previously flagged as the right time to make this change.
5. ~~Apple Developer Program / Google Play Console account status~~ — **resolved.** Apple Developer Program confirmed active (Individual, Team ID `H735Q3WW8K`) — see §6c. Google Play Console status still genuinely unknown (Android Screen Time equivalent isn't built at all yet — this whole effort has been iOS-first, per the user's explicit direction).
6. ~~The blue-moon logo~~ — **user is handling the app icon themselves**, declined further AI involvement on it ("I'll deal with app icon... I have mine submitted for now"). Not an open task for Claude to pick up unless the user raises it again.
7. Real account system (see §6a) — auth provider, backend, sync design, all unscoped.
8. Live App Store name-availability check and a real USPTO trademark search for "Curfy" — not yet done, web search was used as a first pass only (see §5). Do before store submission.

---

## 8. Decisions Log

- **2026-07-20** — Confirmed product concept, ruled out "Lumi"/"Kipply" names, explored alternatives (see `MEMORY.md` Session 1).
- **2026-07-20** — User clarified DUSK (not the "Hypnos/Syndicate" files) is the real project, recovered via email attachments. Superseding Syndicate entirely.
- **2026-07-20** — Scope: bedtime-only for now, morning-lock deferred.
- **2026-07-20** — Architecture confirmed as in-app soft lock (not OS-level), based on the recovered original `SleepContext.tsx`.
- **2026-07-20** — Public app name decided: **Curfy**. "DUSK" retained as internal/historical codename only. See §5 for the full naming history and what changed in-app.
- **2026-07-26** — **Architecture correction: replaced the in-app soft lock with real OS-level app blocking** (Apple Screen Time APIs). The user identified — forcefully — that locking Curfy's own screen was pointless, since nobody needs to be inside Curfy at bedtime; the goal was always to block other apps. This superseded the original architecture entirely. Full rationale and mechanism: §6c.
- **2026-08-01** — Screen Time integration completed and verified working on the user's physical device: real authorization flow, native app picker, scheduled block/unblock, shield configured to hand off to the existing HoldButton screen. Onboarding rebuilt as a personalized 12-step flow (self-reported sleep-loss reveal, sourced benefit stats) modeled on a reference app the user shared. Account-deletion Edge Function written (not yet deployed). See §6c and §6d.
