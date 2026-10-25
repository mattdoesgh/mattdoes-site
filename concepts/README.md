# Unshared

A preview of `/unshared/`. It is not a verb, and it is not in the sitemap. Production leaves the path offline while `unsharedEnabled` is false. A Pages preview of any branch other than `main` copies the hub and its entries into the output and marks them `noindex`.

## Hub

`/unshared/` is a list. Each row is one entry in `concepts/entries.js`: a slug and a label. The row links to `/unshared/<slug>/`. At rest the row is the label. Hover and keyboard focus open the prefix at the same size, so the line reads `unshared does ambient`. A phone with no hover keeps that prefix clipped and shows `unshared does` once, above the rows. The title is `matt does unshared`. Under it is the list, then the same email, Apple Music, and Spotify links the offline page renders.

Adding a row is one object in `unsharedEntries`, plus a folder `concepts/<slug>/` with an `index.html`. The preview copy fails when that page is missing. A test builds the preview into a temp directory and checks that every entry's href is a file.

## Ambient

`/unshared/ambient/` is a flock. Thirty-two birds, five dots each, one hundred and sixty particles. Seven of the birds are voices. Each voice is a Web Audio panner at the bird, with the listener at the camera. The picture is canvas 2D with a manual perspective. There are no audio files and no libraries.

Nothing is audible until play. Dragging before that only moves the picture. A finger close to a bird scatters the flock. Farther away it draws them in. A tight flock swells on a close chord. A scattered flock plucks an open one. Height picks the tone, speed and turning open the filter, neighbors set the loudness, and distance feeds the room. A dry pair near 55 Hz sits under it. The volume slider starts at 35, and a compressor sits in front of the speakers.

Play is a toggle. Stop ramps the master to silence in about 50ms, drops every oscillator in that play, and disconnects the delay. The next play starts clean. Leaving the page or hiding the tab runs the same stop. Reduced motion holds the flock still and still plays. A hidden tab stops drawing.

The seven loop lengths follow the unequal loops of Eno's `2/1`. The two chords are the Hauschildt habit of a chord, then a sequence that is not a clock. The room is the Biosphere habit of a dark delay and a generated impulse, with no wind, water, or voice.

## Preview

Pages sets `CF_PAGES` and `CF_PAGES_BRANCH`. It does not set the production branch name, so that name defaults to `main`. The copy runs only when the branch is something else. CI and a local `npm run build` leave `dist/` without `/unshared/`. The copy retargets the stylesheets at `/unshared/tokens.css` and `/fonts/Anton-latin.woff2`, and appends `X-Robots-Tag: noindex` for `/unshared` and `/unshared/*`.

## Mobile Safari

The context stays suspended until the play tap, and `resume()` runs inside that tap. On Safari 16.4 and newer the page sets `navigator.audioSession.type` to `playback`, so the silent switch does not mute Web Audio. Older iOS stays quiet while the ringer switch is on. Stop cancels oscillators that have not started yet, because stopping one before its start time throws and used to leave the rest of the graph running.

## Bundle

`concepts/ambient/ambient.js` is 16,541 bytes, 5,203 bytes gzipped. `concepts/flock-model.js` is 6,042 bytes, 1,945 bytes gzipped. The page loads both. Seven voices. One hundred and sixty particles.
