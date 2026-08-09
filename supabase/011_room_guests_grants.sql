-- ============================================================
--  room_guests was created after the API was configured, so the
--  `authenticated` role holds no privileges on it at all.
--
--  "permission denied for table room_guests" is a GRANT failing, not a
--  policy refusing. RLS is never consulted: a role has to be allowed to
--  touch the table before its policies get a say. Two separate gates,
--  and both must be open.
-- ============================================================

grant select, insert, delete on public.room_guests to authenticated;

-- No update: a row either exists or it does not. Nothing to change.
-- No grants to anon: signed out visitors have no business here.

-- ---------- check ----------
-- Expect three rows: SELECT, INSERT, DELETE for authenticated.
select 'grants' as check, grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'room_guests' and grantee in ('authenticated', 'anon')
order by grantee, privilege_type;
