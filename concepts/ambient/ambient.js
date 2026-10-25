// A flock inside a cube, blown by curl-noise wind. Nothing is audible
// until play. Stop ramps the master to silence and drops every source.

import {
  CUBE,
  DOTS_PER_BIRD,
  FIXED_DT,
  PICK_RADIUS,
  VOICE_COUNT,
  ZOOM_MAX,
  ZOOM_MIN,
  PITCH_MAX,
  createFlock,
  createVoiceBook,
  idleSoloDelay,
  isoScale,
  markovIndex,
  outsideCube,
  pickNearest,
  renderPoint,
  shouldSchedule,
  stepFlock,
  viewBasis,
  windAt,
  writeLattice,
} from '../flock-model.js';

const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduce = reduceQuery.matches;
const book = createVoiceBook();
const birds = createFlock();
// The 2/1 loop ratios, stretched so the swells and the silences are longer.
// A tone stays under a fifth of its loop. Faction intervals only choose pitch.
const periods = [32.55, 26.35, 38.75, 27.9, 48.05, 30.38, 34.1];
const TONE_SHARE = 0.18;
const LOOKAHEAD = 0.45;
const ratios = [1, 2, 1.5, 0.5, 3, 1, 2];
const supportSteps = [1, 1.25, 1.5, 2];
const opposeSteps = [1.066, 1.122, 1.414, 1.498];
const neutralSteps = [1, 1.5, 2];
const supportWalk = [0, 1, -1, 2];
const supportWeight = [6, 3, 3, 1];
const opposeWalk = [2, -2, 3, -3];
const opposeWeight = [2, 2, 4, 4];
const bases = [130.81, 196, 261.63, 174.61, 311.13, 349.23, 415.3];
const tightChord = [130.81, 196, 261.63, 311.13, 392];
const openChord = [174.61, 207.65, 261.63, 277.18, 349.23, 415.3];
const TAP_SLOP = 6;
const TAP_MS = 600;
const YAW_GAIN = 0.0045;
const PITCH_GAIN = 0.0035;
const INERTIA_CAP = 1.1;
const INERTIA_TAU = 0.42;
const MOTE_COUNT = 8;
const PUFF = 0.82;
const BANDS = 8;
const TRAIL = 18;

const view = {
  zoom: 1,
  yaw: 0,
  pitch: 0,
  yawVel: 0,
  pitchVel: 0,
  finger: null,
  focus: null,
  auto: false,
};
let autoAt = 0;
let holdUntil = 0;
const audio = { ctx: null, master: null, on: false };
const pointers = new Map();
const motes = [];
const depth = new Float64Array(birds.length);
const order = new Uint16Array(birds.length);

function makeBands(cap) {
  return Array.from({ length: BANDS }, () => ({
    n: 0,
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    r: new Float32Array(cap),
    x2: new Float32Array(cap),
    y2: new Float32Array(cap),
  }));
}
const dotBands = makeBands(520);
const lineBands = makeBands(800);
const LATTICE_LEVELS = [0.08, 0.16, 0.24, 0.32, 0.4];
const latticeBands = LATTICE_LEVELS.map(() => ({
  n: 0,
  x: new Float32Array(900),
  y: new Float32Array(900),
  x2: new Float32Array(900),
  y2: new Float32Array(900),
}));
const soloLine = {
  n: 0,
  x: new Float32Array(48),
  y: new Float32Array(48),
  x2: new Float32Array(48),
  y2: new Float32Array(48),
};

function bandOf(alpha) {
  const t = Math.min(1, Math.max(0, alpha));
  return Math.min(BANDS - 1, Math.max(0, Math.round(t * (BANDS - 1))));
}

function pushDot(alpha, x, y, r) {
  const band = dotBands[bandOf(alpha)];
  const i = band.n;
  if (i >= band.x.length) return;
  band.x[i] = x;
  band.y[i] = y;
  band.r[i] = r;
  band.n = i + 1;
}

function pushLine(alpha, x, y, x2, y2, solo) {
  const bag = solo ? soloLine : lineBands[bandOf(alpha)];
  const i = bag.n;
  if (i >= bag.x.length) return;
  bag.x[i] = x;
  bag.y[i] = y;
  bag.x2[i] = x2;
  bag.y2[i] = y2;
  bag.n = i + 1;
}

function flushBands(g, lineWidth) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = lineWidth;
  for (let i = 0; i < BANDS; i += 1) {
    const lines = lineBands[i];
    if (!lines.n) continue;
    g.globalAlpha = i / (BANDS - 1);
    g.beginPath();
    for (let k = 0; k < lines.n; k += 1) {
      g.moveTo(lines.x[k], lines.y[k]);
      g.lineTo(lines.x2[k], lines.y2[k]);
    }
    g.stroke();
    lines.n = 0;
  }
  if (soloLine.n) {
    g.globalAlpha = 0.95;
    g.lineWidth = lineWidth * 1.85;
    g.beginPath();
    for (let k = 0; k < soloLine.n; k += 1) {
      g.moveTo(soloLine.x[k], soloLine.y[k]);
      g.lineTo(soloLine.x2[k], soloLine.y2[k]);
    }
    g.stroke();
    soloLine.n = 0;
  }
  for (let i = 0; i < BANDS; i += 1) {
    const dots = dotBands[i];
    if (!dots.n) continue;
    g.globalAlpha = i / (BANDS - 1);
    g.beginPath();
    for (let k = 0; k < dots.n; k += 1) {
      const r = dots.r[k];
      g.moveTo(dots.x[k] + r, dots.y[k]);
      g.arc(dots.x[k], dots.y[k], r, 0, Math.PI * 2);
    }
    g.fill();
    dots.n = 0;
  }
}
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
      prev = prev * 0.93 + (Math.random() * 2 - 1) * 0.07;
      data[i] = prev * (1 - i / len) ** 2.4;
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
  for (const node of [g.fb, g.delay, g.wet, g.verb, g.send, g.subGain, g.noiseGain, g.band, g.lfoGain, g.noiseDry, ...(g.drifts || [])]) {
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
  const basis = viewBasis(view.yaw, view.pitch);
  const dist = 5.4 - view.zoom * 1.15;
  return {
    eye: {
      x: -basis.forward.x * dist,
      y: -basis.forward.y * dist,
      z: -basis.forward.z * dist,
    },
    forward: basis.forward,
    right: basis.right,
    up: basis.up,
  };
}

function projectXYZ(x, y, z, cam, w, h, out) {
  const sx = x * cam.right.x + y * cam.right.y + z * cam.right.z;
  const sy = x * cam.up.x + y * cam.up.y + z * cam.up.z;
  const sz = x * cam.forward.x + y * cam.forward.y + z * cam.forward.z;
  const scale = isoScale(w, h, view.zoom);
  out.x = w * 0.5 + sx * scale;
  out.y = h * 0.5 - sy * scale;
  out.f = scale;
  out.z = 4.2 + sz;
  return out;
}

function glide(param, value, t) {
  param.cancelScheduledValues(t);
  const current = Number.isFinite(param.value) ? param.value : value;
  param.setValueAtTime(current, t);
  param.setTargetAtTime(value, t, 0.32);
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
  return clamp((view.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN), 0, 1);
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

function armAuto(from) {
  autoAt = from + idleSoloDelay() * 1000;
}

function noteActivity() {
  const now = performance.now();
  holdUntil = now + idleSoloDelay() * 1000;
  autoAt = holdUntil;
}

function maybeAuto() {
  const now = performance.now();
  if (!autoAt) armAuto(now);
  if (now < holdUntil || now < autoAt) return;
  let next = Math.floor(Math.random() * birds.length);
  if (next === view.focus) next = (next + 1 + Math.floor(Math.random() * (birds.length - 1))) % birds.length;
  view.auto = true;
  applyFocus(next);
  autoAt = now + idleSoloDelay() * 1000;
  if (reduce) paint();
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
      160 + speed * 90 + close * 140 + gustLevel * 80
      + (mood === 'scatter' ? 60 : 0) + (outside ? 180 : 0),
      120,
      980,
    );
    glide(voice.filter.frequency, bright, t);
    voice.filter.Q.value = outside ? 0.9 : 0.35 + close * 0.35;
    glide(voice.panner.positionX, pos.x, t);
    glide(voice.panner.positionY, pos.y, t);
    glide(voice.panner.positionZ, pos.z, t);
    const dry = (0.18 + close * 0.85) * (hot ? 2.15 : ducked ? 0.22 : 1);
    glide(voice.dry.gain, dry, t);
    const room = clamp(
      0.78 - close * 0.16 + (mood === 'gather' ? 0.04 : 0) + (outside ? 0.04 : 0),
      0.46,
      0.92,
    );
    glide(voice.send.gain, room, t);
    const level = (hot ? 0.05 : ducked ? 0.018 : 0.028) * (0.75 + close * 0.25);
    const side = bird.side || 0;
    const factionLevel = hot ? level : side > 0.25 ? level * 0.85 : side < -0.25 ? level * 0.55 : level * 0.7;
    glide(voice.level.gain, outside ? factionLevel * 1.15 : factionLevel, t);
    const dop = doppler(bird, cam);
    const freq = voice.base * dop * (outside ? 1.12 : 1);
    const index = outside ? 0.1 : 0.015 + gustLevel * 0.02 + (hot ? 0.015 : 0);
    const ratio = !hot && side < -0.25 ? opposeSteps[i % opposeSteps.length] : voice.ratio;
    glide(voice.carrier.frequency, freq, t);
    glide(voice.mod.frequency, Math.max(28, freq * ratio * 0.5), t);
    glide(voice.fm.gain, index * 14, t);
  }
  glide(graph.delay.delayTime, clamp(0.95 + (1 - close) * 0.55, 0.8, 1.7), t);
  glide(graph.fb.gain, clamp(0.24 + (1 - close) * 0.08, 0.18, 0.36), t);
  glide(graph.wet.gain, clamp(0.84 - close * 0.12, 0.62, 0.92), t);
  const wind = 0.0015 + gustLevel * 0.01 + (soloOutside ? 0.004 : 0);
  glide(graph.noiseGain.gain, wind, t);
  glide(graph.noiseDry.gain, wind * (0.22 + close * 0.35), t);
  glide(graph.band.frequency, clamp(120 + gustLevel * 640 + (soloOutside ? 280 : 0), 80, 1600), t);
  glide(graph.band.Q, 0.35 + gustLevel * 0.4, t);
  glide(graph.lfo.frequency, 0.012 + gustLevel * 0.015, t);
  glide(graph.lfoGain.gain, 12 + gustLevel * 22, t);
  markSolo();
}

function tone(voice, time, freq, peak, attack, release, type, gen) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  const g = env(ctx, time, peak, attack, release);
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(voice.filter);
  const entry = { node: osc, start: time };
  if (!book.track(entry, gen)) {
    try { osc.disconnect(); } catch { /* unused */ }
    return;
  }
  osc.start(time);
  osc.stop(time + attack + release + 0.3);
  osc.onended = () => book.drop(entry);
}

function grain(voice, time, freq, peak, rate, gen) {
  if (liveGrains >= 2 || !graph || !audio.ctx) return;
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
  const g = env(ctx, time, peak, 0.08, 0.42);
  src.connect(bp);
  bp.connect(g);
  g.connect(voice.filter);
  const entry = { node: src, start: time };
  if (!book.track(entry, gen)) {
    try { src.disconnect(); } catch { /* unused */ }
    return;
  }
  liveGrains += 1;
  const end = time + 0.55;
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
  const delay = ctx.createDelay(2.4);
  delay.delayTime.value = 1.15;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 720;
  const fb = ctx.createGain();
  fb.gain.value = 0.24;
  const wet = ctx.createGain();
  wet.gain.value = 0.7;
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 8.6);
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
    fm.gain.value = 2;
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
      next: t0 + periods[i] * (0.42 + ((i * 0.13) % 0.36)),
      degree: i % openChord.length,
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
  lfo.frequency.value = 0.015;
  lfoGain.gain.value = 16;
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
  subGain.gain.exponentialRampToValueAtTime(0.05, t0 + 6.5);
  sub.connect(subGain);
  sub2.connect(subGain);
  subGain.connect(audio.master);
  sub.start(t0);
  sub2.start(t0);
  book.track({ node: sub, start: t0 }, gen);
  book.track({ node: sub2, start: t0 }, gen);

  const drifts = [];
  const driftTo = [
    [damp.frequency, 1 / periods[0], 70],
    [delay.delayTime, 1 / periods[2], 0.045],
    [wet.gain, 1 / periods[4], 0.02],
  ];
  for (let i = 0; i < driftTo.length; i += 1) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = driftTo[i][1];
    gain.gain.value = driftTo[i][2];
    osc.connect(gain);
    gain.connect(driftTo[i][0]);
    osc.start(t0);
    book.track({ node: osc, start: t0 }, gen);
    drifts.push(gain);
  }

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
    drifts,
    impulseTimer: 0,
  };
  applyFocus(view.focus);
  clock = setInterval(() => {
    if (!shouldSchedule(book, gen) || !audio.ctx || !graph) return;
    const now = audio.ctx.currentTime;
    let root = graph.voices[0].base;
    for (let i = 0; i < VOICE_COUNT; i += 1) {
      const candidate = voicedBird(graph.voices[i]);
      if (isHot(candidate)) root = graph.voices[i].base;
    }
    for (let i = 0; i < VOICE_COUNT; i += 1) {
      const voice = graph.voices[i];
      if (voice.next > now + LOOKAHEAD) continue;
      const when = Math.max(voice.next, now + 0.03);
      const bird = voicedBird(voice);
      const hot = isHot(bird);
      const outside = hot && outsideCube(bird.x, bird.y, bird.z);
      const local = bird.near >= 2 || mood === 'gather';
      const pool = local ? tightChord : openChord;
      const period = periods[i];
      const toneLen = period * TONE_SHARE;
      const side = bird.side || 0;
      const steps = hot || view.focus == null
        ? null
        : side < -0.2 ? opposeSteps : side > 0.2 ? supportSteps : neutralSteps;
      const walk = steps === opposeSteps ? opposeWalk : supportWalk;
      const weight = steps === opposeSteps ? opposeWeight : supportWeight;
      const span = steps ? steps.length : pool.length;
      voice.degree = markovIndex(voice.degree || 0, walk, weight, span);
      let freq = steps ? root * steps[voice.degree] : pool[voice.degree];
      if (outside) freq *= 1.25;
      voice.base = clamp(freq, 55, 660);
      voice.ratio = steps === opposeSteps ? opposeSteps[voice.degree % opposeSteps.length] : ratios[i];
      voice.next = when + period;
      tone(
        voice,
        when,
        voice.base,
        hot ? 0.028 : 0.012,
        toneLen * 0.42,
        toneLen * 0.5,
        'sine',
        gen,
      );
      const echo = markovIndex(voice.degree, walk, weight, span);
      const echoNote = steps ? root * steps[echo] : pool[echo];
      tone(
        voice,
        when + toneLen * 0.55,
        clamp(outside ? echoNote * 1.25 : echoNote, 110, 660),
        hot ? 0.006 : 0.003,
        0.08,
        0.7,
        'triangle',
        gen,
      );
      const brush = bird.wall > 0.78 && !bird.armed;
      if (bird.wall > 0.78) bird.armed = true;
      if (bird.wall < 0.3) bird.armed = false;
      if (brush || (gustLevel > 0.93 && Math.random() < 0.05)) {
        grain(voice, when + 0.08, clamp(voice.base * 2, 140, 900), 0.006, 0.55 + Math.random() * 0.2, gen);
      }
    }
    if (reduce) syncSpace();
  }, 100);

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
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
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
    mote.x += wind.x * dt * 0.16;
    mote.y += wind.y * dt * 0.16;
    mote.z += wind.z * dt * 0.16;
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

function latticeBand(alpha) {
  let band = 0;
  let best = Infinity;
  for (let i = 0; i < LATTICE_LEVELS.length; i += 1) {
    const dist = Math.abs(LATTICE_LEVELS[i] - alpha);
    if (dist < best) {
      best = dist;
      band = i;
    }
  }
  return band;
}

function drawLattice(g, cam, w, h, lineWidth) {
  const lattice = writeLattice(w, h, view.zoom, view.yaw, view.pitch);
  const pa = { x: 0, y: 0, f: 0, z: 0 };
  const pb = { x: 0, y: 0, f: 0, z: 0 };
  for (let i = 0; i < latticeBands.length; i += 1) latticeBands[i].n = 0;
  for (let i = 0; i < lattice.n; i += 1) {
    projectXYZ(lattice.x[i], lattice.y[i], lattice.z[i], cam, w, h, pa);
    const x1 = pa.x;
    const y1 = pa.y;
    projectXYZ(lattice.x2[i], lattice.y2[i], lattice.z2[i], cam, w, h, pb);
    const bag = latticeBands[latticeBand(lattice.a[i])];
    const n = bag.n;
    if (n >= bag.x.length) continue;
    bag.x[n] = x1;
    bag.y[n] = y1;
    bag.x2[n] = pb.x;
    bag.y2[n] = pb.y;
    bag.n = n + 1;
  }
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = lineWidth;
  for (let i = 0; i < latticeBands.length; i += 1) {
    const bag = latticeBands[i];
    if (!bag.n) continue;
    g.globalAlpha = LATTICE_LEVELS[i];
    g.beginPath();
    for (let k = 0; k < bag.n; k += 1) {
      g.moveTo(bag.x[k], bag.y[k]);
      g.lineTo(bag.x2[k], bag.y2[k]);
    }
    g.stroke();
  }
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
  drawLattice(g, cam, w, h, Math.max(1, (w / cssW) * 1.15));
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
  order.sort((a, b) => depth[b] - depth[a]);
  const dotAt = new Array(DOTS_PER_BIRD);
  let withN = 0;
  let againstN = 0;
  for (let n = 0; n < order.length; n += 1) {
    const index = order[n];
    const bird = birds[index];
    const hot = isHot(bird);
    const outside = hot && outsideCube(bird.x, bird.y, bird.z);
    const side = bird.side || 0;
    if (!hot && side > 0.25) withN += 1;
    else if (!hot && side < -0.25) againstN += 1;
    const pos = renderPoint(bird, alpha);
    if (!bird.trail) bird.trail = [];
    if (hot) {
      const last = bird.trail[bird.trail.length - 1];
      const step = last ? Math.hypot(pos.x - last.x, pos.y - last.y, pos.z - last.z) : 1;
      if (step > 0.045) {
        bird.trail.push({ x: pos.x, y: pos.y, z: pos.z });
        const cap = outside ? TRAIL + 8 : TRAIL;
        if (bird.trail.length > cap) bird.trail.shift();
      }
    } else if (bird.trail.length) {
      bird.trail.shift();
    }
    for (let t = 0; t < bird.trail.length; t += 1) {
      const mark = bird.trail[t];
      if (!projectXYZ(mark.x, mark.y, mark.z, cam, w, h, pa)) continue;
      const along = (t + 1) / bird.trail.length;
      pushDot(along * (outside ? 0.72 : 0.45), pa.x, pa.y, clamp(pa.f * 0.012 * along, 0.8, 4.5));
    }
    const puff = (hot ? 1.05 : side > 0.25 ? 0.92 : side < -0.25 ? 0.74 : 0.86) * (outside ? 1.12 : 1);
    const ink = hot ? 1 : side > 0.25 ? 0.94 : side < -0.25 ? 0.5 : 0.82;
    for (let k = 0; k < bird.dots.length; k += 1) dotAt[k] = null;
    for (let k = 0; k < bird.dots.length; k += 1) {
      const dot = bird.dots[k];
      const wob = reduce ? 0 : Math.sin(shown * 0.32 + index * 0.71 + k * 1.27) * 0.004;
      if (!projectXYZ(
        pos.x + dot.ox * puff + wob,
        pos.y + dot.oy * puff,
        pos.z + dot.oz * puff * 0.85,
        cam,
        w,
        h,
        pa,
      )) continue;
      const fade = 0.55 + 0.45 * clamp(4.4 / pa.z, 0.28, 1);
      const radius = clamp(
        pa.f * (0.01 + 0.006 * fade) * (hot ? 1.55 : side < -0.25 ? 0.85 : 1),
        hot ? 2.2 : 1.45,
        hot ? 15 : 7.5,
      );
      dotAt[k] = { x: pa.x, y: pa.y, z: pa.z, r: radius, fade };
      pushDot(Math.min(1, ink * fade), pa.x, pa.y, radius);
    }
    const edges = bird.edges;
    if (!edges) continue;
    for (let e = 0; e < edges.length; e += 2) {
      const a = dotAt[edges[e]];
      const b = dotAt[edges[e + 1]];
      if (!a || !b) continue;
      const fade = 0.45 + 0.55 * clamp(4.4 / ((a.z + b.z) * 0.5), 0.25, 1);
      pushLine(ink * fade * (hot ? 0.9 : 0.38), a.x, a.y, b.x, b.y, hot);
    }
  }
  flushBands(g, Math.max(1, (w / cssW) * 0.85));
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
  canvas.dataset.with = String(withN);
  canvas.dataset.against = String(againstN);
  canvas.dataset.auto = view.auto ? '1' : '';
  canvas.dataset.yaw = view.yaw.toFixed(3);
  canvas.dataset.pitch = view.pitch.toFixed(3);
  canvas.dataset.zoom = view.zoom.toFixed(3);
  markSolo();
}

function coast(dt) {
  if (reduce || pointers.size > 0) return;
  if (!view.yawVel && !view.pitchVel) return;
  view.yaw += view.yawVel * dt;
  const next = view.pitch + view.pitchVel * dt;
  if (next > PITCH_MAX) {
    view.pitch = PITCH_MAX;
    view.pitchVel = 0;
  } else if (next < -PITCH_MAX) {
    view.pitch = -PITCH_MAX;
    view.pitchVel = 0;
  } else {
    view.pitch = next;
  }
  const damp = Math.exp(-dt / INERTIA_TAU);
  view.yawVel *= damp;
  view.pitchVel *= damp;
  if (Math.abs(view.yawVel) < 0.02) view.yawVel = 0;
  if (Math.abs(view.pitchVel) < 0.02) view.pitchVel = 0;
}

function frame(now) {
  raf = 0;
  if (hidden) return;
  const dt = Math.min(0.05, (now - (lastNow || now)) / 1000 || 0.016);
  lastNow = now;
  coast(dt);
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

function point(event) {
  const canvas = $('#field');
  const rect = canvas.getBoundingClientRect();
  const cam = look();
  const scale = isoScale(rect.width, rect.height, view.zoom);
  const ix = (event.clientX - rect.left - rect.width * 0.5) / scale;
  const iy = -(event.clientY - rect.top - rect.height * 0.5) / scale;
  view.finger = {
    x: cam.right.x * ix + cam.up.x * iy,
    y: cam.right.y * ix + cam.up.y * iy,
    z: cam.right.z * ix + cam.up.z * iy,
  };
  noteActivity();
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
  view.auto = false;
  noteActivity();
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
  view.zoom = clamp(next, ZOOM_MIN, ZOOM_MAX);
  noteActivity();
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
    if (tap || reduce || performance.now() - (prev.moveT || prev.t) > 90) {
      view.yawVel = 0;
      view.pitchVel = 0;
    }
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
    view.yawVel = 0;
    view.pitchVel = 0;
    for (const item of pointers.values()) item.dragged = true;
    pinchDist = pinchSpan();
  }
});
field.addEventListener('pointermove', (event) => {
  const prev = pointers.get(event.pointerId);
  if (!prev) return;
  const dx = event.clientX - prev.x;
  const dy = event.clientY - prev.y;
  const now = performance.now();
  const dt = (now - (prev.moveT || prev.t)) / 1000;
  prev.x = event.clientX;
  prev.y = event.clientY;
  prev.moveT = now;
  if (pointers.size >= 2 || pinching) {
    pinching = true;
    prev.dragged = true;
    view.yawVel = 0;
    view.pitchVel = 0;
    const span = pinchSpan();
    if (pinchDist > 8 && span > 8) setZoom(view.zoom * (span / pinchDist));
    pinchDist = span || pinchDist;
    view.finger = null;
    return;
  }
  if (Math.hypot(event.clientX - prev.ox, event.clientY - prev.oy) > TAP_SLOP) prev.dragged = true;
  if (prev.dragged) {
    view.yaw += dx * YAW_GAIN;
    const nextPitch = view.pitch - dy * PITCH_GAIN;
    if (nextPitch > PITCH_MAX || nextPitch < -PITCH_MAX) view.pitchVel = 0;
    else if (dt > 0.004) view.pitchVel = clamp((nextPitch - view.pitch) / dt, -INERTIA_CAP, INERTIA_CAP);
    view.pitch = clamp(nextPitch, -PITCH_MAX, PITCH_MAX);
    if (dt > 0.004) view.yawVel = clamp((dx * YAW_GAIN) / dt, -INERTIA_CAP, INERTIA_CAP);
    point(event);
  }
});
field.addEventListener('pointerup', endPointer);
field.addEventListener('pointercancel', endPointer);
field.addEventListener('wheel', (event) => {
  event.preventDefault();
  const line = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 140 : 1;
  const gain = event.ctrlKey ? 0.01 : 0.0015;
  setZoom(view.zoom * Math.exp(-event.deltaY * line * gain));
}, { passive: false });
field.addEventListener('gesturestart', (event) => {
  event.preventDefault();
  gestureZoom = view.zoom;
  pinching = true;
});
field.addEventListener('gesturechange', (event) => {
  event.preventDefault();
  const scale = event.scale || 1;
  setZoom(gestureZoom * scale);
});
field.addEventListener('gestureend', (event) => {
  event.preventDefault();
  pinching = pointers.size >= 2;
});
field.addEventListener('keydown', (event) => {
  if (event.key === '+' || event.key === '=') setZoom(view.zoom * 1.04);
  else if (event.key === '-' || event.key === '_') setZoom(view.zoom * 0.96);
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
  if (reduce) {
    view.yawVel = 0;
    view.pitchVel = 0;
  }
  paint();
});
addEventListener('resize', paint);
armAuto(performance.now());
setInterval(() => {
  if (reduce && !hidden) {
    for (let i = 0; i < birds.length; i += 1) birds[i].solo = view.focus === i;
    stepFlock(birds, 1, null, true, simTime);
    simTime += 1;
    paint();
  }
  maybeAuto();
}, 1000);
paint();
