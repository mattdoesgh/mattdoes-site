// lib/covers.js — chart cover checks for the listening Worker.
//
// The Worker does not decode pixels. It drops known placeholder URLs, probes
// the rest, and asks Last.fm album.getinfo or the Cover Art Archive only
// while the grid is still short. The Pages build re-encodes what survives
// and drops near-blank files. No API key is written onto an album.

import {
  CHART_CANDIDATES, TOP_LIMIT, albumImageUrl, albumInfoUrl, bestAlbumImage,
  isPlaceholderCover, lastfmError,
} from './lastfm.js';

const USER_AGENT = 'mattdoes-site/1.0 (+https://mattdoes.online)';
const PROBE_TIMEOUT_MS = 4000;
const INFO_BUDGET = 6;
const MB_BUDGET = 4;
const KEEP_LIMIT = CHART_CANDIDATES;

/**
 * A URL this site may fetch while looking for a cover. The page itself only
 * paints Last.fm artwork and mirrored files. Cover Art Archive and archive.org
 * are fetch sources; the build mirrors them or drops them.
 *
 * @param {unknown} url
 * @returns {string}
 */
export function sourceCoverUrl(url) {
  const display = albumImageUrl(url);
  if (display) return display;
  let parsed;
  try { parsed = new URL(String(url ?? '').trim()); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return '';
  if (isPlaceholderCover(parsed.href)) return '';
  const host = parsed.hostname.toLowerCase();
  if (host === 'coverartarchive.org') return parsed.toString();
  if (host === 'archive.org' || host.endsWith('.archive.org')) return parsed.toString();
  return '';
}

/**
 * Probe the first chart candidates and keep rows whose covers answer.
 * A missing cover is replaced only while the visible grid is still short.
 * The stored list is wider than the page so a later blank file can be
 * dropped and the next album still fills the 5×5.
 *
 * @param {unknown} albums
 * @param {object} [opts]
 * @param {string} [opts.key]  Last.fm API key, for album.getinfo only
 * @param {typeof fetch} [opts.fetch]
 * @returns {Promise<object[]>}
 */
export async function resolveChartAlbums(albums, { key = '', fetch: fetchImpl = globalThis.fetch } = {}) {
  const rows = (Array.isArray(albums) ? albums : []).slice(0, CHART_CANDIDATES);
  const probed = await Promise.all(rows.map(async (row) => {
    const image = albumImageUrl(row?.image);
    if (!image) return { row, image: '' };
    return { row, image: await probeCover(image, fetchImpl) };
  }));

  const kept = [];
  const budgets = { info: INFO_BUDGET, mb: MB_BUDGET };
  for (const item of probed) {
    if (kept.length >= KEEP_LIMIT) break;
    if (item.image) {
      kept.push(chartAlbum(item.row, item.image));
      continue;
    }
    if (kept.length >= TOP_LIMIT) continue;
    const image = await fallbackCover(item.row, key, budgets, fetchImpl);
    if (image) kept.push(chartAlbum(item.row, image));
  }
  return kept;
}

/**
 * @param {object} row
 * @param {string} image
 * @returns {{ name: string, artist: string, playcount: number, url: string, image: string }}
 */
function chartAlbum(row, image) {
  return {
    name: String(row?.name || '').trim(),
    artist: String(row?.artist || '').trim(),
    playcount: Number(row?.playcount) || 0,
    url: String(row?.url || ''),
    image,
  };
}

/**
 * @param {object} row
 * @param {string} key
 * @param {{ info: number, mb: number }} budgets
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<string>}
 */
async function fallbackCover(row, key, budgets, fetchImpl) {
  const artist = String(row?.artist || '').trim();
  const name = String(row?.name || '').trim();
  if (!artist || !name) return '';
  if (budgets.info > 0 && key) {
    budgets.info -= 1;
    const fromInfo = await fromAlbumInfo(artist, name, key, fetchImpl);
    if (fromInfo) return fromInfo;
  }
  if (budgets.mb > 0) {
    budgets.mb -= 1;
    return fromMusicBrainz(artist, name, fetchImpl);
  }
  return '';
}

/**
 * @param {string} artist
 * @param {string} album
 * @param {string} key
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<string>}
 */
async function fromAlbumInfo(artist, album, key, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(albumInfoUrl(artist, album, key), {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return '';
  }
  if (!res.ok) return '';
  try {
    const body = await res.json();
    if (lastfmError(body)) return '';
    const image = bestAlbumImage(body?.album?.image);
    if (!image) return '';
    return probeCover(image, fetchImpl);
  } catch {
    return '';
  }
}

/**
 * @param {string} artist
 * @param {string} album
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<string>}
 */
async function fromMusicBrainz(artist, album, fetchImpl) {
  const clean = (value) => value.replace(/["\\]/g, '').slice(0, 120);
  const query = `release:"${clean(album)}" AND artist:"${clean(artist)}"`;
  const lookup = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;
  let res;
  try {
    res = await fetchImpl(lookup, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return '';
  }
  if (!res.ok) return '';
  try {
    const body = await res.json();
    const mbid = String(body?.releases?.[0]?.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(mbid)) return '';
    return probeCover(`https://coverartarchive.org/release/${mbid}/front-250`, fetchImpl);
  } catch {
    return '';
  }
}

/**
 * GET a cover, keep the first bytes, and accept an image response whose
 * final URL is still a source we allow.
 *
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<string>}
 */
async function probeCover(url, fetchImpl) {
  const allowed = sourceCoverUrl(url);
  if (!allowed) return '';
  let res;
  try {
    res = await fetchImpl(allowed, {
      headers: { 'user-agent': USER_AGENT, accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return '';
  }
  try {
    if (!res?.ok) return '';
    const finalUrl = sourceCoverUrl(res.url || allowed);
    if (!finalUrl) return '';
    const type = String(res.headers?.get?.('content-type') || '').toLowerCase();
    const magic = await readMagic(res);
    if (!type.startsWith('image/') && !isImageMagic(magic)) return '';
    return finalUrl;
  } catch {
    return '';
  }
}

/**
 * @param {Response} res
 * @returns {Promise<Uint8Array>}
 */
async function readMagic(res) {
  if (!res.body || typeof res.body.getReader !== 'function') return new Uint8Array();
  const reader = res.body.getReader();
  try {
    const { value } = await reader.read();
    if (!value || !value.length) return new Uint8Array();
    return value.subarray(0, 32);
  } finally {
    try { await reader.cancel(); } catch { /* closed */ }
  }
}

/**
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
function isImageMagic(bytes) {
  if (!bytes || bytes.length < 3) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return true;
  return bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}
