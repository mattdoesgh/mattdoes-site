// theme-boot.js — applies the visitor's saved theme + accent BEFORE first
// paint, so a navigation never flashes the default dark/pink before the
// deferred tweaks.js gets a chance to run. Loaded *synchronously* in the
// document <head>, ahead of the stylesheet — that ordering is the whole
// point, so it must never be deferred/async.
//
// This deliberately duplicates the ACCENTS map and TWEAK_DEFAULTS from
// static/tweaks.js (its apply()). Keep the two in sync — test/contrast.test.js
// parses the tweaks.js map, and theme-boot must resolve accents identically.
(function () {
  try {
    var ACCENTS = {
      warm:  "oklch(0.65 0.09 65)",
      pink:  "#f77bc9",
      blue:  "oklch(0.65 0.12 240)",
      green: "oklch(0.65 0.12 150)"
    };
    var dark = true, accent = "pink";   // tweaks.js TWEAK_DEFAULTS
    var raw = localStorage.getItem('mdo:tweaks:v1');
    if (raw) {
      var p = JSON.parse(raw);
      if (p && typeof p === 'object') {
        if ('dark' in p) dark = !!p.dark;
        if (typeof p.accent === 'string') accent = p.accent;
      }
    }
    var r = document.documentElement;
    r.dataset.theme = dark ? 'dark' : 'light';
    r.style.setProperty('--accent', ACCENTS[accent] || ACCENTS.warm);
  } catch (e) { /* private mode / bad JSON — fall back to the CSS defaults */ }
})();
