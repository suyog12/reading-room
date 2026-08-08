-- ============================================================
--  Accounts: real profiles, usernames, password login
--  Run after schema.sql.
-- ============================================================

alter table profiles
  add column if not exists username    text,
  add column if not exists first_name  text,
  add column if not exists last_name   text,
  add column if not exists dob         date,
  add column if not exists email       text,
  add column if not exists avatar_key  text;

-- Usernames are case insensitive and unique. Letters, numbers, dot,
-- underscore, hyphen; 3 to 30 characters.
create unique index if not exists profiles_username_key on profiles (lower(username));

alter table profiles drop constraint if exists profiles_username_shape;
alter table profiles add constraint profiles_username_shape
  check (username is null or username ~ '^[A-Za-z0-9._-]{3,30}$');

-- Fill display_name from the parts, so one field stays authoritative.
create or replace function public.sync_display_name() returns trigger
language plpgsql as $$
begin
  new.display_name := coalesce(
    nullif(trim(coalesce(new.first_name,'') || ' ' || coalesce(new.last_name,'')), ''),
    new.username,
    new.display_name
  );
  return new;
end $$;

drop trigger if exists profiles_display_name on profiles;
create trigger profiles_display_name before insert or update of first_name, last_name, username
  on profiles for each row execute function public.sync_display_name();

-- Signup metadata lands in the profile.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, username, first_name, last_name, dob, display_name, status)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'username', ''),
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    (nullif(new.raw_user_meta_data->>'dob', ''))::date,
    coalesce(
      nullif(trim(coalesce(new.raw_user_meta_data->>'first_name','') || ' ' ||
                  coalesce(new.raw_user_meta_data->>'last_name','')), ''),
      nullif(new.raw_user_meta_data->>'username', ''),
      split_part(new.email, '@', 1)
    ),
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Anyone signing up may check whether a username is free. This deliberately
-- says nothing about who holds it.
create or replace function public.username_available(candidate text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(candidate));
$$;

grant execute on function public.username_available(text) to anon, authenticated;
