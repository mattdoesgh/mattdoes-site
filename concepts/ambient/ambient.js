// Seven spatial voices inside a flock. Nothing is audible until play.
// Stop ramps the master to silence, drops every oscillator, and will not
// schedule another one for that play.

import {
  VOICE_COUNT,
  createFlock,
  createVoiceBook,
  shouldSchedule,
  stepFlock,
} from '../flock-model.js';

const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduce = reduceQuery.matches;
const book = createVoiceBook();
const birds = createFlock();
const periods = [21, 17, 25, 18, 31, 19.6, 22];
const tightChord = [130.81, 196, 261.63, 311.13, 392];
const openChord = [174.61, 207.65, 261.63, 277.18, 349.23, 415.3];

const view = { yaw: 0.4, pitch: 0.18, finger: null };
const audio = { ctx: null, master: null, on: false };
let graph = null;
let clock = 0;
let raf = 0;
let hidden = false;
let retire = [];
let cohesion = 0.5;

const $ = (sel) => document.querySelector(sel);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function colors() {
  const style = getComputedStyle(document.documentElement);
  return {
    pink: style.getPropertyValue('--pink').trim(),
    black: style.getPropertyValue('--black').trim(),
  };
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

function env(ctx, time, peak, attack, release) {
  const g = ctx.createGain();
  const level = Math.max(peak, 0.001);
  const hold = release * 0.45;
  const tail = Math.max(0.02, release - hold);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(level, time + Math.max(attack, 0.012));
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
    for (const node of [voice.filter, voice.panner, voice.dry, voice.send]) {
      try { node.disconnect(); } catch { /* gone */ }
    }
  }
  for (const node of [g.fb, g.delay, g.wet, g.verb, g.send, g.subGain]) {
    try { node.disconnect(); } catch { /* gone */ }
  }
}

function silence() {
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
  const dist = 4.3;
  const eye = { x: sy * cp * dist, y: sp * dist * 0.85, z: cy * cp * dist };
  const fl = Math.hypot(eye.x, eye.y, eye.z) || 1;
  const forward = { x: -eye.x / fl, y: -eye.y / fl, z: -eye.z / fl };
  let rx = -forward.z;
  let rz = forward.x;
  const rl = Math.hypot(rx, rz) || 1;
  const right = { x: rx / rl, y: 0, z: rz / rl };
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  return { eye, forward, right, up };
}

function project(p, cam, w, h) {
  const dx = p.x - cam.eye.x;
  const dy = p.y - cam.eye.y;
  const dz = p.z - cam.eye.z;
  const x = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const y = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  const z = dx * cam.forward.x + dy * cam.forward.y + dz * cam.forward.z;
  if (z < 0.2) return null;
  const f = (h * 0.52) / z;
  return { x: w * 0.5 + x * f, y: h * 0.5 - y * f, f, z };
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

function syncSpace() {
  if (!audio.on || !graph || !audio.ctx) return;
  const cam = look();
  const t = audio.ctx.currentTime;
  try { placeListener(audio.ctx, cam, t); } catch { /* older listener */ }
  let distSum = 0;
  for (let i = 0; i < VOICE_COUNT; i += 1) {
    const bird = birds[i];
    const voice = graph.voices[i];
    const speed = Math.hypot(bird.vx, bird.vy, bird.vz);
    const bright = clamp(240 + speed * 3400 + bird.turn * 2200, 180, 5200);
    glide(voice.filter.frequency, bright, t);
    glide(voice.panner.positionX, bird.x * 2, t);
    glide(voice.panner.positionY, bird.y * 2, t);
    glide(voice.panner.positionZ, bird.z * 2, t);
    const dist = Math.hypot(bird.x, bird.y, bird.z);
    distSum += dist;
    const density = clamp(bird.near / 6, 0, 1);
    glide(voice.send.gain, 0.04 + dist * 0.12 + (1 - density) * 0.08, t);
  }
  const mean = distSum / VOICE_COUNT;
  glide(graph.delay.delayTime, clamp(0.18 + mean * 0.28, 0.12, 0.9), t);
  glide(graph.fb.gain, clamp(0.12 + (1 - cohesion) * 0.28, 0.08, 0.46), t);
  glide(graph.wet.gain, clamp(0.18 + mean * 0.22, 0.12, 0.7), t);
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
  const end = time + attack + release + 0.08;
  osc.start(time);
  osc.stop(end);
  osc.onended = () => book.drop(entry);
  voice.until = end;
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
  delay.delayTime.value = 0.34;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 1400;
  const fb = ctx.createGain();
  fb.gain.value = 0.22;
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
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

  const voices = [];
  for (let i = 0; i < VOICE_COUNT; i += 1) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 0.9;
    panner.maxDistance = 24;
    panner.rolloffFactor = 1.15;
    const dry = ctx.createGain();
    dry.gain.value = 0.82;
    const room = ctx.createGain();
    room.gain.value = 0.16;
    filter.connect(panner);
    panner.connect(dry);
    dry.connect(audio.master);
    panner.connect(room);
    room.connect(send);
    voices.push({ filter, panner, dry, send: room, until: 0 });
  }

  const sub = ctx.createOscillator();
  const sub2 = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub2.type = 'sine';
  sub.frequency.value = 55;
  sub2.frequency.value = 55.35;
  subGain.gain.setValueAtTime(0.0001, t0);
  subGain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.6);
  sub.connect(subGain);
  sub2.connect(subGain);
  subGain.connect(audio.master);
  sub.start(t0);
  sub2.start(t0);
  book.track({ node: sub, start: t0 }, gen);
  book.track({ node: sub2, start: t0 }, gen);

  graph = { voices, delay, damp, fb, wet, verb, send, subGain, impulseTimer: 0 };
  const next = periods.map((period, i) => t0 + (period % 5) * 0.17 + i * 0.05);
  clock = setInterval(() => {
    if (!shouldSchedule(book, gen) || !audio.ctx || !graph) return;
    const now = audio.ctx.currentTime;
    const horizon = now + 0.28;
    const tight = cohesion > 0.58;
    for (let i = 0; i < VOICE_COUNT; i += 1) {
      const voice = graph.voices[i];
      if (next[i] > horizon || voice.until > now + 0.05) continue;
      const bird = birds[i];
      const height = clamp((bird.y + 1.5) / 3, 0, 1);
      const pool = tight ? tightChord : openChord;
      const freq = pool[Math.min(pool.length - 1, Math.round(height * (pool.length - 1)))];
      const density = clamp(0.35 + bird.near / 8, 0.35, 1);
      const peak = (tight ? 0.04 : 0.022) * density;
      const dur = tight ? 1.5 + height * 0.8 : 0.09 + (1 - cohesion) * 0.05;
      const attack = tight ? 0.35 : 0.012;
      tone(voice, Math.max(next[i], now + 0.02), freq, peak, attack, dur, tight ? 'sine' : 'triangle', gen);
      const gap = tight ? 0.7 + periods[i] * 0.025 : periods[i] * 0.22;
      next[i] += gap;
      if (next[i] < now) next[i] = now + gap;
    }
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
  return { w, h };
}

function draw() {
  const canvas = $('#field');
  const { w, h } = fit(canvas);
  const g = canvas.getContext('2d');
  const { pink, black } = colors();
  const cam = look();
  g.fillStyle = black;
  g.fillRect(0, 0, w, h);
  g.fillStyle = pink;
  const time = reduce ? 0 : performance.now() * 0.001;
  const order = birds.map((bird, index) => ({ bird, index, depth: 0 }));
  for (const item of order) {
    const p = project(item.bird, cam, w, h);
    item.depth = p ? p.z : 999;
    item.p = p;
  }
  order.sort((a, b) => b.depth - a.depth);
  for (const item of order) {
    if (!item.p) continue;
    const bird = item.bird;
    const scatter = 0.05 + (1 - cohesion) * 0.16 + (1 - clamp(bird.near / 7, 0, 1)) * 0.06;
    for (let k = 0; k < bird.dots.length; k += 1) {
      const dot = bird.dots[k];
      const wobble = reduce ? 0 : Math.sin(time * 2.4 + item.index * 1.7 + k) * 0.025;
      const p = project({
        x: bird.x + dot.ox * scatter + wobble,
        y: bird.y + dot.oy * scatter,
        z: bird.z + dot.oz * scatter * 0.8,
      }, cam, w, h);
      if (!p) continue;
      const radius = clamp(p.f * (0.018 + scatter * 0.04), 1.1, 7);
      g.globalAlpha = clamp(0.35 + p.f * 0.45, 0.25, 1);
      g.beginPath();
      g.arc(p.x, p.y, radius, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
}

function frame(now) {
  raf = 0;
  if (hidden) return;
  const dt = Math.min(0.05, (now - (frame.last || now)) / 1000 || 0.016);
  frame.last = now;
  if (!reduce) {
    view.yaw += dt * 0.16;
    const state = stepFlock(birds, dt, view.finger, false);
    cohesion = state.cohesion;
    if (audio.on) syncSpace();
    draw();
    raf = requestAnimationFrame(frame);
    return;
  }
  const state = stepFlock(birds, dt, view.finger, true);
  cohesion = state.cohesion;
  draw();
}

function paint() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (hidden) return;
  if (reduce) {
    const state = stepFlock(birds, 0, view.finger, true);
    cohesion = state.cohesion;
    draw();
    return;
  }
  raf = requestAnimationFrame(frame);
}

function point(event) {
  const canvas = $('#field');
  const rect = canvas.getBoundingClientRect();
  const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  const cam = look();
  const span = 1.35;
  view.finger = {
    x: cam.right.x * nx * span + cam.up.x * ny * span * 0.8,
    y: cam.right.y * nx * span + cam.up.y * ny * span * 0.8,
    z: cam.right.z * nx * span + cam.up.z * ny * span * 0.8,
  };
  view.yaw += (event.movementX || 0) * 0.0025;
  view.pitch = clamp(view.pitch + (event.movementY || 0) * -0.0015, -0.35, 0.7);
  if (reduce) paint();
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
function release() {
  dragging = false;
  view.finger = null;
}
field.addEventListener('pointerup', release);
field.addEventListener('pointercancel', release);
field.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 0.08 : 0.04;
  if (event.key === 'ArrowRight') view.yaw += step;
  else if (event.key === 'ArrowLeft') view.yaw -= step;
  else if (event.key === 'ArrowUp') view.pitch = clamp(view.pitch + step, -0.35, 0.7);
  else if (event.key === 'ArrowDown') view.pitch = clamp(view.pitch - step, -0.35, 0.7);
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
