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

## Revisit only if
Real users on real Macs show that a switched off group is what they came for, or that Still reads as broken.
