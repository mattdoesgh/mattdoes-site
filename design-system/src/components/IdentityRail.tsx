import type { ReactNode } from 'react';

export interface IdentityStat {
  /** The numeric/emphasised value (rendered in `<span class="n">`). */
  n: ReactNode;
  /** The trailing label, e.g. `"journal"`. */
  label: string;
  /** Optional id on the value span — e.g. `"scrobble-count"` for live updates. */
  id?: string;
}

export interface IdentityRailProps {
  /** Heading line (`<div class="who">`). */
  who?: string;
  /** Subtitle (`<div class="bio">`). */
  bio?: string;
  /** Stat chips (`<div class="stats">`); omitted entirely when empty. */
  stats?: IdentityStat[];
  /** Extra rail groups below the identity block (elsewhere links, recent, etc.). */
  children?: ReactNode;
}

/**
 * The left-rail "page meta" block shared by every page: a who/bio/stats identity
 * card followed by page-specific groups (passed as children). Replaces the
 * hand-duplicated `<aside class="side-left">…<div class="ident">` scaffold.
 */
export function IdentityRail({ who, bio, stats, children }: IdentityRailProps) {
  return (
    <aside className="side-left" aria-label="page meta">
      <div className="ident">
        {who ? <div className="who">{who}</div> : null}
        {bio ? <div className="bio">{bio}</div> : null}
        {stats && stats.length ? (
          <div className="stats">
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
      </div>
      {children}
    </aside>
  );
}
