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
    try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*'); } catch (e) {}
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
    try { window.parent.postMessage({ type: '__deactivate_edit_mode' }, '*'); } catch (e) {}
  });

  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === '__activate_edit_mode')   panel.classList.add('open');
    if (d.type === '__deactivate_edit_mode') panel.classList.remove('open');
  });
  try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {}

  apply();
})();
