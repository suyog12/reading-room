-- ============================================================
--  Security fixes. Run after 003_guests.sql.
--
--  1. Nobody can attach their own cases/books/pages into someone
--     else's room, case or book.
--  2. Email and date of birth stop being readable by every
--     approved account.
-- ============================================================

-- ---------- 1. the parent must be yours too ----------
-- Owning a row was enough to insert it. That let an approved user create a
-- case whose room_id belonged to somebody else — owner_id was their own, so
-- the policy passed, and the case appeared inside the victim's room.

create or replace function public.owns_room(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rooms where id = r and owner_id = auth.uid());
$$;

create or replace function public.owns_case(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cases where id = c and owner_id = auth.uid());
$$;

create or replace function public.owns_book(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.books where id = b and owner_id = auth.uid());
$$;

drop policy if exists edit_content on cases;
create policy edit_content on cases for all
  using (owner_id = auth.uid() and public.is_approved())
  with check (owner_id = auth.uid() and public.is_approved() and public.owns_room(room_id));

drop policy if exists edit_content on books;
create policy edit_content on books for all
  using (owner_id = auth.uid() and public.is_approved())
  with check (owner_id = auth.uid() and public.is_approved() and public.owns_case(case_id));

drop policy if exists edit_content on pages;
create policy edit_content on pages for all
  using (owner_id = auth.uid() and public.is_approved())
  with check (owner_id = auth.uid() and public.is_approved() and public.owns_book(book_id));

drop policy if exists edit_content on notes;
create policy edit_content on notes for all
  using (owner_id = auth.uid() and public.is_approved())
  with check (owner_id = auth.uid() and public.is_approved() and public.owns_book(book_id));

-- ---------- 2. stop leaking email and date of birth ----------
-- RLS is row level, not column level: read_profiles let every approved
-- account read every column of every profile, including addresses and dates
-- of birth. Column privileges are the tool for this.

revoke select (email, dob) on public.profiles from authenticated, anon;

-- You still need your own. This returns one row: yours.
create or replace function public.my_profile()
returns table (
  id uuid, email text, username text, first_name text, last_name text,
  dob date, display_name text, avatar_key text, status account_status, role account_role
)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.username, p.first_name, p.last_name,
         p.dob, p.display_name, p.avatar_key, p.status, p.role
  from public.profiles p where p.id = auth.uid();
$$;

grant execute on function public.my_profile() to authenticated;

-- ---------- 3. only an admin may change status or role ----------
-- The old policy pair already blocked this, but by a subtle route: the
-- self-edit check compared status to its own current value. Being explicit
-- costs nothing and survives someone later relaxing that check.

drop policy if exists admin_edit_profiles on profiles;
create policy admin_edit_profiles on profiles for update
  using (public.is_admin()) with check (public.is_admin());
