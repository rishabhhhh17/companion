# F01. Global from day one, Mac first, Windows next

- **Status:** Fixed. Founder decision; do not reopen without the founder. Updated 7 Oct 2026 after review.
- **Date:** 2026-10-06
- **Source:** product_research.md section 1, decision 1
- **Related:** F02, F04, T01, T04, T11, T12, T13

## Decision
Companion is global from day one, not India first. It ships on the Mac first, with Windows shortly after on the same codebase.

## Why
- Mac users pay, and the founder dogfoods on a Mac (product_research.md section 1, decision 1).
- One codebase keeps Windows close: Tauri 2 plus React gives one UI for Mac and Windows with small RAM, which suits a solo founder (technical_research.md section 1, decision 1).
- Global pricing is handled by automatic regional prices through a merchant of record (a company that sells on our behalf and handles tax in each country), for example about ₹299 a month in India, payable by UPI (product_research.md section 15).

## What this means for the build
- Pick tools that run on both systems: Tauri 2.12 and React, `tauri-nspanel` on macOS, a small `windows-rs` layer later (T01).
- Every Mac only API has a planned Windows twin: UI Automation and `SendInput` paste for Prompt help, Windows.Graphics.Capture for Show me how, the same local whisper code for voice (technical_research.md sections 13 to 15).
- Characters dock on the side edges, never the notch, so the design works on Windows and external monitors (product_research.md section 4).
- The runner compiles once per target, including Windows x64 and arm64 (`bun-windows-x64`, `bun-windows-arm64`), and the matching Claude binary comes from the SDK's `win32-x64` and `win32-arm64` packages. The build script maps the three naming schemes (technical_research.md section 5; T04).
- Windows needs stricter ask rules routed to approvals, or an optional WSL2 mode (Linux running inside Windows), because the Claude Code sandbox does not run on native Windows (technical_research.md section 4).
- Windows signing from India is limited: an OV certificate (a Windows code signing certificate for a verified person or company) for an individual (roughly $100 to $400 a year **[verify]**), a Store listing as a secondary channel only, or a US entity (technical_research.md section 4).
- Order: Mac alpha from late Nov 2026, a Windows build in the invite only beta (Jan to Mar 2027), a signed public Windows build in mid 2027 (product_research.md section 18). M11 must pass the M1, M3, M5 and M6 suites on Windows 11 (technical_research.md section 18).
- Voice covers about 99 languages including Hindi, so nothing in copy or input is India only (product_research.md section 4).

## What it rules out
- Section 11 row: "India first, Windows first, rupee only pricing", replaced by global, Mac first, regional pricing.
- A native Swift shell, which would double the work for Windows (technical_research.md section 1, decision 1).
- Mac only designs with no Windows path, such as docking at the notch.

## Revisit only if
The founder decides to.
