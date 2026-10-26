#!/usr/bin/env node
// Project index. Generated facts go to intel/index.json. Curated intent
// stays in intel/curated.json. Do not hand-edit the generated file.
//
//   npm run intel            regenerate sections whose sources changed
//   npm run intel:check      fail if the index, anchors, or verified-at drifted
//   npm run intel:touch      set verified-at to HEAD for stale curated entries
//   npm run intel:hook       install the opt-in pre-commit hook
//   node scripts/intel.js --feature <id>
//   node scripts/intel.js --route <path>
//   node scripts/intel.js --changed <path>
//   node scripts/intel.js --measure

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseTokens, LIVE_TOKENS } from '../lib/design-tokens.js';
import { verbCatalog, SECRET_PATHS, unsharedEnabled, sitemapPaths, socials } from '../site/verbs.ts';
import { unsharedEntries } from '../concepts/entries.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_PATH = path.join(ROOT, 'intel', 'index.json');
const CURATED_PATH = path.join(ROOT, 'intel', 'curated.json');
const HAND = 'Do not edit. Regenerate with npm run intel.';

const SKIP_DIR = new Set([
  'node_modules', 'dist', '.git', '.cache', '.wrangler', 'baselines',
  'test-results', '.dist', 'playwright-report', 'blob-report', 'coverage',
]);
const BINARY = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.woff', '.woff2', '.ico',
  '.mp3', '.mp4', '.webm', '.avif',
]);
const DOC_SKIP = new Set(['AGENTS.md', 'README.md', 'STYLE.md', 'LICENSE']);

const GROUPS = ['decisions', 'rejected', 'invariants', 'lessons', 'conventions', 'features'];

/**
 * Renderer recipes. A verb whose renderer is missing here fails the index,
 * the same way a missing renderer fails the build. `mustMention` is a
 * literal that has to stay in the template file.
 */
const RENDERERS = {
  watch: {
    render: 'renderWatch',
    mustMention: ['posterPrefsTag(ctx.assets)', 'data-posters-toggle'],
    scripts: ['static/station.js', 'static/poster-prefs.js'],
    styles: ['static/station.css', 'site/tokens.css'],
    data: ['lib/watches.js', 'lib/posters.js', 'lib/letterboxd.js'],
    endpoints: [],
  },
  listen: {
    render: 'renderListen',
    mustMention: ['albumGrid(ctx.periods)', 'listeningRows(ctx.tracks)'],
    scripts: ['static/station.js'],
    styles: ['static/station.css', 'site/tokens.css'],
    data: ['lib/listening.js', 'lib/lastfm.js', 'lib/listen-line.js'],
    endpoints: [
      { path: '/api/listening/recent', from: 'browser', file: 'static/station.js' },
      { path: '/api/listening/charts', from: 'build', file: 'lib/listening.js' },
    ],
  },
  unshared: {
    render: 'renderUnshared',
    mustMention: ['renderHubDocument'],
    scripts: [],
    styles: ['concepts/hub.css', 'site/tokens.css'],
    data: ['concepts/hub.js', 'concepts/entries.js'],
    endpoints: [],
  },
};

function rel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

function abs(relPath) {
  return path.join(ROOT, relPath);
}

function git(args, opts = {}) {
  return spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...opts,
  });
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(rel(full));
  }
  return out;
}

function scanned(relPath) {
  if (relPath.startsWith('intel/')) return false;
  if (DOC_SKIP.has(relPath)) return false;
  if (relPath.endsWith('package-lock.json')) return false;
  const ext = path.extname(relPath).toLowerCase();
  if (BINARY.has(ext)) return false;
  return true;
}

function loadCorpus() {
  const texts = new Map();
  const hashes = new Map();
  const files = walk(ROOT).filter(scanned).sort();
  for (const file of files) {
    const buf = fs.readFileSync(abs(file));
    texts.set(file, buf.toString('utf8'));
    hashes.set(file, crypto.createHash('sha256').update(buf).digest('hex'));
  }
  const blobs = new Map();
  if (files.length) {
    const result = git(['hash-object', '--', ...files]);
    if (result.status === 0) {
      const lines = result.stdout.trim().split('\n');
      files.forEach((file, i) => blobs.set(file, lines[i] || null));
    }
  }
  return { texts, hashes, blobs, files };
}

function provenance(paths, corpus) {
  return [...paths].sort().map((file) => ({
    path: file,
    sha256: corpus.hashes.get(file) || sha256Of(file),
    gitBlob: corpus.blobs.get(file) || null,
  }));
}

function sha256Of(file) {
  const buf = fs.readFileSync(abs(file));
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function textOf(file, corpus) {
  if (corpus.texts.has(file)) return corpus.texts.get(file);
  return fs.readFileSync(abs(file), 'utf8');
}

function mustMention(file, snippets, corpus) {
  const text = textOf(file, corpus);
  for (const snippet of snippets) {
    if (!text.includes(snippet)) {
      throw new Error(`intel: ${file} no longer contains ${JSON.stringify(snippet)}`);
    }
  }
}

function endpointFacts(list, corpus) {
  return list.map((item) => {
    const text = textOf(item.file, corpus);
    if (!text.includes(item.path)) {
      throw new Error(`intel: ${item.file} no longer mentions ${item.path}`);
    }
    return item;
  });
}

function page(partial, corpus) {
  const files = [...new Set([
    ...(partial.scripts || []),
    ...(partial.styles || []),
    ...(partial.data || []),
    partial.page,
  ].filter(Boolean))].sort();
  for (const file of files) {
    if (!fs.existsSync(abs(file))) throw new Error(`intel: missing route file ${file}`);
  }
  return {
    path: partial.path,
    published: partial.published,
    inSitemap: partial.inSitemap,
    render: partial.render || null,
    page: partial.page || null,
    scripts: partial.scripts || [],
    styles: partial.styles || [],
    data: partial.data || [],
    endpoints: partial.endpoints || [],
    files,
  };
}

function buildRoutes(corpus) {
  const renderSrc = 'site/render.js';
  const sitemap = new Set(sitemapPaths());
  const routes = [];

  mustMention(renderSrc, ['station.css', 'station.js'], corpus);
  routes.push(page({
    path: '/',
    published: true,
    inSitemap: sitemap.has('/'),
    render: 'renderHome',
    page: renderSrc,
    scripts: ['static/station.js'],
    styles: ['static/station.css', 'site/tokens.css'],
    data: ['lib/watches.js', 'lib/listening.js', 'lib/listen-line.js', 'lib/letterboxd.js'],
    endpoints: endpointFacts([
      { path: '/api/listening/now', from: 'browser', file: 'static/station.js' },
    ], corpus),
  }, corpus));
  mustMention(renderSrc, ['function renderHome', 'listenPreview', 'watchPreview'], corpus);

  for (const verb of verbCatalog) {
    const recipe = RENDERERS[verb.renderer];
    if (!recipe) throw new Error(`intel: no route recipe for renderer "${verb.renderer}"`);
    mustMention(renderSrc, [`function ${recipe.render}`, ...recipe.mustMention], corpus);
    const published = verb.slug === 'unshared' ? unsharedEnabled : true;
    const urlPath = `/${verb.slug}/`;
    routes.push(page({
      path: urlPath,
      published,
      inSitemap: sitemap.has(urlPath),
      render: recipe.render,
      page: renderSrc,
      scripts: recipe.scripts,
      styles: recipe.styles,
      data: recipe.data,
      endpoints: endpointFacts(recipe.endpoints, corpus),
    }, corpus));
  }

  if (unsharedEnabled) {
    mustMention('concepts/hub.js', ['unsharedEntries'], corpus);
    for (const entry of unsharedEntries) {
      const dir = `concepts/${entry.slug}`;
      const pageFile = `${dir}/index.html`;
      if (!fs.existsSync(abs(pageFile))) {
        throw new Error(`intel: unshared entry "${entry.slug}" has no ${pageFile}`);
      }
      const local = corpus.files.filter((file) => file.startsWith(`${dir}/`));
      const scripts = local.filter((file) => file.endsWith('.js'));
      const styles = [...local.filter((file) => file.endsWith('.css')), 'site/tokens.css'];
      const data = [];
      for (const script of scripts) {
        const imported = localImports(script, corpus);
        for (const item of imported) {
          if (item.path && item.path.startsWith('concepts/') && !scripts.includes(item.path)) data.push(item.path);
        }
      }
      const urlPath = `/unshared/${entry.slug}/`;
      routes.push(page({
        path: urlPath,
        published: true,
        inSitemap: sitemap.has(urlPath),
        render: null,
        page: pageFile,
        scripts,
        styles,
        data,
        endpoints: [],
      }, corpus));
    }
  }

  routes.push(page({
    path: '/404.html',
    published: true,
    inSitemap: false,
    render: 'renderNotFound',
    page: renderSrc,
    scripts: ['static/station.js'],
    styles: ['static/station.css', 'site/tokens.css'],
    data: [],
    endpoints: [],
  }, corpus));
  mustMention(renderSrc, ['function renderNotFound'], corpus);

  const frequencyOn = SECRET_PATHS.includes('/frequency/');
  routes.push(page({
    path: '/frequency/',
    published: frequencyOn,
    inSitemap: false,
    render: 'renderFrequency',
    page: renderSrc,
    scripts: frequencyOn ? ['static/station.js'] : [],
    styles: frequencyOn ? ['static/station.css', 'site/tokens.css'] : [],
    data: [],
    endpoints: [],
  }, corpus));
  mustMention(renderSrc, ['function renderFrequency'], corpus);

  routes.sort((a, b) => a.path.localeCompare(b.path));
  return { entries: routes };
}

function localImports(file, corpus) {
  const text = textOf(file, corpus);
  const specs = new Set();
  for (const match of text.matchAll(/from\s*['"]([^'"]+)['"]/g)) specs.add(match[1]);
  for (const match of text.matchAll(/import\s*['"]([^'"]+)['"]/g)) specs.add(match[1]);
  for (const match of text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(match[1]);
  const out = [];
  for (const spec of specs) {
    if (!spec.startsWith('.')) {
      out.push({ spec, external: spec });
      continue;
    }
    const base = path.resolve(path.dirname(abs(file)), spec);
    const candidates = [base, `${base}.js`, `${base}.ts`, path.join(base, 'index.js')];
    const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!found) out.push({ spec, unresolved: true, from: file });
    else out.push({ spec, path: rel(found) });
  }
  out.sort((a, b) => (a.path || a.spec).localeCompare(b.path || b.spec));
  return out;
}

function buildModules(corpus) {
  const code = corpus.files.filter((file) => /\.(js|ts)$/.test(file));
  const edges = [];
  const unresolved = [];
  for (const file of code) {
    for (const item of localImports(file, corpus)) {
      if (item.path) edges.push({ from: file, to: item.path });
      else if (item.unresolved) unresolved.push({ from: file, spec: item.spec });
    }
  }
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  unresolved.sort((a, b) => a.from.localeCompare(b.from) || a.spec.localeCompare(b.spec));

  const incoming = new Map();
  for (const edge of edges) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    incoming.get(edge.to).push(edge.from);
  }

  const roots = new Set();
  roots.add('build.js');
  for (const file of corpus.files) {
    if (file.startsWith('scripts/') && file.endsWith('.js')) roots.add(file);
    if (file.startsWith('static/') && file.endsWith('.js')) roots.add(file);
  }
  for (const file of corpus.files.filter((item) => item.endsWith('wrangler.toml'))) {
    const main = textOf(file, corpus).match(/^main\s*=\s*"([^"]+)"/m);
    if (main) roots.add(path.posix.join(path.posix.dirname(file), main[1]));
  }
  for (const file of corpus.files.filter((item) => item.endsWith('.html'))) {
    const text = textOf(file, corpus);
    for (const match of text.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
      const src = match[1];
      if (!src.startsWith('.') && !src.startsWith('/')) continue;
      const full = src.startsWith('/')
        ? src.slice(1)
        : rel(path.resolve(path.dirname(abs(file)), src));
      if (fs.existsSync(abs(full))) roots.add(full);
    }
  }

  const seen = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop();
    for (const edge of edges) {
      if (edge.from !== file || seen.has(edge.to)) continue;
      seen.add(edge.to);
      queue.push(edge.to);
    }
  }

  const production = (file) => file.startsWith('lib/')
    || file.startsWith('site/')
    || file.startsWith('concepts/')
    || file.startsWith('workers/')
    || file.startsWith('static/')
    || file.startsWith('scripts/');
  const testOnly = code.filter((file) => {
    if (!production(file) || seen.has(file)) return false;
    return edges.some((edge) => edge.to === file && edge.from.startsWith('test/'));
  }).sort();
  const unreferenced = code.filter((file) => production(file) && !seen.has(file) && !testOnly.includes(file)).sort();

  return {
    edges,
    unresolved,
    unreferenced,
    testOnly,
    incoming: Object.fromEntries([...incoming.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
  };
}

function parseWorkerToml(text) {
  const name = text.match(/^name\s*=\s*"([^"]+)"/m)?.[1] || '';
  const main = text.match(/^main\s*=\s*"([^"]+)"/m)?.[1] || '';
  const routes = [...text.matchAll(/pattern\s*=\s*"([^"]+)"/g)].map((match) => match[1]);
  const crons = [...text.matchAll(/crons\s*=\s*\[([^\]]*)\]/g)]
    .flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]));
  const secrets = [...text.matchAll(/required\s*=\s*\[([^\]]*)\]/g)]
    .flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]));
  const bindings = [];
  for (const block of text.split(/\n(?=\[\[)/)) {
    const header = block.match(/^\[\[([^\]]+)\]\]/);
    if (!header) continue;
    const binding = block.match(/^binding\s*=\s*"([^"]+)"/m)?.[1];
    const bindingName = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const className = block.match(/^class_name\s*=\s*"([^"]+)"/m)?.[1];
    const service = block.match(/^service\s*=\s*"([^"]+)"/m)?.[1];
    const id = binding || bindingName;
    if (!id) continue;
    const item = { name: id, kind: header[1] };
    if (className) item.className = className;
    if (service) item.service = service;
    bindings.push(item);
  }
  bindings.sort((a, b) => a.name.localeCompare(b.name));
  return { name, main, routes, crons, bindings, secrets: [...new Set(secrets)].sort() };
}

function envNamesIn(text) {
  const names = new Set();
  for (const match of text.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)) names.add(match[1]);
  for (const match of text.matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(match[1]);
  return [...names].sort();
}

function buildWorkers(corpus) {
  const entries = [];
  for (const file of corpus.files.filter((item) => item.endsWith('wrangler.toml')).sort()) {
    const parsed = parseWorkerToml(textOf(file, corpus));
    const dir = path.posix.dirname(file);
    const source = path.posix.join(dir, parsed.main);
    entries.push({
      ...parsed,
      file,
      source: fs.existsSync(abs(source)) ? source : null,
      env: envNamesIn(`${textOf(file, corpus)}\n${fs.existsSync(abs(source)) ? textOf(source, corpus) : ''}`),
    });
  }
  return { entries };
}

function buildEnv(corpus) {
  const hits = new Map();
  for (const file of corpus.files) {
    if (!/\.(js|ts|sh|toml)$/.test(file)) continue;
    for (const name of envNamesIn(textOf(file, corpus))) {
      if (!hits.has(name)) hits.set(name, []);
      hits.get(name).push(file);
    }
  }
  const entries = [...hits.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, files]) => ({ name, files }));
  return { entries };
}

function buildTokens(corpus) {
  const tokenFile = 'site/tokens.css';
  const css = textOf(tokenFile, corpus);
  const defined = parseTokens(css);
  const entries = [];
  for (const [name, value] of defined) {
    const needle = `var(${name})`;
    const files = [];
    for (const file of corpus.files) {
      if (file === tokenFile) continue;
      if (textOf(file, corpus).includes(needle)) files.push(file);
    }
    const inTokens = css.includes(needle);
    entries.push({
      name,
      value,
      live: LIVE_TOKENS.has(name),
      definedIn: tokenFile,
      referencedInTokens: inTokens,
      files,
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const unused = entries
    .filter((item) => !item.referencedInTokens && item.files.length === 0)
    .map((item) => item.name);
  return { entries, unused };
}

function cssClasses(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const keyframes = new Set([...stripped.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]));
  const names = new Set();
  for (const match of stripped.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
    if (!keyframes.has(match[1])) names.add(match[1]);
  }
  return names;
}

function classToken(list, name) {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|$)`).test(list);
}

function classUsed(name, file, corpus) {
  const text = textOf(file, corpus);
  for (const match of text.matchAll(/\bclass\s*=\s*"([^"]*)"/g)) {
    if (classToken(match[1], name)) return true;
  }
  for (const match of text.matchAll(/\bclassName\s*=\s*['"]([^'"]*)['"]/g)) {
    if (classToken(match[1], name)) return true;
  }
  if (new RegExp(`classList\\.(?:add|remove|toggle|contains)\\(\\s*['"]${name}['"]`).test(text)) return true;
  // A selector in script. `res.status` is a property, not a class.
  return new RegExp(`(?<![\\w])\\.${name}(?![\\w-])`).test(text);
}

function buildSimplification(corpus, tokens, modules) {
  const cssFiles = corpus.files.filter((file) => file.endsWith('.css') && !file.startsWith('test/'));
  const product = corpus.files.filter((file) => !file.startsWith('test/') && !file.endsWith('.css'));
  const classes = new Map();
  for (const file of cssFiles) {
    for (const name of cssClasses(textOf(file, corpus))) {
      if (!classes.has(name)) classes.set(name, []);
      classes.get(name).push(file);
    }
  }
  const classesOnlyInCss = [];
  for (const [name, files] of [...classes.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const used = product.some((file) => classUsed(name, file, corpus));
    if (!used) classesOnlyInCss.push({ class: name, files });
  }
  return {
    classesOnlyInCss,
    unusedTokens: tokens.unused,
    unreferencedModules: modules.unreferenced,
    testOnlyModules: modules.testOnly,
  };
}

function numericConsts(file, corpus) {
  const out = {};
  const re = /\b([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\b/g;
  for (const match of textOf(file, corpus).matchAll(re)) out[match[1]] = Number(match[2]);
  return out;
}

function readConst(file, name, corpus) {
  const value = numericConsts(file, corpus)[name];
  if (value == null) throw new Error(`intel: ${file} has no numeric constant ${name}`);
  return value;
}

const INDEX_CODE = new Set(['scripts/intel.js', 'test/intel.test.js']);

function filesContaining(needle, corpus) {
  const hits = [];
  for (const file of corpus.files) {
    if (INDEX_CODE.has(file)) continue;
    if (textOf(file, corpus).includes(needle)) hits.push(file);
  }
  return hits;
}

function buildFeatures(curated, corpus) {
  const entries = [];
  for (const feature of curated.features) {
    const files = new Set();
    const anchors = {};
    for (const anchor of feature.anchors || []) {
      const hits = filesContaining(anchor, corpus);
      if (!hits.length) throw new Error(`intel: feature ${feature.id} anchor not found: ${anchor}`);
      anchors[anchor] = hits;
      for (const hit of hits) files.add(hit);
    }
    for (const key of feature.storageKeys || []) {
      const hits = filesContaining(key, corpus);
      if (!hits.length) throw new Error(`intel: feature ${feature.id} storage key not found: ${key}`);
      for (const hit of hits) files.add(hit);
    }
    for (const endpoint of feature.endpoints || []) {
      const hits = filesContaining(endpoint, corpus);
      if (!hits.length) throw new Error(`intel: feature ${feature.id} endpoint not found: ${endpoint}`);
      for (const hit of hits) files.add(hit);
    }
    const constants = {};
    for (const file of feature.constantsFrom || []) {
      if (!fs.existsSync(abs(file))) throw new Error(`intel: feature ${feature.id} missing ${file}`);
      constants[file] = numericConsts(file, corpus);
      files.add(file);
    }
    if (feature.parity) {
      const values = feature.parity.map(([file, name]) => readConst(file, name, corpus));
      if (new Set(values).size !== 1) {
        throw new Error(`intel: feature ${feature.id} parity broken (${feature.parity.map((item) => item.join('=')).join(' vs ')})`);
      }
    }
    const list = [...files].sort();
    const sources = list.filter((file) => !file.startsWith('test/'));
    const tests = list.filter((file) => file.startsWith('test/'));
    entries.push({
      id: feature.id,
      route: feature.route,
      anchors: feature.anchors || [],
      anchorFiles: anchors,
      storageKeys: feature.storageKeys || [],
      endpoints: feature.endpoints || [],
      constants,
      files: list,
      sources,
      tests,
      provenance: provenance(sources, corpus),
    });
  }
  const routeCount = new Map();
  for (const entry of entries) routeCount.set(entry.route, (routeCount.get(entry.route) || 0) + 1);
  for (const entry of entries) {
    if (!entry.route || entry.route === '/' || routeCount.get(entry.route) > 1) continue;
    for (const file of corpus.files) {
      if (INDEX_CODE.has(file)) continue;
      if (!file.startsWith('test/') || (!file.endsWith('.test.js') && !file.endsWith('.spec.js'))) continue;
      if (mentionsRoute(textOf(file, corpus), entry.route) && !entry.tests.includes(file)) {
        entry.tests.push(file);
      }
    }
    entry.tests.sort();
  }
  return { entries };
}

function mentionsRoute(text, route) {
  let index = 0;
  while ((index = text.indexOf(route, index)) !== -1) {
    const next = text[index + route.length] || '';
    if (!/[A-Za-z0-9-]/.test(next)) return true;
    index += route.length;
  }
  return false;
}

function buildTests(corpus, features) {
  const tests = corpus.files.filter((file) => file.startsWith('test/') && (file.endsWith('.test.js') || file.endsWith('.spec.js'))).sort();
  const entries = tests.map((file) => {
    const imports = localImports(file, corpus).filter((item) => item.path).map((item) => item.path);
    const linked = features.entries
      .filter((feature) => feature.tests.includes(file) || imports.some((item) => feature.sources.includes(item)))
      .map((feature) => feature.id);
    return { file, imports, features: [...new Set(linked)].sort() };
  });
  return { entries };
}

function sectionSources(name, corpus) {
  if (name === 'routes') {
    return [
      'site/verbs.ts', 'site/render.js', 'concepts/entries.js', 'concepts/hub.js',
      'lib/publish-unshared.js', 'lib/emit/index.js', 'static/station.js',
      'static/poster-prefs.js', 'lib/listening.js',
      ...corpus.files.filter((file) => file.startsWith('concepts/') && file.includes('/')),
    ];
  }
  if (name === 'modules') return corpus.files.filter((file) => /\.(js|ts|html)$/.test(file));
  if (name === 'workers') return corpus.files.filter((file) => file.startsWith('workers/'));
  if (name === 'env') return corpus.files.filter((file) => /\.(js|ts|sh|toml)$/.test(file));
  if (name === 'tokens') return corpus.files.filter((file) => file.endsWith('.css') || file.endsWith('.js') || file.endsWith('.html') || file === 'site/tokens.css');
  if (name === 'features' || name === 'tests' || name === 'simplification') return corpus.files;
  return [];
}

function unique(list) {
  return [...new Set(list.filter((file) => fs.existsSync(abs(file))))].sort();
}

export function loadCurated(file = CURATED_PATH) {
  const curated = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (curated.schema !== 1) throw new Error('intel: curated schema is not 1');
  return curated;
}

function validateCuratedShape(curated) {
  const errors = [];
  const ids = new Set();
  for (const group of GROUPS) {
    if (!Array.isArray(curated[group])) errors.push(`missing ${group} array`);
  }
  if (errors.length) return errors;
  for (const group of GROUPS) {
    for (const entry of curated[group]) {
      if (!entry.id || ids.has(entry.id)) errors.push(`${group}: bad or duplicate id ${entry.id}`);
      ids.add(entry.id);
      if (!/^[0-9a-f]{40}$/.test(entry['verified-at'] || '')) {
        errors.push(`${entry.id}: verified-at must be a 40-character commit sha`);
      }
      if (typeof entry.text !== 'string' || !entry.text.trim()) errors.push(`${entry.id}: missing text`);
      for (const file of entry.paths || []) {
        if (!fs.existsSync(abs(file))) errors.push(`${entry.id}: missing path ${file}`);
      }
      for (const anchor of entry.anchors || []) {
        if (typeof anchor !== 'string' || !anchor) errors.push(`${entry.id}: empty anchor`);
      }
      if (group === 'features' && typeof entry.route !== 'string') errors.push(`${entry.id}: feature needs a route`);
    }
  }
  return errors;
}

export function filesChangedSince(sha, files) {
  if (!files.length) return [];
  const result = git(['diff', '--name-only', sha, '--', ...files]);
  if (result.status !== 0) {
    return files.map((file) => `${file} (git diff ${sha} failed)`);
  }
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

export function staleEntries(curated, index) {
  const features = new Map((index.sections.features?.entries || []).map((entry) => [entry.id, entry]));
  const stale = [];
  for (const group of GROUPS) {
    for (const entry of curated[group]) {
      const files = group === 'features'
        ? (features.get(entry.id)?.sources || [])
        : (entry.paths || []);
      const changed = filesChangedSince(entry['verified-at'], files);
      if (changed.length) stale.push({ id: entry.id, group, changed });
    }
  }
  return stale;
}

function buildSection(name, corpus, curated, partial) {
  if (name === 'routes') return buildRoutes(corpus);
  if (name === 'modules') return buildModules(corpus);
  if (name === 'workers') return buildWorkers(corpus);
  if (name === 'env') return buildEnv(corpus);
  if (name === 'tokens') return buildTokens(corpus);
  if (name === 'features') return buildFeatures(curated, corpus);
  if (name === 'tests') return buildTests(corpus, partial.features);
  if (name === 'simplification') return buildSimplification(corpus, partial.tokens, partial.modules);
  throw new Error(`intel: unknown section ${name}`);
}

const SECTION_ORDER = ['routes', 'modules', 'workers', 'env', 'tokens', 'features', 'tests', 'simplification'];
const SECTION_NEEDS = {
  tests: ['features'],
  simplification: ['tokens', 'modules'],
};

export function buildIndex({ previous = null, curated = null, corpus = null } = {}) {
  const facts = corpus || loadCorpus();
  const intent = curated || loadCurated();
  const shapeErrors = validateCuratedShape(intent);
  if (shapeErrors.length) {
    throw new Error(`intel: curated is invalid\n  ${shapeErrors.join('\n  ')}`);
  }
  const manifest = provenance(unique([...facts.files, rel(CURATED_PATH)]), facts);
  const previousHashes = new Map((previous?.files || []).map((item) => [item.path, item.sha256]));
  const sections = {};
  const report = [];
  const built = {};
  for (const name of SECTION_ORDER) {
    const sources = unique([...sectionSources(name, facts), rel(CURATED_PATH)]);
    const prev = previous?.sections?.[name];
    const changed = sources.filter((file) => previousHashes.get(file) !== (facts.hashes.get(file) || sha256Of(file)));
    const needsRegen = (SECTION_NEEDS[name] || []).some((need) => report.find((item) => item.section === need && item.action === 'regenerated'));
    const same = prev
      && JSON.stringify(prev.provenance) === JSON.stringify(sources)
      && changed.length === 0
      && !needsRegen;
    if (same) {
      sections[name] = prev;
      built[name] = prev;
      report.push({ section: name, action: 'kept', changed: [] });
      continue;
    }
    const data = buildSection(name, facts, intent, built);
    const section = { provenance: sources, ...data };
    sections[name] = section;
    built[name] = section;
    const affected = name === 'features' && prev?.entries
      ? prev.entries
        .filter((entry) => entry.sources.some((file) => changed.includes(file)))
        .map((entry) => entry.id)
      : [];
    report.push({ section: name, action: 'regenerated', changed, affected });
  }
  const index = {
    schema: 1,
    generated: true,
    handEdit: HAND,
    query: {
      feature: 'node scripts/intel.js --feature <id>',
      route: 'node scripts/intel.js --route <path>',
      changed: 'node scripts/intel.js --changed <path>',
    },
    layout: {
      contentDirExists: fs.existsSync(path.join(ROOT, 'content')),
      unsharedEnabled,
      secretPaths: SECRET_PATHS,
      socials: socials.map((item) => ({ label: item.label, href: item.href })),
    },
    files: manifest,
    sections,
  };
  return { index, report, curated: intent, corpus: facts };
}

export function serializeIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

function writeIndex(index) {
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(INDEX_PATH, serializeIndex(index));
}

function readIndex() {
  return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
}

function printReport(report) {
  for (const item of report) {
    const extra = item.changed.length ? ` (${item.changed.length} changed)` : '';
    console.log(`intel: ${item.section} ${item.action}${extra}`);
    if (item.affected?.length) console.log(`  features: ${item.affected.join(', ')}`);
  }
}

function checkIndex(fresh, disk) {
  const errors = [];
  if (!disk || disk.handEdit !== HAND) errors.push('index is missing the generated marker');
  for (const name of SECTION_ORDER) {
    if (JSON.stringify(disk?.sections?.[name]) !== JSON.stringify(fresh.sections[name])) {
      errors.push(`section ${name} does not match a full regen`);
    }
  }
  if (JSON.stringify(disk?.layout) !== JSON.stringify(fresh.layout)) errors.push('layout does not match');
  if (JSON.stringify(disk?.files) !== JSON.stringify(fresh.files)) errors.push('file manifest does not match');
  return errors;
}

function knownSha(sha) {
  const result = git(['cat-file', '-e', `${sha}^{commit}`]);
  return result.status === 0;
}

export function checkAll() {
  const { index: fresh, curated } = buildIndex();
  const errors = [];
  let disk = null;
  try {
    disk = readIndex();
  } catch {
    errors.push('intel/index.json is missing. Run npm run intel.');
  }
  if (disk) errors.push(...checkIndex(fresh, disk));
  for (const group of GROUPS) {
    for (const entry of curated[group]) {
      if (!knownSha(entry['verified-at'])) {
        errors.push(`${entry.id}: verified-at ${entry['verified-at']} is not a commit in this clone`);
      }
    }
  }
  const stale = disk ? staleEntries(curated, fresh) : [];
  return { errors, stale, fresh, curated };
}

function printFeature(id) {
  const disk = readIndex();
  const curated = loadCurated();
  const generated = disk.sections.features.entries.find((entry) => entry.id === id);
  const intent = curated.features.find((entry) => entry.id === id);
  if (!generated || !intent) {
    console.error(`intel: no feature ${id}`);
    console.error(`  ids: ${curated.features.map((entry) => entry.id).join(', ')}`);
    process.exit(1);
  }
  const stale = staleEntries(curated, disk).find((entry) => entry.id === id) || null;
  const payload = {
    id,
    route: intent.route,
    text: intent.text,
    risks: intent.risks || [],
    devices: intent.devices || [],
    stale: Boolean(stale),
    staleFiles: stale?.changed || [],
    verifiedAt: intent['verified-at'],
    sources: generated.sources,
    tests: generated.tests,
    anchors: generated.anchors,
    storageKeys: generated.storageKeys,
    endpoints: generated.endpoints,
    constants: generated.constants,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printRoute(urlPath) {
  const disk = readIndex();
  const entry = disk.sections.routes.entries.find((item) => item.path === urlPath);
  if (!entry) {
    console.error(`intel: no route ${urlPath}`);
    console.error(`  paths: ${disk.sections.routes.entries.map((item) => item.path).join(', ')}`);
    process.exit(1);
  }
  const features = disk.sections.features.entries.filter((item) => item.route === urlPath).map((item) => item.id);
  process.stdout.write(`${JSON.stringify({ ...entry, features }, null, 2)}\n`);
}

function printChanged(file) {
  const disk = readIndex();
  const matched = disk.sections.features.entries
    .filter((entry) => entry.files.includes(file) || entry.sources.includes(file) || entry.tests.includes(file));
  const features = matched.map((entry) => entry.id);
  const routes = disk.sections.routes.entries
    .filter((entry) => entry.files.includes(file))
    .map((entry) => entry.path);
  const tokens = disk.sections.tokens.entries
    .filter((entry) => entry.files.includes(file) || entry.definedIn === file)
    .map((entry) => entry.name);
  const tests = [...new Set(matched.flatMap((entry) => entry.tests))].sort();
  process.stdout.write(`${JSON.stringify({ file, features, routes, tokenCount: tokens.length, tests }, null, 2)}\n`);
}

function measure(index) {
  const bytes = (file) => fs.statSync(abs(file)).size;
  const sourceFiles = walk(ROOT).filter((file) => scanned(file) && !file.startsWith('test/visual/'));
  const sourceBytes = sourceFiles.reduce((sum, file) => sum + bytes(file), 0);
  const features = index.sections.features.entries.map((entry) => ({
    id: entry.id,
    entryBytes: Buffer.byteLength(JSON.stringify(entry)),
    sourceCount: entry.sources.length,
    sourceBytes: entry.sources.reduce((sum, file) => sum + bytes(file), 0),
    testCount: entry.tests.length,
  }));
  return {
    agentsBytes: bytes('AGENTS.md'),
    indexBytes: bytes('intel/index.json'),
    curatedBytes: bytes('intel/curated.json'),
    assessmentBytes: fs.existsSync(abs('intel/assessment.md')) ? bytes('intel/assessment.md') : 0,
    sourceFiles: sourceFiles.length,
    sourceBytes,
    featureCount: features.length,
    features,
  };
}

function touch() {
  const head = git(['rev-parse', 'HEAD']);
  if (head.status !== 0) throw new Error('intel: git rev-parse HEAD failed');
  const sha = head.stdout.trim();
  const { index, curated } = buildIndex();
  const stale = staleEntries(curated, index);
  if (!stale.length) {
    console.log('intel: nothing stale');
    return;
  }
  const dirty = new Set(filesChangedSince('HEAD', [...new Set(stale.flatMap((item) => item.changed))]));
  const productDirty = [...dirty].filter((file) => !file.startsWith('intel/curated.json'));
  if (productDirty.length) {
    console.error('intel: commit the code change first, then npm run intel:touch.');
    for (const file of productDirty) console.error(`  ${file}`);
    process.exit(1);
  }
  const ids = [...new Set(stale.map((item) => item.id))];
  let text = fs.readFileSync(CURATED_PATH, 'utf8');
  for (const id of ids) {
    const pattern = new RegExp(`("id": "${id}",\\n\\s*"verified-at": ")[0-9a-f]{40}(")`);
    if (!pattern.test(text)) throw new Error(`intel: cannot find verified-at for ${id}`);
    text = text.replace(pattern, `$1${sha}$2`);
  }
  fs.writeFileSync(CURATED_PATH, text);
  console.log(`intel: verified-at ${sha} on ${ids.join(', ')}`);
  console.log('intel: commit intel/curated.json. Do not amend unless you were asked to.');
}

function installHook() {
  const dest = path.join(ROOT, '.git', 'hooks', 'pre-commit');
  const src = path.join(ROOT, 'scripts', 'git-hooks', 'pre-commit');
  if (fs.existsSync(dest)) {
    const current = fs.readFileSync(dest, 'utf8');
    if (current.includes('scripts/intel.js')) {
      console.log('intel: pre-commit already runs the index check');
      return;
    }
    console.error('intel: .git/hooks/pre-commit exists. Refusing to overwrite it.');
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  console.log('intel: installed .git/hooks/pre-commit');
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const value = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? '' : (args[index + 1] || '');
  };
  if (flag('--hook')) return installHook();
  if (flag('--feature')) return printFeature(value('--feature'));
  if (flag('--route')) return printRoute(value('--route'));
  if (flag('--changed')) return printChanged(value('--changed'));
  if (flag('--touch')) return touch();
  if (flag('--check')) {
    const { errors, stale } = checkAll();
    if (!errors.length) console.log('intel: index matches a full regen');
    for (const error of errors) console.error(`intel: ${error}`);
    if (stale.length) {
      console.error('intel: curated entries are stale. Code wins. Update the entry or run npm run intel:touch after the code is committed.');
      for (const item of stale) console.error(`  ${item.id}: ${item.changed.join(', ')}`);
    } else if (!errors.length) console.log('intel: curated paths, anchors, and verified-at are current');
    if (errors.length || stale.length) process.exit(1);
    return;
  }
  if (flag('--measure')) {
    const disk = readIndex();
    process.stdout.write(`${JSON.stringify(measure(disk), null, 2)}\n`);
    return;
  }
  let previous = null;
  try { previous = readIndex(); } catch { /* first run */ }
  const started = Date.now();
  const { index, report } = buildIndex({ previous });
  writeIndex(index);
  printReport(report);
  console.log(`intel: wrote intel/index.json in ${Date.now() - started}ms`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
