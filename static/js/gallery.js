/* ==================================================================
   GALLERY MODULE  —  static/js/gallery.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
     Fetches gallery/gallery.json, dynamically renders gallery items
     into .gallery-track, handles scroll-reveal animations and
     click-to-zoom interactions. Self-contained; only activates when
     .gallery-track exists on the page.

   Adding a new image:
     1. Put the file in gallery/
     2. Add an entry to gallery/gallery.json
     3. Rebuild — no code changes needed.
   ================================================================== */
(function () {
  'use strict';

  const SPEEDS = [2, 1, 4, 3, 2, 4, 2, 1, 3, 1, 2, 1, 4, 3, 2, 4, 2, 1, 3, 1];

  function init() {
    const track = document.querySelector('.gallery-track');
    if (!track) return;

    loadGallery(track);
  }

  function loadGallery(track) {
    fetch('/gallery/gallery.json')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load gallery');
        return res.json();
      })
      .then(function (items) { renderItems(track, items); })
      .catch(function () {
        track.innerHTML =
          '<p style="text-align:center;padding:2rem;color:var(--ink-dim);font-family:var(--font-mono);font-size:var(--fs-1)">' +
          'Gallery unavailable — failed to load image data.</p>';
      });
  }

  function renderItems(track, items) {
    var fragment = document.createDocumentFragment();

    items.forEach(function (item, i) {
      var div = document.createElement('div');
      div.className = 'gal-item' + (item.size || '');
      div.setAttribute('data-speed', SPEEDS[i % SPEEDS.length]);

      var img = document.createElement('img');
      img.src = '/gallery/' + item.image;
      img.alt = item.title || '';
      img.loading = 'lazy';
      img.draggable = false;

      img.addEventListener('error', function () {
        img.style.background = 'var(--bg-elev)';
        img.style.minHeight = '120px';
      });

      img.addEventListener('click', function () {
        img.classList.add('-clicked');
        setTimeout(function () { img.classList.remove('-clicked'); }, 1200);
      });

      div.appendChild(img);
      fragment.appendChild(div);
    });

    track.appendChild(fragment);
    setupObserver(track);
  }

  function setupObserver(track) {
    var images = track.querySelectorAll('.gal-item img');
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('-active');
        }
      });
    }, { root: track.closest('.gal-scroll'), threshold: 0.05 });

    images.forEach(function (img, i) {
      img.style.transitionDelay = (i % 4) * 0.05 + 's';
      observer.observe(img);
    });

    setTimeout(function () {
      images.forEach(function (img) { img.classList.add('-active'); });
    }, 600);
  }

  window.DCITC = window.DCITC || {};
  window.DCITC.gallery = { init: init };
})();
