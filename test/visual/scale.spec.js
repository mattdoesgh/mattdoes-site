// Fluid type and the poster settings across the width list below.
// 640 is a 1280px window at 200% zoom: the layout viewport halves.

import { test, expect } from 'playwright/test';
import { prepare } from './prepare.js';

const widths = [320, 390, 640, 768, 1024, 1280, 1440, 1920];
const pages = ['/', '/watching/', '/listening/', '/unshared/', '/unshared/birds1/', '/404.html'];

test.beforeEach(async ({ page }, info) => {
  await prepare(page, { phone: info.project.name === 'phone' });
});

test('pages reflow without a sideways scroll', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one pass sets every width');
  const problems = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    for (const url of pages) {
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        const offenders = [...document.body.querySelectorAll('*')].filter((el) => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.right > root.clientWidth + 1;
        }).slice(0, 4).map((el) => `${el.tagName}.${el.className}`.slice(0, 80));
        return {
          scroll: root.scrollWidth - root.clientWidth,
          zoomLock: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '',
          text: getComputedStyle(root).webkitTextSizeAdjust || getComputedStyle(root).textSizeAdjust,
          offenders,
        };
      });
      if (overflow.scroll > 1) {
        problems.push(`${width} ${url} scrolls ${overflow.scroll}px (${overflow.offenders.join(', ')})`);
      }
      if (/maximum-scale|user-scalable\s*=\s*no/.test(overflow.zoomLock)) {
        problems.push(`${url} blocks zoom: ${overflow.zoomLock}`);
      }
      if (overflow.text !== '100%') problems.push(`${url} text-size-adjust ${overflow.text}`);
    }
  }

  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const url of pages) {
      await page.goto(url);
      await page.addStyleTag({ content: 'html { font-size: 32px; }' });
      await page.evaluate(() => document.fonts.ready);
      const scroll = await page.evaluate(() => {
        const root = document.documentElement;
        const wide = [...document.body.querySelectorAll('*')].filter((el) => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.right > root.clientWidth + 1;
        }).slice(0, 4).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}:${Math.round(el.getBoundingClientRect().right)}`);
        return { scroll: root.scrollWidth - root.clientWidth, wide };
      });
      if (scroll.scroll > 1) problems.push(`${width} ${url} 200% text scrolls ${scroll.scroll}px (${scroll.wide.join(', ')})`);
    }
  }
  expect(problems).toEqual([]);
});

test('poster settings stay about half the count', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one pass sets every width');
  const problems = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/watching/');
    await page.evaluate(() => document.fonts.ready);
    const box = await page.evaluate(() => {
      const r = (sel) => document.querySelector(sel).getBoundingClientRect();
      const num = r('.total-num');
      const controls = r('.poster-controls');
      const upper = r('[data-posters-toggle]');
      const lower = r('[data-axis-toggle]');
      const track = r('.poster-track');
      const h1 = r('h1');
      const feed = r('#feed');
      const word = r('.total-label');
      return {
        numH: num.height,
        controlsH: controls.height,
        upperH: upper.height,
        lowerH: lower.height,
        trackH: track.height,
        h1Bottom: h1.bottom,
        upperTop: upper.top,
        lowerBottom: lower.bottom,
        feedTop: feed.top,
        coversWord: controls.left < word.right - 1 && controls.bottom > word.top && controls.top < word.bottom,
      };
    });
    const ratio = box.controlsH / box.numH;
    if (ratio > 0.62 || ratio < 0.4) {
      problems.push(`${width} stack/numeral ${ratio.toFixed(2)} (${box.controlsH.toFixed(1)}/${box.numH.toFixed(1)})`);
    }
    const floor = width < 768 ? 44 : 24;
    if (box.upperH < floor - 0.5 || box.lowerH < floor - 0.5) {
      problems.push(`${width} hit ${box.upperH.toFixed(1)}/${box.lowerH.toFixed(1)} under ${floor}`);
    }
    if (box.trackH >= box.upperH) problems.push(`${width} drawn row is the whole hit target`);
    if (box.upperTop < box.h1Bottom - 1) problems.push(`${width} settings cover the heading`);
    if (box.lowerBottom > box.feedTop + 1) problems.push(`${width} settings cover the feed`);
    if (box.coversWord) problems.push(`${width} settings cover the count`);
  }

  /* 200% text size (root 32px) is the WCAG 1.4.4 case. 640px, already
     in the width list, is a 1280px window at 200% browser zoom. */
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/watching/');
  await page.addStyleTag({ content: 'html { font-size: 32px; }' });
  const zoomed = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (zoomed > 1) problems.push(`watching 200% text scrolls ${zoomed}px`);
  expect(problems).toEqual([]);
});
