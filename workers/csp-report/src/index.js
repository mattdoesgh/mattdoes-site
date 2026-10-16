// /api/csp-report — same-origin CSP violation collector.
//
// Browsers POST application/csp-report (or application/reports+json) bodies
// here when Content-Security-Policy-Report-Only is set in static/_headers.
// Reports are capped, optionally stored in KV for later review, and never
// echoed back to the client.
//
// Env / bindings:
//   CSP_REPORTS — optional Workers KV for short-lived report storage
//   CSP_RL      — required per-IP rate limit. Missing or unhealthy → 503
//                 before the body is read. Stored reports key on a hash
//                 of the client IP, never the address itself.

import {
  errorJson, corsPreflight, kvPut, getClientIp, securityHeaders,
} from '../../lib/transport.js';

const MAX_BODY_BYTES = 32 * 1024;
const KV_TTL_S       = 7 * 24 * 60 * 60;
const ALLOWED_CT = [
  'application/csp-report',
  'application/json',
  'application/reports+json',
];

function acceptResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      ...securityHeaders(),
      'cache-control': 'no-store',
    },
  });
}

function isAllowedContentType(ct) {
  const base = (ct || '').split(';')[0].trim().toLowerCase();
  return ALLOWED_CT.includes(base);
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Per-IP gate. Runs before the body is read so a flood cannot spend the
 * Worker on payload parsing. Fails closed when the binding is missing,
 * unhealthy, or the request has no Cloudflare client IP — otherwise the
 * limit could be skipped.
 *
 * @param {Request} request
 * @param {{ CSP_RL?: { limit: Function } }} env
 * @returns {Promise<Response|null>}
 */
async function enforceReportLimit(request, env) {
  if (!env.CSP_RL || typeof env.CSP_RL.limit !== 'function') {
    return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }
  const ip = getClientIp(request);
  if (!ip) {
    return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }
  try {
    const { success } = await env.CSP_RL.limit({ key: `${ip}:csp-report` });
    if (!success) return errorJson({ error: 'rate_limited' }, 429, { retryAfterS: 60 });
  } catch {
    return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return corsPreflight();
    if (request.method !== 'POST') {
      return errorJson({ error: 'method_not_allowed' }, 405);
    }

    const url = new URL(request.url);
    if (!url.pathname.endsWith('/csp-report')) {
      return errorJson({ error: 'not_found' }, 404);
    }

    if (!isAllowedContentType(request.headers.get('content-type'))) {
      return errorJson({ error: 'unsupported_media_type' }, 415);
    }

    const len = Number(request.headers.get('content-length') || '0');
    if (len > MAX_BODY_BYTES) {
      return errorJson({ error: 'payload_too_large' }, 413);
    }

    const limited = await enforceReportLimit(request, env);
    if (limited) return limited;

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return errorJson({ error: 'payload_too_large' }, 413);
    }

    if (env.CSP_REPORTS && body) {
      const ip = getClientIp(request);
      try {
        const ipHash = await sha256Hex(ip);
        const key = `csp:${Date.now()}:${ipHash}`;
        ctx.waitUntil(kvPut(env.CSP_REPORTS, key, body, { expirationTtl: KV_TTL_S }));
      } catch {
        // Drop the report rather than persist the raw client IP.
      }
    }

    return acceptResponse();
  },
};
