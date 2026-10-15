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
  { href: '/posts/', label: 'posts', note: 'on x' },
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
    vibe: 'A personal homepage with a pulse: a drifting ribbon, bobbing stickers, and a barber-pole stripe. The links stay still after they arrive.',
    a11y: 'The ribbon is decorative and hidden from screen readers. Pause motion stops every loop. Reduced motion freezes it. Text stays on the paper color.',
  },
  {
    id: 'b' as const,
    href: '/design/b/',
    nav: 'B · lain',
    title: 'B · Lain / soft cyberpunk',
    vibe: 'Clear glass on the shelf tiles and the nav chips. A faint code field shows through, and the writing stays bare.',
    a11y: 'One glass recipe. Reduced transparency drops the blur, and higher contrast goes solid and hides the field. Pause and reduced motion stop the field, the sheen, and the press. The field is decorative.',
  },
  {
    id: 'c' as const,
    href: '/design/c/',
    nav: 'C · hybrid',
    title: 'C · quieter hybrid',
    vibe: 'Editorial, but not a poster. A slow ribbon, a traveling rule, and a margin mark that drifts as you scroll.',
    a11y: 'The reading column stays put. Scroll-linked drift is on the ornament only, and it stops under reduced motion or Pause motion.',
  },
];

const COMPARE_NAME: Record<DesignCurrent, string> = {
  index: 'Compare the three directions',
  a: 'Direction A · neo-GeoCities in motion',
  b: 'Direction B · Lain, liquid glass',
  c: 'Direction C · editorial flow',
};

function MotionToggle({ glass = false }: { glass?: boolean }) {
  return (
    <label className={glass ? 'motion-toggle gb' : 'motion-toggle'}>
      <input id="pause-motion" type="checkbox" />
      <span className="motion-toggle__on">Pause motion</span>
      <span className="motion-toggle__off">Play motion</span>
    </label>
  );
}

function Ticker({ text, pace }: { text: string; pace: 'a' | 'b' | 'c' }) {
  const line = `${text} · `;
  return (
    <div className={`ticker ticker--${pace}`} aria-hidden="true">
      <div className="ticker-track">
        <span>{line.repeat(4)}</span>
        <span>{line.repeat(4)}</span>
      </div>
    </div>
  );
}

function Compare({ current }: { current: DesignCurrent }) {
  return (
    <header className="design-compare">
      <p className="design-compare__name">{COMPARE_NAME[current]}</p>
      <MotionToggle glass={current === 'b'} />
      <nav aria-label="design directions">
        <a className={current === 'b' ? 'gb' : undefined} href="/design/" aria-current={current === 'index' ? 'page' : undefined}>
          index
        </a>
        {DIRECTIONS.map((direction) => (
          <a
            key={direction.id}
            className={current === 'b' ? 'gb' : undefined}
            href={direction.href}
            aria-current={current === direction.id ? 'page' : undefined}
          >
            {direction.nav}
          </a>
        ))}
        <a className={current === 'b' ? 'gb' : undefined} href="/">current site</a>
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
    <article className="lead flow flow-3">
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
    <section className="recent flow flow-4" aria-labelledby="recent-heading">
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

function Lately({ site, shelf }: { site: DesignSite; shelf: DesignShelf }) {
  const dig = shelf.dig;
  const watch = shelf.watch;
  const rows = [
    { href: '/listening/', label: 'listening', value: site.nowPlaying || '' },
    { href: '/digs/', label: 'digs', value: dig ? `${dig.artist}, ${dig.starter}` : '' },
    { href: '/movies/', label: 'movies', value: watch ? `${watch.title}${watch.year ? ` (${watch.year})` : ''}` : '' },
    { href: '/grok/', label: 'grok says', value: dig?.favorite ? dig.artist : '' },
  ];
  return (
    <dl className="lately">
      {rows.map((row) => (
        <div key={row.href}>
          <dt><a href={row.href}>{row.label}</a></dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ShelfList({ className, numbered = true, glass = false }: { className: string; numbered?: boolean; glass?: boolean }) {
  return (
    <ul className={className}>
      {SHELVES.map((shelf, index) => (
        <li key={shelf.href}>
          <a className={glass ? 'gb' : undefined} href={shelf.href}>
            {numbered ? (
              <span className="idx" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            ) : null}
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
          Three kinetic sketches for a new front page of mattdoes.online. The live homepage is unchanged.
          Each one moves, and each one can be paused. Reduced motion stops the movement. Keyboard access,
          a visible focus ring, and AA contrast stay in place.
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
              <article className={`direction-card direction-card--${direction.id} flow flow-${direction.id === 'a' ? '1' : direction.id === 'b' ? '2' : '3'}`}>
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
        <header className="mast flow">
          <div className="sky" aria-hidden="true">
            <span className="float float-1">★</span>
            <span className="float float-2">new</span>
            <span className="float float-3">✦</span>
            <span className="float float-4">hi</span>
          </div>
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
        <Ticker pace="a" text="welcome · under construction · a personal web · mattdoes.online" />

        <section className="shelves" aria-labelledby="shelves-heading">
          <h2 id="shelves-heading" className="flow flow-2">around the site</h2>
          <ShelfList className="webring" />
        </section>

        <Lead piece={featured} />
        <Recent pieces={recent} />

        <section className="wire flow flow-5" aria-labelledby="wire-heading">
          <h2 id="wire-heading">right now</h2>
          <CurrentNotes site={site} shelf={shelf} />
        </section>
      </main>
    </Stage>
  );
}

function CodeSheet({ id }: { id: string }) {
  return (
    <svg className="field-sheet">
      <defs>
        <pattern id={id} width="112" height="176" patternUnits="userSpaceOnUse">
          <rect x="22" y="30" width="1" height="6" fill="#d7e2e4" opacity="0.3" />
          <rect x="74" y="118" width="1" height="3" fill="#d7e2e4" opacity="0.16" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

export function DesignB({ site, featured, recent, shelf }: DesignPageProps) {
  return (
    <Stage current="b" className="design-stage design-dir design-dir--b db" site={site}>
      <div className="field" aria-hidden="true">
        <div className="field-track">
          <CodeSheet id="b-code-a" />
          <CodeSheet id="b-code-b" />
        </div>
      </div>
      <main className="design-wrap" id="main" aria-labelledby="page-title">
        <header className="mast flow">
          <p className="kicker">mattdoes.online</p>
          <h1 id="page-title" className="wordmark">matt does</h1>
          <p className="bio">{bioOf(site)}</p>
          <p className="where">{placeOf(site)}</p>
          <p className="tagline">somewhere quiet on the wired</p>
        </header>

        <Lead piece={featured} />

        <section className="shelves" aria-labelledby="shelves-heading">
          <h2 id="shelves-heading" className="flow flow-2">around here</h2>
          <ShelfList className="rooms" numbered={false} glass />
        </section>

        <Recent pieces={recent} />

        <section className="wire flow flow-5" aria-labelledby="wire-heading">
          <h2 id="wire-heading">lately</h2>
          <Lately site={site} shelf={shelf} />
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
          <header className="mast flow">
            <p className="kicker">mattdoes.online</p>
            <h1 id="page-title" className="wordmark">matt does</h1>
            <p className="bio">{bioOf(site)}</p>
            <Ticker pace="c" text="a personal site · still moving · mattdoes.online" />
          </header>
          <aside className="margin" aria-label="margin note">
            <span className="margin-mark" aria-hidden="true"></span>
            <p className="place">{placeOf(site)}</p>
            <p>A quieter front page. The strange part stays in the margin, and it drifts.</p>
            <CurrentNotes site={site} shelf={shelf} />
          </aside>
        </div>

        <Lead piece={featured} />
        <Recent pieces={recent} />

        <section className="shelves flow flow-5" aria-labelledby="shelves-heading">
          <h2 id="shelves-heading">sections</h2>
          <nav aria-label="sections">
            <ShelfList className="quiet-nav" />
          </nav>
        </section>
      </main>
    </Stage>
  );
}
