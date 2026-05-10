// nav-prefetch.js — speculative prefetch for in-site navigation. On hover,
// focus, touch, or viewport entry of an internal <a>, inject a
// <link rel="prefetch"> so the next click pulls from cache.
//
// Bails on slow connections (Save-Data, 2g) and skips external links,
// download links, mailto/tel/javascript, hash-only anchors, and the
// current page. Each URL is prefetched at most once per page load.

(() => {
  const c = navigator.connection;
  if (c && (c.saveData || /^(slow-)?2g$/.test(c.effectiveType || ''))) return;

  const seen = new Set([location.href.split('#')[0]]);

  function prefetch(href) {
    if (seen.has(href)) return;
    seen.add(href);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'document';
    link.href = href;
    document.head.appendChild(link);
  }

  function targetFor(a) {
    if (!a || !a.href) return null;
    if (a.hasAttribute('download')) return null;
    if (a.target && a.target !== '_self') return null;
    let url;
    try { url = new URL(a.href, location.href); } catch { return null; }
    if (url.origin !== location.origin) return null;
    if (!/^https?:$/.test(url.protocol)) return null;
    const here = location.href.split('#')[0];
    const there = url.href.split('#')[0];
    if (there === here) return null;
    return there;
  }

  function onHover(e) {
    const a = e.target.closest && e.target.closest('a[href]');
    const href = targetFor(a);
    if (href) prefetch(href);
  }

  document.addEventListener('mouseover', onHover, { passive: true });
  document.addEventListener('focusin',   onHover, { passive: true });
  document.addEventListener('touchstart', onHover, { passive: true });

  // Viewport-visible internal links: prefetch after a short idle window
  // so the initial paint isn't competing for bandwidth.
  function watchVisible() {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const href = targetFor(entry.target);
        if (href) prefetch(href);
        io.unobserve(entry.target);
      }
    }, { rootMargin: '200px' });
    document.querySelectorAll('a[href]').forEach((a) => {
      if (targetFor(a)) io.observe(a);
    });
  }
  const start = () => ('requestIdleCallback' in window
    ? requestIdleCallback(watchVisible, { timeout: 2000 })
    : setTimeout(watchVisible, 1500));
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
