# M23: Answer in the notch

**Asked by the founder, 29 Oct 2026:** "do it" (the next steps after M22), and make it feel like a real product. HeyClicky's agents ask with "Allow once", "Always allow" and "Not now" right where the work shows. Ours asked only inside Home.

## What changes
1. **The notch opens by itself when the AI needs an OK.** It drops open under the notch with the question, without taking the keyboard (rule 9). It stays the bare notch while Home is open, because Home already shows the question. A new switch, Open the notch for questions, is on by default.
2. **Answer right there.** For questions that can be taken back (going online, installing, a file outside the project, a settings file) the card has Allow and Don't allow. Allow means this once only, never a blanket yes.
3. **Risky questions still go to Home.** Anything that cannot be undone (send, pay, delete, go live) and anything that changes the person's git shows one button, Look first, which opens Home on the question. Rule 13 is unchanged.
4. **No accidental yes.** The buttons work only after the card has been on screen for 600 ms, so a pointer that happens to sit where the panel springs open cannot answer.

## Tests first
- `islandPanel.test.ts`: which risks are answered in the notch; the 600 ms arming; the approval card carries its id and risk; the answer is always "once".
- `island.rs`: a question opens the panel under the wings unless Home is open; with the switch off it does not.
- The settings registry test learns the new switch.
