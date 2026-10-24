import { test, expect } from 'playwright/test';
import { prepare } from './prepare.js';

const pages = [
  ['home', '/'],
  ['watching', '/watching/'],
  ['listening', '/listening/'],
];

test.beforeEach(async ({ page }) => {
  await prepare(page);
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

test('phone shows the kicker and desktop hides it', async ({ page }, info) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const display = await page.locator('.verb-kicker').evaluate((el) => getComputedStyle(el).display);
  const width = info.project.use.viewport.width;
  expect(display).toBe(width < 1024 ? 'block' : 'none');
});
