# Memory for AI coding tools: what exists, what saves tokens, what Squibby should build (8 Nov 2026)

Written for the founder. Plain words. Every number has a source and a date. Where a number is the maker's own claim, it says so. Where I could not check something, it says so. Star counts and licences were read from the GitHub API on 8 Nov 2026 (`gh api repos/<name>`).

## 0. The short version

1. **Memory for chatbots is a crowded, well funded field. Memory for coding agents that you can read, edit and carry between tools is not.** The big projects store chat facts or tool logs in a database. None of them is built around "every line shows its source and can be forgotten".
2. **The token savings that are proven are not from memory notes.** The proven ones come from: prompt caching (cache reads cost 0.05x to 0.1x of normal input), clearing stale tool output (Anthropic: 84% fewer tokens in one 100 turn test), filtering command output, and planning before editing. Notes files help only when they are short and say things the agent cannot see in the code.
3. **A 2026 academic study found that repository context files like AGENTS.md raised cost by over 20% and did not raise success.** This is the most important warning for Squibby, because Squibby writes an AGENTS.md. The memory block must be small, must hold only non obvious facts, and must be tested against "no block".
4. **Recommendation:** keep memory as plain files (what Squibby already does), add one small, ranked "start here" block, add search over the notes with SQLite FTS5 (no vector database, no cloud), and add an honest measurement harness before saying "saves tokens" anywhere. Section 5.

## 1. The projects

How to read the table. "Feeds" means how the memory gets filled. "Saving" means a measured token or cost saving that someone published. Almost none are about coding agents on real repositories. Most are about long chat memory (LoCoMo, LongMemEval).

Licence flags: **AGPL and GPL are ideas only. Never copy code, never link them into Squibby.** ELv2 and BUSL are not open source. Treat them as ideas only too.

| Project | What it stores | Feeds | Retrieval | Saving (source) | Local or cloud | Licence | Stars, activity (8 Nov 2026) |
|---|---|---|---|---|---|---|---|
| **claude-mem** ([repo](https://github.com/thedotmack/claude-mem)) | Observations from every tool call, summaries, in SQLite at `~/.claude-mem/claude-mem.db` | Lifecycle hooks in Claude Code, Codex, Cursor and others hand tool activity to a local worker that uses an AI model to compress it ([README](https://github.com/thedotmack/claude-mem)) | Three step search: index (about 50 to 100 tokens per result), timeline, then full details (about 500 to 1,000 tokens per result). SQLite FTS5 plus Chroma vectors | Maker claims "~10x token savings by filtering before fetching" (README). This is a claim about the search steps, not a measured end to end saving | Local by default. A hosted "CMEM Pro" exists | Apache-2.0 (LICENSE file and [docs/license.md](https://github.com/thedotmack/claude-mem/blob/main/docs/license.md)). Check the file history before reusing anything, because I did not check older licences | 114,435 stars, pushed 7 Nov 2026. The README ties the project to a crypto token ("CMEM"). That is a reputation risk if Squibby is ever named beside it |
| **Mem0 and OpenMemory** ([repo](https://github.com/mem0ai/mem0)) | Extracted facts per user or agent | Your code calls `add`; an AI model extracts facts. OpenMemory is the local MCP server version | Vector search plus filters; the 2026 v3 algorithm is single pass | Paper (arXiv 2504.19413, 28 Apr 2025): on LOCOMO, 26% relative accuracy gain, 91% lower p95 latency and over 90% lower token cost than putting the full chat in context ([abstract](https://arxiv.org/abs/2504.19413)). README (Nov 2026) reports 92.5 on LoCoMo with 7.0K tokens per query, and says those scores are for the managed platform, not the open source SDK | Library, self hosted, or cloud | Apache-2.0 | 68,577 stars, pushed 6 Nov 2026. Raised $24M (seed plus Series A) per [Built In, 3 Nov 2025](https://builtin.com/articles/mem0-raises-24m-AI-memory-infrastructure-20251103). README shows a Y Combinator S24 badge |
| **Letta (MemGPT) and Letta Code** ([repo](https://github.com/letta-ai/letta)) | Memory blocks the agent edits itself, plus archival memory | The agent edits its own memory with tools. `claude-subconscious` ([repo](https://github.com/letta-ai/claude-subconscious), MIT, 2,908 stars) gives Claude Code a background memory agent | The memory blocks sit in the prompt; archival memory is searched | No coding agent saving found | Self host, or Letta Cloud | Apache-2.0 (Letta, Letta Code); MIT (claude-subconscious) | 25,380 stars, pushed 18 Oct 2026. Seed $10M led by Felicis, Sep 2024 (secondary source, [respan](https://www.respan.ai/market-map/letta/alternatives)) |
| **Zep and Graphiti** ([Graphiti](https://github.com/getzep/graphiti)) | A time aware knowledge graph: facts with start and end dates | Your code feeds "episodes"; an AI model extracts entities and links | Hybrid: embeddings, keyword and graph walk | Maker says typical sub second query latency (README). No token saving measured for coding | Graphiti is self hosted and needs Neo4j, FalkorDB or Neptune. Zep is the managed product | Apache-2.0 (Graphiti and the Zep repo) | Graphiti 32,629 stars, pushed 6 Nov 2026. Zep repo 5,000 stars. Zep funding: not found |
| **Cognee** ([repo](https://github.com/topoteretes/cognee)) | Knowledge graph plus vectors from documents, code and chats | `remember` and `cognify` calls. Can run with no AI key using a local GLiNER model and local embeddings (README) | `recall` search over graph and vectors | No saving published that I found | Local or hosted | Apache-2.0 | 33,125 stars, pushed 7 Nov 2026. Seed $7.5M announced Feb 2026 ([Pulse 2](https://pulse2.com/cognee-7-5-million-seed-funding-raised-for-building-enterprise-grade-memory-layer-for-ai-agents)) |
| **Basic Memory** ([repo](https://github.com/basicmachines-co/basic-memory)) | Plain markdown notes with links, indexed in SQLite | The AI writes notes through MCP; you can edit the files | MCP search over the notes | None published | Local first; paid cloud sync with a 7 day trial | **AGPL-3.0: ideas only.** | 4,523 stars, pushed 7 Nov 2026. **Closest in spirit to Squibby (plain files you can edit).** |
| **Supermemory** ([repo](https://github.com/supermemoryai/supermemory)) | Documents, memories and a user profile | API and plugins; `npx supermemory local` runs the whole API on the Mac with local embeddings (README) | Hybrid search, user profile | README claims "95% Recall@15 with a 99.4% context reduction" and "#1" on three chat memory benchmarks. These are maker claims on chat benchmarks, not coding | Local mode or hosted | MIT | 31,564 stars, pushed 7 Nov 2026. Funding: not found |
| **Byterover and Cipher** ([repo](https://github.com/campfirein/byterover-cli)) | A portable memory layer for coding agents | CLI and MCP | Search | None found | Local plus cloud | **Elastic License 2.0 (source available, not open source). The repo is archived (last push 25 Jun 2026).** | 4,944 stars |
| **Serena** ([repo](https://github.com/oraios/serena)) | No notes store as such. It gives agents code search by symbol through language servers | MCP server | Symbol lookup instead of reading whole files | README says its symbolic tools are "much more token-efficient than typical alternatives". No number given | Local | **Split: the application is GPL-3.0-or-later (ideas only). The SolidLSP library inside it is MIT** ([LICENSE](https://github.com/oraios/serena/blob/main/LICENSE)) | 31,185 stars, pushed 28 Oct 2026 |
| **Cline Memory Bank** ([docs](https://docs.cline.bot/features/memory-bank)) | Six markdown files in the project: `projectbrief`, `productContext`, `activeContext`, `systemPatterns`, `techContext`, `progress` | Custom instructions tell the agent to create and update them | The instructions require reading all the files at the start of every task | The docs give **no** token numbers or warning. Reading everything every task is a known cost (my reading of the docs, not a measurement) | Local files | Cline itself is Apache-2.0 (71,449 stars, pushed 7 Nov 2026) | Pattern only, not a product |
| **Claude Code CLAUDE.md and auto memory** ([docs](https://code.claude.com/docs/en/memory)) | CLAUDE.md is written by you. Auto memory is notes Claude writes itself | Corrections and preferences; also reads `AGENTS.md` when there is no `CLAUDE.md` (Claude Code 2.1.277 or later) | Auto memory loads the first 200 lines or 25KB each session. The docs say to keep CLAUDE.md under 200 lines | Anthropic: "Aim to keep CLAUDE.md under 200 lines" and move rarely used instructions into skills so they load on demand ([cost docs](https://code.claude.com/docs/en/costs)) | Local files | Closed product | The supplier. Its own memory is per machine and per tool |
| **Codex AGENTS.md and Memories** ([docs](https://learn.chatgpt.com/docs/customization/memories?surface=app)) | AGENTS.md is yours. Memories are generated from past chats under `~/.codex` | Memories are **off by default**. Generated in the background after a chat goes idle, with secrets redacted | `memories.use_memories` injects them into new sessions | None published | Local | Codex CLI is Apache-2.0 (133,587 stars) | OpenAI's docs say to keep required team guidance in AGENTS.md and treat memories as a local recall aid |
| **Cursor rules** ([docs](https://cursor.com/docs/context/rules)) | `.cursor/rules` files and `AGENTS.md`; the docs say to keep each rule under 500 lines and to reference files rather than copy them | You write them | Always, by file pattern, when relevant, or when you @ mention | None | Local files | Closed product | The Cursor docs page I read does not mention a Memories feature. I could not confirm its current status |
| **MCP memory servers** ([reference servers](https://github.com/modelcontextprotocol/servers)) | The reference `memory` server is a small knowledge graph in a file. Many community servers exist, for example [mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) (Apache-2.0, 2,095 stars) | MCP tool calls | Search | None that I trust | Local | The MCP repo is moving from MIT to Apache-2.0 (its LICENSE file says so) | Quality varies |
| **Others I looked at** | `MemOS` (Apache-2.0, 12,314 stars); `OpenViking` (**AGPL-3.0**, 41,747 stars: ideas only); `beads` (MIT, 28,576 stars: a task tracker for agents, not memory); `mcp_agent_mail` (MIT with an extra rider, repo marked deprecated) | | | | | | |

### What the table tells us

- **Hooks plus a local database plus an AI summariser** is the common coding agent design (claude-mem). It works, but the summariser is an extra model call on every session. That cost is real and no one publishes it net. This is my reading of the README design, not a measurement.
- **Plain markdown files** (Cline Memory Bank, Basic Memory, CLAUDE.md, AGENTS.md) are the only designs where the person can read and fix every line. That is Squibby's rule 15.
- **Benchmarks are about chat recall, not about coding cost.** The 90% and 99% figures come from LoCoMo style tests, where the baseline is "paste the whole chat". A coding agent never pastes the whole chat, because Claude Code already compacts and caches. Do not repeat these numbers as if they apply to coding.
- **Three of the closest-to-useful projects are copyleft or restricted** (Basic Memory AGPL, Serena app GPL, Byterover ELv2). Learn the shape, write our own code.

## 2. What actually saves tokens for coding agents

Ranked by how strong the evidence is. "Source type" matters: a paper or the supplier's docs count more than a README.

| Technique | Evidence | Strength |
|---|---|---|
| **Prompt caching** | Anthropic docs (read 8 Nov 2026): cache reads cost 0.1x the normal input price for most models, and 0.05x for Opus 5.5 and Sonnet 5.5. Writes cost 1.25x (5 minute) or 2x (1 hour). Default life is 5 minutes. Minimum 512 tokens for the 5.5 models ([prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)). Claude Code does this on its own. | Strong. But **anything that changes the start of the prompt breaks the cache.** A memory block that changes every turn can cost more than it saves. Keep it stable inside a session |
| **Clearing stale tool results** | Anthropic (29 Sep 2025): context editing alone cut token use by 84% in a 100 turn web search test. Memory tool plus context editing improved an internal agent search score by 39% over baseline; context editing alone gave 29% ([Anthropic](https://claude.com/blog/context-management)). The post gives no baseline detail | Medium. One internal test, not coding |
| **Filtering command output before the model sees it** | Anthropic's cost docs say a hook that returns only matching log lines can cut "tens of thousands of tokens to hundreds" ([cost docs](https://code.claude.com/docs/en/costs)). RTK claims 60 to 90% on common dev commands ([repo](https://github.com/rtk-ai/rtk)). Its own README says the percentages are reliable but absolute counts are estimated as bytes divided by 4, and that the saving "dilutes" once input and output are counted | Medium. Real, but only for noisy command output |
| **Code search by symbol instead of reading files** | Anthropic: code intelligence plugins mean "a single go to definition call replaces a grep followed by reading multiple candidate files" ([cost docs](https://code.claude.com/docs/en/costs)). Serena says the same. No numbers | Medium by argument, no measurement found |
| **Plan first, stop early, small specific prompts** | Anthropic cost docs recommend plan mode, Escape early, and `/rewind`; "vague requests trigger broad scanning" ([cost docs](https://code.claude.com/docs/en/costs)). No numbers | Medium. Advice from the supplier |
| **Clear between tasks, short CLAUDE.md** | Same docs: clear between unrelated tasks, keep CLAUDE.md under 200 lines, move rare instructions into skills | Medium |
| **A compact repo map** | Aider sends a map of files and key symbols, ranked by a graph, default budget 1k tokens (`--map-tokens`) ([Aider docs](https://aider.chat/docs/repomap.html)). Aider lists benefits but gives no saving number. **But** the 2026 study below found that repository overviews in context files were not helpful for Claude Code and Codex | Weak to mixed. Do not build a map into AGENTS.md without a test |
| **Rule and context files (AGENTS.md, CLAUDE.md)** | Gloaguen et al., arXiv 2602.11988 (v1 12 Feb 2026, v3 29 Sep 2026, ICLR 2026): context files "generally did not raise task success" and added "over 20%" to inference cost on average. Tested with Claude Code on Sonnet 4.5, Codex on GPT-5.2, and Qwen Code. Coverage says model written files lowered success by about 0.5% (SWE-bench Lite) and 2% (their AGENTbench); developer written files gave about 4% gain on AGENTbench; the benchmark is Python only ([abstract](https://arxiv.org/abs/2602.11988), [summary](https://aiweekly.co/node/5405)). The authors say to keep files minimal and for non standard practices | Strong, and it **cuts against** "more memory in AGENTS.md". The percentages above come from secondary coverage, not the abstract |
| **Stopping fix loops early** | Squibby's own research (10 Oct 2026 market doc) cites a vendor guide saying a stubborn bug costs 10 to 20 credits against 1 to 3 for a feature, and a 101 source practitioner review where 11% abandon. I found **no controlled study** of loop breakers on token use | Weak evidence. It is a strong product idea but must be measured by us |

### Reading across

- The proven savings are about **what goes into each request** (cache, trimmed tool output, trimmed context) and **how many requests happen** (plan first, stop loops). They are not about "remembering more".
- Memory helps in two narrow ways: (a) it stops the agent re-learning a fact that is **not visible in the code** (a house rule, "we use pnpm not npm", "never touch the billing folder", a past decision and why), and (b) it stops a repeated failed approach. Those are small, high value lines.
- Anything the agent can find in two commands (stack, folder layout) is cheap to rediscover and, per the study above, costly to over describe.

## 3. What Squibby already has

From `AGENTS.md` rules 15, 5, 6 and `docs/architecture.md` (memory row): plain markdown files (`project.md`, `profile.md`, `session.md`), every line with a source, Edit and Forget on every line, Pause, Erase all, off the record for a task, a scope filter, a marked block written into `AGENTS.md` and `CLAUDE.md` in user projects, settings for how much is told to Claude (500, 1,500 or 3,000 words for a task), and a rule that nothing is stored about health, money, relationships, moods or secrets. Rule 5 and 6 say nothing is read in the background except a source the person connected.

This is already close to the best design in the table. What it lacks:

1. **No measured proof that the notes cut tokens.** The 500 to 3,000 word recall sizes are a guess. By the study above, 3,000 words is risky.
2. **No search.** Notes are told to Claude by length, not by relevance to this task.
3. **No cross tool proof.** AGENTS.md is written, but Squibby does not check that Codex, Cursor and Claude Code actually read it or obeyed it. (Claude Code reads `AGENTS.md` only when there is no `CLAUDE.md`, per its docs, so the existing two file approach is right.)
4. **No "what I would have wasted" signal** from the fix loop breaker.

## 4. Where "never lost" can honestly be claimed

"Your AI's memory is never lost, across every AI tool" is a big claim. Here is what is true and what is not.

| Part of the claim | Can Squibby make it true? |
|---|---|
| Notes survive the AI tool being switched or reset | Yes. They are plain files on the Mac, in the project, and in AGENTS.md (read by Codex, Cursor, Claude Code and others) |
| Notes survive a disk failure or a new Mac | Only if the project is in git or backed up. The `.companion` notes folder is not in git by default. **Do not say "never lost" until there is an export and a restore** |
| Squibby captures what each tool learned | Only for tools it can see. Reading another tool's private memory (Codex `~/.codex/memories`, Claude auto memory) is reading other apps' files. That needs the person to connect it first (rule 6) |
| Every tool obeys the notes | No. Claude Code docs say CLAUDE.md is "context, not enforced configuration". Squibby can only **check after the fact** (it already reviews every change) and show "this change broke house rule 3" |

Honest wording for now: **"Your project notes live on your Mac, in plain files, and every AI tool can read them."** Save "never lost" for after export, restore and a check that each tool read the block.

## 5. Recommendation: the smallest design

Five parts. Each fits the rules.

**1. Keep plain files as the source of truth.** No database holds anything the files do not. SQLite is only an index that can be rebuilt from the files and deleted at any time. (Same shape as Basic Memory, but our own code.)

**2. Two layers, one tiny and one searchable.**
- *Start block* (in AGENTS.md and CLAUDE.md, between Squibby's markers): at most about 30 lines. Only things not visible in the code: house rules, decisions with the reason, "do not do X" lines, how to run the tests if non standard. No repo overview, no stack list unless unusual. This follows the study's advice.
- *Notes the agent can search*: the rest of `project.md` and decisions, exposed by a small local read only search tool (SQLite FTS5 over the files, keyword ranking). The agent asks only when it needs more. This is claude-mem's "index first, details on demand" idea, without its AI summariser and without a vector database.

**3. A "failed approaches" list.** When the fix loop breaker stops a loop, Squibby writes one line: what was tried, that it failed, and the proof (exit code). This is the memory type that directly cuts wasted tries, and it has a clear source (rule 15 says every line shows its source).

**4. Stability for caching.** Write the start block once per session and do not change it mid session. Order it so it never sits before anything that changes. (Prompt caching only helps if the start of the prompt is stable.)

**5. Measure before claiming.** See below. Until a test shows a saving on our own fixtures, the app and the website say nothing about tokens saved.

### Things not to build
- A vector database in version 1. FTS5 is enough for a few hundred short notes. If later needed, `sqlite-vec` (Apache-2.0, 8,246 stars, last push 18 May 2026) is the permissive option.
- An AI summary of every session (claude-mem style). It costs tokens on every run, and it stores model written text the person did not say. If we ever do it, it must be opt in, shown as a line with its source, and its cost counted against the saving.
- Reading other tools' memory folders or transcripts without the person connecting them.
- Cloud sync in version 1 (already a dropped idea in product research section 11).

## 6. Learn from, and dependencies

| Use | Project | Licence | How |
|---|---|---|---|
| Learn the shape | claude-mem (hooks, three step search, local worker) | Apache-2.0 | Read the design; it is also Bun and SQLite, our stack. Copying is allowed under Apache-2.0 if notices are kept, but read the file history and the "ip-boundary" doc first |
| Learn the shape | Basic Memory (plain markdown plus SQLite index) | **AGPL-3.0** | Ideas only. Write our own |
| Learn the shape | Cline Memory Bank (file set) | Apache-2.0 | Shows what files people expect; also shows the "read everything every task" cost to avoid |
| Learn the idea | Mem0 (extract, then search; eval harness at `mem0ai/memory-benchmarks`) | Apache-2.0 | Method of evaluating, not the code |
| Learn the idea | Letta (memory blocks the agent edits) | Apache-2.0 | Our rule is the person edits; the agent proposes |
| Learn the idea | Graphiti (facts with time ranges) | Apache-2.0 | Decisions have a date and can be replaced. We can do this with a "replaced by" field in a file |
| Learn the idea | Aider repo map | Apache-2.0 | Only if a test shows a map helps. The 2026 study suggests it may not |
| Learn the idea | Serena | App GPL-3.0, SolidLSP MIT | Symbol search ideas only |
| Possible dependency | SQLite with FTS5 | Public domain (SQLite's own statement; verify when adding) | The index |
| Possible dependency | `tree-sitter` | MIT (27,402 stars, pushed 7 Nov 2026) | Only if a repo map is ever built |
| Possible dependency | `sqlite-vec` | Apache-2.0 | Only if keyword search proves too weak |
| Possible dependency | `repomix` (packs a repo into one file) | MIT (29,179 stars) | Probably not needed |
| Do not use | Basic Memory, OpenViking, claude-squad, opcode | AGPL-3.0 | Ideas only |
| Do not use | Serena application | GPL-3.0-or-later | Ideas only |
| Do not use | Byterover, Superset | ELv2 | Not open source |
| Do not use | RTK full pipeline | Apache-2.0 plus BUSL-1.1 (per its README badge) | BUSL parts are not open source. Check which folders are which |

Per `AGENTS.md` rule: a new dependency with a licence question needs the founder's yes first.

## 7. How to measure the saving honestly

The rule: **never show a saving number that was not measured, and never subtract an estimate from a measured number.**

**A. Lab test (before any claim), using Claude Code through the Agent SDK as the repo's CLAUDE.md requires:**
- Fixture repos (small, real, with a known failing test or task) kept in `evals/`. Not the user's projects.
- Three conditions on the same tasks: (1) no notes, (2) Squibby start block only, (3) start block plus search tool. Plus (4) a "big dump" control, 3,000 words, because the study suggests more can be worse.
- Use the SDK's bundled binary, no `bypassPermissions`, explicit `settingSources`, `strictMcpConfig`, and a throwaway `CLAUDE_CONFIG_DIR`, as the repo's Claude notes say. Check `system/init` lists only the expected tools.
- Record from the SDK result: input, output, cache read and cache write tokens separately, dollar cost, number of turns, pass or fail of the tests. Counting only "tokens" hides the cache: a cache read is far cheaper than a fresh token, so a saving in raw tokens may be no saving in cost.
- Repeat each task several times (model output varies). Report the median and the spread, and the number of runs. Do not report a single run.
- Count the cost of the memory itself: writing notes, any search calls, any summary calls. Net, not gross.
- Report a loss as plainly as a win. The study suggests the start block may cost more on tasks where the notes are not needed.
- Publish the method and the raw results in `evals/`, so the founder can show them to anyone.

**B. In the app (after the lab test supports it):**
- Show only measured facts: tokens and cost per finished task over time, and how many fix loops were stopped early and at what point. Label it "measured on your tasks".
- Do not show "tokens saved" as a headline unless there is a holdout. An opt in holdout (for example a small share of tasks run without notes, chosen at random, visible to the person) gives a real comparison on their own work. Off by default.
- For other tools' usage (Claude Code run in a terminal, Codex), Squibby can only count what it sees. Reading their transcripts for token counts is a connected source (rule 6): the person turns it on, it is read on request, and it stays on the Mac. (The open source tool `ccusage`, MIT per its licence file, 19,355 stars, does this for Claude Code; it is a reference for the file format, not a reason to read files in the background.)

**C. Things that will fool us:**
- Prompt cache warm versus cold changes cost a lot between two runs. Run conditions in random order.
- Task difficulty differs. Use the same tasks for every condition.
- Models change. Re run on each model upgrade.
- The AI summariser's cost is easy to forget.

## 8. Open questions for the founder
1. Is "never lost" worth a real backup and restore feature (export, import, git friendly)? Without it the phrase is not safe.
2. Is an opt in random holdout acceptable, or too much like an experiment on the user?
3. Should the failed approaches list be on by default? It writes a line without being asked, but always visibly and with its source.

## Sources (all read 8 Nov 2026)
- Repos and licences: GitHub API (`gh api repos/...`) for every repo named above.
- Anthropic, Manage costs: https://code.claude.com/docs/en/costs
- Anthropic, How Claude remembers your project: https://code.claude.com/docs/en/memory
- Anthropic, Prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Anthropic, Context management (29 Sep 2025): https://claude.com/blog/context-management
- OpenAI, Codex Memories: https://learn.chatgpt.com/docs/customization/memories?surface=app
- Cursor rules: https://cursor.com/docs/context/rules
- Cline Memory Bank: https://docs.cline.bot/features/memory-bank
- Aider repo map: https://aider.chat/docs/repomap.html
- Gloaguen et al., Evaluating AGENTS.md: https://arxiv.org/abs/2602.11988
- Mem0 paper: https://arxiv.org/abs/2504.19413
- README files of claude-mem, mem0, supermemory, cognee, graphiti, letta, basic-memory, serena, rtk
