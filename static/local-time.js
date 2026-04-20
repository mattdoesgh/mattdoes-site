// local-time.js — layer a visitor-local tooltip onto every server-rendered
// timestamp. Loaded globally from base.js.
//
// Contract: anything on the page that wants a tooltip is rendered as
//   <time class="ts" datetime="<ISO-8601>">CT text</time>
// The server formats the visible text in America/Chicago (the site's
// source-of-truth zone); this script reads each element's `datetime`
// attribute and sets a `title` attribute showing the same instant in
// the visitor's own timezone, plus an explicit "CT" line so visitors
// understand what the visible number is.
//
// Also runs whenever new <time class="ts"> elements get injected into
// the DOM (e.g. listening-live.js polling the scrobble endpoint), via
// a MutationObserver on <body>.

(() => {
  const SITE_TZ = 'America/Chicago';
  const visitorTz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }
    catch { return ''; }
  })();

  // Short tz abbrev in a given zone for a given instant ("CDT"/"CST"/"EDT"/…).
  // Falls back to the raw tz id if the runtime doesn't expose a short name.
  function tzAbbrev(date, tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, timeZoneName: 'short', year: 'numeric',
      }).formatToParts(date);
      return parts.find(p => p.type === 'timeZoneName')?.value || tz;
    } catch { return tz; }
  }

  // Render a Date as "apr 19 · 14:32" in the given tz (24-hour, lowercase
  // month to match the site's aesthetic).
  function fmt(date, tz) {
    const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(date);
      const o = {};
      for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
      if (o.hour === '24') o.hour = '00';
      const mon = MONTHS[Number(o.month) - 1] || o.month;
      return `${mon} ${o.day} ${o.year} · ${o.hour}:${o.minute}`;
    } catch {
      return date.toISOString();
    }
  }

  function annotate(el) {
    if (!el || el.dataset.tsAnnotated === '1') return;
    const iso = el.getAttribute('datetime');
    if (!iso) return;
    const d = new Date(iso);
    if (isNaN(d)) return;

    const ctLine = `${fmt(d, SITE_TZ)} ${tzAbbrev(d, SITE_TZ)}`;
    if (visitorTz && visitorTz !== SITE_TZ) {
      const localLine = `${fmt(d, visitorTz)} ${tzAbbrev(d, visitorTz)} (your time)`;
      el.title = `${ctLine}\n${localLine}`;
    } else {
      // Visitor is already on Central Time — no translation needed, but
      // the full timestamp in the tooltip is still useful when the
      // visible text is abbreviated (e.g. "2h").
      el.title = ctLine;
    }
    el.dataset.tsAnnotated = '1';
  }

  function annotateAll(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('time.ts[datetime]').forEach(annotate);
  }

  // Initial pass on DOM ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => annotateAll());
  } else {
    annotateAll();
  }

  // Watch for dynamically-inserted timestamps (listening-live.js re-renders
  // the scrobble list every minute; the scrobble counter on the homepage
  // also swaps in new markup). Cheap to run — only scans added subtrees.
  const obs = new MutationObserver(muts => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches('time.ts[datetime]')) annotate(node);
        else if (node.querySelectorAll) annotateAll(node);
      }
    }
  });
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });
})();
