// Tweaks panel — dark/light, accent swatch, serif toggle.
// Designed to be embeddable: talks to a parent window via postMessage.
(() => {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    dark: true,
    accent: "pink",
    geo: "home",
    geoShape: "points"
  }/*EDITMODE-END*/;

  const ACCENTS = {
    warm:  "oklch(0.65 0.09 65)",
    pink:  "#f77bc9",
    blue:  "oklch(0.65 0.12 240)",
    green: "oklch(0.65 0.12 150)"
  };

  // Non-sensitive visitor preferences (theme / accent / map mode +
  // shape) persist across navigation under this key. Location data is
  // deliberately NOT stored here — it lives in geo-background.js's own
  // `mdo:geo:v1` key. The `geo` value here is only the home|mine|off
  // mode string, which is a harmless preference.
  const PREFS_KEY = 'mdo:tweaks:v1';
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      // Whitelist the keys we accept so a tampered blob can't inject
      // arbitrary state properties.
      const out = {};
      for (const k of ['dark', 'accent', 'geo', 'geoShape']) {
        if (k in obj) out[k] = obj[k];
      }
      return out;
    } catch { return null; }
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        dark:     state.dark,
        accent:   state.accent,
        geo:      state.geo,
        geoShape: state.geoShape,
      }));
    } catch { /* private mode / quota — non-fatal */ }
  }

  // Layer any stored visitor prefs OVER the edit-mode defaults. The
  // EDITMODE block above is the source of truth for an embedder; an
  // ordinary visitor's saved choices take precedence on a plain load.
  const state = { ...TWEAK_DEFAULTS, ...(loadPrefs() || {}) };
  const panel = document.getElementById('tweaks');
  if (!panel) return;
  const root = document.documentElement;

  // Same-origin target for postMessage. Broadcasting to '*' would leak
  // edit-mode events to any embedder; the CSP `frame-ancestors 'self'`
  // header already prevents cross-origin embedding, so pinning to our
  // own origin here is consistent defense-in-depth.
  const PARENT_ORIGIN = location.origin;
  function postToParent(msg) {
    try { window.parent.postMessage(msg, PARENT_ORIGIN); } catch (e) {}
  }

  function apply() {
    root.dataset.theme = state.dark ? 'dark' : 'light';
    root.style.setProperty('--accent', ACCENTS[state.accent] || ACCENTS.warm);

    panel.querySelectorAll('.tk-toggle').forEach(b => {
      b.setAttribute('aria-pressed', String(!!state[b.dataset.key]));
    });
    // Accent is a native <fieldset class="tk-swatches"> of radio inputs
    // (name="tk-accent"). Reflect state by setting each radio's .checked
    // — the browser then exposes proper radio semantics to AT for free.
    panel.querySelectorAll('input[name="tk-accent"]').forEach(r => {
      r.checked = (r.value === state.accent);
    });
    panel.querySelectorAll('.tk-seg').forEach(grp => {
      const key = grp.dataset.key;
      grp.querySelectorAll('button').forEach(btn => {
        btn.setAttribute('aria-pressed', String(btn.dataset.value === state[key]));
      });
    });
    // Notify any listener (currently geo-background.js) that a tweak
    // setting changed. Keyed by tweak name so future settings can
    // hook in without a second event.
    window.dispatchEvent(new CustomEvent('geo-bg:setting', {
      detail: { value: state.geo },
    }));
    window.dispatchEvent(new CustomEvent('geo-bg:shape', {
      detail: { value: state.geoShape },
    }));
  }

  function persist(edits) {
    Object.assign(state, edits);
    apply();
    // Remember the visitor's choices so a plain navigation doesn't
    // reset them. Sensitive location data is never written here.
    savePrefs();
    postToParent({ type: '__edit_mode_set_keys', edits });
  }

  panel.querySelectorAll('.tk-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.key;
      persist({ [k]: !state[k] });
    });
  });
  // Accent fieldset: native radios fire `change` on selection (including
  // via arrow keys), so one delegated listener replaces the per-swatch
  // click handlers and gets keyboard navigation for free.
  panel.querySelectorAll('input[name="tk-accent"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.checked) persist({ accent: e.target.value });
    });
  });
  panel.querySelectorAll('.tk-seg').forEach(grp => {
    const key = grp.dataset.key;
    grp.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => persist({ [key]: btn.dataset.value }));
    });
  });
  // The panel is a native <dialog>. showModal()/close() give us focus
  // trapping, focus restoration to the opener, Escape-to-close, and
  // background inertness for free — so the old manual focus-trap,
  // lastFocus save/restore, and Escape handler are all gone. We only
  // keep `aria-expanded` on the triggers in sync, since that lives on
  // elements outside the dialog.
  function setTogglesExpanded(open) {
    document.querySelectorAll('[data-tweaks-toggle]').forEach(b => {
      b.setAttribute('aria-expanded', String(!!open));
    });
  }
  function setPanelOpen(open) {
    if (open) {
      // showModal() throws if the dialog is already open — guard it.
      if (!panel.open && typeof panel.showModal === 'function') panel.showModal();
      setTogglesExpanded(true);
    } else {
      if (panel.open && typeof panel.close === 'function') panel.close();
      // `close` event below also flips this, but call it here too so an
      // explicit close updates triggers even on browsers that fire
      // `close` asynchronously.
      setTogglesExpanded(false);
    }
  }

  // Native <dialog> closes on Escape and backdrop dismissal on its own;
  // the `close` event fires for every close path (Escape, backdrop, the
  // .close button, or programmatic). Use it as the single place that
  // resets the triggers' aria-expanded state.
  panel.addEventListener('close', () => setTogglesExpanded(false));

  panel.querySelector('.close')?.addEventListener('click', () => {
    panel.close();
    postToParent({ type: '__deactivate_edit_mode' });
  });

  // On-page triggers (e.g. footer "tweaks" link). Independent of the
  // edit-mode harness — a visitor can open settings without an embedder.
  document.querySelectorAll('[data-tweaks-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      setPanelOpen(!panel.open);
    });
  });

  // Only act on messages from our own origin. Without this check, any
  // page that loaded us in an iframe (still constrained by the
  // frame-ancestors CSP, but worth not relying on a single layer) could
  // toggle the tweaks panel by posting a crafted message.
  window.addEventListener('message', (e) => {
    if (e.origin !== PARENT_ORIGIN) return;
    const d = e.data || {};
    if (d.type === '__activate_edit_mode')   setPanelOpen(true);
    if (d.type === '__deactivate_edit_mode') setPanelOpen(false);
  });
  postToParent({ type: '__edit_mode_available' });

  apply();
})();
