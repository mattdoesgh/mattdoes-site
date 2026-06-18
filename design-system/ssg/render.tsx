// SSG verification harness for the foundational slice.
//
// Renders ONE real page (the blog timeline) two ways from identical sample
// data — through the original templates/blog.js and through the React
// BlogPage — and writes:
//   .preview/blog.reference.html   the original template output (full doc)
//   .preview/blog.react.html       the React output as a standalone doc
//                                  (static/_shared.css inlined so it's openable)
//   .preview/blog.reference.body.txt / blog.react.body.txt
//                                  normalized bodies for a structural diff
//
// Run: npm run render   (from design-system/)
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// @ts-expect-error — plain-JS template module, no types
import { blogPage as originalBlogPage } from '../../templates/blog.js';
// @ts-expect-error — plain-JS config module, no types
import { siteConfig } from '../../site.config.js';
import { BlogPage, type BlogEntry } from './pages/BlogPage';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', '.preview');
const cssPath = path.join(here, '..', '..', 'static', '_shared.css');

// Representative sample: mixed-kind timeline exercising every Row variant,
// summaries, read times, tags, quote thoughts, and permalinks.
const entries: BlogEntry[] = [
  {
    kind: 'making',
    url: '/making/react-design-system/',
    title: 'Turning the site into a component library',
    date: '2026-06-15T14:20:00.000Z',
    summary: 'Why the static templates are becoming real React components.',
    tags: ['react', 'architecture', 'meta'],
  },
  {
    kind: 'thought',
    date: '2026-06-14T16:05:00.000Z',
    id: 't-20260614-1105',
    html: '<p>The best abstraction is the one you can delete in an afternoon.</p>',
    tags: ['craft'],
  },
  {
    kind: 'journal',
    url: '/journal/on-typography/',
    title: 'On choosing a single typeface',
    date: '2026-06-12T09:00:00.000Z',
    summary: 'One mono family, four weights, and what that buys.',
    tags: ['design', 'typography'],
  },
  {
    kind: 'thought',
    date: '2026-06-10T20:41:00.000Z',
    id: 't-20260610-1541',
    quote: true,
    html: '<p>“Simplicity is a great virtue but it requires hard work to achieve it.”</p>',
  },
  {
    kind: 'making',
    url: '/making/edge-workers/',
    title: 'Two tiny workers, one origin',
    date: '2026-06-08T11:30:00.000Z',
    summary: 'Keeping the CSP at connect-src self while staying live.',
    tags: ['cloudflare', 'architecture'],
  },
];

const nowPlaying = 'now: Boards of Canada — Roygbiv';

// ── Reference: the original template ──────────────────────────────
const referenceHtml = originalBlogPage({ siteConfig, entries, nowPlaying });

// ── React: render body, wrap in a standalone doc with inlined CSS ──
const css = readFileSync(cssPath, 'utf8');
const reactBody = renderToStaticMarkup(
  <BlogPage siteConfig={siteConfig} entries={entries} nowPlaying={nowPlaying} />,
);
const reactHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>blog — ${siteConfig.title}</title>
<style>
${css}
</style>
</head>
<body>
${reactBody}
</body>
</html>
`;

// ── Normalize bodies for a structural diff ────────────────────────
// Reference: the body region is everything after </head>, minus the body
// tags. (Anchoring on </head> avoids matching a literal "<body>" that appears
// inside a CSS comment in the head.) React: normalize the rendered body
// string directly.
function bodyRegion(html: string): string {
  const afterHead = html.split(/<\/head>/i)[1] ?? html;
  return afterHead.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '');
}
function normalize(region: string): string {
  return region
    .replace(/<script[\s\S]*?<\/script>/gi, '') // enhancement scripts only exist in the reference
    .replace(/>\s*</g, '>\n<') // one tag per line (React emits no inter-tag whitespace)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'blog.reference.html'), referenceHtml);
writeFileSync(path.join(outDir, 'blog.react.html'), reactHtml);
writeFileSync(path.join(outDir, 'blog.reference.body.txt'), normalize(bodyRegion(referenceHtml)));
writeFileSync(path.join(outDir, 'blog.react.body.txt'), normalize(reactBody));

console.log(`wrote ${outDir}/`);
console.log('  blog.reference.html / blog.react.html  (open to compare visually)');
console.log('  blog.reference.body.txt / blog.react.body.txt  (diff for structure)');
