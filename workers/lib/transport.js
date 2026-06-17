// workers/lib/transport.js — shared edge-transport helpers (see CONTEXT.md:
// Edge transport, and docs/adr/0002-shared-worker-code-via-relative-imports.md).
//
// Response envelopes (JSON + CORS), CORS preflight, error responses with
// edge-TTL / retry-after policy, fail-open KV access, and small request
// helpers shared by every Worker under workers/. Caching POLICY stays in
// each Worker — they pass their own cache-control strings and TTLs in.
//
// ⚠ Deploy coupling: this file is bundled into every Worker that imports it.
// Editing it (or any other module a Worker bundles) means redeploying ALL
// workers — `npm run deploy:workers` from the repo root does both.

export const ALLOWED_ORIGIN = 'https://mattdoes.online';

function securityHeaders() {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy':       'strict-origin-when-cross-origin',
  };
}

/**
 * JSON response with the site's CORS envelope. Every Worker payload —
 * success or error — goes through here so the header set stays uniform.
 *
 * @param {object} obj    response body
 * @param {number} [status]
 * @param {string} [origin]
 * @returns {Response}
 */
export function json(obj, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...securityHeaders(),
      'content-type':                 'application/json; charset=utf-8',
      'access-control-allow-origin':  origin,
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

/**
 * JSON error response with a short edge-cache / retry-after window so
 * negative, busy, rate-limited, and upstream-failure replies aren't
 * re-probed on every request. Builds on {@link json} so the CORS envelope
 * stays consistent across every error a Worker emits.
 *
 * @param {object} obj  response body
 * @param {number} status
 * @param {object} [opts]
 * @param {number} [opts.edgeTtlS]     seconds for `s-maxage` edge caching
 *   (0 = `no-store`; the browser never caches errors either way)
 * @param {number} [opts.retryAfterS]  seconds for a `retry-after` header
 * @param {string} [opts.origin]
 * @returns {Response}
 */
export function errorJson(obj, status, { edgeTtlS = 0, retryAfterS = null, origin = ALLOWED_ORIGIN } = {}) {
  const res = json(obj, status, origin);
  const h = new Headers(res.headers);
  if (edgeTtlS > 0) {
    // No browser caching — only the shared edge cache holds it briefly so a
    // repeated failing request collapses to one Worker run per window.
    h.set('cache-control', `public, max-age=0, s-maxage=${edgeTtlS}`);
  } else {
    h.set('cache-control', 'no-store');
  }
  if (retryAfterS != null) h.set('retry-after', String(retryAfterS));
  return new Response(res.body, { status, headers: h });
}

/**
 * Stamp a success response with the Worker's client-facing cache policy.
 * The cache-control string is the caller's: edge/browser TTL trade-offs are
 * a per-Worker design decision, not a transport concern.
 *
 * @param {Response} response
 * @param {string} cacheControl  full `cache-control` header value
 * @param {string} [origin]
 * @returns {Response}
 */
export function withCache(response, cacheControl, origin = ALLOWED_ORIGIN) {
  const h = new Headers(response.headers);
  h.set('cache-control', cacheControl);
  h.set('access-control-allow-origin', origin);
  return new Response(response.body, { status: response.status, headers: h });
}

/**
 * CORS preflight response (OPTIONS).
 *
 * @param {string} [origin]
 * @returns {Response}
 */
export function corsPreflight(origin = ALLOWED_ORIGIN) {
  return new Response(null, {
    status: 204,
    headers: {
      ...securityHeaders(),
      'access-control-allow-origin':  origin,
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age':       '86400',
    },
  });
}

/**
 * Fail-open KV read: an absent binding or a throwing namespace reads as a
 * cache miss (`null`). A miss is recoverable; a crashed handler is not.
 *
 * @param {KVNamespace} [namespace]
 * @param {string} key
 * @param {object} [opts]  passed through to `namespace.get`
 * @returns {Promise<any|null>}
 */
export async function kvGet(namespace, key, opts) {
  if (!namespace) return null;
  try {
    return await namespace.get(key, opts);
  } catch {
    return null;
  }
}

/**
 * Fail-open KV write: errors are swallowed — the next refresh retries, and
 * the worst case is an extra upstream call, never a failed response.
 *
 * @param {KVNamespace} [namespace]
 * @param {string} key
 * @param {string} value
 * @param {object} [opts]  passed through to `namespace.put`
 * @returns {Promise<void>}
 */
export async function kvPut(namespace, key, value, opts) {
  if (!namespace) return;
  try {
    await namespace.put(key, value, opts);
  } catch { /* non-fatal */ }
}

/**
 * The caller's IP as Cloudflare saw it, or `null` outside Cloudflare
 * (tests, `wrangler dev` without a proxy). Callers choose their own
 * fallback posture: fail open, or bucket under a sentinel key.
 *
 * @param {Request} request
 * @returns {string|null}
 */
export function getClientIp(request) {
  return request.headers.get('cf-connecting-ip');
}

/**
 * Shorten an error for inclusion in a response body — message only,
 * capped so an exotic upstream error can't bloat the payload.
 *
 * @param {unknown} err
 * @returns {string}
 */
export function shortError(err) {
  return String(err?.message || err).slice(0, 200);
}
