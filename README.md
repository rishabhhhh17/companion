# Companion

*Working name. Every name here will change.*

**Companion helps you finish what you start.** It's a desktop app for people who start projects with AI and get stuck: students, non technical founders, creators. Small abstract characters live on the edge of your screen. Through them you get one companion that:

- **does the work:** builds, rescues and ships your project, proving each step works, letting you undo almost all of it, and telling you clearly what can't be undone
- **helps you use AI better:** turns a rough prompt into a clear one in any app, and points at the screen to show you where to click
- **notices for you:** tells you where you left off when you come back
- **grows with you:** explains what it did in plain words, and remembers how you like to work, in a page you can read and edit

Mac first, Windows soon after. Downloaded from our website, not an app store.

## Status

**Day 1 (7 Oct 2026).** Nothing runs yet. The repo holds the research (fact checked on 7 Oct), the decisions and the plan. The first milestone, M0, is a set of small throwaway experiments that check the hardest technical risks before any real code is written. Its plan is proposed and waiting for approval: `docs/milestones/M0-spikes.md`.

## What we promise

- **Bring your own Claude.** You use your own Anthropic API key or cloud account. Using your Claude plan is planned, once Anthropic confirms it in writing. We never pay for, resell or sit between you and your Claude usage. Powered by Claude.
- **It never watches you.** Your screen, other apps' text and your microphone are used only when you press a hotkey, with a visible light, and Companion never saves them. (M0 also checks that the Claude engine underneath keeps screenshots off disk.)
- **"Done" means proven.** Builds and tests pass, a real browser opens your app, and only then does it say done.
- **Everything is undoable** except what it clearly tells you is not (like going live), and those always need your tap.
- **It's a productivity tool,** not an AI friend.

## How it's built

A Tauri app (Rust plus React) for everything you see and everything that touches the operating system. A TypeScript "runner" for agents, safety, undo and memory. Anthropic's own Claude Code engine, unmodified, does the AI work through the Claude Agent SDK. The full picture is in `docs/architecture.md`.

## Where to read more

| Doc | What it's for |
|---|---|
| `docs/research/product_research.md` | What we're building and why |
| `docs/research/technical_research.md` | How to build it |
| `docs/decisions/` | Decisions already made, one short record each |
| `docs/architecture.md` | Every feature and the part of the code that owns it |
| `docs/milestones/` | The plan for each milestone |
| `AGENTS.md` | Rules for coding agents working in this repo (humans should read it too) |
| `CHANGELOG.md` | What changed, in plain words |

## Licence

Not decided yet. Until it is, all rights reserved.
