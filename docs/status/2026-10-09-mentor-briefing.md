# Companion: briefing for a technical mentor (9 Oct 2026)

## What it is
Companion (working name) is a Mac desktop app for non engineers who start projects with AI and get stuck. A small character lives on the screen edge and gives one companion across four jobs: help you use AI better (rewrite prompts in any app, point at where to click on your screen, talk to it), do the work (plan, build, check, undo, ship), notice for you, and grow with you (memory you can read and edit, plain explanations). The user brings their own Claude (API key in the Keychain). We never pay for, resell or route model usage. Direct download, Mac first, Windows next. Monetised through a Free and Plus subscription for the companion layer, not for model use.

## The bet
Many tools build with AI. Few make a non engineer finish. The differentiators are trust and proof: nothing is called "done" until it is checked, everything is undoable, nothing goes live without a tap, and the app never watches passively.

## Architecture
- **Shell (Rust, Tauri 2 + native AppKit):** windows are native non activating panels (never steal the keyboard), docking per display, global hotkeys, tray, Accessibility read and paste back (Prompt help), screen capture and text reading (ScreenCaptureKit, Vision), microphone and on device speech (whisper.cpp with Metal), Keychain writes.
- **Runner (TypeScript on Bun, a sidecar process):** talks to the shell in JSON lines (protocol v1, shared fixtures tested by both sides). Hosts the agent engine (Claude Agent SDK, pinned, Anthropic's own binary, unmodified), the safety layer, shadow git snapshots for undo, the proof ladder, ship gates, memory, and the fast and vision lanes.
- **Pages (React):** the character and a card, plain functions from events to what you see.
- **Shared core:** characters, agent engine, memory, trust layer. Every feature is a thin client of it.

## Technical decisions worth discussing
1. **Safety lives in code, not prompts:** PreToolUse hooks, deny rules, the macOS sandbox (network allow list, writes limited to the project), a shell parser that looks inside `sh -c`, `env`, `xargs`, protected `.git/.claude/.companion`, a short allow list environment for anything we run (no keys), account and injection variables stripped. Real Claude probes confirmed the sandbox blocks writes outside the project and reads of private folders.
2. **Undo never writes the user's git:** snapshots live in a separate shadow store, with limits for huge files, nested repos and links so a restore can never follow a link out of the project.
3. **"Done" is proven:** a ladder of checks (install, build, tests, start, a hidden browser that also presses buttons without ever sending a write), a guard against weakening tests, and a second model review. A failed check goes back to Claude for two tries, then says "Not done".
4. **Privacy as architecture:** screen, other apps' text and the microphone are touched only on a hotkey with a light first; secrets are blacked out on the Mac before any picture is sent. A real check found Claude Code saves every image it is sent to disk; we turned off the saved conversation and moved its temp folder to an in-memory drive.
5. **Speed work on the pointing feature:** from about 8 s to about 2.6 s by disabling thinking, using a one line JSON answer instead of a tool call, and returning the answer before the engine process finishes closing.
6. **Memory as plain files with provenance:** project memory in the project, a private profile, a strict filter (no health, money, relationships, moods, secrets), forgotten lines stay forgotten, an off the record switch, and a shared AGENTS.md so other tools see the same project facts.
7. **Bring your own Claude:** API key route is the default; the subscription route is behind a remote switch until Anthropic confirms in writing.

## What is built
Engine, safety, undo, proof ladder, Drive, Rescue, Research, house rules, take the wheel, daily spending limit, ship gates, put it online through the user's Vercel login (preview, browser check, Make it live, Roll back), memory page, Explain, Where was I, Prompt help, Show me how (capture, cover secrets, ask, snap to the real button, pointer overlay), hold to talk, first run (key to Keychain, folder choice, Mac check), project folder chooser.

## Evidence
- About 17,000 lines of code, 6,500 of them tests. Automatic tests: runner 1192, Rust 167, pages 168, all passing. 135 commits, 23 pull requests, about 3 days.
- A real Claude suite of 10 scenarios (rule and undo, plan and step checks, take the wheel, rescue, memory, explain, research, daily limit, second model review, ship gates) passes on a cheap model for under a dollar; it caught real bugs scripted tests could not (stop reported as a crash, daily limit counted late, Companion's own memory files read as the user editing, read only questions creating files).
- Pointing accuracy: 48 of 48 on rendered pages (light, dark, dense), 41 of 44 on 8 real sites (the 3 misses were hidden links, where declining is correct), about 2.6 s.
- Speech: a spoken sentence came back word for word in 0.18 s.
- A hardening pass with five audits fixed engine hangs, link following in undo, injection paths, accessibility and false "done" verdicts.

## Honest status
About 85% of the Alpha features are written and machine tested, about 40% have been tried by a person on a real Mac, about 50% is ready for a stranger. Least proven: anything needing a macOS permission click (Show me how on a real screen, the microphone, Prompt help beyond TextEdit) and the real Vercel deploy. Not built: privacy page with delete all, settings screen, presentation mode, acknowledgements, updater, Cloudflare host, 4 of 5 characters, Windows, phone approvals, v1.1 features. Launch work owned by the founder: website, billing, Apple developer enrolment and notarization, policies.

## Process
One milestone at a time with a written plan the founder approves; tests first for risky logic; decisions recorded (15 founder, 15 technical records); a quality bar in AGENTS.md (done means exercised for real, never round up unproven work, incidents stop work); changelog and a readiness table kept true.

## Questions worth asking a mentor
1. Is a Claude Code based engine the right long term core, or should the pointing and prompt lanes call the model API directly for speed and cost?
2. Pricing: Free versus Plus for a bring your own Claude product; what is the paid hook (proof, memory, voice, shipping)?
3. Distribution risk of depending on Anthropic's terms for plan sign in.
4. How to get to the first 10 real users and measure "first verified ship" and "first accepted Prompt help".
5. What would make a non engineer trust an app that can edit their files?
