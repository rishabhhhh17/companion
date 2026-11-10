# The memory lab (11 Nov 2026)

The question: does Squibby's start block (M78, `docs/milestones/M78-memory.md`) make Claude Code cheaper or faster on real tasks, or more expensive? The research (`docs/research/2026-11-08-memory-for-ai-tools.md`, section 2) warned that big AGENTS.md style files raised cost by over 20% with no gain in success, so "no" was a fair possible answer.

**Short answer.** The start block did not make Claude Code cheaper. It cost the same as no notes (median cost ratio 0.93, cheaper in 11 of 18 pairs, which could be chance). It did not make it measurably faster either. What it changed was behaviour. Claude used about 2 to 3 fewer turns (15 of 16 pairs with a difference; that is very unlikely to be chance). And on the two tasks where the notes asked for the opposite of what Claude does by default, Claude followed the notes in 12 of 12 runs with the block. Without the notes it did the forbidden thing in 5 of 6 runs. The full dump of every note (the control) cost about 18% more than no notes and was more expensive in 11 of 18 pairs. The search command was never used.

Spent: **$1.70** by Claude Code's own cost figures (one trial run $0.02, rounds 1 to 3 $1.15, the reversed tasks $0.52). The stop for this test was $4.00. No stop was reached and no harness refusal happened. Worktree `m48/launch` at `ee5fb71`, no product code changed, no git touched.

## How it was run

- **Money and safety, as on 10 Nov.** I used the API key route only. The key is in the Keychain item `companion-dev` and was read in code through `runner/scripts/realrun-harness.ts`, never printed. The founder's plan login was never used and `claude auth status` was never run. The harness enforced the rest: the SDK's bundled binary, a throwaway `CLAUDE_CONFIG_DIR`, explicit `settingSources` (`["project", "local"]`, so the project's own hook and CLAUDE.md could load), `strictMcpConfig: true`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`. Nothing ran with `bypassPermissions`. Every session passed the `system/init` check: the tools were Bash, Edit, Glob, Grep, Read and Write, with no MCP servers. Each run had a $0.45 harness stop and Claude Code's own $0.35 budget. A run started only if more than $0.45 of room was left under the total stop. All runs started outside Claude Code's Bash sandbox, as on 10 Nov.
- **The script** lives outside the repo: scratchpad `lab/lab.ts` (with `analyse.ts`, and the raw rows in `records.jsonl` and `trial.jsonl`). It imports the harness and Squibby's memory code unchanged: `MemoryStore`, `pickNotes`, `startBlock`, `SessionStartNotes.refresh`, `DoneSignals.add` and the filter.
- **What Claude Code was:** plain Claude Code as a person runs it in their project, meaning the `claude_code` system prompt, `acceptEdits`, Sonnet 5.5 (`MODELS.agent`, medium effort) and the person's one line ask. It did not get Squibby's own task prompt. Bash commands were allowed except installs, git and network tools (curl, wget), which were refused with the same words in every condition. File changes were allowed only inside the project.
- **Projects:** fresh copies of the `app/sample` practices (signup, route, import, setting) in temporary folders, removed after. Each run got a new copy.
- **Notes:** each project was seeded the way Squibby keeps notes: `.companion/rules.txt` held 2 or 3 house rules, and `.companion/project.md` held 63 lines from a few months of ordinary use. That was 25 lines learned from the code, 11 decisions, 5 tried and failed lines and 20 of the person's own lines. In the middle of those sat the two lines that matter for the task: a decision with its reason and a tried and failed line. Every line passed Squibby's filter.
- **The four conditions:**
  - **A, no notes:** no `.companion` folder, no hook, no CLAUDE.md.
  - **B, the start block only:** Squibby's `startBlock(pickNotes(...))` without the search line. It reached Claude through the real SessionStart hook that `DoneSignals.add(project, "claude", "start")` writes to `.claude/settings.local.json`.
  - **C, the start block with search:** exactly what `SessionStartNotes.refresh` writes, meaning the block, the search line and the FTS5 index. It went through the same hook, and any search command was allowed.
  - **D, a dump of every note (control):** every project line and house rule in a CLAUDE.md at the project's root (5,940 characters), the AGENTS.md style file the research warned about.
- **Tasks:** six tasks in two groups.
  - **Four "agreeing" tasks.** The notes point at the fix Claude would choose anyway: signup (keep `/api/register`, change the page), route (keep `/prices`, add it to the server), import (point the require at `lib/money.js`, do not add a copy back) and setting (put the name in `.env.local`, no dotenv package). In these four the notes could only save effort, not change the answer.
  - **Two "reversed" tasks.** I added these after rounds 1 to 3 showed that A never went wrong. The notes ask for the fix that A did not choose. In signup2 the address is `/api/signup`, so the server must change, and changing the page is a tried and failed line. In route2 the page lives at `/pricing`, so the link must change, and adding `/prices` to the server is a tried and failed line.
- **Rounds:** every task ran 3 times in every condition: 72 runs, 18 per condition. The order of the conditions turned with each task and round, so no condition always met a cold prompt cache.
- **Scored per run:** input, output, cache read and cache write tokens and the cost, all from the SDK's own `result` message; the turns; wall time; and success, meaning the project's own `node --test` run fresh by the script afterwards. Two more: whether the agent repeated the tried and failed approach, and whether it broke a house rule. Both come from the files on disk (and the commands, for installs).
- **The hook really works.** In all 36 B and C runs, Claude Code ran the SessionStart hook and its output was the block byte for byte (`hook_response`, outcome success). Two M78 checks are now settled on a real Mac with the pinned SDK (0.3.293). First, the hook in the shape written runs as the session starts and puts the plain stdout into Claude's context. Second, the first request carried about 717 more tokens than A, which is the block. That M78 [verify] item is resolved by this lab. The milestone doc and `technical_research.md` should say so; this test was not allowed to change them.

## Results by condition (all 72 runs)

Median, with the range in brackets. "All in" is the input, cache read and cache write tokens of the whole session. The cost is Claude Code's own figure.

| | A: no notes | B: start block | C: block and search | D: every note |
|---|---|---|---|---|
| Runs | 18 | 18 | 18 | 18 |
| Cost | $0.0212 [0.0190 to 0.0307] | $0.0201 [0.0128 to 0.0321] | $0.0213 [0.0182 to 0.0349] | $0.0272 [0.0194 to 0.0342] |
| Mean cost | $0.0228 | $0.0208 | $0.0223 | $0.0272 |
| All in tokens | 36,039 [28,258 to 47,343] | 31,488 [21,678 to 51,966] | 31,833 [22,664 to 62,939] | 38,005 [26,394 to 52,001] |
| Cache write | 2,728 [2,431 to 3,752] | 3,170 [1,824 to 4,312] | 3,014 [2,494 to 4,435] | 4,992 [3,741 to 6,173] |
| Cache read | 33,371 [25,395 to 43,579] | 28,344 [19,848 to 47,828] | 28,596 [19,881 to 58,490] | 33,005 [22,647 to 45,818] |
| Fresh input | 10 [8 to 12] | 8 [6 to 12] | 8 [6 to 14] | 8 [6 to 10] |
| Output | 839 [574 to 1,249] | 712 [417 to 1,207] | 741 [586 to 1,197] | 794 [537 to 1,261] |
| Turns | 7 [6 to 10] | 5 [3 to 7] | 5 [4 to 8] | 5 [3 to 8] |
| Wall time | 15.6 s [11.4 to 21.6] | 14.5 s [7.8 to 21.2] | 14.8 s [8.9 to 21.2] | 15.5 s [12.9 to 18.2] |
| Project's checks pass | 18 of 18 | 18 of 18 | 18 of 18 | 18 of 18 |
| Repeated the tried and failed approach | 5 of 18 | 0 of 18 | 0 of 18 | 0 of 18 |
| Broke a house rule | 5 of 18 | 0 of 18 | 0 of 18 | 0 of 18 |
| Ran the search command | | | 0 of 18 | |

A has no notes, so for A "repeated" and "broke" mean it did the thing the notes forbid. A could not have known.

### Paired with A (same task, same round)

The sign test asks how often the condition was lower than A in the same pair, and how likely that split is by chance (two sided).

| | B vs A | C vs A | D vs A |
|---|---|---|---|
| Cost: median ratio [range] | 0.93 [0.64 to 1.56] | 0.97 [0.66 to 1.63] | 1.18 [0.79 to 1.72] |
| Cheaper than A | 11 of 18 (p = 0.48) | 11 of 18 (p = 0.48) | 7 of 18 (p = 0.48) |
| Mean cost difference a session | $0.0021 less | $0.0005 less | $0.0044 more |
| Fewer turns | 15 of 16 (p = 0.001), median 3 fewer | 15 of 16 (p = 0.001), median 2 fewer | 14 of 15 (p = 0.001), median 3 fewer |
| Less output | 15 of 18 (p = 0.008), median 227 tokens less | 14 of 18 (p = 0.03) | 11 of 18 (p = 0.48) |
| Faster | 13 of 18 (p = 0.10), median 1.3 s | 11 of 18 (p = 0.48) | 9 of 18 (p = 1.0) |

### By task

Median cost, all in tokens, turns, wall time; then pass, repeated and broke out of 3.

| Task | Cond | Cost | All in | Turns | Time | Pass | Repeated | Broke |
|---|---|---|---|---|---|---|---|---|
| signup | A | $0.0297 | 46,570 | 9 | 20.2 s | 3 | 0 | 0 |
| | B | $0.0213 | 31,664 | 5 | 14.8 s | 3 | 0 | 0 |
| | C | $0.0196 | 31,821 | 5 | 11.6 s | 3 | 0 | 0 |
| | D | $0.0272 | 38,043 | 5 | 15.3 s | 3 | 0 | 0 |
| route | A | $0.0197 | 28,341 | 7 | 15.5 s | 3 | 0 | 0 |
| | B | $0.0203 | 31,574 | 5 | 15.5 s | 3 | 0 | 0 |
| | C | $0.0208 | 30,758 | 5 | 17.0 s | 3 | 0 | 0 |
| | D | $0.0244 | 36,403 | 4 | 15.2 s | 3 | 0 | 0 |
| import | A | $0.0211 | 36,251 | 6 | 15.7 s | 3 | 0 | 0 |
| | B | $0.0246 | 33,417 | 6 | 18.0 s | 3 | 0 | 0 |
| | C | $0.0285 | 43,015 | 6 | 20.4 s | 3 | 0 | 0 |
| | D | $0.0319 | 49,099 | 6 | 16.8 s | 3 | 0 | 0 |
| setting | A | $0.0205 | 28,268 | 7 | 15.1 s | 3 | 0 | 0 |
| | B | $0.0228 | 34,012 | 4 | 13.8 s | 3 | 0 | 0 |
| | C | $0.0214 | 32,911 | 4 | 14.7 s | 3 | 0 | 0 |
| | D | $0.0336 | 51,962 | 6 | 17.1 s | 3 | 0 | 0 |
| signup2 (reversed) | A | $0.0270 | 38,267 | 9 | 17.8 s | 3 | **3** | **3** |
| | B | $0.0196 | 30,548 | 5 | 16.1 s | 3 | 0 | 0 |
| | C | $0.0206 | 31,194 | 5 | 9.4 s | 3 | 0 | 0 |
| | D | $0.0218 | 27,921 | 3 | 14.9 s | 3 | 0 | 0 |
| route2 (reversed) | A | $0.0198 | 28,272 | 7 | 15.1 s | 3 | **2** | **2** |
| | B | $0.0178 | 29,953 | 5 | 9.1 s | 3 | 0 | 0 |
| | C | $0.0219 | 31,006 | 6 | 11.2 s | 3 | 0 | 0 |
| | D | $0.0194 | 26,428 | 3 | 14.5 s | 3 | 0 | 0 |

On the four agreeing tasks alone, B against A: cheaper in 6 of 12, with a median cost difference of $0.0001. On the two reversed tasks: cheaper in 5 of 6, with a median of $0.0056 less. That is too few runs to rely on.

## What the memory itself costs

The extra tokens on the first request of each session, compared with A on the same task (median, almost the same in every run):

| | Characters | Lines | Extra tokens a request | What that costs in a session |
|---|---|---|---|---|
| B: start block | 2,284 | 30 | about 717 | written to the cache once (about $0.0018 at Sonnet 5.5's $2.50 a million), then read from the cache on every later turn (about $0.00014 a turn) |
| C: block and search line | 2,469 | 30 | about 816 | about $0.002, plus about $0.00016 a turn |
| D: every note in CLAUDE.md | 5,933 | 74 | about 2,374 | about $0.006, plus about $0.0005 a turn |

In this lab the block cost about a tenth of a cent a session in itself. That is about what the two or three saved turns gave back, which is why the cost came out even. The dump cost three times as much to carry and gave back no more.

## Did Claude follow the notes?

- **House rules and decisions:** in every B, C and D run (54 of 54) Claude kept to the house rules and the decision. On the reversed tasks, where Claude's own choice was the forbidden one, it changed its plan to the notes' plan in 18 of 18 runs with notes. Without notes it took the forbidden path in 5 of 6 runs. In signup2 A changed the page in 3 of 3 runs; in route2 A added `/prices` to the server in 2 of 3 runs. Every A run still passed the project's checks. That is the point: the checks cannot see a decision the code does not show, and only the notes carried it.
- **Tried and failed lines:** never repeated with notes (0 of 54). Without them, the forbidden approach was taken in 5 of 18 runs, all on the reversed tasks. On the four agreeing tasks Claude never reached for the failed approach anyway. For example, it never tried to install dotenv, even with no notes.
- **Claude said it followed them.** In its last message Claude mentioned the notes or a house rule in 4 of 12 B runs, 6 of 12 C runs and 8 of 12 D runs (rounds 1 to 3), and never in A. For example: "I left `server.js` alone, as your notes say".
- **Search was never used:** 0 of 18 C runs ran the search command. Every relevant line was already in the block, so there was nothing to look up. This lab does not show whether Claude would search when the block leaves out what it needs. The search line costs about 100 tokens a request for nothing on tasks like these.
- **Reading the notes files:** two runs (one B, one C) opened `.companion/` files themselves, and one D run read CLAUDE.md again. That cost a little, once each.

## What this does not show

- **Small, easy tasks only.** Every run passed, took 3 to 10 turns and cost 1 to 3 cents. On long tasks, a block that saves wrong turns may matter more, or less. This lab cannot say which.
- **18 runs per condition.** The cost differences between A, B and C are inside the noise. The turn difference and the rule following are not.
- **The reversed tasks were built for this test.** Their notes contradict the obvious fix on purpose. That is a fair test of whether Claude listens. It does not show how often real projects have such a note.
- **The notes were seeded by me, not learned.** The relevant decision was the newest decision, so the block's ranking put it near the top. In a real project, the line that matters could rank lower or fall past the 30 line cap.
- **One model.** Sonnet 5.5 at medium effort only. Opus and Haiku were not run.
- **Lab rules added refusals.** The lab's own no network rule refused `curl` to the local server in 10 runs: B, C and D on the import and setting tasks, never A. Each refusal cost a turn or so. If anything this counts against the notes conditions.
- **D was a CLAUDE.md dump**, the AGENTS.md style the research measured. It was not the same notes sent through the hook. So the D result is "a big context file", not "a bigger start block".

## Verdict

- **Tokens and money: no saving shown.** The start block cost the same as no notes: median 0.93 times A, cheaper in 11 of 18 pairs, which is about what chance gives. Its own price, about 700 tokens a session (about a tenth of a cent on Sonnet 5.5 with caching), was paid back by the shorter sessions, and not more. The full dump of every note cost about 18% more (median ratio 1.18, mean $0.0044 more a session). That matches the research's warning about big context files, and it is why the block is kept small.
- **Time: no clear saving.** About 1.3 seconds faster at the median for B, in 13 of 18 pairs, which could be chance. Wall time was 15 seconds either way.
- **Tries: yes, fewer turns.** With the block, Claude used 2 to 3 fewer turns at the median: 5 instead of 7, fewer in 15 of 16 pairs that differed. That is very unlikely to be chance. It also wrote about 15% less output. It got to the right file sooner because the notes told it what mattered.
- **Following the person's decisions: yes, clearly, and this is the real benefit.** With the block, Claude kept every house rule, every decision and every tried and failed line: 36 of 36 B and C runs, and 12 of 12 on the reversed tasks. Without it, Claude broke the person's decision in 5 of 6 reversed runs, and every one of those passed the project's checks.
- **Confidence:** high for "the block reaches Claude and Claude follows it". High for "the dump costs more". Medium for "fewer turns", which is clear here but only on small tasks. Low for any cost or time claim; there is none to make.

### What the app and the website may say

- **May say:** "Claude Code gets your house rules and decisions at the start of every session, so it does not undo what you decided." "In our tests, Claude followed the saved decisions every time, and without them it went against them in 5 of 6 tries." "The start block is small, about 30 lines, so it adds almost nothing to what a session costs."
- **May not say:** "saves tokens", "cheaper", "faster" or "fewer tries" as a cost or time promise, or any percentage saving. The cost was even, and the time difference was within the noise. Not "never lost" because of this lab (that rests on export and restore). Not that search helps, since it was never used here.
- **For Squibby:** keep the block small and keep the full dump out of AGENTS.md and CLAUDE.md, since it was the one condition that cost more. Consider dropping the search line from the block, or testing it on a task where the block leaves the needed line out, before it costs about 100 tokens a request on every session. A longer, harder task set would be the next lab if a cost claim is ever wanted.
