// lib/cover-pixels.js — decide whether a decoded cover is empty art.
//
// Used by the Pages build (sharp), not the listening Worker. Two live rows
// set the thresholds:
//   • biohazard SOUND CHRONICLE BEST TRACK BOX is a real JPEG that is about
//     98% black, with a tiny mark near the middle (content ~1.3%, box ~3%).
//     That is the near-blank tile. Drop it.
//   • Lonesome For A Storm is a full-frame photograph (luminance std ~20,
//     content ~12%). Safari on iPhone draws it as a blue “?” because the
//     file is progressive. It is real art. Keep it, and re-encode it.
// A large mark on a plain field (the Syren cassette, content ~27%) stays.
// A flat Last.fm “no image” field is blank. A 45×45 mark on a 300×300 tile
// looks empty on a phone and is dropped; an 80×80 mark is kept.

/**
 * @param {Uint8Array|Uint8ClampedArray|Buffer} data  RGBA, 4 bytes per pixel
 * @param {number} width
 * @param {number} height
 * @returns {boolean} true when the tile should be omitted
 */
export function coverPixelsAreBlank(data, width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const n = w * h;
  if (!data || data.length !== n * 4 || n < 16) return false;

  const corner = (x, y) => luminance(data, (y * w + x) * 4);
  const bg = (corner(0, 0) + corner(w - 1, 0) + corner(0, h - 1) + corner(w - 1, h - 1)) / 4;

  let sum = 0;
  let sumSq = 0;
  let content = 0;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const L = luminance(data, (y * w + x) * 4);
      sum += L;
      sumSq += L * L;
      if (Math.abs(L - bg) <= 28) continue;
      content += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const std = Math.sqrt(variance);
  if (std < 10) return true;

  const contentFrac = content / n;
  const boxW = maxX >= minX ? maxX - minX + 1 : 0;
  const boxH = maxY >= minY ? maxY - minY + 1 : 0;
  const boxFrac = (boxW * boxH) / n;
  return contentFrac < 0.045 && boxFrac < 0.08;
}

/**
 * @param {Uint8Array|Uint8ClampedArray|Buffer} data
 * @param {number} offset
 * @returns {number}
 */
function luminance(data, offset) {
  return 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
}
