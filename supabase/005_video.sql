-- ============================================================
--  Pages can be video as well as image.
-- ============================================================

alter table pages
  add column if not exists media_type  text not null default 'image',
  add column if not exists duration_ms int;

alter table pages drop constraint if exists pages_media_type_check;
alter table pages add constraint pages_media_type_check
  check (media_type in ('image', 'video'));
