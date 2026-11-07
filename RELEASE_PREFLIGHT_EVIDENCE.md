# Curfy release preflight evidence — 2026-11-07

This register separates current source/mocked tests from actual service/device proof. No signed build is requested. Do not expose signing keys, access/refresh tokens, service-role keys, tester passwords or real users' data in logs/screenshots.

## Current access and missing inputs
- GitHub: live PR #2 head/base/draft verified. The original local checkout is preserved; continuation is in `curfy-settings-recovery/`.
- Supabase: a relevant plugin is available but NOT installed/connected in this session. Install/connect the account that owns the actual Curfy project before inspecting deployed configuration. Do not create a second project, upgrade a plan, deploy, or delete real users as a substitute for verification.
- Apple: plugin discovery did not return a relevant App Store Connect/Developer integration. Actual portal/project access and four distribution profiles are still UNKNOWN. More integrations may be available in the plugin directory; no account was accessed here.
- Privacy-policy URL, support URL/contact: not yet supplied/verified. A text request is pending; never invent a customer-facing destination.

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
