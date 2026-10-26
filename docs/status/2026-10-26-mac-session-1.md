# The first hands on Mac session (26 Oct 2026)

Run by the founder on their own Mac, guided one step at a time. Build: `main` at 6a9ee12 plus nothing local, signed with the Apple Development certificate, throwaway test folder `~/Desktop/test-shop`, a capped test key. About 90 minutes. The app had never been opened by a person since the rename to Squibby.

## What passed
| Step | Result |
|---|---|
| Opens: no Dock icon, island at the top centre, Flowflow on an edge | Pass (no Gatekeeper warning on a local build) |
| Click the island: card with five tabs, not cut off, no focus stolen | Pass |
| First run: plain words, folder chooser in front, card comes back | Pass |
| Key saved in the app's own box; survives a quit and reopen; no Mac password box | Pass |
| Find the problem (Control+Option+Command+F): light first, then it pointed at the screen, then a one step plan with a cost | Pass |
| Fix: one step "Rename the function from show() to showGallery()", checked, undo point, 3.2 cents | Pass |
| Undo: the file came back exactly, nothing else touched | Pass |
| Explain an error (Control+Option+Command+E) on selected text in TextEdit | Works (see findings A and D) |
| Add a harmless setting to `.env`: a card asked first, then it was added | Pass |
| A secret key into `.env`: refused, nothing written, value shown as [secret] | Pass |
| Stop everything (Control+Option+Command+X) during a long task | Pass: stopped, task shown as interrupted, nothing left running |
| Hold Option+Space and ask by voice, in one step | Pass (including pointing at where to click) |
| Show me how: showed where to click, one simple step | Pass |
| Drop a photo on the character: ring of choices, converted to JPEG, shown in Finder | Works, but see finding K |
| Word and PDF documents into the ask box: right answers | Pass |
| Menu bar: nothing left on (no microphone or screen use while idle) | Pass |
| Permissions survived the rename (Accessibility entry still named Companion, switched on) | Pass |

## What the founder said (the feelings part)
- **Not slow.** Nothing took more than a few seconds with no sign of life.
- **The look is bad.** "It looks so shit now and the UI that pops up is so complicated." The card is complicated and replies appear in a small box that is hard to read.
- **Lost:** replies "in a small box", could not understand them.
- **Flowflow:** "literally just a photo, no animation, no physics, in a square box that does nothing." Two causes: the pictures are still (physics and motion were not built, on purpose, until the look is decided) and the dock page background is not transparent, so the character sits in an opaque square (finding K2).
- **Would use it, but** "this is just HeyClicky that I made": the edge over HeyClicky is not visible in the screens. See "The question: how are we better" below.

## Findings, in order of importance
**High (decides the next work)**
- **K. The look and the card.** The card is crowded, answers are in a small hard to read box, the drop ring is too compact. A full UI pass, with the hero (find, fix, proof, undo, why) as the star.
- **K2. Flowflow sits in an opaque square.** `style.css` gives every page (the dock included) an opaque background (`html, body { background: var(--bg) }`) and the dock page does not override it. The window is transparent, the page is not.
- **K3. No motion or physics yet.** Poses change by state, but nothing moves like water.
- **A. Stale errors.** "Explain an error" on an error that was already fixed: the model invented a cause ("the script came after the button", which is wrong) and moved the script tag for no reason. A fix from an error must first check the error still applies, and if not say "already fixed" and change nothing. Add an eval case "stale error".

**Medium**
- **D. Nothing visible when the explain key finds nothing selected** (in Cursor): the app logged the key and showed nothing. A "nothing selected" message must always show.
- **M. The Show me key only opens a box;** the one step voice way (hold Option+Space and speak) is what people want. Make the Show me key start listening at once.
- **E. The cost estimate shown before a fix (25 cents) was about eight times the real cost (3 cents).**

**Low**
- B. An empty hidden `.claude` folder is created inside the person's project.
- F. The explain task is labelled only "Off the record task".
- G. A step's label in What I did shows the engine's own words ("Do only this step, keep the change small").
- H. People look for Undo in What I did, where there is no button (it is on the receipt on the Now tab).
- I. The app's own event log records no approvals, so it cannot prove one happened.
- J. The model said "The Squibby hook is blocking me" ("hook" is jargon).
- L. Hotkeys: only a short list of presets (by design: a free key recorder would have to read key events, rule 8). Proposal: tick the modifiers and pick the letter from a dropdown, with a plain clash message.
- N. A plain question is answered under "What changed"; call it "Answer".
- Mistakes of mine to fix in the script: the Explain key (E) explains a *selected error*, it is not "why it broke"; Stop everything is X, not K.

## The question: how are we better than HeyClicky
Honest answer, from what was used today and from the research:
- **What was used today is mostly the guide** (voice, pointing, where to click). On that, HeyClicky is ahead on polish, Windows and drawing (v1.1.1, 23 Oct 2026).
- **Where Squibby is genuinely different:** it works from the project's own checks to find the real failing line; it makes a short plan with a cost before spending; it fixes, **proves** the fix (browser check, tests), keeps an **undo point** that restores exactly, files a receipt, **explains why** in plain words, asks before touching private settings, refuses to write secrets, and has one key that stops everything. HeyClicky never mentions coding.
- **The problem is visibility:** proof, undo, receipts and cost are buried, so the first minutes look like another screen guide. The redesign must put the hero first: **Problem, then Fix, then Proof, then Undo**, on one calm screen.

## Next, in order
1. See what the founder sees: turn off "Hide from screen sharing" in Settings while designing, so screenshots capture Squibby.
2. Fix the opaque square and add motion (squash, stretch, jelly lag, ripples) with the existing pictures.
3. Redesign the answer card and the hero flow (UI pass), from the founder's references.
4. Fix the quick findings (A, D, M, E, F, G, H, J, N, B) in one round.
5. A second Mac session after 2 and 3.
