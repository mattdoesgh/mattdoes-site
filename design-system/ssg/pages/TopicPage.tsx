import {
  PageShell,
  IdentityRail,
  RailSection,
  Time,
  safeUrl,
  type DateInput,
} from '../../src/index';

export interface TopicItem {
  kind: string;
  title?: string;
  url: string;
  date: DateInput;
  excerpt: string;
  topics: string[];
}

export interface TopicSummary {
  name: string;
  path: string;
  count: number;
  counts: Record<string, number>;
  latestAt?: string | null;
  items: TopicItem[];
}

export interface TopicPageProps {
  siteConfig: { title?: string; footerText?: string; status?: string };
  topic: TopicSummary;
  allTopics: { name: string; path: string; count: number }[];
  nowPlaying?: string;
}

/** One durable cross-kind idea path derived from the Content model. */
export function TopicPage({ siteConfig, topic, allTopics, nowPlaying = '' }: TopicPageProps) {
  const kindSummary = Object.entries(topic.counts)
    .map(([kind, count]) => `${count} ${kind}`)
    .join(' · ');
  return (
    <PageShell
      active="blog"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      nowPlaying={nowPlaying}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page page--reader-first page--topic" id="main">
        <section className="timeline topic-path" aria-labelledby="topic-title">
          <header className="post-head">
            <div className="kicker"><span className="kind">idea path</span></div>
            <h1 id="topic-title">{topic.name}</h1>
            <p className="lede">Writing and notebook fragments connected by this idea, ordered newest first.</p>
          </header>
          <div className="topic-path__entries">
            {topic.items.map((item, index) => (
              <article className={`topic-entry topic-entry--${item.kind}`} key={`${item.url}:${index}`}>
                <div className="topic-entry__meta">
                  <span className="kind">{item.kind}</span>
                  <Time date={item.date} format="day" />
                </div>
                <h2><a href={safeUrl(item.url)}>{item.title || item.excerpt}</a></h2>
                {item.title && item.excerpt ? <p>{item.excerpt}</p> : null}
              </article>
            ))}
          </div>
        </section>

        <IdentityRail
          who="idea path"
          bio="A route through the archive based on meaning rather than publish date."
          stats={[{ n: topic.count, label: topic.count === 1 ? 'entry' : 'entries' }]}
        >
          {kindSummary ? <p className="topic-kind-summary">{kindSummary}</p> : null}
        </IdentityRail>

        <aside className="side-right" aria-label="other idea paths">
          <RailSection heading="other paths">
            <ul>
              {allTopics.filter(other => other.path !== topic.path).slice(0, 8).map(other => (
                <li key={other.path}>
                  <a href={other.path}>{other.name}</a>
                  <span className="meta">{other.count}</span>
                </li>
              ))}
            </ul>
          </RailSection>
        </aside>
      </main>
    </PageShell>
  );
}
