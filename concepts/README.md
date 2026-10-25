# Unshared

A preview of `/unshared/`. It is not a verb, and it is not in the sitemap. Production leaves the path offline while `unsharedEnabled` is false. A Pages preview of any branch other than `main` copies the hub and its entries into the output and marks them `noindex`.

## Hub

`/unshared/` is a list. Each row is one entry in `concepts/entries.js`: a slug and a label. The row links to `/unshared/<slug>/`. At rest the row is the label. Hover and keyboard focus open the prefix at the same size, so the line reads `unshared does ambient`. A phone with no hover keeps that prefix clipped and shows `unshared does` once, above the rows. The title is `matt does unshared`. Under it is the list, then the same email, Apple Music, and Spotify links the offline page renders.

Adding a row is one object in `unsharedEntries`, plus a folder `concepts/<slug>/` with an `index.html`. The preview copy fails when that page is missing. A test builds the preview into a temp directory and checks that every entry's href is a file.

## Ambient

`/unshared/ambient/` is a flock inside a cube, caught in a curl-noise wind. Thirty-two birds, five stable dots each, one hundred and sixty particles. Seven of the birds are voices. Each voice is a Web Audio panner at the bird, and the listener sits on the camera, so turning the view pans the flock around you. The picture is canvas 2D with a manual perspective. Motion is a fixed 60Hz step, drawn between steps, so the dots do not blink or jump. There are no audio files and no libraries.

The boundary is the twelve edges of a cube, thin pink lines. Birds stay inside it. A tap selects one bird: its dots brighten, its voice comes forward, and the wind can carry it out through the wall. A tap on empty space lets it go, and it steers back inside. Faint pink motes ride the same wind.

Nothing is audible until play. The wind is filtered noise, louder when the gust rises. Each bird is a pair of oscillators in FM, with a short noise grain when the air is rough. Pitch shifts with how fast the bird approaches the listener. Leaving the cube makes that bird brighter, less stable, and drier. One finger, or a mouse drag past a small slack, turns the camera and places the pointer in the flock. A shorter touch selects a bird and does not turn the view. Close to a bird, the pointer scatters the flock. Farther away it gathers them. The wheel, a trackpad pinch, or a two-finger pinch zooms. Zooming in is louder, drier, and brighter. Zooming out is distant and washed in the room. The canvas does not scroll or zoom the page. A dry pair near 55 Hz sits under it. The volume slider starts at 35, and a compressor sits in front of the speakers.

Play is a toggle. Stop ramps the master to silence in about 50ms, drops every oscillator and noise source in that play, and disconnects the delay. The next play starts clean. Leaving the page or hiding the tab runs the same stop. Reduced motion holds the flock still and still plays. A hidden tab stops drawing.

The note choices still follow the unequal loops of Eno's `2/1` and the Hauschildt habit of a chord, then a sequence that is not a clock. The room is the Biosphere habit of a dark delay and a generated impulse. The wind, the grains, and the FM are generated in the audio context. Nothing is read from a sound file.

## Preview

Pages sets `CF_PAGES` and `CF_PAGES_BRANCH`. It does not set the production branch name, so that name defaults to `main`. The copy runs only when the branch is something else. CI and a local `npm run build` leave `dist/` without `/unshared/`. The copy retargets the stylesheets at `/unshared/tokens.css` and `/fonts/Anton-latin.woff2`, and appends `X-Robots-Tag: noindex` for `/unshared` and `/unshared/*`.

## Mobile Safari

The context stays suspended until the play tap, and `resume()` runs inside that tap. On Safari 16.4 and newer the page sets `navigator.audioSession.type` to `playback`, so the silent switch does not mute Web Audio. Older iOS stays quiet while the ringer switch is on. Stop cancels oscillators that have not started yet, because stopping one before its start time throws and used to leave the rest of the graph running.

## Bundle

`concepts/ambient/ambient.js` is 33,378 bytes, 9,562 bytes gzipped. `concepts/flock-model.js` is 13,536 bytes, 4,124 bytes gzipped. The page loads both. Seven voices. One hundred and sixty particles.
