-- ============================================================
--  1. Notes travel with their page again. Making them owner-only
--     meant a notebook — which is nothing but notes — was blank
--     to everyone you shared it with.
--  2. A note can be hidden on its own, separately from the page
--     beside it.
-- ============================================================

alter table notes add column if not exists visibility text not null default 'open';
alter table notes drop constraint if exists notes_visibility_check;
alter table notes add constraint notes_visibility_check
  check (visibility in ('open', 'hidden'));

-- Readable if you may read the book's contents and the note is not hidden.
-- The owner always sees their own.
drop policy if exists read_content on notes;
create policy read_content on notes for select
  using (
    owner_id = auth.uid()
    or (public.can_read_book_contents(book_id) and visibility = 'open')
  );

-- ---------- what a reader may load ----------
-- Signature changes, so it has to be dropped rather than replaced.
drop function if exists public.book_pages_for_viewer(uuid);

create function public.book_pages_for_viewer(b uuid)
returns table (
  id uuid, "position" int, media_type text,
  r2_key text, thumb_key text,
  locked boolean, hidden boolean,
  doc jsonb, note_locked boolean, note_hidden boolean
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p."position",
    p.media_type,
    case when page_ok then p.r2_key    else null end,
    case when page_ok then p.thumb_key else null end,
    not page_ok as locked,
    (mine and p.visibility = 'hidden') as hidden,
    -- The note follows its own rule, so a picture can be shared while the
    -- writing beside it is not.
    case when note_ok then n.doc else null end,
    not note_ok as note_locked,
    (mine and coalesce(n.visibility, 'open') = 'hidden') as note_hidden
  from public.pages p
  left join public.notes n on n.page_id = p.id
  cross join lateral (select (p.owner_id = auth.uid()) as mine) m
  cross join lateral (
    select
      (m.mine or (public.can_read_book_contents(p.book_id) and p.visibility = 'open')) as page_ok,
      (m.mine or (public.can_read_book_contents(p.book_id)
                  and coalesce(n.visibility, 'open') = 'open'
                  and p.visibility = 'open')) as note_ok
  ) a
  where p.book_id = b
    and (
      m.mine
      or public.can_read_case((select case_id from public.books where id = b))
    )
  order by p."position";
$$;

grant execute on function public.book_pages_for_viewer(uuid) to authenticated;
