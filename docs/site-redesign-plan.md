# Content-first site redesign plan

## Objective

Make mattdoes.online feel like a calm personal publication instead of a dashboard. The redesign should reduce the amount of simultaneous information, remove visible copy that explains what pages are for, and let titles, content, dates, and navigation establish meaning.

The site should retain its dark, typographic identity and small personal details without asking a visitor to decode multiple rails, labels, counts, filters, and calls to action at once.

## Design principles

1. **Content explains the page.** Keep page names and authored content; remove subtitles, bios, kickers, and helper text that restate the route.
2. **One dominant reading path.** Use a single primary column on most pages. Secondary navigation belongs after the content or behind a deliberate control.
3. **One purpose per screen.** The homepage introduces and starts reading; archives browse; search searches; articles read.
4. **Progressive disclosure.** Show filters, related links, source details, build statistics, and customization only when requested or when the reader reaches the end.
5. **Metadata earns its place.** Prefer date and, when useful, content kind. Hide counts, read time, tags, source paths, and repeated labels by default unless they help make a decision.
6. **Atmosphere stays behind content.** Preserve the geo treatment as an optional signature, but reduce its default contrast and movement so it never reads as another layer of information.

## Information architecture

### Primary navigation

Reduce the persistent navigation to:

- writing
- thoughts
- listening
- about

The wordmark links home. Move search to a compact control at the end of the primary navigation. Move RSS, colophon, and contact to the footer. Remove `making` from the global navigation; it remains a writing section and archive filter.

On narrow screens, use one compact menu rather than a horizontally scrolling list of every destination.

### Shared page frame

- Replace the three-column `rail / content / rail` grid with a centered reading column, approximately 680–760px wide.
- Remove `IdentityRail` from standard pages. Re-home the few useful items it contains at the end of the relevant page.
- Reserve side-by-side layout for content that genuinely benefits from comparison, not for page descriptions or link lists.
- Simplify the header to wordmark, primary navigation, search, and the optional now-playing status. Keep the status quiet and allow it to disappear first on smaller screens.
- Simplify the footer to copyright, RSS, colophon, contact, external profiles, and the tweaks control.
- Reduce the number of rules, boxed regions, uppercase/letter-spaced labels, hover washes, and accent edges visible in one viewport.
- Lower the default geo-background opacity substantially or confine it to the top of the homepage. Keep “off” and alternate treatments available in tweaks.

## Page-by-page redesign

### Home `/`

**Role:** a quiet front door and a quick path into the work.

- Remove both side rails: “currently exploring,” “keep reading,” and “elsewhere.”
- Remove the “front page” kicker, “writing worth starting with” heading, explanatory lede, and both hero action buttons.
- Use a compact intro: wordmark/name and, at most, one short personal line. Do not explain the site taxonomy.
- Make the latest or intentionally featured article the dominant first item, but render it as open editorial typography rather than a bordered card.
- Follow with 3–5 recent items in one consistent list. Mix journal, making, and thoughts only if the visual treatment remains calm; otherwise show writing only.
- End with one understated link to the full writing archive. External links belong in the footer.
- Do not show topic counts, multiple notebook days, duplicated archive links, or tags above the fold.

**Decision to validate in a prototype:** latest-first versus manually featured lead story. Default recommendation: latest substantial article, with a frontmatter override available later only if editorial control proves useful.

### Writing `/blog/`

**Role:** browse all authored work.

- Use a simple `writing` title followed immediately by the list.
- Remove the left-rail bio/stats, header lede, subscribe rail, and repeated archive explanation.
- Default to a clean chronological list with date, title or excerpt, and a subtle kind marker only where the content type is otherwise ambiguous.
- Replace the always-expanded filter banner and density controls with a single `filter` button or compact segmented choice. Reveal tags only after the visitor asks to filter.
- Put RSS once at the bottom of the archive or in the global footer.

### Journal `/journal/`

**Role:** the long-form writing archive.

- Show `journal` and the entries. Remove the rail bio, post count, archive intro, external links, and duplicated `journal` kicker.
- Favor title, date, and summary. Keep read time only if it helps distinguish genuinely long pieces.
- Collapse tag filtering behind the same archive filter pattern used on `/blog/`.

### Making `/making/`

**Role:** project and build notes.

- Show `making` and the entries. Remove “building in public” explanations, stats, external links, and repeated page labels.
- Let project names, summaries, and dates communicate the section.
- If project state becomes useful, add a small status such as active or shipped; do not add generic explanatory copy.

### Thoughts `/thoughts/`

**Role:** short notes grouped by day.

- Rename the visible heading simply to `thoughts` or `notebook`; choose one term and use it consistently in navigation, heading, metadata, and links. Recommendation: `thoughts` in navigation and page title; retain “notebook day” only as an internal model term.
- Remove “thoughts, in context,” its explanatory lede, the left-rail explanation/stats, external links, and the topic rail.
- Keep day grouping, because the structure itself communicates context.
- Reduce per-thought chrome to prose, time when useful, and a quiet permalink affordance.
- Offer related topics at the end of a thought/day only when there is a strong connection.

### Listening `/listening/`

**Role:** show what is playing and what played recently.

- Lead with current track state, then the recent track list.
- Remove the page bio, “live log” intro, Last.fm implementation explanation, external-link rail, and large lifetime scrobble statistic from the primary view.
- Keep attribution to Last.fm as a small source link after the list.
- Retain live updates and the existing row byte-parity contract; redesign the shared listening-row markup/CSS and browser renderer together.

### Search `/search/`

**Role:** accept a query and return results.

- Remove the identity rail, kicker, offline/index explanation, and empty visual scaffolding.
- Use a visible `search` heading, a prominent input, and results in the same visual grammar as writing entries.
- Show usage guidance only after an unsuccessful query, where it becomes relevant.
- Preserve the static-index and offline behavior without advertising the implementation in the visible interface.

### Topic paths `/topics/<topic>/`

**Role:** show entries connected to one topic.

- Use the topic name as the title and list connected entries beneath it.
- Remove “idea path” terminology from visible UI, the meaning-vs-date explanation, count card, kind summary, and “other paths” rail.
- Put a short list of related topics after the entries, or omit it when the relationships are weak.
- Keep `Topic path` as an internal domain term; public language should just use the topic name.

### Article pages `/journal/<slug>/` and `/making/<slug>/`

**Role:** uninterrupted reading.

- Remove the left rail, recent-post list, post count, and right related rail.
- Keep kind, publication date, title, summary when authored, and body in one column.
- Move tags, source path, word count, updated date, and related reading to a restrained end matter block. Hide internal vault paths from the public page unless they serve a clear reader need.
- Replace the two-column older/newer pager with a simple end-of-article continuation: one next recommendation plus an archive link.
- Make article body typography the strongest and most spacious surface on the site.

### About `/about/`

**Role:** introduce Matt and provide ways to connect.

- Keep the authored About content as the page.
- Remove the identity rail, duplicated bio, and generic external-links block from the side.
- Put selected contact and profile links after the authored content, where they follow naturally from the introduction.
- Avoid a second summary if the opening paragraph already performs that job.

### Colophon `/colophon/`

**Role:** document how the site is made for readers who deliberately seek it.

- Keep the technical depth; this page is allowed to be information-dense because that is its chosen purpose.
- Remove the long rail summary, stack inventory rail, and build-stat rail from the opening viewport.
- Use a single-column document with a compact table of contents. Move build stats to a small section inside the document and remove any inventory already explained in prose.
- Keep colophon out of primary navigation and link it from the footer.

## Copy removal rules

Remove visible copy when it does one of the following:

- repeats the page title or navigation label;
- explains that an archive is reverse chronological;
- translates obvious labels such as journal → essays or RSS → subscribe;
- describes implementation details on a reader task page;
- explains an internal content model term such as “idea path” or “notebook context”;
- reports counts without helping a visitor choose what to read.

Keep copy when it is authored content, a useful summary of an individual article, an empty/error state, accessibility text, or document metadata. SEO descriptions can remain in `<head>` even when equivalent visible ledes are removed.

## Delivery sequence

### Phase 1 — approve the reduced system

1. Make low-fidelity desktop and mobile prototypes for the homepage, writing archive, article page, and thoughts page.
2. Validate three decisions: homepage lead-story rule, `thoughts` versus `notebook`, and the collapsed filter interaction.
3. Define the shared visual tokens: content width, spacing scale, type hierarchy, rule usage, surface usage, and geo-background default.

These four surfaces establish nearly every reusable pattern needed by the remaining pages.

### Phase 2 — simplify shared chrome

1. Reduce `Topbar` navigation and create the narrow-screen menu.
2. Replace the three-column page grid with content-first shells.
3. Retire `IdentityRail` and most `RailSection` usage.
4. Consolidate external links and secondary destinations in `Footer`.
5. Quiet the geo background, motion, hover overlays, borders, and accent treatments.

### Phase 3 — rebuild the primary reading flow

1. Redesign `IndexPage` around one lead and one recent list.
2. Redesign `ArticlePage` as a single reading column with end matter.
3. Redesign `BlogPage` and `ListingPage` around a shared archive header, list, and disclosed filters.
4. Redesign `ThoughtsPage` around day groups without explanatory chrome.

### Phase 4 — simplify utility and secondary pages

1. Redesign Listening while preserving live-update parity.
2. Simplify Search and its empty/no-results states.
3. Simplify Topic pages and move related topics after content.
4. Flatten About and Colophon into single-column documents.

### Phase 5 — copy and consistency audit

1. Delete or empty obsolete section `bio` and `intro` values in `site.config.js`.
2. Search rendered pages for duplicate titles, explanatory ledes, counts, and repeated link groups.
3. Verify that terminology is consistent across navigation, headings, URLs, feeds, metadata, and empty states.
4. Check every viewport for one obvious first action and no more than one visually dominant content region.

## Verification and acceptance criteria

### Visual

- At 1440px, the homepage has one dominant column and no persistent side rails.
- The first viewport contains no more than the header, compact intro, and one primary content item.
- Every page has one clear title and no adjacent sentence explaining the title.
- Borders, cards, accent edges, and background geometry do not compete with article titles or body text.
- Mobile navigation does not rely on horizontal scrolling.

### Content and interaction

- Every current public route remains reachable.
- Writing kinds and tags remain discoverable without occupying the default archive view.
- Search, live listening updates, theme/accent preferences, RSS, and contact remain functional.
- Article and thought permalinks remain stable.
- The redesign does not change the Vault → Note record → Intake → Content model → Emit pipeline; it changes the React presentation and the projections only where the new homepage selection requires it.

### Accessibility and quality

- Maintain one meaningful `<h1>`, skip navigation, visible keyboard focus, semantic landmarks, and reduced-motion behavior on every page.
- Re-run build validation, accessibility, contrast, section, editorial-home, timeline-control, row-parity, progressive-enhancement, and asset-budget tests.
- Update tests that currently require homepage action copy, visible archive explanations, rail content, or always-visible timeline controls so they assert the redesigned user outcome instead of the old markup.
- Add rendered-page assertions that visible headers do not repeat explanatory copy and that primary content precedes optional navigation in DOM order.
- Perform manual visual checks at mobile, tablet, laptop, and wide desktop widths in both themes.

## Scope boundary

This redesign should not rewrite Intake, feeds, search indexing, Worker behavior, CSP, or the publishing model. It is principally a design-system and page-composition change. The one likely projection change is `lib/editorial-home.js`, depending on the approved homepage lead and recent-item policy.
