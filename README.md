# The Reading Room

A web app where your slide decks, photo sets and video clips become books on
shelves, in rooms, in a building you walk through. Click a spine, the book comes
off the shelf, the cover opens, and the pages turn. The left page is yours to
write on.

Live: https://reading-room-pi.vercel.app

---

## What it does

**A building.** Each floor holds four rooms behind four doors, with stairs up
and down. Inside a room you face one wall at a time and turn between them:
three walls carry bookcases, the fourth is the door back out.

**Bookcases.** Two on each of three walls, six to a room. Every case is five
shelves of five books — twenty five a case, a hundred and fifty a room. Walls
with books are shown close up, at the distance where a spine is readable; empty
walls and the door wall are shown whole, from across the room.

**Books.** Upload a PDF, a set of photos, or video clips, and each becomes a
page. Three layouts, chosen at upload:

- *Slide right, notes left* — the left page is a rich text editor
- *An image on every page* — two visible at once, like an album
- *One image across both* — the picture spans the gutter

You can also start an empty notebook: no images, just blank pages to write on,
recto and verso. Page one of any upload becomes the cover.

**Privacy, in three layers.** A room can be closed, so guests see a blurred door
reading "Visitors not allowed". A book can be private, so its spine stays on the
shelf but its pages don't open. A single page can be hidden, so a guest sees a
blank page in the right place and the running order doesn't shift. All three are
enforced by database policies, not by the interface.

**Guests.** Find people by username or name, ask to visit their building, or
invite them into yours. Either side can ask; only the other side can accept.
The two directions are independent — being someone's guest doesn't make them
yours, and you can ask for the second direction at any time.

**Accounts.** Sign up with name, date of birth, email, username and password.
New accounts wait for an admin to approve them before they see anything. Sign in
with a password, a magic link, or a six digit code. Profile picture, password
changes and profile edits live behind the menu.

**Deleting.** A book can go at any time, taking its pages, its notes and its
files in storage. A case can go once it holds no books; a room once it holds no
cases. Owner only, and the emptiness rules are triggers in the database.

---

## How it is built

Next.js App Router on Vercel · Supabase for Postgres and auth · Cloudflare R2 for
media · pdf.js for extraction · TipTap for notes · hand written CSS 3D for the
rooms and the page turn.

```
app/
├── page.tsx                 landing; redirects a signed-in user onward
├── login, signup, pending   password, magic link or code; the waiting room
├── floor/                   your building, one floor at a time
├── room/[roomId]/           one room: turn between walls, pick a case
├── book/[bookId]/           the reader
├── people/                  search, guest requests both directions
├── profile/                 name, username, picture, password
├── admin/                   approve and suspend accounts
├── u/[username]/            someone else's building, read only
└── api/
    ├── auth/resolve         username to email, for password sign in
    ├── auth/check-username  is this name free
    ├── upload/presign       signs the browser's uploads to R2
    ├── books/[id]/commit    writes page rows once the upload lands
    ├── pages/[id]/url       a signed read URL, if you may see that page
    ├── pages/[id]/download  a signed download, owner only
    └── profile/avatar       signs an avatar upload

components/
├── space/Space.tsx          the corridor: a four walled 3D box
├── space/RoomStage.tsx      a room: one wall at a time, floor anchored
├── floor/FloorView.tsx      doors, stairs, closed rooms, room creation
├── room/RoomView.tsx        walls, bookcases, spines, shelf paging
├── reader/Reader.tsx        leaves, page turn, three layouts, video, privacy
├── reader/NoteEditor.tsx    TipTap with autosave
├── upload/AddBookFlow.tsx   the four step add-a-book bubble
├── people/PeopleView.tsx    search and guest requests
└── ui/                      menu, bubbles, profile form

lib/
├── supabase/{client,server,middleware,admin}.ts
├── r2.ts                    presign, stat, delete, key layout
├── pdf/extract.ts           PDF, image and video to storage-ready blobs
├── guard.ts                 uuid validation and rate limiting
└── constants.ts             the caps: 6 cases, 25 books, 50MB, 200MB
```

### Three Supabase clients, on purpose

Not duplication — three environments, each reaching cookies differently.
`client.ts` runs in the browser. `server.ts` runs in server components and
cannot write cookies, which is why its `setAll` swallows errors.
`middleware.ts` runs before everything and is the only one that can refresh
them, which is why `middleware.ts` at the root exists at all. Removing its
`getUser()` call breaks sessions in ways that look random.

`admin.ts` is the service role client. Server only, bypasses RLS entirely, and
must never be imported into a client component. Exactly one route uses it.

### Permissions live in the database

Every table has row level security, and the rule is a chain of functions:
`can_view(owner)` for whether you may see someone's things at all, then
`can_read_room` → `can_read_case` → `can_read_book_contents` for the privacy
layers. Content policies on `cases`, `books`, `pages` and `notes` are generated
from that chain.

This matters most for media. `/api/pages/[id]/url` looks the page up **as the
signed-in user** and only signs a URL if that query returns a row. Someone
holding a valid page id but no permission gets a 404, because the check is a
policy rather than an `if` in a component. Downloads are stricter still: an
explicit owner comparison, so a guest looking at the same page on screen is
refused the file.

Hidden pages never reach the browser at all. `book_pages_for_viewer()` returns
one row per page with `locked` true and a null key where you may not look — the
shape of the book without its contents.

Writes check the parent, not just the row: you cannot insert a case into
someone else's room, or a book into someone else's case, even with your own id
on it.

Approval works the same way. A `pending` account is authenticated but every
table returns nothing, so poking at the API directly gets zero rows.

### Storage

Private R2 bucket, no public development URL, no custom domain. The browser
uploads straight to R2 with a presigned PUT, so bytes never pass through Vercel.
Reads are short lived presigned GETs.

```
u/{user_id}/b/{book_id}/p/{page_id}.{webp|mp4|webm|mov}
u/{user_id}/b/{book_id}/t/{page_id}.webp        poster or thumbnail
u/{user_id}/avatar/{uuid}.webp                  512px square
```

Keyed by page **id**, never page number, so reordering never touches R2. Every
id from the browser is checked against a strict UUID pattern before it becomes
part of a key — otherwise a "page id" of `../../../someone-else/x` writes
outside its own prefix.

**Sizes.** Pages render at 1800px and encode down a quality ladder until they
fit a 320KB budget: a slide stops at the top rung, a dense photograph steps
down. Images and PDFs are capped at 50MB per file, video at 200MB. Video is
uploaded as-is by default, with an optional in-browser re-encode to 1280px —
that runs in real time, so it is a choice rather than a default. Anything
heavier belongs on a server.

### The page turn

A book of N slides renders N+1 leaves. Leaf 0's front is the cover; leaf `i`'s
front is slide `i-1`; leaf `i`'s back is the left hand content for slide `i`. At
`k` leaves flipped, the left page is the back of leaf `k-1` and the right is the
front of leaf `k` — both resolve to index `k-1`, which is what keeps a note
beside its own slide. Opening the cover is just flipping leaf 0, which is why
the open and the turn are one continuous motion.

For the continuous layout the artwork is drawn at double page width and each
face clips its own half. A flipped leaf's back face has net zero rotation, so
its local x already matches screen x and needs no mirroring correction.

---

## Running it locally

Requires Node 18.18 or newer.

```bash
git clone https://github.com/suyog12/reading-room.git
cd reading-room
npm install
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/
```

`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# server only, never NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET=reading-room

# local only, for scripts/sql.mjs. Not needed in production.
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

`R2_ENDPOINT` must **not** include the bucket name. The dashboard shows it with
the bucket appended; the SDK appends it itself.

Migrations, in order. Either paste into the Supabase SQL editor, or run them
from the terminal once `DATABASE_URL` is set:

```bash
node --env-file=.env.local scripts/sql.mjs supabase/schema.sql
node --env-file=.env.local scripts/sql.mjs supabase/002_accounts.sql
node --env-file=.env.local scripts/sql.mjs supabase/003_guests.sql
node --env-file=.env.local scripts/sql.mjs supabase/004_security.sql
node --env-file=.env.local scripts/sql.mjs supabase/005_video.sql
node --env-file=.env.local scripts/sql.mjs supabase/006_privacy.sql
node --env-file=.env.local scripts/sql.mjs supabase/007_delete.sql
node --env-file=.env.local scripts/sql.mjs supabase/008_fix_column_grants.sql
node --env-file=.env.local scripts/sql.mjs supabase/009_page_hidden.sql
```

Then `supabase/verify.sql` checks every function, trigger, policy and grant is
in place. It connects as the owner, so it proves the policies exist rather than
that they work — testing whether a guest is actually blocked needs two accounts
in a browser.

Supabase dashboard:

- Authentication → Providers → Email on, Confirm email on
- Authentication → URL Configuration → Site URL and a `/**` redirect for every
  environment. The Site URL is what confirmation emails fall back to, so if it
  still says localhost the live signup links point at localhost
- Authentication → Email Templates → Magic Link → include `{{ .Token }}` or the
  six digit code option has no code to send
- Project Settings → Authentication → SMTP → custom SMTP, or the built in
  sender rate limits you within a few test logins
- Settings → API → JWT expiry 900

Cloudflare R2: a private bucket, an API token scoped to it with Object Read &
Write, and CORS listing every origin you use:

```json
[{
  "AllowedOrigins": ["http://localhost:3000", "https://your-app.vercel.app"],
  "AllowedMethods": ["PUT", "GET", "HEAD"],
  "AllowedHeaders": ["content-type"],
  "ExposeHeaders": ["etag"],
  "MaxAgeSeconds": 3600
}]
```

`AllowedHeaders` must be exactly `["content-type"]`. A wildcard passes the
preflight and then fails the signed PUT.

Verify storage, then run:

```bash
node --env-file=.env.local scripts/check-r2.mjs
npm run dev
```

Sign up, then promote yourself:

```sql
update profiles set status = 'approved', role = 'admin'
where email = 'you@example.com';
```

---

## Things that will trip you up

Every one of these cost real time to find.

**An API route returning your login page as HTML.** The middleware redirects
anyone without a session to `/login`, and `/api` has to be excluded — otherwise
a `fetch` follows the redirect and gets HTML where it expected JSON. Every API
route checks the session itself.

**`Failed to fetch` on upload** is CORS, every time. `check-r2.mjs` runs in
Node, which ignores CORS entirely, so storage can be perfectly configured while
the browser is still blocked.

**A blank beige page in a room** means a wall is being drawn in front of the
camera. In CSS 3D a child at negative Z sits behind its parent's own painted
surface, and anything at positive Z is magnified until it fills the screen.
Everything on a wall projects forward; the wall behind you is not drawn.

**`DOMMatrix is not defined`** means pdf.js was imported at module scope.
`"use client"` does not stop a module being evaluated on the server for the
first render, so it needs a dynamic `import()` inside a handler.

**A column-level `REVOKE` that does nothing.** A table-level `GRANT SELECT`
already implies every column, so the grant has to come off at the table level
and go back on column by column.

**`cannot change return type of existing function`** — `CREATE OR REPLACE` can
change a function's body but not its signature. Drop it first.

**`syntax error at or near "position"`** — reserved word. Fine as a column, not
fine as a bare name in a `returns table` declaration. Quote it.

**A 404 on a route whose file plainly exists** is a stale Turbopack cache,
common after copying files in from outside the editor. Delete `.next` and
restart.

**Sessions dropping at random** are the `getUser()` call missing from
`lib/supabase/middleware.ts`, or a redirect built with a fresh `NextResponse`
that throws away the refreshed cookies.

---

## Deliberate gaps

- **No backups.** No database dump, no bucket copy. This is the highest
  probability way to lose everything and it is not yet solved.
- No per-user storage cap. `bytes_quota` exists and defaults to unlimited. The
  50MB limit is per file, which is not the same thing.
- `/api/auth/resolve` confirms whether a username exists and returns its email.
  It cannot require a session, since it runs before login. Rate limited per
  process, which on serverless is a speed bump rather than a wall.
- A signed URL is a bearer token for its lifetime — an hour for pages, two
  minutes for downloads. Anyone you forward one to can open it until it expires.
- The owner can read everything, including notes. Protection here is from
  guests, not from whoever runs the server.
- No two factor authentication for accounts yet. Supabase supports TOTP.
- PDF rendering is on the main thread. Fine to about forty pages.
- `middleware.ts` uses the convention Next 16 deprecated. It works, it warns.
- Desktop only in practice; the rooms are built for a pointer and a wide screen.
- No page reordering, no moving books between cases, no deck replacement.

## Not built

Comments, activity feeds, per book share links, search inside decks, PPTX with
speaker notes, a true 3D room, role based access beyond owner and guest.
