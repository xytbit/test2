/* ==================================================================
   DCITC THEME MODULE  —  static/js/theme.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
     The dark/light color scheme switcher (the sun/moon button in the
     nav, rendered by partials/header.html as [data-theme-toggle]).

   HOW IT CONNECTS:
     - CSS side: 01-vars.css defines all colors as custom properties on
       :root (dark defaults) and overrides them under
       html[data-theme="light"]. Setting the attribute here instantly
       re-skins every component. `colorScheme` is synced so native
       widgets (scrollbars, form controls) follow too.
     - HTML side: partials/head.html has an inline pre-paint script
       that reads localStorage('dcitc-theme') and sets data-theme BEFORE
       first paint — this module only handles user interaction after
       load, so there is never a flash of the wrong theme.
     - Boot: main.js calls DCITC.theme.init() (see JS_FILES order in
       scripts/build.js).

   BEHAVIOUR:
     - Click toggle → flip dark↔light, persist to localStorage, apply.
     - Follows OS prefers-color-scheme changes live, but ONLY while the
       user hasn't made an explicit choice (no stored key).
     - localStorage access is wrapped in try/catch for private mode.
   ================================================================== */
(function () {
  'use strict';

  var KEY = 'dcitc-theme';                 // localStorage key (shared with head.html inline script)
  var root = document.documentElement;     // <html data-theme="…">
  var sys = window.matchMedia('(prefers-color-scheme: light)');

  function current() {
    return root.getAttribute('data-theme') || 'dark';
  }
  // apply a theme to <html>; CSS vars + native widgets react immediately
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
  }

  // toggle button handler: flip, persist, apply
  function toggle() {
    var next = current() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
    apply(next);
  }

  function init() {
    // wire the nav button ([data-theme-toggle] in header.html)
    var btn = document.querySelector('[data-theme-toggle]');
    if (btn) btn.addEventListener('click', toggle);

    // follow system changes unless the user chose manually
    var onChange = function (ev) {
      try {
        if (!localStorage.getItem(KEY)) apply(ev.matches ? 'light' : 'dark');
      } catch (e) { apply(ev.matches ? 'light' : 'dark'); }
    };
    if (sys.addEventListener) sys.addEventListener('change', onChange);
    else if (sys.addListener) sys.addListener(onChange); // older Safari
  }

  // register on the shared namespace consumed by main.js
  window.DCITC = window.DCITC || {};
  window.DCITC.theme = { init: init };
})();

/* ==================================================================
   DCITC HORIZONTAL SCROLLER  —  static/js/horizontal.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
     The signature interaction of the site: on viewports ≥900px the
     page is a horizontal filmstrip. This module drives it.

   HOW IT CONNECTS:
     - Markup: pages wrap their sections in
         <main id="main" class="hx" data-horizontal> … <section class="sec"> …
       (see src/pages/*.html). No such main → the page is vertical and
       initVertical() tracks document scroll instead (article.html).
     - CSS side: 04-layout.css makes body.hx-body/main.hx a flex row
       with overflow-x:auto; 06-horizontal.css adds drag cursors.
       The 900px breakpoint here MUST match --hx-break in 01-vars.css
       and the @media rules in the CSS files.
     - Progress bar: .progress-fill (partials' .progress strip under
       the nav) is filled from real scroll position, both modes.
     - Parallax: any [data-plx="0.03"] element translates with scroll;
       the fixed .bg-grid backdrop counter-moves slightly (04-layout.css).
     - Boot: main.js calls DCITC.horizontal.init().

   BEHAVIOUR:
     - Wheel: deltaY/deltaX mapped to horizontal goal; eased at 0.16
       per frame toward the goal ("drive" mode). Snap was deliberately
       REMOVED — pure smooth manual scroll only.
     - Keyboard: arrows/PageUp/PageUp/Home/End/Space (when not typing
       in a field). Space = page-right.
      - Mouse drag: pointer capture on main, grabs unless the target is
        interactive (a/button/input/.nav-links/[data-more]…) or inside a
        [data-hx-nodrag] zone (e.g. the home hero's WebGL sphere — drags
        there orbit the 3D view instead of panning the strip).
     - Touch: untouched — native horizontal pan of the scroll container.
     - prefers-reduced-motion: easing disabled (instant jumps).
     - Below 900px everything unbinds (disable()) and CSS stacks
       sections vertically; progress bar switches to document scroll.
   ================================================================== */
(function () {
  'use strict';

  // public namespace — main.js calls DCITC.horizontal.init()
  var HX = window.DCITC.horizontal = {};

  var main = null;        // <main data-horizontal> (null on vertical pages)
  var elProgress;         // .progress-fill bar under the nav
  var enabled = false;    // listeners bound? (true only ≥900px)
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mq = window.matchMedia('(min-width: 900px)');  // keep in sync with CSS --hx-break

  var goal = null;      // desired scrollLeft (wheel / keys / drag)
  var mode = null;      // 'drive' while easing toward goal, null when idle
  var raf = null;       // active animation-frame handle
  var lastMax = 0;      // cached max scroll for UI math

  function getMax() {
    var m = main.scrollWidth - main.clientWidth;
    return m > 0 ? m : 0;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function measure() {
    lastMax = getMax();
  }

  // set a new scroll target and make sure the rAF loop is running
  function setGoal(g, m) {
    goal = clamp(g, 0, getMax());
    mode = m;
    if (!raf && enabled) raf = requestAnimationFrame(loop);
  }

  // fill the fixed progress bar (0–100% of horizontal travel)
  function updateUI(x) {
    var max = lastMax;
    var pct = max > 0 ? clamp(x / max, 0, 1) : 0;
    if (elProgress) elProgress.style.width = (pct * 100).toFixed(2) + '%';
  }

  // the single rAF loop: eases scrollLeft toward `goal`, then updates
  // progress + parallax every frame regardless of mode
  function loop() {
    raf = null;
    var cur = main.scrollLeft;
    var max = getMax();

    if (mode) {
      var delta = goal - cur;
      var eased = delta * 0.16;          // smoothing factor — the "feel"
      if (reduced) { eased = delta; }    // reduced motion: jump instantly
      var next = Math.abs(eased) < 0.6 ? goal : cur + eased;
      main.scrollLeft = clamp(next, 0, max);
      if (Math.abs(goal - main.scrollLeft) < 0.6) {
        mode = null;                     // arrived — stop driving
        goal = null;
      }
      raf = requestAnimationFrame(loop);
    }

    updateUI(main.scrollLeft);
    parallax(main.scrollLeft);
  }

  /* --- input ----------------------------------------------------- */

  // wheel → horizontal. Vertical wheel intent scrolls the strip.
  // EXCEPTION: [data-vzone] regions (e.g. the resources card list) are
  // vertical scroll zones — return WITHOUT preventDefault so native
  // wheel scrolls that zone's content. Everything else, including a
  // section's header/chrome around the zone, keeps panning horizontally.
  function onWheel(e) {
    if (!enabled) return;
    if (e.ctrlKey || e.metaKey) return; // pinch-zoom / page zoom
    if (e.target.closest('[data-vzone]')) return;
    e.preventDefault();
    var d = e.deltaY + e.deltaX;
    d = clamp(d, -140, 140);            // tame huge trackpad flings
    var base = (mode === null) ? main.scrollLeft : goal;
    setGoal(base + d, 'drive');
  }

  // keyboard paging; ignored while focus is in a form field
  function onKey(e) {
    if (!enabled) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    var k = e.key;
    if (k === ' ') { e.preventDefault(); k = 'ArrowRight'; } // space = page right
    var map = {
      ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1,
      PageDown: 1, PageUp: -1, Home: 'home', End: 'end'
    };
    if (k in map) {
      e.preventDefault();
      if (map[k] === 'home') setGoal(0, 'drive');
      else if (map[k] === 'end') setGoal(getMax(), 'drive');
      else setGoal(main.scrollLeft + Math.sign(map[k]) * Math.min(main.clientWidth * 0.85, 1000), 'drive');
    }
  }

  // native scrolling (touch pan, scrollbar drag): just sync UI
  function onScroll() {
    updateUI(main.scrollLeft);
    parallax(main.scrollLeft);
  }

  /* --- mouse drag -------------------------------------------------- */

  var drag = null;
  function onPointerDown(e) {
    if (!enabled || e.button !== 0 || e.pointerType !== 'mouse') return;
    // never hijack presses on interactive elements or 3D/drag zones
    if (e.target.closest('a, button, input, select, textarea, details, [data-more], .nav-links, [data-hx-nodrag]')) return;
    drag = { x: e.clientX, start: main.scrollLeft, moved: false };
    mode = null; goal = null;           // hand control to the pointer
    main.classList.add('is-drag-ready');
    try { main.setPointerCapture(e.pointerId); } catch (err) {}
  }
  function onPointerMove(e) {
    if (!drag) return;
    var dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) { drag.moved = true; main.classList.add('is-dragging'); }
    if (drag.moved) {
      main.scrollLeft = clamp(drag.start - dx, 0, getMax()); // direct 1:1 drag
    }
  }
  function onPointerUp(e) {
    if (!drag) return;
    main.classList.remove('is-dragging', 'is-drag-ready');
    drag = null;
  }

  function onResize() { measure(); if (enabled && mode === null) { updateUI(main.scrollLeft); } }

  /* --- parallax ------------------------------------------------------ */

  // shift [data-plx] layers proportionally to scroll; grid drifts back
  function parallax(x) {
    var els = main.querySelectorAll('[data-plx]');
    for (var i = 0; i < els.length; i++) {
      var f = parseFloat(els[i].getAttribute('data-plx') || '0');
      if (!reduced) els[i].style.transform = 'translateX(' + (x * f).toFixed(1) + 'px)';
    }
    var grid = document.querySelector('.bg-grid');
    if (grid && !reduced) grid.style.transform = 'translateX(' + (-x * 0.02).toFixed(1) + 'px)';
  }

  /* --- lifecycle ------------------------------------------------------ */

  // bind everything (called when viewport crosses to ≥900px)
  function enable() {
    if (enabled) return;
    enabled = true;
    measure();
    main.addEventListener('wheel', onWheel, { passive: false });
    main.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('keydown', onKey);
    main.addEventListener('pointerdown', onPointerDown);
    main.addEventListener('pointermove', onPointerMove);
    main.addEventListener('pointerup', onPointerUp);
    main.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', onResize);
    if (!raf) raf = requestAnimationFrame(loop);
    updateUI(main.scrollLeft);
  }

  // unbind + reset (called below 900px; CSS takes over stacking)
  function disable() {
    enabled = false;
    main.removeEventListener('wheel', onWheel);
    main.removeEventListener('scroll', onScroll);
    document.removeEventListener('keydown', onKey);
    main.removeEventListener('pointerdown', onPointerDown);
    main.removeEventListener('pointermove', onPointerMove);
    main.removeEventListener('pointerup', onPointerUp);
    main.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('resize', onResize);
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    mode = null; goal = null;
    if (elProgress) elProgress.style.width = '0%';
    parallax(0);
  }

  // vertical fallback for pages without <main data-horizontal>
  // (article.html): progress bar tracks normal document scroll.
  function initVertical() {
    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? window.scrollY / max : 0;
      if (elProgress) elProgress.style.width = (pct * 100).toFixed(2) + '%';
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // entry point (main.js). Decides horizontal vs vertical and reacts
  // live when the viewport crosses the 900px breakpoint.
  HX.init = function () {
    main = document.querySelector('main[data-horizontal]');
    elProgress = document.querySelector('.progress-fill');

    if (!main) { initVertical(); return; }

    var apply = function (e) { (e.matches) ? enable() : disable(); };
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
    apply(mq);
  };
})();

/* ==================================================================
   DCITC REVEAL SYSTEM  —  static/js/reveal.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
     Scroll-in animations: elements fade/slide in as they enter the
     viewport, the hero headline lines rise out of a clip mask, and
     decorative SVG paths draw themselves.

   HOW IT CONNECTS:
     - CSS side (09-anim.css): [data-reveal] / [data-stagger] children
       start hidden ONLY under html.js (the class is added by the
       inline script in partials/head.html, so no-JS visitors see
       everything). Adding .is-in — here or via the safety net —
       triggers the CSS transition. Stagger delays are pure CSS
       (:nth-child → --d custom property).
     - Markup side: pages opt in with data-reveal[="fade|left|right|
       scale|up"] or data-stagger on a parent; hero uses
       .hero-line > .hl spans; decorative SVGs use class="draw-line".
     - anime.js (vendored, loaded before app.js in partials/scripts.html)
       animates the hero lines + stroke-dashoffset of .draw-line.
     - Boot: main.js calls DCITC.reveal.init().

   BEHAVIOUR:
     - IntersectionObserver reveals at 12% visibility; unobserves after.
     - Safety net: a rAF-throttled scroll/resize pass force-reveals
       anything already in view or scrolled PAST — covers fast jumps
       (Home/End keys, anchor links) that the observer can miss in a
       horizontally-scrolling layout.
     - prefers-reduced-motion: everything is revealed instantly, no
       anime.js calls at all.
   ================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // hero headline: .hero-line clips overflow; inner .hl slides up
  function heroReveal() {
    var lines = document.querySelectorAll('.hero-line .hl');
    if (!lines.length) return;
    if (reduced || !window.anime) {
      lines.forEach(function (l) { l.classList.add('is-in'); });   // CSS fallback position
      return;
    }
    window.anime({
      targets: lines,
      translateY: ['112%', '0%'],                    // from below the clip
      easing: 'cubicBezier(0.16, 1, 0.3, 1)',
      duration: 950,
      delay: window.anime.stagger(130, { start: 200 })
    });
  }

  // decorative SVG strokes draw themselves (stroke-dasharray trick;
  // dash values are set in 09-anim.css .draw-line)
  function drawLines() {
    var paths = document.querySelectorAll('.draw-line');
    if (!paths.length || !window.anime || reduced) return;
    window.anime({
      targets: paths,
      strokeDashoffset: [1, 0],
      easing: 'easeInOutQuad',
      duration: 1600,
      delay: window.anime.stagger(140, { start: 400 })
    });
  }

  function init() {
    var els = document.querySelectorAll('[data-reveal], [data-stagger]');

    if (reduced || !('IntersectionObserver' in window)) {
      // no motion / no observer: show everything immediately
      els.forEach(function (el) { el.classList.add('is-in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add('is-in');
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      els.forEach(function (el) { io.observe(el); });

      // safety net: reveal anything in view after fast scrolls the
      // observer may have skipped (e.g. Home/End jumps on the
      // horizontal strip). rAF-throttled so it costs one pass/frame.
      var ticking = false;
      function revealVisible() {
        ticking = false;
        els.forEach(function (el) {
          if (el.classList.contains('is-in')) return;
          var r = el.getBoundingClientRect();
          if (!(r.top >= window.innerHeight || r.left >= window.innerWidth)) {
            el.classList.add('is-in');
            io.unobserve(el);
          }
        });
      }
      window.addEventListener('scroll', function () {
        if (!ticking) { ticking = true; requestAnimationFrame(revealVisible); }
      }, { passive: true });
      window.addEventListener('resize', revealVisible);
      revealVisible();
    }

    heroReveal();
    drawLines();
  }

  // register on the shared namespace consumed by main.js
  window.DCITC = window.DCITC || {};
  window.DCITC.reveal = { init: init };
})();

/* ==================================================================
   DCITC PAGE TRANSITIONS  —  static/js/transitions.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
     The subtle exit animation between pages: internal links fade the
     body out (180ms) before the browser navigates.

   HOW IT CONNECTS:
     - CSS side (09-anim.css): body.page-exit applies opacity/translate
       with a 0.16s transition; reduced-motion rules neutralise it.
     - Markup side: every <a> in any page/partial. External links,
       anchors (#…), mailto:, tel:, download and target!=_self links
       are all left alone.
     - Boot: main.js calls DCITC.transitions.init().

   BEHAVIOUR:
     - One delegated document-level click listener (works for all
       current and future links, no per-link wiring).
     - Same-pathname links do nothing (no pointless exit animation).
     - prefers-reduced-motion: navigate immediately, no animation.
   ================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DURATION = 180;   // ms to wait after adding .page-exit before navigating

  function isExternal(href) {
    var a = document.createElement('a');
    a.href = href;
    return a.origin !== window.location.origin;
  }

  // play the exit transition, then really navigate
  function go(href) {
    if (reduced) { window.location.href = href; return; }
    document.body.classList.add('page-exit');
    setTimeout(function () { window.location.href = href; }, DURATION);
  }

  function init() {
    // single delegated listener for every link on the page
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (!href) return;
      if (href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return;
      if (a.hasAttribute('download')) return;
      if (a.target && a.target !== '_self') return;
      if (isExternal(href)) return;

      var a2 = document.createElement('a');
      a2.href = href;
      if (a2.pathname === window.location.pathname) return; // same page

      e.preventDefault();
      go(a2.href);
    });
  }

  // register on the shared namespace consumed by main.js
  window.DCITC = window.DCITC || {};
  window.DCITC.transitions = { init: init };
})();

// WHAT THIS FILE CONTROLS:
    // All page-level UI widgets, in init order:
    //   1. initMobileMenu — the ≤899px slide-in nav drawer
    //   2. initMore       — the desktop "More" dropdown in the navbar
    //   3. initFilters    — tag-button filtering (gallery masonry)
    //   4. initSearch     — live text search (resources page)
    //
    // HOW IT CONNECTS:
    //   - header.html renders [data-menu-toggle] + [data-mobile-menu]
    //     (#1) and [data-more]/[data-more-btn] (#2).
    //   - gallery.html: .gal-filters[data-filter-group=".masonry"] with
    //     button[data-filter] controls figure[data-filter] items (#3).
    //   - resources.html: input[data-search] in the shelf head against
    //     article[data-searchable] items (#4). (Filter chips removed.)
    //   - about.html: leadership cards rendered inline (no carousel).
    //     Boot: main.js calls DCITC.pages.init().
(function () {
  'use strict';

  /* 1 ─ mobile menu drawer (≤899px) --------------------------------- */
  // Visibility is CLASS-toggled only (no `hidden` attribute — it was
  // deliberately removed so CSS transitions work). A scrim div is
  // created here and appended to <body>; CSS (.menu-scrim in
  // 05-nav.css) styles and shows it via .is-open.
  function initMobileMenu() {
    var btn = document.querySelector('[data-menu-toggle]');
    var menu = document.querySelector('[data-mobile-menu]');
    if (!btn || !menu) return;

    var scrim = document.createElement('div');
    scrim.className = 'menu-scrim';
    document.body.appendChild(scrim);

    function open() {
      menu.classList.add('is-open');
      scrim.classList.add('is-open');
      btn.classList.add('is-open');               // animates hamburger → X
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Close menu');
    }
    function close() {
      menu.classList.remove('is-open');
      scrim.classList.remove('is-open');
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
    }

    btn.addEventListener('click', function () {
      menu.classList.contains('is-open') ? close() : open();
    });
    scrim.addEventListener('click', close);
    menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  /* 2 ─ desktop "More" dropdown -------------------------------------- */
  // Click toggles .is-open on .nav-more; clicking anywhere else closes.
  // (:hover/:focus-within rules in 05-nav.css also open it.)
  function initMore() {
    var more = document.querySelector('[data-more]');
    if (!more) return;
    var btn = more.querySelector('[data-more-btn]');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = more.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!more.contains(e.target)) {
        more.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* 3 ─ filter buttons ------------------------------------------------ */
  // Generic mechanism: a container with data-filter-group="<selector>"
  // holds button[data-filter="X"]; elements matching <selector> carry
  // data-filter="X". "*" shows everything. Used by gallery + resources.
  function initFilters() {
    document.querySelectorAll('[data-filter-group]').forEach(function (group) {
      var selector = group.getAttribute('data-filter-group');
      // Filterable items are the data-filter descendants INSIDE the
      // target container (e.g. ".res-list [data-filter]") — never the
      // container itself, which carries no data-filter and would be
      // hidden wholesale on the first category click.
      var items = document.querySelectorAll(selector + ' [data-filter]');
      var buttons = group.querySelectorAll('[data-filter]');
      buttons.forEach(function (b) {
        b.addEventListener('click', function () {
          buttons.forEach(function (x) { x.classList.remove('is-on'); });
          b.classList.add('is-on');
          var f = b.getAttribute('data-filter');
          items.forEach(function (it) {
            var show = f === '*' || it.getAttribute('data-filter') === f;
            it.style.display = show ? '' : 'none';
          });
        });
      });
    });
  }

  /* 4 ─ live search ---------------------------------------------------- */
  // input[data-search] filters any element carrying data-searchable="
  // …text…" (space-separated haystack set by the template).
  function initSearch() {
    var input = document.querySelector('[data-search]');
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      document.querySelectorAll('[data-searchable]').forEach(function (el) {
        var hay = (el.getAttribute('data-searchable') || '').toLowerCase();
        el.style.display = hay.indexOf(q) !== -1 ? '' : 'none';
      });
    });
  }

  /* 5 ─ collapsing event deck (events page, upcoming) ------------------ */
  // Markup: ul[data-evx] > li.evx-item > article. One item carries
  // data-active="true" (first upcoming, set by the build); the rest
  // collapse to thin strips. Activation triggers: pointerenter, click
  // and focusin (keyboard users tabbing into a card's CTA expand it).
  //
  // Mechanics: the deck is a grid whose track sizes are rewritten to
  // "10fr 1fr …" with the active column first-class; grid-template-
  // columns is animatable in modern browsers, so the CSS transition on
  // .evx produces the expand/collapse motion — no anime.js needed here
  // (content fade/slide is pure CSS too, see .evx-body in 08-pages.css).
  function initEventDeck() {
    var deck = document.querySelector('[data-evx]');
    if (!deck) return;
    var items = Array.prototype.slice.call(deck.querySelectorAll('.evx-item'));
    if (!items.length) return;
    var current = -1;

    function activate(idx) {
      if (idx === current) return;
      current = idx;
      var cols = [];
      for (var i = 0; i < items.length; i++) {
        if (i === idx) {
          items[i].setAttribute('data-active', 'true');
          cols.push('10fr');
        } else {
          items[i].removeAttribute('data-active');
          cols.push('1fr');
        }
      }
      deck.style.gridTemplateColumns = cols.join(' ');
    }

    items.forEach(function (item, i) {
      item.addEventListener('pointerenter', function () { activate(i); });
      item.addEventListener('click', function () { activate(i); });
      item.addEventListener('focusin', function () { activate(i); });
    });

    // initial state: honor the pre-rendered data-active, else first card
    var start = items.findIndex(function (it) { return it.hasAttribute('data-active'); });
    activate(start === -1 ? 0 : start);
  }

  // register on the shared namespace consumed by main.js
  window.DCITC = window.DCITC || {};
  window.DCITC.pages = {
    init: function () {
      initMobileMenu();
      initMore();
      initFilters();
      initSearch();
      initEventDeck();
    }
  };
})();

/* ==================================================================
   DCITC BOOT  —  static/js/main.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
     The single entry point that starts every module. It is
     deliberately LAST in the JS bundle (see JS_FILES in
     scripts/build.js) so every DCITC.* module below is registered:

       theme.js        → DCITC.theme         (dark/light toggle)
       horizontal.js   → DCITC.horizontal    (horizontal filmstrip)
       reveal.js       → DCITC.reveal        (scroll-in animations)
       transitions.js  → DCITC.transitions   (page-exit fade)
       pages.js        → DCITC.pages         (menu, filters, carousel)
       main.js         → calls each .init() in the order above

     Init order matters: theme first (no flash), then layout-critical
     horizontal scroller, then visual layers, then page widgets.
   ================================================================== */
(function () {
  'use strict';

  function init() {
    if (window.DCITC.theme) window.DCITC.theme.init();
    if (window.DCITC.horizontal) window.DCITC.horizontal.init();
    if (window.DCITC.reveal) window.DCITC.reveal.init();
    if (window.DCITC.transitions) window.DCITC.transitions.init();
    if (window.DCITC.pages) window.DCITC.pages.init();
  }

  // run at DOMContentLoaded (scripts load with `defer`, but be safe)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
