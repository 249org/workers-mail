<div align="center">

# Workers Mail

**Your mail. Your Cloudflare account. Nobody else hosts it.**

Keep Gmail. Keep Outlook. Keep the inbox you already have. Read them all from a mailbox
that lives on *your* Cloudflare account — not Google’s, not Microsoft’s, not ours.

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

## IMAP is the competitive edge

> [!IMPORTANT]
> **IMAP on a Cloudflare Worker.** Cloudflare can receive mail and send mail. It cannot
> *be* an IMAP server. Every other “mail on Workers” project stops there — native domains
> only. Workers Mail goes further: it is an IMAP **client** that runs at the edge, so the
> accounts you already have sit in the same inbox as the domains you already run.

That is the gap this project exists to close.

Cloudflare Email Routing is excellent for `you@yourdomain.com`. It cannot log into Gmail.
It cannot open Outlook. It cannot talk to Fastmail, iCloud, Yahoo, or Zoho.
Those inboxes stay somewhere else, and you still need another app to read them.

Workers Mail signs in as a client. Your mail stays at the provider you already pay.
A copy is indexed on storage **you** own (D1 and R2 on your account), so you can read,
search, and reply from one keyboard-first workspace — without handing the mailbox to a
third-party host.

### What you can actually do

| You want to… | What happens |
| --- | --- |
| Keep using Gmail, Outlook, Fastmail, iCloud, Yahoo, or Zoho | Connect the account. Mail stays there. You read and send from here. |
| Use a custom domain already on Cloudflare | Native mailbox via Email Routing — no IMAP needed. |
| Put every address in one place | One workspace, one search, one set of shortcuts. |
| Not give the mailbox to another company | The Worker, the index, and the encrypted passwords all sit on your Cloudflare account. |
| Know the login works before you save it | **Test connection** does a real IMAP sign-in and SMTP handshake first. |
| Type as little as possible | Enter an address; common hosts fill in. App-password providers tell you up front. |

In practice:

- **Read** — new mail is checked every few seconds while a tab is open. When you are away,
  a schedule checks every few minutes. Older mail fills in in the background, newest first,
  so the inbox is useful immediately.
- **Search** — operators you already know (`from:`, `is:unread`, `has:attachment`, `after:7d`)
  run against the copy on your account, not a remote round-trip.
- **Send** — replies go out through that account’s SMTP. Native Cloudflare addresses use
  the `send_email` binding instead.
- **Stay in control** — IMAP and SMTP passwords are encrypted with a key only you hold.
  If the key is missing, connecting is refused rather than stored in the clear.

Port 25 is blocked on Workers, so sending uses 587 (STARTTLS) or 465 (implicit TLS).
Accounts with two-factor authentication need an app password, not the login password.

After deploy, open the Worker URL. Connecting an IMAP mailbox creates the owner, or you
can register a password and add mailboxes later. Once an account exists, the screen is
sign-in only.

### Also in the box

- **Native mailboxes** — addresses on a domain you already run on Cloudflare. Inbound
  through Email Routing; outbound through `send_email`.
- **Keyboard-first** — `j`/`k` to move, `e` to archive, `c` to compose, `⌘K` for commands
  and search. Changes land locally before the network, so the list never waits.
- **Yours to lock down** — TOTP, session control, remote images blocked until you ask,
  HTML sanitised before it reaches the browser.

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

This is the path most people start with. You do not migrate off Gmail —
you add it.

**Settings → Mailboxes → Connect existing IMAP.** Type the address; the host and port
fill in for known providers. **Test connection** does a real IMAP login and SMTP
handshake before anything is saved.

| Provider | Filled in from | Notes |
| --- | --- | --- |
| Gmail | `@gmail.com`, `@googlemail.com` | App password if 2FA is on |
| Outlook | `@outlook.com`, `@hotmail.com`, `@live.com` | |
| Yahoo | `@yahoo.com` | App password required |
| Fastmail | `@fastmail.com` | App password scoped to IMAP and SMTP |
| iCloud | `@icloud.com`, `@me.com` | App-specific password |
| Zoho | `@zoho.com` | |
| Anything else that speaks IMAP | Hosts typed by hand | Username is usually the full address |

Two constraints worth knowing:

- Port 25 is blocked on Workers. Use 587 with STARTTLS or 465 with implicit TLS; the form
  rejects 25 at validation time rather than hanging on a socket timeout.
- Accounts with two-factor authentication need an app password, not the login password.

While a tab is open, the mailbox’s Durable Object checks for new mail every few seconds.
When nobody is watching, a cron trigger pokes it every five minutes and older mail fills
in page by page — newest first, so the inbox is current before the archive is.

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
