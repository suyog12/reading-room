-- ============================================================
--  The reader needs to know a page's own state, or the hide
--  control cannot become an unhide control.
--
--  Owners get the real value. Guests always get false, because a page
--  they may not see already comes back locked, and telling them which
--  pages were deliberately hidden is itself information.
-- ============================================================

-- The return type gains a column, and CREATE OR REPLACE cannot change a
-- function's signature. It has to go and come back.
drop function if exists public.book_pages_for_viewer(uuid);

create function public.book_pages_for_viewer(b uuid)
returns table (
  id uuid, "position" int, media_type text,
  r2_key text, thumb_key text, locked boolean, hidden boolean, doc jsonb
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p."position",
    p.media_type,
    case when allowed then p.r2_key    else null end,
    case when allowed then p.thumb_key else null end,
    not allowed as locked,
    (p.owner_id = auth.uid() and p.visibility = 'hidden') as hidden,
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
      or public.can_read_case((select case_id from public.books where id = b))
    )
  order by p."position";
$$;

grant execute on function public.book_pages_for_viewer(uuid) to authenticated;
