# Curfy — app privacy data inventory (pre-submission audit)
Updated: 2026-11-04. VERIFIED IN REPOSITORY unless marked UNKNOWN.
Do NOT publish as a customer-facing privacy policy without legal, provider and deployed-backend verification.

This is an engineering inventory for Apple App Privacy disclosure and a future
plain-language privacy policy. Product scope: selected-app restrictions, not
whole-phone locking or measured/guaranteed sleep.

## Data flows established by current source

| Type | Source/evidence | Where it lives | External transmission |
|---|---|---|---|
| App selection/Screen Time tokens | `lib/screenTime.ts`, `modules/curfy-protected-apps/ios/CurfyProtectedAppsModule.swift` | iOS FamilyControls + Curfy App Group | Token values are **not returned to JS by the native label bridge**, nor deliberately transmitted to Supabase by Curfy source. DeviceActivity framework/system processing is controlled by Apple. |
| Daily start/end times, mode, selected name/motivation | `context/SleepContext.tsx` | AsyncStorage locally | The configured start time and optional display name **are also synced to Supabase** if the anonymous community account is active. Motivation is local in the inspected code. |
| Streak counts and current/longest records | `context/SleepContext.tsx`, `context/AuthContext.tsx` | Local history; also online `profiles` | Supabase synchronizes current/longest streak counters when the user has a cloud session. |
| Journal entries | `context/JournalContext.tsx` | Local AsyncStorage | No deliberate Supabase journal write in the inspected source. |
| Online community identity | `app/_layout.tsx` EnsureLeaderboardIdentity + `context/AuthContext.tsx` | Supabase auth session + public `profiles` | **Automatic anonymous remote signup after onboarding IF Supabase is configured**, including a stable user ID, display name, start time, streak counters, updated-at. Names/streaks are readable by other users via the public leaderboard; the exact privacy disclosure/consent is missing. |
| Supabase credential/session | `lib/supabase.ts` | AsyncStorage / Supabase backend | Supabase authentication uses a client-side public key; the server creates user/session records. Network metadata/retention are provider-dependent and **UNKNOWN** until verified. No service-role secret should ship in the app. |
| Account deletion | `context/AuthContext.tsx`, `context/SleepContext.tsx`, `supabase/functions/delete-account/index.ts` | Server and local | Client calls a privileged Edge Function; the source deletes the caller's Auth user and cascades to `profiles`, then clears native app selections and local history. **Deployment and actual deletion success NOT VERIFIED**. |
| StoreKit transactions | `modules/curfy-storekit`, `lib/premiumStore.ts` | Apple's StoreKit | Module reads verified ownership for a planned non-consumable; purchase UI is **NOT enabled**. Do not claim purchase readiness or collect card information. |
| Notifications | `context/SleepContext.tsx` | iOS notification scheduling | Current inspected app uses `expo-notifications` local scheduling; verify full package/runtime behavior and final permissions disclosure. |

## Apple review obligations verified in Apple's documentation

- All iOS apps need a working Privacy Policy URL in App Store Connect **and an accessible link inside the app**. Policy must identify data collected, partners, uses and retention/deletion. Source: https://developer.apple.com/app-store/review/guidelines/#privacy
- App Privacy responses must account for third-party provider data and all collection in the actual shipped build. Source: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- Apps that create online accounts must offer in-app account deletion (not just deactivation); the Curfy source has a Delete Account path but the backend deployment is still unverified. Source: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/
- Consent is required for user-data collection; do not assume a silent anonymous online account is exempt merely because it is anonymous. Source: https://developer.apple.com/app-store/review/guidelines/

## Current STOP-SHIP privacy gaps

1. **No verified user choice to join the public leaderboard**. The app currently signs up silently after onboarding when Supabase is configured. The permanent product instructions forbid changing existing community scope without an approved decision. Choose opt-in or explicitly-approved deferral before shipping; do not silently change the experience or assert consent.
2. No verified **public privacy policy URL** or in-app link. No approved support contact/URL. Do not invent either.
3. Server `delete-account` Edge Function deployment, RLS policies, and cascade behavior require actual connected Supabase verification; source code alone is not proof.
4. Validate actual production Expo/Supabase SDK collection, IP/diagnostics metadata, processors, retention periods, SDK privacy manifests and whether notifications are device-only. Do not claim data is unlinked/anonymous simply due to a UUID.
5. Confirm availability and legal acceptability for the user's distribution jurisdictions; record user-facing retention and contact details before publishing.

## Exact App Store Connect label review (not approved responses)

- **Identifiers / user ID**: Supabase auth user ID is generated and associated with cloud profile if configured. Likely disclosure required; confirm actual Apple category and linkability in final provider deployment.
- **User Content**: Optional journal content is local in examined code; not remotely collected by Curfy source. Verify any crash/diagnostics SDK before declaring on-device only.
- **Other data**: Display name, protection start clock, streak counts stored in Supabase `profiles` if enabled. Determine Apple classification from their latest questionnaire; don't guess.
- **Purchases**: Native StoreKit ownership observation is prepared; no in-app purchase currently live.
- **Tracking / advertising**: No tracking or ad SDK found in current focused source audit; this is NOT verification of every dependency or backend request. Conduct full SDK audit.

## Next non-EAS work

Establish approved cloud consent scope and policy/support destination; run a connected
Supabase deletion/RLS test without any real user data; prepare in-app Privacy
link only after the actual URL exists; reconcile all App Privacy answers
against final shipped binary and partners. Keep Apple Screen Time tokens
on-device only.
