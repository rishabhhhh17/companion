# M22: Anthropic's Claude installed at first run, never inside the app

**Decided by the founder, 29 Oct 2026:** "Install at first run", after Anthropic support wrote that bundling the Claude Code CLI inside our product is not permitted under the standard terms (`docs/outreach/anthropic-support-reply-4-2026-10-29.md`). Expected volumes for the contact-sales request: 1,000 to 10,000 people in year one.

## What changes
- **The app no longer carries Anthropic's binary.** The staged engine (`app/scripts/stage-engine.sh`) leaves out the SDK's platform package (`@anthropic-ai/claude-agent-sdk-darwin-arm64`, the `claude` binary, about 236 MB).
- **At first run the app installs Anthropic's own build** the way the SDK itself gets it: the exact platform package version the runner is pinned to, from the public npm registry. Before it is used:
  1. the download's sha512 must equal the one in our lockfile (`runner/bun.lock`), so it is byte for byte the build we test;
  2. the binary must carry Anthropic's own signature (Developer ID Application: Anthropic PBC, team `Q6L2SF6YDW`, identifier `com.anthropic.claude-code`), checked with `codesign`;
  3. it is never changed or re-signed.
  It goes to Squibby's folder in Application Support, one folder per version, and every engine start is told where it is (`COMPANION_CLAUDE_BIN`).
- **The first run gets a step "Getting Claude ready"** with real progress, after the recorded fix and before Connect. If it fails it says why in plain words and offers Try again. Home says the same if the install is ever missing or damaged.
- **An update of the SDK pin** installs the new version on the next launch, then removes the old one.

## The rules that change (founder's yes, 29 Oct 2026)
- AGENTS.md rule 4: from "ship Anthropic's Claude binary unmodified inside the app" to "install Anthropic's own build at first run, pinned, checked by hash and signature, never changed, never inside the app".
- AGENTS.md rule 20: the binary is the pinned SDK version's, installed by the app; never a `claude` found on PATH (unchanged).
- T04 is updated with the same.

## Also
- `docs/outreach/anthropic-contact-sales-2026-10-29.md`: the message for https://claude.com/contact-sales (volumes, integration shape, the distribution question). The founder sends it by hand.

## How it is built
Tests first: the pin read from the lockfile matches the runner's SDK pin, the download address, the hash check (a single changed byte is refused), the signature check (another team, another identifier, an unsigned file are refused), where it goes, the status the pages see, the step in the first run, and that the staged engine no longer contains the binary. The full suite and the app build; nothing merged without the founder.
