# Site Quality, Accessibility, and Standards Audit

Date: 2026-05-25

Scope: Read-only audit of the static-site generator, templates, shared CSS and
browser scripts, Cloudflare Worker endpoints, security headers, generated
fixture output, and current CI coverage.

Three parallel review tracks were used:

- HTML/W3C and WCAG accessibility review
- Frontend UX, performance, progressive enhancement, and discovery review
- Implementation reliability, security, worker, and testing review

## Baseline Verification

The current repository already includes several good accessibility and quality
foundations:

- A skip link targeting `<main id="main">`.
- `lang="en"` and semantic main/article structures in active templates.
- Labeled primary and footer navigation.
- Global `:focus-visible` styling.
- Reduced-motion handling for the animated map and view transitions.
- A focus trap and Escape handling for the tweaks panel.
- Basic security headers, including CSP, HSTS, framing controls, and a
  referrer policy.

Checks completed during the audit:

| Check | Result | Notes |
| --- | --- | --- |
| `VAULT_DIR=test/fixture-vault npm run build` | Pass | Generated fixture pages successfully. |
| `npm run lint` | Pass | `html-validate` reports no configured HTML violations in `dist/**/*.html`. |

Passing HTML validation does not cover runtime accessibility behavior, CSS
contrast, Atom validity, CSP browser behavior, privacy claims, worker abuse
controls, or application-specific output safety.

## Priority Summary

| Priority | Finding | Primary Area |
| --- | --- | --- |
| P0 | Sanitize Last.fm links rendered on the homepage | Security / output safety |
| P0 | Validate author-supplied slugs and reject route collisions | Security / build reliability |
| P0 | Align location-storage behavior with privacy copy | Privacy / correctness |
| P0 | Bound and validate geo Worker lookups | Abuse prevention / reliability |
| P1 | Correct Atom feed authorship, links, and scrobble identity | Standards / syndication |
| P1 | Repair light-theme contrast and invisible keyboard actions | WCAG |
| P1 | Correct tweaks-panel radio and modal semantics | WCAG / ARIA |
| P1 | Provide non-JavaScript archive behavior | Progressive enhancement |
| P2 | Improve dynamic state announcements, metadata, media, and live updates | Accessibility / UX |
| P2 | Reduce unnecessary polling, animation, preloads, and speculative loading | Performance |

## P0: Security, Privacy, and Reliability Defects

### 1. Homepage Last.fm Links Are Not Safely Rendered

Severity: High

References:

- [`build.js`](../build.js#L360)
- [`build.js`](../build.js#L639)
- [`templates/index.js`](../templates/index.js#L19)
- [`templates/listing.js`](../templates/listing.js#L37)

Last.fm `track.url` values are treated as externally sourced data. The
listening-page renderer applies `safeUrl()` and HTML attribute escaping, but
the homepage uses `entry.url` directly in an `href` attribute. An upstream or
cached value containing an unsafe scheme or attribute-breaking text can
produce an unsafe or malformed homepage link during the build.

Recommended fix:

- Normalize Last.fm URLs through `safeUrl()` before they enter feed entries.
- Escape URLs again where they are emitted into HTML attributes.
- Keep homepage and listening rendering behavior consistent.

Verification:

- Add fixture/cache values including `javascript:alert(1)` and a
  quote-containing attribute payload.
- Confirm generated HTML contains only a harmless fallback link and still
  passes HTML validation.

### 2. Frontmatter Slugs Can Escape Output Boundaries or Collide

Severity: High

References:

- [`build.js`](../build.js#L137)
- [`build.js`](../build.js#L159)
- [`build.js`](../build.js#L166)
- [`build.js`](../build.js#L663)
- [`build.js`](../build.js#L834)

Frontmatter `slug` is accepted verbatim before it becomes both a public URL
component and a filesystem output path. Slugs containing traversal segments,
slashes, quotes, or duplicated route values are not rejected. A bad slug can
write outside the intended route directory, create malformed URLs, or silently
overwrite another generated page while indexes continue to reference both.

Recommended fix:

- Restrict explicit slugs to one validated URL segment.
- Reject traversal markers, separators, unsafe characters, and empty results.
- Assert each resolved output path remains below `DIST_DIR`.
- Detect duplicate public routes and fail the build with source-file context.
- Validate related frontmatter shapes, including dates, tags, aliases, and
  singleton pages such as `about`.

Verification:

- Add negative fixtures for `slug: ../../outside`, quote-containing slugs,
  duplicate routes, invalid dates, and non-array tags.
- Require clear build failures naming the offending note.

### 3. Location Storage Contradicts the User-Facing Privacy Claim

Severity: High

References:

- [`templates/base.js`](../templates/base.js#L136)
- [`static/geo-background.js`](../static/geo-background.js#L22)
- [`static/geo-background.js`](../static/geo-background.js#L390)
- [`static/geo-background.js`](../static/geo-background.js#L401)
- [`static/geo-background.js`](../static/geo-background.js#L440)

The tweaks panel says that coordinates are not stored. In practice,
`saveCachedMine()` writes a `key` containing rounded latitude and longitude to
`localStorage` for up to 30 days. The cached polygon can also be reused without
checking a current permitted location, so a traveler may continue to see the
previous city.

Recommended fix:

- Remove persisted coordinate-derived keys and store only the derived polygon
  if retaining a cache is acceptable.
- Or revise the copy to disclose storage accurately and revalidate cached data
  against a current permitted location.
- Add an explicit way to clear locally cached location data.

Verification:

- Inspect browser storage after choosing `mine`.
- Mock two locations across separate sessions and confirm displayed location,
  stored data, and disclosure all agree.

### 4. Geo Lookups Can Be Abused Through Distinct Cache Misses

Severity: High

References:

- [`workers/geo/src/index.js`](../workers/geo/src/index.js#L44)
- [`workers/geo/src/index.js`](../workers/geo/src/index.js#L51)
- [`workers/geo/src/index.js`](../workers/geo/src/index.js#L80)
- [`workers/geo/src/index.js`](../workers/geo/src/index.js#L105)

The geo Worker rounds and caches each coordinate pair, but its lock only
deduplicates requests for the same rounded key. Callers can vary coordinates
to create unbounded cache misses and trigger Nominatim traffic. Latitude and
longitude values are parsed but not range-validated.

Recommended fix:

- Reject latitude outside `[-90, 90]` and longitude outside `[-180, 180]`.
- Add caller-based rate limiting or an upstream request budget independent of
  the rounded location key.
- Cache negative results and busy/error responses briefly where appropriate.

Verification:

- Add Worker tests for out-of-range values.
- Simulate bursts of distinct coordinate requests and assert upstream call
  volume remains bounded.

## P1: Standards and Accessibility Defects

### 5. Atom Feed Metadata, Link Construction, and IDs Need Correction

Severity: High for broken links; Medium for feed identity completeness

References:

- [`build.js`](../build.js#L639)
- [`build.js`](../build.js#L909)
- [`build.js`](../build.js#L924)

The Atom output has three issues:

- It does not emit feed-level `<author>` metadata or per-entry authors.
- It prefixes each entry URL with `SITE_URL`, even when a listening entry URL
  is already an absolute Last.fm URL, yielding malformed feed links.
- Repeated plays of the same external track can share the same `<id>`, causing
  feed readers to collapse distinct scrobbles.

Recommended fix:

- Emit a feed-level `<author>` block.
- Give listening entries site-owned permalink URLs or correctly preserve
  absolute links without concatenation.
- Generate stable, unique IDs for listening entries from a durable scrobble
  identity or timestamp; consider excluding transient now-playing entries.

Verification:

- Add a feed fixture containing two plays of the same track and an absolute
  external URL.
- Validate the resulting feed with an Atom/feed validator.
- Confirm distinct events have distinct IDs and usable links.

### 6. Light-Theme Accent and Focus Colors Do Not Meet Contrast Targets

Severity: High

References:

- [`static/_shared.css`](../static/_shared.css#L42)
- [`static/_shared.css`](../static/_shared.css#L64)
- [`static/_shared.css`](../static/_shared.css#L106)
- [`static/_shared.css`](../static/_shared.css#L392)
- [`static/_shared.css`](../static/_shared.css#L1151)

The accent palette is used for small text and global focus indicators in light
mode. Measured against the light background during review, the default pink
was approximately `2.33:1`, with the available warm, blue, and green choices
also below `4.5:1` for normal text.

Recommended fix:

- Split decorative accent colors from foreground/focus tokens.
- Define light-theme foreground accents meeting `4.5:1` for normal text.
- Define focus indicator colors meeting at least `3:1` against adjacent
  colors.

Verification:

- Add contrast checks for all light/dark theme and accent combinations.
- Perform keyboard checks of links, buttons, swatches, and filter controls.

Relevant WCAG criteria: 1.4.3, 1.4.11, 2.4.7.

### 7. Permalink Actions Can Receive Invisible Keyboard Focus

Severity: High

References:

- [`static/_shared.css`](../static/_shared.css#L435)
- [`templates/index.js`](../templates/index.js#L19)
- [`templates/blog.js`](../templates/blog.js#L40)

Row action links are set to `opacity: 0` and revealed on hover only. The links
remain keyboard-focusable, so a keyboard user can tab onto an invisible
permalink. Touch users also do not get a reliable hover reveal.

Recommended fix:

- Reveal actions on `.row:focus-within`.
- Show them persistently on touch/coarse-pointer or narrow layouts.
- Consider visible-by-default permalinks where they are core navigation.

Verification:

- Tab through homepage and blog entries without a pointer.
- Test narrow/touch layouts and confirm permalink affordances remain visible.

Relevant WCAG criteria: 2.4.7, 2.4.11.

### 8. Accent Selection Uses an Invalid ARIA Radio Pattern

Severity: High

References:

- [`templates/base.js`](../templates/base.js#L113)
- [`static/tweaks.js`](../static/tweaks.js#L39)
- [`static/tweaks.js`](../static/tweaks.js#L74)

The accent selector advertises `role="radiogroup"` but contains ordinary
buttons using `aria-pressed`. It does not provide `role="radio"`,
`aria-checked`, roving tabindex, or expected arrow-key navigation.

Recommended fix:

- Prefer native `<fieldset>` and radio inputs.
- Alternatively implement the complete ARIA radio-group keyboard and state
  pattern.

Verification:

- Inspect the accessibility tree.
- Test Tab, arrow keys, Space, and announced state using a screen reader.

Relevant WCAG criterion: 4.1.2.

### 9. The Tweaks Panel's Modal Semantics Are Incomplete

Severity: Medium

References:

- [`templates/base.js`](../templates/base.js#L105)
- [`static/tweaks.js`](../static/tweaks.js#L97)
- [`static/tweaks.js`](../static/tweaks.js#L113)

The panel uses `role="dialog"` and `aria-modal="true"` and implements a focus
trap, but does not use native `<dialog>.showModal()` or make page content
inert while the panel is open. Background content can remain available through
pointer interaction or assistive-technology navigation despite the modal
claim.

Recommended fix:

- Prefer native `<dialog>` opened with `showModal()`.
- Or manage `inert` and equivalent accessibility behavior for background
  content while open.

Verification:

- Exercise keyboard, pointer, and screen-reader virtual navigation while the
  panel is open.

### 10. Navigation and Filters Expose Current State Visually Only

Severity: Medium

References:

- [`templates/base.js`](../templates/base.js#L89)
- [`templates/index.js`](../templates/index.js#L80)
- [`templates/blog.js`](../templates/blog.js#L70)
- [`design-system/client/timeline-controls.tsx`](../design-system/client/timeline-controls.tsx)
- [`static/_shared.css`](../static/_shared.css#L171)

Primary navigation and filter chips use an `.on` class whose visible effect is
primarily color. They do not expose current page or selected filter state with
semantic attributes.

Recommended fix:

- Add `aria-current="page"` to active navigation links.
- Represent filter activation using appropriate button/pressed or
  current-state semantics.
- Include a color-independent selected style.

Verification:

- Check state announcements using a screen reader.
- Check visual identification in high contrast and grayscale conditions.

### 11. In-Place Filtering Does Not Announce Updated Results

Severity: Medium

References:

- [`design-system/client/timeline-controls.tsx`](../design-system/client/timeline-controls.tsx)

The filtering script hides and shows entries and updates counts without an
accessible live-region notification. Screen-reader users may not know that
the result set changed.

Recommended fix:

- Add a concise `role="status"` or `aria-live="polite"` result message.
- Ensure one useful announcement occurs per filter action.

Verification:

- Activate filters with VoiceOver or NVDA and confirm the result count and
  selected filter are announced.

Relevant WCAG criterion: 4.1.3.

## P1: Progressive Enhancement and Content Integrity

### 12. Archive Redirects Depend on JavaScript for Their Meaning

Severity: High

References:

- [`static/_redirects`](../static/_redirects#L14)
- [`templates/blog.js`](../templates/blog.js#L70)
- [`design-system/client/timeline-controls.tsx`](../design-system/client/timeline-controls.tsx)

Legacy section pages redirect to `/blog/?kind=...`, while the actual filtering
is performed only in client JavaScript. With scripts disabled, a user reaching
`/blog/?kind=journal`, `/blog/?kind=making`, or `/blog/?kind=thought` sees
the complete archive rather than the requested section.

Recommended fix:

- Generate real filtered archive pages, or retain server-generated
  `/journal/`, `/making/`, and `/thoughts/` index pages.
- Treat client-side filtering as an enhancement over meaningful static URLs.

Verification:

- Browse each redirected and timeline-filtered URL with JavaScript disabled.
- Confirm the returned content represents the requested archive subset.

### 13. Thought Fragment IDs Are Not Stable Under Backdated Content

Severity: Medium

References:

- [`build.js`](../build.js#L568)
- [`build.js`](../build.js#L574)
- [`templates/blog.js`](../templates/blog.js#L41)

Thought IDs are sequential ordinals assigned after chronological sorting.
Adding an older daily note shifts later ordinals and breaks existing fragment
permalinks and feed references.

Recommended fix:

- Derive IDs from stable authored content such as timestamp plus collision
  handling, or support explicit source IDs.

Verification:

- Build a fixture, add one older thought, rebuild, and confirm pre-existing
  fragment identifiers do not change.

### 14. Live Listening UI Cannot Render Legitimate Empty State Updates

Severity: Medium

References:

- [`static/listening-live.js`](../static/listening-live.js#L30)
- [`workers/listening/src/index.js`](../workers/listening/src/index.js#L295)

The client updates playcount only when greater than zero and replaces tracks
only when a non-empty list is returned. A valid empty result or zero count
leaves stale content displayed indefinitely.

Recommended fix:

- Accept successful numeric zero and empty arrays as authoritative updates.
- Preserve old content only for explicitly marked error/fallback responses.

Verification:

- Add browser-script tests for successful empty payloads and error payloads
  carrying `reason`.

## P2: Media, Discovery, Security Hardening, and Performance

### 15. Image and Media Rendering Needs Accessibility and Layout Support

Severity: Medium

References:

- [`build.js`](../build.js#L203)
- [`build.js`](../build.js#L223)

Bare Obsidian image embeds fall back to filenames as alternative text. Images
are lazy-loaded without emitted intrinsic dimensions or responsive sizing
metadata. Audio and video elements have controls but no authoring convention
for captions, transcripts, or descriptions.

Recommended fix:

- Require useful alt text for informative images and support explicit
  decorative `alt=""`.
- Warn or fail during build when informative images lack authored alt text.
- Include width/height information from media processing output to reduce
  layout shifts.
- Support transcript and caption metadata for media containing essential
  speech or visuals.
- Avoid lazy-loading likely above-the-fold hero/LCP media.

Verification:

- Add image, audio, and video fixtures.
- Run accessibility review and measure CLS/LCP for image-heavy articles.

### 16. Shared Document Metadata and Crawl Discovery Are Thin

Severity: Medium

References:

- [`templates/base.js`](../templates/base.js#L59)
- [`build.js`](../build.js#L883)

Pages emit titles but not page-specific descriptions, canonical URL links,
Atom autodiscovery, Open Graph/Twitter metadata, or sitemap/robots output.
Filtered query URLs also risk duplicate indexing if they remain client-only
views.

Recommended fix:

- Add page URL and description data to base rendering.
- Emit canonical links and Atom autodiscovery.
- Add appropriate sharing metadata.
- Generate `sitemap.xml` and a deliberate `robots.txt`.
- Establish canonical behavior for filtered archive URLs.

Verification:

- Inspect generated head markup for all page types.
- Test crawler discovery and social preview rendering.

### 17. Global Animation and Polling Increase Baseline Work

Severity: Medium

References:

- [`templates/base.js`](../templates/base.js#L140)
- [`static/geo-background.js`](../static/geo-background.js#L380)
- [`static/now-playing.js`](../static/now-playing.js#L40)
- [`templates/index.js`](../templates/index.js#L134)

Every page loads shared scripts, fetches decorative map data, may animate many
SVG points, and polls now-playing state. The homepage separately loads live
listening functionality largely to update the scrobble count.

Recommended fix:

- Delay decorative map work until idle or make it an opt-in enhancement.
- Suspend polling while a document is hidden.
- Avoid duplicate initial requests triggered by both startup and page-show
  handling.
- Provide a lightweight endpoint or static-only behavior for the homepage
  count.

Verification:

- Measure network and CPU behavior in foreground and background tabs.
- Run Lighthouse or equivalent performance checks before and after changes.

### 18. Font Preloads May Request Unused or Missing Assets

Severity: Medium; confirm against production deployment

References:

- [`static/_shared.css`](../static/_shared.css#L12)
- [`static/_headers`](../static/_headers#L49)
- [`templates/base.js`](../templates/base.js#L71)

The stylesheet declares JetBrains Mono faces, while the headers also preload a
Fraunces asset not referenced by the reviewed stylesheet. The generated local
fixture output did not contain a `fonts/` directory, so local output requests
font paths that are not available in that build artifact.

Recommended fix:

- Remove unused Fraunces preloads.
- Ensure required font assets are actually shipped in production.
- Preload only the font face needed on the critical render path.

Verification:

- Check production network logs for font `404` responses and unused preload
  warnings.

### 19. Permissions Policy and Inline Styles Limit Security Tightening

Severity: Medium

References:

- [`static/_headers`](../static/_headers#L4)
- [`templates/journal.js`](../templates/journal.js#L55)
- [`templates/listing.js`](../templates/listing.js#L35)
- [`templates/colophon.js`](../templates/colophon.js#L69)

The existing headers provide a strong baseline, but Permissions Policy does
not express the intended geolocation scope or explicitly deny other unused
powerful features. CSP currently permits inline styles, supported by authored
inline presentation and Shiki-rendered code styles.

Recommended fix:

- Specify intended geolocation usage, such as self-only permission.
- Deny unused powerful browser capabilities where practical.
- Migrate authored inline styles into CSS classes.
- Evaluate Shiki output requirements before tightening `style-src`, using a
  report-only CSP stage first.

Verification:

- Run header/security checks.
- Deploy a report-only CSP experiment before enforcement changes.

### 20. Speculation Rules May Conflict With the Current CSP

Severity: Medium; confirm in Chromium

References:

- [`static/nav-prefetch.js`](../static/nav-prefetch.js#L35)
- [`static/nav-prefetch.js`](../static/nav-prefetch.js#L54)
- [`static/_headers`](../static/_headers#L10)

Supporting browsers receive a dynamically created inline
`<script type="speculationrules">`, while the CSP allows scripts only from
`'self'`. If Chromium blocks the inline speculation rules, the script returns
before installing its fallback prefetch behavior.

Recommended fix:

- Configure a CSP-compatible speculation-rules mechanism, or install fallback
  behavior unless rule activation is confirmed.
- Limit speculative requests to strong navigation intent to reduce waste.

Verification:

- Open generated pages in Chromium and monitor CSP violations and speculation
  candidates in developer tooling.

### 21. Dense Content Needs Explicit Narrow-Viewport Review

Severity: Medium; visual confirmation recommended

References:

- [`static/_shared.css`](../static/_shared.css#L219)
- [`static/_shared.css`](../static/_shared.css#L715)
- [`templates/colophon.js`](../templates/colophon.js#L71)

Tables and dense routing/documentation content may overflow at narrow widths,
and the right-side discovery rail disappears at tablet breakpoints.

Recommended fix:

- Add usable overflow or stacked patterns for tables and route grids.
- Preserve access to full tag/category discovery when secondary rails are
  removed.

Verification:

- Test at 320, 375, 768, and 1024 pixel widths using long content and tables.

## Lower-Cost Cleanup Items

### 22. Protocol-Relative External URLs May Miss External-Link Protections

Reference: [`templates/_helpers.js`](../templates/_helpers.js#L34)

The URL allowlist permits protocol-relative URLs, but the helper that emits
external-link relationship attributes appears focused on absolute `http(s)`
URLs. Normalize or classify `//host/path` consistently.

### 23. Hashed-Looking Source Assets Add Deployment and Maintenance Clutter

References:

- [`static/listening-live-34f14954.js`](../static/listening-live-34f14954.js)
- [`static/_headers-cc098ab1`](../static/_headers-cc098ab1)

Generated-looking siblings exist alongside canonical source assets and may be
copied into output despite the build producing fresh hashes. Confirm whether
they remain necessary, and remove or exclude stale artifacts if not.

### 24. Visitor Tweaks Do Not Persist as Ordinary Site Preferences

References:

- [`static/tweaks.js`](../static/tweaks.js#L62)
- [`static/geo-background.js`](../static/geo-background.js#L458)

Theme/accent/map choices are held in memory or communicated to an edit-mode
parent, while ordinary visitors lose choices across navigation. Persisting
non-sensitive preferences would improve usability, provided location-related
storage is disclosed and handled separately.

## Test and Validation Backlog

Current CI builds happy-path fixture content and validates generated HTML:

- [`package.json`](../package.json#L7)
- [`.htmlvalidate.json`](../.htmlvalidate.json#L1)
- [`.github/workflows/build.yml`](../.github/workflows/build.yml#L57)

Recommended additions:

| Area | Test or Check |
| --- | --- |
| URL output safety | Malicious Last.fm links and authored Markdown URL fixtures |
| Build input validation | Invalid and duplicate slug/frontmatter negative fixtures |
| Feed standards | Atom validator and duplicate-scrobble ID fixtures |
| Accessibility | Automated axe checks on generated pages |
| Contrast | Token-level contrast assertions for themes and selectable accents |
| Keyboard interaction | Tweaks panel, filters, permalink visibility, and focus restoration tests |
| Dynamic announcements | Screen-reader-oriented filter/live-region behavior checks |
| Progressive enhancement | Script-disabled blog/archive navigation checks |
| Worker robustness | Geo coordinate range, rate-limit, cache-miss, and negative-cache tests |
| Privacy behavior | Stored-data inspection and travel/location cache behavior tests |
| CSP behavior | Chromium verification for speculation rules and report-only CSP hardening |
| Performance | Network, animation, hidden-tab polling, CLS, and responsive layout testing |
| W3C coverage | Revisit disabled `html-validate` WCAG rules and add CSS/standards checks where useful |

## Suggested Implementation Order

1. Patch homepage external URL rendering and slug/output validation.
2. Correct geo privacy storage and protect the geo Worker.
3. Repair Atom feed generation and add feed tests.
4. Fix contrast, invisible actions, radio semantics, and modal behavior.
5. Restore meaningful no-JavaScript archive routes and stable thought IDs.
6. Improve live-state announcements, live listening empty states, and media authoring.
7. Add page metadata, sitemap/robots output, and security-policy hardening.
8. Tune fonts, prefetching, polling, animation, and narrow-screen behavior.
9. Expand CI so these regressions cannot quietly return.
