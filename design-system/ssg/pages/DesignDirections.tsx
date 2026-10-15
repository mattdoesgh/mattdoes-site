// Homepage design bake-off. These pages are sketches at /design/, /design/a/,
// /design/b/, and /design/c/. They do not replace IndexPage or the live `/`
// route. Styles load only here (static/design-directions.css).
import type { ReactNode } from 'react';
import { Time, safeUrl, relValue } from '../../src/index';
import type { DateInput } from '../../src/index';

export type DirectionId = 'a' | 'b' | 'c';
export type DesignCurrent = DirectionId | 'index';

export interface DesignPiece {
  kind?: string;
  title: string;
  url: string;
  summary?: string;
  date?: DateInput;
}

export interface DesignShelf {
  dig?: { artist: string; starter: string; favorite?: boolean } | null;
  watch?: { title: string; year?: string } | null;
}

export interface DesignSite {
  bio?: string;
  identity?: { name?: string; handle?: string };
  links?: { label: string; href: string; meta?: string }[];
  nowPlaying?: string;
  config?: { title?: string; footerText?: string };
  place?: string;
}

export interface DesignPageProps {
  site: DesignSite;
  featured: DesignPiece | null;
  recent: DesignPiece[];
  shelf: DesignShelf;
}

const SHELVES = [
  { href: '/blog/', label: 'writing', note: 'essays and notes' },
  { href: '/thoughts/', label: 'thoughts', note: 'the notebook' },
  { href: '/listening/', label: 'listening', note: 'recent plays' },
  { href: '/digs/', label: 'digs', note: 'weekly music' },
  { href: '/movies/', label: 'movies', note: 'recent watches' },
  { href: '/grok/', label: 'grok says', note: 'recommendations' },
] as const;

const DIRECTIONS = [
  {
    id: 'a' as const,
    href: '/design/a/',
    nav: 'A · geo cities',
    title: 'A · neo-GeoCities',
    vibe: 'A playful personal homepage. Stickers, a webring, color on the frame. The links go to the real pages.',
    a11y: 'Color sits on borders and badges. Reading text stays on the paper color, at AA contrast. Hover motion turns off when reduced motion is on.',
  },
  {
    id: 'b' as const,
    href: '/design/b/',
    nav: 'B · lain',
    title: 'B · Lain / soft cyberpunk',
    vibe: 'A cool, quiet terminal. Static scanlines, one short glitch on the name, no flashing.',
    a11y: 'Scanlines are a faint background, not a filter over the type. The glitch is a one-second text shadow and does not run under reduced motion.',
  },
  {
    id: 'c' as const,
    href: '/design/c/',
    nav: 'C · hybrid',
    title: 'C · quieter hybrid',
    vibe: 'Editorial, with the oddness kept in a margin note. Less decoration, same shelves.',
    a11y: 'No motion. One accent color, checked for contrast. The margin note is in the page, in reading order.',
  },
];

const COMPARE_NAME: Record<DesignCurrent, string> = {
  index: 'Compare the three directions',
  a: 'Direction A · playful neo-GeoCities',
  b: 'Direction B · Lain / soft cyberpunk',
  c: 'Direction C · quieter hybrid',
};

function Compare({ current }: { current: DesignCurrent }) {
  return (
    <header className="design-compare">
      <p className="design-compare__name">{COMPARE_NAME[current]}</p>
      <nav aria-label="design directions">
        <a href="/design/" aria-current={current === 'index' ? 'page' : undefined}>
          index
        </a>
        {DIRECTIONS.map((direction) => (
          <a
            key={direction.id}
            href={direction.href}
            aria-current={current === direction.id ? 'page' : undefined}
          >
            {direction.nav}
          </a>
        ))}
        <a href="/">current site</a>
      </nav>
    </header>
  );
}

function SketchFooter({ site }: { site: DesignSite }) {
  const links = (site.links || []).filter((link) => link.href);
  return (
    <footer className="design-foot">
      <p>{site.config?.footerText || '© 2026 · mattdoes.online'} · design sketch</p>
      <nav aria-label="sketch">
        <a href="/design/">all directions</a>
        <a href="/">current site</a>
        <a href="/about/">about</a>
        <a href="/colophon/">colophon</a>
      </nav>
      {links.length ? (
        <nav aria-label="elsewhere">
          {links.map((link) => {
            const href = safeUrl(link.href);
            return (
              <a
                key={link.href}
                href={href}
                rel={relValue(link.href)}
                data-prefetch={href.startsWith('mailto:') ? 'off' : undefined}
              >
                {link.label}
              </a>
            );
          })}
        </nav>
      ) : null}
    </footer>
  );
}

function Stage({
  current,
  className,
  children,
  site,
}: {
  current: DesignCurrent;
  className: string;
  children: ReactNode;
  site: DesignSite;
}) {
  return (
    <>
      <a className="skip-link" href="#main">skip to content</a>
      <div className={className}>
        <Compare current={current} />
        {children}
        <SketchFooter site={site} />
      </div>
    </>
  );
}

function Lead({ piece }: { piece: DesignPiece | null }) {
  if (!piece) {
    return (
      <p className="dir-empty">
        Nothing published yet. <a href="/blog/">Writing</a> will show up here.
      </p>
    );
  }
  return (
    <article className="lead">
      <p className="kicker">
        <span className="kind">{piece.kind || 'note'}</span>
        {piece.date ? <> · <Time date={piece.date} format="day" /></> : null}
      </p>
      <h2><a href={safeUrl(piece.url)}>{piece.title}</a></h2>
      {piece.summary ? <p>{piece.summary}</p> : null}
    </article>
  );
}

function Recent({ pieces }: { pieces: DesignPiece[] }) {
  if (!pieces.length) return null;
  return (
    <section className="recent" aria-labelledby="recent-heading">
      <h2 id="recent-heading">recent writing</h2>
      <ol>
        {pieces.map((piece) => (
          <li key={piece.url}>
            <a href={safeUrl(piece.url)}>{piece.title}</a>
            {piece.date ? <Time date={piece.date} format="day" /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function CurrentNotes({ site, shelf }: { site: DesignSite; shelf: DesignShelf }) {
  const dig = shelf.dig;
  const watch = shelf.watch;
  return (
    <ul className="notes">
      <li>
        {site.nowPlaying ? <>{site.nowPlaying}. </> : null}
        <a href="/listening/">listening</a>
      </li>
      <li>
        {dig ? <>{dig.artist}, {dig.starter}. </> : null}
        <a href="/digs/">digs</a>
      </li>
      <li>
        {watch ? <>{watch.title}{watch.year ? ` (${watch.year})` : ''}. </> : null}
        <a href="/movies/">movies</a>
      </li>
      <li>
        <a href="/grok/">grok says</a>
        {dig?.favorite ? <>: {dig.artist}</> : null}
      </li>
    </ul>
  );
}

function ShelfList({ className }: { className: string }) {
  return (
    <ul className={className}>
      {SHELVES.map((shelf, index) => (
        <li key={shelf.href}>
          <a href={shelf.href}>
            <span className="idx" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span className="label">{shelf.label}</span>
            <span className="note">{shelf.note}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function bioOf(site: DesignSite) {
  return site.bio || 'Developer, musician, tinkerer.';
}

function placeOf(site: DesignSite) {
  return site.place || 'Houston, TX';
}

export function DesignIndex({ site, featured }: DesignPageProps) {
  return (
    <Stage current="index" className="design-stage design-index" site={site}>
      <main className="design-wrap" id="main" aria-labelledby="page-title">
        <h1 id="page-title">Homepage directions</h1>
        <p className="lede">
          Three sketches for a new front page of mattdoes.online. The live homepage is unchanged.
          Each one keeps keyboard access, a visible focus ring, and AA contrast. Motion is garnish.
        </p>
        {featured ? (
          <p className="using">
            They use the current lead:{' '}
            <a href={safeUrl(featured.url)}>{featured.title}</a>.
          </p>
        ) : null}
        <ul className="direction-list">
          {DIRECTIONS.map((direction) => (
            <li key={direction.id}>
              <article className={`direction-card direction-card--${direction.id}`}>
                <h2>{direction.title}</h2>
                <p>{direction.vibe}</p>
                <p className="a11y">{direction.a11y}</p>
                <a className="open" href={direction.href}>Open direction {direction.id.toUpperCase()}</a>
              </article>
            </li>
          ))}
        </ul>
      </main>
    </Stage>
  );
}

export function DesignA({ site, featured, recent, shelf }: DesignPageProps) {
  return (
    <Stage current="a" className="design-stage design-dir design-dir--a" site={site}>
      <main className="design-wrap" id="main" aria-labelledby="page-title">
        <header className="mast">
          <p className="kicker">you have reached a personal homepage</p>
          <h1 id="page-title" className="wordmark">matt <span className="does">does</span></h1>
          <p className="domain">mattdoes.online</p>
          <p className="bio">{bioOf(site)}</p>
          <ul className="badges">
            <li className="chip-a">under construction</li>
            <li className="chip-b">best viewed curious</li>
            <li className="chip-c">{placeOf(site)}</li>
            <li className="chip-d">no guest book</li>
          </ul>
        </header>

        <section className="shelves" aria-labelledby="shelves-heading">
          <h2 id="shelves-heading">around the site</h2>
          <ShelfList className="webring" />
        </section>

        <Lead piece={featured} />
        <Recent pieces={recent} />

        <section className="wire" aria-labelledby="wire-heading">
          <h2 id="wire-heading">right now</h2>
          <CurrentNotes site={site} shelf={shelf} />
        </section>
      </main>
    </Stage>
  );
}

export function DesignB({ site, featured, recent, shelf }: DesignPageProps) {
  return (
    <Stage current="b" className="design-stage design-dir design-dir--b" site={site}>
      <main className="design-wrap" id="main" aria-labelledby="page-title">
        <header className="mast">
          <p className="kicker">present time</p>
          <h1 id="page-title" className="wordmark">
            <span className="prompt" aria-hidden="true">&gt; </span>
            matt does
          </h1>
          <p className="domain">mattdoes.online</p>
          <p className="bio">{bioOf(site)}</p>
          <dl className="signals">
            <div>
              <dt>site</dt>
              <dd>mattdoes.online</dd>
            </div>
            <div>
              <dt>place</dt>
              <dd>{placeOf(site)}</dd>
            </div>
            <div>
              <dt>handle</dt>
              <dd>{site.identity?.handle || '@mattdoes'}</dd>
            </div>
          </dl>
        </header>

        <Lead piece={featured} />

        <section className="shelves" aria-labelledby="shelves-heading">
          <h2 id="shelves-heading">index</h2>
          <ShelfList className="protocol" />
        </section>

        <Recent pieces={recent} />

        <section className="wire" aria-labelledby="wire-heading">
          <h2 id="wire-heading">signal</h2>
          <CurrentNotes site={site} shelf={shelf} />
        </section>
      </main>
    </Stage>
  );
}

export function DesignC({ site, featured, recent, shelf }: DesignPageProps) {
  return (
    <Stage current="c" className="design-stage design-dir design-dir--c" site={site}>
      <main className="design-wrap" id="main" aria-labelledby="page-title">
        <div className="top">
          <header className="mast">
            <p className="kicker">mattdoes.online</p>
            <h1 id="page-title" className="wordmark">matt does</h1>
            <p className="bio">{bioOf(site)}</p>
          </header>
          <aside className="margin" aria-label="margin note">
            <p className="place">{placeOf(site)}</p>
            <p>A quieter front page. The strange part stays in the margin.</p>
            <CurrentNotes site={site} shelf={shelf} />
          </aside>
        </div>

        <Lead piece={featured} />
        <Recent pieces={recent} />

        <section className="shelves" aria-labelledby="shelves-heading">
          <h2 id="shelves-heading">sections</h2>
          <nav aria-label="sections">
            <ShelfList className="quiet-nav" />
          </nav>
        </section>
      </main>
    </Stage>
  );
}
