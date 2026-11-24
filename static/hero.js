/* Home hero: the ether. The page is a field of characters on the void.
   The name floats half under a water line, the surface words drift
   through it, and a summoning circle turns around it: two rings of the
   surface words, a star polygon and a sigil, all drawn in glyphs. Every
   summoning is new. Each one grows a fresh sigil and picks a fresh star,
   so no two are the same. The verb links summon before they open. A typed
   spell summons in place and stays in the page; nothing typed leaves it.
   Reduced motion draws one still frame and the links open at once.
   Colors and the cell font come from the computed style, so the palette
   stays in site/tokens.css. */
(function () {
  var hero = document.querySelector('[data-hero]');
  var canvas = hero ? hero.querySelector('canvas.hero-water') : null;
  var heading = hero ? hero.querySelector('.hero-word') : null;
  var log = hero ? hero.querySelector('.hero-log') : null;
  var list = hero ? hero.querySelector('.verbs') : null;
  if (!canvas || !heading || !log || !list || !canvas.getContext || typeof window.matchMedia !== 'function') return;
  var ctx = canvas.getContext('2d');
  var star = document.createElement('canvas');
  var sig = document.createElement('canvas');
  var sctx = star.getContext('2d', { willReadFrequently: true });
  var gctx = sig.getContext('2d', { willReadFrequently: true });
  if (!ctx || !sctx || !gctx) return;

  var still = window.matchMedia('(prefers-reduced-motion: reduce)');
  var look = getComputedStyle(canvas);
  var PINK = getComputedStyle(heading).color;
  var NAME_FONT = getComputedStyle(heading).fontFamily;
  var MINT = look.color;
  var VIOLET = look.outlineColor;
  var BONE = look.borderTopColor;
  var CELL_FONT = look.fontFamily;
  var WORDS = String(canvas.getAttribute('data-words') || '').split('|').filter(Boolean);
  if (!WORDS.length) WORDS = ['matt does'];
  var RAMP = ' .·:-=+*x%#@';
  var GLITCH = '01<>/\\|#$%&*+=?!~^';
  var SLOPE = '-\\|/';
  var SUMMON = 1900;
  var LINE = 0.46; /* --hero-line */

  function rnd() {
    if (window.crypto && window.crypto.getRandomValues) {
      var a = new Uint32Array(1);
      window.crypto.getRandomValues(a);
      return a[0] / 4294967296;
    }
    return Math.random();
  }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rnd() * (i + 1));
      var s = a[i]; a[i] = a[j]; a[j] = s;
    }
    return a;
  }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }

  /* A sigil: thorned branches from a seed, mirrored left and right. */
  function makeSigil(seed) {
    var s = seed;
    function r() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    var segs = [];
    var maxO = 0;
    function branch(x, y, a, len, depth, o, w) {
      var pts = [{ x: x, y: y, o: o }];
      var n = Math.max(3, Math.floor(len / 3.2));
      var curl = (r() - 0.5) * 0.09;
      var wave = 0.04 + r() * 0.08;
      var ph = r() * 6.28;
      for (var i = 1; i <= n; i += 1) {
        a += curl + Math.sin(i * 0.22 + ph) * wave;
        x += Math.cos(a) * 3.2; y += Math.sin(a) * 3.2; o += 3.2;
        pts.push({ x: x, y: y, o: o });
        if (depth < 4 && i > 2 && r() < 0.07) {
          segs.push({ thorn: true, x: x, y: y, a: a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), len: (8 + r() * 16) * (1 - depth * 0.18), o: o });
        }
        if (depth < 3 && i > n * 0.25 && r() < 0.03) {
          branch(x, y, a + (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.7), len * (0.35 + r() * 0.3), depth + 1, o, w * 0.62);
        }
      }
      maxO = Math.max(maxO, o);
      segs.push({ pts: pts, w: w });
    }
    branch(0, -8, -Math.PI / 2, 150 + r() * 60, 1, 0, 2.6);
    branch(0, 8, Math.PI / 2, 120 + r() * 70, 1, 0, 2.6);
    var trunks = 3 + Math.floor(r() * 2);
    for (var k = 0; k < trunks; k += 1) {
      branch(5 + r() * 8, (r() - 0.5) * 18, -Math.PI * 0.45 + (k / (trunks - 1)) * Math.PI * 0.9 + (r() - 0.5) * 0.35, 110 + r() * 90, 0, r() * 20, 3.4);
    }
    return { segs: segs, maxO: maxO };
  }

  function strokeSigil(c, sg, P, minW) {
    c.lineCap = 'round';
    [1, -1].forEach(function (m) {
      c.save();
      c.scale(m, 1);
      sg.segs.forEach(function (s) {
        if (s.thorn) {
          if (s.o > P) return;
          var g = Math.min(1, (P - s.o) / 18);
          c.lineWidth = minW;
          c.beginPath();
          c.moveTo(s.x, s.y);
          c.lineTo(s.x + Math.cos(s.a) * s.len * g, s.y + Math.sin(s.a) * s.len * g);
          c.stroke();
          return;
        }
        var drawn = false;
        c.beginPath();
        c.moveTo(s.pts[0].x, s.pts[0].y);
        for (var i = 1; i < s.pts.length && s.pts[i].o <= P; i += 1) { c.lineTo(s.pts[i].x, s.pts[i].y); drawn = true; }
        if (drawn) { c.lineWidth = Math.max(minW, s.w); c.stroke(); }
      });
      c.restore();
    });
  }

  /* One summoning. kind is home, link or spell. */
  function rite(word, kind) {
    var n = 5 + Math.floor(rnd() * 7);
    var ks = [];
    for (var k = 2; k < n / 2; k += 1) ks.push(k);
    var roll = rnd();
    var dir = rnd() < 0.5 ? 1 : -1;
    var omen = pick(WORDS);
    return {
      word: word,
      kind: kind,
      n: n,
      k: pick(ks),
      fate: kind !== 'spell' ? 'bound' : roll < 0.66 ? 'bound' : roll < 0.9 ? 'unstable' : 'unanswered',
      omen: omen,
      ringA: kind === 'spell' ? word + ' + ' : shuffle(WORDS).join(' + ') + ' + ',
      ringB: kind === 'spell' ? word.split('').reverse().join('') + ' · ' + omen + ' · ' : shuffle(WORDS).join(' · ') + ' · ',
      sig: makeSigil(1 + Math.floor(rnd() * 2147483645)),
      spin: (rnd() - 0.5) * 0.09,
      s1: dir * (0.03 + rnd() * 0.06),
      s2: -dir * (0.04 + rnd() * 0.07),
      mask: null,
    };
  }

  var fontPx, cw, chh, cols, rows, water, ratio, W, H, CX, CY, RMAX, dpr;
  var dist, ang, starData, sigData;
  var floats = [];
  var ripples = [];
  var pointer = { x: -999, y: -999, on: false };
  var cur = rite('matt does', 'home');
  var prev = cur;
  var mode = 'rest';
  var summonAt = 0;
  var boot = 0;
  var onDone = null;
  var frame = 0;
  var visible = true;
  var lastFrame = 0;
  var lastInput = -1e9;
  var lastAdd = 0;
  var nextAuto = 0;

  function textMask(word) {
    var off = document.createElement('canvas');
    off.width = cols; off.height = rows;
    var o = off.getContext('2d');
    var size = rows * 0.4;
    o.font = size + 'px ' + NAME_FONT;
    var tw = o.measureText(word).width * ratio;
    if (tw > cols * 0.92) size *= (cols * 0.92) / tw;
    o.font = size + 'px ' + NAME_FONT;
    o.fillStyle = MINT;
    o.textAlign = 'center';
    o.translate(cols / 2, water + size * 0.3);
    o.scale(ratio, 1);
    o.fillText(word, 0, 0);
    var d = o.getImageData(0, 0, cols, rows).data;
    var m = new Float32Array(cols * rows);
    for (var i = 0; i < m.length; i += 1) m[i] = d[i * 4 + 3] / 255;
    return m;
  }

  function layout() {
    var rect = canvas.getBoundingClientRect();
    W = Math.max(1, rect.width); H = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fontPx = parseFloat(getComputedStyle(canvas).fontSize) || 12;
    ctx.font = fontPx + 'px ' + CELL_FONT;
    ctx.textBaseline = 'top';
    cw = ctx.measureText('M').width || fontPx * 0.6;
    chh = Math.round(fontPx * 1.3);
    cols = Math.ceil(W / cw); rows = Math.ceil(H / chh);
    ratio = chh / cw;
    water = Math.floor(rows * LINE);
    CX = W / 2; CY = (water + 0.5) * chh;
    RMAX = Math.min(W * 0.47, H * 0.44);
    dist = new Float32Array(cols * rows); ang = new Float32Array(cols * rows);
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < cols; c += 1) {
        var dx = (c + 0.5) * cw - CX;
        var dy = (r + 0.5) * chh - CY;
        dist[r * cols + c] = Math.hypot(dx, dy);
        ang[r * cols + c] = Math.atan2(dy, dx);
      }
    }
    star.width = sig.width = cols; star.height = sig.height = rows;
    cur.mask = textMask(cur.word);
    prev.mask = prev === cur ? cur.mask : textMask(prev.word);
    floats = WORDS.slice(0, 7).map(function (w, i) { return { w: w, ph: i * 1.9, x: 0.06 + ((i * 0.37) % 0.82) }; });
  }

  /* The circle's star {n/k} and the sigil, each in its own layer. The
     glyph pass reads only their alpha. */
  function paintGeo(t, r, P, scale) {
    [sctx, gctx].forEach(function (c) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cols, rows);
      c.setTransform(1 / cw, 0, 0, 1 / chh, 0, 0);
      c.strokeStyle = MINT;
    });
    var R = RMAX * 0.6 * scale;
    var pts = [];
    for (var i = 0; i < r.n; i += 1) {
      var a = -Math.PI / 2 + (i / r.n) * Math.PI * 2 + t * r.spin;
      pts.push([CX + Math.cos(a) * R, CY + Math.sin(a) * R]);
    }
    sctx.lineWidth = cw * 1.1;
    var parts = gcd(r.n, r.k);
    for (var s0 = 0; s0 < parts; s0 += 1) {
      sctx.beginPath();
      for (var j = 0; j <= r.n / parts; j += 1) {
        var p = pts[(s0 + j * r.k) % r.n];
        if (j) sctx.lineTo(p[0], p[1]); else sctx.moveTo(p[0], p[1]);
      }
      sctx.stroke();
    }
    var sc = (RMAX * 0.92 * scale) / 220;
    gctx.translate(CX, CY);
    gctx.scale(sc, sc);
    strokeSigil(gctx, r.sig, P, (cw * 1.15) / sc);
    starData = sctx.getImageData(0, 0, cols, rows).data;
    sigData = gctx.getImageData(0, 0, cols, rows).data;
  }

  function slope(data, c, r) {
    function at(cc, rr) { return (cc < 0 || rr < 0 || cc >= cols || rr >= rows) ? 0 : data[(rr * cols + cc) * 4 + 3]; }
    var gx = (at(c + 1, r) - at(c - 1, r)) / cw;
    var gy = (at(c, r + 1) - at(c, r - 1)) / chh;
    if (Math.abs(gx) + Math.abs(gy) < 6) return data === sigData ? '+' : '*';
    var a = Math.atan2(gx, -gy);
    if (a < 0) a += Math.PI;
    return SLOPE[Math.round(a / (Math.PI / 4)) % 4];
  }

  function glyph(ch, x, y, color, alpha) {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillText(ch, x, y);
  }

  function full(r) { return (r.sig.maxO + 30) * (r.fate === 'unanswered' ? 0.45 : 1); }

  function draw(t, now) {
    var p = 0;
    var shown = cur;
    if (mode === 'summon') {
      p = Math.min(1, (now - summonAt) / SUMMON);
      if (p >= 1) {
        mode = 'rest';
        if (onDone) { var done = onDone; onDone = null; done(); }
      }
    }
    var surge = mode === 'summon' ? Math.sin(Math.PI * p) : 0;
    var scale = 1 + surge * 0.12;
    var P;
    if (still.matches) P = full(cur);
    else if (mode === 'summon') P = Math.max(0, (p - 0.25) / 0.75) * full(cur);
    else P = Math.min(1, (now - boot) / 5200) * full(cur);
    if (mode === 'summon' && p < 0.25) { shown = prev; P = (1 - p / 0.25) * full(prev); }
    paintGeo(t, shown, P, scale);
    var wild = shown.fate === 'unstable' && !still.matches;
    var blend = mode === 'summon' ? Math.min(1, Math.max(0, (p - 0.35) / 0.4)) : 1;
    var mFrom = prev.mask;
    var mTo = cur.mask;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = fontPx + 'px ' + CELL_FONT;
    ctx.textBaseline = 'top';
    var live = ripples.filter(function (rp) { return t - rp.t0 < 6; });

    var words = {};
    floats.forEach(function (f) {
      var row = Math.round(water + Math.sin(t * 0.2 + f.ph) * rows * 0.34);
      var c0 = Math.floor(f.x * cols);
      for (var k = 0; k < f.w.length; k += 1) {
        var j = row > water ? Math.round(Math.sin(t * 2 + k + row) * 0.8) : 0;
        words[row * cols + c0 + k + j] = { ch: f.w[k], under: row > water };
      }
    });

    var rot1 = t * (cur.s1 + Math.sign(cur.s1) * surge * 1.6);
    var rot2 = t * (cur.s2 + Math.sign(cur.s2) * surge * 2.2);
    var R1 = RMAX * 0.98 * scale;
    var R2 = RMAX * 0.86 * scale;
    var R3 = RMAX * 0.92 * scale;
    var R4 = RMAX * 0.7 * scale;
    var half = chh * 0.5;

    for (var r = 0; r < rows; r += 1) {
      var y = r * chh;
      var below = r > water;
      var depth = below ? (r - water) / (rows - water) : 0;
      var wob = below ? Math.round(Math.sin(r * 0.7 + t * 1.8) * (1.4 + depth * 2)) : 0;
      var fade = below ? 0.55 * (1 - depth * 0.55) : 1;
      var dim = below ? 0.55 : 1;
      for (var c = 0; c < cols; c += 1) {
        var x = c * cw;
        var cc = Math.min(cols - 1, Math.max(0, c + wob));
        var si = r * cols + cc;

        var wd = words[r * cols + c];
        if (wd && wd.ch !== ' ') { glyph(wd.ch, x, y, wd.under ? MINT : BONE, wd.under ? 0.45 : 0.98); continue; }

        if (r === water) {
          var sw = Math.sin(c * 0.35 - t * 1.6) + Math.sin(c * 0.11 + t * 0.7) + surge * 2 * Math.sin(c * 0.9 - t * 9);
          glyph(sw > 0.6 ? '~' : sw > -0.6 ? '-' : '_', x, y, PINK, 0.9);
          continue;
        }

        if (pointer.on && !still.matches) {
          var gd = Math.hypot(c - pointer.x, (r - pointer.y) * ratio * 0.55);
          if (gd < 5 && Math.random() < 0.55 * (1 - gd / 5)) {
            glyph(GLITCH[(Math.random() * GLITCH.length) | 0], x, y, Math.random() < 0.3 ? PINK : MINT, 0.9);
            continue;
          }
        }

        var n = mode === 'summon' ? mFrom[si] * (1 - blend) + mTo[si] * blend : mTo[si];
        n *= fade;
        if (n > 0.3) {
          var nch = RAMP[Math.min(RAMP.length - 1, 6 + Math.floor(n * 6))];
          if (mode === 'summon' && blend > 0 && blend < 1 && Math.random() < 0.35) nch = GLITCH[(Math.random() * GLITCH.length) | 0];
          glyph(nch, x, y, PINK, below ? 0.35 + n * 0.3 : 0.97);
          continue;
        }

        var gG = sigData[si * 4 + 3];
        var gR = starData[si * 4 + 3];
        if ((gG > 70 || gR > 70) && wild && Math.random() < 0.2) {
          glyph(GLITCH[(Math.random() * GLITCH.length) | 0], x, y, PINK, 0.9);
          continue;
        }
        if (gG > 70) { glyph(slope(sigData, cc, r), x, y, BONE, (0.5 + (gG / 255) * 0.5) * dim); continue; }
        if (gR > 70) { glyph(slope(starData, cc, r), x, y, VIOLET, (0.45 + (gR / 255) * 0.5) * dim * (shown.fate === 'unanswered' ? 0.5 : 1)); continue; }

        var d = dist[si];
        var a = ang[si];
        var outer = Math.abs(d - R1) < half;
        if (outer || Math.abs(d - R2) < half) {
          var txt = outer ? cur.ringA : cur.ringB;
          var idx = Math.floor(((a + (outer ? rot1 : rot2)) * (outer ? R1 : R2)) / (cw * 1.05)) % txt.length;
          if (idx < 0) idx += txt.length;
          if (txt[idx] !== ' ') { glyph(txt[idx], x, y, outer ? PINK : VIOLET, 0.85 * dim); continue; }
        }
        if (Math.abs(d - R3) < half * 0.7 || Math.abs(d - R4) < half * 0.7) { glyph('·', x, y, VIOLET, 0.45 * (below ? 0.6 : 1)); continue; }

        var v = 0.06 + 0.06 * (Math.sin(c * 0.13 + t * 0.5) + Math.sin(r * 0.21 - t * 0.37) + Math.sin((c + r) * 0.06 + t * 0.29)) / 3;
        if (below) v += 0.05 * depth;
        v += surge * 0.35 * (0.5 + 0.5 * Math.sin(d * 0.05 - t * 12));
        for (var q = 0; q < live.length; q += 1) {
          var rp = live[q];
          var age = t - rp.t0;
          var dd = Math.hypot(c - rp.x, (r - rp.y) * ratio * 0.55);
          var front = age * 16;
          v += rp.a * 0.7 * Math.exp(-age * 0.7) * Math.max(0, Math.cos((dd - front) * 0.6)) * Math.exp(-Math.abs(dd - front) * 0.12);
        }
        v = Math.min(0.999, v);
        var ch = RAMP[Math.floor(v * RAMP.length)];
        if (ch !== ' ') glyph(ch, x, y, MINT, 0.18 + v * 0.62);
      }
    }
    ctx.globalAlpha = 1;
    var stamp = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    log.textContent = shown.word + '  {' + shown.n + '/' + shown.k + '}\n' + stamp;
  }

  function tick(now) {
    frame = 0;
    if (now - lastFrame > 33) {
      lastFrame = now;
      if (now - lastInput > 3200 && now > nextAuto && mode !== 'summon') {
        ripples.push({ x: rnd() * cols, y: water + (rnd() - 0.3) * rows * 0.4, t0: now / 1000, a: 0.6 });
        nextAuto = now + 2400;
      }
      while (ripples.length > 16) ripples.shift();
      draw(now / 1000, now);
    }
    run();
  }

  function run() {
    if (!frame && visible && !still.matches) frame = window.requestAnimationFrame(tick);
  }

  function stillFrame() {
    draw(4, performance.now());
  }

  /* Summon r, then call done. */
  function invoke(r, done) {
    prev = cur;
    cur = r;
    cur.mask = textMask(cur.word);
    if (still.matches) { mode = 'rest'; stillFrame(); if (done) done(); return; }
    mode = 'summon';
    summonAt = performance.now();
    onDone = done || null;
    ripples.push({ x: CX / cw, y: CY / chh, t0: summonAt / 1000, a: 1.4 });
    run();
  }

  /* The ward. Slurs, severe profanity and sexual words are refused before
     they reach the circle, the same three kinds of word Discord's AutoMod
     presets cover. The list is base64 so the source does not spell it out.
     A term with ~ matches inside a word, and a long one across the whole
     spell; the rest match a whole word, because each sits inside innocent
     words. Spelling tricks are undone first: accents, digits and symbols for
     letters, dots and stars inside a word, spaced letters, repeats. */
  var WARD = [];
  try { WARD = window.atob('fm5pZ2dlcix+bmlnZ2Esfm5pZ2xldCx+ZmFnZ290LH5raWtlLH53ZXRiYWNrLH5iZWFuZXIsfnJhZ2hlYWQsfnRvd2VsaGVhZCx+dHJhbm55LH50cmFubmllLH5tb3RoZXJmdWNrZXIsfmZ1Y2ssfnNoaXQsfndob3JlLH5zbHV0LH5tb2xlc3QsfnBhZWRvLH5wZWRvcGhpbGUsfmppenosfmJsb3dqb2IsfmhhbmRqb2IsfnJpbWpvYix+ZGlsZG8sfmFzc2hvbGUsfmFyc2Vob2xlLH5iaXRjaCx+YmFzdGFyZCx+aGl0bGVyLH5raWxseW91cnNlbGYsfndoaXRlcG93ZXIsfnNpZWdoZWlsLH5zaGVtYWxlLH5pbmNlc3QsfmJlc3RpYWxpdHksfnNrYW5rLH5wb3JuLH5nYW5nYmFuZyx+Y29ja3N1Y2tlcix+ZGlja2hlYWQsfmJvbGxvY2ssfndhbmtlcix+cXVlZWYsfnppcHBlcmhlYWQsfmdvbGxpd29nLH5qaWdhYm9vLH5wb3JjaG1vbmtleSx+anVuZ2xlYnVubnksfmNhbWVsam9ja2V5LH5zdWJodW1hbixyYXBpc3QsY29vbixkeWtlLHBha2ksc3BpYyxzcGljayxjaGluayxnb29rLGZhZyxyYXBlLHJhcGVkLHJhcGluZyxwZWRvLGNvY2ssZGljayxwdXNzeSxwdXNzaWVzLGN1bSxhbmFsLGFudXMsdHdhdCx3YW5rLGFzcyxreXMsaGVpbCxjdWNrLHRpdCx0aXRzLGJvb2IsYm9vYnMsaG9lLHRob3QsbmVncm8samFwLGd5cCxub25jZSxzbGFnLGJlbGxlbmQsc3BheixzcGFzdGljLG1vbmcsdGFyZCxyZXRhcmQscmV0YXJkZWQsY3VudCxjbGl0LHBlbmlzLHZhZ2luYSxuYXppLG1pbGYsbGVzYm8sbnVkZXM=').split(','); } catch (e) { WARD = []; }
  var LEET = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '+': 't' };
  var SPARED = ['shiitake', 'shiitakes', 'shitake', 'shitakes', 'snigger', 'sniggers', 'sniggered', 'sniggering'];
  /* Each run of a letter may stretch, so fuuuck finds fuck and niiigger
     finds its term, while niger, a country, stays clear. */
  function stretch(t) {
    return t.replace(/(.)\1*/g, function (run) { return run.charAt(0) + (run.length > 1 ? '{' + run.length + ',}' : '+'); });
  }
  var WARDS = WARD.map(function (term) {
    if (term.charAt(0) === '~') {
      var t = term.slice(1);
      return { inside: new RegExp(stretch(t)), across: t.length >= 8 };
    }
    return { whole: new RegExp('^' + stretch(term) + '(es|s)?$') };
  });
  function tokensOf(n) {
    var out = [];
    var run = '';
    n.replace(/[*._'\-]/g, '').split(/[^a-z]+/).forEach(function (t) {
      if (t.length === 1) { run += t; return; }
      if (run) out.push(run);
      run = '';
      if (t) out.push(t);
    });
    if (run) out.push(run);
    return out.filter(function (t) { return SPARED.indexOf(t) === -1; });
  }
  function cursed(word) {
    var base = word.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[0345789@$!+]/g, function (c) { return LEET[c]; });
    return ['i', 'l'].some(function (one) {
      var n = base.replace(/[1|]/g, one);
      var compact = n.replace(/[^a-z]/g, '');
      var tokens = tokensOf(n);
      return WARDS.some(function (w) {
        if (w.inside) {
          if (w.across && w.inside.test(compact)) return true;
          return tokens.some(function (tok) { return w.inside.test(tok); });
        }
        return tokens.some(function (tok) { return w.whole.test(tok); });
      });
    });
  }

  /* The verb links summon, then open. */
  var links = Array.prototype.slice.call(list.querySelectorAll('a.verb, .home-suno-sign a'));
  function wordOf(a) {
    var label = a.querySelector('.verb-label');
    return (label ? label.textContent : a.textContent).trim().toLowerCase();
  }
  function follow(a) {
    invoke(rite(wordOf(a), 'link'), function () { window.location.assign(a.href); });
  }
  links.forEach(function (a) {
    a.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || still.matches || !cw) return;
      event.preventDefault();
      if (mode !== 'summon') follow(a);
    });
  });

  /* The spell line. Built here, so a page without the script has no dead field. */
  var row = document.createElement('li');
  row.className = 'verb-row spell-row';
  var label = document.createElement('label');
  label.className = 'spell';
  var caret = document.createElement('span');
  caret.setAttribute('aria-hidden', 'true');
  caret.textContent = '> ';
  var input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 24;
  input.placeholder = '_';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('enterkeyhint', 'go');
  input.setAttribute('aria-label', 'invoke');
  label.appendChild(caret);
  label.appendChild(input);
  row.appendChild(label);
  list.appendChild(row);
  var out = document.createElement('p');
  out.className = 'spell-out';
  out.setAttribute('aria-live', 'polite');
  list.parentNode.appendChild(out);

  function answer(r) {
    out.textContent = '';
    var mark = r.refused ? '✗ refused' : r.fate === 'bound' ? '✓ bound' : r.fate === 'unstable' ? '~ unstable' : '✗ unanswered';
    [[mark, 'spell-fate'], ['  {' + r.n + '/' + r.k + '}  ', 'spell-mark'], [r.fate === 'unanswered' ? '. . .' : '<- ' + r.omen, 'spell-omen']].forEach(function (part) {
      var span = document.createElement('span');
      span.className = part[1];
      span.textContent = part[0];
      out.appendChild(span);
    });
  }

  input.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    var word = input.value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 24);
    if (!word || mode === 'summon' || !cw) return;
    input.value = '';
    out.textContent = '';
    var target = links.filter(function (a) { return wordOf(a) === word; })[0];
    if (target) { if (still.matches) window.location.assign(target.href); else follow(target); return; }
    if (word === 'return' || word === 'home' || word === 'matt does') { invoke(rite('matt does', 'home')); return; }
    var r;
    if (cursed(word)) {
      /* A refused word never reaches the scene: the circle summons noise. */
      r = rite(word.replace(/\S/g, function () { return GLITCH[Math.floor(rnd() * GLITCH.length)]; }), 'spell');
      r.fate = 'unanswered';
      r.refused = true;
    } else {
      r = rite(word, 'spell');
    }
    invoke(r, function () { answer(r); });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key.length !== 1 || /[ /']/.test(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
    var el = document.activeElement;
    if (el && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) return;
    if (hero.getBoundingClientRect().bottom > 0) input.focus({ preventScroll: true });
  });

  function at(event) {
    var rect = canvas.getBoundingClientRect();
    return [(event.clientX - rect.left) / cw, (event.clientY - rect.top) / chh];
  }
  hero.addEventListener('pointermove', function (event) {
    if (!cw) return;
    var pt = at(event);
    pointer.x = pt[0]; pointer.y = pt[1]; pointer.on = true;
    var now = performance.now();
    lastInput = now;
    if (now - lastAdd > 150) { lastAdd = now; ripples.push({ x: pt[0], y: pt[1], t0: now / 1000, a: 0.5 }); }
  }, { passive: true });
  hero.addEventListener('pointerleave', function () { pointer.on = false; });
  hero.addEventListener('pointerdown', function (event) {
    if (!cw || event.target.closest('a, input')) return;
    var pt = at(event);
    lastInput = performance.now();
    ripples.push({ x: pt[0], y: pt[1], t0: lastInput / 1000, a: 1.1 });
  }, { passive: true });

  /* Back from a verb page: start again from a fresh rite. */
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted || !cw) return;
    onDone = null;
    mode = 'rest';
    prev = cur = rite('matt does', 'home');
    cur.mask = textMask(cur.word);
    boot = performance.now();
    if (still.matches) stillFrame(); else run();
  });

  function sync() {
    if (still.matches) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      stillFrame();
    } else {
      run();
    }
  }

  function begin() {
    hero.setAttribute('data-drawn', '');
    layout();
    boot = performance.now();
    sync();
    window.addEventListener('resize', function () { layout(); if (still.matches) stillFrame(); }, { passive: true });
    if (typeof still.addEventListener === 'function') still.addEventListener('change', sync);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting && !document.hidden;
        run();
      }).observe(hero);
    }
    document.addEventListener('visibilitychange', function () {
      visible = !document.hidden;
      run();
    });
  }

  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('100px ' + NAME_FONT, 'matt does'),
      document.fonts.load(look.fontSize + ' ' + CELL_FONT),
    ]).then(begin, begin);
  } else {
    begin();
  }
})();
