-- ============================================================
--  Two fixes the verification turned up.
--
--  1. email and dob were still readable by every account. A column-level
--     REVOKE does nothing while a table-level GRANT SELECT stands, because
--     the table grant already implies every column. It has to come off at the
--     table level and go back on column by column.
--
--  2. Accounts created before 002 have a null email, so username sign-in
--     cannot find them.
-- ============================================================

-- ---------- 1. column grants, done properly ----------
revoke select on public.profiles from authenticated, anon;

-- Everything except email and dob. These are the columns the app actually
-- reads: the menu, people search, the floor, the admin list, the avatar route.
grant select (
  id, handle, username, display_name, first_name, last_name,
  avatar_key, status, role, visibility, bytes_used, bytes_quota, created_at
) on public.profiles to authenticated;

-- Signed-out visitors have no business reading profiles at all.
-- (Signup still works: handle_new_user is security definer.)

-- Your own email and dob still come back through my_profile(), which is
-- security definer and returns exactly one row: yours.

-- ---------- 2. backfill the missing addresses ----------
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- ---------- check ----------
-- Expect ZERO rows. Anything here means email or dob is still exposed.
select 'still leaking' as check, grantee, column_name
from information_schema.column_privileges
where table_name = 'profiles'
  and column_name in ('email','dob')
  and grantee in ('authenticated','anon')
  and privilege_type = 'SELECT';
