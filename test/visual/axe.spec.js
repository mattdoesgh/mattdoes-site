// axe-core in a real browser, so contrast and target size are laid out.
// Serious and critical WCAG A/AA failures fail the run. The same Chromium
// the screenshot job already installs runs this, so CI does not add a runner.

import { test, expect } from 'playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare } from './prepare.js';

const paths = [
  '/',
  '/watching/',
  '/listening/',
  '/unshared/',
  '/unshared/birds1/',
  '/404.html',
];

test.beforeEach(async ({ page }, info) => {
  await prepare(page, { phone: info.project.name === 'phone' });
});

for (const url of paths) {
  test(`axe ${url}`, async ({ page }) => {
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const serious = results.violations.filter((violation) => (
      violation.impact === 'serious' || violation.impact === 'critical'
    ));
    const summary = serious.map((violation) => {
      const nodes = violation.nodes.slice(0, 4).map((node) => {
        const target = node.target.join(' ');
        return `${target} — ${node.failureSummary?.split('\n')[0] || ''}`;
      }).join('\n    ');
      return `${violation.impact} ${violation.id}: ${violation.help}\n    ${nodes}`;
    }).join('\n');
    expect(serious, summary).toEqual([]);
  });
}

test('axe watching with posters off', async ({ page }) => {
  await page.goto('/watching/');
  await page.evaluate(() => {
    localStorage.setItem('mattdoes-posters', 'off');
  });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter((violation) => (
    violation.impact === 'serious' || violation.impact === 'critical'
  ));
  const summary = serious.map((violation) => {
    const nodes = violation.nodes.slice(0, 4).map((node) => {
      const target = node.target.join(' ');
      return `${target} — ${node.failureSummary?.split('\n')[0] || ''}`;
    }).join('\n    ');
    return `${violation.impact} ${violation.id}: ${violation.help}\n    ${nodes}`;
  }).join('\n');
  expect(serious, summary).toEqual([]);
});
