/* Concept home. A diagonal laser on press, and a combo on targets that
   do not navigate. Classes only: style-src-attr is none. No layout reads.
   .is-sliced .is-held .is-punch .is-rank .is-rake .is-sss .is-flash .cut-1 .cut-2 .cut-3 .cut-4 .cut-5 .cut-6 */
(function () {
  var RANKS = [
    { at: 3, letter: 'd', name: 'dope' },
    { at: 6, letter: 'c', name: 'crazy' },
    { at: 10, letter: 'b', name: 'blast' },
    { at: 16, letter: 'a', name: 'alright' },
    { at: 24, letter: 's', name: 'sweet' },
    { at: 35, letter: 'ss', name: 'showtime' },
    { at: 50, letter: 'sss', name: 'ssstylish' },
  ];
  var CUTS = ['cut-1', 'cut-2', 'cut-3', 'cut-4', 'cut-5', 'cut-6'];
  var BEAM_GAP = 340;
  var IDLE_MS = 1000;
  var DECAY_MS = 420;
  var active = null;
  var hits = 0;
  var peak = 0;
  var lastRank = '';
  var lastBeam = 0;
  var idleTimer = 0;
  var decayTimer = 0;

  function motionOk() {
    return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function rankFor(n) {
    var found = null;
    for (var i = 0; i < RANKS.length; i += 1) {
      if (n >= RANKS[i].at) found = RANKS[i];
    }
    return found;
  }

  function stepTarget(n) {
    var prev = 0;
    for (var i = 0; i < RANKS.length; i += 1) {
      if (RANKS[i].at < n) prev = RANKS[i].at;
      else break;
    }
    return prev;
  }

  function clearTimers() {
    if (idleTimer) window.clearTimeout(idleTimer);
    if (decayTimer) window.clearTimeout(decayTimer);
    idleTimer = 0;
    decayTimer = 0;
  }

  function actionTarget(node) {
    if (!node || !node.closest) return null;
    return node.closest('a[href], button');
  }

  function comboTarget(node) {
    if (!node || !node.closest) return null;
    if (actionTarget(node)) return null;
    return node.closest('[data-combo]');
  }

  function beam(el) {
    var now = Date.now();
    if (now - lastBeam < BEAM_GAP) return;
    lastBeam = now;
    if (!el) return;
    if (el.classList.contains('is-sliced')) {
      el.classList.remove('is-sliced');
      window.requestAnimationFrame(function () { el.classList.add('is-sliced'); });
    } else {
      el.classList.add('is-sliced');
    }
    window.setTimeout(function () { el.classList.remove('is-sliced'); }, 240);
  }

  function clearCuts(el) {
    el.classList.remove('is-held', 'is-punch', 'is-rank', 'is-rake', 'is-sss', 'is-flash');
    for (var i = 0; i < CUTS.length; i += 1) el.classList.remove(CUTS[i]);
    var hitsEl = el.querySelector('.meter-hits');
    var rankEl = el.querySelector('.meter-rank');
    var nameEl = el.querySelector('.meter-name');
    if (hitsEl) hitsEl.textContent = '';
    if (rankEl) rankEl.textContent = '';
    if (nameEl) nameEl.textContent = '';
  }

  function endCombo() {
    clearTimers();
    var el = active;
    var n = peak;
    var rank = rankFor(n);
    active = null;
    hits = 0;
    peak = 0;
    lastRank = '';
    if (el) clearCuts(el);
    if (n >= 2) {
      var note = document.querySelector('.end-note');
      if (note) note.textContent = rank ? (n + ' hits, ' + rank.letter + ' ' + rank.name) : (n + ' hits');
    }
  }

  function paint(el, goingUp) {
    var count = el.querySelector('.meter-hits');
    var letter = el.querySelector('.meter-rank');
    var name = el.querySelector('.meter-name');
    var rank = rankFor(hits);
    var next = rank ? rank.letter : '';
    if (count) count.textContent = hits + ' hits';
    if (letter) letter.textContent = next;
    if (name) name.textContent = rank ? rank.name : '';
    var rankedUp = goingUp && next && next !== lastRank;
    lastRank = next;
    if (!motionOk()) {
      el.classList.remove('is-punch', 'is-rank', 'is-rake', 'is-sss', 'is-flash');
      return;
    }
    if (next === 'sss') el.classList.add('is-sss');
    else el.classList.remove('is-sss');
    if (!rankedUp) return;
    el.classList.remove('is-rank');
    window.requestAnimationFrame(function () { el.classList.add('is-rank'); });
    if (next !== 'sss') {
      el.classList.add('is-rake');
      window.setTimeout(function () { el.classList.remove('is-rake', 'is-rank'); }, 460);
    }
  }

  function hold(el) {
    el.classList.add('is-held');
    for (var i = 0; i < CUTS.length; i += 1) el.classList.remove(CUTS[i]);
    if (motionOk()) {
      var level = Math.min(hits, CUTS.length);
      el.classList.add(CUTS[level - 1]);
      el.classList.remove('is-punch', 'is-flash');
      window.requestAnimationFrame(function () {
        el.classList.add('is-punch');
        el.classList.add('is-flash');
      });
    }
    paint(el, true);
  }

  function hit(el) {
    if (active && active !== el) endCombo();
    if (active !== el) {
      active = el;
      hits = 0;
      peak = 0;
      lastRank = '';
    }
    clearTimers();
    hits += 1;
    if (hits > peak) peak = hits;
    beam(el);
    if (hits >= 2) hold(el);
    idleTimer = window.setTimeout(beginDecay, IDLE_MS);
  }

  function beginDecay() {
    var steps = 0;
    function step() {
      if (!active) return;
      steps += 1;
      if (steps > 2) return endCombo();
      var next = stepTarget(hits);
      if (next < 2) return endCombo();
      hits = next;
      if (motionOk()) {
        for (var i = 0; i < CUTS.length; i += 1) active.classList.remove(CUTS[i]);
        active.classList.add(CUTS[Math.min(hits, CUTS.length) - 1]);
      }
      paint(active, false);
      decayTimer = window.setTimeout(step, DECAY_MS);
    }
    step();
  }

  function primary(event) {
    return !(typeof event.button === 'number' && event.button !== 0);
  }

  function onPointer(event) {
    if (!primary(event)) return;
    var action = actionTarget(event.target);
    if (action) {
      beam(action);
      return;
    }
    var comboEl = comboTarget(event.target);
    if (comboEl) hit(comboEl);
  }

  function onKey(event) {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var node = document.activeElement;
    var action = actionTarget(node);
    if (action && action === node) {
      beam(action);
      return;
    }
    var comboEl = comboTarget(node);
    if (!comboEl || comboEl !== node) return;
    event.preventDefault();
    hit(comboEl);
  }

  document.addEventListener('pointerdown', onPointer, { passive: true });
  document.addEventListener('keydown', onKey);
})();
