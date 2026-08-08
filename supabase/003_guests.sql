-- ============================================================
--  Guests: who may walk through whose building
--  Reuses the follows table. follower_id is the guest,
--  owner_id is whose home it is.
-- ============================================================

alter table follows
  add column if not exists initiated_by uuid references profiles on delete cascade;

-- Existing rows were all guest-initiated.
update follows set initiated_by = follower_id where initiated_by is null;

-- ---------- who can do what with a request ----------
drop policy if exists read_follows on follows;
create policy read_follows on follows for select
  using (follower_id = auth.uid() or owner_id = auth.uid());

-- Either side may open a request, but only about themselves.
drop policy if exists create_follow on follows;
create policy create_follow on follows for insert
  with check (
    public.is_approved()
    and initiated_by = auth.uid()
    and (follower_id = auth.uid() or owner_id = auth.uid())
  );

-- Only the OTHER party can accept, so nobody can wave themselves in.
drop policy if exists resolve_follow on follows;
create policy resolve_follow on follows for update
  using (
    (follower_id = auth.uid() or owner_id = auth.uid())
    and initiated_by <> auth.uid()
  )
  with check (follower_id = follower_id);

drop policy if exists delete_follow on follows;
create policy delete_follow on follows for delete
  using (follower_id = auth.uid() or owner_id = auth.uid());

-- ---------- finding people ----------
-- Approved accounts only, never yourself, and only the handful of fields a
-- search result needs. Security definer so it can look past the profile
-- policy without opening the whole table.
create or replace function public.search_people(q text)
returns table (
  id uuid, username text, display_name text,
  first_name text, last_name text, avatar_key text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.first_name, p.last_name, p.avatar_key
  from public.profiles p
  where public.is_approved()
    and p.status = 'approved'
    and p.id <> auth.uid()
    and length(trim(q)) >= 2
    and (
      p.username   ilike '%' || trim(q) || '%' or
      p.first_name ilike '%' || trim(q) || '%' or
      p.last_name  ilike '%' || trim(q) || '%' or
      (coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) ilike '%' || trim(q) || '%'
    )
  order by
    case when lower(p.username) = lower(trim(q)) then 0 else 1 end,
    p.display_name
  limit 20;
$$;

grant execute on function public.search_people(text) to authenticated;

-- Look a person up by username, for visiting their building.
create or replace function public.profile_by_username(u text)
returns table (id uuid, username text, display_name text, avatar_key text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_key
  from public.profiles p
  where public.is_approved() and p.status = 'approved'
    and lower(p.username) = lower(trim(u));
$$;

grant execute on function public.profile_by_username(text) to authenticated;
