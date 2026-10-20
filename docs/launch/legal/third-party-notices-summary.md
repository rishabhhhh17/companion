> **DRAFT. Not legal advice. For a lawyer to review before it is published.**
> A summary and a pointer. The full licence texts are in `THIRD_PARTY_NOTICES.md` (repo root) and `app/ACKNOWLEDGEMENTS.txt` (ships inside the app and opens from Settings). Checked against those files on 20 Oct 2026. Versions and counts change, so regenerate before each release.

# Third party software in [Product name]

[Product name]'s own code is written for it. It is built from other people's software. Each part is used under its own licence. The full notices are here:

- **In the app:** the Acknowledgements page (Settings). File: `app/ACKNOWLEDGEMENTS.txt`. It lists 353 libraries (Rust and JavaScript) grouped by licence text. A test in the suite fails if it goes stale. **[unproven for a release build: confirm the count and that the file inside the signed app matches the one in the repo.]**
- **In the repo:** `THIRD_PARTY_NOTICES.md` for ideas and code credits.

## Shipped inside the app

| Part | Who | Licence or terms | Notes |
|---|---|---|---|
| **Claude Code binary** | Anthropic PBC | Anthropic's Commercial Terms and legal agreements (https://code.claude.com/docs/en/legal-and-compliance). All rights reserved | Included **unmodified**. It is not re-signed. The build compares its checksum before and after signing. Not our software and we grant no rights in it. "Powered by Claude" style statements are allowed. We never name or style anything as Claude Code |
| **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`, pinned to an exact version) | Anthropic PBC | "All rights reserved. Use is subject to the Legal Agreements" (its LICENSE file) | Used in the engine. Also under the Commercial Terms |
| **Bun** | Oven / the Bun project | MIT (as listed in the acknowledgements) | Runs the engine. Bun itself bundles other software, listed on its site **[unproven: confirm that Bun's own bundled-licence notice travels with the app]** |
| **Tauri 2** and its plugins | Tauri contributors | MIT or Apache-2.0 | The Mac app shell and the updater and global-shortcut plugins |
| **React and the page libraries** | various | mostly MIT | Listed in the acknowledgements |
| **Rust crates** (hundreds) | various | mostly MIT or Apache-2.0. **5 are MPL-2.0** | MPL-2.0 is a file level licence: those crates' own files stay open, ours do not. We do not edit those crates. **[lawyer: confirm no extra step is needed to satisfy MPL-2.0 for a binary-only release.]** |

## Downloaded by the person's Mac, not shipped

| Part | Who | Licence | When |
|---|---|---|---|
| **Whisper model "ggml-base"** (about 140 MB) | OpenAI Whisper; whisper.cpp by Georgi Gerganov | MIT | When the person presses Download for hold to talk. Fetched from huggingface.co. Checked against a known fingerprint. Runs on the Mac |
| **Playwright browser and tools** (about 100 MB) | Playwright, a Microsoft project | Playwright is Apache-2.0. The browsers it installs have their own licences (Chromium, BSD style and others) | When the person presses "Get the browser check". Fetched from cdn.playwright.dev. A small video tool (ffmpeg build, about 1 MB) comes with Playwright's installer and is not used by the app **[lawyer: ffmpeg is LGPL or GPL depending on the build. We do not ship or invoke it, but check this is acceptable]** |

## Ideas credited, no code copied

- **Clicky** (https://github.com/farzaa/clicky, MIT, Copyright (c) 2026 Farza). It prompted the technique of asking the Computer Use tool where to click, and the idea of checking other displays. No Clicky code is in the repo. The MIT text is kept in `THIRD_PARTY_NOTICES.md` anyway. **[lawyer: see the question about copied MIT code in `lawyer-questions.md`. The claim "no source is copied" was taken from the repo's own note, not independently checked.]**

## Mac tools the app uses that are part of macOS

`sips`, `textutil`, `afconvert`, `avconvert`, PDFKit via `osascript`, ScreenCaptureKit, Accessibility, the Mac's text reader (Vision) and the Mac's speech voices. They belong to Apple and are used through macOS's own interfaces. The app does not ship them.

## Not used in the current build

- ffmpeg (file conversion): deliberately not added, because of a licence question (decision F19).
- Rive (character animation): planned, a paid seat. Not in 0.1.0.

## Trademarks

Claude and Anthropic are trademarks of Anthropic PBC. Apple, Mac, macOS and Keychain are trademarks of Apple Inc. Vercel, GitHub, Playwright, Hugging Face and others named here belong to their owners. [Product name] is not made, endorsed or sponsored by any of them.

## Before each release

1. Regenerate `app/ACKNOWLEDGEMENTS.txt` and run the suite.
2. Check the Claude binary checksum before and after signing.
3. Re-read Anthropic's legal page for changes.
4. Update this summary if a new bundled part is added.
