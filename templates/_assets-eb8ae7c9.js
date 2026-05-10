// Asset filename registry — populated by build.js after minify+hash.
// Templates call `asset('_shared.css')` to emit the content-hashed filename
// (e.g. `_shared.3a7b9f12.css`). Returns the original filename as a fallback
// so tests or tools that render templates without running the build still
// produce usable URLs.

let registry = {};

export function setAssets(map) {
  registry = { ...registry, ...map };
}

export function asset(name) {
  return registry[name] || name;
}
