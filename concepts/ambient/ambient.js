// A flock inside a cube, blown by curl-noise wind. Nothing is audible
// until play. Stop ramps the master to silence and drops every source.

import {
  CUBE,
  FIXED_DT,
  PICK_RADIUS,
  VOICE_COUNT,
  ZOOM_MAX,
  ZOOM_MIN,
  createFlock,
  createVoiceBook,
  outsideCube,
  pickNearest,
  renderPoint,
  shouldSchedule,
  stepFlock,
  windAt,
} from '../flock-model.js';

const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduce = reduceQuery.matches;
const book = createVoiceBook();
const birds = createFlock();
const periods = [21, 17, 25, 18, 31, 19.6, 22];
const ratios = [1.5, 2, 1.4142, 0.5, 2.5, 3, 0.75];
const bases = [130.81, 196, 261.63, 174.61, 311.13, 349.23, 415.3];
const tightChord = [130.81, 196, 261.63, 311.13, 392];
const openChord = [174.61, 207.65, 261.63, 277.18, 349.23, 415.3];
const TAP_SLOP = 28;
const TAP_MS = 600;
const MOTE_COUNT = 18;
const PUFF = 0.16;

const view = { yaw: 0.4, pitch: 0.22, dist: 3.85, finger: null, focus: null };
const audio = { ctx: null, master: null, on: false };
const pointers = new Map();
const motes = [];
const depth = new Float64Array(birds.length);
const order = new Uint16Array(birds.length);
const cubeCorners = [-1, 1].flatMap((z) => [-1, 1].flatMap((y) => [-1, 1].map((x) => ({
  x: x * CUBE,
  y: y * CUBE,
  z: z * CUBE,
}))));
const cubeEdges = [
  [0, 1], [1, 3], [3, 2], [2, 0],
  [4, 5], [5, 7], [7, 6], [6, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

let graph = null;
let clock = 0;
let raf = 0;
let hidden = false;
let retire = [];
let mood = 'drift';
let gustLevel = 0;
let simTime = 0;
let accumulator = 0;
let alpha = 1;
let pinching = false;
let pinchDist = 0;
let gestureZoom = 0;
let liveGrains = 0;
let ink = null;
let lastNow = 0;
let frameCount = 0;
let frameStamp = 0;

for (let i = 0; i < MOTE_COUNT; i += 1) {
  const x = (Math.random() - 0.5) * CUBE * 1.7;
  const y = (Math.random() - 0.5) * CUBE * 1.7;
  const z = (Math.random() - 0.5) * CUBE * 1.7;
  motes.push({ x, y, z, px: x, py: y, pz: z });
}
for (let i = 0; i < birds.length; i += 1) {
  order[i] = i;
  birds[i].glow = 0.72;
}

const $ = (sel) => document.querySelector(sel);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function colors() {
  if (ink && ink.pink) return ink;
  const style = getComputedStyle(document.documentElement);
  ink = {
    pink: style.getPropertyValue('--pink').trim(),
    black: style.getPropertyValue('--black').trim(),
  };
  return ink;
}

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
  master.gain.value = 0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  master.connect(limiter);
  limiter.connect(ctx.destination);
  audio.ctx = ctx;
  audio.master = master;
  ctx.resume();
  return ctx;
}

function impulse(ctx, seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c += 1) {
    const data = buffer.getChannelData(c);
    let prev = 0;
    for (let i = 0; i < len; i += 1) {
      prev = prev * 0.86 + (Math.random() * 2 - 1) * 0.14;
      data[i] = prev * (1 - i / len) ** 1.6;
    }
  }
  return buffer;
}

function noiseBuffer(ctx) {
  const seconds = 2;
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function driveCurve() {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.4);
  }
  return curve;
}

function env(ctx, time, peak, attack, release) {
  const g = ctx.createGain();
  const level = Math.max(peak, 0.001);
  const hold = release * 0.35;
  const tail = Math.max(0.02, release - hold);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(level, time + Math.max(attack, 0.008));
  g.gain.setValueAtTime(level, time + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.001, time + attack + hold + tail);
  return g;
}

function killVoice(entry, t) {
  const node = entry.node;
  const start = entry.start || 0;
  if (start > t + 0.02) {
    try { node.disconnect(); } catch { /* already gone */ }
    try { node.stop(start); } catch { try { node.stop(0); } catch { /* unstarted */ } }
    return;
  }
  try { node.stop(t + 0.05); } catch { try { node.disconnect(); } catch { /* gone */ } }
}

function finishRetire(bag) {
  for (const entry of bag.voices) {
    try { entry.node.disconnect(); } catch { /* gone */ }
  }
  const g = bag.graph;
  if (!g) return;
  for (const voice of g.voices || []) {
    for (const node of [voice.filter, voice.panner, voice.dry, voice.send, voice.level, voice.fm, voice.drive]) {
      if (!node) continue;
      try { node.disconnect(); } catch { /* gone */ }
    }
  }
  for (const node of [g.fb, g.delay, g.wet, g.verb, g.send, g.subGain, g.noiseGain, g.band, g.lfoGain, g.noiseDry]) {
    if (!node) continue;
    try { node.disconnect(); } catch { /* gone */ }
  }
}

function silence() {
  liveGrains = 0;
  for (const bag of retire) finishRetire(bag);
  retire = [];
  const doomed = book.halt();
  if (clock) clearInterval(clock);
  clock = 0;
  const ctx = audio.ctx;
  audio.on = false;
  if (graph) {
    try { graph.fb.disconnect(); } catch { /* no feedback */ }
    clearTimeout(graph.impulseTimer);
  }
  if (!ctx || !audio.master) {
    graph = null;
    return;
  }
  const t = ctx.currentTime;
  const gain = audio.master.gain;
  gain.cancelScheduledValues(t);
  gain.setValueAtTime(Math.max(gain.value, 0), t);
  gain.linearRampToValueAtTime(0, t + 0.05);
  for (const entry of doomed) killVoice(entry, t);
  const bag = { voices: doomed, graph };
  graph = null;
  retire.push(bag);
  setTimeout(() => {
    finishRetire(bag);
    retire = retire.filter((item) => item !== bag);
  }, 80);
}

function look() {
  const cp = Math.cos(view.pitch);
  const sp = Math.sin(view.pitch);
  const sy = Math.sin(view.yaw);
  const cy = Math.cos(view.yaw);
  const dist = view.dist;
  const eye = { x: sy * cp * dist, y: sp * dist * 0.85, z: cy * cp * dist };
  const fl = Math.hypot(eye.x, eye.y, eye.z) || 1;
  const forward = { x: -eye.x / fl, y: -eye.y / fl, z: -eye.z / fl };
  const rx = -forward.z;
  const rz = forward.x;
  const rl = Math.hypot(rx, rz) || 1;
  const right = { x: rx / rl, y: 0, z: rz / rl };
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  return { eye, forward, right, up };
}

function projectXYZ(x, y, z, cam, w, h, out) {
  const dx = x - cam.eye.x;
  const dy = y - cam.eye.y;
  const dz = z - cam.eye.z;
  const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  const cz = dx * cam.forward.x + dy * cam.forward.y + dz * cam.forward.z;
  if (cz < 0.15) return null;
  const basis = Math.max(Math.min(w, h), w * 0.58);
  const f = (basis * 0.86) / cz;
  out.x = w * 0.5 + cx * f;
  out.y = h * 0.5 - cy * f;
  out.f = f;
  out.z = cz;
  return out;
}

function camDepth(x, y, z, cam) {
  const dx = x - cam.eye.x;
  const dy = y - cam.eye.y;
  const dz = z - cam.eye.z;
  return dx * cam.forward.x + dy * cam.forward.y + dz * cam.forward.z;
}

function glide(param, value, t) {
  param.cancelScheduledValues(t);
  const current = Number.isFinite(param.value) ? param.value : value;
  param.setValueAtTime(current, t);
  param.setTargetAtTime(value, t, 0.08);
}

function placeListener(ctx, cam, t) {
  const listener = ctx.listener;
  glide(listener.positionX, cam.eye.x, t);
  glide(listener.positionY, cam.eye.y, t);
  glide(listener.positionZ, cam.eye.z, t);
  glide(listener.forwardX, cam.forward.x, t);
  glide(listener.forwardY, cam.forward.y, t);
  glide(listener.forwardZ, cam.forward.z, t);
  glide(listener.upX, cam.up.x, t);
  glide(listener.upY, cam.up.y, t);
  glide(listener.upZ, cam.up.z, t);
}

function closeness() {
  return clamp((ZOOM_MAX - view.dist) / (ZOOM_MAX - ZOOM_MIN), 0, 1);
}

function voicedBird(voice) {
  return birds[voice.bird];
}

function isHot(bird) {
  if (view.focus == null || !bird) return false;
  return birds[view.focus] === bird;
}

function markSolo() {
  const canvas = $('#field');
  if (!canvas) return;
  canvas.dataset.solo = view.focus == null ? '' : String(view.focus);
  const bird = view.focus == null ? null : birds[view.focus];
  canvas.dataset.outside = bird && outsideCube(bird.x, bird.y, bird.z) ? '1' : '';
}

function applyFocus(index) {
  view.focus = index == null || index < 0 ? null : index;
  markSolo();
  if (!graph) return;
  for (let i = 0; i < VOICE_COUNT; i += 1) graph.voices[i].bird = i;
  if (view.focus != null && view.focus >= VOICE_COUNT) graph.voices[0].bird = view.focus;
}

// PannerNode no longer applies doppler, so pitch follows radial speed.
// A solo bird covers about one world-unit a second, which is a clear shift
// against a speed of sound of 7.
function doppler(bird, cam) {
  const dx = bird.x - cam.eye.x;
  const dy = bird.y - cam.eye.y;
  const dz = bird.z - cam.eye.z;
  const dist = Math.hypot(dx, dy, dz) || 1;
  const radial = (bird.vx * dx + bird.vy * dy + bird.vz * dz) / dist;
  return clamp(7 / (7 + radial), 0.84, 1.18);
}

function syncSpace() {
  if (!audio.on || !graph || !audio.ctx) return;
  const cam = look();
  const t = audio.ctx.currentTime;
  const close = closeness();
  let soloOutside = false;
  try { placeListener(audio.ctx, cam, t); } catch { /* older listener */ }
  for (let i = 0; i < VOICE_COUNT; i += 1) {
    const voice = graph.voices[i];
    const bird = voicedBird(voice);
    const pos = renderPoint(bird, alpha);
    const speed = Math.hypot(bird.vx, bird.vy, bird.vz);
    const hot = isHot(bird);
    const outside = hot && outsideCube(bird.x, bird.y, bird.z);
    if (outside) soloOutside = true;
    const ducked = view.focus != null && !hot;
    const bright = clamp(
      420 + speed * 2200 + bird.turn * 1400 + close * 2000 + gustLevel * 1800
      + (mood === 'scatter' ? 1100 : 0) + (outside ? 3200 : 0),
      220,
      9200,
    );
    glide(voice.filter.frequency, bright, t);
    voice.filter.Q.value = outside ? 1.8 : 0.45 + close * 0.8;
    glide(voice.panner.positionX, pos.x, t);
    glide(voice.panner.positionY, pos.y, t);
    glide(voice.panner.positionZ, pos.z, t);
    const dry = (0.18 + close * 0.85) * (hot ? 2.15 : ducked ? 0.22 : 1);
    glide(voice.dry.gain, dry, t);
    const room = clamp(
      (outside ? 0.14 : 0.42 - close * 0.28) + (mood === 'gather' ? 0.08 : 0) + gustLevel * 0.08,
      0.04,
      0.7,
    );
    glide(voice.send.gain, room, t);
    const level = (hot ? 0.2 : ducked ? 0.045 : 0.08) * (0.75 + close * 0.5);
    glide(voice.level.gain, outside ? level * 1.45 : level, t);
    const dop = doppler(bird, cam);
    const freq = voice.base * dop * (outside ? 1.33 : 1);
    const index = outside
      ? 3.1 + bird.turn * 1.6 + gustLevel
      : 0.22 + bird.turn * 1.15 + gustLevel * 0.95 + (hot ? 0.7 : 0) + (mood === 'scatter' ? 0.55 : 0) + close * 0.35;
    glide(voice.carrier.frequency, freq, t);
    glide(voice.mod.frequency, Math.max(40, freq * (outside ? 1.73 + bird.turn : voice.ratio)), t);
    glide(voice.fm.gain, index * voice.base * 0.42, t);
  }
  glide(graph.delay.delayTime, clamp(0.12 + (1 - close) * 0.46 + (soloOutside ? -0.04 : 0), 0.08, 0.72), t);
  glide(graph.fb.gain, clamp(0.1 + (1 - close) * 0.22 + gustLevel * 0.12 + (mood === 'scatter' ? 0.08 : 0), 0.06, 0.48), t);
  glide(graph.wet.gain, clamp(0.62 - close * 0.42 + (mood === 'gather' ? 0.06 : 0) + (soloOutside ? -0.12 : 0.04), 0.06, 0.78), t);
  const wind = 0.012 + gustLevel * 0.11 + (soloOutside ? 0.07 : 0) + (mood === 'scatter' ? 0.02 : 0);
  glide(graph.noiseGain.gain, wind, t);
  glide(graph.noiseDry.gain, wind * (0.35 + close * 0.8), t);
  glide(graph.band.frequency, clamp(140 + gustLevel * 2100 + (soloOutside ? 1600 : 0) + close * 400, 90, 6400), t);
  glide(graph.band.Q, soloOutside ? 3.2 : 0.45 + gustLevel * 1.5, t);
  glide(graph.lfo.frequency, soloOutside ? 9 + gustLevel * 6 : 0.16 + gustLevel * 2.4, t);
  glide(graph.lfoGain.gain, soloOutside ? 1400 : 90 + gustLevel * 680, t);
  markSolo();
}

function grain(voice, time, freq, peak, rate, gen) {
  if (liveGrains >= 3 || !graph || !audio.ctx) return;
  if (!shouldSchedule(book, gen)) return;
  const ctx = audio.ctx;
  const src = ctx.createBufferSource();
  const bp = ctx.createBiquadFilter();
  src.buffer = graph.noise;
  src.loop = true;
  src.playbackRate.value = rate;
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 7;
  const g = env(ctx, time, peak, 0.004, 0.07);
  src.connect(bp);
  bp.connect(g);
  g.connect(voice.filter);
  const entry = { node: src, start: time };
  if (!book.track(entry, gen)) {
    try { src.disconnect(); } catch { /* unused */ }
    return;
  }
  liveGrains += 1;
  const end = time + 0.1;
  src.start(time);
  src.stop(end);
  src.onended = () => {
    liveGrains = Math.max(0, liveGrains - 1);
    book.drop(entry);
    try { bp.disconnect(); } catch { /* gone */ }
    try { g.disconnect(); } catch { /* gone */ }
  };
}

function start() {
  for (const bag of retire) finishRetire(bag);
  retire = [];
  const ctx = ensure();
  const gen = book.arm();
  const t0 = ctx.currentTime + 0.04;
  audio.master.gain.cancelScheduledValues(ctx.currentTime);
  audio.master.gain.setValueAtTime(volumeGain(), ctx.currentTime);

  const send = ctx.createBiquadFilter();
  send.type = 'highpass';
  send.frequency.value = 140;
  const delay = ctx.createDelay(1.2);
  delay.delayTime.value = 0.31;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 1600;
  const fb = ctx.createGain();
  fb.gain.value = 0.2;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 2.4);
  delay.connect(damp);
  damp.connect(fb);
  fb.connect(delay);
  damp.connect(wet);
  verb.connect(wet);
  wet.connect(audio.master);
  send.connect(delay);
  send.connect(verb);

  const curve = driveCurve();
  const voices = [];
  for (let i = 0; i < VOICE_COUNT; i += 1) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.7;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.15;
    panner.maxDistance = 28;
    panner.rolloffFactor = 0.72;
    const dry = ctx.createGain();
    dry.gain.value = 0.7;
    const room = ctx.createGain();
    room.gain.value = 0.2;
    const level = ctx.createGain();
    level.gain.value = 0.0001;
    const drive = ctx.createWaveShaper();
    drive.curve = curve;
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const fm = ctx.createGain();
    carrier.type = 'sine';
    mod.type = 'sine';
    carrier.frequency.value = bases[i];
    mod.frequency.value = bases[i] * ratios[i];
    fm.gain.value = bases[i] * 0.2;
    mod.connect(fm);
    fm.connect(carrier.frequency);
    carrier.connect(level);
    level.connect(drive);
    drive.connect(filter);
    filter.connect(panner);
    panner.connect(dry);
    dry.connect(audio.master);
    panner.connect(room);
    room.connect(send);
    carrier.start(t0);
    mod.start(t0);
    book.track({ node: carrier, start: t0 }, gen);
    book.track({ node: mod, start: t0 }, gen);
    voices.push({
      filter,
      panner,
      dry,
      send: room,
      level,
      fm,
      drive,
      carrier,
      mod,
      bird: i,
      base: bases[i],
      ratio: ratios[i],
      next: t0 + i * 0.05,
      armed: false,
    });
  }

  const noise = noiseBuffer(ctx);
  const wind = ctx.createBufferSource();
  wind.buffer = noise;
  wind.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 280;
  band.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.0001;
  const noiseDry = ctx.createGain();
  noiseDry.gain.value = 0.4;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine';
  lfo.frequency.value = 0.2;
  lfoGain.gain.value = 80;
  lfo.connect(lfoGain);
  lfoGain.connect(band.frequency);
  wind.connect(band);
  band.connect(noiseGain);
  noiseGain.connect(noiseDry);
  noiseDry.connect(audio.master);
  noiseGain.connect(send);
  wind.start(t0);
  lfo.start(t0);
  book.track({ node: wind, start: t0 }, gen);
  book.track({ node: lfo, start: t0 }, gen);

  const sub = ctx.createOscillator();
  const sub2 = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub2.type = 'sine';
  sub.frequency.value = 55;
  sub2.frequency.value = 55.35;
  subGain.gain.setValueAtTime(0.0001, t0);
  subGain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.7);
  sub.connect(subGain);
  sub2.connect(subGain);
  subGain.connect(audio.master);
  sub.start(t0);
  sub2.start(t0);
  book.track({ node: sub, start: t0 }, gen);
  book.track({ node: sub2, start: t0 }, gen);

  graph = {
    voices,
    delay,
    damp,
    fb,
    wet,
    verb,
    send,
    subGain,
    noise,
    noiseGain,
    noiseDry,
    band,
    lfo,
    lfoGain,
    impulseTimer: 0,
  };
  applyFocus(view.focus);
  clock = setInterval(() => {
    if (!shouldSchedule(book, gen) || !audio.ctx || !graph) return;
    const now = audio.ctx.currentTime;
    for (let i = 0; i < VOICE_COUNT; i += 1) {
      const voice = graph.voices[i];
      if (voice.next > now) continue;
      const bird = voicedBird(voice);
      const hot = isHot(bird);
      const outside = hot && outsideCube(bird.x, bird.y, bird.z);
      const height = clamp((bird.y + CUBE) / (CUBE * 2), 0, 1);
      const scatter = mood === 'scatter';
      const local = bird.near >= 2 || mood === 'gather';
      const pool = scatter ? openChord : (local ? tightChord : openChord);
      let freq = pool[Math.min(pool.length - 1, Math.round(height * (pool.length - 1)))];
      if (scatter) freq *= 2;
      if (outside) freq *= 1.5;
      if (bird.turn > 0.65) freq *= 1 + bird.turn * 0.35;
      voice.base = clamp(freq, 70, 1800);
      voice.ratio = outside ? 1.73 + bird.turn * 0.9 : ratios[i] * (scatter ? 1.4 : 1);
      const restless = outside ? 0.045 : scatter ? 0.07 : 0.16;
      voice.next = now + restless + Math.random() * periods[i] * (hot ? 0.012 : 0.028);
      const brush = bird.wall > 0.72 && !bird.armed;
      if (bird.wall > 0.72) bird.armed = true;
      if (bird.wall < 0.28) bird.armed = false;
      const want = brush
        || outside
        || (hot && Math.random() < 0.55)
        || (gustLevel > 0.62 && Math.random() < 0.42)
        || (scatter && Math.random() < 0.35);
      if (want) {
        const bite = outside ? 0.09 : hot ? 0.045 : 0.02;
        const rate = outside ? 0.35 + Math.random() * 2.4 : 0.55 + Math.random() * 1.6;
        grain(voice, now + 0.01, clamp(freq * (outside ? 3.2 : 2), 180, 4200), bite, rate, gen);
      }
    }
    if (reduce) syncSpace();
  }, 40);

  audio.on = true;
  syncSpace();
  const button = $('#play');
  button.setAttribute('aria-pressed', 'true');
  button.setAttribute('aria-label', 'stop');
  paint();
}

function stop() {
  if (!audio.on && book.stopped) {
    paint();
    return;
  }
  silence();
  const button = $('#play');
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', 'play');
  paint();
}

function play() {
  if (audio.on) stop();
  else start();
}

function hide() {
  hidden = true;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (audio.on) stop();
}

function show() {
  hidden = false;
  paint();
}

function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h, cssW: Math.max(1, rect.width), cssH: Math.max(1, rect.height) };
}

function stepMotes(dt, time) {
  const bound = CUBE * 1.12;
  for (let i = 0; i < motes.length; i += 1) {
    const mote = motes[i];
    const wind = windAt(mote.x, mote.y, mote.z, time);
    mote.px = mote.x;
    mote.py = mote.y;
    mote.pz = mote.z;
    mote.x += wind.x * dt * 0.45;
    mote.y += wind.y * dt * 0.45;
    mote.z += wind.z * dt * 0.45;
    let wrapped = false;
    if (mote.x > bound) { mote.x = -bound; wrapped = true; }
    if (mote.x < -bound) { mote.x = bound; wrapped = true; }
    if (mote.y > bound) { mote.y = -bound; wrapped = true; }
    if (mote.y < -bound) { mote.y = bound; wrapped = true; }
    if (mote.z > bound) { mote.z = -bound; wrapped = true; }
    if (mote.z < -bound) { mote.z = bound; wrapped = true; }
    if (wrapped) {
      mote.px = mote.x;
      mote.py = mote.y;
      mote.pz = mote.z;
    }
  }
}

function simulate(frameDt) {
  for (let i = 0; i < birds.length; i += 1) birds[i].solo = view.focus === i;
  if (reduce) {
    const state = stepFlock(birds, 0, view.finger, true, simTime);
    mood = state.mode;
    gustLevel = state.gust;
    alpha = 1;
    return;
  }
  accumulator += Math.min(frameDt, 0.05);
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 3) {
    const state = stepFlock(birds, FIXED_DT, view.finger, false, simTime);
    mood = state.mode;
    gustLevel = state.gust;
    stepMotes(FIXED_DT, simTime);
    simTime += FIXED_DT;
    accumulator -= FIXED_DT;
    steps += 1;
  }
  if (steps === 3) accumulator = Math.min(accumulator, FIXED_DT);
  alpha = accumulator / FIXED_DT;
}

function strokeEdge(g, a, b, cam, w, h, pa, pb) {
  let ax = a.x;
  let ay = a.y;
  let az = a.z;
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  const za = camDepth(ax, ay, az, cam);
  const zb = camDepth(bx, by, bz, cam);
  const near = 0.2;
  if (za < near && zb < near) return;
  if (za < near || zb < near) {
    const t = (near - za) / ((zb - za) || 0.0001);
    const mx = ax + (bx - ax) * t;
    const my = ay + (by - ay) * t;
    const mz = az + (bz - az) * t;
    if (za < near) { ax = mx; ay = my; az = mz; }
    else { bx = mx; by = my; bz = mz; }
  }
  if (!projectXYZ(ax, ay, az, cam, w, h, pa)) return;
  const x1 = pa.x;
  const y1 = pa.y;
  if (!projectXYZ(bx, by, bz, cam, w, h, pb)) return;
  g.moveTo(x1, y1);
  g.lineTo(pb.x, pb.y);
}

function draw() {
  const canvas = $('#field');
  const { w, h, cssW } = fit(canvas);
  const g = canvas.getContext('2d');
  const { pink, black } = colors();
  const cam = look();
  const pa = { x: 0, y: 0, f: 0, z: 0 };
  const pb = { x: 0, y: 0, f: 0, z: 0 };
  const shown = simTime + alpha * FIXED_DT;
  g.fillStyle = black;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = pink;
  g.lineWidth = Math.max(1, (w / cssW) * 1.15);
  g.lineJoin = 'round';
  g.globalAlpha = 0.8;
  g.beginPath();
  for (let i = 0; i < cubeEdges.length; i += 1) {
    const edge = cubeEdges[i];
    strokeEdge(g, cubeCorners[edge[0]], cubeCorners[edge[1]], cam, w, h, pa, pb);
  }
  g.stroke();
  g.fillStyle = pink;
  g.strokeStyle = pink;
  g.lineWidth = Math.max(1, w / cssW);
  g.globalAlpha = 0.22;
  g.beginPath();
  for (let i = 0; i < motes.length; i += 1) {
    const mote = motes[i];
    const from = renderPoint(mote, alpha);
    if (!projectXYZ(from.x, from.y, from.z, cam, w, h, pa)) continue;
    const x1 = pa.x;
    const y1 = pa.y;
    const radius = clamp(pa.f * 0.012, 0.8, 2.2);
    g.moveTo(x1 + radius, y1);
    g.arc(x1, y1, radius, 0, Math.PI * 2);
    if (projectXYZ(mote.x, mote.y, mote.z, cam, w, h, pb)) {
      g.moveTo(x1, y1);
      g.lineTo(pb.x, pb.y);
    }
  }
  g.fill();
  g.stroke();

  for (let i = 0; i < birds.length; i += 1) {
    const bird = birds[i];
    const pos = renderPoint(bird, alpha);
    depth[i] = projectXYZ(pos.x, pos.y, pos.z, cam, w, h, pa) ? pa.z : -1;
    order[i] = i;
  }
  order.sort((a, b) => {
    if (birds[a].solo) return 1;
    if (birds[b].solo) return -1;
    return depth[b] - depth[a];
  });
  const frameDt = reduce ? 0 : FIXED_DT;
  for (let n = 0; n < order.length; n += 1) {
    const index = order[n];
    const bird = birds[index];
    const hot = isHot(bird);
    const target = hot ? 1 : view.focus == null ? 0.74 : 0.36;
    const glideGlow = bird.glow + (target - bird.glow) * (reduce ? 1 : Math.min(1, frameDt * 10));
    bird.glow = glideGlow;
    const pos = renderPoint(bird, alpha);
    const puff = PUFF * (0.92 + glideGlow * 0.28);
    for (let k = 0; k < bird.dots.length; k += 1) {
      const dot = bird.dots[k];
      const wob = reduce ? 0 : Math.sin(shown * 1.5 + index * 0.71 + k * 1.27) * 0.006;
      if (!projectXYZ(
        pos.x + dot.ox * puff + wob,
        pos.y + dot.oy * puff,
        pos.z + dot.oz * puff * 0.85,
        cam,
        w,
        h,
        pa,
      )) continue;
      const radius = clamp(pa.f * (0.015 + glideGlow * 0.012), 1.05, hot ? 9 : 5.2);
      const depthFade = clamp(2.2 / pa.z, 0.55, 1);
      g.globalAlpha = clamp(glideGlow * depthFade, 0.2, 1);
      g.beginPath();
      g.arc(pa.x, pa.y, radius, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (view.finger) {
    g.globalAlpha = mood === 'scatter' ? 0.8 : 0.5;
    for (let k = 0; k < 4; k += 1) {
      const ang = shown * 1.1 + k * 1.57;
      const spread = mood === 'scatter' ? 0.14 : 0.05;
      if (!projectXYZ(
        view.finger.x + Math.cos(ang) * spread,
        view.finger.y + Math.sin(ang * 1.3) * spread * 0.6,
        view.finger.z + Math.sin(ang) * spread,
        cam,
        w,
        h,
        pa,
      )) continue;
      g.beginPath();
      g.arc(pa.x, pa.y, clamp(pa.f * 0.018, 1.1, 3.5), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  let stray = 0;
  for (let i = 0; i < birds.length; i += 1) {
    if (!birds[i].solo && outsideCube(birds[i].x, birds[i].y, birds[i].z)) stray += 1;
  }
  canvas.dataset.stray = String(stray);
  markSolo();
}

function frame(now) {
  raf = 0;
  if (hidden) return;
  const dt = Math.min(0.05, (now - (lastNow || now)) / 1000 || 0.016);
  lastNow = now;
  if (!reduce && pointers.size === 0 && !pinching) view.yaw += dt * 0.11;
  simulate(dt);
  if (audio.on) syncSpace();
  draw();
  frameCount += 1;
  if (!frameStamp) frameStamp = now;
  if (now - frameStamp >= 1000) {
    const canvas = $('#field');
    if (canvas) canvas.dataset.fps = String(Math.round((frameCount * 1000) / (now - frameStamp)));
    frameCount = 0;
    frameStamp = now;
  }
  if (!reduce) raf = requestAnimationFrame(frame);
}

function paint() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (hidden) return;
  if (reduce) {
    simulate(0);
    draw();
    return;
  }
  raf = requestAnimationFrame(frame);
}

function point(event, dx, dy) {
  const canvas = $('#field');
  const rect = canvas.getBoundingClientRect();
  const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  const cam = look();
  const span = 1.55;
  view.finger = {
    x: cam.right.x * nx * span + cam.up.x * ny * span * 0.75,
    y: cam.right.y * nx * span + cam.up.y * ny * span * 0.75,
    z: cam.right.z * nx * span + cam.up.z * ny * span * 0.75,
  };
  view.yaw += dx * 0.0042;
  view.pitch = clamp(view.pitch - dy * 0.0028, -0.5, 0.85);
  if (audio.on) syncSpace();
  if (reduce) paint();
}

function pickBird(clientX, clientY) {
  const canvas = $('#field');
  const rect = canvas.getBoundingClientRect();
  const cam = look();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const points = [];
  const owners = [];
  const out = { x: 0, y: 0, f: 0, z: 0 };
  for (let i = 0; i < birds.length; i += 1) {
    const pos = renderPoint(birds[i], alpha);
    const dots = birds[i].dots;
    for (let s = 0; s <= dots.length; s += 1) {
      const dot = s === 0 ? null : dots[s - 1];
      const ox = dot ? dot.ox * PUFF : 0;
      const oy = dot ? dot.oy * PUFF : 0;
      const oz = dot ? dot.oz * PUFF : 0;
      if (!projectXYZ(pos.x + ox, pos.y + oy, pos.z + oz, cam, rect.width, rect.height, out)) {
        points.push(null);
      } else {
        points.push({ x: out.x, y: out.y, r: Math.max(PICK_RADIUS, out.f * 0.12) });
      }
      owners.push(i);
    }
  }
  const found = pickNearest(points, x, y, PICK_RADIUS);
  applyFocus(found < 0 ? -1 : owners[found]);
  if (audio.on) syncSpace();
  if (reduce) paint();
}

function pinchSpan() {
  const pts = [...pointers.values()];
  if (pts.length < 2) return 0;
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

function setZoom(next) {
  view.dist = clamp(next, ZOOM_MIN, ZOOM_MAX);
  if (audio.on) syncSpace();
  if (reduce) paint();
}

function pointerPlace(event, prev) {
  if (prev && event.clientX === 0 && event.clientY === 0) return { x: prev.x, y: prev.y };
  return { x: event.clientX, y: event.clientY };
}

function endPointer(event) {
  const prev = pointers.get(event.pointerId);
  pointers.delete(event.pointerId);
  if (!prev) return;
  if (pointers.size === 0) {
    view.finger = null;
    const at = pointerPlace(event, prev);
    const moved = Math.hypot(at.x - prev.ox, at.y - prev.oy);
    const tap = !pinching && !prev.dragged && moved <= TAP_SLOP && performance.now() - prev.t < TAP_MS;
    pinching = false;
    pinchDist = 0;
    if (tap) pickBird(at.x, at.y);
    else if (reduce) paint();
  } else if (pointers.size === 1) {
    pinchDist = 0;
    const left = [...pointers.values()][0];
    left.dragged = true;
    left.ox = left.x;
    left.oy = left.y;
  }
}

const field = $('#field');

field.addEventListener('pointerdown', (event) => {
  pointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
    ox: event.clientX,
    oy: event.clientY,
    t: performance.now(),
    dragged: false,
  });
  try { field.setPointerCapture(event.pointerId); } catch { /* the point still lands */ }
  if (pointers.size >= 2) {
    pinching = true;
    view.finger = null;
    for (const item of pointers.values()) item.dragged = true;
    pinchDist = pinchSpan();
  }
});
field.addEventListener('pointermove', (event) => {
  const prev = pointers.get(event.pointerId);
  if (!prev) return;
  const dx = event.clientX - prev.x;
  const dy = event.clientY - prev.y;
  prev.x = event.clientX;
  prev.y = event.clientY;
  if (pointers.size >= 2 || pinching) {
    pinching = true;
    prev.dragged = true;
    const span = pinchSpan();
    if (pinchDist > 8 && span > 8) setZoom(view.dist * (pinchDist / span));
    pinchDist = span || pinchDist;
    view.finger = null;
    return;
  }
  if (Math.hypot(event.clientX - prev.ox, event.clientY - prev.oy) > TAP_SLOP) prev.dragged = true;
  if (prev.dragged) point(event, dx, dy);
});
field.addEventListener('pointerup', endPointer);
field.addEventListener('pointercancel', endPointer);
field.addEventListener('wheel', (event) => {
  event.preventDefault();
  const line = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 140 : 1;
  const gain = event.ctrlKey ? 0.01 : 0.0015;
  setZoom(view.dist * Math.exp(event.deltaY * line * gain));
}, { passive: false });
field.addEventListener('gesturestart', (event) => {
  event.preventDefault();
  gestureZoom = view.dist;
  pinching = true;
});
field.addEventListener('gesturechange', (event) => {
  event.preventDefault();
  const scale = event.scale || 1;
  setZoom(gestureZoom / scale);
});
field.addEventListener('gestureend', (event) => {
  event.preventDefault();
  pinching = pointers.size >= 2;
});
field.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 0.08 : 0.04;
  if (event.key === 'ArrowRight') view.yaw += step;
  else if (event.key === 'ArrowLeft') view.yaw -= step;
  else if (event.key === 'ArrowUp') view.pitch = clamp(view.pitch + step, -0.5, 0.85);
  else if (event.key === 'ArrowDown') view.pitch = clamp(view.pitch - step, -0.5, 0.85);
  else if (event.key === '+' || event.key === '=') setZoom(view.dist * 0.92);
  else if (event.key === '-' || event.key === '_') setZoom(view.dist * 1.08);
  else return;
  event.preventDefault();
  paint();
});

$('#play').addEventListener('click', play);
$('#volume').addEventListener('input', () => {
  if (!audio.on || !audio.master || !audio.ctx) return;
  audio.master.gain.setTargetAtTime(volumeGain(), audio.ctx.currentTime, 0.03);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hide();
  else show();
});
window.addEventListener('pagehide', hide);
reduceQuery.addEventListener('change', () => {
  reduce = reduceQuery.matches;
  paint();
});
addEventListener('resize', paint);
paint();
