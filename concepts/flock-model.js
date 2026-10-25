// Boids and the voice book. No DOM, so the stop rule can be tested in node.
// A voice scheduled after stop, or against an older play, is refused.

export const BIRD_COUNT = 32;
export const DOTS_PER_BIRD = 5;
export const VOICE_COUNT = 7;
export const PARTICLE_COUNT = BIRD_COUNT * DOTS_PER_BIRD;

const SEP_R = 0.48;
const NEIGHBOR_R = 0.72;
const MAX_SPEED = 0.62;
const MIN_SPEED = 0.07;

/**
 * @returns {{
 *   generation: number,
 *   stopped: boolean,
 *   size: number,
 *   arm: () => number,
 *   track: (voice: object, gen: number) => boolean,
 *   drop: (voice: object) => void,
 *   halt: () => object[],
 * }}
 */
export function createVoiceBook() {
  let generation = 0;
  let stopped = true;
  /** @type {Set<object>} */
  const voices = new Set();
  return {
    get generation() { return generation; },
    get stopped() { return stopped; },
    get size() { return voices.size; },
    arm() {
      stopped = false;
      generation += 1;
      voices.clear();
      return generation;
    },
    track(voice, gen) {
      if (stopped || gen !== generation || voice == null) return false;
      voices.add(voice);
      return true;
    },
    drop(voice) {
      voices.delete(voice);
    },
    halt() {
      stopped = true;
      generation += 1;
      const doomed = [...voices];
      voices.clear();
      return doomed;
    },
  };
}

/**
 * The scheduler asks this before it creates another oscillator.
 *
 * @param {ReturnType<typeof createVoiceBook>} book
 * @param {number} gen
 * @returns {boolean}
 */
export function shouldSchedule(book, gen) {
  return book.stopped === false && book.generation === gen;
}

/**
 * @param {() => number} [random]
 * @returns {object[]}
 */
export function createFlock(random = Math.random) {
  const birds = [];
  for (let i = 0; i < BIRD_COUNT; i += 1) {
    const dots = [];
    for (let d = 0; d < DOTS_PER_BIRD; d += 1) {
      dots.push({
        ox: random() - 0.5,
        oy: random() - 0.5,
        oz: random() - 0.5,
      });
    }
    birds.push({
      x: (random() - 0.5) * 1.6,
      y: (random() - 0.5) * 1.1,
      z: (random() - 0.5) * 1.6,
      vx: (random() - 0.5) * 0.25,
      vy: (random() - 0.5) * 0.25,
      vz: (random() - 0.5) * 0.25,
      turn: 0,
      near: 0,
      lead: i < VOICE_COUNT,
      dots,
    });
  }
  return birds;
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

/**
 * One flock step. Frozen flocks keep their places and still report cohesion.
 * A finger inside the inner radius is a predator. Farther out it attracts.
 *
 * @param {object[]} birds
 * @param {number} dt
 * @param {{ x: number, y: number, z: number } | null} finger
 * @param {boolean} frozen
 * @returns {{ cohesion: number, spread: number }}
 */
export function stepFlock(birds, dt, finger, frozen) {
  const n = birds.length;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i += 1) {
    cx += birds[i].x;
    cy += birds[i].y;
    cz += birds[i].z;
  }
  cx /= n;
  cy /= n;
  cz /= n;
  let spread = 0;
  for (let i = 0; i < n; i += 1) {
    const b = birds[i];
    spread += Math.hypot(b.x - cx, b.y - cy, b.z - cz);
  }
  spread /= n;
  const cohesion = 1 - Math.min(1, spread / 1.15);
  if (frozen) return { cohesion, spread };

  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const az = new Float64Array(n);
  const step = Math.min(Math.max(dt, 0), 0.05);

  for (let i = 0; i < n; i += 1) {
    const b = birds[i];
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let vx = 0;
    let vy = 0;
    let vz = 0;
    let kx = 0;
    let ky = 0;
    let kz = 0;
    let ns = 0;
    let nn = 0;
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const o = birds[j];
      const dx = b.x - o.x;
      const dy = b.y - o.y;
      const dz = b.z - o.z;
      const dist = Math.hypot(dx, dy, dz) || 0.0001;
      if (dist < SEP_R) {
        sx += dx / (dist * dist);
        sy += dy / (dist * dist);
        sz += dz / (dist * dist);
        ns += 1;
      }
      if (dist < NEIGHBOR_R) {
        vx += o.vx;
        vy += o.vy;
        vz += o.vz;
        kx += o.x;
        ky += o.y;
        kz += o.z;
        nn += 1;
      }
    }
    b.near = nn;
    if (ns) {
      ax[i] += sx * 1.35;
      ay[i] += sy * 1.35;
      az[i] += sz * 1.35;
    }
    if (nn) {
      ax[i] += (vx / nn - b.vx) * 0.55;
      ay[i] += (vy / nn - b.vy) * 0.55;
      az[i] += (vz / nn - b.vz) * 0.55;
      ax[i] += (kx / nn - b.x) * 0.32;
      ay[i] += (ky / nn - b.y) * 0.32;
      az[i] += (kz / nn - b.z) * 0.32;
    }
    ax[i] += -b.x * 0.4;
    ay[i] += -b.y * 0.4;
    az[i] += -b.z * 0.4;
    if (finger) {
      const dx = b.x - finger.x;
      const dy = b.y - finger.y;
      const dz = b.z - finger.z;
      const dist = Math.hypot(dx, dy, dz) || 0.0001;
      if (dist < 0.55) {
        const push = (0.55 - dist) * 4.4;
        ax[i] += (dx / dist) * push;
        ay[i] += (dy / dist) * push;
        az[i] += (dz / dist) * push;
      } else if (dist < 1.8) {
        ax[i] += (-dx / dist) * 0.28;
        ay[i] += (-dy / dist) * 0.28;
        az[i] += (-dz / dist) * 0.28;
      }
    }
  }

  for (let i = 0; i < n; i += 1) {
    const b = birds[i];
    const ox = b.vx;
    const oy = b.vy;
    const oz = b.vz;
    b.vx = clamp(b.vx + ax[i] * step, -MAX_SPEED, MAX_SPEED);
    b.vy = clamp(b.vy + ay[i] * step, -MAX_SPEED, MAX_SPEED);
    b.vz = clamp(b.vz + az[i] * step, -MAX_SPEED, MAX_SPEED);
    const speed = Math.hypot(b.vx, b.vy, b.vz) || 0.0001;
    const capped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
    b.vx = (b.vx / speed) * capped;
    b.vy = (b.vy / speed) * capped;
    b.vz = (b.vz / speed) * capped;
    const old = Math.hypot(ox, oy, oz) || 1;
    const dot = (ox * b.vx + oy * b.vy + oz * b.vz) / (old * capped);
    b.turn = 1 - clamp(dot, -1, 1);
    b.x = clamp(b.x + b.vx * step, -2.2, 2.2);
    b.y = clamp(b.y + b.vy * step, -1.6, 1.6);
    b.z = clamp(b.z + b.vz * step, -2.2, 2.2);
  }
  return { cohesion, spread };
}
