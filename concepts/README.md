# Unshared, one field

A playable concept for `/unshared/`. It is not a verb, and it is not in the sitemap. `/unshared/` stays offline while `unsharedEnabled` is false.

Open `/concepts/`. One canvas, one piece. Every sound is synthesized in the browser. There are no audio files and no libraries. Nothing plays until the visitor taps play. Dragging the field before that only moves the picture. The volume slider defaults low, and a compressor sits in front of the speakers.

The page is the system these three practices share, built from oscillators, filters, delay, and a generated impulse.

## Eno

Ambient, in his words, is as ignorable as it is interesting. The method is a system, not a performance. `Discreet Music` used two loops of different lengths so they never stayed aligned. `2/1` on Music for Airports puts seven tones on their own loops, each followed by a silence at least twice as long as the tone, with lengths that do not divide each other. Published timings for those loops sit around 17, 18, 19.6, 21, 22, 25, and 31 seconds. The 31 second one is the Db, the tone that leans against the C. The liner notes draw that score as rows of marks at unequal spacing.

Here those seven tones are sines. C4, Eb4, F4, Ab4, Db5, F5, and Ab3. Each loop is the length above, the tone is under a third of it, and a random offset in the silence means a reload opens in the middle of a system that does not repeat on a human timescale. The rows of dots are that score.

## Hauschildt

His electronic pieces start from a chord, then a sequence or an aleatoric walk, with the machine and the hand taking turns. On the Nord Modular G2 he interpolates between two patches instead of riding every knob. `Nonlin` leaves pockets of air between pulses and keeps a little brightness inside a soft reverb.

The left edge of the field is a sine chord, C G Eb. The right edge is a brighter triangle chord, F Ab C Db, so the same Db tension can arrive. The finger crossfades the two. A short walk steps along whichever chord is closer, sometimes jumps, sometimes rests. It is not a clock.

## Biosphere

`Substrata` is nearly beatless: slow electronic harmony and a large, dark room. Asked how that record was made, he named a Sony DPS-R7 and the Akai S-3000's echo, chorus, pitch shift, and delay, and he singled out the delay and the pitch shift. The cold-place story is not a set of wind and water samples, and this page does not use any. What it keeps is the size.

A sub sine sits near 55 Hz with a second a few cents away, sent dry so the room does not boom. Above that, a highpass feeds a feedback delay with a dark lowpass in the loop, plus a convolution impulse generated in memory. Dragging down lengthens the delay, raises the feedback, and rebuilds a longer impulse. A slow wobble on the delay time is the chorus. Every so often a high sine is sent only into the impulse, far away. A phone speaker will not carry the sub. The sequence and the glass still read.

## Playing it

Tap play. Drag across the dots to move the harmony. Drag down to open the room. Arrow keys do the same, and shift makes a larger step. Play again to stop. Reduced motion freezes the field on the opening arrangement. The finger, the density of the matrix, and which dots wake up still follow the drag. There is no continuous animation in that mode.

## Preview

A Cloudflare Pages preview build copies this folder into the output and retargets the stylesheet at `tokens.css` and `/fonts/Anton-latin.woff2`. The copy runs only when `CF_PAGES` is `1` and the branch is not the production branch. A missing branch name does not copy. Production, CI, and a local `npm run build` leave `dist/` without `/concepts/`. The preview response adds `X-Robots-Tag: noindex`. The page already sends a robots meta tag.

## Mobile Safari

The context stays suspended until the play tap, and `resume()` runs inside that tap. On Safari 16.4 and newer the page sets `navigator.audioSession.type` to `playback`, so the iPhone silent switch does not mute Web Audio. Older iOS stays quiet while the ringer switch is on. Sending the tab to the background suspends the context. The next play tap resumes it. The on-page slider is separate from the hardware volume. The generated impulse stays a few seconds long.

## Bundle

`concepts/unshared.js` is 17,371 bytes, 5,651 bytes gzipped.
