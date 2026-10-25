// Seven spatial voices inside a flock. Nothing is audible until play.
// Stop ramps the master to silence, drops every oscillator, and will not
// schedule another one for that play.

import {
  HEX_H,
  VOICE_COUNT,
  ZOOM_MAX,
  ZOOM_MIN,
  createFlock,
  createVoiceBook,
  hexRing,
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

const view = { yaw: 0.4, pitch: 0.22, dist: 3.85, finger: null, focus: null };
const audio = { ctx: null, master: null, on: false };
let graph = null;
let clock = 0;
let raf = 0;
let hidden = false;
let retire = [];
let cohesion = 0.5;
let mood = 'drift';

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
  const dist = view.dist;
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
  if (z < 0.15) return null;
  const basis = Math.max(Math.min(w, h), w * 0.58);
  const f = (basis * 0.86) / z;
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

function closeness() {
  return clamp((ZOOM_MAX - view.dist) / (ZOOM_MAX - ZOOM_MIN), 0, 1);
}

function voicedBird(voice) {
  return birds[voice.bird];
}

function isHot(bird) {
  if (view.focus == null || !bird) return false;
  const focus = birds[view.focus];
  if (bird === focus) return true;
  return Math.hypot(bird.x - focus.x, bird.y - focus.y, bird.z - focus.z) < 0.9;
}

function applyFocus(index) {
  view.focus = index == null || index < 0 ? null : index;
  if (!graph) return;
  for (let i = 0; i < VOICE_COUNT; i += 1) graph.voices[i].bird = i;
  if (view.focus != null && view.focus >= VOICE_COUNT) graph.voices[0].bird = view.focus;
}

function syncSpace() {
  if (!audio.on || !graph || !audio.ctx) return;
  const cam = look();
  const t = audio.ctx.currentTime;
  const close = closeness();
  try { placeListener(audio.ctx, cam, t); } catch { /* older listener */ }
  for (let i = 0; i < VOICE_COUNT; i += 1) {
    const voice = graph.voices[i];
    const bird = voicedBird(voice);
    const speed = Math.hypot(bird.vx, bird.vy, bird.vz);
    const hot = isHot(bird);
    const bright = clamp(
      280 + speed * 2600 + bird.turn * 1600 + close * 2400 + bird.wall * 1800 + (mood === 'scatter' ? 1400 : 0),
      200,
      6800,
    );
    glide(voice.filter.frequency, bright, t);
    voice.filter.Q.value = 0.55 + close * 0.7;
    glide(voice.panner.positionX, bird.x, t);
    glide(voice.panner.positionY, bird.y, t);
    glide(voice.panner.positionZ, bird.z, t);
    const dry = (0.24 + close * 0.9) * (hot ? 1.55 : 1);
    glide(voice.dry.gain, dry, t);
    const room = clamp((0.46 - close * 0.36) + bird.wall * 0.12 + (mood === 'gather' ? -0.06 : 0.04), 0.03, 0.72);
    glide(voice.send.gain, room, t);
  }
  glide(graph.delay.delayTime, clamp(0.14 + (1 - close) * 0.5, 0.1, 0.78), t);
  glide(graph.fb.gain, clamp(0.12 + (1 - close) * 0.26 + (mood === 'scatter' ? 0.06 : 0), 0.08, 0.44), t);
  glide(graph.wet.gain, clamp(0.68 - close * 0.5 + (mood === 'gather' ? -0.08 : 0.04), 0.08, 0.78), t);
}

function tone(voice, time, freq, peak, attack, release, type, gen, bird, hold = true) {
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
  if (hold) voice.until = end;
  if (bird) bird.pulse = 1;
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
    panner.refDistance = 1.15;
    panner.maxDistance = 28;
    panner.rolloffFactor = 0.72;
    const dry = ctx.createGain();
    dry.gain.value = 0.82;
    const room = ctx.createGain();
    room.gain.value = 0.16;
    filter.connect(panner);
    panner.connect(dry);
    dry.connect(audio.master);
    panner.connect(room);
    room.connect(send);
    voices.push({ filter, panner, dry, send: room, until: 0, bird: i });
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
  applyFocus(view.focus);
  const next = periods.map((period, i) => t0 + (period % 5) * 0.17 + i * 0.05);
  clock = setInterval(() => {
    if (!shouldSchedule(book, gen) || !audio.ctx || !graph) return;
    const now = audio.ctx.currentTime;
    const horizon = now + 0.28;
    const close = closeness();
    for (let i = 0; i < VOICE_COUNT; i += 1) {
      const voice = graph.voices[i];
      const bird = voicedBird(voice);
      if (bird.wall > 0.62 && !bird.armed) {
        bird.armed = true;
        bird.pluck = true;
      }
      if (bird.wall < 0.28) bird.armed = false;
      if (bird.pluck && shouldSchedule(book, gen)) {
        bird.pluck = false;
        const height = clamp((bird.y + HEX_H) / (HEX_H * 2), 0, 1);
        const freq = openChord[Math.min(openChord.length - 1, Math.round(height * (openChord.length - 1)))] * 2;
        tone(voice, now + 0.02, freq, 0.016, 0.01, 0.16, 'sine', gen, bird);
      }
      if (next[i] > horizon || voice.until > now + 0.05) continue;
      const hot = isHot(bird);
      const local = bird.near >= 2 || mood === 'gather';
      const scatter = mood === 'scatter';
      if (scatter && !hot && i % 2 === 1) {
        next[i] = now + periods[i] * 0.34;
        continue;
      }
      const height = clamp((bird.y + HEX_H) / (HEX_H * 2), 0, 1);
      const pool = scatter ? openChord : (local ? tightChord : openChord);
      let freq = pool[Math.min(pool.length - 1, Math.round(height * (pool.length - 1)))];
      if (scatter) freq *= 2;
      const density = clamp(0.4 + bird.near / 6, 0.4, 1);
      const swell = local && !scatter;
      const peak = (swell ? 0.045 : 0.02) * density * (hot ? 1.7 : 1);
      const dur = swell ? 1.7 + height * 0.9 : 0.08 + (scatter ? 0.03 : 0.05);
      const attack = swell ? 0.32 : 0.012;
      const when = Math.max(next[i], now + 0.02);
      tone(voice, when, freq, peak, attack, dur, swell ? 'sine' : 'triangle', gen, bird);
      if (close > 0.55) {
        tone(voice, when, freq * 2, peak * 0.2 * close, attack, dur * 0.75, 'sine', gen, null, false);
      }
      const gap = swell ? 0.55 + periods[i] * 0.02 : periods[i] * (scatter ? 0.42 : 0.24);
      next[i] += hot ? gap * 0.62 : gap;
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

function cageDots() {
  const dots = [];
  const top = hexRing(HEX_H);
  const bottom = hexRing(-HEX_H);
  for (const ring of [top, bottom]) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      for (let s = 0; s < 10; s += 1) {
        const t = s / 10;
        dots.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y,
          z: a.z + (b.z - a.z) * t,
        });
      }
    }
  }
  for (let i = 0; i < top.length; i += 1) {
    for (let s = 1; s < 8; s += 1) {
      const t = s / 8;
      dots.push({
        x: top[i].x,
        y: top[i].y + (bottom[i].y - top[i].y) * t,
        z: top[i].z,
      });
    }
  }
  return dots;
}

const cage = cageDots();

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
  const marks = [];
  for (let i = 0; i < cage.length; i += 1) {
    const p = project(cage[i], cam, w, h);
    if (p) marks.push({ p, kind: 'cage' });
  }
  for (let i = 0; i < birds.length; i += 1) {
    const p = project(birds[i], cam, w, h);
    if (p) marks.push({ p, kind: 'bird', index: i });
  }
  if (view.finger) {
    const p = project(view.finger, cam, w, h);
    if (p) marks.push({ p, kind: 'finger' });
  }
  marks.sort((a, b) => b.p.z - a.p.z);
  for (const mark of marks) {
    if (mark.kind === 'cage') {
      const radius = clamp(mark.p.f * 0.012, 0.8, 2.4);
      g.globalAlpha = clamp(0.22 + mark.p.f * 0.08, 0.18, 0.55);
      g.beginPath();
      g.arc(mark.p.x, mark.p.y, radius, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    if (mark.kind === 'finger') {
      const spread = mood === 'scatter' ? 0.16 : 0.05;
      for (let k = 0; k < 4; k += 1) {
        const ang = time * 1.2 + k * 1.57;
        const p = project({
          x: view.finger.x + Math.cos(ang) * spread,
          y: view.finger.y + Math.sin(ang * 1.3) * spread * 0.6,
          z: view.finger.z + Math.sin(ang) * spread,
        }, cam, w, h);
        if (!p) continue;
        g.globalAlpha = mood === 'scatter' ? 0.85 : 0.55;
        g.beginPath();
        g.arc(p.x, p.y, clamp(p.f * 0.02, 1.2, 4), 0, Math.PI * 2);
        g.fill();
      }
      continue;
    }
    const bird = birds[mark.index];
    const hot = isHot(bird);
    const open = mood === 'scatter' ? 0.2 : mood === 'gather' ? 0.04 : 0.08 + (1 - clamp(bird.near / 4, 0, 1)) * 0.07;
    const pulse = bird.pulse || 0;
    for (let k = 0; k < bird.dots.length; k += 1) {
      const dot = bird.dots[k];
      const wobble = reduce ? 0 : Math.sin(time * 2.4 + mark.index * 1.7 + k) * 0.02;
      const puff = open * (1 + pulse * 0.8);
      const p = project({
        x: bird.x + dot.ox * puff + wobble,
        y: bird.y + dot.oy * puff,
        z: bird.z + dot.oz * puff * 0.8,
      }, cam, w, h);
      if (!p) continue;
      const radius = clamp(p.f * (0.016 + puff * 0.05) * (1 + pulse * 0.9 + (hot ? 0.28 : 0)), 1.1, 9);
      g.globalAlpha = clamp(0.32 + p.f * 0.4 + pulse * 0.5 + (hot ? 0.28 : 0), 0.25, 1);
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
  const pointersDown = pointers.size > 0;
  if (!reduce) {
    if (!pointersDown) view.yaw += dt * 0.11;
    const state = stepFlock(birds, dt, view.finger, false);
    cohesion = state.cohesion;
    mood = state.mode;
    for (let i = 0; i < birds.length; i += 1) {
      birds[i].pulse = Math.max(0, birds[i].pulse - dt * 1.35);
    }
    if (audio.on) syncSpace();
    draw();
    raf = requestAnimationFrame(frame);
    return;
  }
  const state = stepFlock(birds, dt, view.finger, true);
  cohesion = state.cohesion;
  mood = state.mode;
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

function pickBird(event) {
  const canvas = $('#field');
  const rect = canvas.getBoundingClientRect();
  const cam = look();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let best = -1;
  let bestD = 36;
  for (let i = 0; i < birds.length; i += 1) {
    const p = project(birds[i], cam, rect.width, rect.height);
    if (!p) continue;
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist < bestD) {
      bestD = dist;
      best = i;
    }
  }
  applyFocus(best);
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

const field = $('#field');
const pointers = new Map();
let pinchDist = 0;
let gestureZoom = 0;
let travel = 0;
let downAt = 0;

field.addEventListener('pointerdown', (event) => {
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  try { field.setPointerCapture(event.pointerId); } catch { /* the point still lands */ }
  if (pointers.size === 1) {
    travel = 0;
    downAt = performance.now();
    pinchDist = 0;
  } else {
    view.finger = null;
    pinchDist = pinchSpan();
    travel = 99;
  }
});
field.addEventListener('pointermove', (event) => {
  const prev = pointers.get(event.pointerId);
  if (!prev) return;
  const dx = event.clientX - prev.x;
  const dy = event.clientY - prev.y;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size >= 2) {
    const span = pinchSpan();
    if (pinchDist > 8 && span > 8) setZoom(view.dist * (pinchDist / span));
    pinchDist = span;
    view.finger = null;
    travel = 99;
    return;
  }
  travel += Math.abs(dx) + Math.abs(dy);
  if (travel > 7) point(event, dx, dy);
});
function release(event) {
  const tap = pointers.size === 1 && travel < 8 && performance.now() - downAt < 420;
  pointers.delete(event.pointerId);
  if (pointers.size === 0) {
    view.finger = null;
    pinchDist = 0;
    if (tap) pickBird(event);
  } else if (pointers.size === 1) {
    pinchDist = 0;
    travel = 99;
  }
}
field.addEventListener('pointerup', release);
field.addEventListener('pointercancel', (event) => {
  pointers.delete(event.pointerId);
  view.finger = null;
  pinchDist = 0;
  travel = 99;
});
field.addEventListener('wheel', (event) => {
  event.preventDefault();
  const line = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 140 : 1;
  const gain = event.ctrlKey ? 0.01 : 0.0015;
  setZoom(view.dist * Math.exp(event.deltaY * line * gain));
}, { passive: false });
field.addEventListener('gesturestart', (event) => {
  event.preventDefault();
  gestureZoom = view.dist;
});
field.addEventListener('gesturechange', (event) => {
  event.preventDefault();
  const scale = event.scale || 1;
  setZoom(gestureZoom / scale);
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
