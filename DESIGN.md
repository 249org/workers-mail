---
name: Workers Mail
description: Keyboard-first mail workspace drawn as hairline regions on paper, with pill controls.
colors:
  background: "#F9F9F8"
  foreground: "#18181A"
  card: "#FFFFFF"
  primary: "#3B5BDB"
  primary-foreground: "#FFFFFF"
  secondary: "#F4F4F2"
  muted-foreground: "#6B6B70"
  accent-wash: "#EBEBEA"
  accent-subtle: "#EEF1FF"
  border: "#E4E4E1"
  destructive: "#DC3544"
  success: "#059669"
  warning: "#D97706"
  highlight: "#C45C3E"
  highlight-subtle: "#FBF0EC"
  background-dark: "#17171A"
  foreground-dark: "#EEEDE8"
  card-dark: "#202024"
  primary-dark: "#3B5BDB"
  highlight-dark: "#D4785C"
typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  reading:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  eyebrow:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.15em"
  stat:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "30px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.02em"
rounded:
  panel: "4px"
  input: "8px"
  pill: "999px"
spacing:
  grid: "8px"
  page-x: "32px"
  header-y: "12px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.pill}"
    height: "34px"
    padding: "0 14px"
  button-ghost:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    height: "34px"
    padding: "0 14px"
  panel:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.panel}"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.input}"
    height: "40px"
---

## Overview

Workers Mail is drawn, not stacked. Regions are hairline frames on a warm off-white field. The only fully curved things are pressable controls. Brand lives in that contrast, in Geist vs Newsreader, and in terracotta used rarely.

Operate mode: three-pane mail, settings as a ruled document, login as a framed sheet. Light and dark follow the operator's Appearance setting (System / Light / Dark). Colour templates (Meridian, Harbor, Grove, Ember, Ink, Dusk) remap primary, highlight, and paper; structure does not change.

## Colors

Meridian is the default. Primary is interactive: buttons, selected nav, unread dots, focus. Accent-subtle tints selected and active rows. Accent-wash is hover on ghost controls and stat cells. Highlight is for icon wells, required asterisks, and identity initials — never routine status. Status stays success / warning / destructive. Extra hues exist only as operator-chosen templates in Settings → Appearance, never as one-off component colours.

Dark is night paper of the same pigment, not a neon invert. Canvas and card step apart; hairlines and muted type are mixed from night ink so panes still read. Primary stays the light ink (white text on the pill). Ink is black and white only: the pill is black on paper, white on charcoal, so it still reads. No gold, no brown.

## Typography

UI chrome: Geist Sans, 13px, antialiased, `rlig` + `calt` + tabular nums. Page titles: Newsreader 28px, tracking-tight — settings headers, login wordmark, and the reading-pane subject (the title of the letter). Never Newsreader on row labels or buttons. Eyebrows and field labels: Geist Mono 10px, uppercase, tracking 0.14–0.16em, muted. Section titles 14px semibold. Stat numerals 30px Newsreader. Message body is a reading role, not UI density: Geist Sans 16px, line-height 1.7, measure 65ch (42rem). In the letter, all-caps section lines and HTML `h2` use the mono eyebrow. Dark body adds a hair of tracking and leading.

## Layout

8px grid. App chrome `px-8`. Mail is three hairline-split panes; the page never scrolls — panes do. Each pane starts with a 56px toolbar so search and reading actions sit on one axis. The folder rail collapses to a 56px icon strip (`[`) — that control lives on the list, to the left of search; Compose fills the sidebar toolbar. The message list can hide so the reader fills the remaining width (`]`, Enter) — that control lives on the reader. Only the 56px reader toolbar sticks; the letterhead (Newsreader subject, byline, date) scrolls away. The letter itself is a centered 42rem sheet, not edge-to-edge UI text. Settings is an index and a spread: a paper rail of destinations with a live one-line status, and a full-height card page for the open topic. Moving between destinations is instant — the rail and spread swap on click, with no transition, and visited pages stay mounted. The spread head holds the Newsreader title; the body is a ruled ledger or form that fills the pane. Stats sit in a ruled strip of cells (borders on children, no outer double line). Empty states are centered, with a highlight-subtle icon well.

Auth (login / first-run) follows the Cloudflare dashboard login: a split page, then a **centered 22.5rem (360px) column**. Inside that column every field, OAuth control, and button is `width: 100%` and shares the same left/right edge. Do not stretch controls across the half-page pane, and do not size the primary button independently of the inputs.

## Elevation & Depth

No drop shadows on content panels. Shadows only on floating chrome: compose modal, command palette, toasts (`0 8px 32px rgba(0,0,0,0.08)`). Sticky message header and compose footer may use `bg-card/90` + `backdrop-blur-md`. No gradients. No glass elsewhere.

## Shapes

Panel radius 4px. Inputs `rounded-lg` (8px), height 40px. Buttons `rounded-full`, height 32–36px. Icon-only exception: 36px square, `rounded-md`. Badges are small pills, height 20px. Registration marks: 7px hollow squares at corners of framed login/empty/stat regions.

## Components

- **Buttons:** pills. Primary filled; ghost hairline + card fill; quiet transparent; danger text. Press `scale(0.97)` at 130ms. In a form column, every non-icon button is `width: 100%` of that column — same edges as the fields, never independently sized.
- **Fields:** transparent fill, hairline border, focus primary + 3px ring at 15% primary. Auth fields live in a 22.5rem column (Cloudflare dashboard login). Inside the column they are 100% width. Never stretch them across the split pane.
- **Lists:** `list-frame` — hairline outer, hairline between rows, no card radius stack.
- **Selected row / nav:** accent-subtle fill, primary text. No 2px accent bar.
- **Palette:** unanimated. Hairline panel, shadow allowed because it floats. ⌘K is the control surface for appearance (light, dark, system, colour templates), every settings page, and mail actions.
- **Tour:** framed sheet over the workspace, registration marks, a three-pane sketch. Skip is always visible. Keyboard actions inside the tour do not animate.
- **Shortcut settings:** ruled list-frame rows. Click a binding to listen; primary ring while recording.
- **Reader:** sticky 56px toolbar (actions + truncated subject). The letter is `.message-sheet`, max 42rem, centered. Newsreader subject, byline, then 16px body for plaintext. HTML mail keeps its own tables, colours, and buttons; remote images stay blocked until Show images. All-caps section lines in plaintext render as mono eyebrows. No shadow on the sheet.

## Do's and Don'ts

Do group with a hairline. Do use terracotta only for milestones and wells. Do keep keyboard actions instant.

Don't put every region in a rounded-2xl floating card. Don't use primary for everything. Don't animate j/k, archive, ⌘K, or settings destinations. Don't use Inter-on-white-card, purple SaaS palettes, or glass everywhere. Don't size a Sign in button or field independently of the form column, and don't expand that column past 22.5rem to fill empty pane space.
