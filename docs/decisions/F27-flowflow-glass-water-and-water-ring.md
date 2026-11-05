# F27. Flowflow is clear glass water, and a water ring rides the pointer

- **Status:** Founder decision, 30 Oct 2026, picked from a live lab of three looks and four pointers.
- **Date:** 2026-10-30
- **Related:** F24 (the name), M20 (the pointer drop), M29 and M32 (earlier water passes), M37

## Decision
- **Flowflow is "clear glass water"** everywhere it is drawn live: the screen edge, Home, the notch and Settings.
  - **The shape:** one clean drop, with a round base narrowing to a soft point and a flat underside.
  - **The look:** worked out per pixel, lit like a studio product shot.
  - **The face:** two calm capsule eyes with a glint.
  - **The motion:** the physics only leans, breathes and settles it a little; it never wobbles into lumps.
- **The pointer follower is a water ring.** A small ring of the same water sits centred on the pointer's tip.
  - It is open in the middle, so it never covers what you point at.
  - It moves with the pointer exactly, with no spring and no lag.
  - It stretches a little when you move fast, and small waves run round it.
  - With Reduce motion or Less motion it stays still.

## Why
The founder found the old Flowflow cheap, lumpy, badly moving and odd in the face, and the pointer drop laggy, in the way and cheap. They chose "clear glass water" for Flowflow and asked for "a water ring… make sure it is nice".

## What changes
- **Flowflow's drawing** (`app/src/flowflow/shaders.ts`, `renderer.ts`): one quad with a ray marched drop. The sphere mesh and the separate eye meshes are gone.
- **The pointer** (`follow.rs`, `follow.html`, `follow.ts`): the window sits on the pointer, and the page draws the ring live.
- **Settings** calls the option "A water ring".
- **A bug fixed on the way:** Flowflow's canvas was never sized, because the call that sizes it had slipped into a comment. So it had been drawn small and stretched.

## Revisit only if
The founder supplies or picks other character art.

## Added the same day, after the founder tried it ("it does not look flowy… melts and reshapes"; "make sure the water can go anywhere in the display")
- **It is liquid.**
  - At rest, the point sways, slow waves run up its sides and the base spreads and gathers.
  - Moving, it stretches and pours one smooth tapering tail of water behind it (`uPour`, from how far the physics stretches it) that melts back in.
  - All of it stays low and smooth, never lumpy.
- **It can be put anywhere.**
  - Let go at least 120 points from every edge, it stays there (`docking::free_on`, `place_free`, kept per display in `dock.json` `free`). It is moved sideways out of the notch and Home's zone, it does not peek, and it faces the nearest edge.
  - A drop near an edge, or an edge or position chosen in Settings, takes it back to an edge.
- **The ring no longer lags.** At most one move waits on the main thread, and it reads the pointer when it runs (`FOLLOW_QUEUED`).

## Added after the founder saw a demo of water reaching for water and clinging to an edge ("exactly that… the more I push it towards it, the flatter it gets")
- **A surface it clings to** (`engine.ts` `Surface`):
  - The screen edge it is docked on.
  - Home's waterline (`below`, two thirds down its box).
- **How hard it is pushed:**
  - The shell measures it during a drag (`docking::press_of`: none with the pointer at its middle, all of it at the screen's edge) and sends `dock-press`.
  - A soft under damped spring (`PRESS_SPRING`, 3.2 Hz, damping 0.3) turns it into how much it slides up to the surface, flattens (to about half) and spreads along it.
  - Letting go wobbles back past its shape before it settles.
- **The drawing:**
  - It joins the surface in a fillet with a thin film along it, and nothing is drawn past the surface.
  - The face rides with the body (`toBody`).
- **The water ring now leads a moving pointer** by about the time a move takes to show (`follow::led`, 24 ms, at most 60 points), so it lands on the cursor on a fast sweep.

## Added: it sticks to the edge (the founder: "it needs to stick… it just needs to dwell there… when I pull it, it needs to come out")
- **Tucking is on by default again** (`character.peek` true, a change from M31).
- **A new `character.stick`** (on unless turned off): at rest it is stuck half in view (`peek::Pose::Peek`) rather than fully past the edge. The pointer on it brings it out, and it goes back after it leaves.
- **What the page draws:**
  - Stuck, it flattens against the screen's real edge (`docking::screen_at`, sent with the pose and with each drag) and joins it.
  - Out, the spring takes it back to its shape with a wobble.
  - Dragged, the press from `press_of` decides how flat it is.
- **Placed free,** it now keeps clear of the notch only; Home may drop over it.

## Update, 5 Nov 2026 (founder)

Looking at Home opened from the notch in their own look (Friendly, Vivid, Deep), the founder: "the notch looks so bad", "these colors don't look good, it feels so random", "I need it to be black with accents of different color", and on approving the plan: "Just make it simple, good, and useful, with a little bit of fun here and there, and immersive. I don't want to do this again and again."

- The looks are now one look: black, like the notch, with colours that mark meaning (blue for actions and Now, purple for Learn and practice, orange for History and changes to look at, pink for Memory, green for proven, red for a real problem, teal for listening, grey for neutral). Colour never paints a surface.
- The Look page offers Colour (Colourful, the usual, or Calm with blue only), Character (Visor, Glass orb, Water), Layout and Text size.
- The water character from this record stays as a Character choice ("Water"), with its face, bubbles and water. The water room behind Home (the sea, the waves, the glows of the Friendly style) is retired, and so is the water colour choice (look.water): the water is the usual ocean.
- Stored values of the retired keys still load and are ignored.

Plan: docs/milestones/M71-black-with-colour.md.
