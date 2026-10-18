// Cron-only rebuild. Every six hours, POST the Pages deploy hook so the
// static build refetches Letterboxd (lib/watches.js). DEPLOY_HOOK is a
// secret set outside the repo. There is no public route; fetch() is 404.

/**
 * @param {string} hook
 * @returns {Promise<void>}
 */
async function postDeployHook(hook) {
  let res;
  try {
    res = await fetch(hook, { method: 'POST' });
  } catch {
    console.error(JSON.stringify({ event: 'rebuild_failed', reason: 'request_failed' }));
    throw new Error('deploy hook request failed');
  }
  try { await res.body?.cancel(); } catch { /* drop the body; it can echo the hook */ }
  if (!res.ok) {
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
      headers: { 'cache-control': 'no-store' },
    });
  },

  /**
   * @param {ScheduledController} _controller
   * @param {{ DEPLOY_HOOK?: string }} env
   * @returns {Promise<void>}
   */
  async scheduled(_controller, env) {
    const hook = env.DEPLOY_HOOK;
    if (typeof hook !== 'string' || !hook.startsWith('https://')) {
      console.error(JSON.stringify({ event: 'rebuild_skipped', reason: 'missing_deploy_hook' }));
      throw new Error('DEPLOY_HOOK is not configured');
    }
    await postDeployHook(hook);
  },
};
