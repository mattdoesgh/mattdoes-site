// Design tokens. site/tokens.css is the only place a raw color, font
// stack, or font size is written. Pages use var(--token).
//
// Polarity roles, the font stacks, and --row-size stay live in the shipped
// CSS. Palette swatches and every other token are inlined at build time so
// the stylesheet stays inside the byte budget and @supports still sees a
// real color.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');
export const TOKEN_FILE = path.join(REPO_ROOT, 'site', 'tokens.css');

/** Custom properties that must survive minify. Font stacks would bloat if
 *  they were repeated. Polarity roles have to stay variable. */
export const LIVE_TOKENS = new Set([
  '--field',
  '--ink',
  '--signal',
  '--focus',
  '--rule',
  '--display',
  '--body',
  '--mono',
  '--row-size',
]);

const FONT_TOKENS = new Set(['--display', '--body', '--mono']);
const SIZE_TOKEN = /^--(?:type-[\w-]+|row-size)$/;

const COLOR_LITERAL = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|\bcolor\(/g;

const NAMED_COLORS = new Set(`
  black white red green blue yellow orange purple pink gray grey
  aqua navy teal silver maroon olive lime fuchsia
`.trim().split(/\s+/));

const ALLOWED_COLOR_KEYWORDS = new Set([
  'currentcolor', 'transparent', 'inherit', 'initial', 'unset', 'revert', 'revert-layer',
]);

/**
 * @param {string} css
 * @returns {Map<string, string>} first value of each custom property
 */
export function parseTokens(css) {
  const blanked = blankComments(css);
  /** @type {Map<string, string>} */
  const values = new Map();
  /** @type {Map<string, number>} */
  const counts = new Map();
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = re.exec(blanked))) {
    const name = match[1];
    const value = match[2].trim();
    counts.set(name, (counts.get(name) || 0) + 1);
    if (!values.has(name)) values.set(name, value);
  }
  return values;
}

/**
 * @param {string} [file]
 * @returns {Map<string, string>}
 */
export function loadTokens(file = TOKEN_FILE) {
  return parseTokens(fs.readFileSync(file, 'utf8'));
}

/**
 * Names that stay as custom properties: the live set, plus anything the
 * token file defines more than once (the polarity override).
 *
 * @param {Map<string, string>} tokens
 * @param {string} [css]
 * @returns {Set<string>}
 */
export function liveTokenNames(tokens, css) {
  const source = css ?? fs.readFileSync(TOKEN_FILE, 'utf8');
  const counts = new Map();
  const re = /(--[\w-]+)\s*:/g;
  let match;
  while ((match = re.exec(blankComments(source)))) {
    counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  }
  const live = new Set(LIVE_TOKENS);
  for (const [name, count] of counts) {
    if (count > 1) live.add(name);
  }
  return live;
}

/**
 * Replace var(--token) for tokens that are not live, then drop those
 * declarations. Live tokens are unchanged.
 *
 * @param {string} css
 * @param {Map<string, string>} [tokens]
 * @returns {string}
 */
export function inlineStaticTokens(css, tokens = loadTokens()) {
  const live = liveTokenNames(tokens);
  const resolved = new Map();
  const resolving = new Set();

  /**
   * @param {string} name
   * @returns {string}
   */
  function resolve(name) {
    if (live.has(name) || !tokens.has(name)) return `var(${name})`;
    if (resolved.has(name)) return resolved.get(name);
    if (resolving.has(name)) throw new Error(`design token cycle: ${name}`);
    resolving.add(name);
    const value = tokens.get(name).replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, inner) => resolve(inner));
    resolving.delete(name);
    resolved.set(name, value);
    return value;
  }

  let out = css.replace(/var\(\s*(--[\w-]+)\s*\)/g, (full, name) => {
    if (live.has(name) || !tokens.has(name)) return full;
    return resolve(name);
  });

  for (const name of tokens.keys()) {
    if (live.has(name)) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const decl = new RegExp(`(^|[{;])([\\s]*)${escaped}\\s*:\\s*(?:[^;"']|"[^"]*"|'[^']*')*;`, 'g');
    out = out.replace(decl, '$1$2');
  }
  return out;
}

/**
 * @param {string} text
 * @returns {string}
 */
function blankComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

/**
 * @param {string} css
 * @returns {string}
 */
function blankFontFace(css) {
  return css.replace(/@font-face\s*\{[\s\S]*?\}/g, (block) => block.replace(/[^\n]/g, ' '));
}

/**
 * @param {string} hex
 * @returns {string}
 */
export function normalizeHex(hex) {
  let body = hex.slice(1).toLowerCase();
  if (body.length === 3 || body.length === 4) body = body.split('').map((ch) => ch + ch).join('');
  return `#${body.slice(0, 6)}`;
}

/**
 * Hex colors the palette actually is. SVG marks may use these directly
 * because a favicon is not styled by the page stylesheet.
 *
 * @param {Map<string, string>} tokens
 * @returns {Set<string>}
 */
export function paletteHexes(tokens) {
  const hexes = new Set();
  const seen = new Set();
  /**
   * @param {string} name
   */
  function walk(name) {
    if (seen.has(name) || !tokens.has(name)) return;
    seen.add(name);
    const value = tokens.get(name);
    const ref = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    if (ref) {
      walk(ref[1]);
      return;
    }
    const hex = value.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/);
    if (hex) hexes.add(normalizeHex(hex[0]));
  }
  for (const name of ['--black', '--white', '--pink', '--signal', '--field', '--ink']) walk(name);
  return hexes;
}

/**
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/**
 * @param {string} css
 * @param {string} file
 * @param {Map<string, string>} tokens
 * @param {{ svg?: boolean }} [opts]
 * @returns {string[]}
 */
export function violationsInCss(css, file, tokens, opts = {}) {
  const violations = [];
  const palette = paletteHexes(tokens);
  const blanked = blankComments(css);
  const forFamilies = blankFontFace(blanked);

  if (!opts.svg) {
    for (const match of blanked.matchAll(COLOR_LITERAL)) {
      violations.push(`${file}:${lineOf(css, match.index)} raw color ${match[0]} is outside site/tokens.css`);
    }
    const named = /(?:^|[{;\s])(?:color|background(?:-color)?|border(?:-top|-right|-bottom|-left)?(?:-color)?|outline(?:-color)?|fill|stroke|caret-color|-webkit-text-fill-color)\s*:\s*([a-zA-Z]+)\b/g;
    for (const match of blanked.matchAll(named)) {
      const word = match[1].toLowerCase();
      if (ALLOWED_COLOR_KEYWORDS.has(word) || word === 'var') continue;
      if (NAMED_COLORS.has(word)) {
        violations.push(`${file}:${lineOf(css, match.index)} raw color ${match[1]} is outside site/tokens.css`);
      }
    }
  } else {
    for (const match of blanked.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g)) {
      if (!palette.has(normalizeHex(match[0]))) {
        violations.push(`${file}:${lineOf(css, match.index)} raw color ${match[0]} is outside the token palette`);
      }
    }
  }

  if (!opts.svg) {
    const familyRe = /font-family\s*:\s*([^;]+);/g;
    for (const match of forFamilies.matchAll(familyRe)) {
      const value = match[1].trim().replace(/\s*!important\s*$/, '');
      if (/^var\(\s*--(?:display|body|mono)\s*\)$/.test(value) && FONT_TOKENS.has(value.slice(4, -1).trim())) {
        continue;
      }
      const ref = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
      if (ref && FONT_TOKENS.has(ref[1]) && tokens.has(ref[1])) continue;
      violations.push(`${file}:${lineOf(css, match.index)} font-family ${value} is outside the token set`);
    }

    const sizeRe = /font-size\s*:\s*([^;]+);/g;
    for (const match of blanked.matchAll(sizeRe)) {
      const value = match[1].trim().replace(/\s*!important\s*$/, '');
      const ref = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
      if (ref && SIZE_TOKEN.test(ref[1]) && tokens.has(ref[1])) continue;
      violations.push(`${file}:${lineOf(css, match.index)} font-size ${value} is outside the token set`);
    }

    const radiusRe = /border-radius\s*:\s*([^;]+);/g;
    for (const match of blanked.matchAll(radiusRe)) {
      const value = match[1].trim();
      if (value === 'var(--radius)' && tokens.has('--radius')) continue;
      violations.push(`${file}:${lineOf(css, match.index)} border-radius ${value} is outside the token set`);
    }

    const varRe = /var\(\s*(--[\w-]+)\s*\)/g;
    for (const match of blanked.matchAll(varRe)) {
      if (!tokens.has(match[1])) {
        violations.push(`${file}:${lineOf(css, match.index)} unknown token ${match[1]}`);
      }
    }
  }

  return violations;
}

/**
 * @param {string} text
 * @param {string} file
 * @param {Map<string, string>} tokens
 * @returns {string[]}
 */
export function violationsInSource(text, file, tokens) {
  const blanked = blankComments(text);
  const violations = [];
  for (const match of blanked.matchAll(COLOR_LITERAL)) {
    violations.push(`${file}:${lineOf(text, match.index)} raw color ${match[0]} is outside site/tokens.css`);
  }
  for (const match of blanked.matchAll(/font-family\s*:\s*([^;'"\n]+)/g)) {
    const value = match[1].trim();
    if (/^var\(\s*--(?:display|body|mono)\s*\)/.test(value)) continue;
    violations.push(`${file}:${lineOf(text, match.index)} font-family ${value} is outside the token set`);
  }
  for (const match of blanked.matchAll(/font-size\s*:\s*([^;'"\n]+)/g)) {
    const value = match[1].trim();
    const ref = value.match(/^var\(\s*(--[\w-]+)\s*\)/);
    if (ref && SIZE_TOKEN.test(ref[1]) && tokens.has(ref[1])) continue;
    violations.push(`${file}:${lineOf(text, match.index)} font-size ${value} is outside the token set`);
  }
  return violations;
}

const SOURCE_EXT = new Set(['.css', '.js', '.ts', '.svg']);

/**
 * @param {string} [root]
 * @returns {string[]}
 */
export function findTokenViolations(root = REPO_ROOT) {
  const tokens = loadTokens(path.join(root, 'site', 'tokens.css'));
  const tokenFile = path.resolve(root, 'site', 'tokens.css');
  const violations = [];
  for (const dir of ['static', 'site']) {
    walk(path.join(root, dir), (file) => {
      if (path.resolve(file) === tokenFile) return;
      const ext = path.extname(file);
      if (!SOURCE_EXT.has(ext)) return;
      if (file.includes(`${path.sep}fonts${path.sep}`)) return;
      const text = fs.readFileSync(file, 'utf8');
      const rel = path.relative(root, file);
      if (ext === '.css') violations.push(...violationsInCss(text, rel, tokens));
      else if (ext === '.svg') violations.push(...violationsInCss(text, rel, tokens, { svg: true }));
      else violations.push(...violationsInSource(text, rel, tokens));
    });
  }
  return violations;
}

/**
 * @param {string} dir
 * @param {(file: string) => void} visit
 */
function walk(dir, visit) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) walk(file, visit);
    else visit(file);
  }
}
