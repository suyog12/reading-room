-- ============================================================
--  Deletion rules, enforced in the database.
--
--  A case may go only when it holds no books.
--  A room may go only when it holds no cases.
--  A book may go at any time, taking its pages and notes with it.
--  Only the owner, which the existing policies already require.
-- ============================================================

create or replace function public.refuse_nonempty_case() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.books where case_id = old.id) then
    raise exception 'This bookcase still has books on it'
      using errcode = 'restrict_violation';
  end if;
  return old;
end $$;

drop trigger if exists cases_must_be_empty on cases;
create trigger cases_must_be_empty before delete on cases
  for each row execute function public.refuse_nonempty_case();

create or replace function public.refuse_nonempty_room() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.cases where room_id = old.id) then
    raise exception 'This room still has bookcases in it'
      using errcode = 'restrict_violation';
  end if;
  return old;
end $$;

drop trigger if exists rooms_must_be_empty on rooms;
create trigger rooms_must_be_empty before delete on rooms
  for each row execute function public.refuse_nonempty_room();

-- Deleting a book cascades to its pages, and pages_bytes already gives the
-- storage back. Nothing to add there.
