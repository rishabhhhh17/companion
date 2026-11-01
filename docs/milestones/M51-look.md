# M51: the grown up look, wide by default, and yours to change (plan, 1 Nov 2026)

## What the founder said (1 Nov 2026)
- The three first proposals (Daylight, Deep Lagoon, Studio Play) looked "very childish".
- After the reference study (HeyClicky, YC apps, Mac apps; evidence in the scratchpad `refs/`): HeyClicky "looks so much better". Ours "looks so vertical", which he does not like. The graphite look with one glossy water button "looks pretty good": "give a mixture of it" with HeyClicky.
- Flowflow's art stays as it is.
- "I want customers to have as much customization as possible, so make it very unique and customizable."

## What gets built
1. **The base look.** The graphite surfaces from the reference study replace the flat black and silver:
   - Surfaces step #111111, #171717, #1C1C1C and #242424, with 8 percent hairlines and no tint.
   - One glossy water button per view.
   - Quiet keycaps with real symbols.
   - Proof rows: file names and the failing line in the system mono.
   - Practice as find, fix, prove on a thin thread.
   - The glitches the review listed are fixed:
     - the stray dot
     - Flowflow crossing the tab row
     - first run links 16 points off the left edge
     - the Settings tab strip clipping words
     - the muddy marker
     - two Stop buttons
2. **Wide by default.** Home becomes a landscape window, about 720 by 480:
   - a sidebar on the left (Now, Learn, History, Memory, Settings, and recent work), like HeyClicky's;
   - the work on the right.

   The tall panel stays as a choice. The character's clear zones and the notch placement follow the new size.
3. **HeyClicky's kind of fun, in Squibby's own way:**
   - small coloured icons for each item in lists;
   - tilted stamps on items (working, new, proven, needs you);
   - Squibby's short lines in bubbles with a tail;
   - the one glossy pill.

   No confetti, no streaks (rule 16).
4. **Customization.** Every choice has a safe default and a Settings row with search words:
   - Layout: Wide (usual) or Tall.
   - Look: Graphite (usual), Paper (light) or Deep.
   - Density: Comfortable (usual) or Compact.
   - Icons: Colour (usual) or Plain.
   - Stamps: On (usual) or Off.
   - The glossy button: On (usual) or Flat.
   - Corners: Soft (usual) or Crisp.

   These come on top of the existing choices: water colour, text size, Flowflow's name, how lively, its edge, and going into the edge.

## Rules that hold
- Contrast and focus tests stay green; only tests that pin the old grey and silver palette are updated, and that is the founder's call made here.
- Plain words and no em dashes.
- No change to Flowflow's art.
- Every new setting goes in the registry, the strings, a Settings page and the registry test.

## Order
Base look, then wide layout, then the details and customization, then screenshots against HeyClicky and a fix pass. Then the full suite, the app built and opened.

## Polish after the screenshots against HeyClicky (1 Nov 2026)
- The list on the left is one line per task (about ten fit), with small upright labels only for working, needs you and new.
- The tiles' colours mean a kind of work; on the dark themes they are deep washes. The labels are upright; the glossy pill is calmer.
- Look is its own Settings page (after General) with picture choices for layout, theme, the main button and corners, beside the water. Picked things in Settings take the water's colour (the pick tokens, tested for every water in every theme).
- History, the first run, the wide Settings frame, the practice on Now and the failing line were tidied as the review listed.

## Elemental colour (1 Nov 2026)
The founder asked for a look that is "very colorful and out there and bubbly" and "much more immersive", with water as the first elemental. Home is now a place lit from inside, and the light is the colour of the group at work.

- **The rooms.** Home sets one element at a time (element.ts roomElement), and ui/tokens.css swaps every colour on it. Flow's water is the usual room: Now, History, Memory and Settings. Flow's room is the water chosen in Settings, so Berry makes the whole room pink, not only Flowflow; each water has its own measured block. Guide lights Learn, and Now while a practice runs, as a sunset: gold in the bright parts (the rays, the sky, the gem, the main button), coral, rose and violet in the wide dim parts, never olive or brown. Voice takes the room while the talk keys are held (pink), and Files while a file is dragged over Home (green, with the whole window outlined as the drop place). Settings stays in Flow's room so the colours you are changing never flicker.
- **What a room is made of** (ui/look.css .room, behind the work): a saturated sky that is brightest where no words sit (the top right, above Flowflow), a wash that carries the colour down the room, a glow behind the work, rays of light through the water at rest and brighter while Flow works, a few soft points of light drifting in the water, and a floor in the element's deep colour. Only the floor reaches the bottom third, so the band under the ask box is its exact colour and never shows. Cards are dark glass with a touch of the room's colour; second words in a lit room are a lighter grey touched with the room's light. Every screen was measured: words read at 4.5 to 1 against the brightest pixel behind them.
- **Flowflow's place.** Flowflow is about half as big again in the wide Home, growing up beside the words without moving anything. Its pond is a deep sea in the room's light with a little of the chosen water in it, so it is never a pasted band and never grey. On Learn it sits in a small pool of its own water on the practice card.
- **The gems.** A gem is a small glossy drop in an element's colours. Now shows Flow's gem and Learn shows Guide's, in place of a drawing, and the selected row takes the colour of the room it is in. The row of four gems at the top of the list was taken out: it sat where the Mac's window buttons go and read as fake ones.
- **One badge system.** Working, New, Proven and Needs you are all soft solid pills with a dot before the words; Needs you is a step fuller. In the list on the left each is its dot alone, with the words in the row's tooltip and spoken name.
- **Colour (look.colour).** Vivid, the usual, is the full room. Calm is a quiet Home: a faint glow at the top, no rays or drifting points of light at rest, plain cards, no halo and a flat looking main button. The two pictures in Settings show the difference at a glance.
- **Light (look.light).** Moving, the usual, lets the light drift slowly while Home is in use; it holds still after 10 seconds with no touch, when Home is closed or hidden, and always with Reduce motion or Less motion. Still keeps it as one picture. Off takes the room's light away, so Home is plain graphite; the groups keep their colours on the main button and their cards.
- **Paper** keeps a clean white page: no room light, untinted cards, and Flowflow's water as a light wash.

