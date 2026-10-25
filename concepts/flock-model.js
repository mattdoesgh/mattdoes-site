// Boids in a cube, pushed by a curl-noise wind. No DOM, so the stop
// rule, the picking, and the cube can be tested in node. A voice
// scheduled after stop, or against an older play, is refused.

export const BIRD_COUNT = 32;
export const DOTS_PER_BIRD = 5;
export const VOICE_COUNT = 7;
export const PARTICLE_COUNT = BIRD_COUNT * DOTS_PER_BIRD;
export const GUIDE_COUNT = 4;
export const CUBE = 1.72;
export const FIXED_DT = 1 / 60;
export const ZOOM_MIN = 2.65;
export const ZOOM_MAX = 8.4;
export const PICK_RADIUS = 72;

const SEP_R = 0.78;
const ALIGN_R = 1.35;
const COHERE_R = 0.5;
const MAX_SPEED = 0.78;
const MIN_SPEED = 0.12;
const WALL = 0.38;
const OUTER = 2.9;

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
 * @param {ReturnType<typeof createVoiceBook>} book
 * @param {number} gen
 * @returns {boolean}
 */
export function shouldSchedule(book, gen) {
  return book.stopped === false && book.generation === gen;
}

/**
 * Nearest projected point inside the radius. -1 is empty space.
 * Points may be null when they sit behind the camera.
 *
 * @param {({ x: number, y: number } | null)[]} points
 * @param {number} x
 * @param {number} y
 * @param {number} [radius]
 * @returns {number}
 */
export function pickNearest(points, x, y, radius = PICK_RADIUS) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (!p) continue;
    const reach = Math.max(radius, p.r || 0);
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist <= reach && dist < bestD) {
      bestD = dist;
      best = i;
    }
  }
  return best;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {boolean}
 */
export function outsideCube(x, y, z) {
  return Math.abs(x) > CUBE || Math.abs(y) > CUBE || Math.abs(z) > CUBE;
}

/**
 * Clearance to the nearest face. Positive is inside. The normal points out.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{ clearance: number, nx: number, ny: number, nz: number, brush: number }}
 */
export function cubeClearance(x, y, z) {
  const faces = [
    { clearance: CUBE - Math.abs(x), nx: x >= 0 ? 1 : -1, ny: 0, nz: 0 },
    { clearance: CUBE - Math.abs(y), nx: 0, ny: y >= 0 ? 1 : -1, nz: 0 },
    { clearance: CUBE - Math.abs(z), nx: 0, ny: 0, nz: z >= 0 ? 1 : -1 },
  ];
  let nearest = faces[0];
  for (let i = 1; i < faces.length; i += 1) {
    if (faces[i].clearance < nearest.clearance) nearest = faces[i];
  }
  return {
    ...nearest,
    brush: Math.min(1, Math.max(0, (WALL - nearest.clearance) / WALL)),
  };
}

function hash(ix, iy, iz) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fade(fx);
  const uy = fade(fy);
  const uz = fade(fz);
  let acc = 0;
  for (let dx = 0; dx < 2; dx += 1) {
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dz = 0; dz < 2; dz += 1) {
        const w = (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
        acc += w * hash(ix + dx, iy + dy, iz + dz);
      }
    }
  }
  return acc * 2 - 1;
}

/**
 * Divergence-free wind. Gust is 0..1 and drives the noise bed.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} time
 * @returns {{ x: number, y: number, z: number, gust: number }}
 */
export function windAt(x, y, z, time) {
  const s = 0.72;
  const e = 0.22;
  const ny = (a, b, c) => noise3(a * s + 3.1, b * s + time * 0.23, c * s);
  const nz = (a, b, c) => noise3(a * s + 1.7, b * s + 8.2, c * s + time * 0.19);
  const nx = (a, b, c) => noise3(a * s + time * 0.21, b * s + 2.4, c * s + 5.5);
  const vx = (nz(x, y + e, z) - nz(x, y - e, z) - (ny(x, y, z + e) - ny(x, y, z - e))) / (2 * e);
  const vy = (nx(x, y, z + e) - nx(x, y, z - e) - (nz(x + e, y, z) - nz(x - e, y, z))) / (2 * e);
  const vz = (ny(x + e, y, z) - ny(x - e, y, z) - (nx(x, y + e, z) - nx(x, y - e, z))) / (2 * e);
  const g = 0.75 + 0.7 * Math.sin(time * 0.41);
  const gx = Math.cos(time * 0.29) * g;
  const gy = Math.sin(time * 0.23) * g * 0.55;
  const gz = Math.sin(time * 0.33) * g;
  return {
    x: vx * 1.35 + gx,
    y: vy * 1.35 + gy,
    z: vz * 1.35 + gz,
    gust: Math.min(1, Math.hypot(gx, gy, gz) / 1.35),
  };
}

/**
 * Where to draw a bird between the last two physics steps.
 *
 * @param {{ px: number, py: number, pz: number, x: number, y: number, z: number }} bird
 * @param {number} alpha
 * @returns {{ x: number, y: number, z: number }}
 */
export function renderPoint(bird, alpha) {
  const t = Math.min(1, Math.max(0, alpha));
  return {
    x: bird.px + (bird.x - bird.px) * t,
    y: bird.py + (bird.y - bird.py) * t,
    z: bird.pz + (bird.z - bird.pz) * t,
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
    const radius = Math.sqrt(random()) * CUBE * 0.62;
    const speed = 0.18 + random() * 0.22;
    const heading = random() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = (random() - 0.5) * CUBE * 0.9;
    const z = Math.sin(angle) * radius;
    birds.push({
      x,
      y,
      z,
      px: x,
      py: y,
      pz: z,
      vx: Math.cos(heading) * speed,
      vy: (random() - 0.5) * speed * 0.4,
      vz: Math.sin(heading) * speed,
      turn: 0,
      near: 0,
      lead: i < VOICE_COUNT,
      guide: i % 8 === 0,
      solo: false,
      loose: false,
      phase: random() * Math.PI * 2,
      wall: 0,
      gust: 0,
      dots,
    });
  }
  return birds;
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

/**
 * One flock step. Frozen flocks keep their places. A solo bird may leave
 * the cube. Everyone else is held at the faces, without a bounce.
 * A finger inside the inner radius is a predator. Farther out it attracts.
 *
 * @param {object[]} birds
 * @param {number} dt
 * @param {{ x: number, y: number, z: number } | null} finger
 * @param {boolean} frozen
 * @param {number} [time]
 * @returns {{ cohesion: number, spread: number, mode: string, gust: number }}
 */
export function stepFlock(birds, dt, finger, frozen, time = 0) {
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
  const cohesion = 1 - Math.min(1, spread / 1.2);
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
  const sample = windAt(0, 0, 0, time);
  if (frozen) {
    for (let i = 0; i < n; i += 1) {
      const b = birds[i];
      b.px = b.x;
      b.py = b.y;
      b.pz = b.z;
    }
    return { cohesion, spread, mode, gust: sample.gust };
  }

  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const az = new Float64Array(n);
  const step = Math.min(Math.max(dt, 0), 0.05);

  for (let i = 0; i < n; i += 1) {
    const b = birds[i];
    b.px = b.x;
    b.py = b.y;
    b.pz = b.z;
    if (b.solo) b.loose = true;
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
        const w = o.guide ? 2.2 : 1;
        vx += o.vx * w;
        vy += o.vy * w;
        vz += o.vz * w;
        alignW += w;
      }
      if (dist < COHERE_R && !b.guide) {
        kx += o.x;
        ky += o.y;
        kz += o.z;
        nk += 1;
      }
    }
    b.near = nk;
    if (ns) {
      ax[i] += sx * 2.4;
      ay[i] += sy * 2.4;
      az[i] += sz * 2.4;
    }
    if (alignW) {
      ax[i] += (vx / alignW - b.vx) * 0.28;
      ay[i] += (vy / alignW - b.vy) * 0.28;
      az[i] += (vz / alignW - b.vz) * 0.28;
    }
    if (nk) {
      ax[i] += (kx / nk - b.x) * 0.05;
      ay[i] += (ky / nk - b.y) * 0.05;
      az[i] += (kz / nk - b.z) * 0.05;
    }
    const wind = windAt(b.x, b.y, b.z, time);
    b.gust = wind.gust;
    const blow = b.solo ? 2.15 : 1.25;
    ax[i] += wind.x * blow;
    ay[i] += wind.y * blow;
    az[i] += wind.z * blow;
    b.phase += step * (b.guide ? 2.1 : 1.25);
    const wander = b.guide ? 0.45 : 0.22;
    ax[i] += Math.cos(b.phase) * wander;
    ay[i] += Math.sin(b.phase * 0.8) * wander * 0.5;
    az[i] += Math.sin(b.phase * 1.2) * wander;
    const wall = cubeClearance(b.x, b.y, b.z);
    b.wall = b.solo ? 0 : wall.brush;
    if (b.solo) {
      if (wall.clearance > 0 && wall.clearance < 0.55) {
        const punch = (0.55 - wall.clearance) * 3.4;
        ax[i] += wall.nx * punch;
        ay[i] += wall.ny * punch;
        az[i] += wall.nz * punch;
      }
      const reach = Math.hypot(b.x, b.y, b.z);
      if (reach > OUTER) {
        const pull = (reach - OUTER) * 1.6;
        ax[i] -= (b.x / reach) * pull;
        ay[i] -= (b.y / reach) * pull;
        az[i] -= (b.z / reach) * pull;
      }
    } else if (b.loose && outsideCube(b.x, b.y, b.z)) {
      ax[i] -= b.x * 2.4;
      ay[i] -= b.y * 2.4;
      az[i] -= b.z * 2.4;
    } else if (wall.clearance < WALL) {
      const depth = (WALL - wall.clearance) / WALL;
      const push = depth * depth * 5.5;
      ax[i] -= wall.nx * push;
      ay[i] -= wall.ny * push;
      az[i] -= wall.nz * push;
    }
    if (finger && !b.solo) {
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
        const pull = 0.3 * (1 - dist / 2.15);
        ax[i] -= (dx / dist) * pull;
        ay[i] -= (dy / dist) * pull;
        az[i] -= (dz / dist) * pull;
      }
    }
  }

  let gust = 0;
  for (let i = 0; i < n; i += 1) {
    const b = birds[i];
    gust += b.gust;
    const ox = b.vx;
    const oy = b.vy;
    const oz = b.vz;
    const cap = b.solo ? 1.15 : MAX_SPEED;
    b.vx = clamp(b.vx + ax[i] * step, -cap, cap);
    b.vy = clamp(b.vy + ay[i] * step, -cap, cap);
    b.vz = clamp(b.vz + az[i] * step, -cap, cap);
    const speed = Math.hypot(b.vx, b.vy, b.vz) || 0.0001;
    const capped = Math.min(cap, Math.max(MIN_SPEED, speed));
    b.vx = (b.vx / speed) * capped;
    b.vy = (b.vy / speed) * capped;
    b.vz = (b.vz / speed) * capped;
    const old = Math.hypot(ox, oy, oz) || 1;
    const dot = (ox * b.vx + oy * b.vy + oz * b.vz) / (old * capped);
    b.turn = 1 - clamp(dot, -1, 1);
    b.x += b.vx * step;
    b.y += b.vy * step;
    b.z += b.vz * step;
    if (!b.solo && !b.loose) {
      if (b.x > CUBE) { b.x = CUBE; if (b.vx > 0) b.vx = 0; }
      if (b.x < -CUBE) { b.x = -CUBE; if (b.vx < 0) b.vx = 0; }
      if (b.y > CUBE) { b.y = CUBE; if (b.vy > 0) b.vy = 0; }
      if (b.y < -CUBE) { b.y = -CUBE; if (b.vy < 0) b.vy = 0; }
      if (b.z > CUBE) { b.z = CUBE; if (b.vz > 0) b.vz = 0; }
      if (b.z < -CUBE) { b.z = -CUBE; if (b.vz < 0) b.vz = 0; }
    } else if (!b.solo && b.loose && !outsideCube(b.x, b.y, b.z)) {
      b.loose = false;
    }
  }
  return { cohesion, spread, mode, gust: gust / n };
}
