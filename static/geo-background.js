// geo-background.js — animated GeoJSON drift behind site content.
//
// First paint: fetches /home.geojson (Houston, baked at build time)
// and renders it inside #geo-bg. Two render modes, switched by the
// tweaks panel:
//   'solid'  — original stroked outline; gentle drift via CSS keyframe.
//   'points' — sampled along the polygon perimeter; each point drifts
//              independently within a bounded disc. A faint static
//              outline of the same polygon is rendered behind the
//              points and given a slow CSS-driven shimmer (stroke-
//              opacity breathing across the full perimeter). Particle
//              positions are persisted to sessionStorage on pagehide
//              and rehydrated on the next page so the cloud appears
//              continuous across full-page navigations.
//
// Optional upgrade: if the visitor has *already* granted geolocation
// for this origin, we silently swap in their own city's polygon. We
// don't prompt on first load — the only path to a permission prompt
// is via the tweaks panel (`local map: mine`), so casual visitors get
// the home shape and nothing more.
//
// Caching: a successfully fetched personal polygon (the derived city
// shape — NOT coordinates) is stashed in localStorage for 7 days. The
// short TTL bounds how long a traveler keeps seeing a stale city.
//
// Privacy: coords are sent to /api/geo/lookup (Matt's worker) once per
// rounded-grid cell. They are never written to localStorage and never
// leave the worker — only the polygon comes back, and only the polygon
// is cached. Switching the map mode to 'home' or 'off' clears the cache
// entirely; geoBackground.clearCache() exposes the same as an API.

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
  // 7 days (was 30). A shorter TTL limits how long a traveler keeps
  // seeing the city they were in when the polygon was first cached.
  const STORAGE_TTL_MS  = 7 * 24 * 60 * 60 * 1000;   // 7 days
  const COORD_PRECISION = 1;                           // ~11 km grid → cache hits across a metro area

  // Particle-cloud knobs. Each point is anchored at its sampled position
  // on the polygon (ox, oy) and wanders within a small bounded disc of
  // radius DRIFT_RADIUS (viewBox units; viewBox is 1000×1000). Velocity
  // reflects off the boundary so the shape stays legible indefinitely.
  // POINT_COUNT scales to viewport area so dense screens don't get a
  // sparse map and mobile doesn't get an over-stuffed one.
  const PARTICLES_KEY     = 'mdo:geo:particles:v2';
  const PARTICLES_TTL_MS  = 5_000;
  const POINT_RADIUS      = 0.7;
  const VEL_MIN           = 0.4;
  const VEL_MAX           = 1.2;
  const DRIFT_RADIUS      = 25;
  const VIEWBOX_SIZE      = 1000;
  const POINT_COUNT = Math.max(
    80,
    Math.min(360, Math.round((window.innerWidth * window.innerHeight) / 9000)),
  );

  const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const host = document.getElementById(HOST_ID);
  if (!host) return;

  const state = {
    mode:        DEFAULT_MODE,    // 'home' | 'mine' | 'off'
    shape:       DEFAULT_SHAPE,   // 'solid' | 'points'
    homeFeature: null,
    mineFeature: null,
    points:      null,            // [{ox, oy, dx, dy, vx, vy}, ...] in viewBox units
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
  // Outline (.geo-drift > .geo-path) paints below the points. In points
  // mode it stays put and the CSS-driven `geo-shimmer` keyframe breathes
  // its stroke-opacity across the whole perimeter; in solid mode the
  // group itself drifts (`geo-drift` keyframe).
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
    // featureBBox() returns null for non-polygon/empty geometry (e.g. a
    // stale `mdo:geo:v1` cache entry or a worker feature missing its
    // polygon). makeProjector() would then destructure null and throw
    // "bbox is not iterable" — geoPathD already guards this (line ~141),
    // so mirror that here rather than crash the whole background.
    if (!bbox) return { points: [] };
    const project = makeProjector(bbox);
    const rings = collectRings(geom).map(r => r.map(project));
    if (!rings.length) return { points: [] };
    const lengths = rings.map(r => {
      let l = 0;
      for (let i = 1; i < r.length; i++) {
        l += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
      }
      return l;
    });
    const totalLen = lengths.reduce((a, b) => a + b, 0);
    if (totalLen === 0) return { points: [] };
    const points = [];
    rings.forEach((r, i) => {
      // Allocate point budget proportional to ring length, using floor
      // so the total stays at-or-below POINT_COUNT. Tiny lakes/islands
      // (Houston's MultiPolygon has 45 rings) round to 0 and drop out
      // — they're visual noise against the main outline.
      const share = Math.floor(POINT_COUNT * (lengths[i] / totalLen));
      if (share < 1) return;
      const samples = sampleAlongRing(r, share);
      for (const [x, y] of samples) {
        const angle = Math.random() * Math.PI * 2;
        const speed = VEL_MIN + Math.random() * (VEL_MAX - VEL_MIN);
        points.push({
          ox: x, oy: y,
          dx: 0, dy: 0,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
        });
      }
    });
    return { points };
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
      c.setAttribute('cx', (p.ox + p.dx).toFixed(2));
      c.setAttribute('cy', (p.oy + p.dy).toFixed(2));
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
    const R = DRIFT_RADIUS, R2 = R * R;
    const pts = state.points;
    const cs  = state.circles;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      p.dx += p.vx * dt;
      p.dy += p.vy * dt;
      const r2 = p.dx * p.dx + p.dy * p.dy;
      if (r2 > R2) {
        const r  = Math.sqrt(r2);
        const nx = p.dx / r, ny = p.dy / r;
        const vDotN = p.vx * nx + p.vy * ny;
        // Only reflect when moving outward — guards against a fast
        // particle re-reflecting on the next frame and sticking.
        if (vDotN > 0) {
          p.vx -= 2 * vDotN * nx;
          p.vy -= 2 * vDotN * ny;
        }
        p.dx = nx * R;
        p.dy = ny * R;
      }
      cs[i].setAttribute('cx', (p.ox + p.dx).toFixed(2));
      cs[i].setAttribute('cy', (p.oy + p.dy).toFixed(2));
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
        ox: +p.ox.toFixed(2),
        oy: +p.oy.toFixed(2),
        dx: +p.dx.toFixed(2),
        dy: +p.dy.toFixed(2),
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
      if (pendingHydration &&
          pendingHydration.mode === state.mode &&
          pendingHydration.shape === 'points' &&
          pendingHydration.bboxHash === newHash) {
        state.points = pendingHydration.points.map(p => ({ ...p }));
        pendingHydration = null;
      } else if (!state.points || state.bboxHash !== newHash) {
        state.points = samplePoints(geom, bbox).points;
      }
      state.bboxHash = newHash;
      drawPoints();
      startDrift();
    } else {
      cancelDrift();
    }
  }

  // ── home polygon (always loaded) ────────────────────────────────────
  // The home polygon is purely decorative, so defer its fetch until the
  // browser is idle rather than competing with critical page work on
  // load. requestIdleCallback isn't in Safari — fall back to a short
  // setTimeout there.
  function loadHomePolygon() {
    fetch(HOME_URL, { cache: 'force-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        state.homeFeature = data;
        render();
      })
      .catch(() => { /* offline / 404 — leave the page un-decorated */ });
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(loadHomePolygon, { timeout: 3000 });
  } else {
    setTimeout(loadHomePolygon, 200);
  }

  // ── localStorage cache for the visitor's own polygon ────────────────
  // Only the derived city polygon and a timestamp are persisted. The
  // rounded coordinates that produced it are deliberately NOT stored —
  // doing so would contradict the tweaks-panel privacy copy.
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
  function saveCachedMine(feature) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        feature, savedAt: Date.now(),
      }));
    } catch { /* quota / disabled — non-fatal */ }
  }
  // Explicit way to wipe any locally cached location data. Called when
  // the visitor switches the map away from 'mine' and exposed on the
  // imperative API so the cache is never stuck around silently.
  function clearCachedMine() {
    try { localStorage.removeItem(STORAGE_KEY); }
    catch { /* disabled — non-fatal */ }
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

    // Coordinates are rounded only for the worker request URL — they are
    // never persisted, so no cache key is derived from them.
    const lat = +pos.coords.latitude.toFixed(COORD_PRECISION);
    const lng = +pos.coords.longitude.toFixed(COORD_PRECISION);

    try {
      const res = await fetch(`${ENDPOINT}?lat=${lat}&lng=${lng}`, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return false;
      const body = await res.json();
      if (!body || !body.feature) return false;
      state.mineFeature = body.feature;
      saveCachedMine(body.feature);
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
    } else if (next === 'home' || next === 'off') {
      // Leaving the personal map: drop the cached city polygon and the
      // in-memory copy so no location data lingers after opting out.
      clearCachedMine();
      state.mineFeature = null;
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
  // useHome/off and clearCache all wipe the cached personal polygon so
  // opting out of the personal map clears the stored location too.
  window.geoBackground = {
    useMine: () => { state.mode = 'mine'; return tryUseMine({ prompt: true }).finally(render); },
    useHome: () => {
      state.mode = 'home';
      clearCachedMine();
      state.mineFeature = null;
      render();
    },
    off: () => {
      state.mode = 'off';
      clearCachedMine();
      state.mineFeature = null;
      render();
    },
    clearCache: () => { clearCachedMine(); state.mineFeature = null; },
  };

  // ── initial silent upgrade ──────────────────────────────────────────
  // Only rehydrate the cached personal polygon when the configured
  // default is already 'mine'. Without this gate, a cached polygon
  // from a previous "mine" session silently overrides a deliberate
  // revert to 'home' in TWEAK_DEFAULTS.
  if (state.mode === 'mine') {
    tryUseMine({ prompt: false }).then(() => render());
  }
})();
