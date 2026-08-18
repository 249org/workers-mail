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
  background-dark: "#111113"
  foreground-dark: "#F0F0EE"
  card-dark: "#1C1C1F"
  primary-dark: "#5B78F5"
  highlight-dark: "#E07A5F"
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

## Typography

UI and body: Geist Sans, 13px, antialiased, `rlig` + `calt` + tabular nums. Page titles: Newsreader 28px, tracking-tight — settings headers and login wordmark only, never row labels or buttons. Eyebrows and field labels: Geist Mono 10px, uppercase, tracking 0.14–0.16em, muted. Section titles 14px semibold. Stat numerals 30px Newsreader.

## Layout

8px grid. App chrome `px-8`. Settings content max 64rem with a 11rem side nav. Mail is three hairline-split panes; the page never scrolls — panes do. The folder rail collapses to a 56px icon strip (`[`). The message list can hide so the reader fills the remaining width (`]`, Enter). Stats sit in a ruled strip of cells (borders on children, no outer double line). Empty states are centered, with a highlight-subtle icon well.

## Elevation & Depth

No drop shadows on content panels. Shadows only on floating chrome: compose modal, command palette, toasts (`0 8px 32px rgba(0,0,0,0.08)`). Sticky message header and compose footer may use `bg-card/90` + `backdrop-blur-md`. No gradients. No glass elsewhere.

## Shapes

Panel radius 4px. Inputs `rounded-lg` (8px), height 40px. Buttons `rounded-full`, height 32–36px. Icon-only exception: 36px square, `rounded-md`. Badges are small pills, height 20px. Registration marks: 7px hollow squares at corners of framed login/empty/stat regions.

## Components

- **Buttons:** pills. Primary filled; ghost hairline + card fill; quiet transparent; danger text. Press `scale(0.97)` at 130ms.
- **Fields:** transparent fill, hairline border, focus primary + 3px ring at 15% primary.
- **Lists:** `list-frame` — hairline outer, hairline between rows, no card radius stack.
- **Selected row / nav:** accent-subtle fill, primary text. No 2px accent bar.
- **Palette:** unanimated. Hairline panel, shadow allowed because it floats. ⌘K is the control surface for appearance (light, dark, system, colour templates), every settings page, and mail actions.

## Do's and Don'ts

Do group with a hairline. Do use terracotta only for milestones and wells. Do keep keyboard actions instant.

Don't put every region in a rounded-2xl floating card. Don't use primary for everything. Don't animate j/k, archive, or ⌘K. Don't use Inter-on-white-card, purple SaaS palettes, or glass everywhere.
