// Mirror a settled album cover into the R2 bucket `mattdoes-media`.
//
// The listening Worker does not import this module. Auth matches poster
// mirroring: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. The bytes are
// a baseline JPEG produced in the Pages build (sharp). This module only
// stores them on the existing bucket. It does not call Cloudflare Images
// or image resizing. Missing credentials skip the upload. A preview can
// still use https://media.mattdoes.online/covers/<sha256>.jpg when that
// object is already public. A failed list or upload returns ''.

import { AssertionError } from 'node:assert';
import crypto from 'node:crypto';

const BUCKET = 'mattdoes-media';
const PUBLIC_BASE = 'https://media.mattdoes.online';
const MAX_BYTES = 1_500_000;

/**
 * @param {string} accountId
 * @param {string} key
 * @returns {string}
 */
function objectUrl(accountId, key) {
  const pathKey = key.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${BUCKET}/objects/${pathKey}`;
}

/**
 * Public URL for these exact bytes. The hash is the baseline JPEG.
 *
 * @param {Buffer|Uint8Array} bytes
 * @returns {string}
 */
export function publicCoverUrl(bytes) {
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  return `${PUBLIC_BASE}/covers/${hash}.jpg`;
}

/**
 * That public URL when the object is already on the media host. A miss is
 * empty. This does not upload and does not need the R2 token.
 *
 * @param {Buffer|Uint8Array} bytes
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>}
 */
export async function existingPublicCover(bytes, fetchImpl = globalThis.fetch) {
  if (!bytes || bytes.length === 0 || bytes.length > MAX_BYTES) return '';
  const url = publicCoverUrl(bytes);
  try {
    const res = await fetchImpl(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    });
    if (res?.ok) return url;
  } catch (err) {
    if (err instanceof AssertionError) throw err;
  }
  return '';
}

/**
 * @param {Buffer|Uint8Array} bytes
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetch]
 * @param {string} [opts.token]
 * @param {string} [opts.accountId]
 * @returns {Promise<string>} public cover URL, or '' when the mirror did not happen
 */
export async function mirrorCoverJpeg(bytes, opts = {}) {
  const token = opts.token ?? process.env.CLOUDFLARE_API_TOKEN ?? '';
  const accountId = opts.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
  if (!token || !accountId) return '';
  if (!bytes || bytes.length === 0 || bytes.length > MAX_BYTES) return '';

  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const key = `covers/${hash}.jpg`;
  const fetchImpl = opts.fetch || globalThis.fetch;
  const headers = { authorization: `Bearer ${token}` };
  const publicUrl = publicCoverUrl(bytes);

  let present = false;
  try {
    const listUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${BUCKET}/objects?prefix=${encodeURIComponent(key)}`;
    const listed = await fetchImpl(listUrl, { headers, signal: AbortSignal.timeout(12_000) });
    if (listed.ok) {
      const data = await listed.json();
      present = listedKeys(data).includes(key);
    }
  } catch {
    present = false;
  }

  if (present) return publicUrl;

  try {
    const put = await fetchImpl(objectUrl(accountId, key), {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'image/jpeg' },
      body: bytes,
      signal: AbortSignal.timeout(20_000),
    });
    if (!put.ok) return '';
    return publicUrl;
  } catch {
    return '';
  }
}

/**
 * @param {unknown} data
 * @returns {string[]}
 */
function listedKeys(data) {
  const result = data && typeof data === 'object' ? data.result : null;
  const list = Array.isArray(result)
    ? result
    : (result && typeof result === 'object' ? result.objects || result.items || [] : []);
  if (!Array.isArray(list)) return [];
  return list.map((item) => (item && typeof item === 'object' ? String(item.key || '') : '')).filter(Boolean);
}
