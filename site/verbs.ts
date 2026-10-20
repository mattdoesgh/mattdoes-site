// Verb registry. Nav, routes, and the sitemap are generated from `verbs`.
// `/` and `/404` are the shell. `/frequency/` is the only secret page:
// built, noindex, and absent from this list.

export const DATA_SOURCES = ['letterboxd', 'listening', 'static'] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const RENDERERS = ['watch', 'listen', 'unshared'] as const;
export type RendererName = (typeof RENDERERS)[number];

export interface Verb {
  readonly slug: string;
  readonly label: string;
  readonly number: string;
  readonly source: DataSource;
  readonly renderer: RendererName;
}

export const verbs = [
  { slug: 'watch', label: 'watch', number: '01', source: 'letterboxd', renderer: 'watch' },
  { slug: 'listen', label: 'listen', number: '02', source: 'listening', renderer: 'listen' },
  { slug: 'unshared', label: 'unshared', number: '03', source: 'static', renderer: 'unshared' },
] as const satisfies readonly Verb[];

/** Built, but not a verb: noindex, not in the menu, sitemap, or anomaly index. */
export const SECRET_PATHS = ['/frequency/'] as const;

/**
 * Unshared player. `bandcamp` is optional. Leave it unset until there is a URL.
 * An unset field emits no Bandcamp markup and does not need a frame-src host.
 */
export interface UnsharedPlayer {
  readonly bandcamp?: string;
}

export const unsharedPlayer: UnsharedPlayer = {};

const REQUIRED_SLUGS = ['watch', 'listen', 'unshared'] as const;

export function verbPath(slug: string): string {
  return `/${slug}/`;
}

/** Public crawl paths. Secrets are not included. */
export function sitemapPaths(): readonly string[] {
  return ['/', ...verbs.map((verb) => verbPath(verb.slug))];
}

export function validateVerbs(
  list: readonly { slug: string; label: string; number: string; source: string; renderer: string }[],
  knownRenderers: readonly string[],
): void {
  const slugs = new Set<string>();
  for (const verb of list) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(verb.slug)) {
      throw new Error(`verb registry: invalid slug "${verb.slug}"`);
    }
    if (slugs.has(verb.slug)) {
      throw new Error(`verb registry: duplicate slug "${verb.slug}"`);
    }
    slugs.add(verb.slug);
    if (!(DATA_SOURCES as readonly string[]).includes(verb.source)) {
      throw new Error(`verb registry: unknown data source "${verb.source}" for ${verb.slug}`);
    }
    if (!knownRenderers.includes(verb.renderer)) {
      throw new Error(`verb registry: missing renderer "${verb.renderer}" for ${verb.slug}`);
    }
  }
  for (const name of REQUIRED_SLUGS) {
    if (!slugs.has(name)) throw new Error(`verb registry: missing verb "${name}"`);
  }
}

/** Fail the build when the registry and the renderers disagree. */
export function assertRegistry(knownRenderers: readonly string[]): void {
  validateVerbs(verbs, knownRenderers);
}
