# Reader-first editorial projections over the Content model

The homepage and `/thoughts/` previously reused the grammar of `/blog/`: one
reverse-chronological Row stream with tag filters, output counts, density
controls, and timestamp-shaped permalinks. That was internally consistent but
made every kind of writing read like an activity feed. It also spread tag
counting and relationship rules across page renderers.

We decided to keep `/blog/` as the exhaustive archive and add three pure
projections before page rendering:

- `lib/notebook.js` groups Thoughts by Intake's retained `sourceDate`.
- `lib/topic-index.js` owns durable cross-kind Topic paths and related writing.
- `lib/editorial-home.js` selects the featured article, supporting writing,
  Notebook days, and developed Topic paths for the front page.

These modules sit downstream of the Content model and upstream of the React
design system. They do not alter the Vault authoring format, Thought IDs, static
output, or the Row seam recorded in ADR 0010. ArticleRow and ThoughtRow remain in
the design surface, but their implementations now carry distinct visual
grammars. Timeline controls load only on exhaustive archive timelines.

The homepage no longer presents content/scrobble totals. `/listening/` remains
the sole page-level scrobble counter and keeps the byte-equal live Row adapter.

## Considered alternatives

- **Restyle the existing stream** — rejected because equal-weight chronology,
  filters, and counters would preserve the feed model under different paint.
- **Require titles for every Thought** — rejected because it would weaken the
  low-friction daily-note interface. Notebook days supply context instead.
- **Replace Row with new renderers everywhere** — rejected because TimelineRow
  still earns its depth on archives and ADR 0010 keeps the React design surface.
- **Keep query filters as canonical tag destinations** — rejected because a
  filter explains membership, while a Topic path communicates development
  across journal, making, and Thoughts.
