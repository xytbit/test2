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
      btn.classList.add('is-open'); // animates hamburger → X
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
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', close);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
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
          buttons.forEach(function (x) {
            x.classList.remove('is-on');
          });
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
      item.addEventListener('pointerenter', function () {
        activate(i);
      });
      item.addEventListener('click', function () {
        activate(i);
      });
      item.addEventListener('focusin', function () {
        activate(i);
      });
    });

    // initial state: honor the pre-rendered data-active, else first card
    var start = items.findIndex(function (it) {
      return it.hasAttribute('data-active');
    });
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
    },
  };
})();
