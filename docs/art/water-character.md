# The water character: where the pictures come from

Written 22 Oct 2026. Updated 3 Nov 2026 (M60).

**Now (M60, 2 Nov 2026).** The founder's friends said the old creature looked like poop, and the founder picked a new Flowflow from six concepts: the Orb with Fizz's trailing bubbles. The eleven pictures keep their names and their size (351 by 249, see through), but they are no longer cut from the ChatGPT sheet. They are drawn from code: `app/src/orbArt.ts` holds the one geometry (a perfectly round bubble of water, two soft closed arc eyes and no mouth, two small bubbles trailing below and behind it in a gentle arc), and `app/scripts/make-orb-poses.ts` writes the PNGs from it in Ocean's colours (run `bun app/scripts/make-orb-poses.ts` from the repo root; never edit the pictures by hand). The pages turn them to the chosen water with a hue turn, so no safety colour (amber, green) is ever painted into a picture. The same geometry draws the Water choices in Settings, in each water's own colours. `orbArt.test.ts` keeps the outline round, two eyes and no mouth, the bubbles in an arc rather than a line, and everything on the canvas. The sections below are the history of the first pictures.

**What it is.** The first character, the water creature (the Flow group; the founder named it in F24). Eleven pictures in `app/public/characters/water/`, one per pose, all the same size and lined up on the same bottom line so the character never jumps when its state changes. Which picture shows for which state is in `app/src/characters.ts`; `characters.test.ts` checks it.

**Where they came from.** The founder made one sheet of twelve poses with ChatGPT's image tool on 22 Oct 2026. I cut the sheet into separate pictures (the sheet already had a see through background) and shrank each to 351 by 249 pixels, sharp up to three times the size the dock shows it at (112 by 80 points). I did not draw or redraw anything except the two changes below.

**What I changed, and what I left out.**
- The laptop had an Apple logo on its lid. Apple does not allow its logo on other products, so I painted it out with the lid's own colour.
- The angry pose is not shipped. Rule 16: a tool, never a mood.
- The sad pose is not shipped as it was: grey and sad on a broken project reads as a guilt trip. The error state uses the same drawing recoloured to the creature's own bright blue (saturation and colour matched to the plain pose; nothing redrawn), which reads as a small "uh oh", named `worry`. The peeking pose (`peek`) is kept for later (docked on an edge, quiet).
- The sheet itself is not kept in the repo, because it still has the logo and the two poses above.

**Which pose shows when.**

| State | Pose |
|---|---|
| off | sleep |
| idle | look |
| listening | glance (a lit ring says it is listening) |
| thinking | idea (the light bulb) |
| working | laptop |
| checking | magnify |
| needs you | wave |
| done | splash |
| error | worry |
| a trip across the screen, while idle | swim |
| a cheer or a party, while idle | splash |

A trip or a cheer never hides that something waits for you, that the screen is being looked at, or that it is off.

**Still open for the founder.**
1. **A drawn "uh oh" pose** would still be better than a recolour of the sad one, if you want to commission or generate one in the same style.
2. **More:** a puddle only version for the smallest size, the surfboard that becomes the pointer, and the fluid cursor from the brief. Moving versions (Rive or short loops) when ready.
3. **A look on the real Mac,** on both a light and a dark desktop, with the real glow rings.
