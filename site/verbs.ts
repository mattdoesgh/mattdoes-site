// Verb registry. Nav, routes, and the sitemap are generated from `verbs`.
// The slug is the URL. The label is the visible words after "matt does".
// `/` and `/404` are the shell. `/frequency/` stays out of this list.

export const DATA_SOURCES = ['letterboxd', 'listening', 'static'] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const RENDERERS = ['watch', 'listen', 'unshared'] as const;
export type RendererName = (typeof RENDERERS)[number];

export interface Verb {
  readonly slug: string;
  readonly label: string;
  readonly source: DataSource;
  readonly renderer: RendererName;
}

/** Set true to publish /unshared/ again. The page renderer stays. */
export const unsharedEnabled = false;

export const verbCatalog = [
  { slug: 'watching', label: 'letterboxd', source: 'letterboxd', renderer: 'watch' },
  { slug: 'listening', label: 'last.fm', source: 'listening', renderer: 'listen' },
  { slug: 'unshared', label: 'unshared', source: 'static', renderer: 'unshared' },
] as const satisfies readonly Verb[];

export const verbs = verbCatalog.filter((verb) => unsharedEnabled || verb.slug !== 'unshared');

/** Footer socials. One line to add or remove a link. */
export interface SocialLink {
  readonly label: string;
  readonly href: string;
}

export const socials = [
  { label: 'x', href: 'https://x.com/mattdoes' },
  { label: 'instagram', href: 'https://www.instagram.com/mattdoes.ig/' },
  { label: 'letterboxd', href: 'https://letterboxd.com/mattdoes/' },
  { label: 'last.fm', href: 'https://www.last.fm/user/djverism' },
  { label: 'github', href: 'https://github.com/mattdoesgh' },
] as const satisfies readonly SocialLink[];

/** Add '/frequency/' to bring that page back. Empty keeps it offline. */
export const SECRET_PATHS: readonly string[] = [];

/**
 * Unshared player. `bandcamp` is optional. Leave it unset until there is a URL.
 * An unset field emits no Bandcamp markup and does not need a frame-src host.
 */
export interface UnsharedPlayer {
  readonly bandcamp?: string;
}

export const unsharedPlayer: UnsharedPlayer = {};

/**
 * Public Unshared address. `email` is optional. An unset field emits no
 * mailto and no contact heading.
 */
export interface UnsharedContact {
  readonly email?: string;
}

export const unsharedContact: UnsharedContact = {
  email: 'luciadoes+unshared@mail.grokbot.com',
};

const REQUIRED_SLUGS = ['watching', 'listening'] as const;

/** The one visible name. Nav links and each verb's h1 use this. */
export function verbHeading(label: string): string {
  return `matt does ${label}`;
}

export function verbPath(slug: string): string {
  return `/${slug}/`;
}

/** Public crawl paths. Secrets are not included. */
export function sitemapPaths(): readonly string[] {
  return ['/', ...verbs.map((verb) => verbPath(verb.slug))];
}

export function validateVerbs(
  list: readonly { slug: string; label: string; source: string; renderer: string }[],
  knownRenderers: readonly string[],
): void {
  const slugs = new Set<string>();
  for (const verb of list) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(verb.slug)) {
      throw new Error(`verb registry: invalid slug "${verb.slug}"`);
    }
    if (!/^[a-z.]+$/.test(verb.label)) {
      throw new Error(`verb registry: invalid label "${verb.label}"`);
    }
    const heading = verbHeading(verb.label);
    if (!/^matt does [a-z.]+$/.test(heading)) {
      throw new Error(`verb registry: invalid heading "${heading}"`);
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
  validateSocials(socials);
}

/** Labels stay lowercase words. Hrefs stay https profile links. */
export function validateSocials(list: readonly SocialLink[]): void {
  const labels = new Set<string>();
  for (const item of list) {
    if (!/^[a-z0-9.]+$/.test(item.label)) {
      throw new Error(`social registry: invalid label "${item.label}"`);
    }
    if (labels.has(item.label)) {
      throw new Error(`social registry: duplicate label "${item.label}"`);
    }
    labels.add(item.label);
    let parsed: URL;
    try {
      parsed = new URL(item.href);
    } catch {
      throw new Error(`social registry: invalid href "${item.href}"`);
    }
    if (parsed.protocol !== 'https:') {
      throw new Error(`social registry: href must be https "${item.href}"`);
    }
    if (parsed.pathname.includes('/unshared')) {
      throw new Error(`social registry: href must not point at unshared "${item.href}"`);
    }
  }
}
