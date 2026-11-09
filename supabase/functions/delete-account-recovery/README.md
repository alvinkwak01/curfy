# Curfy deletion recovery — deployment gate

Source implemented; NOT deployed or verified on Supabase. The app now requires
this endpoint and deliberately does not fall back to one-shot deletion.

## Protocol and authentication

POST prepare validates the current session with Auth getUser, then issues a
signed HMAC-SHA256 capability scoped to this project's deletion endpoint, one
verified user, one random request ID, and 30 days of destructive authority. The app writes/readbacks it
before commit. POST status/commit authenticate the capability directly, without
requiring the deleted user's normal session. Neither trusts body user IDs.
Only Auth's explicit user_not_found result confirms absence; generic failures
never do. No additional server-side personal-data table is created.

The capability is a sensitive deletion-only credential stored alongside existing
local auth state; do not log it, include it in support exports, or paste it into
chat. It is removed after confirmed deletion/finalization. No profile contents
or Screen Time tokens appear in it. A stolen proof can delete its subject until
expiry; it cannot read a profile, sign in, or delete a different user.

## Required deployment configuration

- Provision CURFY_DELETION_RECOVERY_KEY as 32 cryptographically random bytes
  encoded as 64 hex characters, exclusively in Supabase Edge Function secrets.
  Never derive it from or reuse the service-role key. Do not put it in EXPO_PUBLIC
  variables, repository files, logs, or this document. Secret provisioning is not
  available through the currently connected Supabase tools.
- Deploy NEW delete-account-recovery with verify_jwt=false. The handler performs
  both authentication modes. Keep legacy delete-account verify_jwt=true.
- Key rotation: move the old key to CURFY_DELETION_RECOVERY_PREVIOUS_KEY, retain
  it for at least 30 days after the last issuance, and do not rotate again until
  that interval has elapsed. After that interval, move retired keys into the
  comma-separated CURFY_DELETION_RECOVERY_VERIFICATION_KEYS list. These keys
  may only confirm already-absent users; they can never authorize deletion of
  an existing account. Retain this verification history for long-offline clients.
  Removing a compromised key entirely invalidates its proofs; that incident
  requires verified recovery and must never imply deletion success.
- After 30 days, a verified proof still confirms an already-absent user. If the
  user exists, it returns 410 without deletion. The client renews only through
  fresh authentication of the SAME identity and readbacks the replacement
  journal before committing. No session means no renewal; state is retained.
  A lost anonymous session with an undeleted account or fully revoked key
  still requires verified support recovery. Never sign up a replacement user
  or accept a body-supplied ID as proof. This exceptional recovery remains open.
- No change to the existing live endpoint or database was made by this slice.

## Required verification before release

Deno type checking passed locally on 2026-11-09. Deploy in the correct project only after secret
provisioning. Use identified disposable identities A/B, never a real user's
session. Check method/auth rejection; preparation without deletion; journal
write failure before commit; successful deletion and profile cascade; dropped
success response and expired normal session; A proof cannot delete B; forged,
expired, retired-key and wrong-project proofs; transient Auth failure; duplicate
commit; local receipt/signout failure; full Delete Everything and cloud-only
withdrawal. Check the actual platform gateway lets recovery reach the handler.

Node WebCrypto/mocked Auth tests do not prove deployed behavior. The lost-session/revoked-key
support path and deployed acceptance block release even when tests pass.
Rollback both app and endpoint changes together only after pending journals have
been resolved; a prior app does not understand the pending recovery key.

Official references checked 2026-11-09:
- https://supabase.com/docs/guides/functions/auth-headers
- https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid
- https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
