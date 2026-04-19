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

Edge-cached for 30 seconds.

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

Edge-cached for 45 seconds.

## Deploy

```bash
cd workers/listening
npm install
npx wrangler secret put LASTFM_USERNAME
npx wrangler secret put LASTFM_API_KEY
npx wrangler deploy
```

Secrets are used instead of `[vars]` so the username stays out of the public
repo. Both routes are served by the same Worker — see `wrangler.toml`.
