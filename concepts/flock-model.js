// Boids in a cube, pushed by a curl-noise wind. No DOM, so the stop
// rule, the picking, and the cube can be tested in node. A voice
// scheduled after stop, or against an older play, is refused.

export const BIRD_COUNT = 32;
export const DOTS_PER_BIRD = 9;
export const VOICE_COUNT = 7;
export const PARTICLE_COUNT = BIRD_COUNT * DOTS_PER_BIRD;
export const GUIDE_COUNT = 4;
export const CUBE = 1.72;
export const FIXED_DT = 1 / 60;
export const ZOOM_MIN = 0.88;
export const ZOOM_MAX = 1.22;
export const PICK_RADIUS = 72;
/** Pitch stays short of the pole so the view cannot roll over. */
export const PITCH_MAX = (85 * Math.PI) / 180;

const SEP_R = 1.22;
const ALIGN_R = 1.35;
const COHERE_R = 0.42;
const MAX_SPEED = 0.26;
const MIN_SPEED = 0.035;
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
  const s = 0.55;
  const e = 0.28;
  const drift = time * 0.055;
  const ny = (a, b, c) => noise3(a * s + 3.1, b * s + drift, c * s);
  const nz = (a, b, c) => noise3(a * s + 1.7, b * s + 8.2, c * s + drift * 0.8);
  const nx = (a, b, c) => noise3(a * s + drift * 0.9, b * s + 2.4, c * s + 5.5);
  const vx = (nz(x, y + e, z) - nz(x, y - e, z) - (ny(x, y, z + e) - ny(x, y, z - e))) / (2 * e);
  const vy = (nx(x, y, z + e) - nx(x, y, z - e) - (nz(x + e, y, z) - nz(x - e, y, z))) / (2 * e);
  const vz = (ny(x + e, y, z) - ny(x - e, y, z) - (nx(x, y + e, z) - nx(x, y - e, z))) / (2 * e);
  const pulse = Math.sin(time * 0.045);
  const g = pulse > 0.72 ? (pulse - 0.72) * 1.4 : 0;
  const gx = Math.cos(time * 0.04) * g * 0.4;
  const gy = Math.sin(time * 0.03) * g * 0.22;
  const gz = Math.sin(time * 0.05) * g * 0.4;
  return {
    x: vx * 0.4 + gx,
    y: vy * 0.4 + gy,
    z: vz * 0.4 + gz,
    gust: Math.min(1, g),
  };
}

/**
 * Where to draw a bird between the last two physics steps.
 *
 * @param {{ px: number, py: number, pz: number, x: number, y: number, z: number }} bird
 * @param {number} alpha
 * @returns {{ x: number, y: number, z: number }}
 */
/**
 * Seconds until an idle flock should solo a bird on its own.
 * The span is 50 to 90 seconds.
 *
 * @param {() => number} [random]
 * @returns {number}
 */
export function idleSoloDelay(random = Math.random) {
  return 50 + random() * 40;
}

const ISO_S = 1 / Math.sqrt(3);

/** Screen right, up, and forward for a corner-on view down (1, 1, 1). */
export const ISO_RIGHT = { x: 1 / Math.SQRT2, y: 0, z: -1 / Math.SQRT2 };
export const ISO_UP = { x: -1 / Math.sqrt(6), y: 2 / Math.sqrt(6), z: -1 / Math.sqrt(6) };
export const ISO_FORWARD = { x: ISO_S, y: ISO_S, z: ISO_S };

/**
 * Orthographic projection along the cube's body diagonal.
 * The near and far corners land on the origin. The other six
 * corners are a regular hexagon.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{ x: number, y: number, z: number }}
 */
export function isoProject(x, y, z) {
  return {
    x: x * ISO_RIGHT.x + y * ISO_RIGHT.y + z * ISO_RIGHT.z,
    y: x * ISO_UP.x + y * ISO_UP.y + z * ISO_UP.z,
    z: x * ISO_FORWARD.x + y * ISO_FORWARD.y + z * ISO_FORWARD.z,
  };
}

/**
 * Pixels per world unit so the hexagon fills the frame and stays centered.
 * Zoom scales that fit without turning the cube.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [zoom]
 * @returns {number}
 */
export function isoScale(width, height, zoom = 1) {
  const halfW = CUBE * Math.SQRT2;
  const halfH = (CUBE * 4) / Math.sqrt(6);
  const fit = Math.min((width * 0.46) / halfW, (height * 0.46) / halfH);
  return fit * zoom;
}

function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function scale3(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function add3(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function norm3(v) {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return scale3(v, 1 / m);
}

function rot3(v, axis, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const along = dot3(v, axis);
  return add3(add3(scale3(v, c), scale3(cross3(axis, v), s)), scale3(axis, along * (1 - c)));
}

/**
 * Pitch then yaw from the corner-on pose. Yaw turns about the original
 * screen-up. Pitch turns about the yawed screen-right. Up is rebuilt from
 * those two, so the view does not roll. Pitch is clamped to ±85°.
 *
 * @param {number} yaw
 * @param {number} pitch
 * @returns {{ right: { x: number, y: number, z: number }, up: { x: number, y: number, z: number }, forward: { x: number, y: number, z: number } }}
 */
export function viewBasis(yaw, pitch) {
  const clamped = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch));
  const right = norm3(rot3(ISO_RIGHT, ISO_UP, yaw));
  const spun = rot3(ISO_FORWARD, ISO_UP, yaw);
  const forward = norm3(rot3(spun, right, -clamped));
  const up = norm3(cross3(forward, right));
  return { right, up, forward };
}

const LATTICE_CAP = 1600;
const latticeBuf = {
  n: 0,
  x: new Float32Array(LATTICE_CAP),
  y: new Float32Array(LATTICE_CAP),
  z: new Float32Array(LATTICE_CAP),
  x2: new Float32Array(LATTICE_CAP),
  y2: new Float32Array(LATTICE_CAP),
  z2: new Float32Array(LATTICE_CAP),
  a: new Float32Array(LATTICE_CAP),
};

function latticeVertex(i) {
  return (2 * i - 1) * CUBE;
}

/**
 * Visible edges of a cubic lattice the same size as the flock's cube.
 * The buffer is reused. Shared edges are written once. The center cube's
 * twelve edges are the brightest. Farther blocks fade.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} zoom
 * @param {number} yaw
 * @param {number} pitch
 * @returns {typeof latticeBuf}
 */
export function writeLattice(width, height, zoom, yaw, pitch) {
  const basis = viewBasis(yaw, pitch);
  const scale = isoScale(width, height, zoom);
  const step = CUBE * 2;
  const reach = Math.hypot(width, height) / (2 * Math.max(scale, 1e-6)) + step;
  const n = Math.min(3, Math.max(1, Math.ceil(reach / step)));
  const lo = -n;
  const hi = n + 1;
  const margin = step * scale;
  const { right, up, forward } = basis;
  let count = 0;

  const project = (x, y, z) => {
    const sx = x * right.x + y * right.y + z * right.z;
    const sy = x * up.x + y * up.y + z * up.z;
    return {
      x: width * 0.5 + sx * scale,
      y: height * 0.5 - sy * scale,
    };
  };

  const push = (ix, iy, iz, jx, jy, jz) => {
    if (count >= LATTICE_CAP) return;
    const x1 = latticeVertex(ix);
    const y1 = latticeVertex(iy);
    const z1 = latticeVertex(iz);
    const x2 = latticeVertex(jx);
    const y2 = latticeVertex(jy);
    const z2 = latticeVertex(jz);
    const mx = (x1 + x2) * 0.5;
    const my = (y1 + y2) * 0.5;
    const mz = (z1 + z2) * 0.5;
    const center = ix >= 0 && ix <= 1 && iy >= 0 && iy <= 1 && iz >= 0 && iz <= 1
      && jx >= 0 && jx <= 1 && jy >= 0 && jy <= 1 && jz >= 0 && jz <= 1;
    let alpha = 0.4;
    if (!center) {
      const dist = Math.hypot(mx, my, mz) / step;
      const depth = mx * forward.x + my * forward.y + mz * forward.z;
      const fog = Math.exp(-0.14 * Math.max(0, depth - 0.6));
      alpha = 0.22 * Math.exp(-0.42 * Math.max(0, dist - 0.45)) * fog;
      if (alpha < 0.09) return;
    }
    const a = project(x1, y1, z1);
    const b = project(x2, y2, z2);
    let aSide = 0;
    let bSide = 0;
    if (a.x < -margin) aSide |= 1;
    else if (a.x > width + margin) aSide |= 2;
    if (a.y < -margin) aSide |= 4;
    else if (a.y > height + margin) aSide |= 8;
    if (b.x < -margin) bSide |= 1;
    else if (b.x > width + margin) bSide |= 2;
    if (b.y < -margin) bSide |= 4;
    else if (b.y > height + margin) bSide |= 8;
    if (aSide && (aSide & bSide)) return;
    const px = (a.x + b.x) * 0.5;
    const py = (a.y + b.y) * 0.5;
    if (px < -margin || px > width + margin || py < -margin || py > height + margin) return;
    latticeBuf.x[count] = x1;
    latticeBuf.y[count] = y1;
    latticeBuf.z[count] = z1;
    latticeBuf.x2[count] = x2;
    latticeBuf.y2[count] = y2;
    latticeBuf.z2[count] = z2;
    latticeBuf.a[count] = alpha;
    count += 1;
  };

  for (let iy = lo; iy <= hi; iy += 1) {
    for (let iz = lo; iz <= hi; iz += 1) {
      for (let ix = lo; ix < hi; ix += 1) push(ix, iy, iz, ix + 1, iy, iz);
    }
  }
  for (let ix = lo; ix <= hi; ix += 1) {
    for (let iz = lo; iz <= hi; iz += 1) {
      for (let iy = lo; iy < hi; iy += 1) push(ix, iy, iz, ix, iy + 1, iz);
    }
  }
  for (let ix = lo; ix <= hi; ix += 1) {
    for (let iy = lo; iy <= hi; iy += 1) {
      for (let iz = lo; iz < hi; iz += 1) push(ix, iy, iz, ix, iy, iz + 1);
    }
  }

  latticeBuf.n = count;
  return latticeBuf;
}

/**
 * One step of a weighted walk. `steps` and `weights` are the same length.
 * The result stays inside `0 .. span - 1`.
 *
 * @param {number} index
 * @param {number[]} steps
 * @param {number[]} weights
 * @param {number} span
 * @param {() => number} [random]
 * @returns {number}
 */
export function markovIndex(index, steps, weights, span, random = Math.random) {
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) total += weights[i];
  let pick = random() * (total || 1);
  let step = steps[steps.length - 1] || 0;
  for (let i = 0; i < steps.length; i += 1) {
    pick -= weights[i] || 0;
    if (pick < 0) {
      step = steps[i];
      break;
    }
  }
  const n = span > 0 ? span : 1;
  return ((index + step) % n + n) % n;
}

/**
 * Stable links between a bird's dots. The same offsets always produce
 * the same pairs, so the constellation does not flicker.
 *
 * @param {{ ox: number, oy: number, oz: number }[]} dots
 * @returns {number[]}
 */
export function constellationEdges(dots) {
  const edges = [];
  const seen = new Set();
  const link = (a, b) => {
    if (a === b) return;
    const key = a < b ? a * 32 + b : b * 32 + a;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(a, b);
  };
  for (let i = 0; i < dots.length; i += 1) {
    let best = -1;
    let bestD = Infinity;
    let second = -1;
    let secondD = Infinity;
    for (let j = 0; j < dots.length; j += 1) {
      if (i === j) continue;
      const d = Math.hypot(
        dots[i].ox - dots[j].ox,
        dots[i].oy - dots[j].oy,
        dots[i].oz - dots[j].oz,
      );
      if (d < bestD || (d === bestD && j < best)) {
        second = best;
        secondD = bestD;
        best = j;
        bestD = d;
      } else if (d < secondD || (d === secondD && (second < 0 || j < second))) {
        second = j;
        secondD = d;
      }
    }
    if (best >= 0) link(i, best);
    if (second >= 0) link(i, second);
  }
  if (edges.length < dots.length) {
    for (let i = 0; i < dots.length; i += 1) link(i, (i + 1) % dots.length);
  }
  return edges;
}

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
      const air = 1.7;
      dots.push({
        ox: (random() - 0.5) * air,
        oy: (random() - 0.5) * air,
        oz: (random() - 0.5) * air,
      });
    }
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * CUBE * 0.94;
    const speed = 0.04 + random() * 0.07;
    const heading = random() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = (random() - 0.5) * CUBE * 1.7;
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
      lean: Math.cos(i * 2.399 + random() * 0.35),
      side: 0,
      dots,
      edges: constellationEdges(dots),
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
    let held = null;
    for (let i = 0; i < n; i += 1) {
      if (birds[i].solo) {
        held = birds[i];
        break;
      }
    }
    const eased = Math.min(Math.max(dt, 0), 1);
    for (let i = 0; i < n; i += 1) {
      const b = birds[i];
      b.px = b.x;
      b.py = b.y;
      b.pz = b.z;
      const drift = Math.sin(time * 0.07 + b.phase) * 0.22;
      const aim = held && held !== b ? clamp((b.lean || 0) + drift, -1, 1) : 0;
      b.side = (b.side || 0) + (aim - (b.side || 0)) * Math.min(1, eased * 0.16);
    }
    return { cohesion, spread, mode, gust: sample.gust };
  }

  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const az = new Float64Array(n);
  const step = Math.min(Math.max(dt, 0), 0.05);
  let solo = null;
  for (let i = 0; i < n; i += 1) {
    if (birds[i].solo) {
      solo = birds[i];
      break;
    }
  }

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
      if (b.side * o.side > 0.05 && dist < 1.15 && dist > 0.18) {
        const kin = Math.min(Math.abs(b.side), Math.abs(o.side)) * 0.09;
        ax[i] += (o.x - b.x) * kin;
        ay[i] += (o.y - b.y) * kin;
        az[i] += (o.z - b.z) * kin;
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
      ax[i] += (kx / nk - b.x) * 0.02;
      ay[i] += (ky / nk - b.y) * 0.02;
      az[i] += (kz / nk - b.z) * 0.02;
    }
    const wind = windAt(b.x, b.y, b.z, time);
    b.gust = wind.gust;
    const blow = b.solo ? 0.85 : 0.32;
    ax[i] += wind.x * blow;
    ay[i] += wind.y * blow;
    az[i] += wind.z * blow;
    b.phase += step * (b.guide ? 2.1 : 1.25);
    const wander = b.guide ? 0.1 : 0.045;
    ax[i] += Math.cos(b.phase) * wander;
    ay[i] += Math.sin(b.phase * 0.8) * wander * 0.5;
    az[i] += Math.sin(b.phase * 1.2) * wander;
    const drift = Math.sin(time * 0.07 + b.phase) * 0.22;
    const aim = solo && !b.solo ? clamp((b.lean || 0) + drift, -1, 1) : 0;
    b.side = (b.side || 0) + (aim - (b.side || 0)) * Math.min(1, step * 0.16);
    if (solo && solo !== b) {
      const dx = solo.x - b.x;
      const dy = solo.y - b.y;
      const dz = solo.z - b.z;
      const dist = Math.hypot(dx, dy, dz) || 0.0001;
      const ux = dx / dist;
      const uy = dy / dist;
      const uz = dz / dist;
      const tx = -uz;
      const tz = ux;
      if (b.side > 0) {
        const flank = 0.38;
        ax[i] += (solo.x + tx * flank - b.x) * 0.62 * b.side;
        ay[i] += (solo.y - b.y) * 0.62 * b.side;
        az[i] += (solo.z + tz * flank - b.z) * 0.62 * b.side;
        ax[i] += (solo.vx - b.vx) * 0.28 * b.side;
        ay[i] += (solo.vy - b.vy) * 0.28 * b.side;
        az[i] += (solo.vz - b.vz) * 0.28 * b.side;
      } else if (b.side < 0) {
        const oppose = -b.side;
        const shell = 1.2;
        ax[i] -= ux * (shell - dist) * 0.9 * oppose;
        ay[i] -= uy * (shell - dist) * 0.9 * oppose;
        az[i] -= uz * (shell - dist) * 0.9 * oppose;
        ax[i] += tx * 0.62 * oppose;
        az[i] += tz * 0.62 * oppose;
      }
    }
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
    const cap = b.solo ? 0.48 : MAX_SPEED;
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
