# The water character: where the pictures come from

Written 22 Oct 2026.

**What it is.** The first character, the water creature (the Flow group; the founder named it in F24). Ten pictures in `app/public/characters/water/`, one per pose, all the same size and lined up on the same bottom line so the character never jumps when its state changes. Which picture shows for which state is in `app/src/characters.ts`; `characters.test.ts` checks it.

**Where they came from.** The founder made one sheet of twelve poses with ChatGPT's image tool on 22 Oct 2026. I cut the sheet into separate pictures (the sheet already had a see through background) and shrank each to 351 by 249 pixels, sharp up to three times the size the dock shows it at (112 by 80 points). I did not draw or redraw anything except the two changes below.

**What I changed, and what I left out.**
- The laptop had an Apple logo on its lid. Apple does not allow its logo on other products, so I painted it out with the lid's own colour.
- The angry pose is not shipped. Rule 16: a tool, never a mood.
- The sad pose is not shipped. A grey sad face on a broken project reads as a guilt trip. The error state uses the peeking pose instead: half hidden, wide eyes, an "uh oh".
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
| error | peek |
| a trip across the screen, while idle | swim |
| a cheer or a party, while idle | splash |

A trip or a cheer never hides that something waits for you, that the screen is being looked at, or that it is off.

**Still open for the founder.**
1. **Licence.** The pictures were made with ChatGPT. Check that the plan used allows commercial use before the app is sold. Most paid plans do; some free ones do not.
2. **Real "uh oh" pose.** Peek is a stand in. A proper worried but friendly pose would be better.
3. **More:** a puddle only version for the smallest size, the surfboard that becomes the pointer, and the fluid cursor from the brief. Moving versions (Rive or short loops) when ready.
4. **A look on the real Mac,** on both a light and a dark desktop, with the real glow rings.
