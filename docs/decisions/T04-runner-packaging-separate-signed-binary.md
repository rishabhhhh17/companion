# T04. Runner packaging: a separate, still Anthropic signed Claude binary

- **Status:** Accepted from research; open items checked in M0 spike (b). Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 4; section 5 (also section 1 prototype lesson five, section 19 pitfalls 3, 4, 5, 12, 13 and 16, section 20 questions 3, 4 and 11); M0-desk-research-details.md section (b)
- **Related:** F02, T01, T02, T03

## Decision
The runner is compiled with `bun build --compile` once per target and shipped as a Tauri sidecar. The Claude Code binary ships as its own, still Anthropic signed executable, copied in through `bundle.macOS.files` and never as an `externalBin`, and the runner passes its path in `pathToClaudeCodeExecutable`.

## Why
- It keeps Anthropic's signature intact. A second signature replaces Anthropic's, which is the most literal reading of "modified" (section 5).
- The Terminal login gets a stable path to the same binary the agents use (T03).
- A Bun compiled runner cannot find the bundled binary on its own (pitfall 4).
- The macOS binary in SDK 0.3.291 is 233 MB, signed "Developer ID Application: Anthropic PBC (Q6L2SF6YDW)"; the Windows one is 253 MB.

## Alternatives considered
- Embedding the binary and extracting it to a temp folder at runtime with `extractFromBunfs()` (section 5).
- Node SEA (section 1, row 4).
- M0 plan B, if Apple refuses to notarize the nested binary: leave it out of the app. On first run, download the pinned SDK platform package (source not yet designed), copy the binary into Application Support, still Anthropic signed, and rerun the codesign and SHA-256 checks on the copy before first use (M0-spikes.md, spike (b)).
- Last resort, or if download size hurts conversion: the user installs Claude Code with Anthropic's own installer, accepting version skew.

## What this means for the build
Target names, entitlements and the `PATH` fallback list are in technical_research.md section 5. Rules a coding agent must never miss:
- Never ship the Claude binary as an `externalBin`: Tauri re-signs every `externalBin` with `codesign --force`. Use `bundle.macOS.files` (for example `"MacOS/claude"`), which Tauri copies but never signs. Fallback: `tauri build --no-sign` plus our own signing script.
- Stage the copied binary in a `vendor/` folder (`app/vendor/` for the product, `spikes/b-sidecar/vendor/` in the spike), always ignored by git. The `binaries/` folder holds only the runner sidecar.
- Copy it byte for byte from the matching optional dependency at build time. CI asserts it exists for every target, that `codesign` shows `TeamIdentifier=Q6L2SF6YDW`, and that its SHA-256 matches the npm file (pitfalls 3 and 5).
- Bun 1.4.2 or newer (older builds carry ad hoc signatures that macOS 27 kills). Three naming schemes meet, so the build script uses a lookup table.
- One `bundle.macOS.entitlements` file covers everything Tauri signs; start with `allow-jit` and `allow-unsigned-executable-memory`.
- Import `@anthropic-ai/claude-agent-sdk/core` only. Spawn the runner from Rust, never from the webview (pitfall 16).
- Read the login shell `PATH` once with our own `$SHELL -ilc` call, a 3 s timeout and a fixed fallback list (pitfall 13). A fresh Mac's `/usr/bin/git` is an installer stub, so onboarding runs an environment doctor (pitfall 12).

## Open [verify] items
- **[verify]** notarization accepts a nested executable carrying another team's Developer ID signature (section 20, question 3). Only a real submission settles it; new teams have waited 1 to 2 weeks on notary error 7000.
- **[verify]** the minimum entitlement set for our Bun runner under the hardened runtime.
- **[verify]** login shell `PATH` with fish (untested; the fallback covers a failure).
- **[verify]** whether the bundled Claude binary calls git on its own when a session starts; needs a fresh Mac or a virtual machine.
- Whether bundling Anthropic's binary byte for byte inside our DMG is fine with Anthropic: part of the written question (T03).

## Settled by desk research (7 Oct 2026)
- One entitlements file goes to every signed target, with no per sidecar set (section 20, question 4).
- Anthropic's own Bun binary runs with `allow-jit` and `allow-unsigned-executable-memory`.
- `$SHELL -ilc` fails under nushell; the fallback list covers it.
- Bundled git (dugite-native) is GPL-2.0 and 41 to 66 MB, so the alpha uses an environment doctor (section 20, question 11).

## Revisit if
Spike (b) fails: notarization rejects the nested Anthropic binary (then weigh the M0 plan B above), the runner launched from Finder cannot run one `query()` through the separately shipped binary, or `codesign -dv` no longer shows Anthropic PBC. Also revisit if the DMG size (roughly 150 to 300 MB) hurts conversion.

## Update, 29 Oct 2026: bundling the Claude binary is not allowed under the standard terms
Anthropic support wrote (`docs/outreach/anthropic-support-reply-4-2026-10-29.md`) that bundling or redistributing the Claude Code CLI inside our product is not permitted under the standard terms and needs a separate agreement. Their suggested pattern: install Anthropic's own build at first run, or resolve the SDK package through normal package resolution, instead of shipping the binary in the app bundle. The research said bundling the unmodified binary was fine; it was wrong for the standard terms. **Until the founder decides, nothing ships with the binary inside (no public build).** The proposed change (M22): the app fetches Anthropic's own build at first run, pinned to the SDK's version and checked (Anthropic's signature and the published hash) before it is used; AGENTS.md rule 4 changes with the founder's yes.
