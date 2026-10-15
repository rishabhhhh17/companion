# Plan: narrow who can read the API key (for approval)

## The gap
The key is saved and read through Apple's `security` command line tool (`app/src-tauri/src/keystore.rs`, `runner/src/keychain.ts`). Any program on the Mac that runs `security find-generic-password -s companion -a anthropic -w` can then read it without a prompt, because the tool is the item's trusted program.

## Goal
Only Companion (and the engine it starts) can read the key without a prompt. Any other program gets the Mac's own "allow?" dialog.

## Why it is not a small change
1. The reader must stop being `security`. The Rust shell has to save and read the key itself through Apple's Security framework (one new dependency, `security-framework`, MIT or Apache, already in the build tree through other crates).
2. The engine today reads the key itself every time it needs it (so a key saved a minute ago works). It would have to ask the shell instead. That needs two new protocol messages, a handoff that never goes through logs or events (redaction tests first), and fixtures on both sides.
3. Keys already saved by `security` need a one-time move: the shell reads the old item (the Mac shows one "allow" dialog), saves it again under its own trust, deletes the old one.
4. The Mac only treats a rebuilt app as the same app if it is signed with the same identity. Development builds use a stable Apple Development certificate; the release build will use Developer ID. The trust must be re-checked after each change of identity.

## Build order (tests first)
1. Protocol: `auth.key_request` / `auth.key_value`, never logged; fixtures; redaction tests that prove the key never reaches a log, event or receipt.
2. Rust `keystore`: save, read, exists, delete through the Security framework, with throwaway `companion-test-` items only.
3. Runner: ask the shell for the key, keep the old `security` path only for headless tests.
4. Migration of an existing item, with plain-word wording for the one Mac dialog.
5. Hands-on check on the founder's Mac: fresh install, migrated install, other program refused, key replaced, Delete everything.

## Needs from the founder
- Approval of this plan.
- About ten minutes on the Mac for step 5, because only a real Mac shows whether the dialog and the trust behave.

## Not doing
No change to how the key reaches Claude Code (still only the engine's own process, scrubbed from every child).

## Status (15 Oct 2026)
Built, on branch: steps 1 to 4. The handoff is simpler than first planned: the app pushes `auth.key` to the engine's pipe after every `runner.hello` and after a key is saved, so no request message is needed. The engine takes it before parsing, keeps it in memory only, and a page cannot send it (it is not in the page protocol).
Step 5, the hands-on check, is still open: fresh install, a key saved by the old version (one Mac dialog), another program refused, replacing the key, Delete everything.
