// SSG entry — the build's bridge into the React design system.
//
// Emit (lib/emit/, plain Node, no React) imports these render* functions and writes
// their returned HTML strings to dist/. Each function composes a page from the
// DS components, wraps it in the document shell (renderDocument: head, importmap,
// preloads, enhancement scripts — see templates/base.js), and returns a finished
// document string. renderToStaticMarkup is called inside renderDocument, so the
// build never imports react-dom itself.
//
// react / react-dom are external in the build output and resolved at runtime
// from design-system/node_modules (the built bundle lives under
// design-system/dist-ssg/), keeping the root build on plain `node`.
//
// Each page reads its brand title and the manual status override from its config
// object (siteConfig.title / siteConfig.status) and forwards them to PageShell,
// so the topbar brand and the document <title> share one source.
import type { ReactNode } from 'react';
import { renderDocument, assetUrl, type DocSiteConfig, type DocPage } from './document';
// Re-exported for the build: lib/emit/csp.js hashes these exact inline-script
// strings into the CSP script-src so the strict CSP admits every inline script
// (a hash source disables the 'inline-speculation-rules' keyword, so both must
// be hashed once either is).
export { buildImportmap, buildSpeculationRules } from './document';
// Re-exported for the build: lib/emit/index.js asserts every asset name the
// document shell references exists in the hashed asset map (fail loudly at
// build time instead of shipping a clean URL that 404s).
export { DOCUMENT_ASSET_NAMES } from './document';
import { IndexPage, type IndexPageProps } from './pages/IndexPage';
import { ListingPage, type ListingPageProps } from './pages/ListingPage';
import { AboutPage, type AboutPageProps } from './pages/AboutPage';
import { ColophonPage, type ColophonPageProps } from './pages/ColophonPage';
import { SearchPage, type SearchPageProps } from './pages/SearchPage';
import { DigsPage, type DigWeek } from './pages/DigsPage';
import { MoviesPage, type Watch } from './pages/MoviesPage';
import { GrokPage, type GrokFavorite, type GrokPick } from './pages/GrokPage';

export type Assets = Record<string, string>;

/** Full site config (a superset of what renderDocument's head needs). */
export interface FullSiteConfig extends DocSiteConfig {
  identity?: { name?: string; bio?: string };
  sections?: Record<string, { who?: string; bio?: string; intro?: string }>;
  links?: { label: string; href: string; meta?: string }[];
  lastfm?: { username?: string; showUser?: boolean };
  footerText?: string;
  /** Manual topbar status override (empty → live now-playing pill). */
  status?: string;
}

const SECTION_PATH: Record<string, string> = {
  listening: '/listening/',
};

const SECTION_DESCRIPTION: Record<string, string> = {
  listening: 'A live-updating log of recent listens, pulled from Last.fm.',
};

function scriptTag(src: string, opts: { module?: boolean } = {}): string {
  return opts.module ? `<script src="${src}" type="module"></script>` : `<script src="${src}" defer></script>`;
}

function doc(page: DocPage, children: ReactNode, siteConfig: DocSiteConfig, assets: Assets): string {
  return renderDocument({ page, children, siteConfig, assets });
}

// ── homepage ───────────────────────────────────────────────────────────────
export function renderIndex(
  args: IndexPageProps & { siteConfig: FullSiteConfig; assets: Assets },
): string {
  const { site, shelf, siteConfig, assets } = args;
  const identity = siteConfig.identity || {};
  const description = site.bio || (identity.name ? `${identity.name} — developer, musician, tinkerer.` : '');
  return doc(
    { title: '', url: '/', description },
    <IndexPage site={site} shelf={shelf} />,
    siteConfig,
    assets,
  );
}

// ── listening ────────────────────────────────────────────────────────────────
export function renderListing(
  args: ListingPageProps & { siteConfig: FullSiteConfig; assets: Assets },
): string {
  const { siteConfig, nowPlaying = '', totalScrobbles = 0, rowsHtml = '', assets } = args;
  return doc(
    {
      title: 'listening',
      url: SECTION_PATH.listening,
      description: SECTION_DESCRIPTION.listening,
      bodyScripts: scriptTag(assetUrl(assets, 'listening-live.js'), { module: true }),
    },
    <ListingPage
      siteConfig={siteConfig}
      nowPlaying={nowPlaying}
      totalScrobbles={totalScrobbles}
      rowsHtml={rowsHtml}
    />,
    siteConfig,
    assets,
  );
}

// ── about ────────────────────────────────────────────────────────────────────
export function renderAbout(
  args: AboutPageProps & { siteConfig: FullSiteConfig; assets: Assets },
): string {
  const { site, note, siteConfig, assets } = args;
  const description = note.summary || siteConfig.identity?.bio || '';
  return doc(
    { title: 'about', url: '/about/', description },
    <AboutPage site={site} note={note} />,
    siteConfig,
    assets,
  );
}

// ── colophon ─────────────────────────────────────────────────────────────────
export function renderColophon(
  args: ColophonPageProps & { siteConfig: FullSiteConfig; assets: Assets },
): string {
  const { siteConfig, stats, updated, nowPlaying = '', assets } = args;
  return doc(
    {
      title: 'colophon',
      url: '/colophon/',
      description:
        'How mattdoes.online is put together — Obsidian vault, Node build, static HTML, and two thin Cloudflare Workers.',
    },
    <ColophonPage siteConfig={siteConfig} stats={stats} updated={updated} nowPlaying={nowPlaying} />,
    siteConfig,
    assets,
  );
}

// ── digs (weekly music; content/digs) ────────────────────────────────────────
export function renderDigs(args: {
  siteConfig: FullSiteConfig;
  weeks: DigWeek[];
  nowPlaying?: string;
  assets: Assets;
}): string {
  const { siteConfig, weeks, nowPlaying = '', assets } = args;
  return doc(
    {
      title: 'digs',
      url: '/digs/',
      description: 'Weekly music digs — a starter album or track, with a player when there is one.',
    },
    <DigsPage siteConfig={siteConfig} weeks={weeks} nowPlaying={nowPlaying} />,
    siteConfig,
    assets,
  );
}

// ── movies (recent Letterboxd watches) ───────────────────────────────────────
export function renderMovies(args: {
  siteConfig: FullSiteConfig;
  watches: Watch[];
  profileHref?: string;
  nowPlaying?: string;
  assets: Assets;
}): string {
  const { siteConfig, watches, profileHref, nowPlaying = '', assets } = args;
  return doc(
    {
      title: 'movies',
      url: '/movies/',
      description: 'Recent watches from Letterboxd.',
    },
    <MoviesPage siteConfig={siteConfig} watches={watches} profileHref={profileHref} nowPlaying={nowPlaying} />,
    siteConfig,
    assets,
  );
}

// ── grok says… (recommendations hub; digs stay on /digs/) ────────────────────
export function renderGrok(args: {
  siteConfig: FullSiteConfig;
  favorites: GrokFavorite[];
  picks: GrokPick[];
  nowPlaying?: string;
  assets: Assets;
}): string {
  const { siteConfig, favorites, picks, nowPlaying = '', assets } = args;
  return doc(
    {
      title: 'grok says…',
      url: '/grok/',
      description: 'Recommendations — favorite digs, and anything else worth passing on.',
    },
    <GrokPage siteConfig={siteConfig} favorites={favorites} picks={picks} nowPlaying={nowPlaying} />,
    siteConfig,
    assets,
  );
}

// ── search ───────────────────────────────────────────────────────────────────
export function renderSearch(
  args: SearchPageProps & { siteConfig: FullSiteConfig; assets: Assets },
): string {
  const { siteConfig, assets } = args;
  const bodyScripts = scriptTag(assetUrl(assets, 'search.js'));
  return doc(
    {
      title: 'search',
      url: '/search/',
      description: 'Search mattdoes.online.',
      bodyScripts,
    },
    <SearchPage siteConfig={siteConfig} />,
    siteConfig,
    assets,
  );
}
