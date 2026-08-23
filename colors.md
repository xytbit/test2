# colors.md — DCITC Theme Reference

How color works on this site: a **dark-first, single-accent terminal
theme**. One green accent on near-black surfaces, an ink ramp for text
hierarchy, hairlines instead of shadows, and semantic amber/red used
sparingly. Everything is a CSS custom property — change the value once
in `static/css/01-vars.css` and the whole site re-skins in both themes.

---

## How theming is wired

1. `:root` in `01-vars.css` defines the **dark theme** (the default).
2. `html[data-theme="light"]` overrides only what differs.
3. The attribute is set **pre-paint** by an inline script in
   `partials/head.html` (reads `localStorage['dcitc-theme']`, falls
   back to dark), then flipped at runtime by `theme.js`. No flash of
   wrong theme.
4. Components NEVER hard-code colors — they consume tokens
   (`var(--bg-elev)`, `var(--line)`, …). Derived tints use
   `color-mix(in srgb, <token> X%, transparent)`.

---

## Surfaces

| Token         | Dark       | Light       | Used for                        |
|---------------|------------|-------------|---------------------------------|
| `--bg`        | `#0c0f13`  | `#f5f5f1`   | page background                 |
| `--bg-elev`   | `#11151b`  | `#ffffff`   | raised surfaces (cards, inputs) |
| `--bg-elev-2` | `#161b23`  | `#eeeee8`   | higher surface (footer frost)   |
| `--bg-tint`   | white 1.5% | black 1.2%  | hover wash on rows              |

Surfaces step *lighter* as they rise in dark mode, and toward pure
white in light mode. Never introduce new grays — stack elevation
tokens or mix `--ink` into `--bg`.

## Ink (text ramp)

| Token        | Dark      | Light     | Role                          |
|--------------|-----------|-----------|-------------------------------|
| `--ink`      | `#e8ebf0` | `#181c22` | primary text                  |
| `--ink-dim`  | `#9aa3b1` | `#4e5765` | body/secondary text           |
| `--ink-faint`| `#626c7c` | `#7d8593` | meta, codes, disabled         |

Three steps only. If text feels "not enough", move up a ramp step —
don't invent an intermediate gray.

## Hairlines & backdrop

| Token          | Dark              | Light             | Role                    |
|----------------|-------------------|-------------------|-------------------------|
| `--line`       | ink @ 9% alpha    | ink @ 10% alpha   | card/list borders       |
| `--line-strong`| ink @ 18% alpha   | ink @ 18% alpha   | emphasized/input border |
| `--grid-line`  | ink @ 4% alpha    | ink @ 5% alpha    | fixed bg grid pattern   |

Borders are translucent ink, not solid grays — they adapt automatically
if `--ink` changes. The site's look is hairline-separated, so most
cards have `border: 1px solid var(--line)` and NO shadow until hover.

## Accent (brand)

| Token          | Dark                          | Light                          |
|----------------|-------------------------------|--------------------------------|
| `--accent`     | `#4fd1a5` (mint green)        | `#157a5b` (deep green)         |
| `--accent-ink` | `#0b1511` (text ON accent)    | `#f2faf6`                      |
| `--accent-soft`| accent @ 10% alpha            | accent @ 9% alpha              |
| `--accent-line`| accent @ 35% alpha            | accent @ 32% alpha             |
| `--glow`       | `0 0 28px` accent @ 16%       | `0 0 24px` accent @ 14%        |

Usage discipline:

- Accent marks **interaction and identity**: links, CTAs, active tags,
  focus rings (`border-color: var(--accent-line)` +
  `box-shadow: var(--glow)`), kickers' numbers, status pills.
- Never large fills except tiny badges (`--accent-soft` background +
  `--accent` text).
- The light theme uses a darker green purely for contrast on white —
  same hue family, not a different brand color.

## Semantic colors

| Token pair          | Dark / Light     | Meaning                          |
|---------------------|------------------|----------------------------------|
| `--amber`,`--amber-soft` | `#d8b077` / `#a5712f` | "ongoing" / in-progress status |
| `--red`,`--red-soft`     | `#d9787a` / `#b54a4d` | terminal window dot, errors    |

## Effects

| Token            | Dark                | Light               |
|------------------|---------------------|---------------------|
| `--shadow`       | black @ 35%, 40px   | slate @ 10%, 34px   |
| `--noise-opacity`| 0.05                | 0.035               |

Shadows are reserved for lifted/hovering cards; flat is the default.
The `.grain` overlay uses SVG turbulence at `--noise-opacity`.

---

## Generated artwork exception

SVG plates (project covers, gallery seeds, event decks) use
`PLATE_COLORS` / `--plate-bg: #0a0e13` and **stay dark in both
themes** — deliberate, like photos in a magazine. They're tinted with
CSS (opacity/masks) when they need to sit quieter.

## Recipes already in use

```css
/* quiet fill derived from a token */
background: color-mix(in srgb, var(--bg-elev) 86%, transparent);
/* frost glass layering (footer) */
linear-gradient(180deg,
  color-mix(in srgb, var(--bg-elev-2) 52%, transparent),
  color-mix(in srgb, var(--bg-elev) 30%, transparent));
/* dimmed noise */
feColorMatrix → gray, alpha 0.09;
```

## Rules for new components

1. Consume tokens only — zero hex codes outside `01-vars.css`.
2. Need a new tone? Derive with `color-mix()` from existing tokens.
3. Both themes must be verified (pixel-sample screenshots if opacity
   matters); contrast target ≥ 4.5:1 for text.
4. Accent is scarce: if everything glows, nothing does.
5. Respect `prefers-reduced-motion` for any glow/shadow animation.

## Re-skinning the accent (example)

Swap two values in `01-vars.css` to rebrand:

```css
--accent: #4fd1a5;   /* dark-theme accent */
--accent-ink: #0b1511;
```
and in the light block:
```css
--accent: #157a5b;
--accent-ink: #f2faf6;
```
Every glow, focus ring, link, tag and CTA follows automatically.
