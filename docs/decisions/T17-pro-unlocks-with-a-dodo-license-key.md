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
- **The 14 day trial with no card runs inside Squibby** (F25). It is offered only after the first proven fix.
- **The usage proxy carries no Pro traffic.** No Claude usage goes anywhere new (rule 1), and F22 stays off.
- **Payments stay off until the founder switches them on** (F25). While they are off, nobody is gated.

## Calls made with it (31 Oct 2026)
- One Settings, inside Home. The separate Settings window is retired.
- The silver becomes flat: one fill, one edge of light, no band. It sits on one main button per screen. The founder asked for this on 31 Oct ("everywhere on the silver lining, there's always a random middle line").
- The Deep theme is hidden. Paper stays, with its own tested tokens.
- The menu bar sun goes, as F28's bare notch asks.
- Delete everything keeps the trial date (payments spec, option 1), so a trial cannot restart by deleting.

## Why
- It is the smallest design that sells Pro without a server holding anyone's data.
- It keeps the person's Claude usage untouched.

## Revisit only if
- Dodo's public license endpoints change.
- The founder wants accounts across devices.
