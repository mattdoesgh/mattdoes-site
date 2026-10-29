// Fail a comment that narrates a conversation or a past version.
// PATTERNS is the list. A line containing lint-comments-allow is skipped.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOW = 'lint-comments-allow';

const SKIP_DIR = new Set([
  'node_modules', 'dist', '.git', '.cache', '.wrangler', 'baselines',
  'test-results', 'playwright-report', 'coverage', 'blob-report',
]);

const PATTERN_SOURCES = [
  { id: 'dont-worry', source: String.raw`\b(?:do not|don't|dont) worry\b`, flags: 'i', sample: 'do not worry about the empty page' },
  { id: 'no-need', source: String.raw`\bno need to\b`, flags: 'i', sample: 'no need to handle the empty case' },
  { id: 'as-discussed', source: String.raw`\bas discussed\b`, flags: 'i', sample: 'as discussed' },
  { id: 'as-requested', source: String.raw`\bas requested\b`, flags: 'i', sample: 'as requested' },
  { id: 'asked-to', source: String.raw`\basked to\b`, flags: 'i', sample: 'the audit asked to revisit this' },
  { id: 'per-name', source: String.raw`\bper\s+(?:matt\b|the user\b|[A-Z][a-z]{2,})`, sample: 'per Alice' },
  { id: 'previously', source: String.raw`\bpreviously\b`, flags: 'i', sample: 'previously this returned null' },
  { id: 'used-to', source: String.raw`\bused to\b`, flags: 'i', sample: 'this used to read notes' },
  { id: 'no-longer', source: String.raw`\bno longer\b`, flags: 'i', sample: 'the page no longer calls it' },
  { id: 'we-now', source: String.raw`\bwe now\b`, flags: 'i', sample: 'we now use the registry' },
  { id: 'for-now', source: String.raw`\bfor now\b`, flags: 'i', sample: 'ship it for now' },
  { id: 'was-retired', source: String.raw`\bwas retired\b`, flags: 'i', sample: 'the worker was retired' },
  { id: 'are-gone', source: String.raw`\bare gone\b`, flags: 'i', sample: 'those files are gone' },
  { id: 'temporary', source: String.raw`\btemporary(?:\s+hack)?\b`, flags: 'i', sample: 'temporary until Monday' },
  { id: 'hack', source: String.raw`\bhack\b`, flags: 'i', sample: 'HACK: skip the check' },
  { id: 'workaround', source: String.raw`\bworkaround\b`, flags: 'i', sample: 'workaround for Safari' },
  { id: 'user-asked', source: String.raw`\b(?:the user|matt)\s+(?:asked|wants|said)\b`, flags: 'i', sample: 'the user asked for a redirect' },
  { id: 'matt', source: String.raw`\bMatt\b`, sample: 'Widths from Matt.' },
  { id: 'assistant', source: String.raw`(?<![\w-])(?:claude|cursor|chatgpt|copilot|anthropic)\b`, flags: 'i', sample: 'Claude suggested this' },
  { id: 'agent', source: String.raw`(?<![\w-])agents?\b`, flags: 'i', sample: 'the agent said to keep it' },
  { id: 'pr', source: String.raw`\bPR\s*#\s*\d+\b`, flags: 'i', sample: 'fixed in PR #12' },
  { id: 'bc-id', source: String.raw`\bbc-[0-9a-f]{8,}\b`, flags: 'i', sample: 'see bc-0123abcd' },
  { id: 'adr', source: String.raw`\bADR\s*\d+\b`, sample: 'ADR 0013' },
];

export const PATTERNS = PATTERN_SOURCES.map((entry) => ({
  ...entry,
  re: new RegExp(entry.source, entry.flags || ''),
}));

export { ALLOW };

const KEYWORD_BEFORE_EXPR = new Set([
  'return', 'throw', 'case', 'else', 'do', 'typeof', 'void', 'delete',
  'in', 'of', 'instanceof', 'await', 'yield', 'new', 'extends',
]);

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

function pushComment(comments, text, line, body) {
  const source = text.split('\n')[line - 1] || '';
  if (source.includes(ALLOW) || body.includes(ALLOW)) return;
  comments.push({ line, text: body });
}

function scanRegex(text, i) {
  let k = i + 1;
  let inClass = false;
  while (k < text.length) {
    const c = text[k];
    if (c === '\n') return -1;
    if (c === '\\') {
      k += 2;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      k += 1;
      continue;
    }
    if (c === '[') {
      inClass = true;
      k += 1;
      continue;
    }
    if (c === '/') {
      k += 1;
      while (k < text.length && /[a-z]/i.test(text[k])) k += 1;
      return k;
    }
    k += 1;
  }
  return -1;
}

function scanCode(text, start, startLine, stopBrace, lineComments) {
  let i = start;
  let line = startLine;
  let depth = 0;
  let last = 'op';
  const comments = [];
  const n = text.length;

  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r') {
      i += 1;
      continue;
    }
    if (c === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (stopBrace && c === '}' && depth === 0) return { i, line, comments };

    if (lineComments && c === '/' && text[i + 1] === '/') {
      const at = line;
      i += 2;
      let body = '';
      while (i < n && text[i] !== '\n') {
        body += text[i];
        i += 1;
      }
      pushComment(comments, text, at, body);
      last = 'op';
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      let at = line;
      let body = '';
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') {
          pushComment(comments, text, at, body);
          body = '';
          line += 1;
          at = line;
          i += 1;
          continue;
        }
        body += text[i];
        i += 1;
      }
      pushComment(comments, text, at, body);
      i += 2;
      last = 'op';
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      i += 1;
      while (i < n && text[i] !== q) {
        if (text[i] === '\\') {
          if (text[i + 1] === '\n') line += 1;
          i += 2;
          continue;
        }
        if (text[i] === '\n') line += 1;
        i += 1;
      }
      i += 1;
      last = 'value';
      continue;
    }
    if (c === '`') {
      i += 1;
      while (i < n && text[i] !== '`') {
        if (text[i] === '\\') {
          if (text[i + 1] === '\n') line += 1;
          i += 2;
          continue;
        }
        if (text[i] === '$' && text[i + 1] === '{') {
          const inner = scanCode(text, i + 2, line, true, lineComments);
          comments.push(...inner.comments);
          i = inner.i + 1;
          line = inner.line;
          continue;
        }
        if (text[i] === '\n') line += 1;
        i += 1;
      }
      i += 1;
      last = 'value';
      continue;
    }
    if (c === '/' && last !== 'value') {
      const end = scanRegex(text, i);
      if (end !== -1) {
        i = end;
        last = 'value';
        continue;
      }
    }
    if (c === '{') {
      depth += 1;
      last = 'op';
      i += 1;
      continue;
    }
    if (c === '}') {
      depth -= 1;
      last = 'value';
      i += 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const from = i;
      i += 1;
      while (i < n && /[A-Za-z0-9_$]/.test(text[i])) i += 1;
      last = KEYWORD_BEFORE_EXPR.has(text.slice(from, i)) ? 'op' : 'value';
      continue;
    }
    if (/[0-9]/.test(c)) {
      while (i < n && /[0-9A-Za-z_.]/.test(text[i])) i += 1;
      last = 'value';
      continue;
    }
    last = 'op';
    i += 1;
  }
  return { i, line, comments };
}

function scanHash(text) {
  const comments = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    let quote = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === '\\') {
          i += 1;
          continue;
        }
        if (c === quote) quote = '';
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        continue;
      }
      if (c === '#') {
        pushComment(comments, text, index + 1, line.slice(i + 1));
        break;
      }
    }
  }
  return comments;
}

function scanHtml(text) {
  const comments = [];
  const re = /<!--([\s\S]*?)-->|<script\b([^>]*)>([\s\S]*?)<\/script>|<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = re.exec(text))) {
    const start = lineAt(text, match.index);
    if (match[0].startsWith('<!--')) {
      const lines = match[1].split('\n');
      lines.forEach((body, offset) => pushComment(comments, text, start + offset, body));
      continue;
    }
    const isScript = match[0].toLowerCase().startsWith('<script');
    const attrs = match[2] || match[4] || '';
    const inner = match[3] ?? match[5] ?? '';
    const close = isScript ? '</script>' : '</style>';
    const openLen = match[0].length - inner.length - close.length;
    const at = lineAt(text, match.index + openLen);
    const padded = `${'\n'.repeat(Math.max(0, at - 1))}${inner}`;
    if (isScript) {
      const type = /type\s*=\s*["']([^"']+)["']/i.exec(attrs);
      if (type && !/javascript|ecmascript|module/i.test(type[1])) continue;
      comments.push(...scanCode(padded, 0, 1, false, true).comments);
    } else {
      comments.push(...scanCode(padded, 0, 1, false, false).comments);
    }
  }
  return comments;
}

function kindOf(file) {
  const base = path.basename(file);
  if (base === '_headers' || base === '_redirects') return 'hash';
  const ext = path.extname(file).toLowerCase();
  if (ext === '.css') return 'css';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.yml' || ext === '.yaml' || ext === '.toml' || ext === '.sh') return 'hash';
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.ts' || ext === '.tsx') return 'js';
  return '';
}

export function commentsIn(text, file) {
  const kind = kindOf(file);
  if (kind === 'js') return scanCode(text, 0, 1, false, true).comments;
  if (kind === 'css') return scanCode(text, 0, 1, false, false).comments;
  if (kind === 'hash') return scanHash(text);
  if (kind === 'html') return scanHtml(text);
  return [];
}

export function lintText(text, file) {
  const hits = [];
  for (const comment of commentsIn(text, file)) {
    for (const pattern of PATTERNS) {
      if (!pattern.re.test(comment.text)) continue;
      hits.push({
        file,
        line: comment.line,
        id: pattern.id,
        text: comment.text.trim().slice(0, 160),
      });
      break;
    }
  }
  return hits;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function lintRepo(root = ROOT) {
  const hits = [];
  for (const full of walk(root)) {
    const file = path.relative(root, full).split(path.sep).join('/');
    if (!kindOf(file)) continue;
    if (file.endsWith('package-lock.json') || file === 'intel/index.json') continue;
    hits.push(...lintText(fs.readFileSync(full, 'utf8'), file));
  }
  return hits;
}

function main() {
  const hits = lintRepo();
  if (hits.length) {
    console.error(`comments: ${hits.length} conversation artifact${hits.length === 1 ? '' : 's'}`);
    for (const hit of hits) {
      console.error(`  ${hit.file}:${hit.line} ${hit.id}: ${hit.text}`);
    }
    process.exit(1);
  }
  console.log('comments: no conversation artifacts');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
