// Single article — journal or making post. The post body is pre-rendered
// markdown HTML (from the build's marked pipeline) injected via
// dangerouslySetInnerHTML.
import { Fragment } from 'react';
import { PageShell, Time, Tag, safeUrl, type DateInput } from '../../src/index';

export interface ArticleRef {
  url: string;
  title: string;
  date: DateInput;
}

export interface RelatedRef {
  url: string;
  title?: string;
  excerpt?: string;
  kind?: string;
  date: DateInput;
  sharedTopics?: string[];
}

export interface ArticleNote {
  kind?: string;
  /** URL slug segment (from vault frontmatter or derived from title). */
  slug?: string;
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
  tagPaths?: Record<string, string>;
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
  /** Retained at the render boundary for backwards-compatible emit callers. */
  recent?: ArticleRef[];
  related?: RelatedRef[];
  prev?: ArticleRef;
  next?: ArticleRef;
}

export function ArticlePage({ site, note, related = [], next }: ArticlePageProps) {
  const kind = note.kind || 'journal';
  const section = site.config?.sections?.[kind] || {};
  const kicker = section.kicker || kind;
  const tags = note.tags || [];
  const archiveHref = kind === 'making' ? '/making/' : '/journal/';
  const continuation = next || related[0];
  const relatedReading = related.filter((item) => item.url !== continuation?.url).slice(0, 3);

  return (
    <PageShell
      active="blog"
      siteTitle={site.config?.title}
      manualStatus={site.config?.status}
      nowPlaying={site.nowPlaying || ''}
      footerText={site.config?.footerText ?? ''}
    >
      <main className="page page--single-column article-page" id="main">
        <article className="timeline" aria-labelledby="article-title">
          <div className="post-head">
            <div className="kicker">
              <span className="kind">{kicker}</span>
              <span className="dot">·</span>
              <span>
                <Time date={note.date} format="long" />
              </span>
            </div>
            <h1 id="article-title">{note.title}</h1>
            {note.summary ? <p className="lede">{note.summary}</p> : null}
          </div>

          <div className="post-body">
            <div dangerouslySetInnerHTML={{ __html: note.html }} />
          </div>

          {(tags.length || note.words || note.updated || relatedReading.length) ? (
            <footer className="article-endmatter" aria-label="article details">
              {tags.length ? (
                <div className="article-endmatter__row article-endmatter__tags">
                  <span>tags</span>
                  <p className="post-tags">
                    {tags.map((tag, index) => (
                      <Fragment key={tag}>
                        {index > 0 ? ' ' : null}
                        <Tag tag={tag} href={note.tagPaths?.[tag.trim().toLowerCase()]} baseHref="/blog/" params={{ kind }} />
                      </Fragment>
                    ))}
                  </p>
                </div>
              ) : null}

              {note.words || note.updated ? (
                <p className="article-endmatter__meta">
                  {note.words ? `${note.words} words` : null}
                  {note.words && note.updated ? ' · ' : null}
                  {note.updated ? <><span>updated </span><Time date={note.updated} format="day" /></> : null}
                </p>
              ) : null}

              {relatedReading.length ? (
                <section className="article-endmatter__related" aria-labelledby="related-reading-title">
                  <h2 id="related-reading-title">related reading</h2>
                  <ul>
                    {relatedReading.map((item) => (
                      <li key={item.url}>
                        <a href={safeUrl(item.url)}>{item.title || item.excerpt || 'related note'}</a>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </footer>
          ) : null}

          <nav className="article-continuation" aria-label="continue reading">
            {continuation ? (
              <a href={safeUrl(continuation.url)}>
                <span>continue reading</span>
                {continuation.title || 'another note'}
              </a>
            ) : null}
            <a href={archiveHref}>view {kind} archive</a>
          </nav>
        </article>
      </main>
    </PageShell>
  );
}
