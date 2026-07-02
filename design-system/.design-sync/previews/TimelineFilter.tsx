import { TimelineFilter } from '@mattdoes/ds';

// Server-rendered fallback for the hydrated timeline controls (filter chips +
// entry count + comfortable/compact density). Wrapped in `.timeline` so the
// density buttons sit in their real context.

const links = [
  { label: 'all', href: '/', all: true, current: true },
  { label: 'journal', href: '/?kind=journal', kindFilter: 'journal' },
  { label: 'making', href: '/?kind=making', kindFilter: 'making' },
  { label: 'design', href: '/?tag=design', filter: 'design' },
  { label: 'cloudflare', href: '/?tag=cloudflare', filter: 'cloudflare' },
];

export const FilterBar = () => (
  <section className="timeline">
    <TimelineFilter links={links} count={42} countLabel="entries" />
  </section>
);

export const TagSelected = () => (
  <section className="timeline">
    <TimelineFilter
      links={links.map((l) => ({ ...l, current: l.filter === 'design' }))}
      count={8}
      countLabel="entries"
    />
  </section>
);
