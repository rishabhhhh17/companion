# F28. One product at launch, Home tells the state first, the notch is bare, and the person picks how lively Flowflow is

- **Status:** Founder decision, 30 Oct 2026, answering four questions from the executive review (`docs/design/2026-10-30-executive-review.md`).
- **Date:** 2026-10-30
- **Related:** F04, F16, F18, F19, F20, F21, F23, F26, F27, M42, M43

## Decision
- **One product at launch.** The founder left this call to the build ("U tell me"). The call: Squibby launches as Fix it, with proof, a receipt and Undo.
  - The other groups (file conversion, watch routines and the Google connections, Second Look, Draw it, type by voice in any app) stay in the code. Their F20 group switches start off, and each can be turned on in Settings.
  - Default global keys drop to four: Fix it, Hold to talk, Prompt help and Stop everything. The others stay in Shortcuts, unbound until the person picks a key.
  - Nothing is deleted. Search in Settings still finds every setting.
- **Home tells the state first, in one column.** The founder picked "Status first, one column" over the M42 two columns.
  - A headline says how the project is, in its own name ("test-shop works. Checked 2 hours ago.").
  - One main button is chosen by that state (Fix it, Check before going live, or Check my project). Then the ask box, then the recent fixes, each opening its own receipt.
  - M42's near black look and thin lines stay.
- **The notch is the bare notch at rest.** On hover it shows only what is live: a job with Stop, a result with Undo and its proof, or a question. The greeting, the silver sun and the buttons that only open Home leave the notch.
- **The person picks how lively Flowflow is.** The founder: "all there, the person using it will choose". Three choices sit in Settings, Flowflow page:
  - **Still** (the usual): still after 3 seconds with no news. It moves only for working, needs you, done, not fixed and listening. The ring shows only while listening or pointing.
  - **Gentle:** a slow sway at rest, capped so it stays inside F04's idle budget. The ring is off at rest.
  - **Lively:** today's motion: sway, eyes on the pointer, the ring always on the cursor.

## Why
The executive review found the product trying to be many products at once (F16 said launch with one job), a Home that launches tools instead of saying how the project is, a notch wider than F18 allows, and a character that never rests and drains the battery under the defaults (F04's budget). The founder agreed on Home and the notch, delegated focus, and chose to let each person pick Flowflow's motion.

## What changes
- **F04 against F27, settled by choice.** F04's "paused when idle" is the usual (Still). F27's sway at rest is the Gentle and Lively choices. F27's look (clear glass water, the ring) is unchanged.
- **F18:** the build is brought back to F18's bare notch at rest. F18 is not changed.
- **F19, F20, F21, F23, F26:** their features stay built; only their default switch changes to off.
- **M42:** Home's two column layout gives way to one column. Its visual language stays.

## Notes
- **Existing installs (review, 31 Oct 2026).** Settings keeps only values that differ from the usual one, so a person who used a side tool while it was on by usual had nothing written down. Once, on a Companion used before, a tool there is evidence the person relied on (it is in the tried list, they picked a key for it, or they set up watch routines) keeps its old value, on; the others start off as decided, and Settings says once which ones. New installs start exactly as decided. Nothing in the decision changes.
- **Google connections.** Connecting a new Google account is part of watch routines and starts off. An account already connected keeps working and always shows in Settings, so it can be disconnected (rule 6).

## Update, 1 Nov 2026 (the founder's own use)
- **Lively is the usual now, not Still.** The founder: "I don't see the water ring following me." With Still as the usual the ring showed only while listening, so a person who had never opened Settings never saw it. Still and Gentle stay as the quiet choices, and the rest of F28 (side tools off, status first) is unchanged. A word the setting does not know still reads as Still.
- **Going into the edge** (`character.dockWhen`). Let go near an edge, it used to snap in with a spring. Now it goes in only when pushed hard into the edge, thrown at it, or kept near it about two seconds, and it goes in with a plain ease and no bounce. Playing near an edge leaves it where it is let go. The old way stays as a choice ("Any let go"). Numbers are in `docking.rs` (`HARD_PRESS`, `FLICK_SPEED`, `REST_MS`); [verify] the feel on a real Mac.

## Revisit only if
Real users on real Macs show that a switched off group is what they came for, or that Still reads as broken.

## Update, 4 Nov 2026 (founder)

The founder asked for the notch to have presence: "there is still no notch like how HeyClicky has, like hey Rishabh or something". So two things change from the rule above:
- The notch at rest shows small black wings with the Visor's lights and, when there is something, one short status word. A switch (island.wings, on by default) brings back the bare notch.
- A short hello (about 3 seconds, no buttons, never takes focus) shows on start, on wake, or after more than an hour away. It shows at most once an hour, only on a real notch, and never while a call app is in front. A switch (island.hello, on by default) turns it off. The name is one the person types (you.name), never the Mac account name.

Everything else in this record stands. Built in M68 (docs/milestones/M68-visor.md).

## Update, 4 Nov 2026 (founder, later)

After seeing the M68 wings and hello, the founder: "I don't want Squibby to be there always, and I don't need a small little bubble type to be there. The notch should be more practical and more to use, just like HeyClicky's notch."

- The rest wings (island.wings) and the automatic hello (island.hello) are now off by default. Both switches stay, and a stored on still works. So the notch is the bare notch at rest again, as this record first said.
- While something is live, the notch shows only one small mark (working, a question, a proven result, a failure). Listening and looking at the screen always show (rule 5).
- Hovering opens a small panel first (island.pointOpens is "status" by default; "home" stays as a choice). Built in M70 step 4 as fact first, no greeting: one plain fact (such as "my-shop: 3 changes to review"), and up to three buttons that open Home at the right place (Ask, Review changes, Check my project, Check before going live, Undo last change), plus Settings and Open. This changes the line above that said buttons that only open Home leave the notch. The greeting stays out of the notch, as the line above says; the name (you.name) is used only by the opt in hello.
- Open, Settings or a button grows the same black shape on into the full Home.

Plan: docs/milestones/M70-practical-notch.md.

## Update, 5 Nov 2026 (founder)

The founder, looking at Home from the notch in their own look: "these colors don't look good, it feels so random", "I need it to be black with accents of different color", "look at how well structured fanout.sh is", and on approving: "Just make it simple, good, and useful, with a little bit of fun here and there, and immersive. I don't want to do this again and again."

- The looks are now one black look with meaning colours, and one structure on every screen (the bar, the places, the lead, one grouped list, the ask box on Now). This changes the M51, M65 and M69 look choices and the "as much customization as possible" note for the look only.
- The Look page keeps four choices: Colour (Colourful, the usual; Calm, the same layout with blue as the only colour), Character, Layout and Text size.
- Theme, Water, Gloss, Light, Corners, Icons, Stamps, Style and Spacing leave the Look page, and Colour's Vivid is gone. Their stored values still load and are ignored (rule: a stored setting always loads), so the founder's own Friendly, Vivid and Deep now shows the black look.
- Status first and quiet by choice (this record) are unchanged.

Plan: docs/milestones/M71-black-with-colour.md.
