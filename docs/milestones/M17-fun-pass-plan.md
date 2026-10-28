# M17: The fun pass (night and lime, and the water pointer)

**Decided by the founder, 28 Oct 2026, after trying the preview:** "Yes, build all of it". Night and lime replaces the Glow palette everywhere, and the water drop replaces the flying arrow for Flowflow.

Written 28 Oct 2026, after the founder asked to "make the UI fun now and not incremental changes", in the new mark's colours, and for Show me how to work like this: "a part of Flowflow's water splits up and then it shows how to do it".

A working preview was built first and walked end to end (split, flight, water ring, three steps, the drop flying home, the notch panel, Home grown from the notch). It lives in the session scratchpad as `m17.html`. Nothing in the app changes until the founder approves this plan.

## The look: night and lime
One design language for every surface, replacing the Glow palette from M16 (gold and mint) with the brand's own colours.

- **Black** surfaces (`#000` for the notch and Home, `#1E1E21` for raised cards, `#2A2A2E` for pills). White words.
- **Lime** (`#C6F432`, the mark's colour) is the one colour that means "do this": the main button, the send button, the caption that tells you where to click, the busy sun. Nothing else is lime.
- **Water blue** belongs only to Flowflow and its work: the agent faces in job cards, the drop, the ring.
- **Amber** stays the sign that something waits for you; **green** and **red** stay small marks for done and failed.
- **Rounded type** (the Mac's own SF Pro Rounded) for headings, buttons and captions; the usual text face for reading.
- **Buttons you want to press:** the main button is a lime key with a shadow underneath that sinks when pressed. Cards tilt a little on hover. Everything that appears springs in.
- **Big friendly words:** "Hey. What are we finishing?" on the notch panel, "What's stuck?" on Home, with a lime word for the verb.

## The water pointer (Show me how)
Today an arrow flies from the character and a ring appears. It becomes:

1. **Split.** Flowflow leans toward the target, a bulge swells out of its side, stretches into a neck and pinches off as a drop. Its eyes follow the drop.
2. **Flight.** The drop arcs to the target, stretched along the way it moves, leaving a few tiny drops behind that dry up.
3. **Landing.** It squashes on arrival, then spreads into a ring of water around the target that wobbles gently, evenly spaced along the ring however wide the target is.
4. **Caption.** A lime speech bubble above the ring (never over the target): "1/3 Open Settings".
5. **Your click.** On the right thing the ring bursts into a splash and the drop hops to the next step. A click somewhere else makes the ring wiggle, and nothing moves on.
6. **Home.** After the last step the drop flies back and Flowflow swallows it with a happy wobble and a small burst of lime confetti.

Rules that stay exactly as they are:
- A guess still looks different from a confirmed target (rule 22): for a guess the ring's drops stay apart as separate beads in amber, never a joined ring.
- Reduced motion: no split or flight, the ring and caption simply appear.
- Stop (the global hotkey) clears it at once, even mid-flight, and an old draw never lands (the overlay's draw counter, as today).
- The pointer never takes the keyboard, and nothing about the screen is stored (rule 5).
- High contrast and the ring colour setting keep working: the colour setting tints the water; high contrast draws a white ring with a dark edge.

How it is built: the dock's Flowflow engine gets a "give" move (lean, bulge, pinch) and tells the shell where on screen the drop leaves; the overlay draws the drop from that point on (the overlay covers the whole screen, so the drop can leave the dock window). When the drop comes home, the dock gets a "catch" move. The drop and ring are SVG with one liquid filter, so the overlay needs no WebGL.

## In order
1. **Tokens and type.** The night and lime tokens, rounded type, the key button, pills and cards as shared styles. Tests: contrast for every pair (lime on black, dark ink on lime), the no orange test stays, the palette test changes from Glow to lime.
2. **Notch panel and Home.** The panel and Home redone in the new look as one surface, with the friendly headings and the quick actions as three cards.
3. **The water pointer.** The flight, ring and caption maths in `pointer.ts` with tests first (ring spacing, caption placement, the order of the moves, cancel mid-flight, a guess's look). Then the overlay drawing, then Flowflow's give and catch moves in the dock.
4. **Everything else.** Approval cards, results, Settings, first run and the dock's label in the same look.
5. **A real Mac session,** one step per message, tuning sizes, timing and colours live.

The full suite runs after each step, the app is built and opened after each step, and nothing is merged without the founder.

## Decisions only the founder can make
1. Replace M16's Glow palette (gold and mint) with night and lime everywhere. (This changes a choice the founder made on 27 Oct.)
2. The water pointer replaces the flying arrow for Flowflow.
