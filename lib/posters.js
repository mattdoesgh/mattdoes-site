// Mirror Letterboxd posters into the R2 bucket `mattdoes-media` at build time.
//
// Idempotent: a key that is already in the bucket is not uploaded again.
// A failed fetch, list, or upload leaves the poster empty and the page
// omits it. This never fails the build.
//
// Auth is the existing CLOUDFLARE_API_TOKEN plus CLOUDFLARE_ACCOUNT_ID.
// Missing either skips the network. Objects are served at
// https://media.mattdoes.online/posters/<sha256>.<ext>, which is already
// allowed by img-src.

import crypto from 'node:crypto';

const BUCKET = 'mattdoes-media';
const PUBLIC_BASE = 'https://media.mattdoes.online';
const MAX_BYTES = 1_500_000;

const TYPES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * @param {string} accountId
 * @param {string} key
 * @returns {string}
 */
function objectUrl(accountId, key) {
  // Slashes in the key stay literal. Other characters are encoded.
  const pathKey = key.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${BUCKET}/objects/${pathKey}`;
}

/**
 * @param {string} key
 * @returns {string}
 */
export function posterPublicUrl(key) {
  const pathKey = key.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `${PUBLIC_BASE}/${pathKey}`;
}

/**
 * @param {unknown} data
 * @returns {string[]}
 */
function listedKeys(data) {
  const result = data && typeof data === 'object' ? /** @type {{ result?: unknown }} */ (data).result : null;
  const list = Array.isArray(result)
    ? result
    : (result && typeof result === 'object'
      ? /** @type {{ objects?: unknown, items?: unknown }} */ (result).objects
        || /** @type {{ items?: unknown }} */ (result).items
        || []
      : []);
  if (!Array.isArray(list)) return [];
  return list.map((item) => (item && typeof item === 'object' ? String(item.key || '') : '')).filter(Boolean);
}

/**
 * @param {Buffer} bytes
 * @param {string} contentType
 * @returns {string}
 */
function extensionFor(bytes, contentType) {
  const fromHeader = TYPES[contentType.split(';')[0].trim().toLowerCase()];
  if (fromHeader) return fromHeader;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 6 && bytes.toString('ascii', 0, 3) === 'GIF') return 'gif';
  return '';
}

/**
 * @param {object[]} watches
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetch]
 * @param {string} [opts.token]
 * @param {string} [opts.accountId]
 * @param {(line: string) => void} [opts.warn]
 * @returns {Promise<object[]>}
 */
export async function mirrorPosters(watches, opts = {}) {
  const list = Array.isArray(watches) ? watches : [];
  const token = opts.token ?? process.env.CLOUDFLARE_API_TOKEN ?? '';
  const accountId = opts.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
  const fetchImpl = opts.fetch || globalThis.fetch;
  const warn = opts.warn || ((line) => console.warn(line));
  const blank = (watch) => ({
    ...watch,
    poster: '',
    posterWidth: 0,
    posterHeight: 0,
    posterFull: '',
    posterFullWidth: 0,
    posterFullHeight: 0,
  });

  // Visual regression only. A poster already on our media host is kept so
  // screenshots can use fixture art. Production builds do not set this.
  if (process.env.VISUAL_FIXTURE === '1') {
    return list.map((watch) => {
      let poster = '';
      try {
        const url = new URL(String(watch?.poster || ''));
        if (url.protocol === 'https:' && url.hostname === 'media.mattdoes.online') poster = url.toString();
      } catch { /* not a fixture poster */ }
      if (!poster) return blank(watch);
      let posterFull = '';
      try {
        const fullUrl = new URL(String(watch?.posterFull || ''));
        if (fullUrl.protocol === 'https:' && fullUrl.hostname === 'media.mattdoes.online') posterFull = fullUrl.toString();
      } catch { /* the grid file also fills the scene */ }
      const width = Number(watch.posterWidth) || 0;
      const height = Number(watch.posterHeight) || 0;
      return {
        ...watch,
        poster,
        posterWidth: width,
        posterHeight: height,
        posterFull: posterFull || poster,
        posterFullWidth: Number(watch.posterFullWidth) || width,
        posterFullHeight: Number(watch.posterFullHeight) || height,
      };
    });
  }

  if (!token || !accountId) {
    if (list.some((watch) => watch?.posterSource)) {
      warn('  posters: CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID unset — posters omitted.');
    }
    return list.map(blank);
  }

  /** @type {Map<string, { poster: string, posterWidth: number, posterHeight: number }>} */
  const cache = new Map();
  const out = [];
  for (const watch of list) {
    const source = String(watch?.posterSource || '');
    if (!source) {
      out.push(blank(watch));
      continue;
    }
    if (cache.has(source)) {
      out.push({ ...watch, ...cache.get(source) });
      continue;
    }
    const mirrored = await mirrorOne(source, { token, accountId, fetchImpl, warn });
    cache.set(source, mirrored);
    out.push({ ...watch, ...mirrored });
  }
  return out;
}

/**
 * @param {Buffer} bytes
 * @returns {Promise<{ thumb: { bytes: Buffer, width: number, height: number }, full: { bytes: Buffer, width: number, height: number } } | null>}
 */
async function sizedPosters(bytes) {
  try {
    const sharp = (await import('sharp')).default;
    const thumbBytes = await sharp(bytes, { failOn: 'none' })
      .rotate()
      .resize({ width: 500, withoutEnlargement: true })
      .jpeg({ quality: 68, mozjpeg: true })
      .toBuffer();
    const fullBytes = await sharp(bytes, { failOn: 'none' })
      .rotate()
      .resize({ width: 960, withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
    if (!thumbBytes.length || !fullBytes.length) return null;
    const thumbMeta = await sharp(thumbBytes).metadata();
    const fullMeta = await sharp(fullBytes).metadata();
    return {
      thumb: { bytes: thumbBytes, width: Number(thumbMeta.width) || 0, height: Number(thumbMeta.height) || 0 },
      full: { bytes: fullBytes, width: Number(fullMeta.width) || 0, height: Number(fullMeta.height) || 0 },
    };
  } catch {
    return null;
  }
}

/**
 * @param {Buffer} bytes
 * @param {string} contentType
 * @param {{ token: string, accountId: string, fetchImpl: typeof fetch, warn: (line: string) => void }} ctx
 * @returns {Promise<string>}
 */
async function storePoster(bytes, contentType, { token, accountId, fetchImpl, warn }) {
  const ext = extensionFor(bytes, contentType);
  if (!ext) return '';
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const key = `posters/${hash}.${ext}`;
  const headers = { authorization: `Bearer ${token}` };
  let present = false;
  try {
    const listUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${BUCKET}/objects?prefix=${encodeURIComponent(key)}`;
    const listed = await fetchImpl(listUrl, { headers, signal: AbortSignal.timeout(12_000) });
    if (listed.ok) present = listedKeys(await listed.json()).includes(key);
  } catch (err) {
    warn(`  posters: could not list ${key} (${err instanceof Error ? err.message : 'error'}).`);
  }
  if (!present) {
    const put = await fetchImpl(objectUrl(accountId, key), {
      method: 'PUT',
      headers: { ...headers, 'content-type': contentType },
      body: bytes,
      signal: AbortSignal.timeout(20_000),
    });
    if (!put.ok) {
      warn(`  posters: upload ${put.status} — poster omitted.`);
      return '';
    }
  }
  return posterPublicUrl(key);
}

async function mirrorOne(source, { token, accountId, fetchImpl, warn }) {
  const empty = {
    poster: '',
    posterWidth: 0,
    posterHeight: 0,
    posterFull: '',
    posterFullWidth: 0,
    posterFullHeight: 0,
  };
  try {
    let remote;
    try { remote = new URL(source); } catch { return empty; }
    if (remote.protocol !== 'https:') return empty;
    if (remote.hostname !== 'a.ltrbxd.com' && remote.hostname !== 's.ltrbxd.com') return empty;

    const res = await fetchImpl(remote, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
      headers: { 'user-agent': 'mattdoes-site/posters', accept: 'image/avif,image/webp,image/jpeg,image/png,*/*' },
    });
    if (!res.ok) {
      warn(`  posters: fetch ${res.status} — poster omitted.`);
      return empty;
    }
    const contentType = res.headers.get('content-type') || '';
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) {
      warn('  posters: image missing or too large — poster omitted.');
      return empty;
    }
    const ext = extensionFor(bytes, contentType);
    if (!ext) {
      warn('  posters: not a jpeg, png, webp, or gif — poster omitted.');
      return empty;
    }

    const ctx = { token, accountId, fetchImpl, warn };
    const sized = await sizedPosters(bytes);
    if (sized) {
      const poster = await storePoster(sized.thumb.bytes, 'image/jpeg', ctx);
      const posterFull = await storePoster(sized.full.bytes, 'image/jpeg', ctx);
      if (!poster || !posterFull) return empty;
      return {
        poster,
        posterWidth: sized.thumb.width,
        posterHeight: sized.thumb.height,
        posterFull,
        posterFullWidth: sized.full.width,
        posterFullHeight: sized.full.height,
      };
    }

    const type = contentType.split(';')[0].trim() || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const poster = await storePoster(bytes, type, ctx);
    if (!poster) return empty;
    const measured = await measure(bytes);
    return {
      poster,
      ...measured,
      posterFull: poster,
      posterFullWidth: measured.posterWidth,
      posterFullHeight: measured.posterHeight,
    };
  } catch (err) {
    warn(`  posters: ${err instanceof Error ? err.message : 'mirror failed'} — poster omitted.`);
    return empty;
  }
}

/**
 * @param {Buffer} bytes
 * @returns {Promise<{ posterWidth: number, posterHeight: number }>}
 */
async function measure(bytes) {
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(bytes).metadata();
    return {
      posterWidth: Number(meta.width) || 0,
      posterHeight: Number(meta.height) || 0,
    };
  } catch {
    return { posterWidth: 0, posterHeight: 0 };
  }
}
