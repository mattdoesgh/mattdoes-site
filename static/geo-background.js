// geo-background.js — animated GeoJSON drift behind site content.
//
// First paint: fetches /home.geojson (Houston, baked at build time),
// renders it as a single drifting <path> inside #geo-bg.
//
// Optional upgrade: if the visitor has *already* granted geolocation
// for this origin, we silently swap in their own city's polygon.
// We don't prompt on first load — the only path to a permission
// prompt is via the tweaks panel (`local map: mine`), so casual
// visitors get the home shape and nothing more.
//
// Caching: a successfully fetched personal polygon is stashed in
// localStorage, keyed by rounded coords, for 30 days. Subsequent
// visits read from the cache and skip both the geolocation API and
// the /api/geo/lookup call.
//
// Privacy: coords are sent to /api/geo/lookup (Matt's worker) once per
// rounded-grid cell. They're never written to localStorage and never
// leave the worker — only the polygon comes back.

(() => {
  const HOST_ID         = 'geo-bg';
  const HOME_URL        = '/home.geojson';
  const ENDPOINT        = (document.querySelector('meta[name="geo-endpoint"]')?.content) || '/api/geo/lookup';
  const STORAGE_KEY     = 'mdo:geo:v1';
  const STORAGE_TTL_MS  = 30 * 24 * 60 * 60 * 1000;   // 30 days
  const COORD_PRECISION = 1;                           // ~11 km grid → cache hits across a metro area

  const host = document.getElementById(HOST_ID);
  if (!host) return;

  // Single source of truth for the rendered polygon. mode is 'home' |
  // 'mine' | 'off'. Defaults to 'home'; overridden by the tweaks
  // panel via the `geo-bg:setting` event.
  const state = {
    mode: 'home',
    homeFeature: null,
    mineFeature: null,
  };

  // ── SVG plumbing ─────────────────────────────────────────────────────
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg   = document.createElementNS(SVGNS, 'svg');
  const drift = document.createElementNS(SVGNS, 'g');
  const path  = document.createElementNS(SVGNS, 'path');

  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  drift.setAttribute('class', 'geo-drift');
  path.setAttribute('class', 'geo-path');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  path.setAttribute('fill', 'none');
  drift.appendChild(path);
  svg.appendChild(drift);
  host.appendChild(svg);

  // Convert a GeoJSON Polygon/MultiPolygon to an SVG path "d" string.
  // We project lon/lat → SVG coordinates linearly inside the feature's
  // own bounding box and let the viewBox do the rest. y is flipped
  // because SVG y grows downward.
  function geoPathD(geom) {
    const bbox = featureBBox(geom);
    if (!bbox) return '';
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const w = maxLng - minLng || 1;
    const h = maxLat - minLat || 1;
    const project = ([lng, lat]) => {
      const x = ((lng - minLng) / w) * 1000;
      const y = ((maxLat - lat) / h) * 1000;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    };
    const ringD = (ring) => {
      if (!ring.length) return '';
      let d = `M${project(ring[0])}`;
      for (let i = 1; i < ring.length; i++) d += ` L${project(ring[i])}`;
      return d + ' Z';
    };
    const polyD = (poly) => poly.map(ringD).join(' ');
    if (geom.type === 'Polygon')      return polyD(geom.coordinates);
    if (geom.type === 'MultiPolygon') return geom.coordinates.map(polyD).join(' ');
    return '';
  }

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

  function setFeature(feature) {
    const geom = feature?.geometry || feature;
    if (!geom) return;
    svg.setAttribute('viewBox', '0 0 1000 1000');
    path.setAttribute('d', geoPathD(geom));
    host.classList.add('ready');
  }

  function render() {
    if (state.mode === 'off') {
      host.classList.remove('ready');
      path.setAttribute('d', '');
      return;
    }
    const f = state.mode === 'mine' && state.mineFeature ? state.mineFeature : state.homeFeature;
    if (f) setFeature(f);
  }

  // ── home polygon (always loaded) ─────────────────────────────────────
  fetch(HOME_URL, { cache: 'force-cache' })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) return;
      state.homeFeature = data;
      render();
    })
    .catch(() => { /* offline / 404 — leave the page un-decorated */ });

  // ── localStorage cache for the visitor's own polygon ─────────────────
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

  // ── opt-in upgrade flow ──────────────────────────────────────────────
  // `prompt` controls whether we'll trigger the browser's permission
  // dialog. Silent (initial-load) checks pass false; explicit user
  // toggles (tweaks panel "mine") pass true.
  async function tryUseMine({ prompt = false } = {}) {
    // 1. Cache wins.
    const cached = loadCachedMine();
    if (cached) {
      state.mineFeature = cached.feature;
      render();
      return true;
    }
    if (!('geolocation' in navigator)) return false;

    // 2. If we're not allowed to prompt, only continue when permission
    //    is already 'granted'. Browsers without permissions.query()
    //    fall through to the silent-fail branch.
    if (!prompt && navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state !== 'granted') return false;
      } catch { return false; }
    }

    // 3. Get coords, then fetch the polygon.
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

  // ── tweaks panel hook ────────────────────────────────────────────────
  // tweaks.js fires `geo-bg:setting` when the user changes the toggle.
  // detail = { value: 'home' | 'mine' | 'off' }
  window.addEventListener('geo-bg:setting', (ev) => {
    const next = ev.detail?.value;
    if (!next) return;
    state.mode = next;
    if (next === 'mine' && !state.mineFeature) {
      tryUseMine({ prompt: true }).then(ok => {
        if (!ok) {
          // Permission denied or worker hiccup — fall back to home,
          // but keep the user's intent in state.mode so a later retry
          // (e.g. they re-open the panel) still aims for 'mine'.
          render();
        }
      });
    }
    render();
  });

  // ── expose a tiny imperative API for future user-facing toggles ─────
  // Lets a non-tweaks UI (e.g. a discreet "use my city" link in the
  // footer) trigger the same flow without depending on the event.
  window.geoBackground = {
    useMine: () => { state.mode = 'mine'; return tryUseMine({ prompt: true }).finally(render); },
    useHome: () => { state.mode = 'home'; render(); },
    off:     () => { state.mode = 'off';  render(); },
  };

  // ── initial silent upgrade ──────────────────────────────────────────
  // On first paint, if the visitor has previously granted geolocation
  // (e.g. they came back), upgrade without prompting. No effect on
  // first-ever visits.
  if (state.mode !== 'off') {
    tryUseMine({ prompt: false }).then(ok => { if (ok) state.mode = 'mine'; render(); });
  }
})();
