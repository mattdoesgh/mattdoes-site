// /api/csp-report — same-origin CSP violation collector.
//
// Browsers POST application/csp-report (or application/reports+json) bodies
// here when Content-Security-Policy-Report-Only is set in static/_headers.
// Reports are capped, optionally stored in KV for later review, and never
// echoed back to the client.
//
// Env / bindings:
//   CSP_REPORTS — optional Workers KV for short-lived report storage

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

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return errorJson({ error: 'payload_too_large' }, 413);
    }

    if (env.CSP_REPORTS && body) {
      const ip = getClientIp(request) || 'unknown';
      const key = `csp:${Date.now()}:${ip}`;
      ctx.waitUntil(kvPut(env.CSP_REPORTS, key, body, { expirationTtl: KV_TTL_S }));
    }

    return acceptResponse();
  },
};
