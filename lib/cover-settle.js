// lib/cover-settle.js — Pages-build pass over chart covers.
//
// Fetch each source, drop a file that is blank or gone, and re-encode a
// real cover as a baseline JPEG with sharp. Safari on iPhone fails some of
// Last.fm's progressive JPEGs and draws a blue "?". The re-encoded file is
// stored on the existing mattdoes-media bucket, with 240px and 300px AVIF,
// WebP, and JPEG siblings when those uploads or public copies exist. This
// build does not call Cloudflare Images or image resizing. When the R2
// token is absent, a copy already at media.mattdoes.online/covers/<sha256>.<ext>
// is reused. A progressive JPEG with no baseline copy to serve is dropped
// so the next album fills the slot. A baseline Last.fm file can still be
// painted. A network error keeps a Last.fm or media URL. An HTTP error
// drops the row. Cover Art Archive hosts are not painted; they are mirrored
// or dropped.

import { AssertionError } from 'node:assert';
import sharp from 'sharp';
import { CHART_SPARES, TOP_LIMIT, albumImageUrl } from './lastfm.js';
import { coverPixelsAreBlank } from './cover-pixels.js';
import { existingPublicCover, existingPublicCoverFile, mirrorCoverFile, mirrorCoverJpeg } from './cover-mirror.js';
import { sourceCoverUrl } from './covers.js';

const KEEP_LIMIT = TOP_LIMIT + CHART_SPARES;
const USER_AGENT = 'mattdoes-site/1.0 (+https://mattdoes.online)';
// Phone grid at 390 CSS px and DPR 3 is about 215 device px. 240 leaves a
// little spare. 300 is the file the desktop slot still needs.
const COVER_WIDTHS = [240, 300];
const AVIF_QUALITY = 58;
const WEBP_QUALITY = 80;

/**
 * @param {unknown} periods
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetch]
 * @param {string} [opts.token]
 * @param {string} [opts.accountId]
 * @returns {Promise<unknown>}
 */
export async function settleChartCovers(periods, opts = {}) {
  if (!periods || typeof periods !== 'object' || Array.isArray(periods)) return periods;
  const fetchImpl = opts.fetch || globalThis.fetch;
  const out = { ...periods };
  let reused = 0;
  let droppedProgressive = 0;
  for (const id of Object.keys(out)) {
    const row = out[id];
    if (!row || typeof row !== 'object' || !Array.isArray(row.albums)) continue;
    const albums = [];
    for (const album of row.albums) {
      if (albums.length >= KEEP_LIMIT) break;
      const settled = await settleOne(album, fetchImpl, opts);
      if (settled.reused) reused += 1;
      if (settled.droppedProgressive) droppedProgressive += 1;
      if (!settled.image) continue;
      const next = { ...album, image: settled.image };
      if (settled.imageSet?.length) next.imageSet = settled.imageSet;
      albums.push(next);
    }
    out[id] = { ...row, albums };
  }
  if (reused || droppedProgressive) {
    console.log(`  covers: ${reused} reused from the media host, ${droppedProgressive} progressive JPEG dropped`);
  }
  return out;
}

/**
 * @param {object} album
 * @param {typeof fetch} fetchImpl
 * @param {object} opts
 * @returns {Promise<{ image: string, imageSet?: object[], reused: boolean, droppedProgressive: boolean }>}
 */
async function settleOne(album, fetchImpl, opts) {
  const miss = { image: '', reused: false, droppedProgressive: false };
  const original = String(album?.image || '');
  const source = sourceCoverUrl(original);
  if (!source) return miss;
  let res;
  try {
    res = await fetchImpl(source, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': USER_AGENT, accept: 'image/*' },
    });
  } catch (err) {
    if (err instanceof AssertionError) throw err;
    return { image: albumImageUrl(original), reused: false, droppedProgressive: false };
  }
  if (!res?.ok) return miss;
  let bytes;
  try {
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (err instanceof AssertionError) throw err;
    return { image: albumImageUrl(original), reused: false, droppedProgressive: false };
  }
  const judged = await judgeCover(bytes);
  if (judged.blank) return miss;
  const progressive = isProgressiveJpeg(bytes);
  if (judged.jpeg) {
    const mirrored = await mirrorCoverJpeg(judged.jpeg, { ...opts, fetch: fetchImpl });
    if (mirrored) {
      const imageSet = await publishCoverSet(bytes, judged.jpeg, mirrored, opts, fetchImpl);
      return { image: mirrored, imageSet, reused: false, droppedProgressive: false };
    }
    const existing = await existingPublicCover(judged.jpeg, fetchImpl);
    if (existing) {
      const imageSet = await publishCoverSet(bytes, judged.jpeg, existing, opts, fetchImpl);
      return { image: existing, imageSet, reused: true, droppedProgressive: false };
    }
  }
  // iOS Safari draws a blue "?" for some progressive Last.fm JPEGs. Ship
  // one only when the baseline re-encode is the URL the page will load.
  if (progressive) return { image: '', reused: false, droppedProgressive: true };
  return { image: albumImageUrl(res.url || original), reused: false, droppedProgressive: false };
}

/**
 * SOF2 is a progressive JPEG. Baseline (SOF0) and extended sequential
 * (SOF1) are left alone. A non-JPEG is not progressive.
 *
 * @param {Buffer|Uint8Array} bytes
 * @returns {boolean}
 */
export function isProgressiveJpeg(bytes) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return false;
  let i = 2;
  while (i + 1 < data.length) {
    if (data[i] !== 0xff) return false;
    let marker = data[i + 1];
    while (marker === 0xff && i + 2 < data.length) {
      i += 1;
      marker = data[i + 1];
    }
    if (marker === 0xd9 || marker === 0xda) return false;
    if (marker === 0xc2) return true;
    if (marker === 0xc0 || marker === 0xc1) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    if (i + 3 >= data.length) return false;
    const len = data.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > data.length) return false;
    i += 2 + len;
  }
  return false;
}

/**
 * Baseline JPEG the page can serve. Sharp in this build, not Cloudflare Images.
 *
 * @param {Buffer} bytes
 * @returns {Promise<Buffer>}
 */
export async function baselineCoverJpeg(bytes) {
  return sharp(bytes, { failOn: 'none' })
    .rotate()
    .resize(300, 300, { fit: 'cover' })
    .jpeg({ quality: 82, progressive: false })
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
  else pipeline = pipeline.jpeg({ quality: 82, progressive: false });
  const encoded = await pipeline.toBuffer();
  if (!encoded.length) return null;
  const meta = await sharp(encoded).metadata();
  const actual = Number(meta.width) || 0;
  if (actual < 1) return null;
  const ext = format === 'jpg' ? 'jpg' : format;
  const type = ext === 'avif' ? 'image/avif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { bytes: encoded, ext, type, width: actual };
}

/**
 * Width variants for a cover whose 300px JPEG is already the page URL.
 * The 300px JPEG is that file, not a second encode. A format is omitted
 * when its 300px file did not land, so a desktop browser does not upscale
 * a phone-only candidate.
 *
 * @param {Buffer} source
 * @param {Buffer} jpeg
 * @param {string} jpegUrl
 * @param {object} opts
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<object[]>}
 */
async function publishCoverSet(source, jpeg, jpegUrl, opts, fetchImpl) {
  /** @type {Map<string, { url: string, width: number, type: string }>} */
  const found = new Map();
  found.set(`image/jpeg:300`, { url: jpegUrl, width: 300, type: 'image/jpeg' });
  const jobs = [];
  for (const width of COVER_WIDTHS) {
    for (const format of ['avif', 'webp', 'jpg']) {
      if (format === 'jpg' && width === 300) continue;
      jobs.push(encodeCoverVariant(source, width, format));
    }
  }
  const encoded = await Promise.all(jobs);
  for (const file of encoded) {
    if (!file) continue;
    let url = '';
    try {
      url = await mirrorCoverFile(file.bytes, file.ext, { ...opts, fetch: fetchImpl });
      if (!url) url = await existingPublicCoverFile(file.bytes, file.ext, fetchImpl);
    } catch (err) {
      if (err instanceof AssertionError) throw err;
      url = '';
    }
    if (!url) continue;
    found.set(`${file.type}:${file.width}`, { url, width: file.width, type: file.type });
  }
  const items = [...found.values()];
  return items.filter((item) => {
    if (item.type === 'image/jpeg') return true;
    return items.some((other) => other.type === item.type && other.width >= 300);
  });
}

/**
 * Baseline JPEG plus the 240 and 300 width variants the listening chart
 * serves. A format without its 300px file is omitted.
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

/**
 * @param {Buffer} bytes
 * @returns {Promise<{ blank: boolean, jpeg: Buffer|null }>}
 */
async function judgeCover(bytes) {
  try {
    const { data, info } = await sharp(bytes, { failOn: 'none' })
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (coverPixelsAreBlank(data, info.width, info.height)) return { blank: true, jpeg: null };
    const jpeg = await baselineCoverJpeg(bytes);
    return { blank: false, jpeg };
  } catch (err) {
    if (err instanceof AssertionError) throw err;
    return { blank: false, jpeg: null };
  }
}
