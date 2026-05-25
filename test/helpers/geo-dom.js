// Test helper — loads static/geo-background.js inside jsdom with the browser
// globals it needs stubbed (matchMedia, rAF, geolocation, fetch). Returns the
// jsdom window so privacy tests can drive geoBackground.* and inspect
// localStorage.

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '..', '..', 'static', 'geo-background.js');

/**
 * Load geo-background.js into a fresh jsdom window.
 *
 * @param {object}  opts
 * @param {{latitude:number,longitude:number}} [opts.coords] geolocation result
 * @param {(url:string)=>object} [opts.fetchJson] returns the parsed body the
 *   stubbed fetch should resolve with; default → a worker feature payload
 * @returns {import('jsdom').DOMWindow}
 */
export function loadGeoBackground({ coords, fetchJson } = {}) {
  const dom = new JSDOM('<div id="geo-bg"></div>', {
    runScripts: 'dangerously',
    url: 'https://mattdoes.online/',
  });
  const w = dom.window;

  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.requestAnimationFrame = () => 0;
  w.cancelAnimationFrame = () => {};

  if (coords) {
    w.navigator.geolocation = {
      getCurrentPosition: (ok) => ok({ coords }),
    };
  }

  const defaultBody = {
    feature: {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
    },
    label: 'Testville',
  };
  w.fetch = async (url) => ({
    ok: true,
    json: async () => (fetchJson ? fetchJson(url) : defaultBody),
  });

  w.eval(fs.readFileSync(SCRIPT, 'utf8'));
  return w;
}

/** Read the raw geo-background.js source (for source-level assertions). */
export function geoSource() {
  return fs.readFileSync(SCRIPT, 'utf8');
}
