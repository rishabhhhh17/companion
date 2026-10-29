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
