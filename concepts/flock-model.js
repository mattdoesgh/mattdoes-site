// Boids inside a hexagonal prism. No DOM, so the stop rule and the
// spread of the flock can be tested in node. A voice scheduled after
// stop, or against an older play, is refused.

export const BIRD_COUNT = 32;
export const DOTS_PER_BIRD = 5;
export const VOICE_COUNT = 7;
export const PARTICLE_COUNT = BIRD_COUNT * DOTS_PER_BIRD;
export const GUIDE_COUNT = 4;

// Center-to-flat of the prism, and half its height. Corners sit further out.
export const HEX_R = 2.05;
export const HEX_H = 1.42;
export const ZOOM_MIN = 2.65;
export const ZOOM_MAX = 8.4;

const SEP_R = 0.92;
const ALIGN_R = 1.48;
const COHERE_R = 0.56;
const MAX_SPEED = 0.52;
const MIN_SPEED = 0.1;
const WALL_MARGIN = 0.72;
const FLOOR_MARGIN = 0.48;

const HEX_COS = Math.cos(Math.PI / 6);

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
 * Flat-topped hex, inradius HEX_R. Vertices are further from the center
 * than the flats, so the drawn corners and the steer agree.
 *
 * @param {number} y
 * @returns {{ x: number, y: number, z: number }[]}
 */
export function hexRing(y) {
  const reach = HEX_R / HEX_COS;
  const ring = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI / 6 + (Math.PI / 3) * i;
    ring.push({ x: Math.cos(angle) * reach, y, z: Math.sin(angle) * reach });
  }
  return ring;
}

/**
 * Clearance to the nearest wall. Positive is inside. The normal points out.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{ clearance: number, yClear: number, nx: number, ny: number, nz: number, brush: number }}
 */
export function prismClearance(x, y, z) {
  const normals = [
    [1, 0],
    [0.5, Math.sqrt(3) / 2],
    [-0.5, Math.sqrt(3) / 2],
  ];
  let clearance = Infinity;
  let nx = 1;
  let nz = 0;
  for (let i = 0; i < normals.length; i += 1) {
    const a = normals[i][0];
    const b = normals[i][1];
    const proj = x * a + z * b;
    const gap = HEX_R - Math.abs(proj);
    if (gap < clearance) {
      clearance = gap;
      const sign = proj >= 0 ? 1 : -1;
      nx = a * sign;
      nz = b * sign;
    }
  }
  const yClear = HEX_H - Math.abs(y);
  const ny = y >= 0 ? 1 : -1;
  const sideBrush = Math.max(0, (WALL_MARGIN - clearance) / WALL_MARGIN);
  const floorBrush = Math.max(0, (FLOOR_MARGIN - yClear) / FLOOR_MARGIN);
  return {
    clearance,
    yClear,
    nx,
    ny,
    nz,
    brush: Math.min(1, Math.max(sideBrush, floorBrush)),
  };
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
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * HEX_R * 0.78;
    const speed = 0.16 + random() * 0.2;
    const heading = random() * Math.PI * 2;
    birds.push({
      x: Math.cos(angle) * radius,
      y: (random() - 0.5) * HEX_H * 1.15,
      z: Math.sin(angle) * radius,
      vx: Math.cos(heading) * speed,
      vy: (random() - 0.5) * speed * 0.45,
      vz: Math.sin(heading) * speed,
      turn: 0,
      near: 0,
      lead: i < VOICE_COUNT,
      guide: i % 8 === 0,
      phase: random() * Math.PI * 2,
      wall: 0,
      pulse: 0,
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
 * Walls of the prism push inward. They do not reflect velocity.
 *
 * @param {object[]} birds
 * @param {number} dt
 * @param {{ x: number, y: number, z: number } | null} finger
 * @param {boolean} frozen
 * @returns {{ cohesion: number, spread: number, mode: string }}
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
  const cohesion = 1 - Math.min(1, spread / 1.35);
  let fingerDist = Infinity;
  if (finger) {
    for (let i = 0; i < n; i += 1) {
      const b = birds[i];
      fingerDist = Math.min(fingerDist, Math.hypot(b.x - finger.x, b.y - finger.y, b.z - finger.z));
    }
  }
  let mode = 'drift';
  if (finger && fingerDist < 0.62) mode = 'scatter';
  else if (finger && fingerDist < 2.15) mode = 'gather';
  if (frozen) return { cohesion, spread, mode };

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
    let alignW = 0;
    let nk = 0;
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const o = birds[j];
      const dx = b.x - o.x;
      const dy = b.y - o.y;
      const dz = b.z - o.z;
      const dist = Math.hypot(dx, dy, dz) || 0.0001;
      if (dist < SEP_R) {
        const push = 1 / (dist * dist);
        sx += dx * push;
        sy += dy * push;
        sz += dz * push;
        ns += 1;
      }
      if (dist < ALIGN_R) {
        const w = o.guide ? 2.5 : 1;
        vx += o.vx * w;
        vy += o.vy * w;
        vz += o.vz * w;
        alignW += w;
      }
      if (dist < COHERE_R) {
        kx += o.x;
        ky += o.y;
        kz += o.z;
        nk += 1;
      }
    }
    b.near = nk;
    if (ns) {
      ax[i] += sx * 2.7;
      ay[i] += sy * 2.7;
      az[i] += sz * 2.7;
    }
    if (alignW) {
      ax[i] += (vx / alignW - b.vx) * 0.38;
      ay[i] += (vy / alignW - b.vy) * 0.38;
      az[i] += (vz / alignW - b.vz) * 0.38;
    }
    if (nk && !b.guide) {
      ax[i] += (kx / nk - b.x) * 0.07;
      ay[i] += (ky / nk - b.y) * 0.07;
      az[i] += (kz / nk - b.z) * 0.07;
    }
    b.phase += step * (b.guide ? 1.8 : 0.95);
    const wander = b.guide ? 0.62 : 0.3;
    ax[i] += Math.cos(b.phase) * wander;
    ay[i] += Math.sin(b.phase * 0.73) * wander * 0.42;
    az[i] += Math.sin(b.phase * 1.17) * wander;
    const wall = prismClearance(b.x, b.y, b.z);
    b.wall = wall.brush;
    if (wall.clearance < WALL_MARGIN) {
      const depth = (WALL_MARGIN - wall.clearance) / WALL_MARGIN;
      const push = depth * depth * 4.4;
      ax[i] -= wall.nx * push;
      az[i] -= wall.nz * push;
    }
    if (wall.yClear < FLOOR_MARGIN) {
      const depth = (FLOOR_MARGIN - wall.yClear) / FLOOR_MARGIN;
      ay[i] -= wall.ny * depth * depth * 3.6;
    }
    if (finger) {
      const dx = b.x - finger.x;
      const dy = b.y - finger.y;
      const dz = b.z - finger.z;
      const dist = Math.hypot(dx, dy, dz) || 0.0001;
      if (dist < 0.62) {
        const push = (0.62 - dist) * 5.2;
        ax[i] += (dx / dist) * push;
        ay[i] += (dy / dist) * push;
        az[i] += (dz / dist) * push;
      } else if (dist < 2.15) {
        const pull = 0.34 * (1 - dist / 2.15);
        ax[i] -= (dx / dist) * pull;
        ay[i] -= (dy / dist) * pull;
        az[i] -= (dz / dist) * pull;
      }
    }
  }

  const reach = HEX_R / HEX_COS;
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
    b.x += b.vx * step;
    b.y += b.vy * step;
    b.z += b.vz * step;
    const radial = Math.hypot(b.x, b.z);
    if (radial > reach * 1.04) {
      const scale = (reach * 1.01) / radial;
      b.x *= scale;
      b.z *= scale;
    }
    if (b.y > HEX_H * 1.04) b.y = HEX_H * 1.04;
    if (b.y < -HEX_H * 1.04) b.y = -HEX_H * 1.04;
  }
  return { cohesion, spread, mode };
}
