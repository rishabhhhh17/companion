# F09. Remote approvals through a phone web app and Telegram

- **Status:** Fixed. Founder decision; do not reopen without the founder. Updated 7 Oct 2026 after review.
- **Date:** 2026-10-06
- **Source:** product_research.md section 1, decision 9
- **Related:** F10, F11, T05, T06, T09

## Decision
Users follow progress and approve decisions from their phone through a home screen web app (PWA) and an optional Telegram bot. WhatsApp is excluded.

## Why
- Meta has barred general purpose AI assistants from its WhatsApp Business API since 15 Jan 2026 (product_research.md section 1, decision 9).
- A home screen web app gets push notifications on iOS 16.4 and later without an Apple developer account (product_research.md section 9).
- Anthropic's own phone surfaces do not fit: Remote Control needs a Pro, Max, Team or Enterprise plan and does not accept API keys, and Dispatch needs Pro or Max (technical_research.md section 10).
- A Telegram bot is free and has approve and deny buttons (technical_research.md section 10).

## What this means for the build
- Our own relay: a Cloudflare Worker (a small program on Cloudflare's servers) with one Durable Object (a tiny store with its own state) per pairing. It stores only ciphertext (scrambled data it cannot read) and never sees plaintext (technical_research.md section 10; T09).
- Pairing by QR code with X25519 keys (the way phone and laptop agree on a shared secret key). X25519 support in iOS Safari is **[verify]**, with libsodium WASM (the same crypto as a library that runs in the browser) as the fallback (technical_research.md section 10).
- Every approval is signed over the approval id, checkpoint, tool use id, a hash of the exact input, a nonce (a number used once) and an expiry, so it can never approve a different command or replay later (technical_research.md section 10).
- Push messages carry no content ("Companion needs you"); the phone fetches and decrypts on open (technical_research.md section 10).
- Telegram is not end to end encrypted. It gets summaries only, never code, diffs or secrets, and may approve only low risk actions. Going live and anything not undoable need the PWA (product_research.md section 9).
- Long waits use `defer` (an answer that parks the tool call until later) from `PreToolUse` (the safety check that runs before every tool call), so the session ends cleanly and resumes when the answer arrives (technical_research.md section 10).
- Add to Home Screen is the main friction, so onboarding walks through it with screenshots (technical_research.md section 10).
- The laptop must stay awake while agents run (product_research.md section 9).
- Ships in the beta (M10). An approval from an iPhone must resume a deferred call; Telegram must not be able to approve going live (technical_research.md section 18).

## What it rules out
- Section 11 row: WhatsApp for remote control or as a Loop Closer source, replaced by the phone web app and Telegram, plus "paste or export a chat".
- A native phone app for now (technical_research.md section 1, decision 9).
- Cloud continuation while the laptop is closed, out of scope for v1 (product_research.md section 9).

## Revisit only if
The founder decides to.
