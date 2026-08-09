-- Who can visit whom, and which rooms name which guests.
-- node --env-file=.env.local scripts/sql.mjs supabase/whoami.sql

-- 1. Every guest relationship, in both directions.
--    For someone to appear in a room's guest picker there must be a row here
--    with owner = you, guest = them, status = accepted. Pending is not enough,
--    and a row the other way round does not count.
select
  o.username  as building_owner,
  g.username  as guest,
  f.status,
  i.username  as opened_by
from follows f
join profiles o on o.id = f.owner_id
join profiles g on g.id = f.follower_id
left join profiles i on i.id = f.initiated_by
order by o.username, g.username;

-- 2. Every room, how it is shared, and who is named on it.
--    A room set to 'invited' with no named guest is shut to everyone, which
--    looks identical to 'closed' from the outside.
select
  ow.username   as owner,
  r.name        as room,
  r.visibility,
  p.username    as named_guest
from rooms r
join profiles ow on ow.id = r.owner_id
left join room_guests rg on rg.room_id = r.id
left join profiles p on p.id = rg.guest_id
order by ow.username, r.floor, r."position";
