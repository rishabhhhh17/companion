# F24. The product is called Squibby; the water character is Flowflow

- **Status:** Founder decision, 22 Oct 2026 ("let's just go with squibby"; "the water character name should be flowflow").
- **Date:** 2026-10-22
- **Related:** AGENTS.md rule 21 (names live in one strings file, never in logic), F04 (abstract characters), F12 (names open)

## Decision
The product's name is **Squibby**. It replaces the working name "Companion" everywhere a person reads it: the app, its messages, the site and the docs people see.

**The water character is Flowflow.** It is the first creature (F20), the one for the Flow group: find the problem, fix it, prove it, undo it, explain it. Its look and art still come from the founder (memory: the founder supplies the characters). Other groups' characters keep placeholder names until the founder names them.

## What does not change
Internal identifiers stay as they are, so nobody's data, keys or permissions are lost: the bundle identifier (`dev.companion.app`), the Keychain item names (`companion`), the data folder (`~/Library/Application Support/Companion`), the repo and folder names, the protocol and code names. Changing any of these is a separate decision with a migration.

## How the rename is done
After the work in flight merges (make me something agents, Second Look wiring, the guide's gaps): one shared name file read by the pages, the runner and the Rust shell, so the next rename is one line. Then every user facing "Companion" reads the name from it, tests included, and the Flow character is called Flowflow wherever a character is named (`protocol/groups.json` and the strings file). The `.app` bundle name (`productName`) changes in the same step, checked with a real build and launch (memory: a build change can break launch while tests pass).

## Done (22 Oct 2026, m14/rename-squibby)
The in code rename is done as planned, in one step:
- **One file:** `protocol/names.json` (product, possessive, character, practice copy folder start, parent folder for new folders, and the earlier practice copy start that must still be recognised). The pages read it in `app/src/strings.ts` (`PRODUCT`, `PRODUCT_S`, `NAMES`), the engine in `runner/src/names.ts`, the usage proxy in `usage-proxy/src/names.ts`, and the shell in `app/src-tauri/src/names.rs` (`include_str!`) plus `build.rs`, which hands the names to the compiler so shell sentences can be built with `concat!(.., crate::product!(), ..)`. The lesson files hold `{product}`, filled when the engine loads them.
- **Every user facing "Companion" reads the name from it**, tests included (`runner/test/names.test.ts` fails if the old name is left in a sentence a person reads outside a short allow list with reasons, or if the pages, engine and shell stop reading the one file or disagree about which names exist). The Flow character is `Flowflow` in `S.characterName`.
- **`productName` is `Squibby`**, so the bundle is `Squibby.app`. The program inside it is still `companion-app` (Tauri names it after the package, not the product), so nothing that starts it by that name changed. `app/scripts/*.sh`, `docs/releasing.md` and the launch scripts follow the new bundle name; `stage-engine.sh` also copies `names.json` into the engine, or the packed runner would fail on start.
- **Kept on purpose (identifiers):** `dev.companion.app`, the Keychain items, the data folder names (`Application Support/Companion`, `.../dev.companion.app`), `.companion/`, `COMPANION_*`, protocol fields, the update key's Keychain name, the code and crate names.
- **Earlier name still recognised:** practice copies named `Companion practice ...` (and their house rules first line) and notes blocks in `AGENTS.md` / `CLAUDE.md` written under the old name are still found, removed and updated.
- **Not done here:** the public site and domain, the legal drafts, the dated research and status documents, and the developer only real run scripts under `runner/scripts` and `evals`.

## Risks the founder heard before choosing
- "Damp squib" (a disappointment) is a common phrase in British and Indian English. Worth hearing how five people react.
- Sound alikes in use: Simon Squibb's free AI mentor app; Bristol Myers Squibb (pharma). Different fields, but a trademark search in the US and India should be done before launch (add to `docs/launch/legal/lawyer-questions.md`).
- Check the domain (squibby.com, squibby.app) and social handles.
