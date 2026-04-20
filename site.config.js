// site.config.js — single source of identity + per-section copy.
// Leave any string empty to omit that element from the rendered page.

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
  links: [
    { label: 'github', href: 'https://github.com/mattdoesgh', meta: '/mattdoesgh' },
    { label: '𝕏',     href: 'https://x.com/mattdoes',        meta: '/mattdoes'   },
    { label: 'rss',    href: '/feed.xml',                     meta: '.xml'        },
    { label: 'say hi', href: 'mailto:matt@mattdoes.online',   meta: '↗'           },
  ],

  // Per-section landing copy. `who` → left-rail heading; `bio` → left-rail
  // subtitle; `intro` → lede shown above the listing. All blank by choice;
  // section titles in the topbar + URL carry the signal.
  sections: {
    journal:   { who: 'journal',   bio: '', intro: '' },
    making:    { who: 'making',    bio: '', intro: '' },
    listening: { who: 'listening', bio: '', intro: '' },
    thoughts:  { who: 'thoughts',  bio: '', intro: '' },
  },

  // Footer text on generic pages. Empty string = render nothing.
  footerText: '© 2026 · mattdoes.online',

  // Status pill in the topbar. When `status` is empty and a Last.fm track is
  // currently playing at build time, build.js injects 'now: <artist — track>'
  // automatically. Set a fixed string here to override that behavior.
  status: '',

  // Last.fm integration for /listening/.
  // IMPORTANT: username is intentionally not set here to keep it out of the
  // public repo. Set LASTFM_USERNAME (and LASTFM_API_KEY) as Cloudflare Pages
  // env vars. The listing page also hides the username from its left rail.
  lastfm: {
    username: '',       // read from LASTFM_USERNAME env var at build time
    limit:    25,       // how many recent tracks to render on /listening/
    cacheTtl: 15 * 60,  // seconds — skip network if cache is fresher than this
    showUser: false,    // do not render 'last.fm/<user>' link on /listening/
  },
};
