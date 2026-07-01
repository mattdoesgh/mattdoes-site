// lib/og-image.js — build-time Open Graph card PNGs (1200×630).
//
// Renders a branded SVG template and rasterizes with sharp. Called from
// Emit (lib/emit/); output lands in dist/og/ alongside the static HTML.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const W = 1200;
const H = 630;

/** Escape text for safe embedding inside SVG. */
function escSvg(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Split a title into at most two lines for the card layout. */
function wrapTitle(title, max = 42) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ['mattdoes.online'];
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > max && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
    if (lines.length === 1) break;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

/**
 * Build the SVG markup for one OG card.
 *
 * @param {{ title?: string, kind?: string, date?: Date|string, siteTitle?: string }} opts
 * @returns {string}
 */
export function ogImageSvg({ title, kind, date, siteTitle = 'mattdoes.online' }) {
  const lines = wrapTitle(title || siteTitle);
  const kicker = kind ? String(kind) : siteTitle;
  const when = date ? new Date(date).toISOString().slice(0, 10) : '';
  const line1 = escSvg(lines[0]);
  const line2 = escSvg(lines[1] || '');
  const meta = escSvg([kicker, when].filter(Boolean).join(' · '));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0a0a0a"/>
  <rect x="64" y="64" width="72" height="4" fill="#e879a6"/>
  <text x="64" y="148" fill="#e879a6" font-family="ui-monospace, monospace" font-size="28" letter-spacing="0.08em">${meta}</text>
  <text x="64" y="248" fill="#f5f0e8" font-family="ui-monospace, monospace" font-size="56" font-weight="600">${line1}</text>
  ${line2 ? `<text x="64" y="320" fill="#f5f0e8" font-family="ui-monospace, monospace" font-size="56" font-weight="600">${line2}</text>` : ''}
  <text x="64" y="${H - 72}" fill="#8a8494" font-family="ui-monospace, monospace" font-size="24">${escSvg(siteTitle)}</text>
</svg>`;
}

/**
 * Write a PNG OG card to `outPath` (parent dirs created as needed).
 *
 * @param {string} outPath absolute filesystem path
 * @param {Parameters<typeof ogImageSvg>[0]} opts
 * @returns {Promise<void>}
 */
export async function writeOgImage(outPath, opts) {
  const svg = ogImageSvg(opts);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outPath);
}

/**
 * Public URL path for an article OG image (no origin).
 *
 * @param {{ kind?: string, slug?: string }} article
 * @returns {string}
 */
export function ogImagePath(article) {
  const kind = article.kind || 'page';
  const slug = article.slug || 'index';
  return `/og/${kind}/${slug}.png`;
}
