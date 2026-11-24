// lib/cover-encode.js — cover files for the Unshared song list.
//
// A 300px baseline JPEG plus 240px and 300px AVIF, WebP, and JPEG siblings,
// encoded with sharp. Safari on iPhone fails some progressive JPEGs and
// draws a blue "?", so the JPEG is never progressive.

import sharp from 'sharp';

// Phone grid at 390 CSS px and DPR 3 is about 215 device px. 240 leaves a
// little spare. 300 is the file the desktop slot still needs.
const COVER_WIDTHS = [240, 300];
const AVIF_QUALITY = 58;
const WEBP_QUALITY = 80;
const JPEG_QUALITY = 82;

/**
 * @param {Buffer} bytes
 * @returns {Promise<Buffer>}
 */
function baselineCoverJpeg(bytes) {
  return sharp(bytes, { failOn: 'none' })
    .rotate()
    .resize(300, 300, { fit: 'cover' })
    .jpeg({ quality: JPEG_QUALITY, progressive: false })
    .toBuffer();
}

/**
 * One width of one format. The descriptor width is the file's real width,
 * which stays below the request when the source is smaller.
 *
 * @param {Buffer} bytes
 * @param {number} width
 * @param {'avif'|'webp'|'jpg'} format
 * @returns {Promise<{ bytes: Buffer, ext: 'avif'|'webp'|'jpg', type: string, width: number } | null>}
 */
async function encodeCoverVariant(bytes, width, format) {
  let pipeline = sharp(bytes, { failOn: 'none' })
    .rotate()
    .resize(width, width, { fit: 'cover', withoutEnlargement: true });
  if (format === 'avif') pipeline = pipeline.avif({ quality: AVIF_QUALITY, effort: 4 });
  else if (format === 'webp') pipeline = pipeline.webp({ quality: WEBP_QUALITY });
  else pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, progressive: false });
  const encoded = await pipeline.toBuffer();
  if (!encoded.length) return null;
  const meta = await sharp(encoded).metadata();
  const actual = Number(meta.width) || 0;
  if (actual < 1) return null;
  const type = format === 'avif' ? 'image/avif' : format === 'webp' ? 'image/webp' : 'image/jpeg';
  return { bytes: encoded, ext: format, type, width: actual };
}

/**
 * Baseline JPEG plus the 240 and 300 width variants. A format without its
 * 300px file is omitted, so a desktop browser does not upscale a phone-only
 * candidate.
 *
 * @param {Buffer} sourceBytes
 * @returns {Promise<{ bytes: Buffer, ext: 'jpg'|'webp'|'avif', type: string, width: number }[]>}
 */
export async function encodeCoverFiles(sourceBytes) {
  const jpeg = await baselineCoverJpeg(sourceBytes);
  /** @type {{ bytes: Buffer, ext: 'jpg'|'webp'|'avif', type: string, width: number }[]} */
  const files = [{ bytes: jpeg, ext: 'jpg', type: 'image/jpeg', width: 300 }];
  const jobs = [];
  for (const width of COVER_WIDTHS) {
    for (const format of ['avif', 'webp', 'jpg']) {
      if (format === 'jpg' && width === 300) continue;
      jobs.push(encodeCoverVariant(sourceBytes, width, format));
    }
  }
  for (const file of await Promise.all(jobs)) {
    if (file) files.push(file);
  }
  return files.filter((item) => {
    if (item.type === 'image/jpeg') return true;
    return files.some((other) => other.type === item.type && other.width >= 300);
  });
}
