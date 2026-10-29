// site.config.js — build settings the render and the fetchers read.

/**
 * @typedef {object} SiteConfig
 * @property {string} title
 * @property {string} url     canonical origin, no trailing slash
 * @property {{
 *   username: string,    // intentionally blank in the repo — set via env
 *   limit: number,       // # of recent tracks to render
 *   cacheTtl: number,    // seconds — build-time cache only
 *   showUser: boolean,
 * }} lastfm
 * @property {{
 *   profile: string,     // public profile; also a footer/about link
 *   feed: string,        // diary RSS, fetched at build time
 *   limit: number,       // recent watches to render (not a full diary)
 *   cacheTtl: number,    // seconds — diary and films-watched count
 * }} letterboxd
 */

/** @type {SiteConfig} */
export const siteConfig = {
  title: 'mattdoes.online',
  url:   'https://mattdoes.online',

  // Last.fm integration for /listening/.
  // Username is blank here so it stays out of the public repo. Set
  // LASTFM_USERNAME and LASTFM_API_KEY as Cloudflare Pages env vars.
  //
  // These settings govern the *build-time* snapshot rendered into the static
  // HTML. Recent plays stay live through workers/listening. The monthly
  // album chart is the weekly snapshot that worker stores.
  lastfm: {
    username: '',       // read from LASTFM_USERNAME env var at build time
    limit:    25,       // how many recent tracks to render on /listening/
    cacheTtl: 15 * 60,  // seconds — build-time on-disk cache TTL only
    showUser: false,    // do not render 'last.fm/<user>' link on /listening/
    // The monthly album chart is that weekly snapshot
    // (GET /api/listening/charts) at build time. When fewer than 25 covers
    // survive, the build asks Last.fm for a deeper monthly chart so the
    // next album with real art fills the grid. That needs LASTFM_API_KEY
    // and LASTFM_USERNAME. A failed fetch keeps the short chart.
    // Progressive JPEGs are re-encoded in this build and stored on the
    // media host. Preview builds have no R2 token; they reuse a copy
    // already at media.mattdoes.online/covers/<sha>.jpg, or drop the tile.
  },

  // Letterboxd for /watching/. The diary RSS is a recent window (limit),
  // baked at build time. The lifetime films-watched count is the Watched
  // total on {profile}/films/ — the RSS has no total. Same cache TTL.
  // LETTERBOXD_OFFLINE=1 skips both fetches (CI and tests). See lib/watches.js.
  letterboxd: {
    profile:  'https://letterboxd.com/mattdoes',
    feed:     'https://letterboxd.com/mattdoes/rss/',
    limit:    25,
    cacheTtl: 6 * 60 * 60,
  },
};
