// tag-filter.js — URL-driven in-page filtering for any timeline page
// (homepage, /blog/).
//
// Contract:
//  - Rows expose their tags via `data-tags="foo bar"` on the row container
//    and (where applicable) their kind via `data-kind="journal|making|thought"`.
//  - Tag chips (`a.tg[data-tag]`) and filter-strip links (`a[data-filter]`,
//    `a[data-kind-filter]`) are intercepted on click. If the link's path
//    matches the current page, we filter in place via pushState; otherwise
//    we let the browser navigate.
//  - Active tag lives in `?tag=`; active kind lives in `?kind=`. Filters
//    AND-combine: a row is visible iff the tag matches (or no tag is set)
//    AND the kind matches (or no kind is set). Both filters survive
//    independently across clicks so /blog/?kind=journal&tag=meta works.
//  - Group dividers (`.tl-divider`) auto-hide when their group is empty.
//
// No dependencies. Safe to load on any page — does nothing if there are
// no `[data-tags]` rows in `.timeline`.
(() => {
  const timeline = document.querySelector('.timeline');
  if (!timeline) return;

  const rows         = () => timeline.querySelectorAll('.row[data-tags]');
  const dividers     = () => timeline.querySelectorAll('.tl-divider');
  const tagLinks     = () => document.querySelectorAll('.filter a[data-filter]');
  const kindLinks    = () => document.querySelectorAll('.filter a[data-kind-filter]');

  function readFiltersFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return {
      tag:  params.get('tag')  || '',
      kind: params.get('kind') || '',
    };
  }

  function applyFilter({ tag, kind }) {
    const t = tag || '';
    const k = kind || '';
    rows().forEach(r => {
      const tags = (r.dataset.tags || '').split(' ').filter(Boolean);
      const tagMatch  = !t || tags.includes(t);
      const kindMatch = !k || r.dataset.kind === k;
      r.hidden = !(tagMatch && kindMatch);
    });
    // Hide a group divider if every row beneath it (until the next
    // divider) is hidden. Keeps the page from showing a date header
    // with nothing under it.
    dividers().forEach(div => {
      let n = div.nextElementSibling;
      let visible = 0;
      while (n && !n.classList.contains('tl-divider')) {
        if (n.classList.contains('row') && !n.hidden) visible++;
        n = n.nextElementSibling;
      }
      div.hidden = visible === 0;
    });
    // Toggle on-class for each filter chip independently, and keep
    // `aria-current` in sync so the active chip is exposed to assistive
    // tech (not just by colour). The `.all` chip lights up only when no
    // filter is active.
    const setActive = (a, active) => {
      a.classList.toggle('on', active);
      if (active) a.setAttribute('aria-current', 'true');
      else        a.removeAttribute('aria-current');
    };
    tagLinks().forEach(a => {
      // .all carries both data-filter="" and data-kind-filter="" — skip
      // it here so the all-detection below owns it.
      if (a.classList.contains('all')) return;
      setActive(a, (a.dataset.filter || '') === t);
    });
    kindLinks().forEach(a => {
      if (a.classList.contains('all')) return;
      setActive(a, (a.dataset.kindFilter || '') === k);
    });
    document.querySelectorAll('.filter a.all').forEach(a => {
      setActive(a, !t && !k);
    });
    updateBanner({ tag: t, kind: k });
    updateCount();
    announce({ tag: t, kind: k });
  }

  function updateBanner({ tag, kind }) {
    let banner = document.getElementById('tag-banner');
    const active = !!(tag || kind);
    if (!active) { if (banner) banner.remove(); return; }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'tag-banner';
      banner.className = 'tag-banner';
      timeline.insertBefore(banner, timeline.firstChild);
    }
    const parts = [];
    if (kind) parts.push('kind <span class="tg">' + escapeHtml(kind) + '</span>');
    if (tag)  parts.push('tag <span class="tg">'  + escapeHtml(tag)  + '</span>');
    banner.innerHTML =
      'showing ' + parts.join(' · ') +
      ' · <a href="' + window.location.pathname + '" class="clear">clear</a>';
  }

  // ── live-region announcements (WCAG 4.1.3) ──────────────────────────
  // Filtering changes the visible result set with no DOM focus move, so
  // screen-reader users get no feedback. A single visually-hidden
  // role="status" region carries one concise message per filter action.
  //
  // `liveRegion` is created lazily on the first announcement and
  // `announcedOnce` suppresses the initial page-load call when no filter
  // is active (no result actually changed yet).
  let liveRegion = null;
  let announcedOnce = false;
  function getLiveRegion() {
    if (liveRegion) return liveRegion;
    liveRegion = document.createElement('div');
    liveRegion.className = 'visually-hidden';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    timeline.appendChild(liveRegion);
    return liveRegion;
  }
  function announce({ tag, kind }) {
    const active = !!(tag || kind);
    // Don't announce the no-op initial load when nothing is filtered.
    if (!active && !announcedOnce) return;
    announcedOnce = true;
    let visible = 0;
    rows().forEach(r => { if (!r.hidden) visible++; });
    const total = rows().length;
    let msg = `showing ${visible} of ${total} entries`;
    if (active) {
      const facets = [];
      if (kind) facets.push(`kind ${kind}`);
      if (tag)  facets.push(`tag ${tag}`);
      msg = `filtered by ${facets.join(' and ')} — ${msg}`;
    }
    getLiveRegion().textContent = msg;
  }

  // If the filter strip has a `.cnt` counter, keep it in sync with what's
  // actually visible so the user can see how big the filtered slice is.
  function updateCount() {
    const cnt = document.querySelector('.filter .cnt');
    if (!cnt) return;
    if (!cnt.dataset.template) cnt.dataset.template = cnt.textContent;
    let visible = 0;
    rows().forEach(r => { if (!r.hidden) visible++; });
    const total = rows().length;
    if (visible === total) { cnt.textContent = cnt.dataset.template; return; }
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

  function buildUrl({ tag, kind }) {
    const params = new URLSearchParams();
    if (kind) params.set('kind', kind);
    if (tag)  params.set('tag',  tag);
    const qs = params.toString();
    return qs ? window.location.pathname + '?' + qs : window.location.pathname;
  }

  function navigate(next) {
    const url = buildUrl(next);
    window.history.pushState(next, '', url);
    applyFilter(next);
  }

  // Click delegation: handles tag chips, filter-bar links, kind chips,
  // and the banner's clear link. We only intercept when the link points
  // at the current page — off-page tag chips (e.g. on an article page)
  // keep their natural navigation so they can jump to /blog/.
  document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;

    if (a.classList.contains('clear') && a.closest('.tag-banner')) {
      e.preventDefault();
      navigate({ tag: '', kind: '' });
      return;
    }

    const isTagChip  = a.classList.contains('tg') && a.dataset.tag !== undefined;
    const isTagLink  = a.dataset.filter !== undefined;
    const isKindLink = a.dataset.kindFilter !== undefined;
    if (!isTagChip && !isTagLink && !isKindLink) return;

    let url;
    try { url = new URL(a.getAttribute('href'), window.location.href); }
    catch { return; }
    if (url.pathname !== window.location.pathname) return; // let it navigate

    e.preventDefault();
    const current = readFiltersFromUrl();
    if (a.classList.contains('all')) {
      navigate({ tag: '', kind: '' });
    } else if (isTagChip) {
      navigate({ tag: a.dataset.tag, kind: current.kind });
    } else if (isKindLink) {
      navigate({ tag: current.tag, kind: a.dataset.kindFilter || '' });
    } else if (isTagLink) {
      navigate({ tag: a.dataset.filter || '', kind: current.kind });
    }
  });

  window.addEventListener('popstate', () => applyFilter(readFiltersFromUrl()));

  applyFilter(readFiltersFromUrl());
})();
