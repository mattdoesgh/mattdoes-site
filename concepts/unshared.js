// Concept only. Every sound is synthesized here.
//
// Three electronic habits, one field:
// Eno, 2/1: seven tones on loops whose lengths do not divide each other,
// each note followed by a longer silence, so clusters and gaps keep changing.
// Hauschildt: a chord is the bed. Moving across the field interpolates toward
// a second chord, and a short sequence walks that harmony with small jumps.
// Biosphere: a slow sub, a darkened echo, and a long generated room. The
// vertical drag is how large that room is. No recorded sound is used.

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const style = getComputedStyle(document.documentElement);
const PINK = style.getPropertyValue('--pink').trim();
const BLACK = style.getPropertyValue('--black').trim();

// Loop lengths follow the 2/1 tapes (about 17s to 31s, including the long Db).
// Each tone is under a third of its loop, so the silence stays at least twice
// the sound. Offsets land in that silence: the page opens mid-system.
const LOOPS = [
  { freq: 261.63, period: 21, dur: 6.2 },
  { freq: 311.13, period: 17, dur: 5.0 },
  { freq: 349.23, period: 25, dur: 7.4 },
  { freq: 415.3, period: 18, dur: 5.4 },
  { freq: 554.37, period: 31, dur: 9.2 },
  { freq: 698.46, period: 19.6, dur: 5.8 },
  { freq: 207.65, period: 22, dur: 6.5 },
].map((loop) => ({
  ...loop,
  offset: loop.dur + Math.random() * (loop.period - loop.dur),
  pan: 0,
}));
LOOPS.forEach((loop, i) => {
  loop.pan = (i / (LOOPS.length - 1)) * 1.4 - 0.7;
});

const BED_A = [130.81, 196.0, 311.13];
const BED_B = [174.61, 207.65, 261.63, 277.18];
const WALK_A = [261.63, 311.13, 392.0, 523.25, 622.25];
const WALK_B = [349.23, 415.3, 523.25, 554.37, 698.46];

const place = { x: 0.38, y: 0.58 };
const audio = {
  ctx: null,
  master: null,
  on: false,
  stop: null,
  t0: 0,
};
const sparks = [];
let walk = 2;
let raf = 0;
let lastPoke = 0;

const $ = (sel) => document.querySelector(sel);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function volumeGain() {
  return Number($('#volume').value) / 100;
}

function ensure() {
  if (audio.ctx) {
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    return audio.ctx;
  }
  const session = navigator.audioSession;
  if (session) {
    try { session.type = 'playback'; } catch { /* older Safari */ }
  }
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = volumeGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(ctx.destination);
  audio.ctx = ctx;
  audio.master = master;
  ctx.resume();
  return ctx;
}

function impulse(ctx, seconds, decay) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  const curve = 0.4 + (1 - decay) * 2.4;
  for (let c = 0; c < 2; c += 1) {
    const data = buffer.getChannelData(c);
    let prev = 0;
    for (let i = 0; i < len; i += 1) {
      const n = Math.random() * 2 - 1;
      prev = prev * 0.92 + n * 0.08;
      data[i] = prev * (1 - i / len) ** curve * (c === 0 ? 1 : 0.85);
    }
  }
  return buffer;
}

function elapsed() {
  if (!audio.ctx || !audio.on) return 0;
  return Math.max(0, audio.ctx.currentTime - audio.t0);
}

function phaseOf(loop, time) {
  const t = time == null ? elapsed() : time;
  return ((t + loop.offset) % loop.period + loop.period) % loop.period;
}

function env(ctx, time, peak, attack, release) {
  const g = ctx.createGain();
  const level = Math.max(peak, 0.001);
  const hold = release * 0.42;
  const tail = release - hold;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(level, time + Math.max(attack, 0.01));
  g.gain.setValueAtTime(level, time + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.001, time + attack + hold + tail);
  return g;
}

let graph = null;

function tone(time, freq, attack, release, peak, type, dest, pan) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  const g = env(ctx, time, peak, attack, release);
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  let panner = null;
  if (pan) {
    panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    g.connect(panner);
    panner.connect(dest);
  } else {
    g.connect(dest);
  }
  const end = time + attack + release + 0.08;
  osc.start(time);
  osc.stop(end);
  osc.onended = () => {
    try { osc.disconnect(); } catch { /* gone */ }
    try { g.disconnect(); } catch { /* gone */ }
    try { panner?.disconnect(); } catch { /* gone */ }
  };
}

function glide(param, value, t, seconds) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(Math.max(param.value, 0.0001), t);
  param.setTargetAtTime(Math.max(value, 0.0001), t, seconds);
}

function applyPlace() {
  if (!graph) return;
  const { ctx } = audio;
  const t = ctx.currentTime;
  const x = place.x;
  const y = place.y;
  graph.beds.forEach((bed) => {
    const level = (bed.group === 'b' ? x : 1 - x) * bed.base;
    glide(bed.gain.gain, level, t, 0.12);
  });
  glide(graph.filter.frequency, 240 + x * 2600 + y * 300, t, 0.08);
  glide(graph.wet.gain, 0.16 + y * 0.72, t, 0.1);
  glide(graph.fb.gain, 0.08 + y * 0.42, t, 0.1);
  glide(graph.delay.delayTime, 0.26 + y * 0.5, t, 0.15);
  clearTimeout(graph.impulseTimer);
  graph.impulseTimer = setTimeout(() => {
    if (audio.on && graph) {
      graph.verb.buffer = impulse(ctx, 0.7 + place.y * 4.2, 0.72);
    }
  }, 160);
}

function nextWalk(x) {
  const pool = Math.random() < x ? WALK_B : WALK_A;
  if (Math.random() < 0.18) walk = Math.floor(Math.random() * pool.length);
  else walk = (walk + (Math.random() < 0.5 ? -1 : 1) + pool.length) % pool.length;
  const leap = Math.random() < 0.12 ? 2 : 1;
  return pool[walk] * leap;
}

function start() {
  const ctx = ensure();
  const bus = ctx.createGain();
  bus.gain.value = 1;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.6;
  filter.frequency.value = 900;
  const dry = ctx.createGain();
  dry.gain.value = 0.78;
  const wet = ctx.createGain();
  wet.gain.value = 0.16 + place.y * 0.72;
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 0.7 + place.y * 4.2, 0.72);
  const t0 = ctx.currentTime + 0.05;
  audio.t0 = t0;
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.26 + place.y * 0.5;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 1600;
  const fb = ctx.createGain();
  fb.gain.value = 0.08 + place.y * 0.42;
  const send = ctx.createBiquadFilter();
  send.type = 'highpass';
  send.frequency.value = 160;
  delay.connect(damp);
  damp.connect(fb);
  fb.connect(delay);
  damp.connect(wet);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.11;
  lfoGain.gain.value = 0.007;
  lfo.connect(lfoGain);
  lfoGain.connect(delay.delayTime);
  lfo.start();

  const beds = [];
  function bed(freq, type, group, base) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() * 8) - 4;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(filter);
    osc.start();
    beds.push({ gain, group, base });
    return osc;
  }
  const steady = [
    ...BED_A.map((freq) => bed(freq, 'sine', 'a', 0.055)),
    ...BED_B.map((freq) => bed(freq, 'triangle', 'b', 0.042)),
  ];
  const sub = ctx.createOscillator();
  const sub2 = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub2.type = 'sine';
  sub.frequency.value = 55;
  sub2.frequency.value = 55.35;
  subGain.gain.setValueAtTime(0.0001, t0);
  subGain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.8);
  sub.connect(subGain);
  sub2.connect(subGain);
  subGain.connect(audio.master);
  sub.start(t0);
  sub2.start(t0);

  filter.connect(bus);
  bus.connect(dry);
  bus.connect(send);
  send.connect(delay);
  send.connect(verb);
  verb.connect(wet);
  dry.connect(audio.master);
  wet.connect(audio.master);

  graph = { beds, filter, wet, fb, delay, verb, impulseTimer: 0, bus };
  applyPlace();

  const next = LOOPS.map((loop) => t0 + (loop.period - (loop.offset % loop.period)));
  let arpAt = t0 + 1.8;
  let glassAt = t0 + 9;
  let dead = false;
  const clock = setInterval(() => {
    if (dead || !audio.ctx) return;
    const now = audio.ctx.currentTime;
    const horizon = now + 0.3;
    LOOPS.forEach((loop, i) => {
      if (next[i] < now - 0.05) {
        const late = now - next[i];
        next[i] += Math.ceil(late / loop.period) * loop.period;
      }
      if (next[i] < horizon) {
        tone(next[i], loop.freq, 0.4, loop.dur, 0.05, 'sine', bus, loop.pan);
        sparks.push({ x: 0, y: (i + 0.5) / LOOPS.length, at: next[i] - t0, kind: 'loop', index: i });
        next[i] += loop.period;
      }
    });
    if (arpAt < now - 0.05) arpAt = now + 0.05;
    if (arpAt < horizon) {
      // A rest leaves a pocket of air between pulses. The walk is not a clock.
      const rest = Math.random() < 0.16;
      if (!rest) {
        const freq = nextWalk(place.x);
        const type = place.x > 0.55 ? 'triangle' : 'sine';
        tone(arpAt, freq, 0.03, 0.22 + Math.random() * 0.16, 0.045, type, bus, (place.x * 2 - 1) * 0.6);
        const pool = place.x > 0.5 ? WALK_B : WALK_A;
        const fundamental = freq > 800 ? freq / 2 : freq;
        let slot = -1;
        pool.forEach((note, index) => {
          if (Math.abs(note - fundamental) < 0.5) slot = index;
        });
        sparks.push({
          x: slot < 0 ? place.x : (slot + 0.5) / pool.length,
          y: 0.82 - place.y * 0.25,
          at: arpAt - t0,
          kind: 'walk',
        });
      }
      arpAt += rest ? 0.5 + Math.random() * 0.45 : 0.28 + Math.random() * 0.34;
    }
    if (glassAt < horizon) {
      tone(glassAt, Math.random() < 0.5 ? 1760 : 2349.3, 0.45, 4.5, 0.02, 'sine', verb, (Math.random() * 2 - 1) * 0.8);
      sparks.push({ x: 0.15 + Math.random() * 0.7, y: 0.12 + Math.random() * 0.2, at: glassAt - t0, kind: 'glass' });
      glassAt += 11 + Math.random() * 9;
    }
    if (sparks.length > 24) sparks.splice(0, sparks.length - 24);
  }, 40);

  const nodes = [...steady, sub, sub2, lfo];
  audio.on = true;
  audio.stop = () => {
    dead = true;
    clearInterval(clock);
    clearTimeout(graph.impulseTimer);
    graph = null;
    audio.on = false;
    const t = ctx.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + 0.06);
    subGain.gain.setValueAtTime(subGain.gain.value, t);
    subGain.gain.linearRampToValueAtTime(0, t + 0.06);
    setTimeout(() => {
      nodes.forEach((node) => { try { node.stop(); } catch { /* stopped */ } });
      try { bus.disconnect(); } catch { /* gone */ }
      try { subGain.disconnect(); } catch { /* gone */ }
    }, 80);
  };
  paint();
}

function stop() {
  if (audio.stop) audio.stop();
  audio.stop = null;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  const play = $('#play');
  play.setAttribute('aria-pressed', 'false');
  play.setAttribute('aria-label', 'play');
  draw();
}

function play() {
  if (audio.on) {
    stop();
    return;
  }
  start();
  const button = $('#play');
  button.setAttribute('aria-pressed', 'true');
  button.setAttribute('aria-label', 'stop');
}

function poke(when) {
  if (!audio.on || !graph) return;
  if (when - lastPoke < 0.09) return;
  lastPoke = when;
  const freq = nextWalk(place.x);
  tone(when, freq, 0.02, 0.18, 0.04, place.x > 0.5 ? 'triangle' : 'sine', graph.bus, (place.x * 2 - 1) * 0.5);
  sparks.push({ x: place.x, y: place.y, at: when - audio.t0, kind: 'touch' });
}

function point(event) {
  const canvas = $('#field');
  const rect = canvas.getBoundingClientRect();
  place.x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  place.y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  if (audio.on && audio.ctx) {
    applyPlace();
    poke(audio.ctx.currentTime);
  }
  if (!audio.on || reduce) draw();
}

function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h, dpr };
}

function hash(col, row) {
  const n = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function colors() {
  const fresh = getComputedStyle(document.documentElement);
  const pink = fresh.getPropertyValue('--pink').trim() || PINK;
  const black = fresh.getPropertyValue('--black').trim() || BLACK;
  return { pink, black };
}

function draw() {
  const canvas = $('#field');
  const { w, h, dpr } = fit(canvas);
  const g = canvas.getContext('2d');
  const { pink, black } = colors();
  g.fillStyle = black;
  g.fillRect(0, 0, w, h);
  g.fillStyle = pink;
  // A larger room is a finer matrix. Dragging is visible before any sound.
  const gap = Math.max(12 * dpr, Math.min(w, h) / (9 + Math.round(place.y * 7)));
  const cols = Math.max(8, Math.floor(w / gap));
  const rows = Math.max(8, Math.floor(h / gap));
  const stepX = w / cols;
  const stepY = h / rows;
  const radius = Math.min(stepX, stepY) * 0.34;
  const time = reduce ? 0 : elapsed();
  const weather = reduce ? 0.4 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 0.17));
  const salt = Math.round(place.x * 5);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let lamp = 0.03 + hash(col, row) * 0.045 * weather;
      if (hash(col + salt * 4, 2) > 0.84) lamp += 0.16 + place.x * 0.2;
      if (hash(col, row + 9) > 1 - place.y * 0.2) lamp += 0.28;
      LOOPS.forEach((loop, i) => {
        const band = ((i + 0.5) / LOOPS.length) * (rows - 1);
        const rowFall = Math.abs(row - band);
        if (rowFall > 1.15) return;
        const rowGain = rowFall > 0.55 ? 0.4 : 1;
        const p = phaseOf(loop, time);
        const head = (p / loop.period) * (cols - 1);
        const sounding = p < loop.dur;
        lamp += 0.11 * rowGain;
        const behind = head - col;
        const trail = (loop.dur / loop.period) * cols;
        if (sounding && behind >= 0 && behind < trail) {
          lamp += (1 - behind / trail) * 0.95 * rowGain;
        }
        const d = Math.abs(col - head);
        lamp += Math.exp((-d * d) / 8) * (sounding ? 0.85 : 0.3) * rowGain;
      });
      sparks.forEach((spark) => {
        const age = time - spark.at;
        const life = spark.kind === 'glass' ? 4.2 : spark.kind === 'loop' ? 2.4 : 0.55;
        if (age < 0 || age > life) return;
        const sx = spark.kind === 'loop'
          ? (phaseOf(LOOPS[spark.index], time) / LOOPS[spark.index].period) * (cols - 1)
          : spark.x * (cols - 1);
        const sy = spark.y * (rows - 1);
        const d = Math.hypot(col - sx, row - sy);
        lamp += Math.exp((-d * d) / (spark.kind === 'glass' ? 7 : 1.6)) * (1 - age / life);
      });
      const fx = place.x * (cols - 1);
      const fy = place.y * (rows - 1);
      const near = Math.hypot(col - fx, row - fy);
      lamp += Math.exp((-near * near) / 5.5) * 0.85;
      if (lamp < 0.1) continue;
      g.globalAlpha = clamp(lamp, 0, 1);
      g.beginPath();
      g.arc(
        stepX * (col + 0.5),
        stepY * (row + 0.5),
        radius * (0.72 + Math.min(lamp, 1.3) * 0.4),
        0,
        Math.PI * 2,
      );
      g.fill();
    }
  }
  g.globalAlpha = 1;
}

function frame() {
  raf = 0;
  draw();
  if (audio.on && !reduce) raf = requestAnimationFrame(frame);
}

function paint() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (audio.on && !reduce) raf = requestAnimationFrame(frame);
  else draw();
}

const field = $('#field');
let dragging = false;
field.addEventListener('pointerdown', (event) => {
  dragging = true;
  try { field.setPointerCapture(event.pointerId); } catch { /* the point still lands */ }
  point(event);
});
field.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  point(event);
});
field.addEventListener('pointerup', () => { dragging = false; });
field.addEventListener('pointercancel', () => { dragging = false; });
field.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 0.08 : 0.04;
  if (event.key === 'ArrowRight') place.x = clamp(place.x + step, 0, 1);
  else if (event.key === 'ArrowLeft') place.x = clamp(place.x - step, 0, 1);
  else if (event.key === 'ArrowUp') place.y = clamp(place.y - step, 0, 1);
  else if (event.key === 'ArrowDown') place.y = clamp(place.y + step, 0, 1);
  else return;
  event.preventDefault();
  if (audio.on) applyPlace();
  if (!audio.on || reduce) draw();
});

$('#play').addEventListener('click', play);
$('#volume').addEventListener('input', () => {
  if (!audio.master || !audio.ctx) return;
  audio.master.gain.setTargetAtTime(volumeGain(), audio.ctx.currentTime, 0.03);
});
addEventListener('resize', () => {
  if (!audio.on || reduce) draw();
});
requestAnimationFrame(draw);
