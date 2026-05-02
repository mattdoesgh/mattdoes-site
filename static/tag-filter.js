// tag-filter.js — URL-driven, in-page tag filtering for any timeline page
// (homepage, /journal/, /making/, /thoughts/).
//
// Contract:
//  - Rows expose their tags via `data-tags="foo bar"` on the row container.
//  - Tag chips (`a.tg[data-tag]`) and the filter strip (`a[data-filter]`)
//    are intercepted on click. If the link's path matches the current page,
//    we filter in place via pushState; otherwise we let the browser navigate
//    so an article-page tag chip can jump to the right section index.
//  - The active tag lives in the `?tag=` query param so filtered views are
//    deep-linkable (and bookmarkable).
//  - Group dividers (`.tl-divider`) auto-hide when their group is empty.
//
// No dependencies. Safe to load on any page — does nothing if there are no
// `[data-tags]` rows in `.timeline`.
(() => {
  const timeline = document.querySelector('.timeline');
  if (!timeline) return;

  const rows = () => timeline.querySelectorAll('.row[data-tags]');
  const dividers = () => timeline.querySelectorAll('.tl-divider');
  const filterLinks = () => document.querySelectorAll('.filter a[data-filter]');

  function readTagFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('tag') || '';
  }

  function applyFilter(tag) {
    const t = tag || '';
    rows().forEach(r => {
      const tags = (r.dataset.tags || '').split(' ').filter(Boolean);
      const match = !t || tags.includes(t);
      r.hidden = !match;
    });
    // Hide a group divider if every row beneath it (until the next divider)
    // is hidden. Keeps the page from showing a date header with nothing under it.
    dividers().forEach(div => {
      let n = div.nextElementSibling;
      let visible = 0;
      while (n && !n.classList.contains('tl-divider')) {
        if (n.classList.contains('row') && !n.hidden) visible++;
        n = n.nextElementSibling;
      }
      div.hidden = visible === 0;
    });
    filterLinks().forEach(a => {
      a.classList.toggle('on', (a.dataset.filter || '') === t);
    });
    updateBanner(t);
    updateCount(t);
  }

  function updateBanner(tag) {
    let banner = document.getElementById('tag-banner');
    if (!tag) { if (banner) banner.remove(); return; }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'tag-banner';
      banner.className = 'tag-banner';
      timeline.insertBefore(banner, timeline.firstChild);
    }
    banner.innerHTML =
      'showing posts tagged <span class="tg">' + escapeHtml(tag) + '</span>' +
      ' · <a href="' + window.location.pathname + '" class="clear">clear</a>';
  }

  // If the filter strip has a `.cnt` counter, keep it in sync with what's
  // actually visible so the user can see how big the filtered slice is.
  function updateCount(tag) {
    const cnt = document.querySelector('.filter .cnt');
    if (!cnt) return;
    if (!cnt.dataset.template) cnt.dataset.template = cnt.textContent;
    if (!tag) { cnt.textContent = cnt.dataset.template; return; }
    let visible = 0;
    rows().forEach(r => { if (!r.hidden) visible++; });
    // Try to preserve the original suffix ("posts", "entries", …).
    const suffix = (cnt.dataset.template.match(/\s+(\D.*)$/) || [, ''])[1];
    cnt.textContent = visible + (suffix ? ' ' + suffix : '');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function navigate(tag) {
    const url = tag
      ? window.location.pathname + '?tag=' + encodeURIComponent(tag)
      : window.location.pathname;
    window.history.pushState({ tag: tag || null }, '', url);
    applyFilter(tag);
  }

  // Click delegation: handles tag chips, filter-bar links, and the banner's
  // clear link. We only intercept when the link points at the current page —
  // off-page tag chips (e.g. on an article page) keep their natural navigation.
  document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;

    if (a.classList.contains('clear') && a.closest('.tag-banner')) {
      e.preventDefault();
      navigate('');
      return;
    }

    const isTagChip = a.classList.contains('tg') && a.dataset.tag !== undefined;
    const isFilter  = a.dataset.filter !== undefined;
    if (!isTagChip && !isFilter) return;

    let url;
    try { url = new URL(a.getAttribute('href'), window.location.href); }
    catch { return; }
    if (url.pathname !== window.location.pathname) return; // let it navigate

    e.preventDefault();
    const tag = isTagChip ? a.dataset.tag : (a.dataset.filter || '');
    navigate(tag);
  });

  window.addEventListener('popstate', () => applyFilter(readTagFromUrl()));

  applyFilter(readTagFromUrl());
})();
