// search.js — client-side filter over the build-time search-index.json.
// Progressive enhancement: the /search/ page ships a no-JS form fallback.
// Loaded as type="module" so the importmap can resolve _helpers.js.

import { safeUrl } from './_helpers.js';

(() => {
  const INDEX_URL = '/search-index.json';
  const form = document.getElementById('search-form');
  const input = document.getElementById('search-q');
  const results = document.getElementById('search-results');
  const status = document.getElementById('search-status');
  if (!form || !input || !results) return;

  /** @type {Array<{title:string,url:string,summary?:string,kind?:string,tags?:string[],text?:string}>} */
  let index = [];
  let loaded = false;

  async function loadIndex() {
    if (loaded) return;
    const res = await fetch(INDEX_URL, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    index = await res.json();
    loaded = true;
  }

  function tokenize(q) {
    return String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  }

  function scoreEntry(entry, terms) {
    const hay = [
      entry.title,
      entry.summary,
      entry.kind,
      (entry.tags || []).join(' '),
      entry.text,
    ].join(' ').toLowerCase();
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score += 1;
    return score;
  }

  function render(matches, q) {
    results.innerHTML = '';
    if (!q.trim()) {
      if (status) status.textContent = '';
      return;
    }
    if (!matches.length) {
      if (status) status.textContent = `No results for “${q}”.`;
      return;
    }
    if (status) status.textContent = `${matches.length} result${matches.length === 1 ? '' : 's'}.`;
    const frag = document.createDocumentFragment();
    for (const e of matches.slice(0, 40)) {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.kind = e.kind || '';
      const gutter = document.createElement('div');
      gutter.className = 'gutter';
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = e.kind || 'post';
      gutter.appendChild(kind);
      const body = document.createElement('div');
      body.className = 'body';
      const a = document.createElement('a');
      const href = safeUrl(e.url);
      if (href) a.setAttribute('href', href);
      const title = document.createElement('strong');
      title.textContent = e.title ?? '';
      a.appendChild(title);
      body.appendChild(a);
      if (e.summary) {
        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.textContent = ` — ${e.summary}`;
        body.appendChild(meta);
      }
      row.append(gutter, body);
      frag.appendChild(row);
    }
    results.appendChild(frag);
  }

  function runSearch() {
    const q = input.value.trim();
    const terms = tokenize(q);
    if (!terms.length) return render([], q);
    const matches = index
      .map(e => ({ e, score: scoreEntry(e, terms) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title))
      .map(x => x.e);
    render(matches, q);
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    runSearch();
  });
  input.addEventListener('input', () => {
    if (loaded) runSearch();
  });

  loadIndex()
    .then(() => {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q');
      if (q) {
        input.value = q;
        runSearch();
      }
    })
    .catch(() => {
      if (status) status.textContent = 'Search index unavailable.';
    });
})();
