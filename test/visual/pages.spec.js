import { test, expect } from 'playwright/test';
import { prepare } from './prepare.js';

const pages = [
  ['home', '/'],
  ['watching', '/watching/'],
  ['listening', '/listening/'],
];

test.beforeEach(async ({ page }, info) => {
  await prepare(page, { phone: info.project.name === 'phone' });
});

for (const [name, url] of pages) {
  test(name, async ({ page }, info) => {
    const width = info.project.use.viewport.width;
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}-${width}.png`, { fullPage: true });
  });
}

test('footer', async ({ page }, info) => {
  const width = info.project.use.viewport.width;
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const footer = page.locator('.site-footer');
  await expect(footer).toHaveScreenshot(`footer-${width}.png`);
});

test('a narrow hover window keeps the pink preview and no row rule', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'hover-capable window');
  await page.setViewportSize({ width: 800, height: 800 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const hover = await page.evaluate(() => window.matchMedia('(hover: hover)').matches);
  expect(hover).toBe(true);
  const previewColor = await page.locator('.preview').evaluate((el) => getComputedStyle(el).color);
  const linkColor = await page.locator('.preview a').evaluate((el) => getComputedStyle(el).color);
  const starColor = await page.locator('.preview .stars').evaluate((el) => getComputedStyle(el).color);
  const border = await page.locator('.verb-row').first().evaluate((el) => getComputedStyle(el).borderTopWidth);
  const kicker = await page.locator('.verb-kicker').evaluate((el) => getComputedStyle(el).display);
  expect(previewColor).toBe('rgb(247, 200, 216)');
  expect(linkColor).toBe('rgb(247, 200, 216)');
  expect(starColor).toBe('rgb(247, 200, 216)');
  expect(border).toBe('0px');
  expect(kicker).toBe('none');
  await expect(page).toHaveScreenshot('home-800.png', { fullPage: true });
});

test('phone shows the kicker and desktop hides it', async ({ page }, info) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const display = await page.locator('.verb-kicker').evaluate((el) => getComputedStyle(el).display);
  const width = info.project.use.viewport.width;
  expect(display).toBe(width < 1024 ? 'block' : 'none');
});
