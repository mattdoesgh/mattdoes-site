// Tweaks panel — dark/light, accent swatch, serif toggle.
// Designed to be embeddable: talks to a parent window via postMessage.
(() => {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    dark: true,
    accent: "pink",
    serif: true,
    geo: "home",
    geoShape: "points"
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
  panel.querySelectorAll('.tk-seg').forEach(grp => {
    const key = grp.dataset.key;
    grp.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => persist({ [key]: btn.dataset.value }));
    });
  });
  // Single source of truth for opening/closing the panel — keeps the
  // .open class and any aria-expanded triggers (footer link, etc.)
  // in lockstep regardless of who flipped it.
  // Tracks the trigger that opened the panel so we can restore focus
  // to it on close (WCAG 2.4.3 focus-order, 2.4.11 focus-not-obscured).
  let lastFocus = null;
  function focusables() {
    return panel.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
  }
  function setPanelOpen(open) {
    const was = panel.classList.contains('open');
    panel.classList.toggle('open', !!open);
    document.querySelectorAll('[data-tweaks-toggle]').forEach(b => {
      b.setAttribute('aria-expanded', String(!!open));
    });
    if (open && !was) {
      lastFocus = document.activeElement;
      const first = focusables()[0];
      if (first) first.focus();
    } else if (!open && was) {
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
      lastFocus = null;
    }
  }

  // Trap Tab inside the panel while open; Escape closes.
  panel.addEventListener('keydown', (e) => {
    if (!panel.classList.contains('open')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setPanelOpen(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last  = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });

  panel.querySelector('.close')?.addEventListener('click', () => {
    setPanelOpen(false);
    postToParent({ type: '__deactivate_edit_mode' });
  });

  // On-page triggers (e.g. footer "tweaks" link). Independent of the
  // edit-mode harness — a visitor can open settings without an embedder.
  document.querySelectorAll('[data-tweaks-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      setPanelOpen(!panel.classList.contains('open'));
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
