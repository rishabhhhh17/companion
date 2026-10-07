# F02. Direct download from our website

- **Status:** Fixed. Founder decision; do not reopen without the founder. Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** product_research.md section 1, decision 2
- **Related:** F01, F10, T01, T04

## Decision
Companion is downloaded from our own website. The Mac App Store and the Microsoft Store are not the primary channel.

## Why
- It is a founder decision (product_research.md section 1, decision 2; section 11).
- On Tauri 2.12.1 or later, transparency no longer needs `macOSPrivateApi`, and whether the always on private API path passes Mac App Store review is unconfirmed. Either way, it does not matter for direct download (technical_research.md section 4; T01).
- The first run starts with "Download from the website, open, pick a character" (product_research.md section 4).

## What this means for the build
- Sign with a Developer ID Application certificate from the $99 a year Apple Developer Program. Notarize (send the build to Apple's malware check, so it opens without a warning) and staple (attach Apple's approval to the file, so the check works offline) both the app and the DMG; Tauri notarizes and staples only the app, so the DMG is our own step (technical_research.md section 4; M0-desk-research-details.md, Tauri signing row).
- Auto update with `tauri-plugin-updater`. Back up the minisign key (the private key that signs our updates) offline; if it is lost, no installed user can get updates again. Host `latest.json` and the update files on GitHub Releases (technical_research.md section 4; section 19, pitfall 20).
- Expect a DMG of roughly 150 to 300 MB, because Anthropic's binary ships inside it. Keep big extras out: the whisper model downloads when voice is turned on, and Playwright's Chromium downloads on first proof (technical_research.md sections 5, 7, 15).
- Homebrew comes later through our own tap **[verify]** current homebrew/cask notability rules (technical_research.md section 4).
- On Windows, sign with an OV certificate (a code signing certificate for a verified person or company; roughly $100 to $400 a year **[verify]**) or a qualifying US entity. EV certificates (the pricier, more strictly checked kind) no longer give instant SmartScreen reputation; SmartScreen is Windows' warning for unknown apps (technical_research.md section 4).
- Plus billing runs through a merchant of record (a company that sells on our behalf) that handles global tax (product_research.md section 15).
- Milestones: M0 spike (b) proves a notarized DMG; M2 carries signing into CI so testers can install from M4; M9 hardens signing, updates and the environment doctor (technical_research.md section 18).

## What it rules out
- Section 11 row: "App Store or Microsoft Store as the main channel", replaced by direct download.
- The Mac App Store as the main channel, which matches the Decision and section 11. Product doc section 1, decision 2 reads "No Mac App Store". If the founder means no Mac App Store listing at all, this line changes to say so once the founder confirms.

## Revisit only if
The founder decides to. A Microsoft Store MSIX listing (MSIX is Windows' app package format; free for individuals, no SmartScreen warning) may be added as a secondary Windows channel without reopening this (technical_research.md section 4).
