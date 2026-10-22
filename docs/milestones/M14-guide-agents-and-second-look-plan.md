# M14: the guide for everyone, agents on day one, and Second Look (plan, 22 Oct 2026)

Decision: `docs/decisions/F23-three-layers-hero-guide-helper.md`. Read this and veto anything. **No UI is built here** (the look is still yours to decide); this plan is the engine and the evidence behind it.

## Update after the reality check (22 Oct 2026)
The research (`docs/research/2026-10-22-reality-check.md`, agreed by the founder: "Yeah, I like it") changes the weight of this plan:
- The guide ships as a **free front door**. HeyClicky's waves two and three (named agents, a chat window, connections, routines) **wait for evidence**; the platforms and cheap clones are covering the general guide. Agents with no project stay minimal (commodity).
- Second Look is a **contained feature**, leading with numbers and tables, risky code lines, any desktop app, and "I can't tell". Not a headline until people come back to it.
- The light features (the guide, pointing, Explain, Second Look) should call the Messages API directly, so they can be company paid now (F22 update).

## Built so far (22 Oct 2026)
- The light lanes straight on the Messages API, off by default (`runner/src/direct.ts`, PR 155).
- Drag a file in or paste one, and ask about it: text and code files and pictures already went with a request (wave 4). PDF, Word (.docx, .doc), rich text, OpenDocument text and Excel (.xlsx) documents now do too: their text is read on this Mac with the Mac's own tools (`app/src-tauri/src/docread.rs`, no new dependency), secrets hidden, clipped to a limit in Settings (`attach.docLimit`, 50 KB unless changed), never stored or logged. Not built: a preview of the document, and reading the old .xls, Pages, Numbers or Keynote files.
- Quiet during calls and screen sharing: hide from screen sharing and quiet while a call app is in front were built in M11 (both on unless turned off). Another app using a microphone is now written beside the camera check, both switched off until your Mac session shows they never ask for a permission and are not fooled by macOS's own listeners. Nothing pops up unasked and Companion plays no sounds, so speech, reactions and confetti are what quiet holds back.
- Basic agents with no project open, the engine side and the minimum in the ask box (22 Oct 2026): with no project open, Start, Plan it and Look it up (and, with a project open, the tick box Make it in a new folder) ask the shell for a new folder named after the request in `~/Companion makes` (the setting `make.folder` can put it in Documents or on the Desktop). The shell makes it (never over anything, never in a git project or one of the person's projects, never through a link), opens it as the project and starts an ordinary plan or Look it up there, so it gets the same safety, approvals, Undo, proof, receipts and budgets as any task (`app/src-tauri/src/newfolder.rs`, `protocol/index.ts` `project.new`). Tested with stand ins, and then once against real Claude (22 Oct 2026, see "Real run: make something in a new folder" below). Not yet tried in the built app. **Not yet built:** the look (waits for the founder), a list of folders made this way, and moving one to the Trash.
- Second Look's engine (`runner/src/secondlook.ts`) and its eval (`evals/second-look/`, 30 cases). This first eval has 30 answers, not the planned 100; it grows once the first real run shows where it is weak.
- Second Look wired end to end (22 Oct 2026, branch `m14/second-look-wire`): its own hotkey (Control, Option, Command and C, changeable in Settings), the selection read the error explainer's way (the light first, Accessibility, the same answer per app, never stored or logged), `secondlook.check` and `secondlook.result` in the protocol, the daily limit, Stop everything and Voice off, a switch in Settings (Second Look, on) and a search cap (Web searches per Second Look, 3, at most 5). On the plain API lanes it may search the web (the basic web search tool, $10 per 1,000 searches, counted in its cost) and shows a page only when that search returned it; on the Claude Code lane it does not search and says so. The usage proxy forwards that one capped search and no other tool. The card shows it through the existing panel and lines, with no new look. **Not yet done:** a real Mac run (the read in ChatGPT, Claude and a browser), the real eval run, a real search on each quick model, and the look of the card (yours).

## Part 1: the guide, "exactly what HeyClicky does", in an order that works

- The light features and the daily limit with no project open (22 Oct 2026, branch `m14/book-cost`): **the follow up is done.** Before, the cost of Prompt help, the error explainer, Second Look, Draw it for me and Explain was booked only against a project that was open, and Show me how and the everyday looks were never booked at all, so a person with no folder open had no daily cap on them. Now one function (`bookSpend` in `agent.ts`) books every light call, and with no project named it counts in the stand in project's own day: same limit, same local day, kept in the same ledger file, kept across a restart, only a number, and shown in the Settings row for the stand in. At the limit each feature refuses in the usual words and asks nothing. Show me how now carries the open project from the Mac app, so with a folder open it counts in that folder's day. A "make me something" folder is a project, and a test now proves its plan, steps and research are booked there and stop at the limit. Tested with stand ins only; **not yet seen on a real Mac or with real Claude** (the `daily-limit` real check still covers only a project).

The full row by row table is in `M11-match-and-beat.md`. Statuses there were checked on 16 Oct and a lot has changed since (follow up by voice, microphone fallbacks, Home stepping aside were built on 17 to 19 Oct), so **re-check each row against the code before building it.** Order, by how many people hit it on day one:

| Wave | What | Why this order | Needs |
|---|---|---|---|
| Day one | The guide on any app, push to talk, honest pointing, spoken replies with a voice picker and speed, a text box with copyable replies | The core promise for everyone; mostly built | Your Mac session, real app test |
| Day one | **Basic agents with no project open:** "make me a website for my bakery", "research who competes with X". They work in a new folder in your home folder, show progress, ask before anything risky, and prove what they made | You asked for it; the engine is at parity already (`M11`: "agents that build apps and do research: have equal"). Missing is the front door that needs no project | A small engine change, then the screen (wait for the look) |
| Day one | Drag a file in or paste one, and ask about it | Everyone does this with an AI | None |
| Day one | Voice follow ups on an agent, approvals that are quick to answer, quiet during calls and screen sharing | Daily friction | Your Mac session |
| Wave two | Several agents at once with a small status view, persistent named agents with their own memory ("Clickys") | Big, and the look matters | Your art and look decision |
| Wave two | A Home chat window (conversations, search) | Big | The look |
| Wave three | App connections (Gmail, Calendar, Slack, Notion), custom connections, routines that run on a schedule, system wide dictation and typing for you | Each is a milestone; F21 already allows read only connections and watch routines | One decision each |

Parity is **claimed only after** the head to head (below), never before.

## Part 2: Second Look, the helper HeyClicky does not have

**The problem everyone with an LLM has:** the answer sounds sure and may be wrong, and you cannot tell. CEOs, founders, engineers and beginners all get burned the same way: a wrong number in a plan, a citation that does not exist, code that quietly misbehaves.

**What it does:** you select an AI answer in any app (or press the key with it on screen) and press a key. The light comes on first (rule 5). Within about ten seconds a card says one of three honest things:
- **Solid:** what it checked and how.
- **Check these:** the specific claims that look shaky, why, and what to verify, with a source when it found one.
- **I can't tell:** what it could not check. It never fakes certainty.

For numbers it redoes the arithmetic itself. For facts it searches and shows sources. For code it flags the lines that look risky and says what test would prove them. For quotes and citations it says which it could not find. Companion's character reacts (a nod, a squint), which is the fun: a small "caught one" moment, never a score or a streak (rule 16).

**Why us:** it is the same idea as the hero ("done means proven") turned on any AI answer, and the engine for it already exists: the second model review (it caught 5 of 5 risky changes with no false alarms on real Claude), the text read on a hotkey (T11), the web search lane with sources (Research), and the redaction rules.

**What it is not:** it does not decide what is true. It shows its work, and says so when it cannot tell.

**Rules it follows:** the selected text is read only on the person's key press with the light on (5, 8); nothing is stored; secrets are hidden before anything is sent (redact); a check costs pennies and shows its estimate (T10).

**How we know it works (before anyone sees it):** an eval of 100 AI answers, 50 with a known seeded mistake (a wrong number, an invented citation, an out of date fact, a subtle logic slip, a wrong code detail) and 50 correct. Measures: how many mistakes it catches, how often it cries wolf, and how often it says "I can't tell" when it should. Targets: catch at least 85%, false alarms at most 10%, and never confidently wrong. The real run needs credits; the corpus, the prompts, the engine and the scorer are built first, with stand ins, like the other eval sets. Real run cost estimate: about $1 to $2.

**The fun, later:** "Spot what the AI got wrong": the seeded answers from the eval turned into a practice game that teaches people to catch mistakes. It is also a shareable result card. Built after Second Look works.

## Part 3: the head to head that settles "better than HeyClicky"
30 real asks across 5 apps (Cursor, Chrome, Figma, Notion, System Settings), the same for both tools. Score: the ring on the right thing, seconds, and whether a stranger finished the task. Plus 5 non engineers using each while you watch, silent. Needs your Mac and a HeyClicky Pro account ($20). I write the ask list and the scoring sheet.

## Order
1. **Now, offline, no spending:** the Second Look engine, prompts and eval set with stand ins; the day one front door for agents with no project (engine only); the "did they learn?" instrumentation notes.
2. **After your Mac session:** fix what it finds; the real run of Second Look; the head to head.
3. **After Anthropic's answer (F22):** the no key version of the guide.
4. Wave two and three, one at a time, each with its own plan.

## What I need from you
- A yes or no on this plan.
- Whether the guide's "agents with no project" should write into a new folder in your home folder (my suggestion, with Undo) or somewhere else.
- The Mac session (`docs/launch/mac-session-script.md`), which gates everything visual.

## Real run: make something in a new folder (22 Oct 2026)

What was run: `real-verify.ts` cases `new-folder`, `new-folder-detailed` and `new-folder-research`, on the founder's key (the `companion-dev` Keychain item), Sonnet 5.5, the SDK's bundled Claude binary, started from a clean environment (`env -i`), per case stop $1.00 and total stop $2.50. Each case makes a brand new empty folder laid out as the shell leaves it (a "Companion makes" folder, a neighbour project and a file beside it), then sends exactly the command the shell would send (`drive.plan` or `research.ask`). It is the engine side only: the Mac shell that makes the folder (`newfolder.rs`) and the screens were not part of it.

**Cost, by Companion's own count (the Anthropic Console is the true figure; compare it):** `new-folder` $0.065 and then $0.041 on a rerun, `new-folder-detailed` $0.070, `new-folder-research` $0.053. Total about **$0.23** in two runs. No case came near its stop.

| Check | Result | Evidence |
|---|---|---|
| (a) the plan is sensible for an empty folder | pass, both build cases | 3 steps each, plain words ("Create the page with the bakery name, a short welcome and a simple look", "Add the opening hours section", "Add the contact section with address, phone and email"); no bug fix, no editor chore, no jargon |
| (b) every file written is inside the new folder | pass, all three | the neighbour project, the file beside the folder and the home folder's list of entries were unchanged; every snapshot named the new folder; planning wrote nothing |
| (c) a fair proof when there was nothing to check at first | pass | every check `passed` with the page served and opened in the hidden browser (start and browser passed; install, build and tests skipped with "no build or lint steps" and "no tests", which did not make it fail); no step ended done with nothing checked |
| (d) Undo takes the folder back to empty | pass after the fix (first run: pass with a note) | the first run left `.companion/project.md`, `AGENTS.md` and `CLAUDE.md` after Undo. Fixed (see below); the rerun left only `.companion` (`ls -A` showed exactly that) |
| (e) research writes nothing outside its notes | pass | only `.companion/research/<date>-before-opening-a-small-bakery.md`; 4 notes, every one with a web address; tools were a search only; no write or shell tool ran |
| (f) no secret, no network write, nothing touching git | pass, all three | no command ran at all, no approval card, no `.git`, no `.env`, the key in no event and no file |
| (g) cost per case | see above | $0.04 to $0.07 a build case, $0.05 research |

**What it found (not fixed, a decision for the founder):**
- **A vague request stops after step 1 to ask the bakery's name.** "a one page website for my bakery with opening hours and a contact section" has no name, so step 1 built the page with a stand in title, then asked "What is your bakery's name?". By design (a question only the person can answer) the plan stops there and the other 2 steps wait: `drive.done` said `needs_you`, 0 of 3 completed (step 1 was done and proven, but the plan counts it as waiting). Both times. The same request with the facts in it (`new-folder-detailed`) finished all 3 steps, 3 receipts, 3 passed proofs. So the first thing a person will meet with this front door is a question. The screens should make the question easy to answer, and answering should carry on with the plan. **Unproven: what the shell and the page do after the answer.**
- **Fixed (22 Oct 2026, founder's decision): Undo now returns a made folder to empty, apart from the hidden `.companion` folder.** The rule, in one sentence: in a folder Squibby made for a request, the shared files other coding agents read (`AGENTS.md` and `CLAUDE.md`) are never written, and never asked about, until the person says yes. The engine knows such a folder by where it sits: directly inside the "Squibby makes" folder (`newFolderParent` in `protocol/names.json`; `madeBySquibby` in `runner/src/memory/agentsmd.ts`, used by `syncShared` in `runner/src/agent.ts`). It needs no mark from the shell and no memory of what the folder held. A yes to the shared files question (`memory.agents`) writes them as before. Every other project is unchanged, including the question when it already has its own `AGENTS.md`. `.companion/project.md` (Squibby's own project notes) is still written, because it is bookkeeping that snapshots and Undo leave alone on purpose; the expected state after Undo is "empty except the hidden `.companion` folder", and the `new-folder` case now asserts exactly that (`ls -A` is `.companion` and nothing else; `AGENTS.md` and `CLAUDE.md` are no longer tolerated). Rerun on real Claude after the fix: pass, about $0.07. **Not built:** a button in the Memory page to ask for the shared files in such a folder (the yes only comes from the question card, which a made folder never shows); the look waits for the founder.

**Still unproven:** the Mac shell making the folder, the page, a person using it, a second run on the same request (different plans each time are possible), a request that needs more than one page or a package install (the proof for that was not tried in a new folder), Claude's own web search being allowed in a user's network, and the Console figure.

