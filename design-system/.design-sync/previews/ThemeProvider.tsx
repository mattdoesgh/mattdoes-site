import { ThemeProvider, ArticleRow } from '@mattdoes/ds';

// The accent (warm / pink / blue / green) is an inherited custom property, so
// each ThemeProvider re-tints the accent-colored bits (the kind label, the tag
// chips) of whatever it wraps.
const sample = (
  <div className="timeline">
    <ArticleRow
      url="/journal/on-typography/"
      title="On choosing a single typeface"
      date="2026-06-12T09:00:00.000Z"
      summary="One mono family, four weights, and what that buys."
      tags={['design', 'typography']}
      kind="journal"
      showKind
    />
  </div>
);

export const Pink = () => <ThemeProvider accent="pink">{sample}</ThemeProvider>;

export const Warm = () => <ThemeProvider accent="warm">{sample}</ThemeProvider>;

export const Blue = () => <ThemeProvider accent="blue">{sample}</ThemeProvider>;

export const Green = () => <ThemeProvider accent="green">{sample}</ThemeProvider>;
