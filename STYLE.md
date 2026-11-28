# Style

`site/tokens.css` is the source. Pages use `var(--token)`. The build keeps the polarity colors, the font stacks, `--row-size`, and the safe-area edges as custom properties and inlines the rest, so the shipped CSS stays inside the size budget. A raw color, font family, or font size outside that file fails `npm run check:tokens`.

## Palette

- `--black` `#000000`
- `--white` `#ffffff`
- `--pink` `#F7C8D8`
- `--mint` `#CDEEE2`, `--violet` `#A99BFF`, `--bone` `#F1EEF8`, `--dim` `#8A96A2`, `--veil` black at 0.8

Home is the ether: glyphs on black. Mint is the field of characters, pink the name, the water line and the outer ring, violet the inner ring and the star, bone the sigil and the prompt, dim the log and the prompt's comments. Letterboxd and Unshared join the ether (`data-polarity="ether"`): bone type on black, a violet focus ring, mint hairlines. birds1 still flips to black type on a pink field (`--field`, `--ink`, `--focus`, `--rule`).

## Type

- `--display` — Anton, then Arial Narrow, Helvetica Condensed, Impact, sans-serif
- `--body` — system-ui, sans-serif
- `--mono` — ui-monospace, then Cascadia Mono, Segoe UI Mono, Menlo, Consolas, monospace
- `--weight-regular` — 400
- Sizes are the `--type-*` scale in `site/tokens.css`. Each step is a `clamp()` of rem and vw, so type grows with the window and with text zoom. `--row-size` is the desktop row.
- Tracking is `--track-none` (0), `--track-stars` (0.06em), `--track-label` (0.08em). Kickers and flags use `--track-label`.

## Space and edges

Spacing is the `--space-*` scale, fluid `clamp()` values of rem and vw. Borders are `--line-*`. Focus rings are `--outline-*`. Radius is `--radius` (0). Hit targets are `--hit` (44px floor) and `--hit-phone` (48px floor); both grow on a wide window. Page edges are `max()` of that padding and `env(safe-area-inset-*)`. Those `env()` calls stay in `site/tokens.css`. A device with no inset keeps the padding it had.

## The ether

- Everything on home is characters on the void. The scene is drawn in glyphs, not shapes.
- Home is one screen with the socials at its foot, above a phone's browser bar. On a narrow screen the name breaks into two lines, one on the water and one under it, so it stays readable.
- Every summoning is random: a new sigil and a new star each time. Nothing is seeded by the word.
- No explanation on the page. The prompt is `> invoke` and the words; a visitor finds the spell line by typing.
- Typed spells pass a ward first. Slurs, severe profanity and sexual words are refused: the circle summons noise and the line reads `✗ refused`. The word never reaches the log.
- What a visitor types stays in the page.
- A verb page is crowned by a glyph band: a smaller circle ringed by the page's word, a new star and sigil each visit, a press summons another. `static/ether.js` draws it, and the band thins into the void at its foot. The name stays the pink cut word, everything else is quiet mono with no prompt marks. Films, covers and titles condense out of the field as they scroll into view, unless motion is reduced. On Unshared the song titles run as one litany, a violet star between each.

## Standing rules

- Pink `#F7C8D8` on black.
- Lowercase `matt does <verb>` labels. The data source is named plainly.
- No grid lines. No numbering. No flavor text outside the ether.
- No subheading or standfirst under a page title or a section heading. `h1.sign` goes straight into the content.
- No unfold or wipe animations.
- Hover hit areas stay stable.
- The phone layout stays clean.
- Star ratings are black-filled stars with a pink outline. A half star is a clipped ★.
- "matt does" shows only on hover for home links.
