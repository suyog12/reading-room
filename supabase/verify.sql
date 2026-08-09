-- ============================================================
--  Verification. Paste the whole thing into the Supabase SQL
--  editor and run. Every block prints what it found, and the
--  comment above it says what you should see.
-- ============================================================

-- 1. All eight functions from 004, 006 and 007. Expect 8 rows.
select 'functions' as check, proname
from pg_proc
where proname in (
  'owns_room','owns_case','owns_book','my_profile',
  'can_read_room','can_read_case','can_read_book_contents','book_pages_for_viewer',
  'refuse_nonempty_case','refuse_nonempty_room','can_read_room',
  'search_people','profile_by_username','username_available','can_view','is_approved','is_admin'
)
order by proname;

-- 2. The two delete guards must be attached, not just defined. Expect 2 rows:
--    cases_must_be_empty on cases, rooms_must_be_empty on rooms.
select 'triggers' as check, tgname, tgrelid::regclass::text as on_table
from pg_trigger
where tgname in ('cases_must_be_empty','rooms_must_be_empty')
order by tgname;

-- 3. Columns added by 002, 005 and 006. Expect:
--    books.visibility, pages.media_type, pages.visibility, pages.duration_ms,
--    rooms.visibility, profiles.username/first_name/last_name/dob/email/avatar_key
select 'columns' as check, table_name, column_name
from information_schema.columns
where (table_name = 'rooms'    and column_name = 'visibility')
   or (table_name = 'books'    and column_name = 'visibility')
   or (table_name = 'pages'    and column_name in ('visibility','media_type','duration_ms'))
   or (table_name = 'profiles' and column_name in ('username','first_name','last_name','dob','email','avatar_key'))
order by table_name, column_name;

-- 3b. Room sharing, added in 010. Expect the table, its two policies, and a
--     constraint allowing open / invited / closed.
select 'room_guests table' as check, tablename
from pg_tables where tablename = 'room_guests';

select 'room_guests policies' as check, policyname, cmd
from pg_policies where tablename = 'room_guests' order by policyname;

select 'room visibility' as check, pg_get_constraintdef(oid) as allows
from pg_constraint where conname = 'rooms_visibility_check';

-- 4. RLS must be on for every table. Expect 9 rows, all true.
select 'rls' as check, relname as table_name, relrowsecurity as enabled
from pg_class
where relname in ('profiles','rooms','cases','books','pages','notes','follows','doors','room_guests')
order by relname;

-- 5. Email and date of birth must NOT be readable by ordinary accounts.
--    Expect ZERO rows. Any row here means the revoke in 004 did not take.
select 'column leak' as check, grantee, column_name
from information_schema.column_privileges
where table_name = 'profiles'
  and column_name in ('email','dob')
  and grantee in ('authenticated','anon')
  and privilege_type = 'SELECT';

-- 6. Write policies must check the parent, not just the owner.
--    Expect 4 rows whose definition mentions owns_room / owns_case / owns_book.
select 'parent checks' as check, tablename, policyname,
       with_check is not null as has_with_check
from pg_policies
where schemaname = 'public'
  and policyname = 'edit_content'
  and tablename in ('cases','books','pages','notes')
order by tablename;

-- 7. Read policies down the privacy chain. Expect cases, books, pages, notes.
select 'read policies' as check, tablename, policyname
from pg_policies
where schemaname = 'public' and policyname = 'read_content'
order by tablename;

-- 8. Guest requests: only the other party may accept. Expect resolve_follow
--    with a definition mentioning initiated_by.
select 'guest policies' as check, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'follows'
order by policyname;

-- 9. Your own account. Check status is approved and role is admin.
select 'me' as check, email, username, status, role
from profiles
order by created_at;

-- 10. Nothing orphaned: every page belongs to a book that exists, and every
--     book to a case. Expect zero rows from both.
select 'orphan pages' as check, count(*) as n
from pages p left join books b on b.id = p.book_id
where b.id is null;

select 'orphan books' as check, count(*) as n
from books bk left join cases c on c.id = bk.case_id
where c.id is null;
