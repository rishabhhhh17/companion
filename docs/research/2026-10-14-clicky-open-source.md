# Clicky's open source code: what is there, what we may use, what we should not (14 Oct 2026)

**Source:** https://github.com/farzaa/clicky (MIT licence, about 7.7k stars, last pushed 28 Apr 2026). The README says the code stays open as a snapshot and that "all the new stuff" (HeyClicky) is private, so everything newer than April 2026 (walkthroughs, drawing, progress log, teaching skills) is **not** public. A clone, https://github.com/shujanshaikh/glide (MIT, Swift), exists too; other "HeyClicky clones" on GitHub have no licence, which means all rights reserved: do not copy those.

**Licence note.** MIT allows copying and changing the code, including in a paid product, as long as the copyright notice and licence text travel with the copied code. If any code is ever copied, add it to a `THIRD_PARTY_NOTICES.md` and to the acknowledgements page (already on the launch list). Nothing has been copied so far.

## What is in it

A Swift/Xcode macOS menu bar app plus a small Cloudflare Worker that holds the API keys. Anthropic for the model, AssemblyAI for speech to text, ElevenLabs for spoken replies. Screen capture with ScreenCaptureKit, a cursor overlay that flies to a point, push to talk through a global key monitor, Sparkle for updates.

## Why almost none of it can be copied

| Piece | Why not |
|---|---|
| Everything is Swift | Our shell is Rust with a web page; Swift cannot be dropped in, only ported |
| Cloudflare Worker that holds keys and proxies calls | Our rule 1: never route anyone's Claude usage; keys stay in the Keychain |
| AssemblyAI (speech to text) and ElevenLabs (spoken replies) | Cloud services that receive the user's voice or text and cost money; we do speech on the Mac |
| Push to talk through a global key monitor | Needs Input Monitoring; our rule 8: never ask for it, never read key events |
| Analytics file | We count locally and send nothing |
| Sparkle updater, design system | We use Tauri's updater and a web UI |
| Overlay and cursor flight | We already have our own, with the window clipping rule that HeyClicky lacked |

## The one idea worth testing

`ElementLocationDetector.swift` finds where to point by calling Anthropic's **Computer Use tool** (`computer_20251124`, beta header `computer-use-2025-11-24`) instead of asking the model for a free-form coordinate. Their comment says the tool "activates Claude's specialized pixel-counting training". They also resize the screenshot to the Anthropic-recommended size closest to the display's shape (1024x768, 1280x800 or 1366x768) and declare that size, then scale the answer back. That is a technique, not code to copy; it would be our own TypeScript.

**Why it is not done:** it needs a direct call to the Anthropic API with the user's API key (the beta tool cannot be passed through Claude Code), so it would work only on the API key route, not a plan login, and it needs a real run on an API key to measure whether it beats our current aim (OCR candidates plus the Mac's accessibility structure, aim eval in `evals/show-me-how`). Our standing rule is real runs only on the test plan login. If the founder wants this tried, the plan is: build it as an optional lane behind the API key route, run the aim eval both ways with the founder's key (small cost), keep it only if it is clearly better, and note the technique's origin in the acknowledgements.
