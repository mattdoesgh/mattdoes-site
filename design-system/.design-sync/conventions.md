# mattdoes.online design system (@mattdoes/ds)

The component library for mattdoes.online — a minimalist, mono-type, feed-style
personal site. The same components render the real site (as static HTML at build
time) and back these cards, so anything you compose here maps 1:1 to shippable
code.

## Setup & wrapping

- **No provider is required to render.** Components style themselves from the
  global stylesheet (`styles.css`, which loads the site's tokens onto the
  document `html` element). Dark is the default theme.
- **Accent theming:** wrap in `<ThemeProvider accent="pink | warm | blue | green">`.
  The accent is an inherited CSS custom property, so it re-tints the
  accent-colored bits (kind labels, tag chips, the live dot) of everything
  inside. (Light/dark is currently scoped to the document `html` element, so the
  `theme` prop does not yet switch a nested subtree — accent does.)
- **Timeline rows** (`ArticleRow`, `ThoughtRow`, `EmptyState`) are meant to sit
  inside `<section className="timeline">`. The whole-page shell is `<Layout>`
  (top bar + footer + tweaks dialog around your `<main>`). (There is no
  `ListeningRow` component: the `/listening/` rows are owned by the browser Row
  module `templates/rows.js`, which the live updater re-renders byte-for-byte —
  a React mirror can't match that serialization, so it isn't part of the system.)

## Styling idiom — semantic classes + design tokens

This is **not** a utility-class or style-prop system. Components emit fixed,
semantic class names that the stylesheet owns; you do **not** pass `className`
or `style` to restyle them — you compose them and let the CSS do the work. The
class vocabulary you'll see (all defined in the stylesheet):

| Class | Role |
|---|---|
| `.row` / `.gutter` / `.kind` / `.when` / `.body` | one timeline entry: the row, its left gutter, the kind label, the date/meta slot, the content |
| `.timeline` | the column the rows live in |
| `.topbar` / `.home` / `.dim` / `.spacer` / `.status` / `.now-dot` | the top bar: brand mark, dimmed brand suffix, flex spacer, status pill, live dot |
| `.filter` / `.tg` | the filter bar and its tag chips (`.tg` is also a standalone tag chip) |
| `.ident` / `.group` / `.side-left` / `.side-right` / `.meta` | the page rails: identity block, link groups, left/right asides, secondary text |
| `.body.q` / `.permalink` / `.actions` | quote-thought body, a thought's permalink, its action row |

For **your own** layout glue (wrappers, spacing), use the design tokens as
`var(--…)` rather than hardcoded values, so dark/light and accent stay
consistent:

- Surfaces & text: `--bg`, `--surface`, `--ink`, `--mute`, `--faint`, `--rule`, `--hover`
- Accent: `--accent` (decorative — fills, dots) and `--accent-fg` (the
  contrast-safe accent for **text**); plus `--accent-soft`, `--focus`
- Type & metrics: `--font-mono` / `--font-body` (JetBrains Mono), `--fs`, `--lh`,
  and the layout widths `--col`, `--rail`

## Where the truth lives

- **Stylesheet:** read `styles.css` and its import (`_ds_bundle.css` → the site's
  `_shared.css`) for the full token + component CSS before styling anything.
- **Per-component API:** `components/<group>/<Name>/<Name>.d.ts` (props) and
  `<Name>.prompt.md` (usage).

## One idiomatic example

```tsx
import { Layout, ArticleRow, ThoughtRow, StatusPill } from '@mattdoes/ds';

export function BlogTimeline() {
  return (
    <Layout
      topbar={{ active: 'blog', status: <StatusPill text="now: Boards of Canada — Roygbiv" dot live /> }}
      footer={{ footerText: '© 2026 · mattdoes.online' }}
    >
      <main className="page" id="main">
        <section className="timeline">
          <ArticleRow
            url="/making/react-design-system/"
            title="Turning the site into a component library"
            date="2026-06-15T14:20:00.000Z"
            summary="Why the static templates are becoming real React components."
            tags={['react', 'meta']}
            kind="making"
            showKind
          />
          <ThoughtRow date="2026-06-14T16:05:00.000Z" id="t-20260614-1105" tags={['craft']}>
            <p>The best abstraction is the one you can delete in an afternoon.</p>
          </ThoughtRow>
        </section>
      </main>
    </Layout>
  );
}
```
