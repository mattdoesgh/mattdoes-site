import type { CSSProperties, ReactNode } from 'react';

export type Accent = 'warm' | 'pink' | 'blue' | 'green';
export type Theme = 'dark' | 'light';

/** Accent values, mirrored from the client tweaks script's `ACCENTS` map. */
export const ACCENTS: Record<Accent, string> = {
  warm: 'oklch(0.65 0.09 65)',
  pink: '#f77bc9',
  blue: 'oklch(0.65 0.12 240)',
  green: 'oklch(0.65 0.12 150)',
};

export interface ThemeProviderProps {
  /** Color theme. Default `'dark'` (the site's default). */
  theme?: Theme;
  /** User-selectable accent. Default `'pink'`. */
  accent?: Accent;
  children?: ReactNode;
}

/**
 * Establishes the design system's theming on a wrapper element: sets
 * `data-theme` and an inline `--accent` so the chosen accent cascades to every
 * descendant. The inherited `--accent` custom property drives accent fills,
 * dots, and (via `--accent-fg`) accent text.
 *
 * Note: the dark/light *token sets* in `static/_shared.css` are scoped to the
 * document `html` element, so the `data-theme` here is forward-compatible but
 * does not yet re-theme a nested subtree on its own — full per-subtree theming
 * lands when the token scope is widened during the migration (docs/adr/0003).
 */
export function ThemeProvider({ theme = 'dark', accent = 'pink', children }: ThemeProviderProps) {
  const style = { '--accent': ACCENTS[accent] } as CSSProperties;
  return (
    <div className="ds-root" data-theme={theme} style={style}>
      {children}
    </div>
  );
}
