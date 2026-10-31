# T17. Pro unlocks with a Dodo license key, checked on the Mac

- **Status:** Accepted, 31 Oct 2026. The founder left the open calls of the overhaul and payments specs to the build ("U tell me", 30 Oct, F28) and asked for Dodo to be integrated. Not yet proven against Dodo's test mode.
- **Date:** 2026-10-31
- **Source:** `docs/design/2026-10-31-dodo-payments-spec.md`, `docs/design/2026-10-31-uiux-overhaul-spec.md`
- **Related:** F22, F25, F28, rules 1, 2, 9 and 13

## Decision
- **Pro is a Dodo license key, checked on the Mac.** There is no Squibby account and no Squibby server for Pro at launch.
  - Dodo's activate, validate and deactivate license endpoints need no API key (Dodo's docs mark them "No API Key Required"), so the app never carries a secret.
  - The key is stored in the Keychain.
- **Checkout and billing open in the person's own browser:** checkout is a Dodo link, and Manage billing is Dodo's customer portal. Squibby never shows a card field, a login form or an in app checkout window (rules 2 and 9).
- **The 14 day trial with no card runs inside Squibby** (F25, Option A). Settings offers it only after the first proven fix; the limit card and the card behind a Pro tag offer it always. It never starts on its own, and it runs once per Mac.
- **The usage proxy carries no Pro traffic.** No Claude usage goes anywhere new (rule 1), and F22 stays off.
- **Payments stay off until the founder switches them on** (F25). While they are off, nobody is gated.

## Calls made with it (31 Oct 2026)
- One Settings, inside Home. The separate Settings window is retired.
- The silver becomes flat: one fill, one edge of light, no band. It sits on one main button per screen. The founder asked for this on 31 Oct ("everywhere on the silver lining, there's always a random middle line").
- The Deep theme is hidden. Paper stays, with its own tested tokens.
- The menu bar sun goes, as F28's bare notch asks.
- Delete everything keeps the trial date (payments spec section 10, Option 2), so a trial cannot restart by deleting. The screen names what it keeps ("the date your trial started"), and the free fix count still starts again. Option 2, not Option 1: Option 1 would let anyone restart the 14 day trial with one button, and naming the one kept item on the screen keeps the wipe honest. An earlier draft of this record said "option 1" by mistake; the founder's call of 31 Oct 2026 is Option 2.
- The free plan is 3 proven fixes a calendar month. Undo does not give a fix back, and Bring the fix back never counts again, so fix, Undo, new fix, Bring back cannot keep more than 3. The activation limit (3 Macs) is a Dodo dashboard setting, not code.
- Only a definite answer from Dodo changes the plan. A 403 or 404 counts only when its body is Dodo's own JSON error, and a Keychain that cannot be read keeps the last plan; neither ever sends a paying person to the Free rules.
- Delete everything asks "Also turn off Pro on this Mac?" only while payments are on. Yes lets this Mac's activation go at Dodo and deletes the Pro key; no keeps the key, and the screen names it.

## Why
- It is the smallest design that sells Pro without a server holding anyone's data.
- It keeps the person's Claude usage untouched.

## Revisit only if
- Dodo's public license endpoints change.
- The founder wants accounts across devices.
