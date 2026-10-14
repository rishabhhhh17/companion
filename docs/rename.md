# When the name changes (AGENTS.md rule 21)

"Companion" is a placeholder. Today the name lives in about 58 source files (11 in `app/src`, 27 in `runner/src`, 15 in `app/src-tauri/src`, 5 lessons) plus the docs, not only in `app/src/strings.ts`. Most of those are plain sentences the person reads. Do the rename in two parts, because some uses are identifiers that must **not** change blindly.

## 1. Words the person reads (safe to find and replace)

`grep -rIn "Companion" app/src runner/src app/src-tauri/src lessons docs/alpha` and replace the word inside sentences: card text, error messages, lesson text, the privacy and install notes, the dialog that confirms Delete everything. Next step worth doing before a rename: move these sentences into `strings.ts` (runner messages and Rust dialogs still carry them inline).

## 2. Identifiers (change on purpose, with a migration, never by search and replace)

| Where | Why it is special |
|---|---|
| `app/src-tauri/tauri.conf.json` `productName`, `identifier` (`dev.companion.app`) | The identifier is the app's identity to macOS: permissions (Screen Recording, Accessibility, Microphone), the Keychain access list and the data folder are tied to it. Changing it makes macOS treat it as a new app, so every permission is asked again |
| Keychain service name (`keystore.rs` `SERVICE`) | A renamed service cannot find the saved key; the person would have to enter it again unless the old item is read once and moved |
| Data folders: `~/Library/Application Support/dev.companion.app`, `.../Companion` (hidden browser), WebKit and Caches folders (`wipe.rs`, `logexport.rs`, `voice_mac.rs`, `phelp.rs`) | Delete everything and the support log know these paths; a rename must update them together and move existing data |
| `.companion/` inside the person's projects | Project notes folder; renaming leaves old notes behind unless migrated |
| Environment names (`COMPANION_DATA`, `COMPANION_ENGINE`, ...) | Internal; rename together in runner, Rust shell and scripts |
| `app/scripts/*.sh`, `docs/releasing.md`, update address and key name (`Companion update key`) | The update key and address are tied to the first public release; do not rename after releasing |
| Signing identity and notarization profile (`companion-notary`) | The founder's own Apple setup |

Best time to rename: **before the first public release**, when no one has data, permissions or an installed copy to carry over.
