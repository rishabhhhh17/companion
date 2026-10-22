# Squibby

*The product is called Squibby (F24, 22 Oct 2026). The repo folder, the bundle identifier and the code names still say companion on purpose, so nobody loses saved data. The names a person reads live in one file, `protocol/names.json`.*

> **Stuck while building with AI? Press the key. Squibby finds the problem on your screen, fixes it with you, and shows you why.**

Squibby is a Mac app for people who build with AI tools (Lovable, Bolt, Replit, Cursor, Claude Code) and get stuck. It lives on the edge of your screen as a small character. It:

- **finds the problem in your own project** (the real failing line or error) and points at it,
- **fixes it with you** in small steps, with a snapshot before each one so almost everything can be undone,
- **proves the fix** (build, tests, a real browser check, a before and after picture) before it ever says done,
- **shows you why** in plain words, a hand drawn sketch, or a guided lesson that waits for your own click,
- **works in any app on screen**, best effort, and says plainly when it is only guessing.

Mac first. Downloaded from our website, not an app store. The scope and order of work are in `docs/decisions/F17-teaching-engine-and-launch-scope.md`.

## Status

**14 Oct 2026.** Everything in the friends preview list is built and tested by machine except the character (waiting for the founder's designs). **Nothing has been tried by a person on a real Mac yet**, and there is no notarized build, so it is not ready to hand to a stranger. See `docs/status/2026-10-14-launch-readiness.md` for what is built, what is proven and what blocks launch.

## What we promise

- **Bring your own Claude.** You use your own Anthropic API key or cloud account. Using your Claude plan is planned, once Anthropic confirms it in writing. We never pay for, resell or sit between you and your Claude usage. Powered by Claude.
- **It never watches you.** Your screen, other apps' text and your microphone are used only when you press a hotkey, with a visible light, and Squibby never saves them. (M0 also checks that the Claude engine underneath keeps screenshots off disk.)
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
| `docs/status/` | Dated snapshots of what is built and what is proven |
| `docs/lessons.md` | How guided lessons are written (data files in `lessons/`) |
| `docs/releasing.md` | The founder's steps to release and set up updates |
| `docs/rename.md` | Every place the product name lives, for when it changes |
| `docs/alpha/` | The install note and privacy note for friends (drafts) |
| `docs/milestones/` | The plan for each milestone |
| `AGENTS.md` | Rules for coding agents working in this repo (humans should read it too) |
| `CHANGELOG.md` | What changed, in plain words |

## Licence

Not decided yet. Until it is, all rights reserved.
