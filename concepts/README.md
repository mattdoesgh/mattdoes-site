# Unshared experiments, three concepts

Static mockups. They are not in the build, the verb registry, or the sitemap. `/unshared/` stays offline while `unsharedEnabled` is false.

Open `/concepts/`, then `log`, `tape`, or `one`. The pages use `site/tokens.css` and the Anton file already on the site. Playback is a silent dummy. Each `<audio>` carries `data-src` for the file on `media.mattdoes.online`, and does not request it.

The entries in `experiments.json` are placeholders. Titles, notes, and tags are fake.

## Log

A reverse-chronological notebook. Each try is a big Anton line, the note and the date beside it, and a small pink waveform you can play in the list.

On a phone the player is a full-width bar under the title, a thumb target instead of a desktop chip. The playing title takes the same hollow stroke as the count numbers.

## Tape

Square black sketches, flush, like the album grid. A phone shows the name on the tile. A desktop shows it on hover, the way a cover does.

Tap a square and the page becomes the watching scene: full-screen black, the waveform on one side, the note on the other, close in the corner. The swap is instant.

## One

One experiment fills the screen. The page name stays alone at the top. A hollow play word and a pink waveform sit in the middle, and the name, note, and tags sit under that.

Arrow keys or a sideways swipe move to the next try. Nothing slides. Prev and next are fixed hit areas.

## Recommendation

Build the log. These are tries, not releases, and the log is the view where the title, the date, the note, and play are all visible without a second tap. The phone layout is its own design, and the desktop layout is a line, which is how this site already sets type.

Keep the tape for later, if a sketch grows a cover and should open like a film. One-at-a-time is the player the log already has, stretched over the rest of the list.

## Adding an experiment

1. Put the mp3 at `content/attachments/unshared/<name>.mp3`.
2. Run `npm run sync-media`. That uploads into the existing `mattdoes-media` bucket with the wrangler version pinned in `workers/`. The public URL is `https://media.mattdoes.online/unshared/<name>.mp3`. The sync deletes a bucket object when its source file is gone, so the mp3 stays in `content/attachments`. No new host.
3. Add an object to `concepts/experiments.json`. `file` is the key from step 2. `date` is `YYYY-MM-DD` (newest sorts first). `shape` is `spike`, `stutter`, or `swell`. `bpm` and `tags` are the line under the note. `seed` is any integer and only changes the drawn waveform.

A real page would read that same list from the unshared renderer. These mock routes would not ship with it.
