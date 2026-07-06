# Dual Row authority: React mirrors alongside rows.js, with parity tests as glue

The `.row` DOM contract — the `.row`/`.gutter`/`.body` markup and the
`data-kind`/`data-tags`/`data-featured` attributes — has three consumers:

- `templates/rows.js`, the browser Row module. Sole owner of the
  `/listening/` row bytes: `static/listening-live.js` swaps rows it renders
  from this module against the server output, so the server page must
  byte-equal it (ADR 0001, ADR 0005).
- The design-system mirrors `TimelineRow`/`ArticleRow`/`ThoughtRow`, which
  render the article and thought rows on every built page and carry the
  `.row` visual language into the Claude Design surface (ADR 0003).
- The timeline-controls filter island
  (`design-system/client/timeline-controls-impl.tsx`), coupled to the
  contract from the read side: it selects `.row[data-tags]` and filters on
  `dataset.tags`/`dataset.kind`.

That is two writers of one contract — a standing drift risk. The strategic
alternative, making `rows.js` the **sole** Row authority (React pages inject
its output as raw HTML for every kind, the way `/listening/` already does),
would collapse the duplication. We considered it and **rejected it for now**:

- It pushes against ADR 0003/0005. The article/thought rows would leave the
  React design surface — no longer components, no longer editable or synced
  to Claude Design — hollowing out the "one source, renders the site AND is
  the design system" premise for the site's most common visual element.
- The byte-equal constraint that forces `rows.js` ownership is real only for
  `/listening/` (the innerHTML-swap live updates). The other rows have no
  in-browser re-render path, so string-injecting them buys nothing beyond
  deduplication.

**Decision: keep the dual authority, and hold it together with tests instead
of a single writer.** The glue is:

- `test/row-parity.test.js` — the server-rendered listening rows byte-equal
  `listeningRow()`/`emptyState()` output, and dist ships the module graph
  the live updater needs.
- `test/timeline-controls.test.js` — the built pages keep the
  `data-kind`/`data-tags` attributes (and the featured flag) the filter
  island selects on, from whichever renderer emitted them.

Reopen trigger: parity drift actually biting — a visual or behavioral
divergence between a React row and its `rows.js` counterpart that the tests
above missed, or a `.row` change that has to be made twice and ships wrong
once. Until that happens, the cost of the duplication is two small renderers
kept honest by tests, which is cheaper than losing the design surface.
