import test from 'node:test';
import assert from 'node:assert/strict';
import { sitemapXml, robotsTxt } from '../lib/emit/feeds.js';

test('sitemapXml lists the verb routes and omits the secret page', () => {
  const xml = sitemapXml({ siteUrl: 'https://mattdoes.online' });
  for (const route of ['/', '/watch/', '/listen/', '/unshared/']) {
    assert.ok(xml.includes(`<loc>https://mattdoes.online${route}</loc>`), route);
  }
  assert.equal(xml.includes('/frequency/'), false);
  assert.equal(xml.includes('/listening/'), false);
  assert.equal(xml.includes('/movies/'), false);
  assert.equal(xml.includes('/journal/'), false);
  assert.equal(xml.includes('/about/'), false);
});

test('robotsTxt allows crawling, blocks /api/, advertises the sitemap', () => {
  const txt = robotsTxt('https://mattdoes.online');
  assert.ok(txt.includes('Disallow: /api/'));
  assert.ok(txt.includes('Sitemap: https://mattdoes.online/sitemap.xml'));
});
