# Curfy release preflight evidence — 2026-11-07

This register separates current source/mocked tests from actual service/device proof. No signed build is requested. Do not expose signing keys, access/refresh tokens, service-role keys, tester passwords or real users' data in logs/screenshots.

## Current access and missing inputs
- GitHub: live PR #2 head/base/draft verified. The original local checkout is preserved; continuation is in `curfy-settings-recovery/`.
- Supabase: plugin installed/connected. Verified project inventory exposes only Link App and refu. `get_project` for recorded Curfy reference `xcngywlufixnctvblsid` returned permission denied. Neither unrelated project was queried. Reconnect/select the Supabase account/organization that owns Curfy, or confirm a replacement project reference. No SQL, schema changes, deployment or account deletion performed.
- Apple: plugin discovery did not return a relevant App Store Connect/Developer integration. Actual portal/project access and four distribution profiles are still UNKNOWN. More integrations may be available in the plugin directory; no account was accessed here.
- Privacy/support: owner has no domain or dedicated email yet and requested a recommendation plus continued preparation. Recommend free public website hosting and an existing monitored inbox initially. Drafts are in `docs/public-drafts/`; no URL, mailbox or publication is claimed. Actual support email/operator identity and deployed retention details remain required.

## Verified client findings and fixes in this continuation
1. `AuthContext.finishAccountDeletion` removed its confirmed receipt before persisting `declined`. A failed final write left `joined` on disk and no receipt; a real React-provider restart test reproduced an unwanted new anonymous signup. It now first persists/readbacks `leaving`, then retires the receipt, then writes `declined`. Any failure preserves either the receipt or the existing Finish leaving path.
2. Confirmed deletion receipts now require readback before local Supabase signout. A silently dropped write cannot masquerade as persisted recovery state.
3. Profile work was possible while auth/deletion receipt restoration was pending. It now waits for that restoration; root signup/sync also waits for saved Settings hydration/recovery.
4. Delete Everything previously published fresh onboarding before final consent/receipt cleanup completed. It now awaits finalization before resetting React state. Restart Setup also waits for its preference write before announcing onboarding reset. Delete Everything suppresses foreground repair and history/streak writes while its local cleanup is pending; optional leaderboard withdrawal does not pause local protection.

Native/storage/backend calls in these tests are mocked. No cloud account was actually created/deleted. No existing screen layout, copy, onboarding or hold was changed.

## OPEN code/backend gate: lost deletion response
**Verified in source and reproduced with a stateful endpoint mock:**
1. An authenticated POST reaches `delete-account`.
2. `admin.deleteUser` succeeds and removes the auth user/profile by cascade.
3. The success response is lost, or the app exits before writing its local confirmed receipt.
4. The next request runs `auth.getUser` for the deleted identity and receives 401. The client has no independently persisted proof of completion.

The current local receipt only repairs failures AFTER a success response is received. The new finalization fixes do not solve this distributed commit gap. A 401, expired/missing session, network error or missing client receipt must NEVER be interpreted as confirmed deletion.

**Next implementation slice (proposed, not implemented/deployed):** an authenticated prepare/commit/status protocol. Persist a server-issued, narrowly scoped recovery proof locally before destructive commit. It must bind to the original verified caller, survive loss of the normal auth session, allow status/retry only for that same deletion, avoid trusting client-supplied user IDs, and distinguish transient service failure from confirmed absence. Choose a server-held request record or signed recovery capability after inspecting the deployed project's auth/signing/deployment constraints. Define expiry/rotation/retention explicitly; never make a general unauthenticated delete endpoint. Add tests for lost responses, process exit, expired session/proof, forged/mismatched proof, double-submit, permission/DB failure and unrelated users. This gate blocks release even if ordinary deletion succeeds in a demo.

## Supabase read-only inspection
Run `supabase/preflight/release-readonly.sql` on the correct project. It returns schema/policy/grant/constraint metadata only and rolls back a read-only transaction. It has NOT been executed against the deployed project. Capture:
- project reference and UTC timestamp (no secret credentials);
- actual profile columns, RLS enabled, all applicable policies/grants;
- confirmed auth-user → profile delete cascade;
- deployed delete-account source/version and JWT gateway setting;
- whether public clients can read start time/ID as source currently permits.

Then, once the lost-response gate is implemented, use dedicated disposable identities A/B in a known test environment. Prove A cannot modify/delete B; consent precedes signup/uploads; leave removes A's profile/auth while preserving local history/protection; retries survive every interrupted boundary. Only a deliberately identified disposable identity may be deleted. No production user deletion was authorized or performed by this checklist.

## Apple and store evidence (before ONE candidate request)
For `com.alvinkwak.curfy`, `.ShieldConfiguration`, `.ShieldAction`, `.ActivityMonitor`, record Family Controls DISTRIBUTION capability and profile association to team `H735Q3WW8K`, plus App Group `group.com.alvinkwak.curfy`. Source entitlements and simulator builds do not satisfy this.

For `com.alvinkwak.curfy.premium`, verify actual non-consumable product, $5.99 US price, localized product details, commerce agreements/tax/banking readiness and sandbox tester availability. Do not buy a product or start a paid action during inspection.

Confirm actual public privacy/support destinations and owner contact, App Privacy against deployed collection, accessibility accommodation decision, screenshots and review instructions. Use `CONSOLIDATED_DEVICE_ACCEPTANCE.md` and `APP_STORE_SUBMISSION_PACKAGE.md`; do not request an incomplete signed build.

## Primary sources checked 2026-11-07
- Supabase `getUser` validates with the Auth server: https://supabase.com/docs/reference/javascript/auth-getuser
- Supabase `admin.deleteUser` is server-only and requires the privileged server key: https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
- Apple privacy policy, consent withdrawal and account-deletion requirements: https://developer.apple.com/app-store/review/guidelines/#privacy

The lost-response conclusion is an inference from current source, independently reproduced with mocks; it is NOT a claim about an observed production incident.

## Actual read-only inspection — 2026-11-08
This supersedes the access gap above. Correct Curfy project xcngywlufixnctvblsid is accessible and ACTIVE_HEALTHY. PR head verified as 08d72585bee8ec1dea2396349a95d00fa0728a32. A single aggregated equivalent of the preflight metadata query ran inside BEGIN TRANSACTION READ ONLY / ROLLBACK; no user rows were fetched.

Confirmed profiles has six expected columns (id, display_name, current_streak, longest_streak, bedtime, updated_at), RLS enabled (not forced), public SELECT true, own-ID INSERT, own-ID UPDATE with USING and WITH CHECK, and FOREIGN KEY id REFERENCES auth.users(id) ON DELETE CASCADE. anon and authenticated have SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER grants; RLS restricts row operations but does not replace least-privilege grants. Prepare a reviewed grant reduction; no privileges changed in this inspection. Public SELECT includes all six columns.

Retrieved live delete-account source: ACTIVE v1, verify_jwt=true, bundle hash 2273fd936f1d7e8298e8b37b8646d9d7c0752c6d50c954e186d2a210f438cae0. It checks presence of Authorization, authenticates getUser, and calls admin.deleteUser; unlike current PR it has no POST-only guard or Bearer-format check. It has no independent recovery proof. A gateway-compatible recovery endpoint is needed before ordinary auth expiry can be tolerated. No destructive endpoint request was made.

Security advisors returned anonymous access policies and disabled leaked-password protection. Anonymous identity is part of the approved leaderboard architecture; enabled password-provider settings were not inspected. Remediation references: https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

No live mutation or deployment. This proves schema/configuration inspection only, not actual deletion, isolation under disposable credentials, consent behavior, or completed release acceptance.

## Source recovery protocol — 2026-11-09
Implemented new delete-account-recovery and app journal/transport/provider integration. A 30-day project/user-bound HMAC capability is persisted before commit; status can confirm absence without a normal session. Explicit user_not_found alone establishes absence. Mocked lost-response/restart, forgery, wrong project, expiry, rotation, failed persistence, duplicate requests and identity mismatch are covered. Actual suite 367/367 PASS; TypeScript and iOS export PASS. Deno endpoint type check PASS; GitHub CI 42640853050 SUCCESS at edbb91a. No deployment. Secret provisioning and expired/revoked-proof recovery remain release blockers; details and deployment sequence in the endpoint README. No actual account deletion, schema modification or paid action.
