# SKILL: Talking mascot, blip-speech, no TTS, no cloud audio

An optional, toggleable animated character that "reads" card content aloud using blip-speech, short pitched sound effects synced to the word reveal, not real voice audio. No TTS engine, no cloud storage, no sync problem, because there's nothing pre-generated to sync, the sound and the text reveal share the exact same trigger. Read the frontend SKILL first for the token system and motion restraint this has to stay inside, this is an opt-in companion mode, not a redesign of the core reading experience.

## Why blip-speech, not TTS, read this before building anything

This was a real pivot from an earlier TTS-based plan, worth understanding why, so the design doesn't quietly drift back toward it. Real TTS, whether browser-native or a hosted model, means either cloud-generated audio that has to be stored and synced to card content, or client-side generation with real timing uncertainty depending on device and voice engine. Both create exactly the drift and storage problems already ruled out. Blip-speech has none of that: one short sound asset, played client-side, triggered by the same word-reveal event already driving the text animation. The sound is never stored per card, never generated per card, never out of sync with the text, because there's only one event firing both.

## Core mechanic

A single short blip sound (a few hundred milliseconds, two or three slight variations to avoid monotony), played once per word as the existing word-reveal animation fires, with a small random pitch shift each time so it reads as lively rather than mechanical, the same technique behind this effect in every game that's used it.

```javascript
function playBlip(blipPool) {
  const sound = blipPool[Math.floor(Math.random() * blipPool.length)]
  const pitch = 0.9 + Math.random() * 0.3
  sound.currentTime = 0
  sound.playbackRate = pitch
  sound.play()
}

// hooked into the existing word-reveal loop, not a separate timer
onWordReveal((word, index) => {
  revealWord(word, index)
  if (mascotEnabled) playBlip(blipPool)
})
```

Two or three source clips, varied pitch per play, is enough variety, don't over-engineer this into a larger sound library, the randomized pitch is what carries the effect, not clip count.

## The mascot itself, kept simple on purpose

Not a fully rigged character, a small set of states swapped as sprites or layered SVG, no game engine or WebGL needed for this:

- **Idle**: a gentle breathing or blinking loop, low-key, shouldn't visually compete with the card content behind it.
- **Talking**: mouth open/closed, toggled in time with each blip, the same event driving the sound drives the mouth state, one trigger for both, not two systems trying to stay in sync.
- **Reaction, correct quiz answer**: a short happy animation, a bounce or a bright expression change, a few hundred milliseconds, not a prolonged celebration that outstays the moment.
- **Reaction, idle tap**: if the mascot is tapped while not actively talking, a small curious or playful response, cycle through two or three variants so repeated tapping doesn't feel robotic.

Keep every state animation short and restrained, consistent with the frontend SKILL's rule of one deliberate motion moment at a time, this mascot adds personality, it shouldn't add visual noise competing with the actual content it's supposed to be narrating.

## Naming and design, one real constraint

Not modeled on or named after Talking Tom or any other existing character, that's someone else's trademarked IP, not something to reference even affectionately. The interaction pattern, an animated companion that reacts to taps, is a generic, long-used idea with nothing proprietary about it, the character design, name, and personality need to be entirely your own.

## Toggle and placement

Off by default, a clear setting, likely in Profile given that's where other personal preferences already live, labeled plainly, something like "Reading companion," not buried in a submenu. When on, the mascot appears in a consistent, fixed position relative to the card, not overlapping the text itself, small enough to feel like a companion in the corner of the experience, not a takeover of the screen.

## Build order

1. Build the blip sound and random-pitch mechanic first, hooked into the already-existing word-reveal event, verify it feels good entirely on its own, no mascot sprite needed yet to judge whether the core audio-visual rhythm works.
2. Build the mascot's idle and talking states, wire talking to the same event already driving the blips, confirm there's no drift possible by construction, not by testing it feels right once, since the whole design is drift-proof from fewer event sources, not better synchronization.
3. Add the two reaction states, correct-answer and idle-tap, last, these are polish on an already-working core loop, not load-bearing for the feature to feel good.
4. Add the Profile toggle, default off, and confirm the rest of the app behaves identically with it off, this should be purely additive, never a dependency anything else in the app relies on.
