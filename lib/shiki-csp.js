// lib/shiki-csp.js — replace Shiki inline style attributes with build-time
// CSS classes so style-src can drop 'unsafe-inline'.
//
// Shiki's dual-theme output uses per-token `style="--shiki-light:…;--shiki-dark:…"`
// attributes. We dedupe those declarations into `.sk-N` rules appended to the
// shipped stylesheet during emit().

/** @type {Map<string, string>} style declaration → class name */
let styleToClass = new Map();
/** @type {number} */
let nextId = 0;

/** Reset the class registry at the start of each emit() pass. */
export function resetShikiClasses() {
  styleToClass = new Map();
  nextId = 0;
}

/**
 * @param {string} style inline style attribute value
 * @returns {string} generated class name
 */
function classForStyle(style) {
  let cls = styleToClass.get(style);
  if (!cls) {
    cls = `sk-${nextId++}`;
    styleToClass.set(style, cls);
  }
  return cls;
}

/**
 * Replace inline `style="…"` on Shiki markup with deduped classes.
 *
 * @param {string} html highlighted-code HTML from Shiki
 * @returns {string}
 */
export function classifyShikiHtml(html) {
  return String(html || '').replace(
    /<([a-z][a-z0-9]*)\b([^>]*?)\sstyle="([^"]*)"([^>]*)>/gi,
    (full, tag, before, style, after) => {
      const cls = classForStyle(style);
      const attrs = `${before}${after}`;
      const classRe = /\bclass="([^"]*)"/i;
      if (classRe.test(attrs)) {
        const merged = attrs.replace(classRe, (_, existing) => ` class="${existing} ${cls}"`);
        return `<${tag}${merged}>`;
      }
      return `<${tag}${before} class="${cls}"${after}>`;
    },
  );
}

/**
 * Emit deduped CSS rules for every classified Shiki token.
 *
 * @returns {string} CSS block (may be empty)
 */
export function shikiClassCss() {
  if (!styleToClass.size) return '';
  const rules = [];
  for (const [style, cls] of styleToClass) {
    rules.push(`.${cls}{${style}}`);
  }
  return `\n/* Shiki token classes (generated at build — CSP-safe) */\n${rules.join('\n')}\n`;
}
