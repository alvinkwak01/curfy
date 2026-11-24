-- Curfy release preflight. READ ONLY. Run against the actual selected project.
-- No user/profile rows, tokens, secrets or account identifiers are returned.
-- Save the result with project reference + UTC time; source SQL is not proof
-- that the deployed schema has the same policies/grants/cascade.
begin transaction read only;

-- Expected columns/types; this does not inspect any personal data.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- RLS must be enabled on the actual table.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'profiles';

-- Verify public reads and owner-only insert/update; inspect all policies,
-- including unexpected additional policies that can broaden access.
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by policyname;

select grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public' and table_name = 'profiles'
order by grantee, privilege_type;

select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
order by grantee, column_name, privilege_type;

-- Expected: profiles.id references auth.users(id) ON DELETE CASCADE.
select con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'profiles' and con.contype = 'f';

rollback;
