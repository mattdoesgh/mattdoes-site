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

test('a film scene opens and closes without motion', async ({ page }) => {
  const fullHits = [];
  page.on('request', (req) => {
    if (req.url().includes('visual-insider-full')) fullHits.push(req.url());
  });
  await page.goto('/watching/');
  await page.evaluate(() => document.fonts.ready);
  const insider = page.locator('a.film-open', { hasText: 'The Insider' });
  const heat = page.locator('a.film-open', { hasText: 'Heat' });
  await expect(page.locator('#scene')).toHaveJSProperty('open', false);
  await expect(page.locator('#scene-img')).toHaveCount(0);
  await expect(page.locator('.film-open img').nth(0)).toHaveAttribute('loading', 'eager');
  await expect(page.locator('.film-open img').nth(1)).toHaveAttribute('loading', 'lazy');
  expect(fullHits).toEqual([]);

  await insider.click();
  await expect(page.locator('#scene')).toHaveJSProperty('open', true);
  await expect(page.locator('#scene')).toHaveClass(/is-review/);
  await expect(page.locator('#scene-review')).toHaveText('A long sit.');
  await expect(page.locator('#scene-title')).toHaveText('The Insider');
  await expect(page.locator('#scene-year')).toHaveText('1999');
  await expect(page.locator('#scene .flag')).toHaveText('rewatch');
  await expect(page.locator('.scene-close')).toBeFocused();
  await expect(page.locator('html')).toHaveClass(/is-locked/);
  const locked = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
  expect(locked).toBe('hidden');
  const motion = await page.locator('#scene').evaluate((el) => {
    const style = getComputedStyle(el);
    return { animation: style.animationName, transition: style.transitionDuration };
  });
  expect(motion.animation).toBe('none');
  expect(motion.transition).toBe('0s');
  await expect(page.locator('#scene-img')).toHaveAttribute('src', /visual-insider-full/);
  expect(fullHits.length).toBeGreaterThan(0);
  await expect(page.locator('#scene-link')).toHaveAttribute('rel', 'noopener noreferrer');

  await page.keyboard.press('Tab');
  await expect(page.locator('#scene-link')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.scene-close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#scene')).toHaveJSProperty('open', false);
  await expect(page.locator('html')).not.toHaveClass(/is-locked/);
  await expect(insider).toBeFocused();

  await heat.click();
  await expect(page.locator('#scene')).toHaveClass(/is-still/);
  await expect(page.locator('#scene-review')).toBeHidden();
  await expect(page.locator('#scene-year')).toBeHidden();
  await expect(page.locator('#scene-title')).toHaveText('Heat');
  await expect(page.locator('#scene-rate .stars')).toHaveAttribute('aria-label', '4.5 out of 5 stars');
  const clipped = await page.locator('#scene-title').evaluate((el) => {
    const style = getComputedStyle(el);
    return { width: style.width, position: style.position };
  });
  expect(clipped.position).toBe('absolute');
  expect(clipped.width).toBe('1px');
  await page.mouse.click(8, 8);
  await expect(page.locator('#scene')).toHaveJSProperty('open', false);
  await expect(page).toHaveURL(/\/watching\/?$/);

  await page.locator('a.film-open', { hasText: 'Yi Yi' }).click();
  await expect(page.locator('#scene')).toHaveJSProperty('open', true);
  await page.locator('.scene-close').click();
  await expect(page.locator('#scene')).toHaveJSProperty('open', false);
  await expect(page.locator('a.film-open', { hasText: 'Yi Yi' })).toBeFocused();

  const popupPromise = page.waitForEvent('popup', { timeout: 1500 }).catch(() => null);
  await page.locator('a.film-open', { hasText: 'Yi Yi' }).click({ modifiers: ['Control'] });
  const popup = await popupPromise;
  if (popup) await popup.close();
  await expect(page.locator('#scene')).toHaveJSProperty('open', false);

  await insider.click();
  await page.goBack();
  await expect(page).toHaveURL(/\/watching\/?$/);
  await expect(page.locator('#scene')).toHaveJSProperty('open', false);
  await page.goForward();
  await expect(page.locator('#scene')).toHaveJSProperty('open', true);
  await expect(page.locator('#scene-review')).toHaveText('A long sit.');
  await page.keyboard.press('Escape');
});

test('phone shows the kicker and desktop hides it', async ({ page }, info) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const display = await page.locator('.verb-kicker').evaluate((el) => getComputedStyle(el).display);
  const width = info.project.use.viewport.width;
  expect(display).toBe(width < 1024 ? 'block' : 'none');
});
