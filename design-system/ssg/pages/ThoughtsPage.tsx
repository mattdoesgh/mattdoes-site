import {
  PageShell,
  IdentityRail,
  ElsewhereLinks,
  NotebookDay,
  RailSection,
  type NotebookDayProps,
  type ExternalLink,
} from '../../src/index';

export interface ThoughtsPageProps {
  siteConfig: {
    title?: string;
    links?: ExternalLink[];
    footerText?: string;
    status?: string;
  };
  days: NotebookDayProps[];
  topics?: { name: string; path: string; count: number }[];
  nowPlaying?: string;
}

/** /thoughts/ — a notebook of authored days, not a stream of micro-posts. */
export function ThoughtsPage({ siteConfig, days, topics = [], nowPlaying = '' }: ThoughtsPageProps) {
  const thoughtCount = days.reduce((sum, day) => sum + day.thoughts.length, 0);
  return (
    <PageShell
      active="thoughts"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      nowPlaying={nowPlaying}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page page--reader-first page--notebook" id="main">
        <section className="timeline notebook" aria-labelledby="notebook-title">
          <header className="post-head notebook-head">
            <div className="kicker"><span className="kind">notebook</span></div>
            <h1 id="notebook-title">thoughts, in context</h1>
            <p className="lede">Short notes kept with the day they came from—unfinished observations, useful fragments, and ideas that may grow into something larger.</p>
          </header>
          {days.length
            ? days.map(day => <NotebookDay key={day.date} {...day} />)
            : <p className="muted">The notebook is empty for now.</p>}
        </section>

        <IdentityRail
          who="notebook"
          bio="The lowest-friction path from a daily note to the public site. Context stays attached."
          stats={[{ n: thoughtCount, label: thoughtCount === 1 ? 'note' : 'notes' }, { n: days.length, label: days.length === 1 ? 'day' : 'days' }]}
        >
          <ElsewhereLinks links={siteConfig.links || []} />
        </IdentityRail>

        {topics.length ? (
          <aside className="side-right" aria-label="idea paths">
            <RailSection heading="idea paths">
              <ul>
                {topics.slice(0, 8).map(topic => (
                  <li key={topic.path}>
                    <a href={topic.path}>{topic.name}</a>
                    <span className="meta">{topic.count}</span>
                  </li>
                ))}
              </ul>
            </RailSection>
          </aside>
        ) : null}
      </main>
    </PageShell>
  );
}
