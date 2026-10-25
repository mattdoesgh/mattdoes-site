# Unshared

A preview of `/unshared/`. It is not a verb, and it is not in the sitemap. Production leaves the path offline while `unsharedEnabled` is false. A Pages preview of any branch other than `main` copies the hub and its entries into the output and marks them `noindex`.

## Hub

`/unshared/` is a list. Each row is one entry in `concepts/entries.js`: a slug and a label. The row links to `/unshared/<slug>/`. At rest the row is the label. Hover and keyboard focus open the prefix at the same size, so the line reads `unshared does ambient`. A phone with no hover keeps that prefix clipped and shows `unshared does` once, above the rows. The title is `matt does unshared`. Under it is the list, then the same email, Apple Music, and Spotify links the offline page renders.

Adding a row is one object in `unsharedEntries`, plus a folder `concepts/<slug>/` with an `index.html`. The preview copy fails when that page is missing. A test builds the preview into a temp directory and checks that every entry's href is a file.

## Ambient

`/unshared/ambient/` is a flock inside a cube, caught in a slow curl-noise wind. The view is fixed, corner-on, straight down the body diagonal, so the outline is a regular hexagon and the three near edges meet in the middle. It does not turn. Orthographic projection keeps that hexagon regular. It is centered and sized to the canvas. Pinch or the wheel scales it and leaves the angle alone. Thirty-two birds, nine dots each, two hundred and eighty-eight particles. The dots sit wide, and thin pink lines join them into an airy constellation. The pairs are chosen once, so the wireframe does not flicker. Seven of the birds are voices. Each voice is a Web Audio panner at the bird, and the listener sits on the same diagonal as the picture. The picture is canvas 2D. Lines and dots are drawn in a handful of passes. Motion is a fixed 60Hz step, drawn between steps, so the dots do not blink or jump. There are no audio files and no libraries.

The boundary is the twelve edges of a cube, thin pink lines. Birds stay inside it, spread through the volume. A tap selects one bird: its cloud and its lines brighten, a faint trail follows it, its voice comes forward, and the wind can carry it out through the wall. A tap on empty space lets it go, and it steers back inside. After a quiet stretch of fifty to ninety seconds the page solos a bird on its own, then another, and a tap, drag, or pinch pauses that. Birds lean toward the solo or away from it and ease into those sides. The ones with it gather on its flank. The ones against it keep a wider circle. Supporters read a little brighter. Opposers read a little dimmer. Same pink, lower alpha when they are farther away. Faint pink motes ride the same wind. A drag still places a finger in the flock. Close to a bird, that finger scatters them. Farther away it gathers them. It does not turn the cube.

Nothing is audible until play. The musical body is seven unequal loops in the ratios of Eno's `2/1`, stretched to 32.55, 26.35, 38.75, 27.9, 48.05, 30.38, and 34.1 seconds. Each tone stays under a fifth of its loop. The rest is silence. A timer looks about half a second ahead and schedules the swell on the audio clock, the way Chris Wilson separates the two clocks. The pitch is a weighted walk: supporters prefer to stay or step to a unison, third, fifth, or octave, and opposers prefer a wider, sourer step. One quiet triangle follows. Under it, a dry pair near 55 Hz, a darker delay, and a generated impulse of about nine seconds. Three very slow sines, one per loop length, ease the room. The FM pair is quiet and low. A grain is rare. Leaving the cube lifts that bird a little and opens the filter a little. Zooming in is slightly louder and drier. Zooming out sits deeper in the room. The canvas does not scroll the page. The volume slider starts at 35, and a compressor sits in front of the speakers.

Play is a toggle. Stop ramps the master to silence in about 50ms, drops every oscillator and noise source in that play, and disconnects the delay. The next play starts clean. Leaving the page or hiding the tab runs the same stop. Reduced motion holds the birds in place. Their sides still ease, and the sound still plays. A hidden tab stops drawing. The wind, the grains, the impulse, and the FM are generated in the audio context. Nothing is read from a sound file.

Play is a toggle. Stop ramps the master to silence in about 50ms, drops every oscillator and noise source in that play, and disconnects the delay. The next play starts clean. Leaving the page or hiding the tab runs the same stop. Reduced motion holds the birds in place. Their sides still ease, and the sound still plays. A hidden tab stops drawing. The wind, the grains, the impulse, and the FM are generated in the audio context. Nothing is read from a sound file.

## Preview

Pages sets `CF_PAGES` and `CF_PAGES_BRANCH`. It does not set the production branch name, so that name defaults to `main`. The copy runs only when the branch is something else. CI and a local `npm run build` leave `dist/` without `/unshared/`. The copy retargets the stylesheets at `/unshared/tokens.css` and `/fonts/Anton-latin.woff2`, and appends `X-Robots-Tag: noindex` for `/unshared` and `/unshared/*`.

## Mobile Safari

The context stays suspended until the play tap, and `resume()` runs inside that tap. On Safari 16.4 and newer the page sets `navigator.audioSession.type` to `playback`, so the silent switch does not mute Web Audio. Older iOS stays quiet while the ringer switch is on. Stop cancels oscillators that have not started yet, because stopping one before its start time throws and used to leave the rest of the graph running.

## Bundle

`concepts/ambient/ambient.js` is 38,347 bytes, 10,868 bytes gzipped. `concepts/flock-model.js` is 19,392 bytes, 5,772 bytes gzipped. The page loads both. Seven voices. Two hundred and eighty-eight particles.
