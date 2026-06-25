// Test helper — minimal stubs for the Cloudflare Worker runtime so the geo
// and listening Workers can be exercised under node:test without wrangler.
//
// Provides: an in-memory KV namespace, an ExecutionContext stub, a Cache API
// stub, and an installer for the global `caches` object.

/**
 * In-memory Workers KV namespace stub. Supports the subset the Workers use:
 * get (text + { type:'json' }), put (with expirationTtl honoured against a
 * monotonic clock), and delete. expirationTtl is enforced lazily on read.
 */
export class KVStub {
  constructor() { this.store = new Map(); }

  async get(key, opts) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt != null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    if (opts && opts.type === 'json') {
      try { return JSON.parse(entry.value); } catch { return null; }
    }
    return entry.value;
  }

  async put(key, value, opts) {
    const expiresAt = opts && opts.expirationTtl != null
      ? Date.now() + opts.expirationTtl * 1000
      : null;
    this.store.set(key, { value: String(value), expiresAt });
  }

  async delete(key) { this.store.delete(key); }
}

/**
 * Durable Object state stub — the subset the ListeningPoller uses: the alarm
 * API (`storage.getAlarm`/`setAlarm`/`deleteAlarm`). The scheduled alarm time
 * is held in memory so tests can assert the poller re-armed itself.
 */
export class DurableStateStub {
  constructor() {
    this._alarm = null;
    this.storage = {
      getAlarm:    async () => this._alarm,
      setAlarm:    async (time) => { this._alarm = time; },
      deleteAlarm: async () => { this._alarm = null; },
    };
  }
}

/** ExecutionContext stub — runs waitUntil callbacks synchronously-ish. */
export function makeCtx() {
  const pending = [];
  return {
    waitUntil(p) { pending.push(Promise.resolve(p)); },
    passThroughOnException() {},
    /** Await every scheduled background task (test convenience). */
    async settle() { await Promise.allSettled(pending); },
  };
}

/**
 * Cache API stub. The Workers call `caches.default.match()/put()`. This stub
 * keys on the request URL string and stores cloned Response bodies.
 */
export class CacheStub {
  constructor() { this.entries = new Map(); }
  async match(req) {
    const url = typeof req === 'string' ? req : req.url;
    const stored = this.entries.get(url);
    return stored ? stored.clone() : undefined;
  }
  async put(req, res) {
    const url = typeof req === 'string' ? req : req.url;
    this.entries.set(url, res.clone());
  }
}

/**
 * Install a global `caches` object backed by a fresh CacheStub and return a
 * restore function. Workers reference `caches.default` directly.
 */
export function installCaches() {
  const prior = globalThis.caches;
  const stub = new CacheStub();
  globalThis.caches = { default: stub, open: async () => stub };
  return {
    cache: stub,
    restore() {
      if (prior === undefined) delete globalThis.caches;
      else globalThis.caches = prior;
    },
  };
}

/**
 * Install a stub global `fetch` and return { calls, restore }. `handler` is
 * called with (url, init) and must return a Response (or a value Response can
 * wrap). `calls` accumulates every requested URL so tests can assert on
 * upstream call volume.
 *
 * @param {(url: string, init?: object) => Response|Promise<Response>} handler
 */
export function installFetch(handler) {
  const prior = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push(url);
    return handler(url, init);
  };
  return {
    calls,
    restore() {
      if (prior === undefined) delete globalThis.fetch;
      else globalThis.fetch = prior;
    },
  };
}

/** Build a JSON Response — convenience for fetch handlers. */
export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Build a Request for a worker route. */
export function workerRequest(url, { method = 'GET', headers = {}, body } = {}) {
  return new Request(url, { method, headers, body });
}
