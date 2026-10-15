# In-repo digs and a build-time Letterboxd snapshot

Weekly music picks and the recommendations hub are not vault notes. The vault
stays the writing source; these pages are small structured lists that change
on purpose, in the public repo, and should render even when the vault clone
is the fixture set CI uses.

We decided:

- **Digs** live in `content/digs/YYYY-MM-DD.json`, one file per week. `lib/digs.js`
  validates them. A `favorite` boolean is the only mark. `/digs/` is the
  archive. `/grok/` ("grok says…") lists those favorites by reading the same
  objects — it does not keep a second copy of the week.
- **Other recommendations** (anything that is not a dig) live in
  `content/recommendations.json`. Empty is fine.
- **Movies** are recent Letterboxd watches, not recommendations. `lib/watches.js`
  fetches `https://letterboxd.com/mattdoes/rss/` at build time, caches it under
  `.cache/`, and passes the parsed list into Emit. The page shows the 25 most
  recent film entries. `LETTERBOXD_OFFLINE=1` skips the network the same way
  `LISTENING_OFFLINE=1` does for Last.fm. There is no new Worker: the feed is
  public, low-frequency, and a stale page between deploys is acceptable.
- **Players** on `/digs/` are lazy iframes. `frame-src` allows
  `https://embed.music.apple.com` and `https://bandcamp.com` only. The same
  allowlist is enforced when a week file is loaded, so a new embed host fails
  the build instead of silently violating CSP.
- **Navigation.** The primary reading nav stays writing / thoughts / listening
  / about. Digs, movies, and grok says are in the footer on every page, and
  each of those pages links the other two. Letterboxd, X, Instagram, and
  Last.fm are profile links in that same footer (and on the about page). No
  embedded feeds for those profiles.

How to add a week or another recommendation: `docs/recommendations.md`.
