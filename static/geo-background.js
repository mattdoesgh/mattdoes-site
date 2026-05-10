// geo-background.js — animated GeoJSON drift behind site content.
//
// First paint: fetches /home.geojson (Houston, baked at build time)
// and renders it inside #geo-bg. Two render modes, switched by the
// tweaks panel:
//   'solid'  — original stroked outline; gentle drift via CSS keyframe.
//   'points' — sampled along the polygon perimeter; each point drifts
//              independently with viewport-edge wrap. Particle positions
//              are persisted to sessionStorage on pagehide and rehydrated
//              on the next page so the cloud appears continuous across
//              full-page navigations.
//
// Optional upgrade: if the visitor has *already* granted geolocation
// for this origin, we silently swap in their own city's polygon. We
// don't prompt on first load — the only path to a permission prompt
// is via the tweaks panel (`local map: mine`), so casual visitors get
// the home shape and nothing more.
//
// Caching: a successfully fetched personal polygon is stashed in
// localStorage, keyed by rounded coords, for 30 days.
//
// Privacy: coords are sent to /api/geo/lookup (Matt's worker) once per
// rounded-grid cell. They're never written to localStorage and never
// leave the worker — only the polygon comes back.

(() => {
  // Keep these in sync with TWEAK_DEFAULTS in tweaks.js. Read here
  // directly rather than waiting for the geo-bg:setting / geo-bg:shape
  // events: both scripts are deferred and there's a one-tick window where
  // tweaks.js's init-time apply() has already fired before this listener
  // is attached. Identical defaults sidestep the race.
  const DEFAULT_MODE  = 'home';
  const DEFAULT_SHAPE = 'points';

  const HOST_ID         = 'geo-bg';
  const HOME_URL        = '/home.geojson';
  const ENDPOINT        = (document.querySelector('meta[name="geo-endpoint"]')?.content) || '/api/geo/lookup';
  const STORAGE_KEY     = 'mdo:geo:v1';
  const STORAGE_TTL_MS  = 30 * 24 * 60 * 60 * 1000;   // 30 days
  const COORD_PRECISION = 1;                           // ~11 km grid → cache hits across a metro area

  // Particle-cloud knobs. POINT_COUNT is intentionally modest — 300-ish
  // SVG circles updated per frame is comfortable on mid-tier hardware
  // without needing canvas. Velocities are in viewBox units / second
  // (viewBox is 1000×1000), so VEL_MAX≈4 means a point crosses the
  // visible area in ~250s — the "slow drift" the design called for.
  const PARTICLES_KEY     = 'mdo:geo:particles:v1';
  const PARTICLES_TTL_MS  = 5_000;
  const POINT_COUNT       = 320;
  const POINT_RADIUS      = 2;
  const VEL_MIN           = 1.0;
  const VEL_MAX           = 4.0;
  const VIEWBOX_SIZE      = 1000;
  // Wrap a touch outside viewBox so points that are wrapping don't
  // visibly snap at the SVG edge — they slip off-screen and reappear
  // on the opposite side (the SVG itself is `xMidYMid slice` so the
  // edges of viewBox don't always coincide with viewport edges anyway).
  const WRAP_MARGIN       = 12;

  const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const host = document.getElementById(HOST_ID);
  if (!host) return;

  const state = {
    mode:        DEFAULT_MODE,    // 'home' | 'mine' | 'off'
    shape:       DEFAULT_SHAPE,   // 'solid' | 'points'
    homeFeature: null,
    mineFeature: null,
    points:      null,            // [{x, y, vx, vy}, ...] in viewBox units
    bboxHash:    null,            // identifies which polygon the points belong to
    circles:     [],              // matching SVG <circle> nodes
    rafId:       0,
    lastT:       0,
  };

  // ── SVG plumbing ─────────────────────────────────────────────────────
  const SVGNS   = 'http://www.w3.org/2000/svg';
  const svg     = document.createElementNS(SVGNS, 'svg');
  const drift   = document.createElementNS(SVGNS, 'g');
  const path    = document.createElementNS(SVGNS, 'path');
  const pointsG = document.createElementNS(SVGNS, 'g');

  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('viewBox', `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  drift.setAttribute('class', 'geo-drift');
  path.setAttribute('class', 'geo-path');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  path.setAttribute('fill', 'none');
  drift.appendChild(path);
  pointsG.setAttribute('class', 'geo-points');
  svg.appendChild(drift);
  svg.appendChild(pointsG);
  host.appendChild(svg);
  host.dataset.shape = state.shape;

  // ── geometry helpers ────────────────────────────────────────────────
  function featureBBox(geom) {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    const visit = (ring) => {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    };
    if (geom.type === 'Polygon') geom.coordinates.forEach(visit);
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(p => p.forEach(visit));
    else return null;
    if (!isFinite(minLng)) return null;
    return [minLng, minLat, maxLng, maxLat];
  }

  function makeProjector(bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const w = maxLng - minLng || 1;
    const h = maxLat - minLat || 1;
    return ([lng, lat]) => [
      ((lng - minLng) / w) * VIEWBOX_SIZE,
      ((maxLat - lat)  / h) * VIEWBOX_SIZE,   // SVG y grows down
    ];
  }

  function geoPathD(geom) {
    const bbox = featureBBox(geom);
    if (!bbox) return '';
    const project = makeProjector(bbox);
    const fmt = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;
    const ringD = (ring) => {
      if (!ring.length) return '';
      let d = `M${fmt(project(ring[0]))}`;
      for (let i = 1; i < ring.length; i++) d += ` L${fmt(project(ring[i]))}`;
      return d + ' Z';
    };
    const polyD = (poly) => poly.map(ringD).join(' ');
    if (geom.type === 'Polygon')      return polyD(geom.coordinates);
    if (geom.type === 'MultiPolygon') return geom.coordinates.map(polyD).join(' ');
    return '';
  }

  function bboxHash(bbox) {
    return bbox ? bbox.map(n => n.toFixed(2)).join(',') : '';
  }

  // ── perimeter sampling ──────────────────────────────────────────────
  function collectRings(geom) {
    if (geom.type === 'Polygon')      return geom.coordinates;
    if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
    return [];
  }

  function sampleAlongRing(projected, count) {
    if (count < 1 || projected.length < 2) return [];
    const segs = [];
    let total = 0;
    for (let i = 1; i < projected.length; i++) {
      const a = projected[i - 1], b = projected[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segs.push({ a, b, len, cumStart: total });
      total += len;
    }
    if (total === 0) return [];
    const out = [];
    const step = total / count;
    let s = 0;
    for (let i = 0; i < count; i++) {
      const target = i * step;
      while (s < segs.length - 1 && segs[s].cumStart + segs[s].len < target) s++;
      const seg = segs[s];
      const t = seg.len > 0 ? (target - seg.cumStart) / seg.len : 0;
      out.push([
        seg.a[0] + (seg.b[0] - seg.a[0]) * t,
        seg.a[1] + (seg.b[1] - seg.a[1]) * t,
      ]);
    }
    return out;
  }

  function samplePoints(geom, bbox) {
    const project = makeProjector(bbox);
    const rings = collectRings(geom).map(r => r.map(project));
    if (!rings.length) return [];
    const lengths = rings.map(r => {
      let l = 0;
      for (let i = 1; i < r.length; i++) {
        l += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
      }
      return l;
    });
    const totalLen = lengths.reduce((a, b) => a + b, 0);
    if (totalLen === 0) return [];
    const out = [];
    rings.forEach((r, i) => {
      // Allocate point budget proportional to ring length so a tiny
      // inner hole doesn't get the same density as the outer boundary.
      const share = Math.max(2, Math.round(POINT_COUNT * (lengths[i] / totalLen)));
      const samples = sampleAlongRing(r, share);
      for (const [x, y] of samples) {
        const angle = Math.random() * Math.PI * 2;
        const speed = VEL_MIN + Math.random() * (VEL_MAX - VEL_MIN);
        out.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
        });
      }
    });
    return out;
  }

  // ── points rendering & drift loop ───────────────────────────────────
  function syncCircles(n) {
    while (state.circles.length < n) {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('class', 'geo-point');
      c.setAttribute('r', String(POINT_RADIUS));
      pointsG.appendChild(c);
      state.circles.push(c);
    }
    while (state.circles.length > n) {
      state.circles.pop().remove();
    }
  }

  function drawPoints() {
    if (!state.points) return;
    syncCircles(state.points.length);
    for (let i = 0; i < state.points.length; i++) {
      const p = state.points[i];
      const c = state.circles[i];
      c.setAttribute('cx', p.x.toFixed(2));
      c.setAttribute('cy', p.y.toFixed(2));
    }
  }

  function step(now) {
    if (state.shape !== 'points' || state.mode === 'off' || !state.points) {
      state.rafId = 0;
      return;
    }
    if (!state.lastT) state.lastT = now;
    // Cap dt so a long tab-background pause doesn't teleport everything.
    const dt = Math.min(0.1, (now - state.lastT) / 1000);
    state.lastT = now;
    const lo = -WRAP_MARGIN, hi = VIEWBOX_SIZE + WRAP_MARGIN, span = hi - lo;
    const pts = state.points;
    const cs  = state.circles;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < lo) p.x += span;
      else if (p.x > hi) p.x -= span;
      if (p.y < lo) p.y += span;
      else if (p.y > hi) p.y -= span;
      cs[i].setAttribute('cx', p.x.toFixed(2));
      cs[i].setAttribute('cy', p.y.toFixed(2));
    }
    state.rafId = requestAnimationFrame(step);
  }

  function startDrift() {
    if (state.rafId || REDUCED_MOTION) return;
    state.lastT = 0;
    state.rafId = requestAnimationFrame(step);
  }

  function cancelDrift() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
  }

  // ── ready/fade-in ───────────────────────────────────────────────────
  // The CSS opacity transition on #geo-bg is a one-shot fade-in for the
  // very first paint. On hydrated loads (sessionStorage cleared mid-flight)
  // we skip it: the user's last frame and our first frame are nearly
  // identical, so a fresh fade reads as a flicker, not a flourish.
  let didFirstReady = false;
  function setReady(skipTransition) {
    if (host.classList.contains('ready')) return;
    if (skipTransition) {
      const prev = host.style.transition;
      host.style.transition = 'none';
      host.classList.add('ready');
      requestAnimationFrame(() => { host.style.transition = prev; });
    } else {
      host.classList.add('ready');
    }
    didFirstReady = true;
  }

  // ── persistence ─────────────────────────────────────────────────────
  // Hydration is one-shot: read at init, then immediately removed so a
  // later refresh after the TTL doesn't accidentally pick up stale state.
  let pendingHydration = null;
  try {
    const raw = sessionStorage.getItem(PARTICLES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.points) &&
          Date.now() - parsed.savedAt < PARTICLES_TTL_MS) {
        pendingHydration = parsed;
      }
      sessionStorage.removeItem(PARTICLES_KEY);
    }
  } catch { /* no sessionStorage / parse error — fall through to fresh sample */ }

  function persistParticles() {
    if (state.shape !== 'points' || !state.points || !state.bboxHash) return;
    try {
      const pts = state.points.map(p => ({
        x:  +p.x.toFixed(2),
        y:  +p.y.toFixed(2),
        vx: +p.vx.toFixed(3),
        vy: +p.vy.toFixed(3),
      }));
      sessionStorage.setItem(PARTICLES_KEY, JSON.stringify({
        savedAt:  Date.now(),
        mode:     state.mode,
        shape:    state.shape,
        bboxHash: state.bboxHash,
        points:   pts,
      }));
    } catch { /* quota / disabled — non-fatal */ }
  }

  // pagehide fires on real navigations and bfcache freezes; visibilitychange
  // catches tab-hide before the user might close the tab. Persisting on
  // visibility:hidden is cheap and means a closed tab still leaves usable
  // state for the next visit within the TTL.
  window.addEventListener('pagehide', persistParticles);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistParticles();
  });

  // ── render orchestration ────────────────────────────────────────────
  function render() {
    host.dataset.shape = state.shape;

    if (state.mode === 'off') {
      host.classList.remove('ready');
      cancelDrift();
      return;
    }
    const f = state.mode === 'mine' && state.mineFeature ? state.mineFeature : state.homeFeature;
    if (!f) return;
    const geom = f.geometry || f;
    // Always update the path even in points mode — switching to solid
    // later doesn't need a re-fetch, just a CSS-driven mode swap.
    path.setAttribute('d', geoPathD(geom));

    if (state.shape === 'points') {
      const bbox = featureBBox(geom);
      const newHash = bboxHash(bbox);
      let hydrated = false;
      if (pendingHydration &&
          pendingHydration.mode === state.mode &&
          pendingHydration.shape === 'points' &&
          pendingHydration.bboxHash === newHash) {
        state.points = pendingHydration.points.map(p => ({ ...p }));
        hydrated = true;
        pendingHydration = null;
      } else if (!state.points || state.bboxHash !== newHash) {
        state.points = samplePoints(geom, bbox);
      }
      state.bboxHash = newHash;
      drawPoints();
      startDrift();
      setReady(hydrated && !didFirstReady);
    } else {
      cancelDrift();
      setReady(false);
    }
  }

  // ── home polygon (always loaded) ────────────────────────────────────
  fetch(HOME_URL, { cache: 'force-cache' })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) return;
      state.homeFeature = data;
      render();
    })
    .catch(() => { /* offline / 404 — leave the page un-decorated */ });

  // ── localStorage cache for the visitor's own polygon ────────────────
  function loadCachedMine() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.feature || !obj.savedAt) return null;
      if (Date.now() - obj.savedAt > STORAGE_TTL_MS) return null;
      return obj;
    } catch { return null; }
  }
  function saveCachedMine(feature, key) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        feature, key, savedAt: Date.now(),
      }));
    } catch { /* quota / disabled — non-fatal */ }
  }

  // ── opt-in upgrade flow ─────────────────────────────────────────────
  // `prompt` controls whether we'll trigger the browser's permission
  // dialog. Silent (initial-load) checks pass false; explicit user
  // toggles (tweaks panel "mine") pass true.
  async function tryUseMine({ prompt = false } = {}) {
    const cached = loadCachedMine();
    if (cached) {
      state.mineFeature = cached.feature;
      render();
      return true;
    }
    if (!('geolocation' in navigator)) return false;

    if (!prompt && navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state !== 'granted') return false;
      } catch { return false; }
    }

    let pos;
    try {
      pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          maximumAge: 24 * 60 * 60 * 1000,
          timeout: 10_000,
        });
      });
    } catch { return false; }

    const lat = +pos.coords.latitude.toFixed(COORD_PRECISION);
    const lng = +pos.coords.longitude.toFixed(COORD_PRECISION);
    const cacheKey = `${lat},${lng}`;

    try {
      const res = await fetch(`${ENDPOINT}?lat=${lat}&lng=${lng}`, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return false;
      const body = await res.json();
      if (!body || !body.feature) return false;
      state.mineFeature = body.feature;
      saveCachedMine(body.feature, cacheKey);
      render();
      return true;
    } catch { return false; }
  }

  // ── tweaks panel hooks ──────────────────────────────────────────────
  // tweaks.js fires both events on every settings change (including
  // unrelated ones like accent), so each listener short-circuits when
  // the value is unchanged.
  window.addEventListener('geo-bg:setting', (ev) => {
    const next = ev.detail?.value;
    if (!next || next === state.mode) return;
    state.mode = next;
    if (next === 'mine' && !state.mineFeature) {
      tryUseMine({ prompt: true }).then(ok => {
        // Permission denied or worker hiccup — fall back to home, but
        // keep state.mode='mine' so a later retry still aims for it.
        if (!ok) render();
      });
    }
    render();
  });

  window.addEventListener('geo-bg:shape', (ev) => {
    const next = ev.detail?.value;
    if (!next || next === state.shape) return;
    state.shape = next;
    render();
  });

  // ── imperative API ──────────────────────────────────────────────────
  window.geoBackground = {
    useMine: () => { state.mode = 'mine'; return tryUseMine({ prompt: true }).finally(render); },
    useHome: () => { state.mode = 'home'; render(); },
    off:     () => { state.mode = 'off';  render(); },
  };

  // ── initial silent upgrade ──────────────────────────────────────────
  if (state.mode !== 'off') {
    tryUseMine({ prompt: false }).then(ok => { if (ok) state.mode = 'mine'; render(); });
  }
})();
