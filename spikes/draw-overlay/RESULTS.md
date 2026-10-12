# Spike: an overlay that takes the mouse but never the keyboard or the front app (M10 step 0c, 12 Oct 2026)

**Question.** The (later) "draw or circle to ask" feature, and any overlay that must be clicked or drawn on, needs a panel that receives mouse events. It must never take the keyboard, never become the front app, and drawings must be clipped to the window they were confirmed in (F17 rule 22, to avoid drawing over the wrong app).

**Method.** A throwaway app (`DrawProbe`, Swift, macOS 27) made a non activating panel (`NSPanel`, borderless, level 25, `canBecomeKey` and `canBecomeMain` false, `acceptsFirstMouse` true, nearly transparent fill so it receives the mouse) over part of the display, and logged the front app, whether the app was active and whether the panel was key every half second. With TextEdit in front and its text cursor in a document, a real mouse drag was made across the panel (where it overlapped the TextEdit window), then more text was typed. It was run as a normal app (so the test tool could see it) with a non activating panel inside it, which is the thing being tested.

**Result.**
- **The panel took the mouse:** it logged the mouse down and up (with positions) and drew an orange stroke on screen, over TextEdit and beyond its edge.
- **It never took the front app, the keyboard or key status:** TextEdit stayed in front at the mouse down, the mouse up and every half second after; the probe app was never active and the panel was never key (no tick said otherwise).
- **Keys still went to the app underneath:** text typed after the drag landed in TextEdit.
- This agrees with spikes (a), (a2) and (a3) (T01): a panel created non activating from the start keeps the front app on every click.
- **Finding the window under a point needs no permission:** the window list gives each window's owner, layer, bounds and order without Screen Recording (only window names need it). The top window under a point, skipping the system's full screen layers (Dock, WindowManager) and our own overlay, is the app window to clip to.

**The clipping rule this gives.** Remember that window's number, owner and bounds when the target is confirmed. Poll the window list about 10 times a second while the drawing is up. Clear the drawing at once when the front app changes, the window's bounds change, the window is no longer the top window at the target, or the window is gone. (Not yet built; part of the engine, step 2b.)

**Not measured.** A long, curved drag (the test tool sends a straight drag); Stage Manager and full screen apps (spike a covers panels there); behaviour with two displays; the Escape way out (a registered global hotkey, as hold to talk already does, so no key reading).
