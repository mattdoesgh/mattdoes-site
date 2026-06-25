// Homepage — three-column feed mixing every content type in reverse-chrono.
// The React mirror of templates/index.js. The homepage uses its own COMPACT
// row (relative "2h"/"3d" timestamps, kind-led gutter) — deliberately not the
// shared Row module — so the row markup is authored inline here, matching the
// source.
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import {
  PageShell,
  IdentityRail,
  ElsewhereLinks,
  Time,
  TagList,
  safeUrl,
  relValue,
  fmtDate,
  fmtIsoDay,
  relTime,
  tagsHtml,
  escHtml,
  type DateInput,
} from '../../src/index';

export interface HomeEntry {
  kind: string; // journal | making | thought | listening
  date: DateInput;
  url?: string;
  title?: string;
  summary?: string;
  tags?: string[];
  readTime?: string;
  permalinkLabel?: string;
  html?: string;
  body?: string;
  quote?: boolean;
  // listening
  track?: string;
  artist?: string;
  album?: string;
  nowPlaying?: boolean;
}

export interface IndexSite {
  config?: { title?: string; footerText?: string; status?: string };
  bio?: string;
  identity?: { name?: string; handle?: string };
  links?: { label: string; href: string; meta?: string }[];
  nowPlaying?: string;
  counts?: { journal?: number; thoughts?: number; making?: number; listening?: number; scrobbles?: number };
}

export interface IndexPageProps {
  site: IndexSite;
  entries: HomeEntry[];
}

/** One compact homepage row. */
function HomeRow({ entry }: { entry: HomeEntry }) {
  const { kind } = entry;
  const when = <Time date={entry.date} label={relTime(entry.date)} />;
  const permalinkLabel =
    kind === 'thought'
      ? entry.permalinkLabel || '#'
      : kind === 'listening'
        ? '↗ listening'
        : entry.readTime || '';
  const permalink = entry.url ? (
    <a className="permalink" href={safeUrl(entry.url)} rel={relValue(entry.url)}>
      {permalinkLabel}
    </a>
  ) : null;

  let body: ReactNode;
  if (entry.quote) {
    body = <div className="body q" dangerouslySetInnerHTML={{ __html: entry.html || escHtml(entry.body) }} />;
  } else if (kind === 'listening') {
    body = (
      <div className="body">
        <strong>{entry.track || entry.title || '(untitled)'}</strong>
        {entry.artist ? ` — ${entry.artist}` : ''}
        {entry.album ? (
          <>
            {' '}
            <span className="meta">· {entry.album}</span>
          </>
        ) : null}
        {entry.nowPlaying ? (
          <>
            {' '}
            <span className="meta">· now</span>
          </>
        ) : null}
      </div>
    );
  } else if ((kind === 'journal' || kind === 'making') && entry.url) {
    body = (
      <div className="body">
        <a href={safeUrl(entry.url)}>
          <strong>{entry.title}</strong>
        </a>
        {entry.summary ? ` — ${entry.summary}` : ''} <TagList tags={entry.tags} />
      </div>
    );
  } else {
    // Thought (non-quote) or article without a url: pre-rendered html + tags,
    // sharing one block via dangerouslySetInnerHTML. Matches templates/index.js
    // exactly — `${html} ${tags}`, an always-present separator space with an
    // empty tag string when there are no tags.
    const html = entry.html || escHtml(entry.body);
    const tags = entry.tags && entry.tags.length ? tagsHtml(entry.tags) : '';
    body = <div className="body" dangerouslySetInnerHTML={{ __html: `${html} ${tags}` }} />;
  }

  return (
    <div className="row" data-kind={kind} data-tags={(entry.tags || []).join(' ')}>
      <div className="gutter">
        <span className="kind">{kind}</span>
        <span className="when">{when}</span>
      </div>
      <div>
        {body}
        <div className="actions">{permalink}</div>
      </div>
    </div>
  );
}

function groupByDay(entries: HomeEntry[]): [string, HomeEntry[]][] {
  const groups = new Map<string, HomeEntry[]>();
  for (const e of entries) {
    const key = fmtDate(e.date, 'iso');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export function IndexPage({ site, entries }: IndexPageProps) {
  const groups = groupByDay(entries).slice(0, 6); // most recent ~6 days
  const today = fmtDate(new Date(), 'iso');

  const visibleEntries = groups.flatMap(([, rows]) => rows);
  const tagCounts = new Map<string, number>();
  for (const e of visibleEntries) for (const t of e.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);

  const counts = site.counts || {};
  const scrobbles = Number(counts.scrobbles || 0).toLocaleString('en-US');
  const identity = site.identity || {};
  const identityLine = [identity.name, identity.handle].filter(Boolean).join(' · ');

  return (
    <PageShell
      active="home"
      siteTitle={site.config?.title}
      manualStatus={site.config?.status}
      nowPlaying={site.nowPlaying || ''}
      footerText={site.config?.footerText ?? ''}
    >
      <main className="page" id="main">
        <h1 className="visually-hidden">latest</h1>

        <IdentityRail
          who={identityLine || undefined}
          bio={site.bio}
          stats={[
            { n: counts.journal || 0, label: 'journal' },
            { n: counts.thoughts || 0, label: 'thoughts' },
            { n: counts.making || 0, label: 'making' },
            { n: scrobbles, label: 'scrobbles', id: 'scrobble-count' },
          ]}
        >
          <ElsewhereLinks links={site.links || []} />
        </IdentityRail>

        <section className="timeline">
          <div className="post-head">
            <p className="lede">
              Latest from the vault — journal, making, and thoughts. Browse{' '}
              <a href="/thoughts/">thoughts</a> for micro-posts or{' '}
              <a href="/making/">making</a> for project write-ups.
            </p>
          </div>

          {topTags.length ? (
            <div className="filter">
              <span className="label">filter</span>
              <a href="/" className="on all" data-filter="" aria-current="true">
                all
              </a>
              {topTags.slice(0, 6).map(([tag]) => (
                <a key={tag} href={`/?tag=${encodeURIComponent(tag)}`} data-filter={tag}>
                  {tag}
                </a>
              ))}
              <span className="cnt">{visibleEntries.length} entries</span>
            </div>
          ) : null}

          {groups.length ? (
            groups.map(([day, rows]) => {
              const label = day === today ? `today · ${fmtIsoDay(day)}` : `${fmtIsoDay(day)} · ${day.slice(0, 4)}`;
              return (
                <Fragment key={day}>
                  <div className="tl-divider">
                    <span>{label}</span>
                    <span>{rows.length}</span>
                  </div>
                  {rows.map((e, i) => (
                    <HomeRow key={i} entry={e} />
                  ))}
                </Fragment>
              );
            })
          ) : (
            <div className="row">
              <div className="gutter">
                <span className="kind">—</span>
                <span className="when"></span>
              </div>
              <div>
                <div className="body muted">Nothing published yet.</div>
              </div>
            </div>
          )}

          {entries.length ? (
            <div className="loadmore">
              <a href="/blog/">load older →</a>
            </div>
          ) : null}
        </section>
      </main>
    </PageShell>
  );
}
