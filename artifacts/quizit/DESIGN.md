---
name: QuizIt
description: Arcade versus-screen for placement-exam practice — every surface staged as a match, not a dashboard.
colors:
  p1-cyan: "hsl(198 90% 58%)"
  p1-cyan-bright: "hsl(198 95% 68%)"
  p2-coral: "hsl(8 88% 60%)"
  xp-violet: "hsl(271 70% 65%)"
  timer-amber: "hsl(40 95% 55%)"
  crt-black: "hsl(220 14% 6%)"
  surface: "hsl(220 14% 10%)"
  surface-2: "hsl(220 15% 7%)"
  card: "hsl(220 14% 9%)"
  border: "hsl(220 10% 20%)"
  foreground: "hsl(0 0% 97%)"
  muted-foreground: "hsl(220 6% 63%)"
typography:
  display:
    fontFamily: "Anton, Arial Narrow, sans-serif"
    fontSize: "clamp(2rem, 5vw, 4.5rem)"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "0.01em"
  body:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 700
    letterSpacing: "0.18em"
  numeric:
    fontFamily: "JetBrains Mono, Menlo, monospace"
    fontWeight: 600
rounded:
  sm: "calc(0.3rem - 4px)"
  md: "calc(0.3rem - 2px)"
  lg: "0.3rem"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.p1-cyan}"
    textColor: "{colors.crt-black}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
---

# Design System: QuizIt

## Overview

**Creative North Star: "The Versus-Screen"**

QuizIt redesigns around a single refusal: this is not a dashboard with quiz features bolted onto cards. It is staged as a match. Every surface — the home hub, practice setup, the live duel — reads as a character-select or versus screen from 90s arcade fighting games: two opposing corners, a HUD strip of hard numbers, a select-grid of modes, and a clock that means something. The world is hard-edged and CRT-dark, not the soft blurred-glass neon-on-black look the product shipped with before (visible ancestry: `matiks-style` in the prior CSS — an explicit anti-reference for this redesign, not a starting point).

Two combat colors carry the surface at Committed strength: P1 electric cyan for the player's own corner and primary actions, P2 hot coral for the opponent's corner, destructive states, and urgency. They never blend into a gradient — they oppose, like a fighting game's corner colors. A third HUD color (violet) is reserved for XP/streak/achievement numbers only, kept out of the P1/P2 vocabulary so it never reads as "whose side."

**Key Characteristics:**
- Two-corner color opposition (P1 cyan vs. P2 coral), never mixed
- Hard-edged cabinet panels — small radius, 1–2px high-contrast borders, no blur/glass
- Condensed arcade-marquee display type for headlines and scores; tabular monospace for every number
- State changes are never color-only — always paired with a label, icon, or motion
- Numeric deltas (+10, ▲2) render inline, always visible, never hover-only

## Colors

The palette is Committed: cyan and coral each carry real surface weight (borders, active states, HUD chips), not just small accents on a neutral field.

### Primary
- **P1 Cyan** (`hsl(198 90% 58%)` / `--primary`): the player's own corner. Primary buttons, active nav state, "you" in every duel, focus rings, the logo's left half.

### Secondary
- **P2 Coral** (`hsl(8 88% 60%)` / `--secondary`): the opponent's corner. Also destructive/error state and duel-timer urgency — coral reads as "danger" and "opponent" at once, which is intentional: both are the thing working against you.

### Tertiary
- **XP Violet** (`hsl(271 70% 65%)` / `--highlight`): XP, streaks, achievements only. Kept distinct from P1/P2 so progress numbers never look like they belong to a side.

### Neutral
- **CRT Black** (`hsl(220 14% 6%)` / `--background`): the ground. A cool near-black, not pure black — reads as a lit screen in a dark room, not a void.
- **Surface** (`hsl(220 14% 10%)` / `--surface`) / **Surface-2** (`hsl(220 15% 7%)` / `--surface-2`): panel and sidebar fills, one step off the ground.
- **Border** (`hsl(220 10% 20%)` / `--border`): cabinet-bezel lines. Always visible at rest — this world doesn't hide its edges.
- **Foreground** (`hsl(0 0% 97%)`) / **Muted foreground** (`hsl(220 6% 63%)`): body and secondary text.

### Named Rules
**The Two-Corner Rule.** Primary and secondary never appear together as a gradient or blend. If a screen needs both, they sit in physically opposed positions (left/right, P1 tile/P2 tile) — never overlaid.

**The Timer Rule.** Amber (`hsl(40 95% 55%)` / `--warning`) is reserved for timer/urgency countdowns only. It never brands a resting element.

## Typography

**Display Font:** Anton (with Arial Narrow, sans-serif fallback)
**Body/Label Font:** Barlow Condensed (with Arial Narrow, sans-serif fallback)
**Numeric Font:** JetBrains Mono (with Menlo, monospace fallback)

**Character:** A hard-edged condensed pairing — Anton is a single-weight arcade-marquee display face used only for headlines, hero numbers, and moment screens (VICTORY/DEFEAT); Barlow Condensed carries every UI label, button, and nav item, always uppercase and tracked wide, standing in for the "hazard stencil" register the direction calls for. JetBrains Mono is reserved strictly for numbers that must align: scores, timers, ratings, ranks.

### Hierarchy
- **Display** (Anton, `clamp(2rem, 5vw, 4.5rem)`, line-height 0.95): page headlines (`WELCOME BACK, [NAME]`, `LEADERBOARD`), duel result screens.
- **Title** (Anton, ~1.5–2rem, uppercase): card/tile titles (`FIND A DUEL`, section headers like `MOVE LIST`).
- **Body** (Barlow Condensed, 600, 1rem): descriptions, question text, body copy.
- **Label** (Barlow Condensed, 700, 0.625rem, tracking 0.18em, uppercase): the `.label-micro` utility — HUD sub-labels, nav items, button text.
- **Numeric** (JetBrains Mono, tabular-nums): every score, timer, rating, XP, and rank value, via the `.numeric` utility.

### Named Rules
**The No Kicker Rule.** No eyebrow/kicker label above a heading, anywhere. The heading carries its own weight (`PageHeader` and `AuthLayout` render title only, no eyebrow line).

## Layout

Single main column with a `max-w-6xl` container, `AppShell`-driven: a fixed 240px left sidebar on desktop (`lg:` and above), a sticky top bar plus fixed bottom tab bar on mobile. Content padding is generous (`px-4 py-5` mobile, `px-6 py-8` desktop). HUD readouts (rating/streak/XP/accuracy) render as a divided horizontal strip (`divide-x` chips), not as separate stat cards, keeping them legible as one instrument panel rather than four repeated widgets.

## Elevation & Depth

Flat by default — this world does not use blurred/glassy shadow-as-decoration. Depth comes from borders (bezel edges) and a restrained selection glow (`.glow-primary` / `.glow-secondary`): a tight box-shadow ring plus soft spread, applied only on hover/active/selected states, never at rest.

### Shadow Vocabulary
- **`.glass-panel`** (`inset 0 1px 0 hsl(0 0% 100% / 0.06), 0 4px 16px -4px hsl(0 0% 0% / 0.5)`): a recessed "CRT screen" panel — an inset top hairline standing in for light catching a bezel edge. Used for results screens and secondary panels.
- **`.glow-primary` / `.glow-secondary`**: `0 0 0 1.5px <color>, 0 0 24px -4px <color>/0.6` — selection/hover only.

### Named Rules
**The Rest-State Rule.** No element glows or elevates at rest. Glow is earned by hover, focus, or selection.

## Shapes

Small, consistent radius (`--radius: 0.3rem`, ~5px) across buttons, inputs, cards, and badges — enough to soften without reading as a rounded "soft SaaS" shell. Mode-select tiles and duel player-badges use `border-2` at full corner-color strength (cyan or coral) instead of soft fills, echoing a fighter-select box. Avatars are square-cornered (`rounded-[calc(var(--radius)-4px)]`), not circular — a portrait frame, not a social-app bubble.

## Components

### Buttons
- **Shape:** `rounded-[var(--radius)]` (~5px), uppercase bold label, tracked wide.
- **Primary:** cyan fill, dark text, `hover:glow-primary`.
- **Secondary:** coral fill, dark text, `hover:glow-secondary`.
- **Outline:** transparent, 2px border, hover state turns border + text primary.
- **Ghost:** transparent border, hover reveals a border and background.

### Cards / Panels
- **`.surface-panel`:** flat cabinet bezel — `bg-card`, 1px border, small radius, no blur.
- **`.glass-panel`:** recessed screen panel with an inset hairline, used for moment/result screens.
- **Corner Style:** small radius, consistent with Shapes.

### Inputs / Fields
- **Style:** `bg-surface`, 2px border, small radius.
- **Focus:** border shifts to primary cyan; no glow ring (kept for buttons/tiles).

### Navigation
- **Desktop sidebar:** left-border-accent active state (2px cyan bar + tinted background), uppercase Barlow Condensed labels.
- **Mobile:** sticky top bar (logo, streak/XP counters, avatar) + fixed bottom tab bar, active tab in cyan with a spring-scale icon.

### Duel / Versus components
- **`PlayerBar` (P1/P2):** square avatar badge bordered in the player's corner color, name, and a mono score in that same color — always both corners visible, never just one.
- **`CircularTimer`:** ring countdown in primary cyan, switching to destructive coral under urgency (≤20% time or ≤5s).
- **`DisplayText3D`:** the K.O./result-screen wordmark — a solid offset "print-strike" layer in the opposing corner color behind a solid foreground word. No gradient fill (replaces the prior gradient-text implementation).

## Do's and Don'ts

### Do:
- **Do** pair every state change (correct/incorrect, P1/P2, timer urgency) with a label, icon, or motion — never color alone.
- **Do** show numeric deltas (+10, ▲2, streak −1) inline next to the value they changed, always visible.
- **Do** keep P1 (cyan) and P2 (coral) physically separated — opposite corners, opposite tiles, never blended.
- **Do** set every score, timer, rating, and rank in the numeric/monospace face with tabular figures.

### Don't:
- **Don't** use an eyebrow/kicker label above a page heading.
- **Don't** use gradient text or a gradient fill on any word or number.
- **Don't** use blur/glass as decoration (`backdrop-blur` for its own look) — the world is flat and hard-edged, not glassy.
- **Don't** default to `rounded-xl`/`rounded-2xl` panel corners — the system radius is small and consistent.
- **Don't** ship a same-size icon+heading+text card grid as page structure when the content has a real hierarchy (mode-select tiles are asymmetric and corner-colored, not a repeated card template).
