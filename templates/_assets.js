// Asset filename registry — populated by build.js after minify+hash.
// Templates call `asset('_shared.css')` to emit the content-hashed filename
// (e.g. `_shared.3a7b9f12.css`). Returns the original filename as a fallback
// so tests or tools that render templates without running the build still
// produce usable URLs.

/** @type {Record<string, string>} */
let registry = {};

/**
 * Merge a `{ originalFilename: hashedFilename }` map into the asset registry.
 * Called once from build.js after every CSS/JS file has been minified and
 * content-hashed. Subsequent calls merge (later wins) so partial updates
 * during development don't clear the registry.
 *
 * @param {Record<string, string>} map original → hashed filename
 * @returns {void}
 */
export function setAssets(map) {
  registry = { ...registry, ...map };
}

/**
 * Resolve a logical asset name (e.g. `_shared.css`) to its content-hashed
 * filename (e.g. `_shared.3a7b9f12.css`). Returns the input unchanged when
 * the registry has no entry, so unit-testing a template without running the
 * full build still produces usable (un-hashed) URLs.
 *
 * @param {string} name logical asset name
 * @returns {string} hashed filename, or `name` as fallback
 */
export function asset(name) {
  return registry[name] || name;
}
