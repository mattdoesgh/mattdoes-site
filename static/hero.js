/* Home hero. The name and the surface words float on a water line: the
   parts above it are solid, the parts below are outlines bent by the
   water. Words rise through the surface and sink back, and crossing it
   leaves a ripple. The name floats in a glass bottle on the line; one at
   a time, a word flows in through the neck, joins the phrase inside, and
   flows back out. So does the pointer. Scrolling raises the water until everything is under it.
   Reduced motion draws one still frame. Colors come from the computed
   style, so the palette stays in site/tokens.css. */
(function () {
  var hero = document.querySelector('[data-hero]');
  var canvas = hero ? hero.querySelector('canvas.hero-water') : null;
  var heading = hero ? hero.querySelector('.hero-word') : null;
  if (!canvas || !heading || !canvas.getContext || typeof window.matchMedia !== 'function') return;
  var ctx = canvas.getContext('2d');
  var scene = document.createElement('canvas');
  var sctx = scene.getContext('2d');
  var deep = document.createElement('canvas');
  var dctx = deep.getContext('2d');
  if (!ctx || !sctx || !dctx) return;

  var still = window.matchMedia('(prefers-reduced-motion: reduce)');
  var ink = getComputedStyle(heading).color;
  var field = getComputedStyle(document.body).backgroundColor;
  var family = getComputedStyle(heading).fontFamily;
  var list = String(canvas.getAttribute('data-words') || '').split('|').filter(Boolean);

  var W = 0;
  var H = 0;
  var dpr = 1;
  var size = 0;
  var words = [];
  var ripples = [];
  var frame = 0;
  var visible = true;
  var start = 0;
  var lastPointer = 0;
  var nameWidth = 0;
  var order = [];
  var STEP = 6;
  /* One word at a time flows into the phrase: in, hold, out, rest. */
  var CYCLE = 9;
  var FIRST = 2.5;

  /* A fixed seed, so the scene is the same on every load. */
  var seed = 7;
  function rand() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  function layout() {
    var rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    canvas.width = scene.width = deep.width = Math.round(W * dpr);
    canvas.height = scene.height = deep.height = Math.round(H * dpr);
    [ctx, sctx, dctx].forEach(function (c) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.textBaseline = 'alphabetic';
      c.lineJoin = 'round';
    });
    size = parseFloat(getComputedStyle(heading).fontSize) || W / 4.4;
    seed = 7;
    var scale = (W + H) / 2;
    words = list.map(function (text, index) {
      var depth = rand();
      var s = scale * (0.03 + depth * 0.05);
      return {
        text: text,
        s: s,
        alpha: 0.45 + depth * 0.4,
        x: ((index + rand() * 0.7) / list.length) * W * 1.2,
        vx: (rand() < 0.5 ? -1 : 1) * (5 + rand() * 12) * depth,
        w: (Math.PI * 2) / (14 + rand() * 14),
        phase: rand() * Math.PI * 2,
        rise: H * (0.14 + rand() * 0.22),
        bias: H * (rand() * 0.24 - 0.1),
        side: 0,
        width: 0,
      };
    });
    words.forEach(function (word) {
      sctx.font = word.s.toFixed(1) + 'px ' + family;
      word.width = sctx.measureText(word.text).width;
      sctx.font = size.toFixed(1) + 'px ' + family;
      word.full = sctx.measureText(word.text).width;
    });
    sctx.font = size.toFixed(1) + 'px ' + family;
    nameWidth = sctx.measureText('matt does').width;
    order = words.map(function (_, index) { return index; });
    for (var i = order.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rand() * (i + 1));
      var swap = order[i];
      order[i] = order[j];
      order[j] = swap;
    }
  }

  function progress() {
    var span = hero.offsetHeight - window.innerHeight;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / span));
  }

  function surface(x, t, line) {
    var y = line
      + Math.sin(x * 0.012 + t * 0.9) * 3.2
      + Math.sin(x * 0.031 - t * 1.7) * 1.6;
    for (var i = 0; i < ripples.length; i += 1) {
      var r = ripples[i];
      var age = t - r.t;
      var d = Math.abs(x - r.x);
      var front = age * 260;
      if (d > front) continue;
      y += r.a * Math.exp(-age * 1.1) * Math.exp(-d / 260) * Math.sin(d * 0.06 - age * 7);
    }
    return y;
  }

  function addRipple(x, t, a) {
    ripples.push({ x: x, t: t, a: a });
    if (ripples.length > 14) ripples.shift();
  }

  /* Each word is painted twice: solid for the air, an outline for the water. */
  function paint(text, x, y, px, alpha, align) {
    var font = px.toFixed(1) + 'px ' + family;
    sctx.font = dctx.font = font;
    sctx.textAlign = dctx.textAlign = align;
    sctx.globalAlpha = alpha;
    sctx.fillText(text, x, y);
    dctx.globalAlpha = alpha * 0.08;
    dctx.fillText(text, x, y);
    dctx.globalAlpha = alpha;
    dctx.lineWidth = Math.max(1.2, px * 0.014);
    dctx.strokeText(text, x, y);
  }

  function ease(v) {
    var c = Math.min(1, Math.max(0, v));
    return c * c * (3 - 2 * c);
  }

  /* Which word is in the phrase now, and how far: 0 drifting, 1 joined. */
  function joining(t) {
    if (!order.length || t < FIRST) return { index: -1, amount: 0 };
    var k = Math.floor((t - FIRST) / CYCLE);
    var u = (t - FIRST) / CYCLE - k;
    var amount = u < 0.28 ? ease(u / 0.28) : u < 0.62 ? 1 : ease(1 - (u - 0.62) / 0.28);
    return { index: order[k % order.length], amount: amount };
  }

  function lerp(a, b, v) {
    return a + (b - a) * v;
  }

  /* The bottle, in its own frame: the body is centred on the origin and
     the open neck points right. r is the body's half height. */
  function bottleShape(r, body) {
    var x0 = -body / 2;
    var x1 = body / 2;
    var shoulder = r * 0.9;
    var neck = r * 1.15;
    var rn = r * 0.36;
    var corner = r * 0.4;
    return {
      r: r, x0: x0, x1: x1, rn: rn, corner: corner,
      xs: x1 + shoulder,
      mouth: x1 + shoulder + neck,
    };
  }

  function bottlePath(c, b) {
    c.beginPath();
    c.moveTo(b.x0 + b.corner, -b.r);
    c.lineTo(b.x1, -b.r);
    c.bezierCurveTo(b.x1 + (b.xs - b.x1) * 0.6, -b.r, b.x1 + (b.xs - b.x1) * 0.5, -b.rn, b.xs, -b.rn);
    c.lineTo(b.mouth, -b.rn);
    c.lineTo(b.mouth, b.rn);
    c.lineTo(b.xs, b.rn);
    c.bezierCurveTo(b.x1 + (b.xs - b.x1) * 0.5, b.rn, b.x1 + (b.xs - b.x1) * 0.6, b.r, b.x1, b.r);
    c.lineTo(b.x0 + b.corner, b.r);
    c.quadraticCurveTo(b.x0, b.r, b.x0, b.r - b.corner);
    c.lineTo(b.x0, -b.r + b.corner);
    c.quadraticCurveTo(b.x0, -b.r, b.x0 + b.corner, -b.r);
    c.closePath();
  }

  /* Glass: a faint body, the outline, a lip ring and one long highlight.
     The water copy keeps only the outline. */
  function paintGlass(b) {
    sctx.globalAlpha = 0.07;
    bottlePath(sctx, b);
    sctx.fill();
    sctx.globalAlpha = 0.9;
    sctx.lineWidth = Math.max(1.5, b.r * 0.025);
    sctx.stroke();
    dctx.globalAlpha = 0.8;
    dctx.lineWidth = Math.max(1.2, b.r * 0.02);
    bottlePath(dctx, b);
    dctx.stroke();
    sctx.globalAlpha = 0.5;
    sctx.lineWidth = Math.max(2, b.r * 0.05);
    sctx.lineCap = 'round';
    sctx.beginPath();
    sctx.moveTo(b.x0 + b.corner * 1.4, -b.r * 0.72);
    sctx.lineTo(b.x1 - b.r * 0.2, -b.r * 0.72);
    sctx.stroke();
    sctx.globalAlpha = 0.9;
    sctx.lineWidth = Math.max(1.5, b.r * 0.025);
    sctx.strokeRect(b.mouth - b.r * 0.12, -b.rn * 1.25, b.r * 0.12, b.rn * 2.5);
  }

  function drawScene(t, rest, line) {
    sctx.clearRect(0, 0, W, H);
    dctx.clearRect(0, 0, W, H);
    sctx.fillStyle = dctx.fillStyle = sctx.strokeStyle = dctx.strokeStyle = ink;

    var r = Math.min(H * 0.17, W * 0.13);
    var body = Math.max(r * 2.4, Math.min(W * 0.9, W - r * 1.2) - r * 2.05);
    var b = bottleShape(r, body);
    var cx = W / 2 - (b.mouth - b.x1) / 2;
    var cy = rest - r * 0.12 + Math.sin(t * 0.7) * r * 0.1;
    var tilt = Math.sin(t * 0.5) * 0.04;
    var cos = Math.cos(tilt);
    var sin = Math.sin(tilt);
    function toPage(x, y) {
      return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
    }

    var join = joining(t);
    var guest = join.index >= 0 ? words[join.index] : null;
    var a = guest ? join.amount : 0;
    var room = body * 0.82;
    var nameFit = Math.min(size, (room / nameWidth) * size, r * 1.9);
    var gap = nameFit * 0.24;
    var phrase = guest ? nameWidth / size * nameFit + gap + guest.full / size * nameFit : 0;
    var fit = guest ? Math.min(1, room / phrase) : 1;
    var held = a > 0.5 ? (a - 0.5) * 2 : 0;
    var nameSize = lerp(nameFit, nameFit * fit, held);
    var nameW = nameWidth / size * nameSize;
    var slotW = guest ? (nameW + gap * fit + guest.full / size * nameSize) : nameW;
    var nameX = -lerp(nameW, slotW, held) / 2;
    var baseY = nameSize * 0.36;
    var mouth = toPage(b.mouth, 0);
    var neckPx = b.rn * 1.5;

    var inside = null;
    for (var i = 0; i < words.length; i += 1) {
      var word = words[i];
      var span = W + word.width;
      var x = ((word.x + word.vx * t) % span + span) % span - word.width;
      var base = rest + word.bias + Math.sin(t * word.w + word.phase) * word.rise;
      var px = word.s;
      var alpha = word.alpha;
      if (word === guest && a > 0) {
        if (a > 0.5) {
          inside = { word: word, v: (a - 0.5) * 2 };
          if (!word.inside) addRipple(mouth.x, t, 8);
          word.inside = true;
          continue;
        }
        word.inside = false;
        /* Toward the mouth, shrinking to fit the neck, along a path that
           dips under the line. */
        var v = a * 2;
        var wpx = lerp(word.s, neckPx, v);
        var ww = word.width / word.s * wpx;
        x = lerp(x, mouth.x - ww * v, v);
        base = lerp(base, mouth.y + wpx * 0.36, v) + Math.sin(v * Math.PI) * r * 0.8;
        px = wpx;
        alpha = lerp(word.alpha, 1, v);
      } else {
        word.inside = false;
      }
      var side = base - px * 0.36 < line ? -1 : 1;
      if (word.side && side !== word.side) addRipple(x + word.width / 2, t, Math.min(12, px * 0.08));
      word.side = side;
      paint(word.text, x, base, px, alpha, 'left');
    }

    [sctx, dctx].forEach(function (c) {
      c.save();
      c.translate(cx, cy);
      c.rotate(tilt);
    });
    paintGlass(b);
    [sctx, dctx].forEach(function (c) {
      bottlePath(c, b);
      c.save();
      c.clip();
    });
    paint('matt does', nameX, baseY, nameSize, 1, 'left');
    if (inside) {
      /* Through the neck and into the slot after the name. */
      var u = inside.v;
      var slotX = nameX + nameW + gap * fit;
      var ipx = lerp(neckPx, nameSize, u);
      var iw = inside.word.width / inside.word.s * ipx;
      paint(inside.word.text, lerp(b.mouth - iw, slotX, u), lerp(ipx * 0.36, baseY, u), ipx, 1, 'left');
    }
    [sctx, dctx].forEach(function (c) {
      c.restore();
      c.restore();
    });
  }

  function curvePath(t, line, below) {
    ctx.beginPath();
    ctx.moveTo(0, below ? H : 0);
    for (var x = 0; x <= W + STEP; x += STEP) ctx.lineTo(x, surface(x, t, line));
    ctx.lineTo(W, below ? H : 0);
    ctx.closePath();
  }

  function draw(t) {
    var p = progress();
    var rest = H * 0.58; /* --hero-line */
    var line = rest - H * 0.78 * p;
    drawScene(t, rest, line);

    ctx.globalAlpha = 1;
    ctx.fillStyle = field;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    curvePath(t, line, false);
    ctx.clip();
    ctx.drawImage(scene, 0, 0, W, H);
    ctx.restore();

    ctx.save();
    curvePath(t, line, true);
    ctx.clip();
    var top = Math.max(0, Math.floor(line - 12));
    for (var y = top; y < H; y += 3) {
      var depth = Math.min(1, Math.max(0, (y - line) / (H * 0.7)));
      var bend = (Math.sin(y * 0.045 + t * 1.6) * 6 + Math.sin(y * 0.11 - t * 2.3) * 2.5) * (0.5 + depth);
      ctx.globalAlpha = 0.95 - depth * 0.45;
      ctx.drawImage(deep, 0, y * dpr, W * dpr, 3 * dpr, bend, y, W, 3);
    }
    ctx.restore();

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var x = 0; x <= W + STEP; x += STEP) {
      var sy = surface(x, t, line);
      if (x === 0) ctx.moveTo(x, sy); else ctx.lineTo(x, sy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    frame = 0;
    if (!start) start = now;
    var t = (now - start) / 1000;
    while (ripples.length && t - ripples[0].t > 4) ripples.shift();
    draw(t);
    if (visible && !still.matches) frame = window.requestAnimationFrame(tick);
  }

  function run() {
    if (!frame && visible && !still.matches) frame = window.requestAnimationFrame(tick);
  }

  function onPointer(event) {
    if (still.matches || !start) return;
    var now = performance.now();
    if (event.type === 'pointermove' && now - lastPointer < 90) return;
    lastPointer = now;
    var rect = canvas.getBoundingClientRect();
    addRipple(event.clientX - rect.left, (now - start) / 1000, event.type === 'pointerdown' ? 14 : 5);
  }

  function onResize() {
    layout();
    if (still.matches) draw(0);
  }

  function onScroll() {
    if (still.matches) draw(0);
  }

  function sync() {
    if (still.matches) {
      hero.removeAttribute('data-live');
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      draw(0);
    } else {
      hero.setAttribute('data-live', '');
      run();
    }
  }

  function begin() {
    hero.setAttribute('data-drawn', '');
    layout();
    sync();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
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
    document.fonts.load('100px ' + family, 'matt does').then(begin, begin);
  } else {
    begin();
  }
})();
