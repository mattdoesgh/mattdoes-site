// site.config.js — single source of identity + per-section copy.
// Leave any string empty to omit that element from the rendered page.

/**
 * @typedef {object} SiteLink
 * @property {string} label    rendered label, e.g. `'github'`
 * @property {string} href     URL (any safeUrl-allowed scheme)
 * @property {string} [meta]   optional secondary text shown next to label
 *
 * @typedef {object} SiteSection
 * @property {string} [who]    left-rail heading
 * @property {string} [bio]    left-rail subtitle
 * @property {string} [intro]  lede above the listing
 *
 * @typedef {object} SiteConfig
 * @property {string} title
 * @property {string} url     canonical origin, no trailing slash
 * @property {{ name: string, handle?: string, bio?: string }} identity
 * @property {SiteLink[]} links
 * @property {{
 *   listening: SiteSection,
 * }} sections
 * @property {string} footerText
 * @property {{
 *   home: { lat: number, lng: number, label: string },
 *   endpoint: string,
 * }} geo
 * @property {string} status   manual override for the topbar status pill
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

  // Identity shown in the left rail of feed/listing pages.
  identity: {
    name:   'matt',
    handle: '@mattdoes',
    bio:    'Developer, musician, tinkerer.',
  },

  // External presence. Empty href = omitted from the rail.
  // External presence. Empty href = omitted from the about page.
  // Letterboxd, X, Instagram, and Last.fm are also the footer profile nav
  // (design-system Footer DEFAULT_PROFILES). Letterboxd and X are the
  // topbar social chips too (Topbar LETTERBOXD_PROFILE and X_PROFILE).
  // Keep those hrefs in sync.
  links: [
    { label: 'github',      href: 'https://github.com/mattdoesgh',                              meta: '/mattdoesgh' },
    { label: 'letterboxd',  href: 'https://letterboxd.com/mattdoes',                            meta: '/mattdoes'   },
    { label: '𝕏',          href: 'https://x.com/mattdoes',                                     meta: '/mattdoes'   },
    { label: 'instagram',   href: 'https://www.instagram.com/mattdoes.ig',                      meta: '/mattdoes.ig' },
    { label: 'last.fm',     href: 'https://www.last.fm/user/djverism',                          meta: '/djverism'   },
    { label: 'Spotify',     href: 'https://open.spotify.com/artist/617fKVTXkDafXJshlNUzF3',     meta: '↗'           },
    { label: 'Apple Music', href: 'https://music.apple.com/us/artist/verism-rip/1676956374',    meta: '↗'           },
    { label: 'say hi',      href: 'mailto:matt@mattdoes.online',                                meta: '↗'           },
  ],

  // Per-section labels. Page components may use `who` as a concise title;
  // descriptions stay empty because the writing itself explains each section.
  sections: {
    listening: {
      who:   'listening',
      bio:   '',
      intro: '',
    },
  },

  // Footer text on generic pages. Empty string = render nothing.
  footerText: '© 2026 · mattdoes.online',

  // Animated GeoJSON background.
  // - `home` is the city baked into static/home.geojson at build time
  //   (see scripts/bake-home-geojson.js). Lat/lng are used by the bake
  //   step and at runtime as a fallback when reverse-geocoding fails.
  // - `endpoint` is a same-origin path served by workers/geo, which
  //   reverse-geocodes a visitor's coords to a city polygon. Same-origin
  //   keeps connect-src 'self' working — no CSP changes needed.
  geo: {
    home: {
      lat:   29.7604,
      lng:  -95.3698,
      label: 'Houston, TX',
    },
    endpoint: '/api/geo/lookup',
  },

  // Status pill in the topbar. When `status` is empty and a Last.fm track is
  // currently playing at build time, build.js injects 'now: <artist — track>'
  // automatically. Set a fixed string here to override that with a static
  // site-notice pill (rendered by PageShell; the live poller leaves it alone).
  status: '',

  // Last.fm integration for /listening/.
  // IMPORTANT: username is intentionally not set here to keep it out of the
  // public repo. Set LASTFM_USERNAME (and LASTFM_API_KEY) as Cloudflare Pages
  // env vars. The listing page also hides the username from its left rail.
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
