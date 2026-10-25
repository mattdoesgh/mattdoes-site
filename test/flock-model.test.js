// Stop must drop every voice, and a later schedule must not bring them back.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIRD_COUNT,
  DOTS_PER_BIRD,
  PARTICLE_COUNT,
  VOICE_COUNT,
  createFlock,
  createVoiceBook,
  shouldSchedule,
  stepFlock,
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
  }

  birds[0].x = 0;
  birds[0].y = 0;
  birds[0].z = 0;
  birds[0].vx = 0;
  birds[0].vy = 0;
  birds[0].vz = 0;
  const finger = { x: 0.05, y: 0, z: 0 };
  const start = Math.hypot(birds[0].x - finger.x, birds[0].y - finger.y, birds[0].z - finger.z);
  stepFlock(birds, 0.05, finger, false);
  const end = Math.hypot(birds[0].x - finger.x, birds[0].y - finger.y, birds[0].z - finger.z);
  assert.ok(end > start, `predator should scatter the bird (${start} -> ${end})`);
  assert.equal(birds.length, BIRD_COUNT);
  assert.equal(birds.filter((bird) => bird.lead).length, VOICE_COUNT);
  assert.equal(PARTICLE_COUNT, BIRD_COUNT * DOTS_PER_BIRD);
});
