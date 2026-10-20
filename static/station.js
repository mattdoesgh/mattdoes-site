/* Keyword layer and live listening refresh.
   The trail does not need this file: redaction bars are native details.
   The mailto addresses are not in this file. */
(function () {
  var phrase = 'lucia';
  var buffer = '';

  function formatScrobbleCount(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function httpsHref(link) {
    if (typeof link !== 'string') return '';
    var value = link.trim();
    if (!/^https:\/\//i.test(value)) return '';
    return value;
  }

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

  function setText(id, text) {
    var node = document.getElementById(id);
    if (node) node.textContent = text;
  }

  function apply(data) {
    var tracks = Array.isArray(data.tracks) ? data.tracks : [];
    if (tracks.length && !(Number(data.playcount) > 0)) return;
    var live = null;
    var newest = null;
    for (var i = 0; i < tracks.length; i += 1) {
      var row = tracks[i];
      if (!row) continue;
      if (row.nowPlaying && !live) live = row;
      if (!row.nowPlaying && row.date && (!newest || String(row.date) > String(newest.date))) newest = row;
    }
    var teaser = live || newest;
    if (teaser) {
      var name = [teaser.artist, teaser.track].filter(Boolean).join(' — ');
      setText('listen-teaser', live ? 'live · ' + name : name);
    }
    var count = document.getElementById('scrobble-count');
    if (count && data.playcount != null) count.textContent = formatScrobbleCount(data.playcount);
    var state = document.getElementById('signal-state');
    if (state) state.textContent = live ? 'live' : 'idle';
    var bars = document.getElementById('signal-bars');
    if (bars) {
      var spans = bars.querySelectorAll('span');
      for (var b = 0; b < spans.length; b += 1) {
        var on = !!live || (!live && tracks.length && b < 2);
        spans[b].classList.toggle('on', on);
      }
    }
    var log = document.getElementById('listen-log');
    if (!log || log.tagName !== 'OL') return;
    var ordered = [];
    if (live) ordered.push(live);
    var rest = tracks.filter(function (row) { return row && !row.nowPlaying && row.date; });
    rest.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    ordered = ordered.concat(rest).slice(0, 25);
    log.replaceChildren();
    for (var n = 0; n < ordered.length; n += 1) {
      log.appendChild(logItem(ordered[n]));
    }
  }

  function logItem(row) {
    var li = document.createElement('li');
    var time = document.createElement('time');
    time.className = 'time';
    if (row.nowPlaying) {
      time.textContent = 'live';
    } else {
      time.setAttribute('datetime', String(row.date || ''));
      time.textContent = String(row.date || '').slice(0, 16).replace('T', ' ') + (row.date ? ' UTC' : '');
    }
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
    li.append(time, what, by);
    if (row.album) {
      var album = document.createElement('span');
      album.className = 'album';
      album.textContent = row.album;
      li.appendChild(album);
    }
    return li;
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

  function start() {
    document.addEventListener('keydown', onKey);
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
