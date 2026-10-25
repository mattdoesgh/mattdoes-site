# Style

`site/tokens.css` is the source. Pages use `var(--token)`. The build keeps the polarity colors, the font stacks, and `--row-size` as custom properties and inlines the rest, so the shipped CSS stays inside the size budget. A raw color, font family, or font size outside that file fails `npm run check:tokens`.

## Palette

- `--black` `#000000`
- `--white` `#ffffff`
- `--pink` `#F7C8D8`

Home is pink on black. A verb page flips to black type on a pink field (`--field`, `--ink`, `--focus`, `--rule`).

## Type

- `--display` — Anton, then Arial Narrow, Helvetica Condensed, Impact, sans-serif
- `--body` — system-ui, sans-serif
- `--mono` — ui-monospace, then Cascadia Mono, Segoe UI Mono, Menlo, Consolas, monospace
- `--weight-regular` — 400
- Sizes are the `--type-*` scale in `site/tokens.css`. Each step is a `clamp()` of rem and vw, so type grows with the window and with text zoom. `--row-size` is the desktop row.
- Tracking is `--track-none` (0), `--track-stars` (0.06em), `--track-label` (0.08em). Kickers and flags use `--track-label`.

## Space and edges

Spacing is the `--space-*` scale, fluid `clamp()` values of rem and vw. Borders are `--line-*`. Focus rings are `--outline-*`. Radius is `--radius` (0). Hit targets are `--hit` (44px floor) and `--hit-phone` (48px floor); both grow on a wide window.

## Standing rules

- Pink `#F7C8D8` on black.
- Lowercase `matt does <verb>` labels. The data source is named plainly.
- No grid lines. No flavor text. No numbering.
- No unfold or wipe animations.
- Hover hit areas stay stable.
- The phone layout stays clean.
- Star ratings are black-filled stars with a pink outline. A half star is a clipped ★.
- "matt does" shows only on hover for home links.
