// lib/sections.js — the Section descriptor: one static table for the
// timeline sections, folding together the spellings that used to live
// separately in Intake's routeFor/PUBLISH_KINDS, the sitemap's static
// routes (lib/emit/feeds.js), and Emit's per-section listing pages.
//
// Static data only — Intake imports this, so it must stay pure (no
// fs/env/clock). Two consumers deliberately do
// NOT import it because of their own runtime constraints, and are pinned
// to it by test/sections.test.js instead:
//   - templates/rows.js ships to the browser and may import only
//     ./_helpers.js, so its emptyState copy map stays inline there;
//   - design-system/ssg/ builds as a separate package (its own tsconfig
//     rootDir), so its SECTION_PATH maps stay inline there.

export const SECTIONS = Object.freeze({
  listening: Object.freeze({
    route: '/listening/',
    publishKind: false, // never a vault kind — fed by the Listening snapshot
    articlePages: false,
    emptyState: 'No scrobbles yet — check back after a listen.',
  }),
});

// Journal and making stay valid `publish:` values so an older vault still
// builds. They are not sections: no listing, no per-note page, no feed.
// Thoughts are the same kind of retired vault value.
export const RETIRED_PUBLISH_KINDS = Object.freeze(['journal', 'making', 'thoughts']);
