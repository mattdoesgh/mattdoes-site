// Parse a Cloudflare Pages `_headers` file into route → header map.
// Route keys are path patterns (`/*`, `/fonts/*`, …); header values are
// lower-cased keys mapping to string arrays (duplicate keys are preserved).

/**
 * @param {string} text raw `_headers` file contents
 * @returns {Map<string, Map<string, string[]>>}
 */
export function parseHeadersFile(text) {
  /** @type {Map<string, Map<string, string[]>>} */
  const routes = new Map();
  let current = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    if (!line.startsWith(' ')) {
      current = line.trim();
      if (!routes.has(current)) routes.set(current, new Map());
      continue;
    }

    if (!current) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    const block = routes.get(current);
    if (!block.has(key)) block.set(key, []);
    block.get(key).push(value);
  }

  return routes;
}

/**
 * @param {Map<string, Map<string, string[]>>} routes
 * @param {string} pattern
 * @returns {string[]}
 */
export function headerValues(routes, pattern, name) {
  const block = routes.get(pattern);
  if (!block) return [];
  return block.get(name.toLowerCase()) || [];
}
