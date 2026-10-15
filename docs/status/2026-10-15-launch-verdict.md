# Launch verdict, 15 Oct 2026

**Short answer: not launch ready yet. Close, and the remaining gaps are mostly things only the founder can do.**

## What was checked (by machine, no sound, nothing on the founder's screen)
- Full suite (`sh scripts/test-all.sh`): runner, rescue-projects eval (15 cases), Rust, pages (301 tests), licence notices. Green on main after PR 80.
- Four review rounds over the engine, the Mac shell and the pages. Every confirmed finding was fixed and merged.
- `bun audit`: no known problems in 72 packages.
- `cargo audit` could not run here (the advisory list could not be fetched). Run it once with internet.

## What is solid
- Safety: layered checks, macOS sandbox, no key in agent processes, undo by shadow snapshots (now with a confirm step and an honest "Undone").
- Proof: "done" needs evidence; skipped checks are shown as partly checked.
- Stop: one hotkey reaches agents, walkthroughs, capture, voice.
- Updater, installer, settings, Delete everything, log export all built.

## Not proven (needs a real Mac and the founder)
1. **Hands-on session**: Screen Recording, Accessibility, microphone, real Cursor/Lovable/Vercel pointing. Nothing visual was tested on a real screen.
2. **Apple approval and notarization**: no signed installer yet.
3. **Anthropic**: Commercial Terms, and the written reply on plan login (until then the API key route only).
4. **Update key and public releases repo** (updater stays off until then).
5. Character designs, product name, privacy policy, terms, billing, review of INSTALL.md and PRIVACY.md drafts, the T12 rule-5 reading.

## Known engineering risks (not fixed)
- Keychain access list for the API key is not narrowed to the app.
- Cost shown after Stop may under-count the turn that was cut off mid-way. The engine books every turn that finishes or stops cleanly; the SDK reports no cost for an interrupted one, so this cannot be fixed on our side.
- Ignored files (gitignored) are not covered by undo.
- Project scripts run unsandboxed once approved.
- A website that resolves to a private address could slip past the network check (DNS).
- AGENTS.md / CLAUDE.md pre-snapshot creation edge case.
- Lessons are drafts: marked "tried" only after a real run.

## Can it handle everything?
No. It handles the common stuck moments in web projects well in tests. Odd project layouts, huge repos, other languages and anywhere-mode pointing on unusual apps are best effort and will fail sometimes; the card says so in plain words instead of guessing.

## Next
Finish the founder-side list, then one hands-on session, then a small friends preview.

## Addendum, checks run after the verdict
- Full suite run four more times: three passed. One run failed with test durations of 10 to 17 minutes for tests that take milliseconds, so the Mac slept mid-run; the next run passed in about 3 minutes. Not a logic failure, but run it again before any release.
- `sh app/scripts/build-app.sh` succeeds: Companion.app (354 MiB) signs with the development certificate, the signature verifies, Claude's binary is unchanged, no Dock icon. The app was built, not opened.
