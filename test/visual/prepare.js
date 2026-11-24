// Pin body and mono to the vendored DejaVu subsets and answer every image
// with a fixture so host fonts and live art cannot move the pixels. The
// ether draws from crypto.getRandomValues, Math.random, and
// performance.now, so those are seeded and held still as well.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fonts = path.join(here, '..', 'fixtures', 'visual', 'fonts');
const images = path.join(here, '..', 'fixtures', 'visual');

const SANS = path.join(fonts, 'DejaVuSans.woff2');
const MONO = path.join(fonts, 'DejaVuSansMono.woff2');
const POSTER = path.join(images, 'poster.png');
const COVER = path.join(images, 'cover.png');

const PIN = `
@font-face {
  font-family: "Fixture Sans";
  src: url("/__fixture/sans.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "Fixture Mono";
  src: url("/__fixture/mono.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: block;
}
:root {
  --body: "Fixture Sans", sans-serif;
  --mono: "Fixture Mono", monospace;
}
`;

// birds1 keeps the real clock and real randomness: the flock runs on them.
const STILL = () => {
  if (window.location.pathname.startsWith('/unshared/birds1')) return;
  let state = 0x9e3779b9;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = next;
  window.crypto.getRandomValues = (array) => {
    const max = 2 ** (array.BYTES_PER_ELEMENT * 8);
    for (let i = 0; i < array.length; i += 1) array[i] = Math.floor(next() * max);
    return array;
  };
  window.performance.now = () => 4000;
};

/**
 * @param {import('playwright').Page} page
 * @param {{ pinFonts?: boolean, phone?: boolean }} [opts]
 */
export async function prepare(page, { pinFonts = true, phone = false } = {}) {
  if (phone) {
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'hover', value: 'none' },
        { name: 'pointer', value: 'coarse' },
        { name: 'any-hover', value: 'none' },
        { name: 'any-pointer', value: 'coarse' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
        { name: 'prefers-color-scheme', value: 'dark' },
      ],
    });
  }

  await page.route('**/*', (route) => {
    const url = route.request().url();
    const type = route.request().resourceType();
    if (url.includes('/__fixture/sans')) {
      return route.fulfill({ path: SANS, contentType: 'font/woff2' });
    }
    if (url.includes('/__fixture/mono')) {
      return route.fulfill({ path: MONO, contentType: 'font/woff2' });
    }
    if (type === 'image') {
      const poster = url.includes('/posters/');
      return route.fulfill({
        path: poster ? POSTER : COVER,
        contentType: 'image/png',
      });
    }
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return route.continue();
    }
    return route.abort();
  });

  await page.addInitScript(STILL);

  if (!pinFonts) return;

  await page.addInitScript((css) => {
    const install = () => {
      const style = document.createElement('style');
      style.setAttribute('data-visual-fonts', '');
      style.textContent = css;
      document.documentElement.appendChild(style);
    };
    if (document.documentElement) install();
    else document.addEventListener('DOMContentLoaded', install);
  }, PIN);
}
