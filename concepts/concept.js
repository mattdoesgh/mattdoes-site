// Concept mock only. Not imported by the site build.
// Experiments are concepts/experiments.json. Audio is a silent dummy;
// data-src is the media host path a real file would use.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const HEARD = 0.36;

const stage = document.querySelector('#stage');
const concept = document.body.dataset.concept;

const data = await fetch(new URL('./experiments.json', import.meta.url)).then((res) => {
  if (!res.ok) throw new Error(`experiments.json ${res.status}`);
  return res.json();
});

const host = String(data.host || '').replace(/\/$/, '');
const experiments = [...(data.experiments || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));

let silentUrl = '';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function formatDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function srcFor(exp) {
  if (!host || !exp.file) return '';
  return `${host}/${String(exp.file).replace(/^\//, '')}`;
}

function pointsFor(exp) {
  const shape = exp.shape === 'swell' || exp.shape === 'stutter' ? exp.shape : 'spike';
  const count = shape === 'swell' ? 22 : shape === 'stutter' ? 34 : 46;
  let s = (Number(exp.seed) >>> 0) || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const pts = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    let amp = 0;
    if (shape === 'swell') {
      const env = Math.sin(t * Math.PI) ** 0.9;
      const cycles = 2 + (Number(exp.seed) % 3);
      amp = Math.sin(t * Math.PI * cycles) * 0.32 * env + (rnd() - 0.5) * 0.06 * env;
    } else if (shape === 'stutter') {
      const on = rnd() > 0.45;
      amp = on ? (rnd() - 0.5) * (0.45 + rnd() * 0.48) : (rnd() - 0.5) * 0.05;
    } else {
      const kick = i % (4 + (Number(exp.seed) % 3)) === 0;
      amp = kick ? (rnd() > 0.5 ? 0.46 : -0.46) : (rnd() - 0.5) * 0.14;
    }
    const y = Math.min(0.92, Math.max(0.08, 0.5 + amp));
    pts.push([t, y]);
  }
  return pts;
}

function linePath(pts, w, h) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${(p[0] * w).toFixed(2)} ${(p[1] * h).toFixed(2)}`).join(' ');
}

function waveSVG(exp, { stretch }) {
  const w = 100;
  const h = 32;
  const pts = pointsFor(exp);
  const d = linePath(pts, w, h);
  const x = (HEARD * w).toFixed(2);
  const fit = stretch ? 'none' : 'xMidYMid meet';
  const shape = esc(exp.shape || 'spike');
  return `<svg class="wave" data-shape="${shape}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="${fit}" aria-hidden="true">
    <path class="line" d="${d}"></path>
    <path class="heard" d="M${x} 1 L${x} ${h - 1}"></path>
  </svg>`;
}

function metaHTML(exp) {
  const tags = (exp.tags || []).map((tag) => `<span class="tag">${esc(tag)}</span>`).join('');
  return `<time class="time" datetime="${esc(exp.date)}">${esc(formatDate(exp.date))}</time><span class="bpm">${esc(exp.bpm)} bpm</span>${tags}`;
}

function playButton(exp, className) {
  const title = esc(exp.title);
  return `<button type="button" class="${className}" aria-pressed="false" aria-label="play ${title}" data-title="${title}">
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path class="icon-play" d="M4.2 2.2 L13.2 8 L4.2 13.8 Z"></path>
      <path class="icon-pause" d="M3.4 2.2 H6.4 V13.8 H3.4 Z M9.6 2.2 H12.6 V13.8 H9.6 Z"></path>
    </svg>
  </button>`;
}

function playWord(exp) {
  const title = esc(exp.title);
  return `<button type="button" class="play-word" aria-pressed="false" aria-label="play ${title}" data-title="${title}">
    <span class="play-label" aria-hidden="true"><span class="label-play">play</span><span class="label-pause">pause</span></span>
  </button>`;
}

function audioTag(exp) {
  return `<audio preload="none" loop data-src="${esc(srcFor(exp))}" data-file="${esc(exp.file || '')}"></audio>`;
}

function silentWav() {
  const samples = 800;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, 'data');
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i += 1) view.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function dummySrc() {
  if (!silentUrl) silentUrl = silentWav();
  return silentUrl;
}

function stopAll() {
  document.querySelectorAll('audio').forEach((audio) => {
    audio.pause();
  });
  document.querySelectorAll('.is-playing').forEach((el) => el.classList.remove('is-playing'));
  document.querySelectorAll('.play, .play-word').forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    const title = button.dataset.title || '';
    if (title) button.setAttribute('aria-label', `play ${title}`);
  });
}

function playingRoot(button) {
  return button.closest('.log-item, .one, .player-scene');
}

function audioFor(button) {
  const scope = button.closest('.player, .one-play, .player-copy');
  return scope ? scope.querySelector('audio') : null;
}

function togglePlay(button) {
  const audio = audioFor(button);
  const root = playingRoot(button);
  const on = button.getAttribute('aria-pressed') === 'true';
  stopAll();
  if (on || !audio || !root) return;
  if (!audio.src) audio.src = dummySrc();
  audio.loop = true;
  audio.play().catch(() => {});
  button.setAttribute('aria-pressed', 'true');
  const title = button.dataset.title || '';
  if (title) button.setAttribute('aria-label', `pause ${title}`);
  root.classList.add('is-playing');
}

function bindPlays(root) {
  root.querySelectorAll('.play, .play-word').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => togglePlay(button));
  });
}

function renderLog() {
  const items = experiments.map((exp) => `<article class="log-item" aria-labelledby="${esc(exp.slug)}-title">
    <h2 id="${esc(exp.slug)}-title" class="log-title">${esc(exp.title)}</h2>
    <div class="player">
      ${playButton(exp, 'play')}
      ${waveSVG(exp, { stretch: true })}
      ${audioTag(exp)}
    </div>
    <p class="meta">${metaHTML(exp)}</p>
    <p class="note">${esc(exp.note)}</p>
  </article>`).join('');
  stage.innerHTML = `<div class="log-list">${items}</div>`;
  bindPlays(stage);
}

function renderTape() {
  const dialog = document.querySelector('#player');
  const still = document.querySelector('#player-still');
  const title = document.querySelector('#player-title');
  const note = document.querySelector('#player-note');
  const meta = document.querySelector('#player-meta');
  const play = document.querySelector('#player-play');
  const audio = document.querySelector('#player-audio');
  const close = dialog.querySelector('.scene-close');

  const tiles = experiments.map((exp) => `<button type="button" class="tape" data-slug="${esc(exp.slug)}" aria-haspopup="dialog" aria-controls="player" aria-expanded="false" aria-label="${esc(exp.title)}">
    <span class="tape-sketch">${waveSVG(exp, { stretch: false })}</span>
    <span class="tape-name" aria-hidden="true">${esc(exp.title)}</span>
  </button>`).join('');
  stage.innerHTML = `<div class="tape-grid">${tiles}</div>`;

  const bySlug = new Map(experiments.map((exp) => [exp.slug, exp]));

  function open(exp) {
    stopAll();
    stage.querySelectorAll('.tape').forEach((tile) => {
      tile.setAttribute('aria-expanded', tile.dataset.slug === exp.slug ? 'true' : 'false');
    });
    title.textContent = exp.title;
    note.textContent = exp.note;
    meta.innerHTML = metaHTML(exp);
    still.innerHTML = waveSVG(exp, { stretch: true });
    play.dataset.title = exp.title;
    play.setAttribute('aria-label', `play ${exp.title}`);
    play.setAttribute('aria-pressed', 'false');
    audio.removeAttribute('src');
    audio.dataset.src = srcFor(exp);
    audio.dataset.file = exp.file || '';
    dialog.showModal();
    document.documentElement.classList.add('is-locked');
    close.focus();
  }

  stage.addEventListener('click', (event) => {
    const tile = event.target.closest('.tape');
    if (!tile) return;
    const exp = bySlug.get(tile.dataset.slug);
    if (exp) open(exp);
  });

  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    stopAll();
    stage.querySelectorAll('.tape').forEach((tile) => tile.setAttribute('aria-expanded', 'false'));
    document.documentElement.classList.remove('is-locked');
  });
  play.addEventListener('click', () => togglePlay(play));
}

function renderOne() {
  let index = 0;

  function draw() {
    const exp = experiments[index];
    const count = experiments.length;
    const prev = (index - 1 + count) % count;
    const next = (index + 1) % count;
    stage.innerHTML = `<article class="one" aria-labelledby="one-title">
      <div class="one-play">
        ${playWord(exp)}
        ${audioTag(exp)}
      </div>
      <h2 id="one-title" class="one-title">${esc(exp.title)}</h2>
      <p class="note one-note">${esc(exp.note)}</p>
      <p class="meta one-meta">${metaHTML(exp)}</p>
      <div class="one-nav">
        <button type="button" class="step step-prev" data-step="-1" aria-label="previous, ${esc(experiments[prev].title)}">prev</button>
        <button type="button" class="step step-next" data-step="1" aria-label="next, ${esc(experiments[next].title)}">next</button>
      </div>
      ${waveSVG(exp, { stretch: true }).replace('class="wave"', 'class="wave one-wave"')}
    </article>`;
    bindPlays(stage);
  }

  function step(dir) {
    const count = experiments.length;
    if (!count) return;
    stopAll();
    index = (index + dir + count) % count;
    const focusSel = dir < 0 ? '.step-prev' : '.step-next';
    const keepStep = document.activeElement?.classList?.contains('step');
    draw();
    if (keepStep) stage.querySelector(focusSel)?.focus();
  }

  stage.addEventListener('click', (event) => {
    const button = event.target.closest('.step');
    if (!button) return;
    step(Number(button.dataset.step) || 1);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    step(event.key === 'ArrowRight' ? 1 : -1);
  });

  let tracking = null;
  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, a')) return;
    tracking = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  stage.addEventListener('pointerup', (event) => {
    if (!tracking || tracking.id !== event.pointerId) return;
    const dx = event.clientX - tracking.x;
    const dy = event.clientY - tracking.y;
    tracking = null;
    if (Math.abs(dx) < 48 || Math.abs(dy) > Math.abs(dx)) return;
    step(dx < 0 ? 1 : -1);
  });
  stage.addEventListener('pointercancel', () => {
    tracking = null;
  });

  draw();
}

if (concept === 'log') renderLog();
else if (concept === 'tape') renderTape();
else if (concept === 'one') renderOne();
