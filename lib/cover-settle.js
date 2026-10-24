// lib/cover-settle.js — Pages-build pass over chart covers.
//
// Fetch each source, drop a file that is blank or gone, and re-encode a
// real cover as a baseline JPEG. Safari on iPhone fails some of Last.fm's
// progressive JPEGs and draws a blue "?". The mirror, when R2 credentials
// are present, is what the page paints. A network error keeps a Last.fm or
// media URL. An HTTP error drops the row so the next album can fill it.
// Cover Art Archive hosts are not painted; they are mirrored or dropped.

import { AssertionError } from 'node:assert';
import sharp from 'sharp';
import { CHART_SPARES, TOP_LIMIT, albumImageUrl } from './lastfm.js';
import { coverPixelsAreBlank } from './cover-pixels.js';
import { mirrorCoverJpeg } from './cover-mirror.js';
import { sourceCoverUrl } from './covers.js';

const KEEP_LIMIT = TOP_LIMIT + CHART_SPARES;
const USER_AGENT = 'mattdoes-site/1.0 (+https://mattdoes.online)';

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
  for (const id of Object.keys(out)) {
    const row = out[id];
    if (!row || typeof row !== 'object' || !Array.isArray(row.albums)) continue;
    const albums = [];
    for (const album of row.albums) {
      if (albums.length >= KEEP_LIMIT) break;
      const image = await settleOne(album, fetchImpl, opts);
      if (!image) continue;
      albums.push({ ...album, image });
    }
    out[id] = { ...row, albums };
  }
  return out;
}

/**
 * @param {object} album
 * @param {typeof fetch} fetchImpl
 * @param {object} opts
 * @returns {Promise<string>}
 */
async function settleOne(album, fetchImpl, opts) {
  const original = String(album?.image || '');
  const source = sourceCoverUrl(original);
  if (!source) return '';
  let res;
  try {
    res = await fetchImpl(source, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': USER_AGENT, accept: 'image/*' },
    });
  } catch (err) {
    if (err instanceof AssertionError) throw err;
    return albumImageUrl(original);
  }
  if (!res?.ok) return '';
  let bytes;
  try {
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (err instanceof AssertionError) throw err;
    return albumImageUrl(original);
  }
  const judged = await judgeCover(bytes);
  if (judged.blank) return '';
  if (judged.jpeg) {
    const mirrored = await mirrorCoverJpeg(judged.jpeg, { ...opts, fetch: fetchImpl });
    if (mirrored) return mirrored;
  }
  return albumImageUrl(res.url || original);
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
    const jpeg = await sharp(bytes, { failOn: 'none' })
      .rotate()
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 82, progressive: false })
      .toBuffer();
    return { blank: false, jpeg };
  } catch (err) {
    if (err instanceof AssertionError) throw err;
    return { blank: false, jpeg: null };
  }
}
