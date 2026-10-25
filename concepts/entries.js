// One line to add an "unshared does X" row. The slug is the folder under
// concepts/ and the path under /unshared/. The preview copy fails when the
// folder has no index.html.

export const unsharedPrefix = 'unshared does';

export const unsharedEntries = [
  { slug: 'ambient', label: 'ambient' },
];

/**
 * @param {{ slug: string }} entry
 * @returns {string}
 */
export function unsharedHref(entry) {
  return `/unshared/${entry.slug}/`;
}
