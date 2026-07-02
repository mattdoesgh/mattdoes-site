import type { ReactNode } from 'react';

export interface HeroStat {
  /** The numeric/emphasised value (rendered in `<span class="n">`). */
  n: ReactNode;
  /** The trailing label, e.g. `"journal"`. */
  label: string;
  /** Optional id on the value span — e.g. `"scrobble-count"` for live updates. */
  id?: string;
}

export interface HeroProps {
  /** The bold part of the wordmark, e.g. `"matt"`. */
  name?: string;
  /** The dimmed remainder of the wordmark, e.g. `"does"`. */
  dim?: string;
  /** Small mono line above the wordmark, e.g. the handle. */
  kicker?: string;
  /** One-line tagline under the wordmark (the bio). */
  tagline?: string;
  /** Stat strip (`.hero-stats`); omitted entirely when empty. */
  stats?: HeroStat[];
  /** Action links (`ActionLink`s) rendered in a `.home-actions` nav. */
  actions?: ReactNode;
}

/**
 * Full-width homepage hero band. Sits as the first child of `main.page` and
 * spans every grid column (`.hero { grid-column: 1 / -1 }`). Deliberately a
 * `<section>` with a `<p>` wordmark — the page's single `<h1>` stays with
 * `TimelineHeader`, and the identity line's old `h2.who` heading is
 * intentionally dropped (a wordmark isn't a section heading; the band is
 * reachable as the named "intro" region instead).
 *
 * All motion is CSS-only (entrance rise + accent shimmer in _shared.css),
 * guarded by `prefers-reduced-motion` — no client JS, no CSP impact.
 */
export function Hero({ name, dim, kicker, tagline, stats, actions }: HeroProps) {
  if (!name && !kicker && !tagline && !(stats && stats.length) && !actions) return null;
  return (
    <section className="hero" aria-label="intro">
      {kicker ? <p className="hero-kicker">{kicker}</p> : null}
      {name ? (
        <p className="hero-title">
          {name}
          {dim ? <span className="dim">{dim}</span> : null}
          <span className="hero-dot" aria-hidden="true">
            .
          </span>
        </p>
      ) : null}
      {tagline ? <p className="hero-tagline">{tagline}</p> : null}
      {stats && stats.length ? (
        <div className="hero-stats">
          {stats.map((s) => (
            <span className="s" key={s.id || s.label}>
              <span className="n" id={s.id}>
                {s.n}
              </span>
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
      {actions ? (
        <nav className="home-actions hero-actions" aria-label="quick links">
          {actions}
        </nav>
      ) : null}
    </section>
  );
}
