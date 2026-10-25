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

  function dropCover(grid, img) {
    var tile = img.closest('.album-tile');
    if (!tile || !tile.parentNode) return;
    var wasHidden = tile.hasAttribute('hidden');
    tile.remove();
    if (wasHidden) return;
    var next = grid.querySelector('.album-tile[hidden]');
    if (next) next.removeAttribute('hidden');
  }

  function armCovers() {
    var grid = document.querySelector('.album-grid');
    if (!grid) return;
    grid.addEventListener('error', function (event) {
      var img = event.target;
      if (!img || img.tagName !== 'IMG') return;
      if (img.complete && img.naturalWidth === 0) dropCover(grid, img);
    }, true);
    var imgs = grid.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i += 1) {
      if (imgs[i].complete && imgs[i].naturalWidth === 0) dropCover(grid, imgs[i]);
    }
  }

  function mediaPoster(link) {
    var value = httpsHref(link);
    if (!value) return '';
    try {
      var url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'media.mattdoes.online') return '';
      return url.toString();
    } catch (err) {
      return '';
    }
  }

  function letterboxdHref(link) {
    var value = httpsHref(link);
    if (!value) return '';
    try {
      var url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      var host = url.hostname.toLowerCase();
      if (host !== 'letterboxd.com' && host !== 'www.letterboxd.com') return '';
      return url.toString();
    } catch (err) {
      return '';
    }
  }

  function bindScene() {
    var dialog = document.getElementById('scene');
    var feed = document.querySelector('ol.feed');
    if (!dialog || dialog.tagName !== 'DIALOG' || !feed) return;
    if (typeof dialog.showModal !== 'function') return;

    var closeBtn = dialog.querySelector('.scene-close');
    var titleEl = document.getElementById('scene-title');
    var yearEl = document.getElementById('scene-year');
    var rateEl = document.getElementById('scene-rate');
    var reviewEl = document.getElementById('scene-review');
    var stillEl = dialog.querySelector('.scene-still');
    if (!closeBtn || !titleEl || !yearEl || !rateEl || !reviewEl || !stillEl) return;

    var restoreEl = null;
    var currentId = '';

    function findOpener(id) {
      if (!/^\d+$/.test(String(id || ''))) return null;
      return feed.querySelector('[data-scene="' + id + '"]');
    }

    function sourceLink(href) {
      var source = dialog.querySelector('.scene-source');
      if (!source) return;
      var link = document.getElementById('scene-link');
      if (!href) {
        source.hidden = true;
        if (link) link.removeAttribute('href');
        return;
      }
      if (!link) {
        link = document.createElement('a');
        link.id = 'scene-link';
        link.textContent = 'letterboxd';
        source.appendChild(link);
      }
      link.href = href;
      link.rel = 'noopener noreferrer';
      source.hidden = false;
    }

    function sceneImg(url, width, height) {
      var img = document.getElementById('scene-img');
      if (!url) {
        if (img) img.remove();
        return;
      }
      if (!img) {
        img = document.createElement('img');
        img.id = 'scene-img';
        img.alt = '';
        stillEl.appendChild(img);
      }
      if (width > 0) img.width = width;
      if (height > 0) img.height = height;
      if (img.getAttribute('src') !== url) img.src = url;
    }

    function paint(opener) {
      var review = opener.getAttribute('data-review') || '';
      var reviewed = review.length > 0;
      dialog.classList.toggle('is-review', reviewed);
      dialog.classList.toggle('is-still', !reviewed);
      var name = opener.querySelector('.name');
      titleEl.textContent = name ? name.textContent : 'Untitled';
      var year = opener.getAttribute('data-year') || '';
      yearEl.textContent = year;
      yearEl.hidden = !reviewed || !year;
      reviewEl.textContent = review;
      reviewEl.hidden = !reviewed;
      if (reviewed) dialog.setAttribute('aria-describedby', 'scene-review');
      else dialog.removeAttribute('aria-describedby');

      rateEl.replaceChildren();
      var stars = opener.querySelector('.stars');
      if (stars) rateEl.appendChild(stars.cloneNode(true));
      if (opener.getAttribute('data-rewatch') === '1') {
        var flag = document.createElement('span');
        flag.className = 'flag';
        flag.textContent = 'rewatch';
        rateEl.appendChild(flag);
      }
      rateEl.hidden = rateEl.childNodes.length === 0;
      sourceLink(letterboxdHref(opener.getAttribute('href') || ''));
      sceneImg(
        mediaPoster(opener.getAttribute('data-full')),
        Number(opener.getAttribute('data-full-width')),
        Number(opener.getAttribute('data-full-height')),
      );
    }

    function lock() {
      if (document.documentElement.classList.contains('is-locked')) return;
      document.documentElement.dataset.scrollY = String(window.scrollY || window.pageYOffset || 0);
      document.documentElement.classList.add('is-locked');
    }

    function unlock() {
      if (!document.documentElement.classList.contains('is-locked')) return;
      var y = Number(document.documentElement.dataset.scrollY || '0');
      document.documentElement.classList.remove('is-locked');
      delete document.documentElement.dataset.scrollY;
      window.scrollTo(0, y);
    }

    function setExpanded(id) {
      var openers = feed.querySelectorAll('.film-open');
      for (var i = 0; i < openers.length; i += 1) {
        openers[i].setAttribute('aria-expanded', openers[i].getAttribute('data-scene') === String(id) ? 'true' : 'false');
      }
    }

    function focusables() {
      return [].filter.call(dialog.querySelectorAll('button, a[href]'), function (el) {
        if (el.hidden || (el.closest && el.closest('[hidden]'))) return false;
        var style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
    }

    function openScene(opener, push) {
      if (!opener) return;
      paint(opener);
      restoreEl = opener;
      currentId = opener.getAttribute('data-scene') || '';
      setExpanded(currentId);
      lock();
      dialog.hidden = false;
      if (!dialog.open) dialog.showModal();
      closeBtn.focus();
      if (push) history.pushState({ scene: currentId }, '');
    }

    function finishClose(fromPop) {
      if (dialog.open) dialog.close();
      dialog.hidden = true;
      unlock();
      setExpanded('');
      currentId = '';
      var backTo = restoreEl;
      restoreEl = null;
      if (backTo) backTo.focus();
      if (!fromPop && history.state && history.state.scene) history.back();
    }

    feed.addEventListener('click', function (event) {
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var opener = event.target && event.target.closest ? event.target.closest('.film-open') : null;
      if (!opener || !feed.contains(opener)) return;
      event.preventDefault();
      openScene(opener, true);
    });

    closeBtn.addEventListener('click', function () {
      finishClose(false);
    });

    dialog.addEventListener('click', function (event) {
      var target = event.target;
      if (target && target.closest && target.closest('.scene-panel')) return;
      finishClose(false);
    });

    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      finishClose(false);
    });

    dialog.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      var items = focusables();
      if (!items.length) return;
      if (items.length === 1) {
        event.preventDefault();
        return;
      }
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    window.addEventListener('popstate', function () {
      var id = history.state && history.state.scene;
      if (id) {
        var opener = findOpener(id);
        if (opener) openScene(opener, false);
        else if (dialog.open) finishClose(true);
        return;
      }
      if (dialog.open) finishClose(true);
    });

    if (history.state && history.state.scene) openScene(findOpener(history.state.scene), false);
  }

  armCovers();

  /* Home last.fm line. Keep the clip in step with lib/listen-line.js. */
  var LISTEN_LIMIT = 48;
  var LISTEN_MS = 60000;
  var listenTimer = 0;
  var listenGen = 0;

  function clipPair(track, artist) {
    var title = String(track || '').replace(/\s+/g, ' ').trim();
    var name = String(artist || '').replace(/\s+/g, ' ').trim();
    if (!title || !name) return '';
    var pair = title + ' \u2014 ' + name;
    if (pair.length <= LISTEN_LIMIT) return pair;
    return pair.slice(0, LISTEN_LIMIT - 1).replace(/\s+$/, '') + '\u2026';
  }

  function musicHref(link) {
    if (typeof link !== 'string') return '';
    var value = link.trim();
    if (!/^https:\/\//i.test(value) || /[\s"'<>\\]/.test(value)) return '';
    try {
      var url = new URL(value);
      if (url.username || url.password || url.port) return '';
      var host = url.hostname.toLowerCase();
      if (host !== 'www.last.fm' && host !== 'last.fm') return '';
      if (url.pathname.toLowerCase().indexOf('/user/') !== -1) return '';
      return url.toString();
    } catch (err) {
      return '';
    }
  }

  function paintListen(line, state, pair, link, live) {
    var href = musicHref(link);
    line.replaceChildren();
    if (live) {
      var dot = document.createElement('span');
      dot.className = 'listen-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.textContent = '\u25cf';
      line.appendChild(dot);
      line.appendChild(document.createTextNode(' '));
    }
    var label = document.createElement('span');
    label.className = 'listen-state';
    label.textContent = state;
    line.appendChild(label);
    line.appendChild(document.createTextNode(' '));
    var what = document.createElement(href ? 'a' : 'span');
    what.className = 'listen-what';
    what.textContent = pair;
    if (href) {
      what.href = href;
      what.rel = 'noopener noreferrer';
    }
    line.appendChild(what);
  }

  function applyListen(data) {
    var line = document.querySelector('.listen-line');
    if (!line || !data || data.reason) return;
    var state;
    var pair;
    var link;
    var live = false;
    if (data.nowPlaying) {
      state = 'now listening';
      pair = clipPair(data.track, data.artist);
      link = data.link;
      live = true;
    } else if (data.last) {
      state = 'last listened';
      pair = clipPair(data.last.track, data.last.artist);
      link = data.last.link;
    } else {
      return;
    }
    if (!pair) return;
    paintListen(line, state, pair, link, live);
  }

  function stopListen() {
    if (!listenTimer) return;
    clearTimeout(listenTimer);
    listenTimer = 0;
  }

  function scheduleListen() {
    stopListen();
    listenTimer = setTimeout(pullListen, LISTEN_MS);
  }

  function pullListen() {
    stopListen();
    if (document.hidden || typeof fetch !== 'function') return;
    var gen = ++listenGen;
    fetch('/api/listening/now', { headers: { accept: 'application/json' } })
      .then(function (res) { return res && res.ok ? res.json() : null; })
      .then(function (data) {
        if (gen !== listenGen) return;
        if (data) applyListen(data);
      })
      .catch(function () {})
      .then(function () {
        if (gen !== listenGen || document.hidden) return;
        scheduleListen();
      });
  }

  function onVisibility() {
    if (document.hidden) {
      stopListen();
      listenGen += 1;
      return;
    }
    pullListen();
  }

  function armListen() {
    if (!document.querySelector('.listen-line')) return;
    document.addEventListener('visibilitychange', onVisibility);
    pullListen();
  }

  function start() {
    /* frequency-key */
    document.addEventListener('keydown', onKey);
    /* frequency-key */
    bindScene();
    refresh();
    armListen();
  }

  if (document.prerendering) {
    document.addEventListener('prerenderingchange', function () {
      if (!document.prerendering) start();
    }, { once: true });
  } else {
    start();
  }
})();
