import { test, expect } from 'playwright/test';
import { prepare } from './prepare.js';

const pages = [
  ['home', '/'],
  ['watching', '/watching/'],
  ['listening', '/listening/'],
  ['unshared', '/unshared/'],
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

test('the unshared row is birds1', async ({ page }) => {
  await page.goto('/unshared/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('h1')).toHaveText('matt does unshared');
  const row = page.locator('a.verb');
  await expect(row).toHaveText('birds1');
  await expect(row).toHaveAttribute('href', '/unshared/birds1/');
  await expect(page.locator('.verb-prefix, .verb-kicker')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('unshared does');
  const box = await row.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('birds1', async ({ page }, info) => {
  await page.addInitScript(() => {
    let seed = 1;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    window.setInterval = () => 0;
  });
  const width = info.project.use.viewport.width;
  await page.goto('/unshared/birds1/');
  await page.evaluate(() => document.fonts.ready);
  const home = page.locator('a.home');
  await expect(home).toHaveText('matt does');
  await expect(home).toHaveAttribute('href', '/');
  const homeBox = await home.boundingBox();
  expect(homeBox.height).toBeGreaterThanOrEqual(44);
  const hitsHome = await home.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const xs = [box.left + 8, box.left + box.width / 2];
    const ys = [box.top + 4, box.top + box.height / 2, box.bottom - 4];
    return ys.every((y) => xs.every((x) => document.elementFromPoint(x, y) === el));
  });
  expect(hitsHome).toBe(true);
  const canvasShare = await page.evaluate(() => {
    const box = document.querySelector('canvas').getBoundingClientRect();
    return box.height / window.innerHeight;
  });
  expect(canvasShare).toBeGreaterThan(0.55);
  await expect(page.locator('h1')).toHaveText('birds1');
  await expect(page.locator('#field')).toHaveAttribute('data-motion', 'reduce');
  await expect(page).toHaveScreenshot(`birds1-${width}.png`, { fullPage: true });
  await home.focus();
  const ring = await home.evaluate((el) => {
    const style = getComputedStyle(el);
    return { color: style.outlineColor, style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(ring).toEqual({ color: 'rgb(0, 0, 0)', style: 'solid', width: '3px' });
});

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
  const film = page.locator('.verb-row', { has: page.locator('a[href="/watching/"]') });
  const previewColor = await film.locator('.preview').evaluate((el) => getComputedStyle(el).color);
  const linkColor = await film.locator('.preview a').evaluate((el) => getComputedStyle(el).color);
  const starColor = await film.locator('.preview .stars').evaluate((el) => getComputedStyle(el).color);
  const border = await page.locator('.verb-row').first().evaluate((el) => getComputedStyle(el).borderTopWidth);
  const kicker = await page.locator('.verb-kicker').evaluate((el) => getComputedStyle(el).display);
  expect(previewColor).toBe('rgb(247, 200, 216)');
  expect(linkColor).toBe('rgb(247, 200, 216)');
  expect(starColor).toBe('rgb(247, 200, 216)');
  expect(border).toBe('0px');
  expect(kicker).toBe('none');
  const listen = page.locator('.listen-line');
  await expect(listen).toHaveText(/last listened\s+Fixture Track — Fixture Artist/);
  const listenColor = await listen.evaluate((el) => getComputedStyle(el).color);
  expect(listenColor).toBe('rgb(247, 200, 216)');
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

test('count words travel unless motion is reduced', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one window is enough');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/listening/');
  await page.evaluate(() => document.fonts.ready);
  const moving = await page.locator('.wave span').nth(2).evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      name: style.animationName,
      duration: Number.parseFloat(style.animationDuration),
      timing: style.animationTimingFunction,
    };
  });
  expect(moving.name).toBe('wave-travel');
  expect(moving.duration).toBeGreaterThanOrEqual(2);
  expect(moving.duration).toBeLessThanOrEqual(3);
  expect(moving.timing).toBe('linear');
  const number = await page.locator('.total-num').evaluate((el) => getComputedStyle(el).animationName);
  expect(number).toBe('none');
  const heading = await page.locator('h1').evaluate((el) => getComputedStyle(el).animationName);
  expect(heading).toBe('none');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  const still = await page.locator('.wave span').nth(2).evaluate((el) => {
    const style = getComputedStyle(el);
    return { name: style.animationName, transform: style.transform };
  });
  expect(still.name).toBe('none');
  expect(still.transform).not.toBe('none');

  await page.goto('/watching/');
  await page.evaluate(() => document.fonts.ready);
  const films = await page.locator('.wave').evaluate((el) => el.textContent);
  expect(films).toBe('films');
  const filmsStill = await page.locator('.wave span').first().evaluate((el) => getComputedStyle(el).animationName);
  expect(filmsStill).toBe('none');
});

test('poster toggles persist and turn the strip', async ({ page }, info) => {
  await page.goto('/watching/');
  await page.evaluate(() => document.fonts.ready);
  const posters = page.locator('[data-posters-toggle]');
  const axis = page.locator('[data-axis-toggle]');
  const feed = page.locator('#feed');
  await expect(posters).toHaveAttribute('aria-pressed', 'true');
  await expect(posters).toHaveAttribute('aria-label', 'posters on');
  await expect(axis).toHaveAttribute('aria-pressed', 'false');
  await expect(axis).toHaveAttribute('aria-label', 'layout across');
  await expect(page.locator('.poster-on')).toBeVisible();
  await expect(page.locator('.poster-off')).toBeVisible();
  await expect(page.locator('.axis-across')).toBeVisible();
  await expect(page.locator('.axis-down')).toBeVisible();
  const chosen = await page.locator('.poster-on').evaluate((el) => getComputedStyle(el).backgroundColor);
  const idle = await page.locator('.poster-off').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(chosen).toBe('rgb(0, 0, 0)');
  expect(idle).not.toBe(chosen);

  const width = info.project.use.viewport.width;
  const before = await feed.evaluate((el) => ({
    display: getComputedStyle(el).display,
    dir: getComputedStyle(el).flexDirection,
  }));
  expect(before.display).toBe(width >= 1024 ? 'grid' : 'flex');
  if (width < 1024) expect(before.dir).toBe('row');

  const head = page.locator('.watch-head');
  const places = await page.evaluate(() => {
    const box = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    return {
      head: box('.watch-head'),
      num: box('.total-num'),
      word: box('.total-label'),
      controls: box('.poster-controls'),
      posters: box('[data-posters-toggle]'),
      axis: box('[data-axis-toggle]'),
    };
  });
  expect(places.word.x).toBeGreaterThan(places.num.x + places.num.w - 1);
  expect(Math.abs((places.num.y + places.num.h) - (places.word.y + places.word.h))).toBeLessThan(8);
  expect(Math.abs((places.controls.x + places.controls.w) - (places.head.x + places.head.w))).toBeLessThan(2);
  const coversCount = places.controls.x < places.word.x + places.word.w - 1
    && places.controls.y < places.word.y + places.word.h
    && places.controls.y + places.controls.h > places.word.y;
  expect(coversCount).toBe(false);
  expect(places.controls.h).toBeLessThanOrEqual(places.num.h / 2 + 1);
  expect(Math.abs((places.controls.y + places.controls.h) - (places.head.y + places.head.h))).toBeLessThan(2);
  expect(places.axis.y).toBeGreaterThanOrEqual(places.posters.y + places.posters.h - 1);
  expect(Math.abs((places.axis.x + places.axis.w) - (places.posters.x + places.posters.w))).toBeLessThan(2);
  const hits = await page.evaluate(() => {
    const box = (el) => el.getBoundingClientRect();
    const upper = box(document.querySelector('[data-posters-toggle]'));
    const lower = box(document.querySelector('[data-axis-toggle]'));
    const track = box(document.querySelector('.poster-track'));
    return {
      upperTop: upper.top,
      upperBottom: upper.bottom,
      upperH: upper.height,
      lowerTop: lower.top,
      lowerBottom: lower.bottom,
      lowerH: lower.height,
      trackH: track.height,
      feedTop: document.querySelector('#feed').getBoundingClientRect().top,
      numRight: document.querySelector('.total-num').getBoundingClientRect().right,
      upperLeft: upper.left,
    };
  });
  expect(hits.upperH).toBeGreaterThanOrEqual(32);
  expect(hits.lowerH).toBeGreaterThanOrEqual(32);
  expect(hits.trackH).toBeLessThan(22);
  expect(hits.upperBottom).toBeLessThanOrEqual(hits.lowerTop + 0.5);
  expect(hits.lowerBottom).toBeLessThanOrEqual(hits.feedTop + 0.5);
  expect(hits.upperLeft).toBeGreaterThan(hits.numRight);
  const settingType = await posters.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(settingType.toLowerCase()).not.toContain('anton');

  const postersWidth = places.posters.w;
  const axisWidth = places.axis.w;
  await posters.click();
  await expect(posters).toHaveAttribute('aria-pressed', 'false');
  await expect(posters).toHaveAttribute('aria-label', 'posters off');
  await expect(page.locator('.poster-on')).toBeVisible();
  await expect(page.locator('.poster-off')).toBeVisible();
  const offFill = await page.locator('.poster-off').evaluate((el) => getComputedStyle(el).backgroundColor);
  const onFill = await page.locator('.poster-on').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(offFill).toBe('rgb(0, 0, 0)');
  expect(onFill).not.toBe(offFill);
  await expect(feed).toBeVisible();
  await expect(axis).toHaveAttribute('aria-disabled', 'true');
  await expect(axis).toHaveAttribute('aria-pressed', 'true');
  await expect(axis).toHaveAttribute('aria-label', 'layout down');
  const listed = await feed.evaluate((el) => {
    const style = getComputedStyle(el);
    const img = el.querySelector('img');
    const name = el.querySelector('.name').getBoundingClientRect();
    const meta = el.querySelector('.meta').getBoundingClientRect();
    return {
      display: style.display,
      dir: style.flexDirection,
      img: img ? getComputedStyle(img).display : 'missing',
      nameTop: name.top,
      metaTop: meta.top,
    };
  });
  expect(listed.display).toBe('flex');
  expect(listed.dir).toBe('column');
  expect(listed.img).toBe('none');
  expect(Math.abs(listed.nameTop - listed.metaTop)).toBeLessThan(24);
  const acrossOpacity = await page.locator('.axis-across').evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(acrossOpacity)).toBeLessThan(0.5);
  const postersOffWidth = await posters.evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.abs(postersOffWidth - postersWidth)).toBeLessThan(1);

  await axis.click({ force: true });
  await expect(page.locator('html')).not.toHaveAttribute('data-poster-axis', /.+/);
  const keptAxis = await page.evaluate(() => localStorage.getItem('mattdoes-poster-axis'));
  expect(keptAxis).toBe('across');

  await posters.click();
  await expect(axis).not.toHaveAttribute('aria-disabled');
  await expect(axis).toHaveAttribute('aria-pressed', 'false');
  await expect(axis).toHaveAttribute('aria-label', 'layout across');
  await expect(feed).toBeVisible();

  await axis.click();
  await expect(axis).toHaveAttribute('aria-pressed', 'true');
  await expect(axis).toHaveAttribute('aria-label', 'layout down');
  await expect(page.locator('.axis-down')).toBeVisible();
  await expect(page.locator('.axis-across')).toBeVisible();
  const downFill = await page.locator('.axis-down').evaluate((el) => getComputedStyle(el).backgroundColor);
  const acrossFill = await page.locator('.axis-across').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(downFill).toBe('rgb(0, 0, 0)');
  expect(acrossFill).not.toBe(downFill);
  const axisDownWidth = await axis.evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.abs(axisDownWidth - axisWidth)).toBeLessThan(1);
  await expect(page.locator('html')).toHaveAttribute('data-poster-axis', 'down');
  await expect(posters).toHaveAttribute('aria-pressed', 'true');
  await expect(feed).toBeVisible();
  const stacked = await feed.evaluate((el) => {
    const style = getComputedStyle(el);
    const films = [...el.querySelectorAll('.film')].slice(0, 3);
    const feedBox = el.getBoundingClientRect();
    return {
      display: style.display,
      dir: style.flexDirection,
      overflowY: style.overflowY,
      maxHeight: style.maxHeight,
      transition: style.transitionDuration,
      animation: style.animationName,
      feedBottom: feedBox.bottom,
      cards: films.map((film) => {
        const img = film.querySelector('img').getBoundingClientRect();
        const name = film.querySelector('.name').getBoundingClientRect();
        const meta = film.querySelector('.meta')?.getBoundingClientRect() || null;
        const box = film.getBoundingClientRect();
        return {
          imgBottom: img.bottom,
          imgLeft: img.left,
          imgRight: img.right,
          nameTop: name.top,
          nameBottom: name.bottom,
          metaTop: meta ? meta.top : null,
          metaLeft: meta ? meta.left : null,
          boxTop: box.top,
          boxBottom: box.bottom,
        };
      }),
    };
  });
  expect(stacked.display).toBe('flex');
  expect(stacked.dir).toBe('column');
  expect(stacked.overflowY).toBe('visible');
  expect(stacked.maxHeight).toBe('none');
  expect(stacked.transition).toBe('0s');
  expect(stacked.animation).toBe('none');
  expect(stacked.cards.length).toBe(3);
  for (const card of stacked.cards) {
    expect(card.nameTop).toBeGreaterThanOrEqual(card.imgBottom - 1);
    expect(card.boxBottom).toBeLessThanOrEqual(stacked.feedBottom + 1);
    expect(card.nameBottom).toBeLessThanOrEqual(stacked.feedBottom + 1);
    expect(card.metaTop).not.toBeNull();
    expect(card.metaTop).toBeGreaterThanOrEqual(card.nameBottom - 1);
    expect(card.metaLeft).toBeGreaterThanOrEqual(card.imgLeft - 1);
    expect(card.metaLeft).toBeLessThan(card.imgRight);
  }
  const gaps = [
    stacked.cards[1].boxTop - stacked.cards[0].boxBottom,
    stacked.cards[2].boxTop - stacked.cards[1].boxBottom,
  ];
  expect(Math.abs(gaps[0] - gaps[1])).toBeLessThan(2);
  expect(gaps[0]).toBeGreaterThan(8);

  await axis.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(posters).toBeFocused();
  const outline = await posters.evaluate((el) => ({
    style: getComputedStyle(el).outlineStyle,
    width: getComputedStyle(el).outlineWidth,
  }));
  expect(outline.style).toBe('solid');
  expect(Number.parseFloat(outline.width)).toBeGreaterThanOrEqual(2);

  const stored = await page.evaluate(() => ({
    posters: localStorage.getItem('mattdoes-posters'),
    axis: localStorage.getItem('mattdoes-poster-axis'),
  }));
  expect(stored).toEqual({ posters: 'on', axis: 'down' });

  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-posters-toggle]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-axis-toggle]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#feed')).toBeVisible();
  const restored = await page.locator('#feed').evaluate((el) => getComputedStyle(el).flexDirection);
  expect(restored).toBe('column');
});

test('posters off keeps the header and comes back', async ({ page }, info) => {
  const width = info.project.use.viewport.width;
  await page.goto('/watching/');
  await page.evaluate(() => document.fonts.ready);
  const before = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    const head = r('.watch-head');
    const num = r('.total-num');
    const controls = r('.poster-controls');
    return { headY: head.y, headH: head.height, numH: num.height, controlsH: controls.height, controlsB: controls.bottom, headB: head.bottom };
  });

  await page.evaluate(() => {
    localStorage.setItem('mattdoes-posters', 'off');
    localStorage.setItem('mattdoes-poster-axis', 'sideways');
    localStorage.setItem('mattdoes-posters-junk', '1');
  });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-posters-toggle]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-posters-toggle]')).toHaveAttribute('aria-label', 'posters off');
  await expect(page.locator('[data-axis-toggle]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('[data-axis-toggle]')).toHaveAttribute('aria-label', 'layout down');
  await expect(page.locator('#feed')).toBeVisible();
  await expect(page.locator('.film .name', { hasText: 'The Insider' })).toBeVisible();
  await expect(page.locator('.film', { hasText: 'The Insider' }).locator('.flag')).toHaveText('rewatch');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.total-num')).toBeVisible();
  await expect(page.locator('.poster-controls')).toBeVisible();

  const off = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    const head = r('.watch-head');
    const num = r('.total-num');
    const word = r('.total-label');
    const controls = r('.poster-controls');
    const upper = r('[data-posters-toggle]');
    const lower = r('[data-axis-toggle]');
    const footer = r('.site-footer');
    const h1 = r('h1');
    const at = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.getAttribute('aria-label') || el.className || el.tagName) : 'none';
    };
    return {
      attr: document.documentElement.getAttribute('data-posters'),
      axis: document.documentElement.getAttribute('data-poster-axis'),
      junk: localStorage.getItem('mattdoes-poster-axis'),
      feed: getComputedStyle(document.querySelector('#feed')).display,
      img: getComputedStyle(document.querySelector('.film-open img')).display,
      src: document.querySelector('.film-open img').getAttribute('src'),
      headY: head.y,
      headH: head.height,
      numH: num.height,
      controlsH: controls.height,
      controlsB: controls.bottom,
      headB: head.bottom,
      upperBottom: upper.bottom,
      lowerTop: lower.top,
      lowerBottom: lower.bottom,
      footerTop: footer.top,
      h1Bottom: h1.bottom,
      numRight: num.right,
      upperLeft: upper.left,
      coversWord: controls.x < word.right - 1 && controls.bottom > word.y && controls.y < word.bottom,
      countHit: at(num.x + num.width / 2, num.y + num.height / 2),
      footerHit: at(footer.x + 24, footer.y + footer.height / 2),
      textAdjust: getComputedStyle(document.documentElement).webkitTextSizeAdjust || getComputedStyle(document.documentElement).textSizeAdjust,
    };
  });
  expect(off.attr).toBe('off');
  expect(off.axis).toBeNull();
  expect(off.junk).toBeNull();
  expect(off.feed).toBe('flex');
  expect(off.img).toBe('none');
  expect(off.src).toBeNull();
  expect(Math.abs(off.headY - before.headY)).toBeLessThan(2);
  expect(Math.abs(off.headH - before.headH)).toBeLessThan(2);
  expect(off.controlsH).toBeLessThanOrEqual(off.numH / 2 + 1);
  expect(Math.abs(off.controlsB - off.headB)).toBeLessThan(2);
  expect(off.coversWord).toBe(false);
  expect(off.upperBottom).toBeLessThanOrEqual(off.lowerTop + 0.5);
  expect(off.lowerBottom).toBeLessThan(off.footerTop);
  expect(off.upperLeft).toBeGreaterThan(off.numRight);
  expect(off.h1Bottom).toBeLessThan(off.headY + 1);
  expect(String(off.countHit).toLowerCase()).not.toContain('poster');
  expect(String(off.footerHit).toLowerCase()).not.toContain('poster');
  expect(off.textAdjust).toBe('100%');
  await expect(page).toHaveScreenshot(`watching-off-${width}.png`, { fullPage: true });

  await page.locator('[data-posters-toggle]').click();
  await expect(page.locator('#feed')).toBeVisible();
  await expect(page.locator('[data-posters-toggle]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-axis-toggle]')).toHaveAttribute('aria-label', 'layout across');
  await expect(page.locator('.film-open img').first()).toHaveAttribute('src', /posters\/visual-/);
  await page.locator('.film-open img').evaluateAll((imgs) => Promise.all(imgs.map((img) => (img.decode ? img.decode() : img.complete).catch?.() || Promise.resolve())));
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active && active.blur) active.blur();
    window.scrollTo(0, 0);
  });
  await expect(page).toHaveScreenshot(`watching-${width}.png`, { fullPage: true });
});

test('the home listen line is one clipped row', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const line = page.locator('.listen-line');
  await expect(line).toHaveText(/last listened\s+Fixture Track — Fixture Artist/);
  const box = await line.evaluate((el) => {
    const style = getComputedStyle(el);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const height = el.getBoundingClientRect().height;
    return {
      whiteSpace: style.whiteSpace,
      overflow: style.overflowX,
      ellipsis: style.textOverflow,
      oneLine: height <= lineHeight * 1.6,
    };
  });
  expect(box.whiteSpace).toBe('nowrap');
  expect(box.overflow).toBe('hidden');
  expect(box.ellipsis).toBe('ellipsis');
  expect(box.oneLine).toBe(true);
  await expect(page.locator('.wave')).toHaveCount(0);
});

test('phone shows the kicker and desktop hides it', async ({ page }, info) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const display = await page.locator('.verb-kicker').evaluate((el) => getComputedStyle(el).display);
  const width = info.project.use.viewport.width;
  expect(display).toBe(width < 1024 ? 'block' : 'none');
});
