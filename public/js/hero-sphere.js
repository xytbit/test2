/* ==================================================================
   DCITC HERO GLOBE  —  static/js/hero-sphere.js  (ES module)
   ==================================================================
   WHAT THIS FILE CONTROLS:
     The interactive wireframe globe in the home hero section
     ([data-hero-sphere] in src/pages/index.html). Deliberately
     MINIMAL, per spec: a wireframe node+edge sphere that slowly
     spins, can be dragged to orbit, and ripples with a light shock
     where you click. No frame, no backdrop stars, no grain, no
     toggle UI — the canvas background is fully transparent so the
     page itself shows through.

   HOW IT CONNECTS:
     - HOME-ONLY LOAD: the early return below bails before any
       three.js import, so no other page downloads the library.
       index.html ships the <script type="importmap"> that resolves
       the bare specifiers 'three' / 'three/addons/' to
       /js/vendor/three/ (vendored three@0.162.0 + OrbitControls;
       scripts/build.js copies them into public/).
     - THEME: node/edge colors are read from the site's design tokens
       at runtime (--accent, --amber, --ink-dim) and re-applied when
       html[data-theme] flips (MutationObserver). Blending also swaps:
       ADDITIVE on the dark theme (glowy wires against the near-black
       page), NORMAL on light (additive over paper would wash out).
     - LAYOUT: the transparent canvas fills its grid cell
       ([data-hero-sphere]) via a ResizeObserver — never the window —
       so it cannot overlap the hero copy or .hero-meta strip.
     - HORIZONTAL STRIP: horizontal.js skips drags starting on
       [data-hx-nodrag] (the wrapper), so dragging spins the globe
       instead of panning the filmstrip. Zoom/pan are disabled so the
       wheel keeps panning the strip like everywhere else; touch-action
       is relaxed to "pan-x" so horizontal swipes still pan natively.
     - prefers-reduced-motion: auto-spin off (click shocks remain).
       Rendering pauses whenever the hero leaves the viewport.

   BEHAVIOUR SUMMARY:
     click/tap globe  → light shockwave through the mesh
     mouse drag       → orbit/spin the camera around it
     otherwise        → slow auto-spin
   ================================================================== */

(async function () {
  'use strict';

  /* home-only module: without the mount there is nothing to draw —
     bail BEFORE importing three.js (~1MB) on every other page */
  var mount = document.querySelector('[data-hero-sphere]');
  if (!mount) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- load three.js (OrbitControls is the only addon needed) ------- */
  var THREE, OrbitControls;
  try {
    THREE = await import('three');
    OrbitControls = (await import('three/addons/controls/OrbitControls.js')).OrbitControls;
  } catch (err) {
    mount.classList.add('is-fallback'); // CSS collapses the empty cell
    return;
  }

  /* --- theme tokens -------------------------------------------------- */
  // Colors come straight from the CSS custom properties so future token
  // edits propagate automatically. No "lifting" toward white anymore:
  // with a TRANSPARENT canvas the mesh sits on the real page background,
  // and both themes' accents are tuned by 01-vars.css to read there.
  function paletteFor(light) {
    var cs = getComputedStyle(document.documentElement);
    function cv(name, fb) { var v = cs.getPropertyValue(name).trim(); return v || fb; }
    return {
      main: new THREE.Color(cv('--accent', light ? '#157a5b' : '#4fd1a5')),
      alt: new THREE.Color(cv('--amber', light ? '#a5712f' : '#d8b077')),
      dim: new THREE.Color(cv('--ink-dim', light ? '#4e5765' : '#9aa3b1')),
      lineAlpha: light ? 0.5 : 0.35,  // wires need more weight on paper bg
      additive: !light,
    };
  }
  function pick(pal) {               // weighted random element color
    var r = Math.random();
    if (r < 0.62) return pal.main;   // 62% brand accent
    if (r < 0.86) return pal.dim;    // 24% neutral ink tone
    return pal.alt;                  // 14% warm secondary
  }

  /* --- renderer / scene / camera -------------------------------------- */
  var SCALE = 15;                    // globe radius (world units)
  var canvas = document.createElement('canvas');
  canvas.className = 'sphere-canvas';
  mount.appendChild(canvas);

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true,
      alpha: true,                          // TRANSPARENT — page shows through
      powerPreference: 'high-performance',
    });
  } catch (err) {
    mount.classList.add('is-fallback');     // no WebGL → collapse the cell
    return;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);      // fully see-through

  var pal = paletteFor(document.documentElement.getAttribute('data-theme') === 'light');
  var scene = new THREE.Scene();            // NO fog: it would paint opaque
                                            // haze over the transparency

  var camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1200);
  camera.position.set(0, 0, 30);   // placeholder — resize() fits it to the cell

  // Distance that fits the WHOLE globe inside the current cell with a
  // breathing margin. The silhouette edge-ray subtends asin(r/d); a ray
  // at angle θ lands on screen at tan(θ), so requiring
  //   tan(asin(r/d)) = FILL · tan(tighter half-fov)
  // gives  d = r·√(1+(F·t)²)/(F·t).  (An atan(r/d) fit overestimates
  // the globe by ~10% and clips it; plain sin() undershoots slightly.)
  var FILL = 0.94;
  function fitCamera() {
    var vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
    var hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    var ft = FILL * Math.tan(Math.min(vHalf, hHalf));
    var d = Math.max(SCALE * Math.sqrt(1 + ft * ft) / ft, SCALE * 1.05);
    // preserve the current orbit angle, only change the radius
    var dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() === 0) dir.set(0, 0, 1);
    camera.position.copy(controls.target).addScaledVector(dir.normalize(), d);
  }

  /* --- camera controls --------------------------------------------- */
  // Zoom + pan stay OFF: wheel must keep panning the horizontal strip.
  var controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: 0.06, rotateSpeed: 0.45,
    enablePan: false, enableZoom: false,
    minDistance: 16, maxDistance: 90,
    autoRotate: !reduced, autoRotateSpeed: 0.55,   // the idle spin
  });
  // OrbitControls sets touch-action:none, which would swallow the native
  // horizontal strip pan on touch devices. "pan-x" gives the browser
  // horizontal swipes (filmstrip pans) and leaves vertical drags for
  // orbiting.
  renderer.domElement.style.touchAction = 'pan-x';

  /* --- shared shader uniforms ---------------------------------------- */
  // Up to 3 simultaneous shockwaves: each records where it was triggered
  // (world position on the globe) and when; both shaders light elements
  // inside a travelling shell around each origin.
  var uniforms = {
    uTime: { value: 0.0 },
    uPx: { value: 200.0 },             // point-size scale ∝ buffer height (set on resize)
    uLineAlpha: { value: pal.lineAlpha },
    uPulsePositions: { value: [new THREE.Vector3(1e3, 1e3, 1e3), new THREE.Vector3(1e3, 1e3, 1e3), new THREE.Vector3(1e3, 1e3, 1e3)] },
    uPulseTimes: { value: [-1e3, -1e3, -1e3] },
  };

  /* --- shaders --------------------------------------------------------- */
  var pulseGLSL = [
    'uniform float uTime;',
    'uniform vec3 uPulsePositions[3];',
    'uniform float uPulseTimes[3];',
    'float getPulseIntensity(vec3 worldPos) {',
    '  float total = 0.0;',
    '  for (int i = 0; i < 3; i++) {',
    '    float since = uTime - uPulseTimes[i];',
    '    if (since < 0.0 || since > 3.5) continue;',
    '    float radius = since * 15.0;',                 // wave speed (units/s)
    '    float proximity = abs(distance(worldPos, uPulsePositions[i]) - radius);',
    '    total += smoothstep(4.0, 0.0, proximity) * smoothstep(3.5, 0.0, since);',
    '  }',
    '  return min(total, 1.0);',
    '}'
  ].join('\n');

  var nodeShader = {
    vertexShader: 'uniform float uPx;\n' + pulseGLSL + '\n' + [
      'attribute vec3 color;',
      'varying vec3 vColor;',
      'varying float vPulse;',
      'void main() {',
      '  vColor = color;',
      '  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;',
      '  vPulse = getPulseIntensity(worldPos);',
      '  float size = 1.0 + vPulse * 5.0;',
      '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
      '  gl_PointSize = size * (uPx / -mvPosition.z);',   // uPx scales with buffer height
      '  gl_Position = projectionMatrix * mvPosition;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vColor;',
      'varying float vPulse;',
      'void main() {',
      '  float dist = length(gl_PointCoord - vec2(0.5));',
      '  if (dist > 0.5) discard;',
      '  vec3 finalColor = mix(vColor, vec3(1.0), vPulse);',          // shocked nodes flash white
      '  float alpha = (1.0 - dist * 2.0) * (1.0 + vPulse);',
      // PREMULTIPLIED output: the canvas composites premultiplied, so
      // emitting rgb*alpha keeps additive wires at full strength over
      // the page while normal-blended (light theme) stays correct.
      '  gl_FragColor = vec4(finalColor * (1.0 + vPulse * 0.5) * alpha, alpha);',
      '}'
    ].join('\n')
  };

  var connectionShader = {
    vertexShader: pulseGLSL + '\n' + [
      'attribute vec3 color;',
      'varying vec3 vColor;',
      'varying float vPulse;',
      'void main() {',
      '  vColor = color;',
      '  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;',
      '  vPulse = getPulseIntensity(worldPos);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uLineAlpha;',
      'varying vec3 vColor;',
      'varying float vPulse;',
      'void main() {',
      '  float alpha = uLineAlpha + vPulse * (1.0 - uLineAlpha);',
      // premultiplied, see the node shader note
      '  gl_FragColor = vec4(mix(vColor, vec3(1.0), vPulse) * alpha, alpha);',
      '}'
    ].join('\n')
  };

  /* --- geometry ------------------------------------------------------- */
  // Icosphere detail 4 (~2.5k unique nodes): dense enough to read as a
  // globe, airy enough that individual wires stay visible at this size.
  // (Detail 5 turned into a solid blob on a ~600px canvas.)
  var baseGeometry = new THREE.IcosahedronGeometry(SCALE, 4);
  var seen = new Map();
  var nodePositions = [];
  var pos = baseGeometry.attributes.position.array;
  for (var i = 0; i < pos.length; i += 3) {
    var key = pos[i].toFixed(3) + ',' + pos[i + 1].toFixed(3) + ',' + pos[i + 2].toFixed(3);
    if (!seen.has(key)) {
      seen.set(key, true);
      nodePositions.push(pos[i], pos[i + 1], pos[i + 2]);
    }
  }

  var edgeGeometry = new THREE.EdgesGeometry(baseGeometry, 1);

  /* --- meshes ---------------------------------------------------------- */
  var nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
  var nodeColors = new Float32Array(nodeGeometry.attributes.position.count * 3);
  nodeGeometry.setAttribute('color', new THREE.BufferAttribute(nodeColors, 3));

  var nodeMaterial = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: nodeShader.vertexShader,
    fragmentShader: nodeShader.fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,              // matches the shader output above
  });
  scene.add(new THREE.Points(nodeGeometry, nodeMaterial));

  var connectionGeometry = new THREE.BufferGeometry();
  connectionGeometry.setAttribute('position', new THREE.BufferAttribute(edgeGeometry.attributes.position.array, 3));
  var connectionColors = new Float32Array(connectionGeometry.attributes.position.count * 3);
  connectionGeometry.setAttribute('color', new THREE.BufferAttribute(connectionColors, 3));

  var connectionMaterial = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: connectionShader.vertexShader,
    fragmentShader: connectionShader.fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,              // matches the shader output above
  });
  scene.add(new THREE.LineSegments(connectionGeometry, connectionMaterial));

  /* --- tinting + blending (initial + on every theme flip) --------------- */
  function applyPalette() {
    pal = paletteFor(document.documentElement.getAttribute('data-theme') === 'light');
    for (var a = 0; a < nodeColors.length; a += 3) {
      var cN = pick(pal);
      nodeColors[a] = cN.r; nodeColors[a + 1] = cN.g; nodeColors[a + 2] = cN.b;
    }
    nodeGeometry.attributes.color.needsUpdate = true;
    for (var b = 0; b < connectionColors.length; b += 6) {
      var cC = pick(pal);              // one color per edge (both endpoints)
      connectionColors[b] = connectionColors[b + 3] = cC.r;
      connectionColors[b + 1] = connectionColors[b + 4] = cC.g;
      connectionColors[b + 2] = connectionColors[b + 5] = cC.b;
    }
    connectionGeometry.attributes.color.needsUpdate = true;
    // dark → additive glow; light → plain alpha lines (additive over
    // near-white paper would brighten toward invisible)
    var blending = pal.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    nodeMaterial.blending = blending; nodeMaterial.needsUpdate = true;
    connectionMaterial.blending = blending; connectionMaterial.needsUpdate = true;
    uniforms.uLineAlpha.value = pal.lineAlpha;
  }
  applyPalette();

  new MutationObserver(function () { applyPalette(); })   // dark ⇄ light flips
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* --- NO post-processing (deliberate) -----------------------------------
     An earlier bloom chain (EffectComposer/UnrealBloom/Output) looked
     nice in the dark theme but its composite pass wrote a near-opaque
     alpha over the WHOLE frame — the transparent canvas turned into an
     opaque black rectangle and stopped being "part of the page".
     Additive blending against the near-black page background already
     gives the wires their glow, so the whole composer is gone. */

  /* --- click shockwaves ---------------------------------------------------
     A press that moves < 6px counts as a click → record a shockwave at
     the ray/sphere intersection. Anything further was an orbit drag. */
  var raycaster = new THREE.Raycaster();
  var pointerNdc = new THREE.Vector2();
  var hitSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), SCALE);
  var hitPoint = new THREE.Vector3();
  var lastPulse = 0;
  var clock = new THREE.Clock();

  function triggerPulse(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    pointerNdc.x = ((clientX - r.left) / r.width) * 2 - 1;
    pointerNdc.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    if (!raycaster.ray.intersectSphere(hitSphere, hitPoint)) return;  // clicked past the globe
    lastPulse = (lastPulse + 1) % 3;
    uniforms.uPulsePositions.value[lastPulse].copy(hitPoint);
    uniforms.uPulseTimes.value[lastPulse] = clock.getElapsedTime();
  }

  var downAt = null;
  canvas.addEventListener('pointerdown', function (e) { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', function (e) {
    if (!downAt) return;
    var dx = e.clientX - downAt[0], dy = e.clientY - downAt[1];
    downAt = null;
    if (dx * dx + dy * dy < 36) triggerPulse(e.clientX, e.clientY);
  });

  /* --- sizing: fill the grid cell, never the window --------------------- */
  function resize() {
    var w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();                              // re-fit orbit radius to aspect
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);            // false: CSS owns the style size
    uniforms.uPx.value = h * renderer.getPixelRatio() * 0.25;
  }
  new ResizeObserver(resize).observe(mount);
  resize();

  /* --- render loop (paused off-screen) ----------------------------------- */
  var visible = true, rafId = null;
  function loop() {
    rafId = null;
    if (!visible) return;
    uniforms.uTime.value = clock.getElapsedTime();
    controls.update();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(loop);
  }
  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (visible && rafId === null) rafId = requestAnimationFrame(loop);
  }, { threshold: 0 }).observe(mount);
  rafId = requestAnimationFrame(loop);
})();
