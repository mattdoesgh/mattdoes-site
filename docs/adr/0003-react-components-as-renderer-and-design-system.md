# React components as the build-time renderer and design system

> **Status update:** the migration described here is complete — every public page
> now renders through the React design system and `lib/emit.js` no longer calls
> the `templates/*.js` page functions. See **ADR 0005** for the cutover details
> (document shell, the SSG bundle, the listening-row exception). The text below is
> the original decision record.

The site's presentation layer is migrating from the `templates/*.js`
template-literal functions to a React + TypeScript component library under
`design-system/` (`@mattdoes/ds`). The library serves two roles from one source
of truth: it renders the site's pages to **static HTML at build time** (via
`renderToStaticMarkup`), and it is the component set uploaded to Claude Design
(claude.ai/design) so the UI can be edited visually and recomposed by Claude and
other agents. The motivation is templateability: discrete, typed components with
documented props are something an agent can pick up and modify far faster than a
web of interpolated template strings.

This reverses the project's "no framework, no templating engine" stance — but
only for the presentation layer, and deliberately narrowly:

- **Content stays in the Obsidian vault.** `lib/intake.js` (vault → content
  model) is untouched; React changes only how the model becomes HTML.
- **Output stays static.** Pages are rendered at build time to the same static
  HTML, hosted on Cloudflare Pages. No client-side React, no hydration. The
  vanilla enhancement scripts (`static/*.js`), the two edge Workers, the CSP
  (`connect-src 'self'`), RSS/sitemap, and asset hashing are all unchanged.
- **The look is unchanged.** Components emit the exact same class names as the
  templates and reuse `static/_shared.css` verbatim (re-exported as the
  library's stylesheet). Only the markup-producing layer is duplicated, in JSX.

Fidelity is verified by rendering the same data through both the original
`templates/blog.js` and the React `BlogPage` and diffing the normalized bodies
(`design-system/ssg/render.tsx`). The outputs are equivalent modulo
HTML5-equivalent React serialization (void-element self-closing, `&#x27;` for
`'`, empty-string boolean attributes); there are no structural or content
differences. "Byte-identical dist" is therefore relaxed to **semantic + visual
equivalence** for React-rendered pages — the one place the project's usual
byte-discipline cannot hold, because React controls serialization.

The migration is incremental: the foundational slice ports the core components
(Layout/Topbar/Footer/StatusPill/the Row family/Tag/Time/TweaksDialog/
ThemeProvider) and proves one real page end-to-end. Remaining pages and the
swap of `build.js`/`lib/emit.js`'s HTML emission for the React renderer follow
page by page.

One known limitation to resolve during the migration: the design tokens in
`static/_shared.css` are scoped to the document `html` element (dark default,
`html[data-theme="light"]` override). `ThemeProvider` can switch the inline
`--accent` (an inherited custom property) on a wrapper, but cannot switch
light/dark on a nested subtree until the token sets are also scoped to a
`.ds-root` wrapper. That scope-widening is the prerequisite for full per-subtree
theming in Claude Design previews.

## Considered Options

- **Keep the template-literal templates** — lowest churn, preserves the
  no-framework purity. Rejected: interpolated strings are exactly what is hard
  for Claude Design and other agents to recompose; there is no component
  boundary, prop contract, or visual editing surface.
- **Adopt a client framework / meta-framework (Next, Astro, Vite SSR)** —
  conventionally "templateable" with routing and hydration. Rejected: it changes
  hosting and the build, ships client JS, and puts the CSP, no-tracker, and
  performance guarantees at risk for no presentation benefit the build-time SSG
  doesn't already give.
- **A standalone React "mirror" that only feeds Claude Design** — a component
  library that never renders the real site. Rejected: it creates a second source
  of truth that silently diverges from the shipping templates, so designs made
  in Claude Design would no longer map to what the site actually renders. Making
  the components render the real site is what keeps the mapping honest.
