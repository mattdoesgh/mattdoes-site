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
//                 before the body is read. The limit key and any stored
//                 report key are a hash of the client IP, never the address.

import {
  ALLOWED_ORIGIN, errorJson, corsPreflight, kvPut, getClientIp, securityHeaders,
} from '../../lib/transport.js';

const MAX_BODY_BYTES = 32 * 1024;
const KV_TTL_S       = 7 * 24 * 60 * 60;
const REPORT_METHODS = 'POST, OPTIONS';
const ALLOWED_CT = [
  'application/csp-report',
  'application/json',
  'application/reports+json',
];

// Query values that must not be written to KV if a report URL carries them.
const SECRET_QUERY = /([?&](?:api[_-]?key|apikey|access[_-]?token|token|secret|signature|sig|key)=)[^&#\s"'<>]*/gi;

function reportError(obj, status, opts = {}) {
  return errorJson(obj, status, { ...opts, methods: REPORT_METHODS });
}

function redactSecrets(body) {
  return body.replace(SECRET_QUERY, '$1redacted');
}

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
    return reportError({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }
  const ip = getClientIp(request);
  if (!ip) {
    return reportError({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }
  try {
    const { success } = await env.CSP_RL.limit({ key: `${await sha256Hex(ip)}:csp-report` });
    if (!success) return reportError({ error: 'rate_limited' }, 429, { retryAfterS: 60 });
  } catch {
    return reportError({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return corsPreflight(ALLOWED_ORIGIN, REPORT_METHODS);
    if (request.method !== 'POST') {
      return reportError({ error: 'method_not_allowed' }, 405);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/csp-report') {
      return reportError({ error: 'not_found' }, 404);
    }

    if (!isAllowedContentType(request.headers.get('content-type'))) {
      return reportError({ error: 'unsupported_media_type' }, 415);
    }

    const len = Number(request.headers.get('content-length') || '0');
    if (len > MAX_BODY_BYTES) {
      return reportError({ error: 'payload_too_large' }, 413);
    }

    const limited = await enforceReportLimit(request, env);
    if (limited) return limited;

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return reportError({ error: 'payload_too_large' }, 413);
    }

    let stored = '';
    if (body) {
      try {
        JSON.parse(body);
      } catch {
        return reportError({ error: 'bad_request' }, 400);
      }
      stored = redactSecrets(body);
    }

    if (env.CSP_REPORTS && stored) {
      const ip = getClientIp(request);
      try {
        const ipHash = await sha256Hex(ip);
        const key = `csp:${Date.now()}:${ipHash}`;
        ctx.waitUntil(kvPut(env.CSP_REPORTS, key, stored, { expirationTtl: KV_TTL_S }));
      } catch {
        // Drop the report rather than persist the raw client IP.
      }
    }

    return acceptResponse();
  },
};
