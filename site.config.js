// site.config.js — build settings the render and the fetchers read.

/**
 * @typedef {object} SiteConfig
 * @property {string} title
 * @property {string} url     canonical origin, no trailing slash
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
