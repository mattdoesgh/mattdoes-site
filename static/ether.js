/* The ether band on a verb page: a summoning circle drawn in glyphs. The
   page's word rings it, a star polygon and a thorned sigil turn inside, and
   faint glyphs drift through the field. Every visit draws a new star and a
   new sigil, and a press on the band summons another. Colors and the cell
   font come from the canvas's computed style, so the palette stays in
   site/tokens.css. Reduced motion draws one still frame. */
(function () {
  'use strict';

  var band = document.querySelector('canvas.ether-band');
  if (!band || !band.getContext || !window.crypto || !window.crypto.getRandomValues) return;
  var ctx = band.getContext('2d');
  if (!ctx) return;

  var look = window.getComputedStyle(band);
  var MINT = look.color;
  var VIOLET = look.outlineColor;
  var BONE = look.borderTopColor;
  var PINK = look.textDecorationColor;
  var FONT_PX = parseFloat(look.fontSize) || 11;
  var FONT = FONT_PX + 'px ' + look.fontFamily;
  var WORD = (band.getAttribute('data-word') || 'matt does').toLowerCase();
  var NOISE = '.,:;`\'-~+*^';
  var THORN = '+x*#';
  var GLITCH = '#%&@$?!/\\|<>=';
  var FRAME_MS = 50;
  var SUMMON_MS = 700;
  var motion = window.matchMedia('(prefers-reduced-motion: no-preference)');

  function rnd() {
    var a = new Uint32Array(1);
    window.crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }

  /* A cell's own noise for one tick: a cheap hash, so drift needs no state. */
  function hash(x, y, t) {
    var h = (x * 374761393 + y * 668265263 + t * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* A mirrored sigil: a spine of points in the unit circle, the left half
     mirroring the right, joined in order, each point thrown a thorn. */
  function makeSigil() {
    var segs = [];
    var pts = [];
    var count = 3 + Math.floor(rnd() * 3);
    for (var i = 0; i < count; i++) {
      pts.push([0.08 + rnd() * 0.55, -0.7 + (1.4 * i) / (count - 1) + (rnd() - 0.5) * 0.2]);
    }
    for (var side = -1; side <= 1; side += 2) {
      var prev = [0, -0.75];
      pts.forEach(function (p) {
        var q = [p[0] * side, p[1]];
        segs.push([prev[0], prev[1], q[0], q[1]]);
        var a = rnd() * Math.PI * 2;
        segs.push([q[0], q[1], q[0] + Math.cos(a) * 0.18, q[1] + Math.sin(a) * 0.18]);
        prev = q;
      });
      segs.push([prev[0], prev[1], 0, 0.78]);
    }
    return segs;
  }

  function makeRite() {
    var n = 5 + Math.floor(rnd() * 5);
    var k = 2 + Math.floor(rnd() * (Math.floor((n - 1) / 2) - 1));
    return { n: n, k: k, sigil: makeSigil(), spin: rnd() * Math.PI * 2, born: window.performance.now() };
  }

  var rite = makeRite();
  var dpr = 1;
  var cw = 0;
  var ch = 0;
  var cols = 0;
  var rows = 0;
  var cx = 0;
  var cy = 0;
  var R = 0;
  var ringText = WORD;

  function layout() {
    var box = band.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    band.width = Math.round(box.width * dpr);
    band.height = Math.round(box.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    cw = ctx.measureText('M').width || FONT_PX * 0.6;
    ch = FONT_PX * 1.25;
    cols = Math.floor(box.width / cw);
    rows = Math.floor(box.height / ch);
    R = (rows / 2 - 0.8) * ch;
    cx = box.width > 720 ? box.width * 0.74 : box.width / 2;
    cy = (rows * ch) / 2;
    var around = Math.max(8, Math.round((2 * Math.PI * R) / cw));
    var unit = WORD + ' · ';
    ringText = '';
    while (ringText.length < around) ringText += unit;
    ringText = ringText.slice(0, around);
    return true;
  }

  function slope(dx, dy) {
    var a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI;
    if (a < Math.PI / 8 || a >= (7 * Math.PI) / 8) return '-';
    if (a < (3 * Math.PI) / 8) return '\\';
    if (a < (5 * Math.PI) / 8) return '|';
    return '/';
  }

  function nearSeg(px, py, s, reach) {
    var vx = s[2] - s[0];
    var vy = s[3] - s[1];
    var len = vx * vx + vy * vy || 1;
    var t = ((px - s[0]) * vx + (py - s[1]) * vy) / len;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var ex = s[0] + vx * t - px;
    var ey = s[1] + vy * t - py;
    return ex * ex + ey * ey < reach * reach;
  }

  function starSegs(spin) {
    var r = R * 0.8;
    var pts = [];
    for (var i = 0; i < rite.n; i++) {
      var a = -Math.PI / 2 + spin + (i * 2 * Math.PI) / rite.n;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    var segs = [];
    for (var j = 0; j < rite.n; j++) {
      var b = pts[(j + rite.k) % rite.n];
      segs.push([pts[j][0], pts[j][1], b[0], b[1]]);
    }
    return segs;
  }

  function sigilSegs(spin) {
    var s = R * 0.55;
    var c = Math.cos(spin);
    var n = Math.sin(spin);
    return rite.sigil.map(function (g) {
      return [
        cx + (g[0] * c - g[1] * n) * s, cy + (g[0] * n + g[1] * c) * s,
        cx + (g[2] * c - g[3] * n) * s, cy + (g[2] * n + g[3] * c) * s,
      ];
    });
  }

  function draw(now) {
    var t = now - rite.born;
    var tick = Math.floor(now / 140);
    var spin = rite.spin + (motion.matches ? now * 0.00011 : 0);
    var summoning = motion.matches && t < SUMMON_MS;
    var star = starSegs(-spin * 0.6);
    var sigil = sigilSegs(spin * 0.25);
    var reach = cw * 0.6;
    var layers = { mint: [], violet: [], bone: [], pink: [] };
    var box = band.getBoundingClientRect();
    ctx.clearRect(0, 0, box.width, box.height);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var px = (c + 0.5) * cw;
        var py = (r + 0.5) * ch;
        var dx = px - cx;
        var dy = py - cy;
        var d = Math.sqrt(dx * dx + dy * dy);
        var cell = null;
        if (summoning && d < R * 1.08 && hash(c, r, tick) < 0.35 * (1 - t / SUMMON_MS)) {
          cell = ['pink', GLITCH.charAt(Math.floor(hash(r, c, tick) * GLITCH.length))];
        } else if (Math.abs(d - R) < ch * 0.5) {
          var ang = Math.atan2(dy, dx) - spin;
          var turn = ((ang / (2 * Math.PI)) % 1 + 1) % 1;
          var ch0 = ringText.charAt(Math.floor(turn * ringText.length));
          if (ch0 !== ' ') cell = ['pink', ch0];
        } else if (Math.abs(d - R * 0.8) < ch * 0.35 && d < R) {
          cell = ['violet', '·'];
        } else if (d < R * 0.8) {
          for (var i = 0; i < sigil.length && !cell; i++) {
            if (nearSeg(px, py, sigil[i], reach)) {
              var g = sigil[i];
              cell = ['bone', i % 2 && hash(c, r, 7) < 0.4 ? THORN.charAt(Math.floor(hash(c, r, 3) * THORN.length)) : slope(g[2] - g[0], g[3] - g[1])];
            }
          }
          for (var j = 0; j < star.length && !cell; j++) {
            if (nearSeg(px, py, star[j], reach)) {
              cell = ['violet', slope(star[j][2] - star[j][0], star[j][3] - star[j][1])];
            }
          }
        }
        if (!cell && hash(c + tick, r, 11) < 0.045) {
          cell = ['mint', NOISE.charAt(Math.floor(hash(c, r + tick, 5) * NOISE.length))];
        }
        if (cell) layers[cell[0]].push(c, r, cell[1]);
      }
    }
    paint(layers.mint, MINT, 0.35);
    paint(layers.violet, VIOLET, 1);
    paint(layers.bone, BONE, 1);
    paint(layers.pink, PINK, 1);
    band.setAttribute('data-drawn', '');
  }

  function paint(list, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (var i = 0; i < list.length; i += 3) {
      ctx.fillText(list[i + 2], list[i] * cw, list[i + 1] * ch);
    }
    ctx.globalAlpha = 1;
  }

  var visible = true;
  var raf = 0;
  var last = 0;

  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    if (now - last >= FRAME_MS) {
      last = now;
      draw(now);
    }
    if (motion.matches) raf = window.requestAnimationFrame(frame);
  }

  function run() {
    if (!raf) raf = window.requestAnimationFrame(frame);
  }

  function still() {
    if (layout()) draw(window.performance.now());
  }

  band.addEventListener('click', function () {
    rite = makeRite();
    if (motion.matches) run();
    else still();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) run();
    }).observe(band);
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) run();
  });
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(still, 120);
  });
  if (motion.addEventListener) motion.addEventListener('change', function () { still(); run(); });

  function start() {
    rite.born = window.performance.now();
    still();
    run();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start, start);
  else start();
})();
