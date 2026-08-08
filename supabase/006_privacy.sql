-- ============================================================
--  Privacy: closed rooms, private books, hidden pages
--
--  The rule throughout: a guest may see that a thing EXISTS — the door, the
--  spine, the page count — and never its contents. Enforced in policies and
--  in one definer function, never in the UI.
-- ============================================================

alter table rooms add column if not exists visibility text not null default 'open';
alter table rooms drop constraint if exists rooms_visibility_check;
alter table rooms add constraint rooms_visibility_check check (visibility in ('open', 'closed'));

alter table books add column if not exists visibility text not null default 'open';
alter table books drop constraint if exists books_visibility_check;
alter table books add constraint books_visibility_check check (visibility in ('open', 'private'));

alter table pages add column if not exists visibility text not null default 'open';
alter table pages drop constraint if exists pages_visibility_check;
alter table pages add constraint pages_visibility_check check (visibility in ('open', 'hidden'));

-- ---------- the chain of permission ----------

/** Owner always. Guest only if they may view the owner AND the room is open. */
create or replace function public.can_read_room(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rooms rm
    where rm.id = r
      and (rm.owner_id = auth.uid()
           or (public.can_view(rm.owner_id) and rm.visibility = 'open'))
  );
$$;

create or replace function public.can_read_case(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cases cs
    where cs.id = c and public.can_read_room(cs.room_id)
  );
$$;

/** A private book's contents are the owner's alone, even in an open room. */
create or replace function public.can_read_book_contents(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.books bk
    where bk.id = b
      and (bk.owner_id = auth.uid()
           or (public.can_read_case(bk.case_id) and bk.visibility = 'open'))
  );
$$;

-- ---------- read policies down the chain ----------
-- A room row stays readable so a guest can see the door and be told it is
-- shut. Everything under a closed room does not.

drop policy if exists read_content on cases;
create policy read_content on cases for select using (public.can_read_room(room_id));

-- The spine of a private book is still visible; only its pages are not.
drop policy if exists read_content on books;
create policy read_content on books for select using (public.can_read_case(case_id));

drop policy if exists read_content on pages;
create policy read_content on pages for select
  using (
    owner_id = auth.uid()
    or (public.can_read_book_contents(book_id) and visibility = 'open')
  );

-- Notes are the owner's own writing. A guest reading someone's book does not
-- read their marginalia. Flip this to match pages if you want it shared.
drop policy if exists read_content on notes;
create policy read_content on notes for select using (owner_id = auth.uid());

-- ---------- what a reader is allowed to load ----------
/**
 * One row per page, in order, for whoever is asking.
 *
 * A guest gets the shape of the book — the right number of pages in the right
 * places — with `locked` true and no key where they may not look. That is how
 * a hidden page shows as a blank page rather than vanishing and renumbering
 * everything after it.
 */
create or replace function public.book_pages_for_viewer(b uuid)
returns table (
  id uuid, "position" int, media_type text,
  r2_key text, thumb_key text, locked boolean, doc jsonb
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p."position",
    p.media_type,
    case when allowed then p.r2_key   else null end,
    case when allowed then p.thumb_key else null end,
    not allowed as locked,
    case when p.owner_id = auth.uid() then n.doc else null end
  from public.pages p
  left join public.notes n on n.page_id = p.id
  cross join lateral (
    select (
      p.owner_id = auth.uid()
      or (public.can_read_book_contents(p.book_id) and p.visibility = 'open')
    ) as allowed
  ) a
  where p.book_id = b
    and (
      p.owner_id = auth.uid()
      -- a guest may know the book's shape if they may open the book at all
      or public.can_read_case((select case_id from public.books where id = b))
    )
  order by p."position";
$$;

grant execute on function public.book_pages_for_viewer(uuid) to authenticated;
grant execute on function public.can_read_room(uuid) to authenticated;