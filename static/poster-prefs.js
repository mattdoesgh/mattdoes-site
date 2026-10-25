/* Poster strip preferences for /watching/.
   Runs from the head, before the body is parsed, so a stored choice is
   on the document element before first paint. station.js does not touch
   localStorage. No script: the server HTML is posters on, across.
   Images stay on data-src until posters are on, so an off preference
   never starts a fetch. Across is forced down while posters are off;
   that does not rewrite the saved axis. A hard overscroll at the bottom
   of an across strip switches to down. */
(function () {
  var POSTERS = 'mattdoes-posters';
  var AXIS = 'mattdoes-poster-axis';
  var WHEEL_PX = 480;
  var WHEEL_MS = 600;
  var GAP_MS = 120;
  var TOUCH_PX = 100;
  var state = { posters: 'on', axis: 'across' };
  var clicks = false;
  var overscroll = false;
  var pullTimer = 0;
  var wheel = { sum: 0, start: 0, last: -1, eligible: false };
  var touch = { active: false, eligible: false, sum: 0, lastY: 0 };

  function stored(key, allowed) {
    try {
      var value = window.localStorage.getItem(key);
      if (value === null || allowed.indexOf(value) !== -1) return value;
      window.localStorage.removeItem(key);
    } catch (err) { /* storage blocked; keep the defaults */ }
    return null;
  }

  function read() {
    var posters = stored(POSTERS, ['on', 'off']) === 'off' ? 'off' : 'on';
    var axis = stored(AXIS, ['across', 'down']) === 'down' ? 'down' : 'across';
    state.posters = posters;
    state.axis = axis;
  }

  function write() {
    try {
      window.localStorage.setItem(POSTERS, state.posters === 'off' ? 'off' : 'on');
      window.localStorage.setItem(AXIS, state.axis === 'down' ? 'down' : 'across');
    } catch (err) { /* the choice still applies for this view */ }
  }

  function motionOff() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function scrollHeight() {
    var el = document.scrollingElement || document.documentElement;
    return el.scrollHeight || 0;
  }

  function scrollY() {
    return window.scrollY || window.pageYOffset || 0;
  }

  function canArm() {
    return state.posters !== 'off' && state.axis !== 'down' && scrollHeight() > (window.innerHeight || 0) + 2;
  }

  function atBottom() {
    var height = scrollHeight();
    var view = window.innerHeight || 0;
    if (height <= view + 2) return false;
    return scrollY() + view >= height - 2;
  }

  function announce(text) {
    var live = document.querySelector('.layout-live');
    if (live) live.textContent = text;
  }

  function setPull(progress) {
    var root = document.documentElement;
    if (motionOff() || progress <= 0 || !canArm()) {
      if (root.hasAttribute('data-pull')) root.removeAttribute('data-pull');
      return;
    }
    var step = Math.ceil(progress * 8);
    if (step < 1) step = 1;
    if (step > 8) step = 8;
    var next = String(step);
    if (root.getAttribute('data-pull') !== next) root.setAttribute('data-pull', next);
  }

  function settleFeed() {
    if (motionOff() || !window.requestAnimationFrame) return;
    var root = document.documentElement;
    root.classList.add('is-settling');
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        root.classList.remove('is-settling');
      });
    });
  }

  function fadeImage(img) {
    if (img.fadeArmed) return;
    img.fadeArmed = true;
    function mark() {
      if (img.getAttribute('src')) img.classList.add('is-in');
    }
    if (img.complete && img.naturalWidth > 0) mark();
    else {
      img.addEventListener('load', mark);
      img.addEventListener('error', mark);
    }
  }

  function syncImages() {
    var feed = document.getElementById('feed');
    var imgs = feed ? feed.querySelectorAll('img[data-src]') : [];
    var on = state.posters !== 'off';
    for (var i = 0; i < imgs.length; i += 1) {
      var img = imgs[i];
      var src = img.getAttribute('data-src');
      if (!src) continue;
      if (on) {
        if (img.getAttribute('src') !== src) img.setAttribute('src', src);
        fadeImage(img);
      } else if (img.getAttribute('src') && img.complete === false) {
        img.removeAttribute('src');
        img.fadeArmed = false;
        img.classList.remove('is-in');
      }
    }
  }

  function apply(settle) {
    var feed = document.getElementById('feed');
    if (feed && state.posters === 'off') feed.scrollLeft = 0;
    var root = document.documentElement;
    if (state.posters === 'off') root.setAttribute('data-posters', 'off');
    else root.removeAttribute('data-posters');
    if (state.axis === 'down') root.setAttribute('data-poster-axis', 'down');
    else root.removeAttribute('data-poster-axis');
    if (!canArm() && root.hasAttribute('data-pull')) root.removeAttribute('data-pull');
    syncImages();
    var postersBtn = document.querySelector('[data-posters-toggle]');
    var axisBtn = document.querySelector('[data-axis-toggle]');
    if (postersBtn) {
      postersBtn.setAttribute('aria-pressed', state.posters === 'on' ? 'true' : 'false');
      postersBtn.setAttribute('aria-label', 'posters ' + state.posters);
    }
    if (axisBtn) {
      var shown = state.posters === 'off' ? 'down' : state.axis;
      axisBtn.setAttribute('aria-pressed', shown === 'down' ? 'true' : 'false');
      axisBtn.setAttribute('aria-label', 'layout ' + shown);
      if (state.posters === 'off') axisBtn.setAttribute('aria-disabled', 'true');
      else axisBtn.removeAttribute('aria-disabled');
    }
    if (settle) settleFeed();
    return Boolean(postersBtn && axisBtn);
  }

  function centeredFilm() {
    var feed = document.getElementById('feed');
    var films = feed ? feed.querySelectorAll('.film') : [];
    var best = null;
    var bestDist = Infinity;
    var mid = (window.innerWidth || 0) / 2;
    for (var i = 0; i < films.length; i += 1) {
      var box = films[i].getBoundingClientRect();
      var dist = Math.abs(box.left + box.width / 2 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = films[i];
      }
    }
    return best;
  }

  function commitDown() {
    if (!canArm()) return;
    if (pullTimer) {
      clearTimeout(pullTimer);
      pullTimer = 0;
    }
    var film = centeredFilm();
    var before = film ? film.getBoundingClientRect().top : 0;
    state.axis = 'down';
    write();
    apply(true);
    var root = document.documentElement;
    if (root.hasAttribute('data-pull')) root.removeAttribute('data-pull');
    if (film) {
      var after = film.getBoundingClientRect().top;
      var delta = after - before;
      if (delta) {
        var scroller = document.scrollingElement || document.documentElement;
        var top = (scroller.scrollTop || 0) + delta;
        root.classList.add('is-holding');
        scroller.scrollTop = top;
        try { window.scrollTo({ top: top, left: 0, behavior: 'instant' }); }
        catch (err) { /* the scrollTop write already landed */ }
        root.classList.remove('is-holding');
      }
    }
    announce('layout down');
    wheel.sum = 0;
    wheel.eligible = false;
    touch.sum = 0;
    touch.eligible = false;
  }

  function schedulePullClear() {
    if (pullTimer) clearTimeout(pullTimer);
    pullTimer = setTimeout(function () {
      pullTimer = 0;
      if (state.axis !== 'down') setPull(0);
    }, GAP_MS);
  }

  function wheelPixels(event) {
    var dy = event.deltaY || 0;
    var mode = event.deltaMode || 0;
    if (mode === 1) dy *= 16;
    else if (mode === 2) dy *= window.innerHeight || 800;
    return dy;
  }

  function onWheel(event) {
    var t = typeof event.timeStamp === 'number' ? event.timeStamp : Date.now();
    var fresh = wheel.last < 0 || t - wheel.last > GAP_MS;
    if (fresh) {
      wheel.sum = 0;
      wheel.start = t;
      wheel.eligible = atBottom();
    } else if (!atBottom()) {
      wheel.eligible = false;
    }
    wheel.last = t;
    if (!canArm() || !wheel.eligible || !atBottom()) {
      wheel.sum = 0;
      setPull(0);
      return;
    }
    if (t - wheel.start > WHEEL_MS) {
      wheel.sum = 0;
      wheel.start = t;
    }
    var dy = wheelPixels(event);
    if (dy < 0) {
      wheel.sum = 0;
      setPull(0);
      return;
    }
    if (!dy) return;
    wheel.sum += dy;
    if (wheel.sum >= WHEEL_PX) commitDown();
    else {
      setPull(wheel.sum / WHEEL_PX);
      schedulePullClear();
    }
  }

  function onTouchStart(event) {
    var point = event.touches && event.touches[0];
    if (!point) return;
    touch.active = true;
    touch.sum = 0;
    touch.lastY = point.clientY;
    touch.eligible = canArm() && atBottom();
    if (!touch.eligible) setPull(0);
  }

  function onTouchMove(event) {
    if (!touch.active) return;
    var point = event.touches && event.touches[0];
    if (!point) return;
    var dy = touch.lastY - point.clientY;
    touch.lastY = point.clientY;
    if (!touch.eligible || !canArm() || !atBottom()) {
      touch.eligible = false;
      touch.sum = 0;
      setPull(0);
      return;
    }
    touch.sum += dy;
    if (touch.sum < 0) touch.sum = 0;
    if (touch.sum >= TOUCH_PX) commitDown();
    else setPull(touch.sum / TOUCH_PX);
  }

  function onTouchEnd() {
    if (touch.active && touch.eligible && touch.sum >= TOUCH_PX) commitDown();
    touch.active = false;
    touch.eligible = false;
    touch.sum = 0;
    if (state.axis !== 'down') setPull(0);
  }

  function onTouchCancel() {
    touch.active = false;
    touch.eligible = false;
    touch.sum = 0;
    if (state.axis !== 'down') setPull(0);
  }

  function onClick(event) {
    var node = event.target;
    if (node && node.nodeType !== 1) node = node.parentElement;
    if (!node || !node.closest) return;
    var postersBtn = node.closest('[data-posters-toggle]');
    var axisBtn = node.closest('[data-axis-toggle]');
    if (!postersBtn && !axisBtn) return;
    if (axisBtn) {
      if (state.posters === 'off') return;
      state.axis = state.axis === 'down' ? 'across' : 'down';
      write();
      apply(true);
      announce('layout ' + state.axis);
      return;
    }
    state.posters = state.posters === 'off' ? 'on' : 'off';
    write();
    apply(true);
  }

  function bindOverscroll() {
    if (overscroll || !document.getElementById('feed')) return;
    overscroll = true;
    /* Not passive: the handler has to see the position before this
       event's scroll. A flick that only lands on the bottom stays
       ineligible. The handler never cancels the scroll. */
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchCancel, { passive: true });
  }

  function bind() {
    if (!clicks && document.querySelector('[data-posters-toggle]')) {
      clicks = true;
      document.addEventListener('click', onClick);
    }
    bindOverscroll();
  }

  read();
  apply();
  bind();
  if (!clicks || !overscroll) {
    var observer = new MutationObserver(function () {
      apply();
      bind();
      if (clicks && overscroll) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.prerendering) {
    document.addEventListener('prerenderingchange', function () {
      if (document.prerendering) return;
      read();
      apply();
    }, { once: true });
  }
})();
