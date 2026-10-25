# Unshared, synthesized

A playable concept for `/unshared/`. It is not in the build, the verb registry, or the sitemap. `/unshared/` stays offline while `unsharedEnabled` is false.

Open `/concepts/`. Every sound is made in the browser with the Web Audio API. There are no audio files and no libraries. Nothing plays until the visitor taps play. One demo plays at a time. The volume slider defaults low, and a compressor sits in front of the speakers.

`concepts/unshared.js` is 23,650 bytes, 6,318 bytes gzipped.

## Ambient

Detuned oscillators, a slow filter move, and a reverb impulse generated in memory. Drag detune, cutoff, size, decay, and the LFO and the drone changes. The pink line is the waveform.

## Speakers

One sub-heavy footwork loop, switched between a phone speaker, a laptop, earbuds, and a club PA. Each one is an EQ curve, a highpass, a little distortion, and sometimes a short generated room. The pink line is that frequency response, and it swaps the moment the speaker does.

## Timing

A footwork grid at 160. The slider runs from a straight machine to swing, micro-timing, and velocity, which is the human feel. Flourish drops a 3+3+2 into every other bar and leaves the grid alone.

## Filter

Drag the black pad. Horizontal is cutoff, vertical is resonance. The pad draws the curve before any sound. Play is what starts it.

## Recommendation

Ship timing and speakers first. Timing is the organic idea, and the hats and the click still read on a phone speaker. Speakers is why the same loop can vanish in a pocket and come back on a sub. Ambient is the one that needs headphones and a few seconds of listening; ship it next. The filter pad is the optional fourth, a touch toy for the same palette.

## Mobile Safari

The context stays suspended until the play tap, and `resume()` runs inside that tap. On Safari 16.4 and newer the page sets `navigator.audioSession.type` to `playback`, so the iPhone silent switch does not mute Web Audio. Older iOS stays quiet while the ringer switch is on. Sending the tab to the background suspends the context; the next play tap resumes it. The on-page slider is separate from the hardware volume. The generated reverb stays a few seconds long so a phone is not asked for a huge buffer.

## Staying out of the build

`concepts/` is not copied into `dist/`. A real `/unshared/` would take this page into the unshared renderer and would still not ship stored audio.
