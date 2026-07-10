import {
  PageShell,
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

/** One durable cross-kind topic projection derived from the Content model. */
export function TopicPage({ siteConfig, topic, allTopics, nowPlaying = '' }: TopicPageProps) {
  const topicKey = topic.name.trim().toLowerCase();
  const sharedCounts = new Map<string, number>();
  for (const item of topic.items) {
    for (const name of item.topics) {
      const key = name.trim().toLowerCase();
      if (key && key !== topicKey) sharedCounts.set(key, (sharedCounts.get(key) || 0) + 1);
    }
  }
  // One accidental co-tag is not enough to imply a useful connection.
  const relatedTopics = allTopics
    .map((other) => ({ other, shared: sharedCounts.get(other.name.trim().toLowerCase()) || 0 }))
    .filter(({ other, shared }) => other.path !== topic.path && shared >= 2)
    .sort((a, b) => b.shared - a.shared || a.other.name.localeCompare(b.other.name))
    .slice(0, 5)
    .map(({ other }) => other);

  return (
    <PageShell
      active="blog"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      nowPlaying={nowPlaying}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page page--single-column topic-page" id="main">
        <section className="timeline topic-path" aria-labelledby="topic-title">
          <header className="post-head">
            <h1 id="topic-title">{topic.name}</h1>
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

          {relatedTopics.length ? (
            <nav className="topic-related" aria-label="related topics">
              <h2>related</h2>
              <ul>
                {relatedTopics.map((other) => (
                  <li key={other.path}><a href={safeUrl(other.path)}>{other.name}</a></li>
                ))}
              </ul>
            </nav>
          ) : null}
        </section>
      </main>
    </PageShell>
  );
}
