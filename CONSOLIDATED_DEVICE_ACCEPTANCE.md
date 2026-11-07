# Curfy — one consolidated signed-device acceptance
Updated 2026-11-07. ALL rows below are NOT TESTED on the new code. Source mocks and unsigned simulator compilation do not pass these gates.

## Before authorizing a signed build
Record exact Git SHA, version/build, iPhone model/iOS, Apple Team, four approved distribution entitlements/profiles, App Group, configured non-consumable product, verified test backend, policy/support URL and tester. Keep PR #2 draft. No EAS request until code checks and external preflight are complete; explicit user approval required.

## Single candidate test order
| Area | Required observed result |
|---|---|
| Existing design | Welcome + nine steps in approved order; Step 8 original ring/exact line; Step 9 separate name with both Skip/Finish; clocks scroll correctly; no redesigned hold. |
| Free selection | Exactly one individual app accepted/persisted. Multiple/category/site rejected. Immediate picker Done→Continue works. |
| Permission | Deny, allow, revoke, reauthorize; no false protected status or lost recovery; unrelated/emergency apps unaffected. |
| Closed-app schedule | Configure short realistic window ≥15m; chosen app shielded with Curfy terminated; end releases when app is opened after cutoff. Record actual callback timing. |
| Hold | Release at 119s resets. Background, incoming call, screen lock, navigation cancel reset. Continuous 120s grants only chosen app. Preview never unlocks. |
| Exception | Up to 15m logical access, capped at cutoff; reblock with Curfy closed. Measure actual delay, including fractional seconds and a hold within 15m of cutoff. |
| Premium purchase | Apple's correct localized one-time product; $5.99 in US storefront; purchase, cancel, pending, approve later, failure, restore, restart, another Apple Account, refund/revocation. No subscription or Curfy account prerequisite. |
| Premium selection | Two/three individual apps persist and shield; category promotion rejected. Names/icons remain native/private. |
| Independent holds | Unlock A; B/C stay shielded. Later unlock B; C stays shielded. A/B expire independently while Curfy is killed. Already-open app row shows its own cutoff; no second hold for active app. |
| Stale choice | Change saved selection between Home and hold: old route/ticket refuses. Long-lived ticket expiry cannot unlock a different app. |
| Foreground repair | Expired A reblocks without interrupting active B. Missing daily monitor does not create indefinite shields. Missing singleton monitor surfaces recovery and never silently extends access. |
| Editing/stop | One app hold cannot edit every protected app. All per-app holds or outside-window edit permitted. Monitor-stop refusal retains daily cutoff/recovery. Failed edit restores old selection/hours and original earned deadlines. |
| Time/device | Midnight, cutoff, repeated day, reboot, force-quit, offline, time-zone/manual-clock change, DST. No unbounded restriction or stale next-day reblock. |
| Consent | Fresh/legacy session uploads nothing before disclosure. Not now preserves local protection/history. Join creates one profile and syncs automatically. New onboarding appearance remains intact. |
| Leave/rejoin | Leave pauses uploads, removes cloud profile/auth, preserves local history/journal/native protection/Premium. Offline failure says pending removal and can retry across restart. Withdrawal during signup cannot orphan a new identity. |
| Delete Everything | Authenticated backend removes only caller; cascade verified. Remote failure retains local state. Native stop/clear failure preserves recovery. Retry after server success/local signout failure works. |
| Accessibility | Small iPhone and largest Dynamic Type; new disclosure scrolls; native app names distinguish rows with VoiceOver; controls reachable; Reduce Motion; approved hold accommodation verified. |
| Public metadata | Actual privacy/support links, App Privacy responses, screenshots and Review Notes match signed build. No health or whole-phone-locking claims. |

For every row record PASS/FAIL, exact timestamps, affected app(s), reproduction/video/log, build SHA and resolution. A failed critical row blocks submission; do not repeatedly request incremental paid previews.
