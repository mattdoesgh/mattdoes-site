// nav-prefetch.js — instant cross-page nav.
//
// Three layers, cheapest first, falling back when unsupported:
//
// 1. Speculation Rules API (Chrome 121+) — prerender same-origin links
//    when the pointer enters them or they sit in the viewport for 200ms.
//    Prerendered pages are restored from memory on click → ~0ms LCP.
//
// 2. <link rel="prefetch"> for browsers that lack speculation rules
//    (Safari, Firefox). Triggered on pointerenter / focusin / touchstart.
//
// 3. View Transitions API for cross-document fades — ignored if the
//    browser doesn't implement it. Does not block first paint either way.
//
// The script is opt-in per link via `data-prefetch="off"` (skip) and
// is a no-op for off-origin, hash-only, mailto:, tel:, and POST forms.

(() => {
  const sameOrigin = (u) => {
    try { return new URL(u, location.href).origin === location.origin; }
    catch { return false; }
  };
  const eligible = (a) => {
    if (!a || a.tagName !== 'A' || !a.href) return false;
    if (a.dataset.prefetch === 'off') return false;
    if (a.target && a.target !== '' && a.target !== '_self') return false;
    const u = new URL(a.href, location.href);
    if (!sameOrigin(u)) return false;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    // Skip in-page anchors and the current page.
    if (u.pathname === location.pathname && u.search === location.search) return false;
    return true;
  };

  // ── Layer 2: rel=prefetch on intent ─────────────────────────────────
  // Defined first so Layer 1 can fall back to it. `fallbackInstalled`
  // guarantees the wiring happens at most once even if both the
  // unsupported-API path and the CSP-violation path trigger it.
  let fallbackInstalled = false;
  function installPrefetchFallback() {
    if (fallbackInstalled) return;
    fallbackInstalled = true;

    const seen = new Set();
    const prefetched = new Set();
    const prefetch = (href) => {
      if (prefetched.has(href)) return;
      prefetched.add(href);
      const l = document.createElement('link');
      l.rel = 'prefetch';
      l.href = href;
      l.as = 'document';
      document.head.appendChild(l);
    };

    const onIntent = (e) => {
      const a = e.target.closest && e.target.closest('a');
      if (!eligible(a)) return;
      if (seen.has(a)) return;
      seen.add(a);
      prefetch(a.href);
    };

    // pointerenter fires once per entry; passive listeners stay off the
    // main thread. focusin covers keyboard nav.
    document.addEventListener('pointerenter', onIntent, { capture: true, passive: true });
    document.addEventListener('focusin',      onIntent, { capture: true, passive: true });
    document.addEventListener('touchstart',   onIntent, { capture: true, passive: true });

    // Idle-time pass: prefetch links visible in the viewport.
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
    idle(() => {
      if (!('IntersectionObserver' in window)) return;
      const io = new IntersectionObserver((entries) => {
        for (const ent of entries) {
          if (!ent.isIntersecting) continue;
          const a = ent.target;
          io.unobserve(a);
          if (eligible(a) && !seen.has(a)) {
            seen.add(a);
            prefetch(a.href);
          }
        }
      }, { rootMargin: '200px' });
      document.querySelectorAll('a[href]').forEach(a => {
        if (eligible(a)) io.observe(a);
      });
    });
  }

  // ── Layer 1: Speculation Rules (Chrome) ─────────────────────────────
  // Chromium reads the *static* <script type="speculationrules"> emitted in
  // the document <head> (design-system/ssg/document.tsx) — the CSP now allows
  // it via the `'inline-speculation-rules'` source. So for browsers that
  // support the API there's nothing to do here: bail out before installing the
  // fallback, otherwise we'd register a second, redundant set of hints.
  if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) return;

  // No speculation-rules support at all (Safari, Firefox) — go straight
  // to the rel=prefetch fallback.
  installPrefetchFallback();
})();
