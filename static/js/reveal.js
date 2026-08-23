/* ==================================================================
   DCITC REVEAL SYSTEM  —  static/js/reveal.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
      Scroll-in animations: elements fade/slide in as they enter the
      viewport, and the hero headline lines rise out of a clip mask.

   HOW IT CONNECTS:
      - CSS side (09-anim.css): [data-reveal] / [data-stagger] children
        start hidden ONLY under html.js (the class is added by the
        inline script in partials/head.html, so no-JS visitors see
        everything). Adding .is-in — here or via the safety net —
        triggers the CSS transition. Stagger delays are pure CSS
        (:nth-child → --d custom property).
      - Markup side: pages opt in with data-reveal[="fade|left|right|
        scale|up"] or data-stagger on a parent; hero uses
        .hero-line > .hl spans.
      - anime.js (vendored, loaded before app.js in partials/scripts.html)
        animates the hero lines.
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
      lines.forEach(function (l) {
        l.classList.add('is-in');
      }); // CSS fallback position
      return;
    }
    window.anime({
      targets: lines,
      translateY: ['112%', '0%'], // from below the clip
      easing: 'cubicBezier(0.16, 1, 0.3, 1)',
      duration: 950,
      delay: window.anime.stagger(130, { start: 200 }),
    });
  }

  function init() {
    var els = document.querySelectorAll('[data-reveal], [data-stagger]');

    if (reduced || !('IntersectionObserver' in window)) {
      // no motion / no observer: show everything immediately
      els.forEach(function (el) {
        el.classList.add('is-in');
      });
    } else {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              en.target.classList.add('is-in');
              io.unobserve(en.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
      );
      els.forEach(function (el) {
        io.observe(el);
      });

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
      window.addEventListener(
        'scroll',
        function () {
          if (!ticking) {
            ticking = true;
            requestAnimationFrame(revealVisible);
          }
        },
        { passive: true },
      );
      window.addEventListener('resize', revealVisible);
      revealVisible();
    }

    heroReveal();
  }

  // register on the shared namespace consumed by main.js
  window.DCITC = window.DCITC || {};
  window.DCITC.reveal = { init: init };
})();
