// Page Content-Security-Policy.
//
// The build writes both Content-Security-Policy and
// Content-Security-Policy-Report-Only into dist/_headers from the lists
// below. Add a host by appending one line to that directive's sources.
// Leave the two marker lines in static/_headers alone.
//
// connect-src 'self' already allows same-origin fetches, including
// /api/listening/now, /api/listening/recent, and any later path under
// /api/listening/. A browser call to a new origin is one new line on
// connect-src, img-src, media-src, script-src, or frame-src. An <a> to
// https://www.last.fm is a navigation and does not need a host here.

export const CSP_REPORT_URI = 'https://mattdoes.online/api/csp-report';

/** @type {{ name: string, sources: string[] }[]} */
export const CSP_DIRECTIVES = [
  { name: 'default-src', sources: ["'self'"] },
  { name: 'script-src', sources: [
    "'self'",
    'https://static.cloudflareinsights.com',
    "'inline-speculation-rules'",
  ] },
  { name: 'script-src-attr', sources: ["'none'"] },
  { name: 'worker-src', sources: ["'none'"] },
  { name: 'img-src', sources: [
    "'self'",
    'https://media.mattdoes.online',
    'data:',
  ] },
  { name: 'media-src', sources: [
    "'self'",
    'https://media.mattdoes.online',
  ] },
  { name: 'style-src', sources: ["'self'"] },
  { name: 'style-src-attr', sources: ["'none'"] },
  { name: 'font-src', sources: ["'self'"] },
  { name: 'connect-src', sources: [
    "'self'",
    'https://cloudflareinsights.com',
  ] },
  { name: 'frame-ancestors', sources: ["'none'"] },
  { name: 'frame-src', sources: [
    'https://embed.music.apple.com',
  ] },
  { name: 'object-src', sources: ["'none'"] },
  { name: 'base-uri', sources: ["'self'"] },
  { name: 'form-action', sources: ["'self'"] },
];

/**
 * @param {string} name
 * @returns {string[]}
 */
export function directiveSources(name) {
  const found = CSP_DIRECTIVES.find((directive) => directive.name === name);
  if (!found) throw new Error(`unknown CSP directive ${name}`);
  return found.sources;
}

/**
 * Enforced policy, or the report-only twin when `reportUri` is set.
 * Report-only omits upgrade-insecure-requests: browsers log an error and
 * ignore that directive in a report-only policy.
 *
 * @param {{ reportUri?: string }} [opts]
 * @returns {string}
 */
export function contentSecurityPolicy({ reportUri } = {}) {
  const names = new Set();
  const parts = CSP_DIRECTIVES.map((directive) => {
    if (names.has(directive.name)) throw new Error(`duplicate CSP directive ${directive.name}`);
    names.add(directive.name);
    if (directive.sources.length === 0) throw new Error(`${directive.name} has no sources`);
    for (const source of directive.sources) {
      if (typeof source !== 'string' || source === '' || /[\s;]/.test(source)) {
        throw new Error(`${directive.name} source must be one token`);
      }
    }
    return `${directive.name} ${directive.sources.join(' ')}`;
  });
  if (reportUri) {
    if (typeof reportUri !== 'string' || /[\s;]/.test(reportUri)) {
      throw new Error('report-uri must be one token');
    }
    parts.push(`report-uri ${reportUri}`);
  } else {
    parts.push('upgrade-insecure-requests');
  }
  return parts.join('; ');
}
