# T09. Remote approvals through our own relay

- **Status:** Accepted from research; open items checked in M10. Updated 7 Oct 2026 after review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 9; section 10 (also sections 18, 19 and 20)
- **Related:** F09, F10, T05, T06

## Decision
Phone approvals go through Companion's own relay: a Cloudflare Worker with one Durable Object per pairing, X25519 pairing by QR code, sealed payloads and signed approvals. A home screen web app (PWA) with push comes first. A Telegram bot comes second, for summaries and low risk approvals only.

## Why
- Anthropic's own phone surfaces do not fit. Remote Control needs Pro, Max, Team or Enterprise and does not accept API keys. Dispatch needs Pro or Max (section 10).
- WhatsApp bans assistant style bots from 15 Jan 2026 (section 10; product_research.md section 1, decision 9).
- The relay sees only ciphertext, push subscriptions and timing (section 2). Push messages carry no content, just "Companion needs you"; the phone fetches and decrypts on open (section 10).
- Web Push works on iOS and iPadOS 16.4 and later with no Apple Developer membership (section 10).

## Alternatives considered
- Native phone app: not now (section 1, row 9).
- Anthropic Remote Control or Dispatch: needs a claude.ai plan, so API key users would be left out (section 10).
- Telegram as the main path: bot chats are not end to end encrypted, so it gets summaries only, never code, diffs or secrets (section 10).
- WhatsApp: banned for assistant bots (product_research.md section 1, decision 9).

## What this means for the build
Details are in technical_research.md section 10. Rules a coding agent must never miss:
- Every approval carries `approvalId`, `checkpointId`, `toolUseId`, a hash of the exact tool input, a nonce and `expiresAt`. The phone signs over all of them. The runner checks signature, nonce and expiry and applies the decision only if that tool call is still pending (section 10; section 19, pitfall 26).
- Long waits return `defer` from `PreToolUse`. The turn ends with `stop_reason: "tool_deferred"` and resumes on the same `session_id` when the answer arrives, so no process sits waiting for an hour (section 10).
- Going live and anything irreversible need the signed phone app path. Telegram can approve only low risk categories (section 10; section 19, pitfall 25).
- Onboarding walks the user through Add to Home Screen with screenshots, because that step is the main friction for non engineers (section 10).
- The laptop must stay awake while agents run; cloud continuation is out of scope for v1 (product_research.md section 9).
- M10 checks: an iPhone approval resumes a deferred tool call; a replayed approval is rejected; relay logs hold no plaintext; Telegram cannot approve going live (section 18).

## Open [verify] items
- **[verify]** X25519 support for non extractable WebCrypto keys in iOS Safari; fall back to libsodium WASM (section 10; section 20, question 8).
- Whether iOS 26 changed Web Push requirements (Declarative Web Push) was not verified (section 10; section 20, question 8).

## Revisit if
The docs name no trigger. Look again only if the M10 checks show that iOS Web Push or the PWA key storage cannot carry signed approvals even with the libsodium WASM fallback. The listed alternative is a native phone app.
