import {
  PageShell,
  NotebookDay,
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
export function ThoughtsPage({ siteConfig, days, nowPlaying = '' }: ThoughtsPageProps) {
  return (
    <PageShell
      active="thoughts"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      nowPlaying={nowPlaying}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page page--archive page--thoughts" id="main">
        <section className="timeline notebook" aria-labelledby="notebook-title">
          <header className="timeline-head archive-title">
            <h1 id="notebook-title">thoughts</h1>
          </header>
          {days.length
            ? days.map(day => <NotebookDay key={day.date} {...day} />)
            : <p className="muted">The notebook is empty for now.</p>}
        </section>

      </main>
    </PageShell>
  );
}
