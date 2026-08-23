# make.md — Portable "Indexed Feature List" Section

A drop-in recipe for adding the home page **"03 — What we do"** section
(the compact numbered list: `SYS.01 Study groups …`) to **any** website,
styled to match that site's existing theme.

Zero dependencies. No JS required — works as plain HTML + CSS.

---

## 1. Anatomy

```
section.featured                 ← full-width band
  div.featured-in                ← centered container (max-width + padding)
    header.featured-head         ← kicker line + heading
      p.kicker                   ← "03 — What we do" mono eyebrow
      h2                         ← display heading
    ul.feat-list                 ← the rows
      li.feat-row                ← grid: code | title | description
        span.feat-code           ← mono index ("SYS.01")
        span.feat-title          ← row title
        span.feat-desc           ← one-line description
```

Design rules that make it look right:

- Rows are separated by **1px hairlines**, not card boxes.
- Generous but compact vertical rhythm (~0.7rem padding per row).
- The mono index column is narrow and fixed (`3.5rem`); title and
  description share the remaining width 1fr / 1fr.
- Everything is baseline-aligned so mixed font sizes sit on one line.

---

## 2. HTML (copy-paste)

```html
<section class="featured" id="what-we-do">
  <div class="featured-in">
    <header class="featured-head">
      <p class="kicker">03 — What we do</p>
      <h2>Six study groups. Four project teams. One lab.</h2>
    </header>
    <ul class="feat-list">
      <li class="feat-row">
        <span class="feat-code">SYS.01</span>
        <span class="feat-title">Study groups</span>
        <span class="feat-desc">Weekly, public, notes-first.</span>
      </li>
      <!-- repeat li.feat-row as needed -->
    </ul>
  </div>
</section>
```

Use your own index prefix (`SYS`, `01`, `A`…). Keep codes short so the
fixed column never wraps.

---

## 3. CSS (copy-paste)

Self-contained: every value reads a custom property with a sane
fallback, so it renders acceptably even on a site with no design
system at all.

```css
.featured {
  /* ---- theme hooks: override these to match any site ---- */
  --fx-bg:        var(--bg, #ffffff);
  --fx-ink:       var(--ink, #111418);
  --fx-ink-dim:   var(--ink-dim, #5a616b);
  --fx-ink-faint: var(--ink-faint, #9aa1ab);
  --fx-line:      var(--line, #e3e6ea);
  --fx-accent:    var(--accent, #157a5b);
  --fx-font-body: var(--font-body, system-ui, sans-serif);
  --fx-font-disp: var(--font-disp, var(--fx-font-body));
  --fx-font-mono: var(--font-mono, ui-monospace, monospace);

  background: var(--fx-bg);
  color: var(--fx-ink);
  font-family: var(--fx-font-body);
}
.featured-in {
  max-width: 72rem;
  margin-inline: auto;
  padding: clamp(2rem, 6vh, 4rem) clamp(1rem, 4vw, 3rem);
}
.featured-head { margin-bottom: clamp(1.25rem, 3vh, 1.75rem); }
.featured .kicker {
  font-family: var(--fx-font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  color: var(--fx-accent);
  margin: 0 0 0.4rem;
}
.featured-head h2 {
  font-family: var(--fx-font-disp);
  font-size: clamp(1.4rem, 3vw, 2rem);
  letter-spacing: -0.02em;
  margin: 0;
}

/* the list */
.feat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.feat-row {
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: baseline;
  padding: 0.7rem 0.4rem;          /* compact — the key measurement */
  border-bottom: 1px solid var(--fx-line);
}
.feat-row:first-child { border-top: 1px solid var(--fx-line); }
.feat-code {
  font-family: var(--fx-font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  color: var(--fx-ink-faint);
}
.feat-title {
  font-family: var(--fx-font-disp);
  font-weight: 600;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
}
.feat-desc {
  color: var(--fx-ink-dim);
  font-size: 0.95rem;
  line-height: 1.35;
}

/* mobile: collapse to stacked rows */
@media (max-width: 720px) {
  .feat-row { grid-template-columns: 2.5rem minmax(0, 1fr); }
  .feat-desc { grid-column: 2; }
}

/* respect users who disable motion (if you add reveal animations) */
@media (prefers-reduced-motion: reduce) {
  .feat-row { transition: none; animation: none; }
}
```

---

## 4. Matching ANY theme — the 5-minute procedure

The component only needs **six tokens**. Map them onto the host site:

| Token           | Look at the host site for…            | If missing, derive with `color-mix`            |
|-----------------|----------------------------------------|------------------------------------------------|
| `--fx-bg`       | page/section background               | —                                              |
| `--fx-ink`      | primary text color                    | —                                              |
| `--fx-ink-dim`  | secondary text                        | `color-mix(in srgb, var(--fx-ink) 65%, var(--fx-bg))` |
| `--fx-ink-faint`| captions/meta text                    | `color-mix(in srgb, var(--fx-ink) 40%, var(--fx-bg))` |
| `--fx-line`     | borders/hairlines                     | `color-mix(in srgb, var(--fx-ink) 12%, var(--fx-bg))` |
| `--fx-accent`   | links/buttons accent                  | —                                              |

Steps:

1. **Find the host's variables.** Search its CSS for `:root { --… }`.
   If the site uses custom properties, pass them straight through:
   `--fx-bg: var(--their-bg);` — done.
2. **If no variables exist**, hard-code sampled values (from the site's
   computed styles) into the `--fx-*` block once. Nothing else in the
   component references raw colors, so this is the only edit needed.
3. **Fonts:** point `--fx-font-disp` at the host's heading font and
   `--fx-font-mono` at whatever it uses for code/meta text. If the host
   has no mono font, keep `ui-monospace` — the index column still reads
   as "technical".
4. **Dark/light:** because every color routes through the six tokens,
   supporting a theme switch is automatic if the host's own vars flip.
   For manual themes, redefine the six tokens inside the host's
   `.dark` / `[data-theme="dark"]` scope.
5. **Density tuning:** the whole vertical footprint is controlled by
   ONE value — `.feat-row`'s `padding`. `0.7rem` fits ~5 rows plus a
   heading in a 650px-tall viewport. Raise toward `1.15rem` for airy
   marketing pages; drop to `0.55rem` for dense dashboards.
6. **Accent usage is deliberately minimal** (kicker only). If the host
   theme is loud, leave it; if minimal, also tint `.feat-code`.

### Anti-patterns (break the look)

- Wrapping rows in bordered/shadowed cards — the hairline separation
  IS the design.
- Letting descriptions wrap to 3+ lines; keep them to one sentence.
- Justifying or centering text; left-align everything.
- Fixed pixel paddings instead of rem (breaks user font-size prefs).

---

## 5. Optional: scroll-reveal (progressive enhancement)

If the host already has an intersection-observer reveal utility, add
its attribute/class to `.feat-list` children and stagger by ~60ms.
Ship it so the list is fully visible without JS (start visible, animate
only when JS adds an `is-ready` class). Never hide content behind
`opacity: 0` in pure CSS.

---

## 6. Integration checklist

- [ ] Six `--fx-*` tokens mapped to host values (step 1–2 above)
- [ ] Heading font + mono font wired to host families
- [ ] Viewed at 1440px, 768px, 375px — no horizontal overflow
- [ ] Rows stay ≤ ~73px tall; whole section fits target viewport height
- [ ] Keyboard-only pass: list is static content, nothing focusable
      unless you add links (then give them a visible focus ring)
- [ ] Dark AND light theme screenshots taken
- [ ] `prefers-reduced-motion` honored if animations were added
