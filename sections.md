# Sections: Expanding Card Carousel ("UI Craft")

An interactive horizontal accordion/carousel where one card stays expanded
(showing title, icon, description and a link) while the others collapse into
thin vertical strips. Hovering, clicking, or focusing a strip expands it with
a smooth animated transition.

No build step, no framework — plain HTML + CSS + a small JS file.

---

## Files

| File         | Purpose                                              |
| ------------ | ---------------------------------------------------- |
| `index.html` | Demo page + the section markup                       |
| `main.css`   | All styles (namespaced under `.ui-craft-carousel`)   |
| `main.js`    | Activation logic (uses [anime.js](https://animejs.com) v3) |

---

## Add it to any website

### Step 1 — Copy the markup

Copy the whole `<section class="ui-craft-carousel"> ... </section>` block from
`index.html` into your page. Each card looks like this:

```html
<li class="carousel-item">
  <article>
    <h3>Card Title</h3>
    <p>Short description text.</p>

    <!-- 24x24 stroke icon -->
    <svg viewBox="0 0 24 24">
      <path d="..." />
    </svg>

    <a href="#"><span>Watch now</span></a>

    <img src="your-image.jpg" alt="" />
  </article>
</li>
```

Rules to keep it working:

- Keep the exact class names (`ui-craft-carousel`, `carousel-list`,
  `carousel-item`) and the wrapping `<ul>` / `<li>` structure.
- The **first** item must have `data-active="true"` in the HTML.
- Order inside `<article>` doesn't matter visually (everything is positioned),
  but keep all five elements present.
- Use square-ish images (720x720 recommended); they are cropped with
  `object-fit: cover`.

### Step 2 — Include the CSS

```html
<link rel="stylesheet" href="main.css" />
```

Everything is scoped under `.ui-craft-carousel`, so it will not conflict with
your existing styles.

### Step 3 — Include the JS (before `</body>`)

```html
<script src="https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js"></script>
<script src="main.js"></script>
```

That's it — hover/click/keyboard activation works out of the box.

---

## Matching your theme

### 1. Colors (automatic dark/light mode)

By default the section uses the system colors `canvas` (page background) and
`canvasText` (text color), so it **automatically matches light/dark themes**
and inherits your page's text color.

To force brand colors instead, override:

```css
.ui-craft-carousel {
  color: #f5f5f5; /* text + icon color */
}

.ui-craft-carousel .carousel-item {
  background: #101014;                            /* card background */
  border-color: rgb(255 255 255 / 0.12);          /* card border */
}
```

### 2. Control variables

These live on `.ui-craft-carousel` in `main.css`:

```css
.ui-craft-carousel {
  --gap: 8px;                              /* space between cards */
  --base: clamp(2rem, 8cqi, 80px);         /* collapsed strip width */
  --speed: 0.6s;                           /* all transition durations */
}
```

| Variable  | Effect                                                        |
| --------- | ------------------------------------------------------------- |
| `--gap`   | Gap between cards                                             |
| `--base`  | Width of collapsed strips (also drives padding/title offset)  |
| `--speed` | Expand animation speed and content fade timing                |

### 3. Size & shape

```css
.ui-craft-carousel .carousel-list {
  width: min(820px, calc(100% - 2rem));     /* overall width */
  height: clamp(300px, 40dvh, 474px);       /* overall height */
}

.ui-craft-carousel .carousel-item {
  border-radius: 8px;                        /* card rounding */
}
```

### 4. Typography

Cards use `font-family: monospace`. Swap it for your site font:

```css
.ui-craft-carousel article {
  font-family: "Your Font", sans-serif;
}
```

Title size is `1rem` on `h3`; description is `13px` on `p`.

### 5. Expanded vs collapsed ratio

The active card takes `10fr`, collapsed ones take `1fr`.
This value exists in **two places** — keep them in sync:

- `main.css` → `.carousel-list { grid-template-columns: 10fr 1fr 1fr ... }`
- `main.js` → `activateItem()` → `(i === index ? '10fr' : '1fr')`

Example: for a wider active card use `'14fr'` in both places.

### 6. Image treatment

Active images are shown in full color; inactive ones are desaturated with a
radial fade mask. To change the look:

```css
.ui-craft-carousel article img {
  filter: grayscale(1) brightness(1.5);   /* collapsed state */
  mask: radial-gradient(100% 100% at 100% 0, #fff, transparent);
}
```

Remove the `mask` line for hard-edged images, or set `filter: none` to always
show full color.

### 7. Mobile breakpoint

Below `700px` the layout tightens (narrower gutters, smaller max text width).
Adjust in the `@media (max-width: 700px)` block at the bottom of `main.css`.

---

## Full theme override example

Drop this **after** `main.css` to restyle without touching the original file:

```css
.ui-craft-carousel {
  --gap: 12px;
  --speed: 0.45s;
  color: #eaeaf0;
}

.ui-craft-carousel .carousel-item {
  background: #14141a;
  border-color: rgb(255 255 255 / 0.14);
  border-radius: 16px;
}

.ui-craft-carousel article {
  font-family: Inter, system-ui, sans-serif;
}

.ui-craft-carousel article img {
  mask: none; /* solid image edges */
}
```

---

## Behavior notes

- **Activation triggers:** `pointerenter`, `click`, and `focusin`
  (keyboard users tabbing into a card's link expand it too).
- **`data-active="true"`** on a `.carousel-item` reveals its content via CSS;
  JS sets/unsets it automatically.
- **`--article-width`:** JS measures the widest card and pins the article
  width so text never reflows mid-animation. Recalculated on window resize.
- **Content pop-in:** anime.js adds a small translate/scale entrance on top of
  the CSS fades. If you don't want the dependency, you can delete the two
  `anime({...})` calls in `main.js` — the pure-CSS transitions still handle
  the reveal.

## Browser requirements

Modern browsers only (2023+): needs animatable `grid-template-columns`,
container queries, `color-mix()`, and `linear()` easing — Chrome/Edge 113+,
Firefox 112+, Safari 17.2+. No polyfills included.
