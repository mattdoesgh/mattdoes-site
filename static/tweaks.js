// Tweaks panel — dark/light, accent swatch, serif toggle.
// Designed to be embeddable: talks to a parent window via postMessage.
(() => {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    dark: true,
    accent: "pink",
    serif: true
  }/*EDITMODE-END*/;

  const ACCENTS = {
    warm:  "oklch(0.65 0.09 65)",
    pink:  "#f77bc9",
    blue:  "oklch(0.65 0.12 240)",
    green: "oklch(0.65 0.12 150)"
  };

  const state = { ...TWEAK_DEFAULTS };
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
    if (!state.serif) root.style.setProperty('--font-serif', 'var(--font-mono)');
    else              root.style.removeProperty('--font-serif');

    panel.querySelectorAll('.tk-toggle').forEach(b => {
      b.setAttribute('aria-pressed', String(!!state[b.dataset.key]));
    });
    panel.querySelectorAll('.tk-swatches').forEach(grp => {
      const key = grp.dataset.key;
      grp.querySelectorAll('.tk-sw').forEach(sw => {
        sw.setAttribute('aria-pressed', String(sw.dataset.value === state[key]));
      });
    });
  }

  function persist(edits) {
    Object.assign(state, edits);
    apply();
    postToParent({ type: '__edit_mode_set_keys', edits });
  }

  panel.querySelectorAll('.tk-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.key;
      persist({ [k]: !state[k] });
    });
  });
  panel.querySelectorAll('.tk-swatches').forEach(grp => {
    const key = grp.dataset.key;
    grp.querySelectorAll('.tk-sw').forEach(sw => {
      sw.addEventListener('click', () => persist({ [key]: sw.dataset.value }));
    });
  });
  panel.querySelector('.close')?.addEventListener('click', () => {
    panel.classList.remove('open');
    postToParent({ type: '__deactivate_edit_mode' });
  });

  // Only act on messages from our own origin. Without this check, any
  // page that loaded us in an iframe (still constrained by the
  // frame-ancestors CSP, but worth not relying on a single layer) could
  // toggle the tweaks panel by posting a crafted message.
  window.addEventListener('message', (e) => {
    if (e.origin !== PARENT_ORIGIN) return;
    const d = e.data || {};
    if (d.type === '__activate_edit_mode')   panel.classList.add('open');
    if (d.type === '__deactivate_edit_mode') panel.classList.remove('open');
  });
  postToParent({ type: '__edit_mode_available' });

  apply();
})();
