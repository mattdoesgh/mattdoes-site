# Unshared

`/unshared/` is published and indexed, and it stays off the home menu. The sitemap lists the hub and `/unshared/birds1/`. `unsharedEnabled` in `site/verbs.ts` turns the pages on. Unshared has no socials or mailbox.

Add a row in `concepts/entries.js`, a `concepts/<slug>/` page (`index.html` and a stylesheet), and that path in `sitemapPaths()`. Publish fails if the page or stylesheet is missing.

`npm run build` copies the hub and birds1 into `dist/unshared/` and retargets stylesheets at `/unshared/tokens.css` and `/fonts/Anton-latin.woff2`. birds1 uses live Web Audio only. There are no audio files.
