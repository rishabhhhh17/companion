# Decisions

One short record per decision that is already made, so nobody (human or agent) argues it again by accident.

- **F records** are the founder's fixed decisions from product doc section 1. They are not reopened without the founder.
- **T records** are the technical choices from technical doc section 1. They are accepted from the research. Their open **[verify]** items are checked in the spike or milestone named on each record. When one is resolved, update `docs/research/technical_research.md` and the matching record in the same change, and `AGENTS.md` too if a rule, a command or the repo map changes. If a check shows the research was wrong, the founder is told.
- T records stay short: the decision, why, the rules a coding agent must never miss, and open items. The detailed recipes live in the technical doc sections each record points to.

New decisions get the next number (F13, T16, and so on) and the same layout. A record is never deleted. If a decision changes, mark the old record "Replaced by <new ID>" (for example F13 or T16) and write a new one.

## Founder decisions (fixed)

| ID | Decision |
|---|---|
| [F01](F01-global-mac-first.md) | Global from day one, Mac first, Windows next on the same codebase |
| [F02](F02-direct-download.md) | Direct download from our website; no app store as the main channel |
| [F03](F03-agents-from-day-one.md) | Agents from day one |
| [F04](F04-abstract-characters.md) | Abstract characters docked on the side edges, with skins; never the notch |
| [F05](F05-optional-questionnaire.md) | Optional questionnaire, then visible learning |
| [F06](F06-two-paths-geeked-parked.md) | Two paths in one app; Geeked is parked |
| [F07](F07-curious-is-the-whole-companion.md) | The Curious path is the whole companion, not only Build |
| [F08](F08-modes-gated-on-retention.md) | Build first; Learn, Work and Team gated on retention |
| [F09](F09-remote-approvals-pwa-telegram.md) | Remote approvals through a phone web app and Telegram; no WhatsApp |
| [F10](F10-bring-your-own-claude.md) | Bring your own Claude |
| [F11](F11-never-watch-never-steal-focus.md) | Never watch passively; never steal focus |
| [F12](F12-names-open-yc-not-a-focus.md) | Names are open; YC is not a focus |
| [F13](F13-undo-never-writes-your-git.md) | Undo never writes your git: no undo helper, no per agent worktrees (7 Oct 2026) |
| [F14](F14-browser-check-for-everyone.md) | Every user, Free or Plus, gets the browser check (7 Oct 2026) |
| [F15](F15-launch-priorities-and-new-ideas.md) | Launch priorities (agents first, Prompt help, memory, Show me how last), the Pro memory idea, the website and onboarding (8 Oct 2026) |
| [F16](F16-rescue-tutor-is-the-launch-hero.md) | The rescue tutor ("stuck? press the key") is the launch hero; what is parked (10 Oct 2026) |

## Technical decisions (accepted, open items checked where shown)

| ID | Decision | Open items checked in |
|---|---|---|
| [T01](T01-desktop-shell-tauri-nspanel.md) | Desktop shell: Tauri 2 + React, non activating panels | M0 spike (a) |
| [T02](T02-engine-agent-sdk-pinned.md) | Engine: Claude Agent SDK, pinned to an exact version | M0 spikes (b), (g) |
| [T03](T03-auth-bring-your-own-claude.md) | Auth: API key default, cloud credential, plan login behind a switch | M0 spike (c), email to Anthropic |
| [T04](T04-runner-packaging-separate-signed-binary.md) | Runner packaging: Anthropic's binary shipped separately, never re-signed | M0 spike (b) |
| [T05](T05-safety-hooks-deny-rules-sandbox.md) | Safety: hooks, deny rules and the sandbox | M1 |
| [T06](T06-undo-shadow-git-snapshots.md) | Undo: shadow git snapshots outside the project | M1 |
| [T07](T07-proof-ladder.md) | Proof: exit codes first, eyes last | M3 |
| [T08](T08-ship-cloudflare-vercel-preview-first.md) | Ship: Cloudflare and Vercel, preview first | M7 |
| [T09](T09-remote-approvals-own-relay.md) | Remote approvals through our own relay | M10 |
| [T10](T10-model-routing-three-lanes.md) | Model routing in three lanes | M0 spikes (e), (g), Show me how eval |
| [T11](T11-text-read-ax-write-by-paste.md) | Read text through Accessibility, write back by paste | M0 spike (d) |
| [T12](T12-screen-capture-and-snapped-pointer.md) | One screen capture and a snapped pointer | M0 spike (e) |
| [T13](T13-voice-on-device-whisper.md) | Voice transcribed on the device with Whisper | M0 spike (f) |
| [T14](T14-local-data-markdown-and-sqlite.md) | Local data in markdown files and SQLite | M1 |
| [T15](T15-connectors-and-scheduled-tasks.md) | Connectors, folder watching and scheduled tasks | M12 |

Still pending, written in the T records as options only (nothing is built for them until the founder decides):
- T12: what to do if Claude Code keeps received screenshots on disk (spike (e) checks).
- T03: whether to offer the Console sign in route (`claude auth login --console`) to users. Testing it in spike (c) is approved; the offer is decided in M1.

Decided on 7 Oct 2026: the undo helper and per agent worktrees are dropped (F13, T06); every user gets proof rungs 1 to 5 (F14, T07).
