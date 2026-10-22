# M11: match HeyClicky, beat it, make the hero the best (plan, 16 Oct 2026)

Approved to start by the founder on 16 Oct ("go"). Built from a read-only research pass: HeyClicky's full changelog to v1.0.53 (2 Oct 2026), its site, reviews and the April 2026 open source snapshot; our code read file by file; F15 to F17, AGENTS.md and the product research. Every status below was re-checked against the code by a second reader and downgraded where the code did not clearly show it.

## What HeyClicky is now
HeyClicky started as a screen tutor and is now a general Mac assistant: talk or type, it sees the screen, points and draws, runs agents ("Clickys") with their own memory, connects to Gmail, Notion, Slack and more, runs routines on a schedule, clicks and types for you (computer use), and dictates into any app. Plans bundle AI usage (Free, Pro $20, Max $100). Per-app teaching skills were paused in v1.0.49.

## Feature by feature

| HeyClicky feature | Us (checked) | Effort | Needs |
|---|---|---|---|
| Push to talk screen tutor (hotkey, one screenshot, spoken answer) | have weaker | M | founder Mac session, API spend |
| Modifier only push to talk chord, double tap and triple tap triggers | forbidden by our rules | S | founder decision |
| Custom shortcuts | missing | S | none |
| Cursor buddy that follows your pointer (Hide floating cursor switch) | cut by founder | S | founder decision (only if reopening F04) |
| Pointing at the right UI element with a label | have weaker | S | API spend, founder Mac session |
| Multiple monitors | partial | S | founder Mac session |
| Multi step pointing synced to narration | partial | M | API spend |
| Drawing on screen with hand drawn annotations | partial | M | founder Mac session |
| Spatial context: the user draws, points or circles to focus the AI | cut by founder | M | founder decision, founder Mac session |
| Step by step walkthroughs (up to 15 steps, notices your click, keeps the goal, running log, waits for slow pages) | have weaker | M | founder Mac session |
| Teaching skills for 89 apps, matched to the app or site in front | partial | L | founder Mac session, founder decision |
| Setups that start where you are and never repeat a failed step | partial | S | founder Mac session |
| Agents by voice with an intent classifier (no wake phrase, asks instead of guessing, holds off on 'wait') | partial | M | API spend |
| Agent cancel window and quick stop refund | have weaker | S | none |
| Follow ups to an agent (inline composer, hold the voice keys on the card, follow up chat) | missing | M | API spend |
| Live progress, stop, retry, parallel agents and the agent HUD | partial | M | none |
| Approvals: eager agent, Allow once, Always allow, Not now, Always approve | partial | S | API spend |
| Computer use: clicks and types for you in any app or browser | forbidden by our rules | M | founder Mac session |
| Browser tasks in a separate Chrome window with your signed in profile | forbidden by our rules | S | none |
| Types for you anywhere, and screen aware drafting (ramble to draft) | cut by founder | M | founder Mac session |
| System wide dictation (Fn+Control, streaming, cleanup, 50+ languages, hands free) | cut by founder | L | founder decision |
| Personal dictionary and vocabulary biasing | missing | S | none |
| Spoken replies: full replies, voice picker, kid friendly voices, 0.5x to 1.5x speed, library mode | partial | S | founder Mac session |
| Realtime voice as the default, Always On listening, barge in | forbidden by our rules | S | none |
| 70+ spoken languages | partial | M | founder decision |
| Text mode box with copyable, selectable replies and drafts that persist | have weaker | S | none |
| Home chat window (conversations, files, search, pin, archive, unread badge, quick peek, resizable, pop out) | missing | L | founder decision |
| Home in the Mac notch (menu bar icon and panel removed) | cut by founder | S | none |
| Drag in, attach or paste files, document preview, whole document understanding | partial (re-checked 22 Oct 2026: text and code files and pictures dragged or pasted into the ask box since wave 4; PDF, Word, rich text, OpenDocument text and Excel documents read as text on this Mac since M14, clipped to a limit in Settings; no preview of a document, and a long one sends only its start) | M | none |
| Clickys: persistent named agents with their own face, memory, files and chat, created by conversation | cut by founder | L | founder decision |
| Characters (Dreamy Cloud, Puff Pals) whose faces react to listening, thinking, talking and dozing | have weaker | M | founder art |
| Character style and cursor colour customisation | missing | S | founder art |
| Pin, search, archive and status indicators (working, needs you, unread) | partial | S | none |
| Routines (scheduled repeat tasks with failure pause, waits for wake and internet) | cut by founder | L | founder decision |
| Suggestions, morning hello, morning greetings and the suggestion carousel | forbidden by our rules | S | none |
| Proactive agents and local activity tracking (HeyClicky removed them in v1.0.46) | forbidden by our rules | S | none |
| App connections catalog (Google Workspace, Gmail, Notion, Linear, Slack, Calendar by voice, Spotify, Meta Ads, several accounts per app) | cut by founder | L | founder decision |
| Custom MCP connections (by URL or local command, token check) | missing | L | founder decision |
| Memory (PROFILE.md and VOLATILE.md given to voice and agents, remembers feedback such as 'you talk too much') | partial | S | none |
| Look back at the page you just left | forbidden by our rules | S | none |
| Self aware settings help (walks you to a setting, reports plan usage) | partial | S | none |
| Hands on onboarding tutorial, replay the tour, first three tasks end differently | have weaker | M | founder Mac session |
| Personalised setup interview (character style plus four questions) | have weaker | S | founder art |
| Permission setup and routing | have weaker | S | founder Mac session |
| Quiet on calls and screen sharing | partial (re-checked 22 Oct 2026: hide from screen sharing and quiet while a call app is in front, both settings on unless turned off, built in M11; the camera and another app's microphone checks are written and switched off until the founder's Mac session) | M | founder Mac session |
| Announcement switches and done announcements | partial | S | none |
| Microphone picker, mic failover, Bluetooth route following, muted Mac fallback | missing | S | founder Mac session |
| Model router, escalation to a deeper model, honest model disclosure | partial | S | API spend |
| Warm up for a fast first reply | missing | S | none |
| Permanent account deletion that also erases analytics | have weaker | S | founder Mac session |
| Sign in credentials kept in the macOS Keychain | have equal | S | founder Mac session |
| Privacy and trust practices (screen only on hotkey, analysis kept, cloud proxy, PostHog and Sentry) | partial | S | none |
| Plans with bundled AI usage (Free 25 messages, Pro $20, Max $100), extra usage approvals, quick stop refunds | forbidden by our rules | S | none |
| Yearly billing, student discount, UPI in rupees, Team plan | missing | M | founder decision |
| Invite and earn cash referrals | cut by founder | M | founder decision |
| In app changelog, 'See what's new' card, Update app button | partial | S | founder decision |
| Mac distribution (DMG from GitHub releases, macOS 14.2+), Windows waitlist, mobile signal | have weaker | M | Apple |
| Reliability: sleep and wake, display changes, a single running copy, idle CPU, keyboard focus released | partial | S | founder Mac session |
| Bug reports with logs, feature request and community links | partial | S | founder decision |
| Agents that build apps and do research ('make a Mac app for my todos', 'research customers') | have equal | L | API spend |
| Leaner agents (less setup per step, reuse what was read) | partial | S | API spend |
| Skills library, create a skill, team shared skills (HeyClicky removed them in v1.0.49) | partial | M | founder decision |
| Links open directly | missing | S | none |

Statuses: *forbidden by our rules* means AGENTS.md rules block it as HeyClicky does it (for example reading key events, always-on listening, a cloud proxy for keys); the closest allowed version is in the build list. *cut by founder* means F16 or F17 parked it; only the founder can unpark it.

## Better than HeyClicky (ours alone)

- **Done means proven: install, build, tests and a real headless browser check before anything says done** (have it, S (add a visible one time browser download and fix the doctor text)). HeyClicky has no proof at all. Every user gets the browser check (F14). Today it is blocked by one missing call: installBrowser() is never invoked, so every web project ends as 'partly checked'.
- **Undo any task from shadow snapshots, never touching the user's git** (have it, S (show it in the built app)). An agent mistake costs one tap, not a lost afternoon. Proven by the house rule and undo real run.
- **Test tamper guard (deleted or skipped tests, '|| true', checks that check nothing)** (have it, S). Stops the classic AI cheat of making tests pass by weakening them, which matters most for non engineers who cannot spot it.
- **Point at the real failing line in your own editor from the project's own checks, with no model** (have it, S (founder Mac session)). HeyClicky guesses from pixels. We find file and line from real tool output and ring it, with 280 of 280 found on drawn editor screens. It has not been seen in real Cursor yet.
- **Snapshot bisect: find which earlier task broke it** (to build, M). Runs the proof ladder over past shadow snapshots to name the task that first failed, then offers Undo for just that task. Nobody else has per task snapshots for this. No git writes.
- **Lessons built from the user's own project** (to build, M). project.inspect already knows the missing setting names. Generate a Vercel or Supabase walkthrough for exactly SUPABASE_URL in this project, with an env_name check that proves each step. Their skills are generic.
- **Proof after each walkthrough step from the project** (have it, S (rewrite the 12 lessons' checks)). They only detect a click. We can prove the setting exists or the file changed. The engine has env_name, file_exists and file_contains checks, but no shipped lesson uses them yet.
- **Error explainer from any app: select an error in Terminal, the browser console or a builder chat and press a hotkey** (to build, M). Reads the selection the Prompt help way (Accessibility, on hotkey only), explains it in two plain sentences, rings where it lives in the project with locate.ts, and offers Fix with proof.
- **'Your turn' fix teaching: Companion fixes the first case, rings the second similar spot, and the person fixes it, then proof checks it** (to build, M). Teaching rides inside the fix (the 98% against 17% finding in F16) and makes learning measurable. HeyClicky's agents do the work, so users learn less.
- **Explain built from the actual diff, for every step including Drive steps, with a check question** (to build, S). Today Explain uses file names and Claude's own words, and skips Drive steps. Built from the diff, 'why' becomes trustworthy teaching.
- **Cost guard for people who bring their own key: estimate first, per task budget, daily ceiling, total today, real tokens** (have it, S). There are no message quotas to run out. The person sees and controls real money. The ledger and budgets exist; the ceiling needs to become a setting and token counts need to be real.
- **Second model review of risky diffs (auth, payments, env, SQL, many deletes)** (have it, S). A second model reads the diff with every tool blocked before it is called done. It is built but the app cannot switch it on (COMPANION_REVIEW is not in ENV_ALLOWED).
- **Ship gates before going live: secret scan, Supabase row level security from migrations, preview first, rollback** (have it, M). It catches the most common harm AI builders cause in public (leaked keys, open tables). It has never deployed to real Vercel, and the live RLS query is not wired.
- **Deploy failure rescue: read the Vercel build log through the user's own CLI and ring the failing line** (to build, M). 'It works locally but the deploy failed' is a top stuck moment. A lesson draft (vercel-failed-deploy) exists, but nothing reads the log yet.
- **House rules in plain words, enforced in code** (have it, S). 'Never edit payments.ts' is a hook verdict, not a polite request in a prompt.
- **Honest pointing: solid ring only when confirmed, a soft ring called a guess, nothing at low confidence, clipped to the window** (have it, S (founder Mac session)). This directly avoids the wrong control and wrong app failures HeyClicky shipped and then removed.
- **Health report when opening a Lovable, Bolt or Replit export** (have it, S). Origin, stack, missing setting names, install needed and a Rescue diagnosis in one card. Neutral across builder tools.
- **Python projects in the proof ladder (pytest, ruff or mypy, Flask or FastAPI dev server)** (to build, M). Replit and Claude Code users often build in Python. Today they get 'nothing to check'.
- **Privacy by architecture: own key, no proxy, voice on the device, captures in RAM only, local opt-in counts** (have it, S). HeyClicky keeps screenshot analysis and prompts and sends everything through its proxy. Ours becomes provable once the fast lane persistSession bug is fixed.
- **Hide Companion from screen sharing and quiet during calls (presentation mode)** (built, weaker: re-checked 22 Oct 2026. Hide from screen sharing and quiet while a call app is in front are on; the camera and microphone checks wait for the founder's Mac session, so a call in a browser, or a share with another app in front, is not noticed yet). Rings and cards never leak into a Zoom share, and it stays quiet in meetings, within rule 7.
- **Accessibility as part of done: VoiceOver labels, keyboard only flows, reduced motion everywhere** (to build, M). Clicky has no reduced motion or VoiceOver support. Reactions already freeze under reduced motion. The rest is not built.
- **A small library of practice stuck moments (missing setting, wrong route, broken import, open table)** (built 19 Oct 2026 with no model; real runs and a person still owed, see `M11-real-run-checklist.md`, "The practice library"). People can see the full hero loop before they are stuck, and each one doubles as an eval case. Five in all with the signup page, in one catalog (`app/sample/practices.json`), on the Learn tab with progress kept on this Mac. A failed deploy practice is left out: a real one needs a Vercel account and a real failed deploy read through the person's own Vercel tool, and a fake deploy log in a local copy would teach a screen that never looks like that.
- **After a fix, ring the changed lines in the person's editor** (to build, S). Shows exactly what changed and where, reusing the Point at the problem path. It makes the receipt something you can see.

## Making the coding the best: measured with real runs (founder's API key, about $72 of $100)

- ($0) 0. Before spending: the founder creates a separate API key in its own Anthropic workspace, sets a workspace spend limit of $80 in the Console, and stores the key in a test Keychain item from Terminal (for example `security add-generic-password -s companion-eval -a anthropic -w`, which prompts for the value). Code reads it through COMPANION_KEYCHAIN_SERVICE. Nothing is pasted into chat. Every eval run uses the bundled binary, settingSources [], strictMcpConfig, a scrubbed env and a throwaway CLAUDE_CONFIG_DIR, with a per case maxBudgetUsd and a cumulative stop in the eval script.
- ($0) 1. Fix the defects that would waste spend, tests first: pass opts.memory into buildSdkOptions (sdkEngine.ts line 84) and resolve the '@AGENTS.md' import in projectNotes. Call installBrowser() behind a visible one time download so the browser rung runs. Set persistSession false in buildFastOptions. Move aim.ts from computer_20251124 to the computer_toolset_20260801 version the current API needs for Sonnet 5.5 and Opus 5.5 (the old version returns 400 there, so today the lane would always fall back) [verify the request shape]. Add COMPANION_REVIEW to ENV_ALLOWED. Set an explicit PreToolUse hook timeout. Move model ids into config (T10).
- ($0.5) 2. Smoke test the API key route (about 10 one cent calls): main engine on Sonnet 5.5, Rescue on Opus 5.5, fast lane on Haiku 4.5 and Haiku 5.5, and the vision lane on Sonnet 5.5 with thinking type 'disabled'. The raw API rejects that setting on Sonnet 5.5, and nobody knows yet whether SDK 0.3.293 translates it. Check that system/init lists only the expected tools.
- ($4) 3. Re-run all 13 real-verify scenarios on the API key route with the app's default models (Sonnet 5.5 build, Opus 5.5 Rescue and review). Add the scenarios that have never run: approve after waiting (allow path), Stop everything during a real task, and the loop breaker.
- ($8) 4. Build the coding eval (evals/fix-projects). Turn the 15 rescue-projects cases into full fix cases (problem.find, then fix, then the proof ladder). Add 10 realistic AI builder breakages: a missing setting the agent must ask about rather than invent, a browser-only React error, a broken import after a rename, a case-sensitive import that fails only on Linux or Vercel, a wrong fetch port, a useEffect loop, broken Tailwind config, a missing package script, a Supabase query against a renamed column, and a Python NameError. Each case has a HIDDEN acceptance check kept outside the project and run afterwards, so 'proof passed' cannot be gamed. Score fixed (hidden check), proof verdict, tests untouched, diff size, cost, time and turns. Baseline: Sonnet 5.5, 25 cases, one run each.
- ($12.5) 5. Model and effort sweep on the same cases: Haiku 5.5 on all 25 (cheap floor), Opus 5.5 at medium on the 12 hardest, Sonnet 5.5 at medium against high on the 12 hardest. Use the SDK's effort option only if the pinned version exposes it [verify]. Pick defaults by cost per fixed case, not cost per request. Expect Opus 5.5 (only 2x Sonnet's price) to win on Rescue fixes and multi-file errors.
- ($16) 6. Prompt hillclimb on the coding prompts, with a train split of 12 cases and a held-out test of 13. Replace the one sentence COMPANION_APPEND with a rescue engineer brief: reproduce with the failing check first, name the root cause in one sentence, make the smallest fix, never weaken tests, run the project's checks yourself, ask one question when a setting or decision is missing, and explain in plain words. Give the fix loop prompt the trimmed failing output, the located file and line, and the diff so far, and ask for a new root cause. Make differentPrompt list what was already tried. Three rounds on train, one final test run, reported on test.
- ($5) 7. Loop breaker set: 5 cases built to defeat the first fix (two stacked bugs, a flaky test, an impossible constraint, a missing secret, a wrong framework assumption). Measure how often the 'different approach' path rescues the task, and how often it stops and asks instead of thrashing. Extend loop.stuck to single tasks, not just Drive.
- ($8) 8. Rescue diagnosis eval: Opus 5.5 against Sonnet 5.5 on the 25 cases. Score whether the root cause matches a written label (key terms plus file), whether the first step is the right fix, and time to report (target about two minutes). The founder spot checks 10 for plain language.
- ($1.5) 9. Second model review catch rate: 10 seeded risky diffs (a secret written to code, an RLS policy opened, an auth check removed, a payment amount changed, a mass delete), reviewed by Opus 5.5 with tools blocked. Measure caught versus missed and false alarms on 5 clean diffs, then decide whether to turn review on by default for risky changes.
- ($6) 10. Aim eval on the API key route: the vision lane on Sonnet 5.5 and Haiku 5.5, and the Computer Use lane (after the toolset fix), on the existing 92 asks plus 40 hard renders of real busy public dashboards (headless browser, never the user's screen). Report snapped hit rate, soft ring rate and time. Make Computer Use the default only if it clearly wins.
- ($1) 11. Fast lane quality: run evals/prompt-help/run.ts --real on the 30 cases with Haiku 4.5 and Haiku 5.5, and score Explain on 25 diffs from step 4 (correct, plain, two lines). Switch to Haiku 5.5 if it holds quality, since Haiku 4.5 may retire after 15 Oct 2026.
- ($10) 12. Final regression with the chosen models, effort and prompts: all 25 fix cases plus the real-verify scenarios, recorded in CHANGELOG.md and the eval results file. Keep about $27 of the $100 for reruns and the founder's hands on session.

## Build order

1. No founder needed, no spend: fix the confirmed defects with tests first: memory dropped in SdkEngine.start; '@AGENTS.md' passed literally; persistSession missing in the fast lane and in off the record tasks; installBrowser never called; the Computer Use tool version; COMPANION_REVIEW not allowed; approval 'task' scope ignored; hook timeout unset; model ids in code; a daily ceiling that cannot be changed. Run scripts/test-all.sh and gate merges with &&.
2. Small UI fixes, no founder needed: a transparent dock tile and a visible 'thinking' state; show the hotkey hints; fix the wrong Prompt help hint; restore the clipboard after paste back; change or remove the key in Settings; tell 'never asked' from 'refused' in permissions; a single instance guard (build and open the app after adding any plugin).
3. Founder, 10 minutes: create a separate API key with an $80 workspace spend limit and store it in the Keychain from Terminal. Then the API key smoke test and the real-verify rerun (best_coding_plan steps 2 and 3).
4. The coding eval and the hillclimb (best_coding_plan steps 4 to 9). Then ship the winning models, effort and prompts.
5. Hero engine gaps, no founder needed: follow ups via agent.send (resume session, a checked turn each), a Retry button, the loop breaker for single tasks, Explain from the diff for Drive steps, tool activity lines, Python in the proof ladder, Vercel build log rescue.
6. Aim eval on the API key route (best_coding_plan step 10), then multi step pointing sequences, multi display labels and hand drawn annotations clipped to the window.
7. FOUNDER MAC SESSION (about one hour, the main gate for everything visual): Screen Recording, Accessibility and Microphone prompts; the whisper download and a real spoken sentence; Show me how and Point at the problem in real Cursor; the practice library (the first run's practice step, then each of the five from the Learn tab; the steps are in `M11-real-run-checklist.md`, "The practice library"); one full lesson in System Settings; the everyday apps list (Mail, Finder, System Settings, Numbers or Excel, Google Docs, Keynote, Figma, Photoshop; `M11-real-run-checklist.md`, "Everyday apps"); Speak to me; Delete everything on a test account; sleep and wake; a second display. Record every answer. Added 19 Oct 2026, HeyClicky v1.0.53's fixed failure cases (F18 "Open, to settle on a real Mac" has the detail): Mission Control and Spaces thumbnails with the island, the character and a ring up and Hide from screen sharing on; sleep and wake and plugging in a display with Home open; AirPods connecting while the talk keys are held; the folder chooser and Report a problem with Home open; the lid closed with an external display, and with a wired headset in the headphone jack; starting a second copy from Finder; the pointer leaving the island during its grow, and Home resizing during its drop.
8. Fixes from that session, then settings work: rebindable chord hotkeys (including a two key hold to talk), mic picker and failover, voice picker and speed with system voices, show over full screen, ceiling setting, language setting.
9. Lessons: rewrite the 12 drafts to use project proof checks, then the founder walks Lovable publish, Vercel env var and Vercel failed deploy on real screens. Then lessons generated from the person's own project.
10. Founder decision first: the Home screen layout. Then Home (timeline, receipts, memory, lessons, settings, search), files dragged in, ask box history and drafts.
11. Presentation mode (rule 7) and hiding overlays from screen sharing. Founder Mac session to check them in a real call.
12. Founder art: the character and its states (Rive per F04), then character choice and colours.
13. After the beta, or if the founder pulls it forward: draw or circle to ask, builder stack connectors (Vercel, Supabase, GitHub, read only), read only check routines (T15 v1.1).
14. Apple and keys: the signed and notarized installer, then the updater (founder makes the update key and a releases repo), then the What changed card.

## Founder decisions

- 'Match HeyClicky on every term' clashes with fixed decisions: F17 says win on depth not breadth, and F16 and F17 park named agents, routines, dictation everywhere, connectors, proactive popups and lessons for general apps. Do you want to unpark any of them? If yes, which ones, so they can be written as a new F record. The recommendation is to keep them parked and beat HeyClicky on the hero.
- Do you approve spending about $72 of the $100 on the coding and aim evals, using a separate key with an $80 spend limit in the Anthropic Console?
- Should model defaults follow the eval results even if that means Opus 5.5 (about twice Sonnet's price) for building, which raises each user's own cost per fix?
- Should the hidden browser (about 150 MB) download on first use behind a clear button, or ship inside the installer, which makes the download bigger?
- Hold to talk cannot be Control+Option alone without reading key events (rule 8). Is a two key chord such as Ctrl+Opt+Space acceptable as the default?
- Should spoken replies stay off by default (T13) or be on for answers to voice questions?
- Draw or circle to ask is cut until after the beta (F17). HeyClicky has it. Keep it cut or pull it forward?
- Builder stack connectors (Vercel logs, Supabase schema, GitHub), read only and connected per project: before launch or v1.1 as T15 plans?
- Pick the Home screen layout (side bar or top tabs, one window or the dock only).
- Character designs or direction for the first character and its states.
- Does the RAM disk temp folder satisfy rule 5 'captures never written to disk', or should Show me how be limited to the API key route (still open from T12)?
- App pricing and billing: price, yearly discount, student discount, India pricing, and the give a month, get a month referral (F10).
- Everyday stuck moments (20 Oct 2026) ship a local spreadsheet error table (`runner/src/everyday.ts`): what #REF!, #VALUE!, #DIV/0!, #N/A, #NAME? and a circular reference mean, the usual fixes, two lines of why and a check question each. F17 section 9 keeps authored lessons for general apps (Photoshop, Excel) out of the launch, and section 4.1 says anywhere mode lessons are improvised by the model. Is this table an allowed reference (no walkthrough steps, targets or proof checks; the walkthrough is still the model's), or should it shrink to recognising the codes (needed for "fixed only when the error is gone") with the model writing the meaning, fixes, why and question? Either answer needs an F record before this merges.
- With a project chosen and a browser in front, the key checks the project (the project's own page or its builder is often what is in front) and offers Look at my screen when the check finds nothing. Keep that, or look at the screen first in a browser too (Google Sheets, Gmail, Notion and Airtable then get the look on the first press)?
