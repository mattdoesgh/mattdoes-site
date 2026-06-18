import { ArticleRow } from '@mattdoes/ds';

export const JournalPost = () => (
  <ArticleRow
    url="/journal/on-typography/"
    title="On choosing a single typeface"
    date="2026-06-12T09:00:00.000Z"
    summary="One mono family, four weights, and what that buys."
    tags={['design', 'typography']}
    kind="journal"
    showKind
  />
);

export const MakingPost = () => (
  <ArticleRow
    url="/making/edge-workers/"
    title="Two tiny workers, one origin"
    date="2026-06-08T11:30:00.000Z"
    summary="Keeping the CSP at connect-src self while staying live."
    tags={['cloudflare', 'architecture']}
    kind="making"
    showKind
  />
);

export const SingleKindWithReadTime = () => (
  <ArticleRow
    url="/journal/slow-web/"
    title="In praise of the slow web"
    date="2026-05-30T18:00:00.000Z"
    summary="Static HTML, no tracker, and the joy of a 12KB page."
    readTime="4 min"
    tags={['web', 'performance']}
  />
);

export const NoSummary = () => (
  <ArticleRow url="/making/rss-feed/" title="Adding an Atom feed" date="2026-05-20T10:00:00.000Z" kind="making" showKind />
);
