# mattdoes-listening worker

Tiny edge Worker that powers the live bits of `/listening/` between deploys.

## Endpoints

### `GET /api/listening/now`
Called by `/now-playing.js` on every page load to keep the topbar status pill
live. Returns:

```json
{ "nowPlaying": true,  "artist": "…", "track": "…", "album": "…", "link": "…" }
{ "nowPlaying": false }
```

### `GET /api/listening/recent`
Called by `/listening-live.js` on `/listening/` to refresh the scrobble
counter and the 25-track list without a rebuild. Returns:

```json
{
  "playcount": 12345,
  "tracks": [
    { "artist": "…", "track": "…", "album": "…", "link": "…",
      "date": "2026-04-19T14:32:01.000Z", "nowPlaying": false }
  ]
}
```

`playcount` is pulled from Last.fm's `@attr.total` on the same
`user.getrecenttracks` response that feeds `tracks`, so one upstream call
covers both the counter and the list.

## Producer / reader split

Last.fm polling is fully decoupled from visitor traffic:

- **Producer** — a single-writer Durable Object (`ListeningPoller`) is the only
  thing that calls Last.fm. A self-rescheduling alarm (~`POLL_INTERVAL_MS`, 25s)
  makes one `user.getrecenttracks` call (limit 25), derives both the `/now` and
  `/recent` payloads from one decode, and writes both KV keys. On any upstream
  failure it writes nothing, so the last good snapshot survives and the alarm
  (re-armed first) retries on the next tick. Upstream volume is therefore
  constant (~1 call/25s ≈ 2,880/day), independent of how many people are on the
  site.
- **Reader** — the `fetch()` handler is a pure KV reader: rate-limit → edge cache
  → read KV → serve verbatim. It never calls Last.fm and never blocks. Before the
  first poll (e.g. right after deploy) KV is empty and it returns a `warming`
  fallback — a truthy `reason` so clients keep their last-known-good UI.

A cron watchdog (`[triggers]` in `wrangler.toml`) pokes the poller once a minute
to arm its alarm if none is pending — liveness only, never an upstream call. The
~25s cadence lives in `POLL_INTERVAL_MS` at the top of `src/index.js`.

## Deploy

```bash
# wrangler is installed once for all Workers from workers/package.json:
npm --prefix workers install
cd workers/listening

# One-time KV setup. Wrangler validates the full wrangler.toml before
# running any command, so the [[kv_namespaces]] block stays commented out
# until the namespace exists.
npx wrangler kv namespace create LASTFM_CACHE
# → paste the returned id into wrangler.toml, then uncomment the block.

# Secrets (kept out of the public repo):
npx wrangler secret put LASTFM_USERNAME
npx wrangler secret put LASTFM_API_KEY

npx wrangler deploy
```

The first deploy runs the `v1` Durable Object migration (`new_sqlite_classes`)
— migrations aren't casually reversible, so land it deliberately. Within a
minute the cron watchdog arms the poller's alarm and KV warms; to skip the
≤60s `warming` window, poke the poller once after deploy.

Both read routes and the poller DO live in the same Worker — see `wrangler.toml`.

### Local testing

`wrangler dev --test-scheduled` exposes a `/__scheduled` endpoint that fires the
cron watchdog (which arms the alarm); the alarm then polls Last.fm and populates
KV, after which `/api/listening/now` and `/recent` serve it instantly:

```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
curl http://localhost:8787/api/listening/now
```

## Last.fm API etiquette

- Upstream calls come only from the poller DO's ~25s alarm; the request path
  always reads from KV, never from Last.fm.
- A descriptive `User-Agent` (`mattdoes-site/1.0 (+https://mattdoes.online)`)
  is sent so Last.fm can identify and rate-limit this client distinctly.
- `/listening/` on the site carries attribution linking back to Last.fm —
  if the listening page is ever refactored, keep that link present.
