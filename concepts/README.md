# Unshared

A preview of `/unshared/`. It is not a verb, and it is not in the sitemap. Production leaves the path offline while `unsharedEnabled` is false. A Pages preview of any branch other than `main` copies the hub and its entries into the output and marks them `noindex`.

## Hub

`/unshared/` is a list. Each row is one entry in `concepts/entries.js`: a slug and a label. The row links to `/unshared/<slug>/`. At rest the row is the label. Hover and keyboard focus open the prefix at the same size, so the line reads `unshared does ambient`. A phone with no hover keeps that prefix clipped and shows `unshared does` once, above the rows. The title is `matt does unshared`. Under it is the list, then the same email, Apple Music, and Spotify links the offline page renders.

Adding a row is one object in `unsharedEntries`, plus a folder `concepts/<slug>/` with an `index.html`. The preview copy fails when that page is missing. A test builds the preview into a temp directory and checks that every entry's href is a file.

## Ambient

`/unshared/ambient/` is a flock inside a cube, caught in a curl-noise wind. The camera starts inside the cube. Thirty-two birds, nine stable dots each, two hundred and eighty-eight particles. Thin pink lines join each bird's dots into a constellation. The pairs are chosen once, so the wireframe does not flicker. Seven of the birds are voices. Each voice is a Web Audio panner at the bird, and the listener sits on the camera, so turning the view pans the flock around you. The picture is canvas 2D with a manual perspective. Lines and dots are drawn in a handful of passes. Motion is a fixed 60Hz step, drawn between steps, so the dots do not blink or jump. There are no audio files and no libraries.

The boundary is the twelve edges of a cube, thin pink lines. Birds stay inside it. A tap selects one bird: its cloud and its lines brighten, a faint trail follows it, its voice comes forward, and the wind can carry it out through the wall. A tap on empty space lets it go, and it steers back inside. After a quiet stretch of twenty to forty seconds the page solos a bird on its own, then another, and a tap pauses that. Birds lean toward the solo or away from it and ease into those sides. The ones with it gather on its flank. The ones against it keep a wider circle. Supporters read a little brighter. Opposers read a little dimmer. Same pink, lower alpha when they are farther away. Faint pink motes ride the same wind.

Nothing is audible until play. The musical body is seven unequal loops, the lengths from Eno's `2/1`: 21, 17, 25, 18, 31, 19.6, and 22 seconds. Each tone stays under a third of its loop. The rest is silence, more than twice the tone. Offsets sit in that silence so the swells do not stack. A slow sine carries the note. Inside the same window a few quiet triangles walk a chord, unevenly, the Hauschildt habit of a held chord and then a sequence that is not a clock. Supporters take unison, a third, a fifth, or an octave from the solo note. Opposers take a sour step away from it: a sharp second, a tone, a tritone, a flat fifth. The room is the Biosphere habit of a dry pair near 55 Hz, a dark feedback delay, and a generated impulse of about five seconds. Under that, a quiet FM pair and a filtered noise bed move with the wind. A grain is rare. Leaving the cube lifts that bird a fifth and opens the filter a little. One finger, or a mouse drag past a small slack, turns the camera and places the pointer in the flock. A shorter touch selects a bird and does not turn the view. Close to a bird, the pointer scatters the flock. Farther away it gathers them. The wheel, a trackpad pinch, or a two-finger pinch zooms. Zooming in is louder, drier, and brighter. Zooming out is distant and washed in the room. The canvas does not scroll or zoom the page. The volume slider starts at 35, and a compressor sits in front of the speakers. Dragging, pinching, or tapping pauses the automatic solo.

Play is a toggle. Stop ramps the master to silence in about 50ms, drops every oscillator and noise source in that play, and disconnects the delay. The next play starts clean. Leaving the page or hiding the tab runs the same stop. Reduced motion holds the birds in place. Their sides still ease, and the sound still plays. A hidden tab stops drawing. The wind, the grains, the impulse, and the FM are generated in the audio context. Nothing is read from a sound file.

## Preview

Pages sets `CF_PAGES` and `CF_PAGES_BRANCH`. It does not set the production branch name, so that name defaults to `main`. The copy runs only when the branch is something else. CI and a local `npm run build` leave `dist/` without `/unshared/`. The copy retargets the stylesheets at `/unshared/tokens.css` and `/fonts/Anton-latin.woff2`, and appends `X-Robots-Tag: noindex` for `/unshared` and `/unshared/*`.

## Mobile Safari

The context stays suspended until the play tap, and `resume()` runs inside that tap. On Safari 16.4 and newer the page sets `navigator.audioSession.type` to `playback`, so the silent switch does not mute Web Audio. Older iOS stays quiet while the ringer switch is on. Stop cancels oscillators that have not started yet, because stopping one before its start time throws and used to leave the rest of the graph running.

## Bundle

`concepts/ambient/ambient.js` is 39,613 bytes, 11,242 bytes gzipped. `concepts/flock-model.js` is 17,231 bytes, 5,072 bytes gzipped. The page loads both. Seven voices. Two hundred and eighty-eight particles.
