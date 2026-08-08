-- ============================================================
--  THE READING ROOM — full schema
--  Paste into Supabase SQL editor and run once, top to bottom.
--  Safe to re-run: enums and tables are guarded.
-- ============================================================

-- ---------- 1. enums ----------
do $$ begin create type account_status as enum ('pending','approved','suspended'); exception when duplicate_object then null; end $$;
do $$ begin create type account_role   as enum ('user','admin');                   exception when duplicate_object then null; end $$;
do $$ begin create type visibility     as enum ('public','private');               exception when duplicate_object then null; end $$;
do $$ begin create type follow_status  as enum ('pending','accepted','blocked');   exception when duplicate_object then null; end $$;
do $$ begin create type case_tone      as enum ('oak','walnut','black');           exception when duplicate_object then null; end $$;
do $$ begin create type book_layout    as enum ('notes','continuous');             exception when duplicate_object then null; end $$;

-- ---------- 2. tables ----------
create table if not exists profiles (
  id            uuid primary key references auth.users on delete cascade,
  handle        text unique,
  display_name  text not null,
  status        account_status not null default 'pending',
  role          account_role   not null default 'user',
  visibility    visibility     not null default 'private',
  bytes_used    bigint not null default 0,
  bytes_quota   bigint not null default 0,   -- 0 = unlimited, no total cap set yet
  created_at    timestamptz not null default now()
);

create table if not exists follows (
  follower_id  uuid not null references profiles on delete cascade,
  owner_id     uuid not null references profiles on delete cascade,
  status       follow_status not null default 'pending',
  created_at   timestamptz not null default now(),
  primary key (follower_id, owner_id),
  check (follower_id <> owner_id)
);
create index if not exists follows_owner_idx on follows (owner_id, status);

create table if not exists rooms (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles on delete cascade,
  name       text not null default 'New room',
  position   int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists rooms_owner_idx on rooms (owner_id, position);

create table if not exists cases (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms on delete cascade,
  owner_id   uuid not null references profiles on delete cascade,
  label      text not null default 'New case',
  tone       case_tone not null default 'oak',
  position   int not null,
  created_at timestamptz not null default now(),
  check (position between 0 and 3)            -- 4 cases to a room
);
create unique index if not exists cases_slot_idx on cases (room_id, position);

create table if not exists books (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references cases on delete cascade,
  owner_id    uuid not null references profiles on delete cascade,
  title       text not null default 'Untitled',
  author      text,
  spine_color text not null default '#7A3230',
  layout      book_layout not null default 'notes',
  position    int not null,
  page_count  int not null default 0,
  created_at  timestamptz not null default now(),
  check (position between 0 and 24)           -- 5 x 5 slots
);
create unique index if not exists books_slot_idx on books (case_id, position);

create table if not exists pages (
  id         uuid primary key default gen_random_uuid(),
  book_id    uuid not null references books on delete cascade,
  owner_id   uuid not null references profiles on delete cascade,
  position   int not null,
  r2_key     text not null,
  thumb_key  text,
  width      int,
  height     int,
  bytes      bigint not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists pages_slot_idx on pages (book_id, position);

create table if not exists notes (
  page_id    uuid primary key references pages on delete cascade,
  book_id    uuid not null references books on delete cascade,
  owner_id   uuid not null references profiles on delete cascade,
  doc        jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists doors (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references profiles on delete cascade,
  from_room uuid not null references rooms on delete cascade,
  to_room   uuid not null references rooms on delete cascade,
  wall      text check (wall in ('left','right','back')),
  label     text,
  check (from_room <> to_room)
);

-- ---------- 3. security helpers ----------
-- All security definer: they run as the function owner, so reading profiles
-- inside them does NOT re-trigger the profiles policy. Without this you get
-- infinite recursion the first time anything queries profiles.

create or replace function public.my_status() returns account_status
language sql stable security definer set search_path = public as $$
  select status from public.profiles where id = auth.uid();
$$;

create or replace function public.my_role() returns account_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_status() = 'approved', false);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false);
$$;

create or replace function public.can_view(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_approved() and (
       owner = auth.uid()
    or exists (select 1 from public.profiles p where p.id = owner and p.visibility = 'public')
    or exists (select 1 from public.follows f
               where f.owner_id = owner and f.follower_id = auth.uid() and f.status = 'accepted')
  );
$$;

-- ---------- 4. row level security ----------
alter table profiles enable row level security;
alter table follows  enable row level security;
alter table rooms    enable row level security;
alter table cases    enable row level security;
alter table books    enable row level security;
alter table pages    enable row level security;
alter table notes    enable row level security;
alter table doors    enable row level security;

-- profiles: see yourself always, others once you're approved.
drop policy if exists read_profiles on profiles;
create policy read_profiles on profiles for select
  using (id = auth.uid() or public.is_approved());

-- You may edit your own profile but NOT your status or role.
-- This clause is the entire access gate. Test it with a second account.
drop policy if exists edit_own_profile on profiles;
create policy edit_own_profile on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid()
              and status = public.my_status()
              and role   = public.my_role());

drop policy if exists admin_edit_profiles on profiles;
create policy admin_edit_profiles on profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- follows
drop policy if exists read_follows on follows;
create policy read_follows on follows for select
  using (follower_id = auth.uid() or owner_id = auth.uid());

drop policy if exists create_follow on follows;
create policy create_follow on follows for insert
  with check (follower_id = auth.uid() and public.is_approved());

drop policy if exists resolve_follow on follows;
create policy resolve_follow on follows for update using (owner_id = auth.uid());

drop policy if exists delete_follow on follows;
create policy delete_follow on follows for delete
  using (follower_id = auth.uid() or owner_id = auth.uid());

-- content tables: identical pair on each
do $$
declare t text;
begin
  foreach t in array array['rooms','cases','books','pages','notes','doors'] loop
    execute format('drop policy if exists read_content on %I', t);
    execute format('create policy read_content on %I for select using (public.can_view(owner_id))', t);
    execute format('drop policy if exists edit_content on %I', t);
    execute format('create policy edit_content on %I for all
                      using (owner_id = auth.uid() and public.is_approved())
                      with check (owner_id = auth.uid() and public.is_approved())', t);
  end loop;
end $$;

-- ---------- 5. triggers ----------

-- new auth user -> pending profile
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, status)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          'pending')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep bytes_used honest
create or replace function public.sync_bytes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update profiles set bytes_used = bytes_used + new.bytes where id = new.owner_id;
  elsif tg_op = 'DELETE' then
    update profiles set bytes_used = greatest(0, bytes_used - old.bytes) where id = old.owner_id;
  end if;
  return null;
end $$;

drop trigger if exists pages_bytes on pages;
create trigger pages_bytes after insert or delete on pages
  for each row execute function public.sync_bytes();

-- page_count on books
create or replace function public.sync_page_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update books b set page_count = (select count(*) from pages where book_id = b.id)
  where b.id = coalesce(new.book_id, old.book_id);
  return null;
end $$;

drop trigger if exists pages_count on pages;
create trigger pages_count after insert or delete on pages
  for each row execute function public.sync_page_count();

-- notes updated_at
create or replace function public.touch_note() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists notes_touch on notes;
create trigger notes_touch before update on notes
  for each row execute function public.touch_note();

-- ============================================================
--  After running: sign up once, then make yourself admin+approved:
--    update profiles set status='approved', role='admin' where id='<your-uuid>';
--  Find the uuid in Authentication -> Users.
-- ============================================================
