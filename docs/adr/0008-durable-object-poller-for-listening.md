# A Durable Object poller is the single Last.fm producer

The listening Worker coupled Last.fm polling to visitor request traffic. The
`fetch` handler ran a stale-while-revalidate state machine over KV: FRESH
(< 60s) served KV; SOFT (60s–30min) served stale and kicked a background
refresh deduped by a 60s KV lock; HARD (≥ 30min or empty) **blocked the request
on a synchronous Last.fm call**, wrote KV, then served. `/now` and `/recent`
each refreshed independently, so two `user.getrecenttracks` calls covered the
same underlying data.

Two consequences worked against what the live surface needs. First, it was not
always immediate: after a quiet gap, on a cold isolate, or after KV eviction,
the *first* visitor hit the HARD band and waited on Last.fm — and if Last.fm was
slow or down, they waited, then got stale or empty. Second, upstream volume
tracked traffic: calls were triggered by reads, shielded from concurrency only
by the lock and a 15s edge cache, but still initiated by visitors.

We decided: a single-writer **Listening poller** — a Durable Object
(`ListeningPoller`, a singleton via `idFromName('singleton')`) — becomes the
*only* code that calls Last.fm. A self-rescheduling alarm (~25s,
`POLL_INTERVAL_MS`) makes one `user.getrecenttracks` call (limit 25), derives
both the `/now` and `/recent` payloads from one decode, and writes both KV keys.
On any upstream failure it writes nothing, so the last good snapshot survives;
the alarm is re-armed *before* the fetch so a failed poll can never break the
self-perpetuating chain (Durable Object alarms also auto-retry a thrown handler).

The `fetch` handler collapses to a **pure KV reader**: rate-limit → edge cache →
read KV → serve verbatim. It never calls Last.fm, never blocks, and has zero
Last.fm knowledge. Before the first poll (e.g. right after deploy) KV is empty
and it returns a `warming` fallback — a truthy `reason`, so under contract C7
clients keep their last-known-good UI and the build-time snapshot
(`lib/listening.js`) falls through to its disk cache instead of baking an empty
page.

The poller writes *through* to the existing `LASTFM_CACHE` KV rather than serving
reads itself, deliberately. Reads stay edge-replicated and fast globally, and the
single DO never sees visitor traffic — so "shielded from concurrent visitors" is
structural, not best-effort: a traffic spike adds only edge-cached KV reads, zero
extra DO load, zero extra Last.fm calls. Upstream volume is constant
(~2,880 calls/day) regardless of traffic.

A DO alarm is durable once set and self-perpetuates, but nothing starts it on
first deploy (or if the chain ever permanently breaks). A cron watchdog
(`[triggers] crons = ["* * * * *"]`, dispatched by the Worker's `scheduled`
handler) pokes the poller once a minute to arm the alarm if none is pending. The
watchdog makes **no** Last.fm call; it is the active form of the "pure reader +
monitoring" resilience posture — detect-and-re-arm a dropped poller without ever
touching the read path. If the poller is genuinely down, the reader serves the
last good KV snapshot (no `reason`, so clients treat it as current) until
observability — DO/cron metrics, `wrangler tail`, or each KV entry's `fetchedAt`
— surfaces it. This is the one new failure mode and is called out for monitoring.

Consequence — a classic (non-RPC) DO class. The Worker module is imported
directly by the `node --test` harness, which cannot resolve the `cloudflare:workers`
module that modern RPC DOs require. So `ListeningPoller` is a plain class with a
`fetch()` bootstrap route and an `alarm()` method, constructed as
`new ListeningPoller(state, env)` in tests. The DO is trivial (one alarm, one
idempotent bootstrap), so RPC ergonomics would buy nothing here.

Consequence — a singleton DO that is *not* a request bottleneck. The usual "one
global DO" anti-pattern is about routing visitor traffic through a single
instance. This DO serves no visitor traffic at all: it only receives the
once-a-minute watchdog poke and runs its own alarm. It is a background poller, so
the single-instance design is correct, not a bottleneck.

Consequence — deploy. Adding the class runs a `wrangler` migration
(`new_sqlite_classes = ["ListeningPoller"]`) on first deploy; migrations are not
casually reversible, so land it deliberately. Only `workers/listening/` changes —
shared `workers/lib/transport.js` and `lib/lastfm.js` are untouched, so the
ADR 0002 redeploy-all coupling is not triggered (only this Worker redeploys). The
`/now` and `/recent` payload shapes and the C7 `reason` contract are unchanged, so
both client scripts and the build-time snapshot (ADR 0006) need no changes.

## Relationship to ADR 0006

ADR 0006 *rejected* a "scheduled job" — but a different one: a **repo-commit
cron** that commits a refreshed `.cache/lastfm.json` into git, rejected because
it "adds commit noise, a cron, and staleness for no gain over reading the Worker
that already holds fresh data." This decision is orthogonal: the cron here is a
Cloudflare watchdog that arms an edge Durable Object writing **KV, not git**, and
it is precisely the mechanism that keeps "the Worker that already holds fresh
data" fresh. ADR 0006's premise — the build reads the live Worker's `/recent` —
is strengthened, not contradicted: that route still reads KV and returns the same
shape.

## Considered Options

- **Keep the request-coupled SWR machine** — the status quo. Rejected: it blocks
  the first cold/quiet-gap visitor on a synchronous Last.fm call, couples upstream
  volume to traffic, and smears the "when do we call Last.fm" decision across
  bands, a lock, and a blocking fallback on the hot read path.
- **A 60s Cron Trigger producer** (no Durable Object) — simplest infra, constant
  upstream volume, pure reader. Rejected as the primary mechanism: Cloudflare cron
  granularity floors at 60s, so now-playing could not go sub-minute. (A cron still
  appears here, but only as the liveness watchdog, not the poller.)
- **A request-path stale-guard** — keep the reader pure until KV is very stale
  (cron/poller presumed dead), then do a one-off blocking refresh. Rejected: it
  re-introduces exactly what this removes — a request-coupled Last.fm call and the
  dedupe lock — diluting the pure-reader property for a degraded case that
  monitoring + the watchdog already cover. Recorded as a deferred resilience knob.
- **Serve reads from the Durable Object directly** (DO storage as source of
  truth) — rejected: it puts a single global instance on the read path (a hop per
  edge-cache miss, worse latency for distant visitors, and visitor load on the one
  DO), undoing the "shielded from concurrent visitors" win that KV write-through
  gives for free.
