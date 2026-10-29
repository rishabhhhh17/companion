# M28: the product overhaul

**Asked by the founder, 29 Oct 2026:** "go to the internet and do a very good overhaul… literally everything about the product… from usage to the UI UX flow to the pricing… go all out". Founder answers the same day: pricing Free plus Pro $10 a month; hide the empty "Coming soon" companions; Settings cut to about 25 main choices with everything else under Advanced; what to hide while unfinished is left to judgment.

## What the research found (four reports, 29 Oct 2026)
- **The competitor that draws on screen is HeyClicky, not Wispr.** Wispr Flow has no drawing, pointing or agent; its 2026 is accuracy (its own model, Canto), a meeting notetaker and a $2B round. HeyClicky now has the notch, hold to talk, hand drawn rings and arrows (Excalidraw style since 17 Jul), walkthroughs that move on when you click, agents, captions, 3D, and Windows. Our own ground: fixing a project with proof, undo by snapshots, and never watching the screen.
- **What the best tools share:** the first success happens in the first minute (Lovable, Wispr); permissions asked when first needed; every agent state visible, Stop that works at once, readable approvals (Linear's agent guidelines, Comet, Claude in Chrome); proof of value without streaks (Wispr's Insights tiles); a generous free tier makes paid users who stay (a16z).
- **What our own audit found:** careful plumbing, unfinished surface. A developer note in the Google section, every lesson marked Draft, three empty companion slots, approval cards that show a raw reason instead of what will happen, 144 settings in 17 sections, about a dozen names for the same few things, dead ends ("stopped working, quit and open again", "not connected" with no button), a ring colour default that is not a real choice.

## Waves (each: tests first, full suite, build, open the app)
1. **Finished and trustworthy.**
   - Approval cards say what will happen (the command or file, in plain words) and whether Undo covers it, in Home and in the notch.
   - "Squibby stopped" gets a Restart button. "Not connected" gets an Add your key button.
   - The Google section is hidden until Google is set up, and no developer note reaches a person.
   - Lessons lose the alarming Draft banner for a quiet "new" note with a way to report a wrong step.
   - The first run shows only Flowflow (the empty slots come back with the founder's art).
   - The ring colour default becomes a real choice.
   - Raw system errors never reach a person.
2. **Drawing v2, beyond HeyClicky's look.**
   - Tapered pen ink: perfect-freehand, MIT, 2 KB.
   - Strokes drawn in pen order at pen speed.
   - A ring that closes past its start and never cuts into the target.
   - Curved arrows with an open chevron head, an underline with a return stroke, a marker highlight, and numbered step badges.
   - A white halo for contrast on any background, never a CSS filter.
   - Seeded and unit tested.
3. **Settings and names.**
   - About 25 main choices, the rest under one Advanced section (nothing deleted).
   - One set of names, enforced by a test that fails on a retired word in what a person reads.
4. **First run, Home and pricing.**
   - A shorter first run that can finish without a key and lands on Home with Add your key.
   - The receipt leads with problem, fix, proof, undo and the cost of the fix.
   - Pricing recorded as F25: Free and Pro $10 a month ($8 yearly), 14 day trial without a card, students half off, "we never mark up your AI". The usage proxy's plan table follows; payments stay switched off.

## Not in this milestone
- 3D models.
- Hand drawn whiteboard explanations beyond today's Draw it.
- Speech word timings for drawing (needs a timing source from the voice).
- Windows.
