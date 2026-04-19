# mattdoes-listening worker

`/api/listening/now` — a tiny edge Worker that reports the current Last.fm
now-playing track. Called by `/now-playing.js` on every page load to keep
the topbar status pill live between deploys.

## Deploy

```bash
cd workers/listening
npm install
npx wrangler secret put LASTFM_USERNAME
npx wrangler secret put LASTFM_API_KEY
npx wrangler deploy
```

Secrets are used instead of `[vars]` so the username stays out of the public
repo. The Worker edge-caches responses for 30 seconds, so even if the
client polls every minute we only hit Last.fm twice a minute at most.

## Response shape

```json
{ "nowPlaying": true,  "artist": "...", "track": "...", "album": "...", "link": "..." }
{ "nowPlaying": false }
```
