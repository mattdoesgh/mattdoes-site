/* Poster strip preferences for /watching/.
   Runs from the head, before the body is parsed, so a stored choice is
   on the document element before first paint. station.js does not touch
   localStorage. No script: the server HTML is posters on, across. */
(function () {
  var POSTERS = 'mattdoes-posters';
  var AXIS = 'mattdoes-poster-axis';
  var state = { posters: 'on', axis: 'across' };
  var clicks = false;

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

  function apply() {
    var feed = document.getElementById('feed');
    if (feed && state.posters === 'off') feed.scrollLeft = 0;
    var root = document.documentElement;
    if (state.posters === 'off') root.setAttribute('data-posters', 'off');
    else root.removeAttribute('data-posters');
    if (state.axis === 'down') root.setAttribute('data-poster-axis', 'down');
    else root.removeAttribute('data-poster-axis');
    var postersBtn = document.querySelector('[data-posters-toggle]');
    var axisBtn = document.querySelector('[data-axis-toggle]');
    if (postersBtn) {
      postersBtn.setAttribute('aria-pressed', state.posters === 'on' ? 'true' : 'false');
      postersBtn.setAttribute('aria-label', 'posters ' + state.posters);
    }
    if (axisBtn) {
      axisBtn.setAttribute('aria-pressed', state.axis === 'down' ? 'true' : 'false');
      axisBtn.setAttribute('aria-label', 'layout ' + state.axis);
    }
    return Boolean(postersBtn && axisBtn);
  }

  function onClick(event) {
    var node = event.target;
    if (node && node.nodeType !== 1) node = node.parentElement;
    if (!node || !node.closest) return;
    var postersBtn = node.closest('[data-posters-toggle]');
    var axisBtn = node.closest('[data-axis-toggle]');
    if (!postersBtn && !axisBtn) return;
    if (postersBtn) state.posters = state.posters === 'off' ? 'on' : 'off';
    if (axisBtn) state.axis = state.axis === 'down' ? 'across' : 'down';
    write();
    apply();
  }

  function bind() {
    if (clicks) return;
    if (!document.querySelector('[data-posters-toggle]')) return;
    clicks = true;
    document.addEventListener('click', onClick);
  }

  read();
  apply();
  bind();
  if (!clicks) {
    var observer = new MutationObserver(function () {
      apply();
      bind();
      if (clicks) observer.disconnect();
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
