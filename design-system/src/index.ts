// @mattdoes/ds — the components that render mattdoes.online to static HTML.
// Styles live in static/_shared.css, which the site build hashes and ships.

export { safeUrl, relValue, fmtIsoDay, escHtml } from './lib/format';
export type { DateInput } from './lib/format';

export { PageShell } from './components/PageShell';
export type { PageShellProps } from './components/PageShell';

export { Time } from './components/Time';
export type { TimeProps } from './components/Time';

export { TimelineHeader } from './components/TimelineHeader';
export type { TimelineHeaderProps } from './components/TimelineHeader';
