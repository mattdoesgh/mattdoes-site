// Single article — journal or making post. React mirror of templates/journal.js.
// Same layout, different labels. The post body is pre-rendered markdown HTML
// (from the build's marked pipeline) injected via dangerouslySetInnerHTML.
import { Fragment } from 'react';
import { PageShell, IdentityRail, Time, Tag, safeUrl, type DateInput } from '../../src/index';

export interface ArticleRef {
  url: string;
  title: string;
  date: DateInput;
}

export interface ArticleNote {
  kind?: string;
  /** The post's own route path — used for the canonical URL in renderArticle. */
  url?: string;
  title: string;
  date: DateInput;
  summary?: string;
  readTime?: string;
  html: string;
  tags?: string[];
  sourcePath?: string;
  words?: number;
  updated?: DateInput;
}

export interface ArticleSite {
  config?: {
    title?: string;
    sections?: Record<string, { who?: string; bio?: string; kicker?: string }>;
    footerText?: string;
    status?: string;
  };
  counts?: Record<string, number>;
  nowPlaying?: string;
}

export interface ArticlePageProps {
  site: ArticleSite;
  note: ArticleNote;
  recent?: ArticleRef[];
  prev?: ArticleRef;
  next?: ArticleRef;
}

export function ArticlePage({ site, note, recent = [], prev, next }: ArticlePageProps) {
  const kind = note.kind || 'journal';
  const section = site.config?.sections?.[kind] || {};
  const meta = { who: section.who || kind, bio: section.bio || '', kicker: section.kicker || kind };
  // Tag chips jump to /blog/ pre-filtered by this post's kind and the tag.
  const sectionPath = '/blog/';
  const postCount = site.counts?.[kind === 'making' ? 'making' : 'journal'] || 0;
  const tags = note.tags || [];

  return (
    <PageShell
      active="blog"
      siteTitle={site.config?.title}
      manualStatus={site.config?.status}
      nowPlaying={site.nowPlaying || ''}
      footerText={site.config?.footerText ?? ''}
    >
      <main className="page" id="main">
        <IdentityRail who={meta.who} bio={meta.bio} stats={[{ n: postCount, label: 'posts' }]}>
          {recent.length ? (
            <div className="group">
              <h2>recent</h2>
              <ul>
                {recent.slice(0, 5).map((r) => (
                  <li key={r.url}>
                    <a href={safeUrl(r.url)}>{r.title}</a>
                    <span className="meta">
                      <Time date={r.date} format="day" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </IdentityRail>

        <article className="timeline">
          <div className="post-head">
            <div className="kicker">
              <span className="kind">{meta.kicker}</span>
              <span className="dot">·</span>
              <span>
                <Time date={note.date} format="long" />
              </span>
              {note.readTime ? (
                <>
                  <span className="dot">·</span>
                  <span>{note.readTime}</span>
                </>
              ) : null}
            </div>
            <h1>{note.title}</h1>
            {note.summary ? <p className="lede">{note.summary}</p> : null}
          </div>

          <div className="post-body">
            <div dangerouslySetInnerHTML={{ __html: note.html }} />

            {tags.length ? (
              <p className="post-tags">
                {tags.map((t, i) => (
                  <Fragment key={t}>
                    {i > 0 ? ' ' : null}
                    <Tag tag={t} baseHref={sectionPath} params={{ kind }} />
                  </Fragment>
                ))}
              </p>
            ) : null}

            <p className="post-source">
              ↳ {note.sourcePath}
              {note.words ? ` · ${note.words} words` : ''}
              {note.updated ? (
                <>
                  {' · last edited '}
                  <Time date={note.updated} format="day" />
                </>
              ) : null}
            </p>
          </div>

          {prev || next ? (
            <nav className="pager" aria-label="post pager">
              {prev ? (
                <a href={safeUrl(prev.url)}>
                  <span className="d">← older</span>
                  {prev.title}
                </a>
              ) : (
                <span></span>
              )}
              {next ? (
                <a href={safeUrl(next.url)}>
                  <span className="d">newer →</span>
                  {next.title}
                </a>
              ) : (
                <span></span>
              )}
            </nav>
          ) : null}
        </article>

        <aside className="side-right" aria-label="related">
          {tags.length ? (
            <div className="group">
              <h2>tags</h2>
              <ul>
                {tags.map((t) => (
                  <li key={t}>
                    <Tag tag={t} baseHref={sectionPath} params={{ kind }} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </main>
    </PageShell>
  );
}
