// One line to add a row. The slug is the folder under concepts/ and the
// path under /unshared/. The publish step fails when the folder has no
// index.html. The phone kicker keeps this line; the row itself is the label.

export const unsharedPrefix = 'unshared does';

export const unsharedEntries = [
  { slug: 'birds1', label: 'birds1' },
];

/**
 * @param {{ slug: string }} entry
 * @returns {string}
 */
export function unsharedHref(entry) {
  return `/unshared/${entry.slug}/`;
}
