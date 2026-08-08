# The Reading Room — where everything sits

Copy the contents of this folder into the `reading-room` project the scaffold
created on your Desktop. Paths already match, so it merges in place.
It will overwrite the default `app/page.tsx`, which is intended.

## What each file does

```
reading-room/
├── .env.local                    your keys. Already in .gitignore. Never commit.
├── middleware.ts                 runs on every request; refreshes the session
│                                 cookie and bounces logged-out users to /login
│
├── app/
│   ├── page.tsx                  the front door. Logged out -> /login.
│   │                             Not approved -> /pending. Approved -> greeting.
│   ├── login/page.tsx            email box that sends a magic link
│   ├── auth/callback/route.ts    where the emailed link lands. Trades the code
│   │                             in the URL for a real session cookie.
│   ├── pending/page.tsx          holding screen for unapproved accounts
│   └── admin/page.tsx            your approve / suspend list. Admin only.
│
├── lib/
│   ├── supabase/client.ts        Supabase client for browser components
│   ├── supabase/server.ts        Supabase client for server components
│   ├── supabase/middleware.ts    the session-refresh logic middleware.ts calls
│   ├── r2.ts                     presign uploads and reads, stat, delete
│   └── constants.ts              the locked caps: 4 cases, 25 books, 20MB
│
├── scripts/
│   └── check-r2.mjs              proves R2 works before you build on it
│
└── supabase/
    └── schema.sql                tables, RLS policies, triggers.
                                  Run in the Supabase SQL editor, not locally.
```

## Why there are three Supabase clients

Not redundancy — three different environments, each with its own way of
reaching cookies:

- **client.ts** runs in the browser. Reads cookies from `document`.
- **server.ts** runs in server components. Reads cookies from the Next request,
  and cannot write them, which is why its `setAll` swallows errors.
- **middleware.ts** runs before everything. It is the only one that can
  actually refresh and write cookies, which is why it must exist.

## Run order

1. `npm install` (already done by the scaffold)
2. Copy `pdfjs` worker: `cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/`
3. Run `supabase/schema.sql` in the Supabase SQL editor
4. Supabase dashboard:
   - Authentication > Sign In / Providers > Email: on, Confirm email on
   - Authentication > URL Configuration: Site URL `http://localhost:3000`,
     Redirect URLs `http://localhost:3000/**`
   - Project Settings > Authentication > SMTP Settings: your Gmail values
5. Cloudflare: create bucket `reading-room`, private, API token scoped to it,
   CORS with `"AllowedHeaders": ["content-type"]`
6. `node --env-file=.env.local scripts/check-r2.mjs` — must print OK
7. `npm run dev`

## First login

Visiting `localhost:3000` bounces you to `/login`. Enter your email, click the
link, and you land on `/pending` — correct, because the trigger created you as
pending. Then in the Supabase SQL editor:

```sql
update profiles set status = 'approved', role = 'admin'
where id = '<your uuid from Authentication > Users>';
```

Reload and you should see the greeting plus a "Manage accounts" link.

## Then test the gate

Sign up a second address, leave it pending, and confirm from that session that
it sees nothing. Every content policy is generated from the same pair, so that
single check validates all of them.

## Not built yet

Upload pipeline, the room UI, the reader. Those come after the checks above
pass, in that order.
