# F24. The product is called Squibby

- **Status:** Founder decision, 22 Oct 2026 ("let's just go with squibby").
- **Date:** 2026-10-22
- **Related:** AGENTS.md rule 21 (names live in one strings file, never in logic), F04 (abstract characters), F12 (names open)

## Decision
The product's name is **Squibby**. It replaces the working name "Companion" everywhere a person reads it: the app, its messages, the site and the docs people see.

## What does not change
Internal identifiers stay as they are, so nobody's data, keys or permissions are lost: the bundle identifier (`dev.companion.app`), the Keychain item names (`companion`), the data folder (`~/Library/Application Support/Companion`), the repo and folder names, the protocol and code names. Changing any of these is a separate decision with a migration.

## How the rename is done
After the work in flight merges (make me something agents, Second Look wiring, the guide's gaps): one shared name file read by the pages, the runner and the Rust shell, so the next rename is one line. Then every user facing "Companion" reads the name from it, tests included. The `.app` bundle name (`productName`) changes in the same step, checked with a real build and launch (memory: a build change can break launch while tests pass).

## Risks the founder heard before choosing
- "Damp squib" (a disappointment) is a common phrase in British and Indian English. Worth hearing how five people react.
- Sound alikes in use: Simon Squibb's free AI mentor app; Bristol Myers Squibb (pharma). Different fields, but a trademark search in the US and India should be done before launch (add to `docs/launch/legal/lawyer-questions.md`).
- Check the domain (squibby.com, squibby.app) and social handles.
