// Concept only. Not part of the site build.
// Every sound is synthesized here. There are no audio files.

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const style = getComputedStyle(document.documentElement);
const PINK = style.getPropertyValue('--pink').trim();
const BLACK = style.getPropertyValue('--black').trim();

const BPM = 160;
const STEPS = 16;
const STEP = 60 / BPM / 4;

const audio = {
  ctx: null,
  master: null,
  limiter: null,
  name: '',
  stop: null,
};

const patterns = {
  kick: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0],
  hat: [0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1],
  bass: [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
};

// The speaker demo keeps this loop. Toggles on the timing grid do not change it.
const loop = {
  kick: [...patterns.kick],
  hat: [...patterns.hat],
  bass: [...patterns.bass],
};

const SPEAKERS = {
  phone: {
    gain: 1.65,
    drive: 3.4,
    wet: 0,
    room: 0.15,
    filters: [
      ['highpass', 760, 0.7, 0],
      ['peaking', 1700, 1.6, 8],
      ['peaking', 3200, 1.1, 2],
      ['highshelf', 5400, 0.7, -12],
    ],
  },
  laptop: {
    gain: 1.2,
    drive: 1.15,
    wet: 0.08,
    room: 0.35,
    filters: [
      ['highpass', 170, 0.7, 0],
      ['lowshelf', 140, 0.7, -7],
      ['peaking', 520, 1.15, 5.5],
      ['highshelf', 7000, 0.7, -2],
    ],
  },
  earbuds: {
    gain: 1,
    drive: 1,
    wet: 0,
    room: 0.2,
    filters: [
      ['highpass', 32, 0.7, 0],
      ['lowshelf', 100, 0.7, 3],
      ['peaking', 280, 1, -2],
      ['highshelf', 4500, 0.7, 3.5],
    ],
  },
  club: {
    gain: 0.82,
    drive: 1.7,
    wet: 0.22,
    room: 1.5,
    filters: [
      ['highpass', 28, 0.7, 0],
      ['lowshelf', 58, 0.7, 8],
      ['peaking', 280, 0.85, -4],
      ['highshelf', 8000, 0.7, 1.5],
    ],
  },
};

let noiseBuf = null;
let speaker = 'phone';
let voice = 'kick';
let filterPos = { x: 0.32, y: 0.62 };
let waveBuf = null;
let raf = 0;
let waveTimer = 0;
const stepButtons = [];

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function read(demo, name) {
  const el = $(`#${demo} [data-param="${name}"]`);
  return el ? Number(el.value) : 0;
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
  master.gain.value = volumeGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -16;
  limiter.knee.value = 4;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.22;
  master.connect(limiter);
  limiter.connect(ctx.destination);
  audio.ctx = ctx;
  audio.master = master;
  audio.limiter = limiter;
  ctx.resume();
  return ctx;
}

function noise(ctx) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function impulse(ctx, seconds, decay) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  const curve = 0.45 + (1 - decay) * 3.1;
  for (let c = 0; c < 2; c += 1) {
    const data = buffer.getChannelData(c);
    let prev = 0;
    for (let i = 0; i < len; i += 1) {
      const n = Math.random() * 2 - 1;
      prev = prev * 0.88 + n * 0.12;
      const t = i / len;
      data[i] = prev * (1 - t) ** curve;
    }
  }
  return buffer;
}

function shaper(drive) {
  const n = 256;
  const curve = new Float32Array(n);
  const k = Math.max(drive, 0.01);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k) / norm;
  }
  return curve;
}

function envGain(ctx, time, peak, attack, release) {
  const g = ctx.createGain();
  const v = Math.max(peak, 0.001);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(v, time + attack);
  g.gain.exponentialRampToValueAtTime(0.001, time + attack + release);
  return g;
}

function trigKick(time, vel, dest) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  const g = envGain(ctx, time, 0.82 * vel, 0.004, 0.26);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(170, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.06);
  osc.connect(g);
  g.connect(dest);
  osc.start(time);
  osc.stop(time + 0.32);

  const src = ctx.createBufferSource();
  const hp = ctx.createBiquadFilter();
  const click = envGain(ctx, time, 0.2 * vel, 0.001, 0.016);
  src.buffer = noise(ctx);
  hp.type = 'highpass';
  hp.frequency.value = 2000;
  src.connect(hp);
  hp.connect(click);
  click.connect(dest);
  src.start(time);
  src.stop(time + 0.03);
}

function trigHat(time, vel, dest) {
  const ctx = audio.ctx;
  const src = ctx.createBufferSource();
  const hp = ctx.createBiquadFilter();
  const g = envGain(ctx, time, 0.11 * vel, 0.001, 0.038);
  src.buffer = noise(ctx);
  hp.type = 'highpass';
  hp.frequency.value = 6500;
  src.connect(hp);
  hp.connect(g);
  g.connect(dest);
  src.start(time);
  src.stop(time + 0.05);
}

function trigBass(time, vel, dest) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  const g = envGain(ctx, time, 0.5 * vel, 0.006, 0.1);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(62, time);
  osc.frequency.exponentialRampToValueAtTime(43.65, time + 0.045);
  osc.connect(g);
  g.connect(dest);
  osc.start(time);
  osc.stop(time + 0.16);
}

function humanAmount() {
  const el = $('#human');
  return el ? Number(el.value) : 0;
}

function hitWhen(base, step, human) {
  const swing = step % 2 === 1 ? STEP * 0.42 * human : 0;
  const jitter = (Math.random() * 2 - 1) * 0.014 * human;
  return Math.max(audio.ctx.currentTime + 0.004, base + swing + jitter);
}

function hitVel(human) {
  if (human <= 0.001) return 0.9;
  const spread = 0.62 * human;
  return clamp(0.92 - spread * 0.5 + Math.random() * spread, 0.22, 1);
}

function flourishOn(step, bar) {
  if ($('#flourish').getAttribute('aria-pressed') !== 'true') return false;
  return bar % 2 === 1 && step >= 8;
}

function kickSounds(step, bar) {
  if (flourishOn(step, bar)) return step === 8 || step === 11 || step === 14;
  return patterns.kick[step] === 1;
}

function clock(tick) {
  const ctx = audio.ctx;
  let step = 0;
  let next = ctx.currentTime + 0.06;
  let dead = false;
  const id = setInterval(() => {
    if (dead) return;
    const horizon = ctx.currentTime + 0.16;
    while (next < horizon) {
      tick(next, step);
      next += STEP;
      step = (step + 1) % STEPS;
    }
  }, 25);
  return () => {
    dead = true;
    clearInterval(id);
  };
}

function halt() {
  if (audio.stop) audio.stop();
  audio.stop = null;
  audio.name = '';
  document.querySelectorAll('.play[aria-pressed="true"]').forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    const demo = button.dataset.demo;
    button.setAttribute('aria-label', `play ${demo}`);
  });
  stepButtons.forEach((button) => button.classList.remove('is-now'));
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  clearTimeout(waveTimer);
  waveTimer = 0;
  const ambientViz = $('#ambient-viz');
  if (ambientViz) drawIdle(ambientViz);
}

function occupy(name, stop) {
  halt();
  audio.name = name;
  audio.stop = stop;
  const button = $(`.play[data-demo="${name}"]`);
  button.setAttribute('aria-pressed', 'true');
  button.setAttribute('aria-label', `stop ${name}`);
}

function ambientParams() {
  const cutoff = 140 * 18 ** read('ambient', 'cutoff');
  return {
    detune: read('ambient', 'detune'),
    cutoff,
    size: 0.5 + read('ambient', 'size') * 4.2,
    decay: read('ambient', 'decay'),
    lfo: 0.02 + read('ambient', 'lfo') ** 1.4 * 0.45,
    depth: cutoff * 0.42,
  };
}

let ambientNodes = null;
let impulseTimer = 0;

function applyAmbient(live) {
  if (!ambientNodes) return;
  const p = ambientParams();
  const { oscs, filter, lfo, lfoGain, verb, dry, wet } = ambientNodes;
  const spread = [-1, -0.35, 0.55, 1];
  oscs.forEach((osc, i) => {
    osc.detune.setTargetAtTime(spread[i] * p.detune, audio.ctx.currentTime, 0.03);
  });
  filter.frequency.setTargetAtTime(p.cutoff, audio.ctx.currentTime, 0.04);
  lfo.frequency.setTargetAtTime(p.lfo, audio.ctx.currentTime, 0.05);
  lfoGain.gain.setTargetAtTime(p.depth, audio.ctx.currentTime, 0.05);
  const wetMix = 0.18 + read('ambient', 'size') * 0.62;
  dry.gain.setTargetAtTime(1 - wetMix * 0.85, audio.ctx.currentTime, 0.03);
  wet.gain.setTargetAtTime(wetMix, audio.ctx.currentTime, 0.03);
  if (!live) return;
  clearTimeout(impulseTimer);
  impulseTimer = setTimeout(() => {
    if (audio.name === 'ambient' && ambientNodes) {
      verb.buffer = impulse(audio.ctx, p.size, p.decay);
    }
  }, 140);
}

function startAmbient() {
  const ctx = ensure();
  const p = ambientParams();
  const bus = ctx.createGain();
  bus.gain.value = 0.9;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = p.cutoff;
  filter.Q.value = 0.55;
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, p.size, p.decay);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = p.lfo;
  lfoGain.gain.value = p.depth;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();
  const freqs = [110, 110, 164.81, 55];
  const types = ['triangle', 'triangle', 'triangle', 'sine'];
  const levels = [0.08, 0.07, 0.045, 0.2];
  const oscs = freqs.map((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = types[i];
    osc.frequency.value = freq;
    g.gain.value = levels[i];
    osc.connect(g);
    g.connect(filter);
    osc.start();
    return osc;
  });
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.78;
  filter.connect(analyser);
  analyser.connect(dry);
  analyser.connect(verb);
  verb.connect(wet);
  dry.connect(bus);
  wet.connect(bus);
  bus.connect(audio.master);
  waveBuf = new Uint8Array(analyser.fftSize);
  ambientNodes = { oscs, filter, lfo, lfoGain, verb, dry, wet, analyser, bus };
  applyAmbient(false);
  const nodes = [...oscs, lfo];
  occupy('ambient', () => {
    ambientNodes = null;
    const t = ctx.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + 0.04);
    setTimeout(() => {
      nodes.forEach((node) => { try { node.stop(); } catch { /* stopped */ } });
      try { bus.disconnect(); } catch { /* gone */ }
    }, 50);
  });
  paintAmbient();
}

function speakerSpec() {
  return SPEAKERS[speaker];
}

let speakerNodes = null;

function tuneSpeaker() {
  if (!speakerNodes) return;
  const spec = speakerSpec();
  speakerNodes.filters.forEach((filter, i) => {
    const [type, freq, q, gain] = spec.filters[i];
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    filter.gain.value = gain;
  });
  speakerNodes.drive.curve = shaper(spec.drive);
  speakerNodes.out.gain.value = spec.gain;
  speakerNodes.wet.gain.value = spec.wet;
  if (speakerNodes.verb.buffer == null || speakerNodes.room !== spec.room) {
    speakerNodes.verb.buffer = impulse(audio.ctx, spec.room, 0.55);
    speakerNodes.room = spec.room;
  }
  drawResponse(speakerNodes.filters, $('#speaker-viz'));
}

function startSpeakers() {
  const ctx = ensure();
  const filters = [0, 1, 2, 3].map(() => ctx.createBiquadFilter());
  for (let i = 0; i < filters.length - 1; i += 1) filters[i].connect(filters[i + 1]);
  const drive = ctx.createWaveShaper();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const verb = ctx.createConvolver();
  const out = ctx.createGain();
  filters[3].connect(drive);
  drive.connect(dry);
  drive.connect(verb);
  verb.connect(wet);
  dry.connect(out);
  wet.connect(out);
  out.connect(audio.master);
  speakerNodes = { filters, drive, dry, wet, verb, out, room: -1 };
  tuneSpeaker();
  const input = filters[0];
  const stopClock = clock((time, step) => {
    if (loop.kick[step]) trigKick(time, 0.95, input);
    if (loop.hat[step]) trigHat(time, 0.85, input);
    if (loop.bass[step]) trigBass(time, 0.9, input);
  });
  occupy('speakers', () => {
    stopClock();
    speakerNodes = null;
    const t = ctx.currentTime;
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.linearRampToValueAtTime(0, t + 0.03);
    setTimeout(() => { try { out.disconnect(); } catch { /* gone */ } }, 40);
  });
}

function markStep(step) {
  stepButtons.forEach((button, i) => button.classList.toggle('is-now', i === step));
}

function startTiming() {
  const ctx = ensure();
  const dest = ctx.createGain();
  dest.gain.value = 0.95;
  dest.connect(audio.master);
  let played = 0;
  const stopClock = clock((base, step) => {
    const bar = Math.floor(played / STEPS);
    played += 1;
    const human = humanAmount();
    const when = hitWhen(base, step, human);
    const vel = hitVel(human);
    if (kickSounds(step, bar)) trigKick(when, vel, dest);
    if (patterns.hat[step]) trigHat(when, vel, dest);
    if (patterns.bass[step]) trigBass(when, vel * 0.95, dest);
    const drawAt = Math.max(0, (when - ctx.currentTime) * 1000);
    setTimeout(() => {
      if (audio.name === 'timing') markStep(step);
    }, drawAt);
  });
  occupy('timing', () => {
    stopClock();
    const t = ctx.currentTime;
    dest.gain.setValueAtTime(dest.gain.value, t);
    dest.gain.linearRampToValueAtTime(0, t + 0.03);
    setTimeout(() => { try { dest.disconnect(); } catch { /* gone */ } }, 40);
  });
}

function filterValues(x, y) {
  const cutoff = 80 * (6400 / 80) ** clamp(x, 0, 1);
  const q = 0.45 + (1 - clamp(y, 0, 1)) * 11.5;
  return { cutoff, q };
}

let filterNode = null;

function pushFilter() {
  const { cutoff, q } = filterValues(filterPos.x, filterPos.y);
  if (filterNode && audio.ctx) {
    const t = audio.ctx.currentTime;
    filterNode.frequency.setTargetAtTime(cutoff, t, 0.012);
    filterNode.Q.setTargetAtTime(q, t, 0.012);
  }
  drawFilter();
}

function startFilter() {
  const ctx = ensure();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  const { cutoff, q } = filterValues(filterPos.x, filterPos.y);
  filter.frequency.value = cutoff;
  filter.Q.value = q;
  const bus = ctx.createGain();
  bus.gain.value = 0.16;
  const oscs = [110, 110].map((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = i === 0 ? -7 : 9;
    osc.connect(filter);
    osc.start();
    return osc;
  });
  const src = ctx.createBufferSource();
  const ng = ctx.createGain();
  src.buffer = noise(ctx);
  src.loop = true;
  ng.gain.value = 0.012;
  src.connect(ng);
  ng.connect(filter);
  src.start();
  filter.connect(bus);
  bus.connect(audio.master);
  filterNode = filter;
  pushFilter();
  occupy('filter', () => {
    filterNode = null;
    const t = ctx.currentTime;
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + 0.03);
    setTimeout(() => {
      oscs.forEach((osc) => { try { osc.stop(); } catch { /* stopped */ } });
      try { src.stop(); } catch { /* stopped */ }
      try { bus.disconnect(); } catch { /* gone */ }
    }, 40);
  });
}

function play(name) {
  ensure();
  if (audio.name === name) {
    halt();
    return;
  }
  if (name === 'ambient') startAmbient();
  else if (name === 'speakers') startSpeakers();
  else if (name === 'timing') startTiming();
  else if (name === 'filter') startFilter();
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

function prep(canvas) {
  const box = fit(canvas);
  const g = canvas.getContext('2d');
  g.fillStyle = BLACK;
  g.fillRect(0, 0, box.w, box.h);
  g.strokeStyle = PINK;
  g.lineWidth = Math.max(2, box.dpr * 1.35);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { g, ...box };
}

function drawIdle(canvas) {
  const { g, w, h } = prep(canvas);
  g.beginPath();
  g.moveTo(0, h / 2);
  g.lineTo(w, h / 2);
  g.stroke();
}

function drawWave() {
  const canvas = $('#ambient-viz');
  if (!ambientNodes || !waveBuf) {
    drawIdle(canvas);
    return;
  }
  const { g, w, h, dpr } = prep(canvas);
  ambientNodes.analyser.getByteTimeDomainData(waveBuf);
  g.beginPath();
  const edge = Math.max(2, dpr);
  for (let i = 0; i < waveBuf.length; i += 1) {
    const x = (i / (waveBuf.length - 1)) * w;
    const amp = (waveBuf[i] - 128) / 128;
    const y = clamp(h / 2 + amp * h * 1.15, edge, h - edge);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
}

function paintAmbient() {
  drawWave();
  if (audio.name !== 'ambient') return;
  if (reduce) {
    clearTimeout(waveTimer);
    waveTimer = setTimeout(() => {
      if (audio.name === 'ambient') drawWave();
    }, 200);
    return;
  }
  raf = requestAnimationFrame(paintAmbient);
}

function magAt(filters, freq) {
  let mag = 1;
  const hz = new Float32Array([freq]);
  const m = new Float32Array(1);
  const p = new Float32Array(1);
  filters.forEach((filter) => {
    filter.getFrequencyResponse(hz, m, p);
    mag *= m[0];
  });
  return mag;
}

function drawResponse(filters, canvas) {
  const box = prep(canvas);
  const { g, w, h, dpr } = box;
  const n = 140;
  const edge = Math.max(2, dpr * 2);
  g.beginPath();
  for (let i = 0; i < n; i += 1) {
    const freq = 20 * 1000 ** (i / (n - 1));
    const db = 20 * Math.log10(Math.max(magAt(filters, freq), 1e-4));
    const x = (i / (n - 1)) * w;
    const y = clamp(h * (1 - (db + 20) / 36), edge, h - edge);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
}

let probeFilters = null;

function probeChain() {
  if (probeFilters) return probeFilters;
  const probe = new OfflineAudioContext(1, 64, 44100);
  probeFilters = [0, 1, 2, 3].map(() => probe.createBiquadFilter());
  return probeFilters;
}

function drawSpeakerCurve() {
  const filters = speakerNodes ? speakerNodes.filters : probeChain();
  if (!speakerNodes) {
    const spec = speakerSpec();
    filters.forEach((filter, i) => {
      const [type, freq, q, gain] = spec.filters[i];
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      filter.gain.value = gain;
    });
  }
  drawResponse(filters, $('#speaker-viz'));
}

function lowpassMag(freq, cutoff, q) {
  const r = freq / Math.max(cutoff, 1);
  const a = 1 - r * r;
  const b = r / Math.max(q, 0.05);
  return 1 / Math.sqrt(a * a + b * b);
}

function drawFilter() {
  const canvas = $('#filter-pad');
  const { g, w, h, dpr } = prep(canvas);
  const { cutoff, q } = filterValues(filterPos.x, filterPos.y);
  const top = h * 0.62;
  g.beginPath();
  const n = 120;
  for (let i = 0; i < n; i += 1) {
    const freq = 20 * 1000 ** (i / (n - 1));
    const db = 20 * Math.log10(Math.max(lowpassMag(freq, cutoff, q), 1e-4));
    const x = (i / (n - 1)) * w;
    const y = top * (1 - (db + 28) / 50);
    if (i) g.lineTo(x, clamp(y, 0, top));
    else g.moveTo(x, clamp(y, 0, top));
  }
  g.stroke();
  const dx = filterPos.x * w;
  const dy = filterPos.y * h;
  const r = Math.max(dpr * 11, w * 0.032);
  g.beginPath();
  g.arc(dx, dy, r, 0, Math.PI * 2);
  g.stroke();
}

function pointFromEvent(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  filterPos.x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  filterPos.y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  pushFilter();
}

function buildSteps() {
  const well = $('#step-grid');
  for (let i = 0; i < STEPS; i += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'step';
    button.dataset.step = String(i);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const on = patterns[voice][i] === 1 ? 0 : 1;
      patterns[voice][i] = on;
      paintSteps();
    });
    well.appendChild(button);
    stepButtons.push(button);
  }
  paintSteps();
}

function paintSteps() {
  stepButtons.forEach((button, i) => {
    const on = patterns[voice][i] === 1;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.setAttribute('aria-label', `${voice} ${on ? 'on' : 'off'}`);
  });
}

function paintAll() {
  if (audio.name === 'ambient' && !reduce) paintAmbient();
  else drawIdle($('#ambient-viz'));
  drawSpeakerCurve();
  drawFilter();
}

document.querySelectorAll('.play').forEach((button) => {
  button.addEventListener('click', () => play(button.dataset.demo));
});

$('#ambient').addEventListener('input', (event) => {
  if (!event.target.matches('[data-param]')) return;
  if (audio.name === 'ambient') applyAmbient(event.target.dataset.param === 'size' || event.target.dataset.param === 'decay');
});

document.querySelectorAll('[data-speaker]').forEach((button) => {
  button.addEventListener('click', () => {
    speaker = button.dataset.speaker;
    document.querySelectorAll('[data-speaker]').forEach((el) => {
      el.setAttribute('aria-pressed', el === button ? 'true' : 'false');
    });
    tuneSpeaker();
    if (!speakerNodes) drawSpeakerCurve();
  });
});

document.querySelectorAll('[data-voice]').forEach((button) => {
  button.addEventListener('click', () => {
    voice = button.dataset.voice;
    document.querySelectorAll('[data-voice]').forEach((el) => {
      el.setAttribute('aria-pressed', el === button ? 'true' : 'false');
    });
    paintSteps();
  });
});

$('#flourish').addEventListener('click', () => {
  const on = $('#flourish').getAttribute('aria-pressed') === 'true';
  $('#flourish').setAttribute('aria-pressed', on ? 'false' : 'true');
});

$('#volume').addEventListener('input', () => {
  if (!audio.master) return;
  audio.master.gain.setTargetAtTime(volumeGain(), audio.ctx.currentTime, 0.02);
});

const pad = $('#filter-pad');
pad.addEventListener('pointerdown', (event) => {
  pad.setPointerCapture(event.pointerId);
  pointFromEvent(event, pad);
});
pad.addEventListener('pointermove', (event) => {
  if (!pad.hasPointerCapture(event.pointerId)) return;
  pointFromEvent(event, pad);
});
pad.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 0.08 : 0.03;
  if (event.key === 'ArrowRight') filterPos.x = clamp(filterPos.x + step, 0, 1);
  else if (event.key === 'ArrowLeft') filterPos.x = clamp(filterPos.x - step, 0, 1);
  else if (event.key === 'ArrowUp') filterPos.y = clamp(filterPos.y - step, 0, 1);
  else if (event.key === 'ArrowDown') filterPos.y = clamp(filterPos.y + step, 0, 1);
  else return;
  event.preventDefault();
  pushFilter();
});

buildSteps();
paintAll();
addEventListener('resize', () => {
  drawSpeakerCurve();
  drawFilter();
  if (audio.name !== 'ambient') drawIdle($('#ambient-viz'));
});
