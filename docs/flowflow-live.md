# Flowflow, drawn live

Flowflow is the water character. This is the version that is drawn live on the GPU instead of shown as a picture. It is **on by default** since 27 Oct 2026 (the founder had not seen the fluid mechanics with it off; it was **off by default** before) (Settings, "Draw Squibby live", the setting `character.live`); the picture poses (`docs/art/water-character.md`) stay as the fallback and as the default until the founder has seen it on a real Mac.

## What it is, and what it is not
A rounded droplet with a flattened base, drawn by shaders from a sphere. A small **spring and damper soft body** moves and bends it; a **mood** state machine says what it is doing; two eyes follow a target on their own; tiny droplets leave and merge back; ripples spread from a touch. Nothing is a picture or an animation file.

It is **not a fluid simulation.** It is a handful of springs driving a shaded sphere. The "refraction" is a small shift of an internal gradient by the surface, because a see through window cannot bend the desktop behind it.

## Where the code is (`app/src/flowflow/`)
| File | Job | Needs a screen? |
|---|---|---|
| `physics.ts` | Springs, the soft body, fixed time steps, the dials | no (tested) |
| `behavior.ts` | The eight moods and their looks, smooth and interruptible | no (tested) |
| `face.ts` | Two eyes, blinks and glances on a seeded schedule | no (tested) |
| `particles.ts` | Droplets and ripples in fixed pools | no (tested) |
| `engine.ts` | Wires the four above together; what the app and the pointer do to it | no (tested) |
| `shaders.ts`, `body.ts`, `renderer.ts` | three.js: the water shader, the procedural body, the eyes, the droplets | yes |
| `controller.ts` | Loop, pointer, size, pixel ratio, visibility, clean up | yes |
| `view.tsx` | The React canvas the dock uses | yes |
| `preview.ts` + `app/dev/flowflow-preview.html` | The dev preview | yes |

The dock loads the drawing on demand (`React.lazy`), so with the setting off none of it, and none of three.js, is fetched.

## Run the preview
```bash
cd app && bun --bun vite --port 5199
```
Then open `http://localhost:5199/dev/flowflow-preview.html`. It shows the character three times (large, the dock's size, and a size where the body is about 48 pixels tall), with:
- **State buttons.** Idle, Curious, Working, Sleeping, Success, Error. Success and error only play when you press them.
- **Poke, Land, Shake.** One off events for the soft body. Click the body itself to touch it.
- **Five dials.** Stiffness, Damping, Speed, Ripples, Clarity. Copy values prints them as JSON.
- **Backgrounds** (dark, light, checker) and a **Less motion** box (one still frame per change).
- **A live readout** of the frame timing measured on that page.

## Tune the physics
| Dial | What it does | Limits |
|---|---|---|
| Stiffness | How fast every spring swings (a square root of the number) | 0.2 to 3 |
| Damping | How quickly it settles; low rings, high is sluggish | 0.2 to 3 |
| Speed | Scales every swing and the breathing | 0.3 to 2.5 |
| Ripples | Strength of ripples and the dents from a touch | 0 to 2 |
| Clarity | 1 is clear glass, 0 is a denser gel | 0 to 1 |

The usual numbers are the constants in code: swing rates and damping ratios in `SoftBody.setTuning` (`physics.ts`), the look of each mood in `LOOKS` (`behavior.ts`), the body size and where it rests in `renderer.ts` (`BODY_SCALE`, `REST_Y`), the colours at the top of `renderer.ts`. Two safety limits are not dials: no swing may go above `MAX_HZ` (14), and the friction term is capped. **Both exist because a test found the numbers blowing up (NaN) at the highest stiffness and speed together.**

## How it behaves
- **Time.** Fixed steps of 1/120 s inside, so the same motion comes out at 30, 60 or 144 frames a second. A frame over 50 ms (a hidden page, a window being dragged) only simulates 50 ms, and a gap over half a second (a suspension) simulates nothing.
- **Moods.** Success and error come only from a real change in the app's state (`FlowflowEngine.applyApp`); the same state twice does nothing. Done is a short flash of success that settles. Error holds while the app is in error. A touch interrupts anything and hands back. Only an idle Flowflow follows the pointer.
- **Resting.** It draws at 30 frames a second when idle and settled, 15 asleep, nothing while the page is hidden or the character is off screen. Less motion draws one still frame per change.
- **Fallback.** If WebGL cannot start, or the context is lost, the dock keeps the picture poses.
- **The pointer.** It only listens: nothing here stops a click or a drag. Only pointer events inside the dock's own small window reach it, so the eyes look at the pointer while it is over that window; a global cursor position would have to come from the shell (not built).

## What is verified, and what is not
**Verified**
- 75 tests (`bun run test` in `app`): the physics (settling, overshoot, frame rate independence, a suspended frame, stability at every extreme of the dials, staying inside the frame), the moods, the eyes and blinks (seeded: the same every run), droplets and ripples (capped, never growing), the whole engine, and source guards (no picture files, everything it starts is stopped, the dock only draws it when asked).
- The preview renders in the in app browser (a Chromium based one with WebGL) with no console errors; all six states look different from each other, the eyes follow the pointer, and the small sizes still read as the same creature.
- Measured on that page, on this Mac's screen, while the pointer was moving: 120 frames a second (that screen's rate), and one frame costs about 0.15 ms of the page's JavaScript time. **GPU time was not measured**, and the rate is lower by design when idle.

**Not verified**
- Running inside the real app's web view (WebKit, not Chromium), and a transparent window composited on the real dock. Nothing here was launched as the app.
- Battery and GPU load on Apple Silicon over a day.
- How it looks next to the picture art, on a light and a dark desktop: that is the founder's eye to judge. The look is a first pass.
- VoiceOver: the canvas is hidden from it (`aria-hidden`); the button keeps its spoken label.
- The 48 pixel silhouette was only looked at in the preview, by me.

**Not built (asked for in the brief)**
- Water made arms for an interaction.
- A 2D reduced effects renderer: the fallback is the picture poses instead.
- A global cursor feed from the shell.
