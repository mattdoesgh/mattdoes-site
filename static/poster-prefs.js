/* Poster strip preferences for /watching/.
   Runs from the head, before the body is parsed, so a stored choice is
   on the document element before first paint. station.js does not touch
   localStorage. No script: the server HTML is posters on, across. */
(function () {
  var POSTERS = 'mattdoes-posters';
  var AXIS = 'mattdoes-poster-axis';
  var state = { posters: 'on', axis: 'across' };
  var clicks = false;

  function read() {
    var posters = 'on';
    var axis = 'across';
    try {
      if (window.localStorage.getItem(POSTERS) === 'off') posters = 'off';
      if (window.localStorage.getItem(AXIS) === 'down') axis = 'down';
    } catch (err) { /* storage blocked; keep the defaults */ }
    state.posters = posters;
    state.axis = axis;
  }

  function apply() {
    var root = document.documentElement;
    if (state.posters === 'off') root.setAttribute('data-posters', 'off');
    else root.removeAttribute('data-posters');
    if (state.axis === 'down') root.setAttribute('data-poster-axis', 'down');
    else root.removeAttribute('data-poster-axis');
    var postersBtn = document.querySelector('[data-posters-toggle]');
    var axisBtn = document.querySelector('[data-axis-toggle]');
    if (postersBtn) postersBtn.setAttribute('aria-pressed', state.posters === 'on' ? 'true' : 'false');
    if (axisBtn) axisBtn.setAttribute('aria-pressed', state.axis === 'down' ? 'true' : 'false');
    return Boolean(postersBtn && axisBtn);
  }

  function onClick(event) {
    var node = event.target;
    if (!node || !node.closest) return;
    var postersBtn = node.closest('[data-posters-toggle]');
    var axisBtn = node.closest('[data-axis-toggle]');
    if (!postersBtn && !axisBtn) return;
    if (postersBtn) state.posters = state.posters === 'off' ? 'on' : 'off';
    if (axisBtn) state.axis = state.axis === 'down' ? 'across' : 'down';
    try {
      window.localStorage.setItem(POSTERS, state.posters);
      window.localStorage.setItem(AXIS, state.axis);
    } catch (err) { /* the choice still applies for this view */ }
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
