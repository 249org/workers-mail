# Workers Mail

A self-hosted mail workspace that runs entirely on your own Cloudflare account. It gives
you real inboxes on your own domains through Email Routing, and can also read existing
mailboxes elsewhere over IMAP.

- **Native mailboxes** — addresses on a domain you already run on Cloudflare. Inbound mail
  arrives through Email Routing, outbound goes through the `send_email` binding.
- **External IMAP mailboxes** — Gmail, Outlook, Fastmail, cPanel and anything else that
  speaks IMAP. Credentials are encrypted at rest, polled from a per-mailbox Durable Object,
  and sent through SMTP over `cloudflare:sockets`.

Cloudflare cannot run an IMAP or POP server, so this is not one. Hosted mail is Email
Routing plus Workers; external accounts are read as a client.

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

Everything else is an ordinary Next route handler under `src/app/api`.

## Prerequisites

- Node 20 or newer
- A Cloudflare account with Workers Paid (Durable Objects and Queues are not on the free plan)
- A domain on that account if you want native mailboxes
- Wrangler authenticated: `npx wrangler login`

## Setup

### 1. Install

```bash
npm install
```

### 2. Create the resources

```bash
npx wrangler d1 create workers-mail
```

```bash
npx wrangler r2 bucket create workers-mail
```

```bash
npx wrangler kv namespace create SESSION_STORE
```

```bash
npx wrangler queues create workers-mail-ingest
```

```bash
npx wrangler queues create workers-mail-ingest-dlq
```

Copy the D1 `database_id` and the KV `id` from the command output into `wrangler.jsonc`,
replacing `REPLACE_WITH_D1_DATABASE_ID` and `REPLACE_WITH_KV_NAMESPACE_ID`.

### 3. Apply the schema

```bash
npm run db:migrate:local
```

```bash
npm run db:migrate
```

Migrations live in `migrations/` and are generated from `src/lib/db/schema.ts` with
`npm run db:generate`.

### 4. Set the secrets

```bash
npx wrangler secret put MAIL_ENCRYPTION_KEY
```

A long random string. It encrypts IMAP and SMTP passwords with AES-GCM. Without it,
external mailboxes are refused rather than stored in the clear — losing it means
reconnecting every IMAP account.

```bash
npx wrangler secret put CLOUDFLARE_API_TOKEN
```

Optional, but needed to provision domains automatically. It requires
`Zone:Read`, `DNS:Read` and `Email Routing Rules:Edit` on the zones you plan to use.
Without it, domain verification tells you which DNS records to add by hand.

```bash
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
```

For local development, put the same values in a `.dev.vars` file — see
[`.dev.vars.example`](.dev.vars.example). It is git-ignored.

### 5. Deploy

```bash
npm run deploy
```

Open the deployed URL. The first visit offers to create the admin account; once one
account exists, registration closes.

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
| `npm run deploy` | Build and deploy the Worker |
| `npm run db:generate` | Regenerate migrations from the Drizzle schema |
| `npm run db:migrate` / `:local` | Apply migrations remotely or locally |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite |

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
