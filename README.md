<div align="center">

# Workers Mail

**Your mail. Your Cloudflare account. Nobody else hosts it.**

A keyboard-first mailbox that runs entirely on Workers — native inboxes on domains you
already operate, plus IMAP for mail that still lives at Gmail, Outlook, Fastmail, one.com,
or anywhere else that speaks the protocol.

<br />

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/249org/workers-mail">
  <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" height="56" />
</a>

<br />

One click clones this repo to your GitHub, provisions **D1, R2, KV, Queues, and Durable Objects**
on your account, applies the schema, and deploys the Worker. You will be asked for a
`MAIL_ENCRYPTION_KEY` (run `openssl rand -hex 32`) so IMAP passwords are never stored in the clear.

Requires [Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) — Durable Objects and Queues are not on the free plan.

</div>

---

Read, search, and send without handing the mailbox to a third-party host. Cloudflare cannot
be an IMAP server, so hosted mail is Email Routing plus this Worker; other providers are
read as a client. Credentials stay encrypted with a key you hold.

- **Native mailboxes** — addresses on a domain you already run on Cloudflare. Inbound mail
  arrives through Email Routing; outbound goes through the `send_email` binding.
- **External IMAP** — existing accounts. Passwords are encrypted at rest, polled from a
  per-mailbox Durable Object, and sent through SMTP over `cloudflare:sockets`.
- **Keyboard-first** — `j`/`k` to move, `e` to archive, `c` to compose, `⌘K` for commands
  and search. Mutations land locally before the network, so the list never waits.
- **Yours to lock down** — TOTP, session control, remote images blocked until you ask,
  HTML sanitised before it reaches the browser.

After deploy, open the Worker URL. Connect an IMAP mailbox (that creates the owner) or
register a password and add mailboxes later. Once an account exists, the screen is sign-in
only.

## Architecture

```
Browser (Next.js App Router via OpenNext)
   │
   ├─ HTTP ────────► D1        users, domains, mailboxes, folders, message index,
   │                           routing rules, contacts, API keys, delivery log
   │
   ├─ WebSocket ───► Mailbox Durable Object (one per mailbox id)
   │                           hibernatable socket fan-out, alarm-driven IMAP poll
   │
   ├─ Queue ───────► ingest consumer  (parse MIME, index, notify the DO)
   │
   ├─ R2 ──────────► raw .eml and attachment bytes
   │
   └─ send_email / SMTP sockets ─► outbound, restricted to addresses you may send as
```

The Worker entry in [`worker/index.ts`](worker/index.ts) wraps the OpenNext handler and
owns everything Next cannot do itself:

| Path | Why it lives in the Worker |
| --- | --- |
| `/api/mail/stream` | A route handler cannot return a 101 WebSocket upgrade |
| `/api/mail/send` | Needs `cloudflare:email` and `cloudflare:sockets` |
| `/api/mail/test-connection` | Needs `cloudflare:sockets` |
| `/api/mail/setup` | First-run onboarding verifies IMAP over sockets |

Everything else is an ordinary Next route handler under `src/app/api`.

## Keyboard

Press `?` anywhere for the full list; it is generated from the same table the
dispatcher reads, so it cannot fall out of date.

| Keys | Action |
| --- | --- |
| `j` / `k` | Next / previous message |
| `Enter`, `o` | Open · `Esc` closes or steps back |
| `e`, `#`, `s`, `u` | Archive, trash, star, mark unread |
| `x`, `Shift+A` | Select row, select all |
| `c`, `r`, `a`, `f` | Compose, reply, reply all, forward |
| `⌘K` | Command palette and search |
| `/` | Focus search |
| `⌘Z` | Undo the last archive or trash |
| `⌘Enter` | Send |
| `g` then `i` `s` `d` `a` `,` | Inbox, sent, drafts, archive, settings |

### Search operators

Search accepts operators in either the list search box or the palette:

```
from:sam is:unread has:attachment after:7d "quarterly review"
```

`from:` `to:` `subject:` `in:<folder>` `is:unread|read|starred` `has:attachment`
`before:` / `after:` (accepting `7d`, `2w`, `6m`, `1y`, `today` or `2024-03-01`).
Anything that is not a recognised operator is matched as free text, so a half-typed
query still searches instead of erroring.

### A note on motion

Animation follows the frequency rule from Emil Kowalski's design-engineering
guidance: the more often a user sees something, the less it should animate. Cursor
movement, archive, star and the command palette are **completely unanimated** — at
hundreds of repetitions a day, a transition there reads as lag. Motion is spent only
where it is rare: the compose sheet gets a reduced 220ms fade, and the first-run
connect flow is the one place with any flourish. All of it collapses to opacity under
`prefers-reduced-motion`.

## Prerequisites

- Node 20 or newer
- A Cloudflare account with Workers Paid (Durable Objects and Queues are not on the free plan)
- A domain on that account if you want native mailboxes
- Wrangler authenticated: `npx wrangler login`

## Setup

The [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/249org/workers-mail)
button above is the intended path. It reads `wrangler.jsonc`, creates every binding this
app needs, runs D1 migrations, and sets up Workers Builds so later pushes redeploy.

To do the same from your machine:

### 1. Install

```bash
npm install
```

### 2. Create the resources

Skip this if Wrangler already provisioned them on deploy. Otherwise:

```bash
npx wrangler d1 create workers-mail
npx wrangler r2 bucket create workers-mail
npx wrangler kv namespace create SESSION_STORE
npx wrangler queues create workers-mail-ingest
npx wrangler queues create workers-mail-ingest-dlq
```

Copy the D1 `database_id` and the KV `id` from the command output into `wrangler.jsonc`.

### 3. Apply the schema

```bash
npm run db:migrate:local
npm run db:migrate
```

Migrations live in `migrations/` and are generated from `src/lib/db/schema.ts` with
`npm run db:generate`. `npm run deploy` applies remote migrations before shipping.

### 4. Set the secrets

```bash
npx wrangler secret put MAIL_ENCRYPTION_KEY
```

A long random string (`openssl rand -hex 32`). It encrypts IMAP and SMTP passwords with
AES-GCM. Without it, external mailboxes are refused rather than stored in the clear —
losing it means reconnecting every IMAP account.

```bash
npx wrangler secret put CLOUDFLARE_API_TOKEN
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
```

Optional, but needed to provision domains automatically. The token requires
`Zone:Read`, `DNS:Read` and `Email Routing Rules:Edit` on the zones you plan to use.
Without it, domain verification tells you which DNS records to add by hand.

For local development, put the same values in a `.dev.vars` file — see
[`.dev.vars.example`](.dev.vars.example). It is git-ignored.

### 5. Deploy

```bash
npm run deploy
```

Open the deployed URL and connect a mailbox or create the first account.

## Connecting a domain

1. Go to **Settings → Domains** and add the domain.
2. Press **Verify**. With an API token set, this resolves the zone, turns on Email Routing,
   creates a routing rule per mailbox pointing at this Worker, and reports which required
   DNS records are present.
3. Add the records the checklist marks as missing:

   | Type | Name | Value | Purpose |
   | --- | --- | --- | --- |
   | MX | `example.com` | `route1.mx.cloudflare.net` (priority 12) | Inbound mail |
   | MX | `example.com` | `route2.mx.cloudflare.net` (priority 51) | Inbound mail |
   | MX | `example.com` | `route3.mx.cloudflare.net` (priority 93) | Inbound mail |
   | TXT | `example.com` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | Authorise sending |
   | TXT | `_dmarc.example.com` | `v=DMARC1; p=none; rua=mailto:dmarc@example.com` | DMARC reports |

4. Verify again. Receiving turns on once the MX records resolve; sending needs the SPF
   record too, and is refused until then.
5. Create a mailbox on the domain in **Settings → Mailboxes**, and optionally a catch-all
   rule so unmatched addresses land somewhere instead of bouncing.

## Connecting an existing IMAP account

**Settings → Mailboxes → Connect existing IMAP.** Common providers are filled in from the
address you type. **Test connection** runs a real IMAP login and SMTP handshake before
anything is saved.

Two constraints worth knowing:

- Port 25 is blocked on Workers. Use 587 with STARTTLS or 465 with implicit TLS; the form
  rejects 25 at validation time rather than hanging on a socket timeout.
- Accounts with two-factor authentication need an app password, not the login password.

Sync runs on two cadences. While a browser tab is open the mailbox's Durable Object polls
about every 20 seconds; when nothing is connected the cron trigger pokes it every five
minutes and it uses the idle time to backfill older mail page by page.

## Local development

```bash
npm run dev
```

Durable Objects do not run under `next dev`, so realtime updates fall back to polling and
IMAP sync is unavailable. For the full stack against local emulated bindings:

```bash
npm run preview
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server with local bindings |
| `npm run preview` | Full OpenNext build, served on workerd |
| `npm run deploy` | Apply D1 migrations, then build and deploy the Worker |
| `npm run db:generate` | Regenerate migrations from the Drizzle schema |
| `npm run db:migrate` / `:local` | Apply migrations remotely or locally |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite |

## Layout

```
src/lib/keyboard/     shortcut table and the scope-stack dispatcher
src/lib/mail/         search parser, query layer, MIME, routing, client view store
src/components/mail/  three-pane workspace
src/components/palette/  the ⌘K surface
worker/               entry, Durable Object, queue consumer, socket-bound routes
```

## API

Every route under `/api` accepts either the session cookie or an API key created in
**Settings → API keys**:

```bash
curl -H "Authorization: Bearer wmk_..." https://your-worker.example.com/api/mailboxes
```

Keys are stored as a SHA-256 hash and shown once at creation. Sending is capped at 60
messages per hour per user, and login attempts at 10 per five minutes per IP.

## Security notes

- IMAP and SMTP passwords are encrypted with AES-GCM under `MAIL_ENCRYPTION_KEY` and never
  logged. If the key is missing, connecting an external mailbox fails rather than degrading.
- Message HTML is run through an allow-list sanitiser before it reaches the browser. Remote
  images are dropped until the reader asks for them, which stops tracking pixels firing on
  open.
- Attachment downloads require a session or API key, are served with
  `Content-Security-Policy: default-src 'none'; sandbox` and `X-Content-Type-Options: nosniff`.
- Every mailbox query is scoped by owner, so an id from another account resolves to a 404.
