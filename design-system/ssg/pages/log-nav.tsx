// Cross-links for the three public log pages. They live in the footer (the
// reading nav stays writing / posts / listening / about); once you're on
// one of them, this row is the short way to the other two.

const LINKS = [
  { id: 'digs', href: '/digs/', label: 'digs' },
  { id: 'movies', href: '/movies/', label: 'movies' },
  { id: 'grok', href: '/grok/', label: 'grok says' },
];

export function LogNav({ current }: { current: string }) {
  return (
    <nav className="log-nav" aria-label="sections">
      {LINKS.map((link) => {
        const on = link.id === current;
        return (
          <a key={link.id} href={link.href} aria-current={on ? 'page' : undefined}>
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}
