# T13. Voice transcribed on the device with Whisper

- **Status:** Accepted from research; open items checked in M0 spike (f), or in M2 if the founder picks the lean M0 plan. Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 13; section 15 (also sections 18, 19 and 20); M0-desk-research-details.md section (f)
- **Related:** F07, F11, T01

## Decision
Voice uses on device Whisper (whisper.cpp through Rust bindings) behind a hold to talk hotkey. No cloud speech.

## Why
- Claude takes images, PDFs and text, not audio (section 15).
- Claude Code's own `/voice` dictation streams audio to Anthropic, needs a claude.ai login, does not work with an API key, and is a terminal feature, not an SDK call (section 15).
- No per minute cost, and the same code runs on Windows. It covers about 99 languages including Hindi (section 15).
- It integrates an existing open model; it is not a voice engine of our own (product_research.md section 4).

## Alternatives considered
- Cloud speech to text, or a voice engine of our own: dropped because of per minute cost (product_research.md section 11).
- Claude Code's own dictation: needs a claude.ai login.
- Apple SpeechAnalyzer and SpeechTranscriber: need macOS 26 and launched with about 10 languages, no Hindi.
- Windows built in dictation: its grammar runs on a Microsoft web service.

## What this means for the build
Details are in technical_research.md section 15. Rules a coding agent must never miss:
- Default model: `base` or `small`, quantized (for example base-q5_1 about 57 MiB, small-q5_1 about 181 MiB; full precision base 142 MiB, small 466 MiB). It downloads when the user turns voice on, never bundled in the DMG.
- Read Handy (MIT, v0.9.8, Tauri, React and Rust) before writing the voice module. Use the Tauri global shortcut plugin, which needs no permission, not Handy's default `handy-keys` event tap, which needs Accessibility.
- Key down opens the microphone and the character shows Listening; key up closes it. The transcript appears in the ask box. No wake word. The kill switch hotkey also closes the microphone.
- The hotkey is a normal key plus modifiers: the permission free Carbon path cannot register fn or a modifier held alone.
- Add `NSMicrophoneUsageDescription` to `Info.plist` and `com.apple.security.device.audio-input` to the entitlements file, because Tauri turns on the hardened runtime. Ask on first use; treat all zero buffers as "microphone blocked".
- Recovery for a missing microphone entry: `tccutil reset Microphone <Companion bundle id>`, never without the bundle id (that resets every app on the Mac), then a full quit and relaunch.
- The ask box accepts paste and never swallows Cmd+V, so Wispr Flow and macOS Dictation work. Test both.
- Speaking back is off by default; the opt in uses `AVSpeechSynthesizer` system voices.
- Spike (f) passes when hold to talk gives text in under about one second after release for a short sentence with `base` (section 18).

## Open [verify] items
- **[verify]** the release event still fires when the user lets go of the modifier before the main key.
- **[verify]** whether `SpeechTranscriber` supports Hindi on macOS 27; print `supportedLocales` on the founder's Mac.

## Settled by desk research (7 Oct 2026)
- Rust bindings: spike (f) tries `whisper-rs` 0.16.0 (Unlicense; `metal` feature on; needs cmake) first, pinned and vendored because it is dormant with open memory leak bugs, with VAD run through `WhisperVadContext` (not `FullParams`). Plan B is `transcribe-cpp` (MIT), which Handy uses (section 20, question 20).

## Revisit if
After v1, add Apple's SpeechAnalyzer as an optional engine on macOS 26. One third party benchmark found it more accurate and faster than Whisper Small on English (secondhand) (section 15).
