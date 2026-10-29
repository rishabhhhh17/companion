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
