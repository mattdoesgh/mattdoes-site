// SSG entry — the build's bridge into the React design system.
//
// lib/emit.js (plain Node, no React) imports these render* functions and writes
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
import { IndexPage, type IndexPageProps } from './pages/IndexPage';
import { ArticlePage, type ArticlePageProps } from './pages/ArticlePage';
import { BlogPage, type BlogEntry } from './pages/BlogPage';
import { ListingPage, type ListingPageProps } from './pages/ListingPage';
import { AboutPage, type AboutPageProps } from './pages/AboutPage';
import { ColophonPage, type ColophonPageProps } from './pages/ColophonPage';
import { SearchPage, type SearchPageProps } from './pages/SearchPage';

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
  journal: '/journal/',
  making: '/making/',
  listening: '/listening/',
  thoughts: '/thoughts/',
};

const SECTION_DESCRIPTION: Record<string, string> = {
  journal: 'Journal entries — longer-form notes, reverse-chronological.',
  making: 'Building-in-public posts — projects, experiments, and dev notes.',
  listening: 'A live-updating log of recent listens, pulled from Last.fm.',
  thoughts: 'Micro-thoughts — short posts split out of the daily notes.',
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
  const { site, entries, siteConfig, assets } = args;
  const identity = siteConfig.identity || {};
  const description = site.bio || (identity.name ? `${identity.name} — developer, musician, tinkerer.` : '');
  const bodyScripts =
    scriptTag(assetUrl(assets, 'listening-live.js'), { module: true }) +
    '\n' +
    scriptTag(assetUrl(assets, 'tag-filter.js'));
  return doc(
    { title: '', url: '/', description, bodyScripts },
    <IndexPage site={site} entries={entries} />,
    siteConfig,
    assets,
  );
}

// ── single article ───────────────────────────────────────────────────────────
export function renderArticle(
  args: ArticlePageProps & { siteConfig: FullSiteConfig; assets: Assets; ogImage?: string },
): string {
  const { site, note, recent, related, prev, next, siteConfig, assets, ogImage } = args;
  const kind = note.kind || 'journal';
  const section = siteConfig.sections?.[kind] || {};
  const who = section.who || kind;
  const bio = section.bio || '';
  const url = note.url || `${SECTION_PATH[kind] || '/'}`;
  const description = note.summary || bio || `${who} — ${note.title}`;
  const image = ogImage || `/og/${kind}/${note.slug || 'post'}.png`;
  return doc(
    { title: note.title, url, description, ogType: 'article', ogImage: image },
    <ArticlePage site={site} note={note} recent={recent} related={related} prev={prev} next={next} />,
    siteConfig,
    assets,
  );
}

// ── blog (unified timeline) ──────────────────────────────────────────────────
export function renderBlog(args: {
  siteConfig: FullSiteConfig;
  entries: BlogEntry[];
  nowPlaying?: string;
  assets: Assets;
}): string {
  const { siteConfig, entries, nowPlaying = '', assets } = args;
  return doc(
    {
      title: 'blog',
      url: '/blog/',
      description: 'Posts, micro-thoughts, and building-in-public — one reverse-chronological timeline.',
      bodyScripts: scriptTag(assetUrl(assets, 'tag-filter.js')),
    },
    <BlogPage siteConfig={siteConfig} entries={entries} nowPlaying={nowPlaying} />,
    siteConfig,
    assets,
  );
}

// ── section listing (journal / making / thoughts / listening) ────────────────
export function renderListing(
  args: ListingPageProps & { siteConfig: FullSiteConfig; assets: Assets },
): string {
  const { siteConfig, kind, entries, nowPlaying = '', totalScrobbles = 0, rowsHtml = '', assets } = args;
  const isListening = kind === 'listening';
  const bodyScripts = isListening
    ? scriptTag(assetUrl(assets, 'listening-live.js'), { module: true })
    : scriptTag(assetUrl(assets, 'tag-filter.js'));
  return doc(
    {
      title: kind,
      url: SECTION_PATH[kind] || '/',
      description: SECTION_DESCRIPTION[kind] || '',
      bodyScripts,
    },
    <ListingPage
      siteConfig={siteConfig}
      kind={kind}
      entries={entries}
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
      description: 'Search journal, making, and thoughts across mattdoes.online.',
      bodyScripts,
    },
    <SearchPage siteConfig={siteConfig} />,
    siteConfig,
    assets,
  );
}
