# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Operators who already run domains on Cloudflare and want a keyboard-first mail workspace on their own account, including people whose mail is hosted elsewhere (IMAP such as one.com) and read from this client.

## Product Purpose

Self-hosted mail on a Cloudflare Worker: native inboxes via Email Routing, plus external IMAP/SMTP accounts. Success is being able to read, search, and send from your own domains and existing mailboxes without a third-party host.

## Positioning

The mailbox runs entirely on the operator's Cloudflare account (D1, R2, Durable Objects, Queues, Email). Cloudflare cannot be an IMAP server; hosted mail is Email Routing plus Workers, and other providers are read as a client.

## Operating Context

Desktop web, keyboard-first (j/k, ⌘K, g then i/s/d/a, `[` sidebar, `]` full-width reader). ⌘K runs appearance, settings, and mail actions without leaving the current page. Used many times a day; list navigation and archive must feel instant. First-run is connecting a real mailbox (email + IMAP/SMTP hosts typed by hand + webmail password), then a short keyboard tour. Shortcuts are listed and reassigned in Settings → Shortcuts. Light and dark follow the OS, or an explicit Light / Dark choice from Appearance or ⌘K.

## Capabilities and Constraints

- Settings: domains, mailboxes, signature (plain-text sign-off, optional per mailbox), contacts, API keys, appearance (saved colour templates), keyboard shortcuts (reassignable), privacy (remote images, contact collection), security (password, TOTP 2FA, sessions).
- IMAP/SMTP over `cloudflare:sockets`; port 25 blocked; passwords encrypted with `MAIL_ENCRYPTION_KEY`.
- Workers Paid required (Durable Objects, Queues).
- Visual world is brief-pinned: Meridian (hairline panels vs pill controls; Geist Sans / Geist Mono / Newsreader; terracotta highlight, slate-blue primary).

## Brand Commitments

Name: Workers Mail. Visual system pinned by the operator: panels are hairline-delimited regions, not elevated cards; only pressable controls are fully curved; color restrained; brand in precise details.

## Evidence on Hand

README, running Worker, live login/connect flow. No marketing copy, testimonials, or third-party logos to fabricate.

## Product Principles

- The tool disappears into the task; chrome is a drawing, not furniture.
- Keyboard actions used hundreds of times a day do not animate.
- Credentials stay on the operator's account; never degrade to storing them in the clear.
- Grouping is a hairline, not a floating card.

## Accessibility & Inclusion

Honor `prefers-reduced-motion` (opacity/color only). Body and muted text meet WCAG contrast on both palettes. Focus rings use primary at 15% wash.
