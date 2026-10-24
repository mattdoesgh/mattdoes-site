// Screenshots and scene checks for the throwaway poster studies.
// Writes 390 and 1440 captures, including a reviewed open and a still open.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.env.POSTER_SHOTS || '/opt/cursor/artifacts/poster-layouts';
const base = process.env.POSTER_BASE || 'http://127.0.0.1:4187/prototypes/posters/index.html';
const layouts = ['weighted', 'strip', 'reflow'];
const widths = [
  { name: '390', width: 390, height: 844, phone: true },
  { name: '1440', width: 1440, height: 900, phone: false },
];

fs.mkdirSync(outDir, { recursive: true });

const failures = [];

function check(cond, message) {
  if (!cond) failures.push(message);
}

async function warm(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('.feed img')];
    for (const img of imgs) {
      img.scrollIntoView({ block: 'center' });
      if (!img.complete || !img.naturalWidth) {
        await new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      }
    }
    window.scrollTo(0, 0);
  });
}

async function sceneSettled(page) {
  await page.waitForFunction(() => {
    const dialog = document.getElementById('scene');
    const img = document.getElementById('scene-img');
    return Boolean(dialog?.open && img?.complete && img.naturalWidth > 0);
  });
  await page.evaluate(() => Promise.all(document.getAnimations({ subtree: true }).map((anim) => anim.finished)));
}

async function openReviewed(page) {
  const button = page.locator('button[data-reviewed="1"]').first();
  const title = (await button.locator('.name').innerText()).trim();
  await button.click();
  await sceneSettled(page);
  return { button, title };
}

async function openStill(page) {
  const button = page.locator('button[data-reviewed="0"]').first();
  const title = (await button.locator('.name').innerText()).trim();
  await button.click();
  await sceneSettled(page);
  return { button, title };
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'],
});

for (const size of widths) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    hasTouch: size.phone,
    isMobile: size.phone,
  });
  const page = await context.newPage();

  for (const layout of layouts) {
    await page.goto(`${base}?layout=${layout}`, { waitUntil: 'networkidle' });
    await warm(page);
    const attr = await page.locator('html').getAttribute('data-layout');
    check(attr === layout, `${layout} ${size.name} data-layout`);

    if (!size.phone) {
      const probe = page.locator('.film button').first();
      const before = await probe.boundingBox();
      await probe.hover();
      const after = await probe.boundingBox();
      check(before && after && before.x === after.x && before.y === after.y && before.width === after.width && before.height === after.height, `${layout} hover box moved`);
      const transition = await probe.evaluate((el) => getComputedStyle(el).transitionDuration);
      check(transition === '0s', `${layout} button transition ${transition}`);
    }

    await page.screenshot({ path: path.join(outDir, `${layout}-${size.name}.png`), fullPage: true });

    const reviewed = await openReviewed(page);
    const reviewState = await page.evaluate(() => {
      const dialog = document.getElementById('scene');
      const bodyPos = getComputedStyle(document.body).position;
      return {
        open: dialog.open,
        modal: dialog.getAttribute('aria-modal'),
        labelledby: dialog.getAttribute('aria-labelledby'),
        title: document.getElementById('scene-title')?.textContent || '',
        describedby: dialog.getAttribute('aria-describedby'),
        review: document.getElementById('scene-review')?.textContent || '',
        reviewHidden: document.getElementById('scene-review')?.hidden,
        active: document.activeElement?.className || '',
        bodyPos,
        locked: document.documentElement.classList.contains('is-locked'),
      };
    });
    check(reviewState.open, `${layout} ${size.name} review dialog open`);
    check(reviewState.modal === 'true', `${layout} ${size.name} aria-modal`);
    check(reviewState.labelledby === 'scene-title', `${layout} ${size.name} labelledby`);
    check(reviewState.title.toLowerCase() === reviewed.title.toLowerCase(), `${layout} ${size.name} review title "${reviewState.title}" vs "${reviewed.title}"`);
    check(reviewState.describedby === 'scene-review' && reviewState.review.length > 0 && reviewState.reviewHidden === false, `${layout} ${size.name} review text`);
    check(reviewState.active.includes('scene-close'), `${layout} ${size.name} focus ${reviewState.active}`);
    check(reviewState.bodyPos === 'fixed' && reviewState.locked, `${layout} ${size.name} scroll lock`);
    await page.screenshot({ path: path.join(outDir, `${layout}-${size.name}-review.png`) });

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('scene').open);
    const focusBack = await page.evaluate(() => document.activeElement?.getAttribute('data-scene'));
    check(focusBack === await reviewed.button.getAttribute('data-scene'), `${layout} ${size.name} focus restore`);

    const still = await openStill(page);
    const stillState = await page.evaluate(() => {
      const title = document.getElementById('scene-title');
      const style = getComputedStyle(title);
      const stars = document.querySelector('#scene-rate .stars');
      return {
        reviewHidden: document.getElementById('scene-review')?.hidden,
        title: title.textContent,
        clipped: style.position === 'absolute' && style.width === '1px',
        stars: stars?.getAttribute('aria-label') || '',
        describedby: document.getElementById('scene').getAttribute('aria-describedby'),
      };
    });
    check(stillState.reviewHidden === true, `${layout} ${size.name} still hides review`);
    check(stillState.describedby === null, `${layout} ${size.name} still describedby`);
    check(stillState.title.toLowerCase() === still.title.toLowerCase(), `${layout} ${size.name} still title`);
    check(stillState.clipped, `${layout} ${size.name} still title clipped`);
    check(/out of 5 stars$/.test(stillState.stars), `${layout} ${size.name} still stars "${stillState.stars}"`);
    await page.screenshot({ path: path.join(outDir, `${layout}-${size.name}-still.png`) });

    const outside = await page.evaluate(() => {
      const spots = [
        [8, 8],
        [12, 12],
        [Math.floor(window.innerWidth / 2), 8],
        [window.innerWidth - 8, window.innerHeight - 8],
      ];
      for (const [x, y] of spots) {
        const el = document.elementFromPoint(x, y);
        if (!el || el.closest('.scene-panel, .scene-close')) continue;
        if (el.closest('.scene')) return { x, y };
      }
      return null;
    });
    check(Boolean(outside), `${layout} ${size.name} no outside tap target`);
    if (outside) await page.mouse.click(outside.x, outside.y);
    await page.waitForFunction(() => !document.getElementById('scene').open);

    await still.button.click();
    await sceneSettled(page);
    await page.goBack();
    await page.waitForFunction(() => !document.getElementById('scene').open);
    check(page.url().includes(`layout=${layout}`), `${layout} ${size.name} back stayed on the study`);
    await page.goForward();
    await sceneSettled(page);
    const reopened = await page.evaluate(() => document.getElementById('scene-title')?.textContent || '');
    check(reopened.toLowerCase() === still.title.toLowerCase(), `${layout} ${size.name} forward reopened`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('scene').open);
  }

  await context.close();
}

await browser.close();

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`shots in ${outDir}`);
