---
publish: journal
title: Reader features fixture
date: 2026-01-03
summary: Exercises syntax highlighting, callouts, footnotes, and tables so CI sees the new code paths.
tags: [meta, ci]
---

A short paragraph above the test fixtures, so the surrounding rhythm gets exercised too.

## syntax highlighting

```js
const greet = (name) => `hello, ${name}`;
console.log(greet('world'));
```

```bash
echo "fence without a language falls back to plaintext"
```

## callouts

> [!note]
> A note callout with no title — body only.

> [!warning] watch your step
> A warning callout with a title row.

> [!tip]
> Tips render in the success/green family. Multiple body lines work too;
> the markdown parser folds them into one paragraph the way it would
> inside a regular blockquote.

## footnotes

A sentence with a footnote reference[^one] inline. A second reference[^two] later in the paragraph.

[^one]: First footnote body.
[^two]: Second footnote body, with more text to verify wrapping.

## tables

| key       | type   | required | description                                      |
| --------- | ------ | -------- | ------------------------------------------------ |
| `publish` | enum   | yes      | journal · thoughts · making · draft              |
| `title`   | string | no       | display title; defaults to the filename          |
| `summary` | string | no       | one-sentence lede shown in the index and the rss |

## a plain blockquote (control)

> This is a regular blockquote, not a callout. It should pick up the
> italic mono style from PR #2.
