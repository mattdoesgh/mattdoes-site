# Digs, movies, and grok says…

Three public pages. One copy of each piece of data.

| Page | Route | What it is |
| --- | --- | --- |
| digs | `/digs/` | Weekly music. Source of truth for every pick. |
| movies | `/movies/` | Recent Letterboxd watches. Not recommendations. |
| grok says… | `/grok/` | Recommendations hub. Favorite digs, plus anything else. |

The reading nav is writing, posts, listening, about. Posts is the X feed
(`/posts/`), not a notes section. These
three pages, and the Letterboxd / X / Instagram / Last.fm profile links, are
in the footer on every page.

## Add a digs week

Add `content/digs/YYYY-MM-DD.json`. The filename is the week date and must
match `weekOf`. Weeks render newest first. Older weeks sit in the archive
(collapsed). The newest week is open.

```json
{
  "weekOf": "2026-10-19",
  "sample": false,
  "picks": [
    {
      "artist": "Artist",
      "blurb": "Why this one.",
      "starter": "Album or track",
      "favorite": true,
      "appleMusic": "https://music.apple.com/us/album/…",
      "appleMusicEmbed": "https://embed.music.apple.com/us/album/…",
      "bandcamp": "https://artist.bandcamp.com/album/…",
      "bandcampEmbed": "https://bandcamp.com/EmbeddedPlayer/album=…/size=large/bgcol=333333/linkcol=ffffff/tracklist=false/artwork=small/transparent=true/"
    }
  ]
}
```

- `artist`, `blurb`, and `starter` are required.
- `favorite: true` marks the pick. Favorites show a label on `/digs/` and are
  listed on `/grok/`, linking back to the pick. You do not copy the pick
  anywhere else.
- At least one of `appleMusic` or `bandcamp`. The embed fields are optional.
  Embeds have to be `https://embed.music.apple.com/…` or
  `https://bandcamp.com/EmbeddedPlayer/…`. Any other host fails the build.
- Leave `sample: true` only on placeholder weeks. Delete
  `content/digs/2026-10-12.json` when the first real week replaces it.
- Players are lazy iframes. CSP `frame-src` allows those two hosts and nothing
  else (`static/_headers`). No new script, no third-party `connect-src`.

## Publish something that isn't a dig

Edit `content/recommendations.json`. These show on `/grok/` under "also".
They are not copied onto `/digs/`.

```json
{
  "picks": [
    {
      "title": "A book, a link, a note",
      "detail": "One or two sentences.",
      "href": "https://example.com/…",
      "kind": "read",
      "sample": false
    }
  ]
}
```

`href` and `kind` are optional. `sample: true` labels a placeholder. An empty
`picks` array hides the section.

Movie watches do not go here. They come from Letterboxd.

## Movies

`/movies/` shows the **25 most recent film entries** in the Letterboxd diary
RSS (`https://letterboxd.com/mattdoes/rss/`, set in `site.config.js` as
`letterboxd.feed`). The feed is already a recent window, not a full diary
export. List items with no film title are dropped. The automatic "Watched on
…" stub is dropped; a real review is kept, clipped around 280 characters.

The fetch happens at build time (`lib/watches.js`), same shape as the
listening snapshot:

1. fresh disk cache (`.cache/letterboxd.json`, gitignored)
2. the RSS
3. a stale cache
4. empty

`LETTERBOXD_OFFLINE=1` skips the network. CI and `npm test` set it. The
production Pages build does not, so a deploy bakes the live feed. There is
no Worker for this — deploys are often enough, and a down feed falls back to
the cache instead of failing the build.

The page links to the Letterboxd profile. It does not embed the feed.
