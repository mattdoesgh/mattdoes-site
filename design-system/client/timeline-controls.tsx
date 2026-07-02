// Boot shim for the timeline-controls island. The script tag ships on every
// timeline-ish page, but the React island (and its vendor chunk) is only
// worth downloading when the page actually rendered a
// [data-timeline-controls] mount — /listening/ and tag-less listings don't.
// The mount check runs here so the dynamic import (React + impl) is skipped
// entirely on pages without one.

function boot() {
  if (document.querySelector('[data-timeline-controls]')) {
    import('./timeline-controls-impl');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
