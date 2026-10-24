/* Keyword layer and live track refresh.
   The trail does not need this file: the bars are native details.
   The mailto addresses are not in this file. */
(function () {
  /* frequency-key */
  var phrase = 'lucia';
  var buffer = '';
  /* frequency-key */

  function httpsHref(link) {
    if (typeof link !== 'string') return '';
    var value = link.trim();
    if (!/^https:\/\//i.test(value)) return '';
    return value;
  }

  /* frequency-key */
  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (typeof event.key !== 'string' || event.key.length !== 1) return;
    var el = event.target;
    if (el && typeof el.closest === 'function' && el.closest('input, textarea, select, [contenteditable="true"]')) {
      return;
    }
    buffer = (buffer + event.key.toLowerCase()).slice(-phrase.length);
    if (buffer !== phrase) return;
    var root = document.body.getAttribute('data-root') || '/';
    window.location.assign(root + 'frequency/');
  }
  /* frequency-key */

  function trackItem(row) {
    var li = document.createElement('li');
    var what = document.createElement('span');
    what.className = 'what';
    var href = httpsHref(row.link);
    var title = row.track || 'Untitled';
    if (href) {
      var anchor = document.createElement('a');
      anchor.href = href;
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = title;
      what.appendChild(anchor);
    } else {
      what.textContent = title;
    }
    var by = document.createElement('span');
    by.className = 'by';
    by.textContent = row.artist || '';
    li.append(what, by);
    if (row.album) {
      var album = document.createElement('span');
      album.className = 'album';
      album.textContent = row.album;
      li.appendChild(album);
    }
    return li;
  }

  function apply(data) {
    var tracks = Array.isArray(data.tracks) ? data.tracks : [];
    if (tracks.length && !(Number(data.playcount) > 0)) return;
    var live = null;
    for (var i = 0; i < tracks.length; i += 1) {
      var row = tracks[i];
      if (row && row.nowPlaying && !live) live = row;
    }
    var list = document.getElementById('tracks');
    if (!list || list.tagName !== 'OL') return;
    var ordered = [];
    if (live) ordered.push(live);
    var rest = tracks.filter(function (row) { return row && !row.nowPlaying && row.date; });
    rest.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    ordered = ordered.concat(rest).slice(0, 25);
    list.replaceChildren();
    for (var n = 0; n < ordered.length; n += 1) {
      list.appendChild(trackItem(ordered[n]));
    }
  }

  function refresh() {
    if (typeof fetch !== 'function') return;
    fetch('/api/listening/recent', { headers: { accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || data.reason) return;
        apply(data);
      })
      .catch(function () {});
  }

  var armedCovers = new WeakSet();

  function coverTile(img) {
    var tile = img && img.parentElement;
    if (!tile || !tile.classList || !tile.classList.contains('album-tile')) return null;
    return tile;
  }

  function dropCover(tile) {
    var parent = tile.parentElement;
    if (parent) parent.removeChild(tile);
  }

  function onCoverError(event) {
    var tile = coverTile(event.currentTarget);
    if (!tile) return;
    var grid = tile.parentElement;
    if (grid && grid.classList.contains('album-grid')) {
      var charts = grid.parentElement;
      var pool = charts && charts.querySelector('.album-spares');
      var spare = pool && pool.querySelector('.album-tile');
      if (spare) {
        grid.replaceChild(spare, tile);
        armCover(spare);
        return;
      }
    }
    dropCover(tile);
  }

  function armCover(tile) {
    var img = tile.querySelector('img');
    if (!img || armedCovers.has(img)) return;
    armedCovers.add(img);
    img.addEventListener('error', onCoverError);
    if (typeof img.decode === 'function' && img.complete && img.naturalWidth === 0) {
      onCoverError({ currentTarget: img });
    }
  }

  function armCovers() {
    var charts = document.querySelector('.album-charts');
    if (!charts) return;
    var tiles = charts.querySelectorAll('.album-tile');
    for (var i = 0; i < tiles.length; i += 1) armCover(tiles[i]);
  }

  function start() {
    /* frequency-key */
    document.addEventListener('keydown', onKey);
    /* frequency-key */
    armCovers();
    refresh();
  }

  if (document.prerendering) {
    document.addEventListener('prerenderingchange', function () {
      if (!document.prerendering) start();
    }, { once: true });
  } else {
    start();
  }
})();
