# Launch readiness, 9 Oct 2026

How to read it. **Built** = the code exists and automatic tests pass (runner 1192, Rust shell 167, pages 168). **Real Claude** = also checked with a real Claude run on the test login (10 of 10 scenarios pass). **Person tried** = the founder has used it on a real Mac. **Confidence** = how sure I am it works for other people's Macs today.

## Overall

| Measure | Where we are |
|---|---|
| Alpha features written and tested by machine | about 85% |
| Alpha features also tried by a person on a real Mac | about 40% |
| Ready to hand to a stranger (installer, privacy page, website, billing, Apple) | about 50% |

## The engine and the trust layer

| Part | Built | Real Claude | Person tried | Confidence | What is left or weak |
|---|---|---|---|---|---|
| Engine (runner, protocol, Keychain key, task log, budgets, daily limit) | Yes | Yes | Yes | High | Nothing known |
| Safety (hooks, sandbox, deny rules, key scrub, house rules) | Yes, hardened | Yes (sandbox probes) | Partly | High | Installs inside the sandbox need Node 20 or newer; Mac only |
| Undo, snapshots, receipts | Yes | Yes | Yes | High | Never touches your git, as designed |
| App shell (non activating panels, docking, hotkeys, Stop everything, tray) | Yes | n/a | Yes (focus, full screen, hotkeys) | Medium-high | Sleep and wake, idle CPU, Stage Manager, a second display not yet checked |
| Proof ladder and the "Not done" rule | Yes | Yes | Yes | High | 3 of the 5 planned broken test projects (Next.js, Supabase left) |

## Do the work (Build mode)

| Part | Built | Real Claude | Person tried | Confidence | What is left or weak |
|---|---|---|---|---|---|
| Drive (plan, approve, step by step, take the wheel, fix loop breaker) | Yes | Yes | Plan card only | High | Hands-on run of a full plan |
| Rescue, Research | Yes | Yes | No | High | |
| Second model review | Yes | Yes | No | Medium | Off unless switched on; not on in the app by default |
| Decision cards at real forks | No | n/a | n/a | n/a | Only the "keeps failing" card exists; plan goals are saved |
| Ship safety gates (secrets, database access, proof on the exact version) | Yes | Yes | No | High | |
| Put it online: preview, check, Make it live, Roll back (Vercel) | Yes | No (stand in only) | No | Low-medium | Never run against real Vercel; needs `vercel login`; Vercel may protect previews |
| Cloudflare as a host | No | n/a | n/a | n/a | Plan names it the default for static sites |

## Help you use AI better

| Part | Built | Real Claude | Person tried | Confidence | What is left or weak |
|---|---|---|---|---|---|
| Prompt help (hotkey, read, rewrite, diff, paste back, restore) | Yes | Partly | TextEdit only | Medium | Claude desktop, ChatGPT, Chrome, Cursor, Lovable, Terminal not tried; clipboard alert check open |
| Show me how (look once, cover secrets, ask, snap, arrow and ring, next step) | Yes | Aim only: 48/48 on test pages, 41/44 on 8 real sites (3 declined hidden links), about 2.6 s | No | Medium-low until tried | Needs Screen Recording; the arrow overlay, button snapping and full screen apps never seen on a real screen; walkthrough does not advance on your click yet |
| Screenshots never on disk | Yes | Yes (disk check) | No | Medium-high | Rests on an in-memory drive; founder to confirm the reading of rule 5 |
| Hold to talk | Yes | Speech yes (exact sentence, 0.18 s) | No | Medium | Microphone permission and a real voice never tried; model download untried in the app |

## Grow with you

| Part | Built | Real Claude | Person tried | Confidence | What is left or weak |
|---|---|---|---|---|---|
| Project memory, profile, What I know page, off the record | Yes | Yes | No | High | Page never looked at by a person |
| Shared AGENTS.md and CLAUDE.md | Yes | Yes | No | Medium-high | Other tools' behaviour assumed from the convention; no Gemini pointer file |
| Explain | Yes | Yes | No | High | |
| Where was I | Yes | Partly | No | Medium | Opens after 30 minutes away; trigger never felt in use |
| First run (key to Keychain, folder, choices, Mac check, first task) | Yes | n/a | No | Medium | Never walked through by a person |
| Project folder choice | Yes | n/a | No | Medium-high | Prompt help does not yet know which project an editor has open |

## Not built yet

| Part | Status |
|---|---|
| Presentation mode for calls (camera and microphone in use) | Not built (only hiding over full screen apps) |
| Privacy page with "delete everything" | Not built |
| Settings screen (change hotkeys, show over full screen apps, voice options) | Not built |
| Drag a folder onto the character | Not built |
| Crash and log export | Not built |
| Acknowledgements page (Clicky MIT notice and other licences) | Not built |
| Four of five characters, finished art | Placeholder shape only (you said later) |
| Notice for you (Loop Closer, Pattern Catcher, saved tasks) | Planned v1.1, not started |
| Phone approvals, Telegram, project shelf, timelapse, billing code | Beta, not started |
| Windows | Not started |

## Launch work

| Part | Status | Who |
|---|---|---|
| Signed, notarized installer and automatic updates | Dev builds are signed; entitlements and microphone sentence ready; updater not built | Apple approval is yours; the updater and the notarization steps are mine afterwards |
| Website, downloads page, changelog home | Not started | You |
| Billing and plans | Not started | You, then the Plus switch in the app is mine |
| Privacy policy, terms | Not started | You |
| Where feedback and bugs go | Not decided | You |
| Anthropic's written word on plan sign in | Waiting; the plan route stays behind a switch | You |

## Known risks I would not hide

- Anything that needs a macOS permission (Show me, voice, Prompt help in other apps) is the least proven, because the permission clicks need a person.
- Show me how is accurate on web pages. A real Mac screen (native apps, tiny controls, two displays) is harder, and macOS asks again for screen recording about monthly.
- The Vercel flow has only met a stand in.
- Cost: a real run of everything costs a few dollars of Claude use per day on the cheap model; Opus for Rescue costs more. Users pay their own.
