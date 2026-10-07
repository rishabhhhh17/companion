# T12. One screen capture and a snapped pointer

- **Status:** Accepted from research; open items checked in M0 spike (e). Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 12; section 14 (also sections 3, 18, 19 and 20); M0-desk-research-details.md section (e)
- **Related:** F07, F11, T01, T10

## Decision
For Show me how, Rust takes one ScreenCaptureKit capture of the display under the cursor, with Companion and password managers excluded, then redacts and resizes it on the device. Claude picks a target through a custom `point_at` tool. Rust snaps that point to an accessibility element or an on device OCR box, and a non activating overlay per display draws the pointer.

## Why
- Model coordinates are approximate, and a missed resize is the most common cause of misaligned ones; snapping makes them exact (section 3).
- Only about 33% of Mac apps expose complete accessibility data, so OCR is the second signal (section 14).
- Claude Code's own computer use needs an interactive session and a claude.ai login (section 3).

## Alternatives considered
- Continuous capture: not now; passive watching is dropped (F11).
- Raw model points: approximate, and they drift if the image is resized (pitfall 34).
- `xcap` (deprecated capture API), or trusting `sharingType = .none` to hide windows (not reliably honoured).
- `captureImage(in:)` for the zoom crop: it ignores the content filter, so excluded apps would appear.

## Pending founder decision (only if spike (e) confirms Claude Code keeps received images on disk)
None decided. Only two options keep the rule "captures of the user's screen are never written to disk":
1. API key users' Show me how calls go straight to the Messages API, so images never pass through Claude Code.
2. A supported no disk mode from Anthropic.

Pointing `CLAUDE_CODE_TMPDIR` at a Companion owned folder and wiping it after each answer still writes the screen to disk for seconds. It changes the promise exactly like rewording it, and needs the founder's explicit yes. For plan users, without an Anthropic switch: Show me how works only with an API key, or the promise changes. No Show me how code until the founder picks.

## What this means for the build
The pipeline is in technical_research.md sections 14 and 3. Rules a coding agent must never miss:
- The indicator lights **before** any capture. One press means one `SCScreenshotManager` capture, with a content filter that excludes Companion, password managers, Keychain Access and banking apps the user adds. The frame stays in memory; Companion never writes it to disk.
- Redact first: secure text fields, plus card numbers, IBANs, API keys and tokens found by OCR; refuse while secure keyboard input is on. Tell the user how many were blurred.
- Pre resize to at most 2000 px on the long edge, about 1280 px by default, well under about 3.75 MB. Treat Claude Code's "original ..., displayed at ..." note as an error in development, and scale coordinates by the resized size (pitfall 35).
- The vision session sets `strictMcpConfig: true`, `persistSession: false` and `settingSources: []`; `system/init` must list only `point_at`, `zoom` and `finish` (T10). A low confidence `zoom` crops the frame already in memory, with no second capture.
- The overlay is hidden unless a walkthrough runs; a walkthrough captures again only while it is visibly on.
- Screen Recording and Accessibility are asked at first use; never edit the approvals file. Keep Clicky's MIT notice.

## Open [verify] items
- **[verify]** (high impact) whether Claude Code writes received images to disk. The 2.1.288 binary suggests an image store under `/tmp/claude-<uid>` or `CLAUDE_CODE_TMPDIR` that only a diskless launch mode (not exposed by the SDK) skips. Spike (e) watches the folders during a real run.
- **[verify]** image resizing: answered from reading the 2.1.288 binary (a 2000 x 2000 px cap for Sonnet 5.5 and Opus 5.5, recompression above about 3.75 MB raw). Spike (e) confirms on 2.1.291 (section 20, question 14); the pre resize rule holds either way.
- **[verify]** whether macOS shows its purple capture icon for a single frame, and for how long (section 20, question 15).
- **[verify]** the Accessibility hit test may return Companion's own window, or a coarse element in Chrome.
- **[verify]** the roughly monthly Screen Recording re prompt on macOS 26 and 27 (confirmed only for macOS 15).
- **[verify]** Windows OCR through `Windows.Media.Ocr` (section 20, question 19).
- Overlay click through broke in a macOS 26.3 release candidate and reportedly again in a 26.4 beta; smoke test it on every point release (pitfall 38).

## Revisit if
The internal eval of about 100 screenshots misses the ship bar: at least 80% hits, with a median under about 2.5 seconds from hotkey to pointer (targets, not sourced; section 14).
