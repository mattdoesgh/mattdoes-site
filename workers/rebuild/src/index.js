// Cron-only rebuild. Every six hours, POST the Pages deploy hook so the
// static build refetches Letterboxd (lib/watches.js). DEPLOY_HOOK is a
// secret set outside the repo. There is no public route; fetch() is 404.
//
// The hook URL is the secret. It is posted only when it is an https URL on
// api.cloudflare.com whose path is a Pages or Workers deploy hook. The
// response body is discarded. Traces are off in wrangler.toml because a
// fetch span records the full outbound URL.

import { securityHeaders } from '../../lib/transport.js';

const HOOK_PREFIXES = [
  '/client/v4/pages/webhooks/deploy_hooks/',
  '/client/v4/workers/builds/deploy_hooks/',
];

/**
 * Accept only a Cloudflare deploy-hook URL. Anything else is refused so a
 * mis-set secret cannot POST to an arbitrary host.
 *
 * @param {unknown} value
 * @returns {string} the hook URL, or '' when it is not allowed
 */
export function allowedDeployHook(value) {
  if (typeof value !== 'string' || value.length > 300) return '';
  let url;
  try { url = new URL(value); } catch { return ''; }
  if (url.protocol !== 'https:') return '';
  if (url.username || url.password) return '';
  if (url.port) return '';
  if (url.search || url.hash) return '';
  if (url.hostname !== 'api.cloudflare.com') return '';
  const prefix = HOOK_PREFIXES.find((item) => url.pathname.startsWith(item));
  if (!prefix) return '';
  const id = url.pathname.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) return '';
  return url.href;
}

/**
 * @param {string} hook
 * @returns {Promise<void>}
 */
async function postDeployHook(hook) {
  let res;
  try {
    // manual: do not follow a redirect that would send the secret URL as
    // Referer. no-referrer covers the request itself.
    res = await fetch(hook, {
      method: 'POST',
      redirect: 'manual',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    console.error(JSON.stringify({ event: 'rebuild_failed', reason: 'request_failed' }));
    throw new Error('deploy hook request failed');
  }
  try { await res.body?.cancel(); } catch { /* drop the body; it can echo the hook */ }
  if (res.status < 200 || res.status >= 300) {
    console.error(JSON.stringify({ event: 'rebuild_failed', status: res.status }));
    throw new Error(`deploy hook status ${res.status}`);
  }
  console.log(JSON.stringify({ event: 'rebuild_requested', status: res.status }));
}

export default {
  /** Not routed. A direct hit must not reveal the hook or trigger a rebuild. */
  async fetch() {
    return new Response(null, {
      status: 404,
      headers: {
        ...securityHeaders(),
        'cache-control': 'no-store',
      },
    });
  },

  /**
   * @param {ScheduledController} _controller
   * @param {{ DEPLOY_HOOK?: string }} env
   * @returns {Promise<void>}
   */
  async scheduled(_controller, env) {
    const hook = allowedDeployHook(env.DEPLOY_HOOK);
    if (!hook) {
      console.error(JSON.stringify({ event: 'rebuild_skipped', reason: 'missing_deploy_hook' }));
      throw new Error('DEPLOY_HOOK is not configured');
    }
    await postDeployHook(hook);
  },
};
