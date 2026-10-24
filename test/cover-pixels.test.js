// Blank-cover pixels. The thresholds come from two live tiles:
// biohazard SOUND CHRONICLE is a near-black JPEG, and Lonesome For A Storm
// is a full-frame photograph that Safari fails to decode.

import test from 'node:test';
import assert from 'node:assert/strict';
import { coverPixelsAreBlank } from '../lib/cover-pixels.js';

const W = 300;
const H = 300;

function canvas(paint) {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const [r, g, b] = paint(x, y);
      const o = (y * W + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return data;
}

function rect(data, x0, y0, x1, y1, rgb) {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const o = (y * W + x) * 4;
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
    }
  }
}

test('a flat field and a near-empty cover are blank', () => {
  assert.equal(coverPixelsAreBlank(canvas(() => [180, 180, 180]), W, H), true);
  const bio = canvas(() => [8, 8, 8]);
  rect(bio, 107, 137, 194, 167, [210, 210, 210]);
  assert.equal(coverPixelsAreBlank(bio, W, H), true, 'biohazard-sized mark');
  const tiny = canvas(() => [250, 250, 250]);
  rect(tiny, 10, 10, 55, 55, [0, 0, 0]);
  assert.equal(coverPixelsAreBlank(tiny, W, H), true, '45px mark on a phone tile');
});

test('a full-frame photograph and a large mark are kept', () => {
  const photo = canvas((x, y) => [40 + (x % 70), 30 + (y % 50), 80 + ((x + y) % 40)]);
  assert.equal(coverPixelsAreBlank(photo, W, H), false, 'Lonesome-like full frame');
  const syren = canvas(() => [245, 245, 245]);
  rect(syren, 40, 70, 200, 230, [20, 20, 20]);
  assert.equal(coverPixelsAreBlank(syren, W, H), false, 'cassette-sized mark');
  const logo = canvas(() => [255, 255, 255]);
  rect(logo, 110, 110, 190, 190, [0, 0, 0]);
  assert.equal(coverPixelsAreBlank(logo, W, H), false, '80px mark');
});

test('a short or mismatched buffer is not treated as blank', () => {
  assert.equal(coverPixelsAreBlank(new Uint8Array(8), 2, 1), false);
  assert.equal(coverPixelsAreBlank(new Uint8Array(10), W, H), false);
  assert.equal(coverPixelsAreBlank(null, W, H), false);
});
