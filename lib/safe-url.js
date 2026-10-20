// HTML escaping and URL allowlisting for anything that reaches an attribute.
// Last.fm rows and Letterboxd fields are untrusted. mailto: is allowed so
// Cloudflare Email Obfuscation can find the real address and rewrite it.

/**
 * @param {unknown} s
 * @returns {string}
 */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Allow http(s), mailto, tel, anchors, and same-origin paths.
 * Anything else, including javascript: and protocol-relative URLs, becomes '#'.
 * Nullish or blank input becomes ''.
 *
 * @param {unknown} url
 * @returns {string}
 */
export function safeUrl(url) {
  if (url == null) return '';
  const s = String(url).trim();
  if (s === '') return '';
  if (/^(https?:|mailto:|tel:|#)/i.test(s)) return s;
  if (s.startsWith('//')) return '#';
  if (s.startsWith('/') || s.startsWith('./')) {
    const pathPart = s.split(/[?#]/, 1)[0];
    let decoded = pathPart;
    try { decoded = decodeURIComponent(pathPart); } catch { /* keep raw */ }
    if (decoded.split('/').includes('..')) return '#';
    return s;
  }
  return '#';
}

/**
 * @param {unknown} url
 * @returns {string} leading-space attribute fragment, or ''
 */
export function relFor(url) {
  if (url == null) return '';
  return /^(https?:)?\/\//i.test(String(url).trim()) ? ' rel="noopener noreferrer"' : '';
}
