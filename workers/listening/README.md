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

## Refresh policy

Both endpoints use stale-while-revalidate against a Workers KV cache
(`LASTFM_CACHE`). Medium defaults:

| State | Age              | Behavior                                         |
|-------|------------------|--------------------------------------------------|
| FRESH | < 5 min          | Serve from KV. No upstream call.                 |
| SOFT  | 5–30 min         | Serve stale from KV, refresh in background.      |
| HARD  | ≥ 30 min / empty | Block, fetch from Last.fm, write KV, serve.      |

A 60-second KV lock (`lock:<key>`) dedupes concurrent background refreshes so
a burst of polling clients only triggers one upstream call per SOFT window.
If Last.fm is down and KV still has any cached entry, we serve the stale
copy rather than erroring.

To tighten or loosen, edit `FRESH_MS` / `HARD_MS` at the top of
`src/index.js`.

## Deploy

```bash
cd workers/listening
npm install

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

Both routes are served by the same Worker — see `wrangler.toml`.

## Last.fm API etiquette

- Upstream calls happen only during background refreshes; the request path
  always reads from KV.
- A descriptive `User-Agent` (`mattdoes-site/1.0 (+https://mattdoes.online)`)
  is sent so Last.fm can identify and rate-limit this client distinctly.
- `/listening/` on the site carries attribution linking back to Last.fm —
  if the listening page is ever refactored, keep that link present.
