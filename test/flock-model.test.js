// Stop must drop every voice, and a later schedule must not bring them back.
// The cube holds the flock. A highlighted bird is the one that may leave.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIRD_COUNT,
  CUBE,
  DOTS_PER_BIRD,
  FIXED_DT,
  GUIDE_COUNT,
  PARTICLE_COUNT,
  PICK_RADIUS,
  VOICE_COUNT,
  createFlock,
  createVoiceBook,
  cubeClearance,
  outsideCube,
  pickNearest,
  renderPoint,
  shouldSchedule,
  stepFlock,
  windAt,
} from '../concepts/flock-model.js';

test('stop clears the book and refuses every later voice', () => {
  const book = createVoiceBook();
  const gen = book.arm();
  const voices = Array.from({ length: VOICE_COUNT }, (_, i) => ({ id: i }));
  for (const voice of voices) assert.equal(book.track(voice, gen), true);
  assert.equal(book.size, VOICE_COUNT);
  assert.equal(shouldSchedule(book, gen), true);

  const doomed = book.halt();
  assert.equal(doomed.length, VOICE_COUNT);
  assert.equal(book.size, 0);
  assert.equal(book.stopped, true);
  assert.equal(shouldSchedule(book, gen), false);
  assert.equal(book.track({ id: 'late' }, gen), false);
  assert.equal(book.size, 0);

  const again = book.halt();
  assert.equal(again.length, 0);
  assert.equal(book.size, 0);
});

test('a second play does not keep voices from the first', () => {
  const book = createVoiceBook();
  const first = book.arm();
  book.track({ id: 'old' }, first);
  book.halt();
  const second = book.arm();
  assert.notEqual(second, first);
  assert.equal(book.track({ id: 'old' }, first), false);
  assert.equal(book.track({ id: 'new' }, second), true);
  assert.equal(book.size, 1);
  assert.equal(book.halt().length, 1);
  assert.equal(book.size, 0);
});

test('the scheduler adds nothing once stop has run', () => {
  const book = createVoiceBook();
  let gen = book.arm();
  let created = 0;
  function tick() {
    if (!shouldSchedule(book, gen)) return;
    const voice = { id: created };
    if (book.track(voice, gen)) created += 1;
  }
  tick();
  tick();
  assert.equal(created, 2);
  assert.equal(book.size, 2);
  book.halt();
  tick();
  tick();
  assert.equal(created, 2);
  assert.equal(book.size, 0);
  gen = book.arm();
  tick();
  assert.equal(book.size, 1);
  assert.equal(created, 3);
});

test('a frozen flock stays put and a finger scatters the near bird', () => {
  const birds = createFlock(() => 0.5);
  const before = birds.map((bird) => ({ x: bird.x, y: bird.y, z: bird.z }));
  stepFlock(birds, 0.016, { x: 0, y: 0, z: 0 }, true);
  for (let i = 0; i < birds.length; i += 1) {
    assert.equal(birds[i].x, before[i].x);
    assert.equal(birds[i].y, before[i].y);
    assert.equal(birds[i].z, before[i].z);
    assert.equal(birds[i].px, birds[i].x);
  }

  birds[0].x = 0;
  birds[0].y = 0;
  birds[0].z = 0;
  birds[0].vx = 0;
  birds[0].vy = 0;
  birds[0].vz = 0;
  const finger = { x: 0.05, y: 0, z: 0 };
  const start = Math.hypot(birds[0].x - finger.x, birds[0].y - finger.y, birds[0].z - finger.z);
  for (let step = 0; step < 8; step += 1) stepFlock(birds, 0.05, finger, false, step * 0.05);
  const end = Math.hypot(birds[0].x - finger.x, birds[0].y - finger.y, birds[0].z - finger.z);
  assert.ok(end > start, `predator should scatter the bird (${start} -> ${end})`);
  assert.equal(birds.length, BIRD_COUNT);
  assert.equal(birds.filter((bird) => bird.lead).length, VOICE_COUNT);
  assert.equal(birds.filter((bird) => bird.guide).length, GUIDE_COUNT);
  assert.equal(PARTICLE_COUNT, BIRD_COUNT * DOTS_PER_BIRD);
  assert.equal(birds[0].dots.length, DOTS_PER_BIRD);
});

test('a close finger scatters and a farther finger gathers', () => {
  const birds = createFlock(() => 0.5);
  birds[0].x = 0;
  birds[0].y = 0;
  birds[0].z = 0;
  assert.equal(stepFlock(birds, 0.016, { x: 0.1, y: 0, z: 0 }, true).mode, 'scatter');
  assert.equal(stepFlock(birds, 0.016, { x: 1.5, y: 0, z: 0 }, true).mode, 'gather');
  assert.equal(stepFlock(birds, 0.016, null, true).mode, 'drift');
});

test('picking chooses the nearest point and misses empty space', () => {
  const points = [
    { x: 10, y: 10 },
    null,
    { x: 40, y: 12, r: 8 },
    { x: 400, y: 400 },
  ];
  assert.equal(pickNearest(points, 12, 14, 20), 0);
  assert.equal(pickNearest(points, 46, 12, 20), 2);
  assert.equal(pickNearest(points, 80, 80, 20), -1);
  assert.equal(pickNearest([{ x: 0, y: 0 }, { x: 30, y: 0 }], 22, 0, PICK_RADIUS), 1);
});

test('wind is a stable field with gust in range', () => {
  const origin = windAt(0, 0, 0, 1.25);
  assert.deepEqual(windAt(0, 0, 0, 1.25), origin);
  const other = windAt(1.4, -0.6, 0.8, 4);
  assert.ok(origin.x !== other.x || origin.y !== other.y || origin.z !== other.z);
  assert.ok(origin.gust >= 0 && origin.gust <= 1);
  assert.ok(Number.isFinite(origin.x + origin.y + origin.z));
});

test('drawing lerps from the previous physics step', () => {
  const bird = { px: 0, py: 1, pz: -2, x: 2, y: 5, z: 4 };
  assert.deepEqual(renderPoint(bird, 0), { x: 0, y: 1, z: -2 });
  assert.deepEqual(renderPoint(bird, 0.5), { x: 1, y: 3, z: 1 });
  assert.deepEqual(renderPoint(bird, 2), { x: 2, y: 5, z: 4 });
  const birds = createFlock(() => 0.2);
  const dots = birds[3].dots.map((dot) => ({ ...dot }));
  const before = birds[3].x;
  stepFlock(birds, FIXED_DT, null, false, 0.4);
  assert.equal(birds[3].px, before);
  assert.notEqual(birds[3].x, before);
  assert.deepEqual(birds[3].dots, dots);
});

test('the flock stays inside the cube unless a bird is highlighted', () => {
  const birds = createFlock(() => 0.5);
  for (let i = 0; i < birds.length; i += 1) {
    const angle = (i / birds.length) * Math.PI * 2;
    birds[i].x = Math.cos(angle) * (0.4 + (i % 5) * 0.22);
    birds[i].y = ((i % 7) - 3) * 0.24;
    birds[i].z = Math.sin(angle) * (0.4 + (i % 4) * 0.26);
    birds[i].vx = Math.cos(angle + 1) * 0.2;
    birds[i].vy = 0;
    birds[i].vz = Math.sin(angle + 1) * 0.2;
    birds[i].phase = i * 0.7;
    birds[i].solo = false;
    birds[i].loose = false;
  }
  let spread = 0;
  for (let step = 0; step < 700; step += 1) {
    spread = stepFlock(birds, FIXED_DT, null, false, step * FIXED_DT).spread;
  }
  assert.ok(spread > 0.55, `flock collapsed toward the middle (${spread})`);
  for (const bird of birds) {
    assert.equal(outsideCube(bird.x, bird.y, bird.z), false, `${bird.x},${bird.y},${bird.z}`);
    assert.ok(cubeClearance(bird.x, bird.y, bird.z).clearance >= -0.001);
  }

  const held = birds[1];
  held.x = CUBE;
  held.y = 0;
  held.z = 0;
  held.vx = 0.9;
  held.vy = 0;
  held.vz = 0;
  stepFlock(birds, FIXED_DT, null, false, 3);
  assert.ok(held.x <= CUBE);
  assert.equal(outsideCube(held.x, held.y, held.z), false);

  const solo = birds[0];
  for (const bird of birds) {
    if (bird === solo) continue;
    bird.x *= 0.25;
    bird.y *= 0.25;
    bird.z *= 0.25;
  }
  solo.solo = true;
  solo.loose = false;
  solo.x = CUBE - 0.2;
  solo.y = 0.1;
  solo.z = -0.1;
  solo.vx = 0.2;
  solo.vy = 0;
  solo.vz = 0;
  let left = false;
  for (let step = 0; step < 180; step += 1) {
    stepFlock(birds, FIXED_DT, null, false, 4 + step * FIXED_DT);
    if (outsideCube(solo.x, solo.y, solo.z)) left = true;
    assert.ok(Math.hypot(solo.x, solo.y, solo.z) < 4.2);
  }
  assert.equal(left, true);

  solo.solo = false;
  solo.loose = true;
  solo.x = CUBE + 0.85;
  solo.y = 0.15;
  solo.z = -0.2;
  solo.vx = 0.1;
  solo.vy = 0;
  solo.vz = 0;
  for (let step = 0; step < 240; step += 1) {
    stepFlock(birds, FIXED_DT, null, false, 8 + step * FIXED_DT);
  }
  assert.equal(outsideCube(solo.x, solo.y, solo.z), false);
  assert.equal(solo.loose, false);
  for (const bird of birds) {
    if (bird === solo) continue;
    assert.equal(outsideCube(bird.x, bird.y, bird.z), false);
  }
});
