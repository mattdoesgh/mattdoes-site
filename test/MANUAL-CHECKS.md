# Manual / browser-only checks

The automated suite (`npm test`) covers build validation, URL safety, feed
standards, structural accessibility (axe in jsdom), token-level contrast,
worker robustness, privacy storage, progressive enhancement, and W3C/lint
coverage. A few things genuinely need a real browser engine and are **not**
automated — running a headless browser in CI was rejected to keep CI fast and
the repo lean. Verify the items below by hand (or in a browser-equipped CI
stage) when touching the relevant code.

This list maps to the audit's "Test and Validation Backlog" rows for
**Keyboard interaction**, **CSP behavior**, and **Performance**, plus the
narrow-viewport row.

## Keyboard interaction (audit findings #7, #8, #9)

- **Tweaks dialog**
  - Open via the footer "tweaks" button with Enter/Space. The native
    `<dialog>` must open modally (`showModal()`): background content is inert,
    focus moves into the dialog.
  - Tab cycles only within the dialog; Shift+Tab wraps backwards.
  - Escape closes the dialog.
  - On close, focus returns to the "tweaks" trigger button (focus restoration).
- **Accent fieldset** — Tab onto the accent radios; arrow keys move between
  the four swatches; the selected swatch shows the colour-independent ink
  ring; the focused swatch shows the `--focus` ring.
- **Filter chips** — on `/journal/`, `/making/`, `/thoughts/`, Tab through the
  filter strip; activating a chip updates `aria-current` and the live region.
- **Permalink actions** — Tab through homepage and blog rows *without a
  pointer*: each row's permalink must become visible on `:focus-within` (no
  tabbing onto an `opacity:0` invisible link). Confirm on a coarse-pointer /
  touch layout that permalinks are persistently visible.
- **Skip link** — Tab once on any page; the "skip to content" link appears and
  jumps focus to `<main id="main">`.

## Dynamic announcements (audit findings #10, #11)

- With VoiceOver / NVDA, activate a tag filter and confirm the `role="status"`
  live region announces the new result count once per filter action.
- Confirm the active nav link and active filter chip are announced as current.

## CSP behavior (audit finding #20)

- Open generated pages in **Chromium** with DevTools open.
  - Confirm whether the inline `<script type="speculationrules">` injected by
    `nav-prefetch.js` is allowed or blocked by the `script-src 'self'` CSP.
  - If it is blocked, confirm `nav-prefetch.js` installs its `rel=prefetch`
    fallback (a `<link rel="prefetch">` appears for hovered/intent links).
  - Watch the console for CSP violation reports.
- Optionally run a report-only CSP experiment before tightening `style-src`
  (Shiki emits inline custom-property styles on highlighted code).

## Performance (audit findings #15, #17)

- **Hidden-tab polling suspension** — open `/listening/`, switch to another
  tab, and confirm in the Network panel that polling to
  `/api/listening/recent` stops while the tab is hidden and resumes (with one
  catch-up tick) on return. Same for the now-playing pill.
- **No duplicate startup requests** — on first load of `/listening/`, confirm
  the startup tick and the `pageshow` handler do not both fire an identical
  request.
- **CLS / LCP** — run Lighthouse (or the Performance panel) on an
  image-heavy article. Confirm the first image is eager-loaded, later images
  lazy, and that images with recorded dimensions reserve layout space (low
  CLS). Decorative map work should be deferred to idle.

## Narrow-viewport layout (audit finding #21)

Test at **320, 375, 768, and 1024** px widths with long content and tables:

- Tables and dense route/schema grids must not overflow horizontally — they
  should scroll within their container or stack.
- When the right-side discovery rail is dropped at tablet width, full
  tag/category discovery must still be reachable.
- The tweaks dialog must be usable at 320 px.

## Notes for maintainers

- `.htmlvalidate.json` keeps `no-inline-style` **off** on purpose: Shiki emits
  `style="--shiki-light:…;--shiki-dark:…"` custom-property declarations on
  every highlighted token. `wcag/h71`, `wcag/h32`, and `no-raw-characters`
  were **re-enabled** after the accent control became a real `<fieldset>` with
  a `<legend>` and authored inline styles were migrated to CSS classes;
  `test/w3c-coverage.test.js` guards that decision.
