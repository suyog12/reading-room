-- ============================================================
--  A room can be shared with particular guests rather than all
--  of them, or none.
--
--    open      every accepted guest may come in
--    invited   only the guests named for this room
--    closed    nobody but the owner
-- ============================================================

alter table rooms drop constraint if exists rooms_visibility_check;
alter table rooms add constraint rooms_visibility_check
  check (visibility in ('open', 'invited', 'closed'));

create table if not exists room_guests (
  room_id  uuid not null references rooms   on delete cascade,
  guest_id uuid not null references profiles on delete cascade,
  owner_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, guest_id)
);
create index if not exists room_guests_guest_idx on room_guests (guest_id);

alter table room_guests enable row level security;

-- The owner manages the list. A guest may see the rows naming them, so the
-- app can tell them which rooms they have been let into.
drop policy if exists read_room_guests on room_guests;
create policy read_room_guests on room_guests for select
  using (owner_id = auth.uid() or guest_id = auth.uid());

drop policy if exists edit_room_guests on room_guests;
create policy edit_room_guests on room_guests for all
  using (owner_id = auth.uid() and public.is_approved())
  with check (
    owner_id = auth.uid()
    and public.is_approved()
    and public.owns_room(room_id)
    -- you may only name someone who is already a guest of yours
    and exists (
      select 1 from public.follows f
      where f.owner_id = auth.uid()
        and f.follower_id = guest_id
        and f.status = 'accepted'
    )
  );

-- ---------- the door ----------
/**
 * Owner always. Otherwise you must be able to view the owner at all, and
 * then the room must either be open to every guest, or name you.
 */
create or replace function public.can_read_room(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rooms rm
    where rm.id = r
      and (
        rm.owner_id = auth.uid()
        or (
          public.can_view(rm.owner_id)
          and (
            rm.visibility = 'open'
            or (
              rm.visibility = 'invited'
              and exists (
                select 1 from public.room_guests rg
                where rg.room_id = rm.id and rg.guest_id = auth.uid()
              )
            )
          )
        )
      )
  );
$$;

grant execute on function public.can_read_room(uuid) to authenticated;
