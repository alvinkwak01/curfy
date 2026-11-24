# Curfy profile privilege review — 2026-11-11

Project xcngywlufixnctvblsid, PostgreSQL 17.6.1.147; no user rows read or modified.

Applied two narrowly scoped migrations: restrict_profile_client_privileges and restrict_profile_maintenance_privilege. The second explicitly removes PostgreSQL 17 MAINTAIN, which the legacy information_schema grant inventory did not show.

Expected effective privileges:
- anon: SELECT only.
- authenticated (including Supabase anonymous Auth identities): SELECT, INSERT, UPDATE only; existing auth.uid() ownership predicates remain.
- service_role: unchanged, including backend account deletion/cascade access.

Verified effective legacy privileges live after first migration, followed by MAINTAIN checks. Public SELECT LIMIT 0 executed successfully. Authenticated UPDATE WHERE false executed, and EXPLAIN of the exact INSERT ... ON CONFLICT UPDATE shape passed (no inserted rows). These are permission/statement checks, not fresh end-to-end identity/deletion tests. Existing two-identity deletion evidence remains separately dated November 9.

RLS remains enabled. Public full-profile read and own-row INSERT/UPDATE policies were not changed. No public SQL functions were found. No defaults for future tables or unrelated schemas were altered.

Advisor warnings remain: anonymous access (intentional public leaderboard and anonymous Auth, protected by ownership policies) and leaked-password protection disabled (current app uses no password flow; reassess before adding one). These warnings were not hidden or represented as a clean advisory report.

Rollback only after review: regrant specifically demonstrated required privileges; avoid restoring blanket client privileges. No data rollback is necessary.

References:
- https://supabase.com/docs/guides/api/securing-your-api
- https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
