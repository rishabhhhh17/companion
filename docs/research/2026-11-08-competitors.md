# Competitors for Squibby, November 2026 (8 Nov 2026)

Written for the founder. Plain words. Every number has a source. A number marked "claim" is the company's own. "Unverified" means I found it in one weak source only. Star counts and licences come from the GitHub API on 8 Nov 2026. Where this file and `docs/research/product_research.md` section 12 differ, the newer check here wins, and the difference is named.

## 0. How to read this

Squibby, in one line: it lives in the Mac notch beside AI coding tools, reviews every change the AI makes, fixes what breaks with proof and Undo, teaches in plain words, and keeps project notes you can read and forget.

Nine groups overlap with some part of that. No one overlaps with all of it. The table in section 10 shows the gaps.

| Group | Overlaps with | Closest names |
|---|---|---|
| 1. Notch and menu bar monitors for coding agents | The notch and "see what the AI is doing" | Vibe Island, CodeIsland, Chimlo, NotchDeck |
| 2. On screen AI companions | Characters, voice, Show me how | HeyClicky |
| 3. AI code review | "Reviews every change" | CodeRabbit, Greptile, Graphite (Cursor), Cursor Bugbot |
| 4. Agent dashboards and orchestrators | Many agents, one view | Conductor, Superset, Emdash, Sculptor, Claude Squad, Vibe Kanban |
| 5. The AI tools' own built in features | Checks, undo, memory, usage advice | Claude Code Desktop, Codex, Cursor, Lovable, Replit |
| 6. Vibe code rescue and security | "Fixes what breaks" | Security scanners, repair freelancers |
| 7. Token and cost savers | "Cheaper" | ccusage, RTK, Anthropic's own `/usage` |
| 8. Memory products | "Memory never lost" | claude-mem, Mem0, Supermemory, Basic Memory |
| 9. Teaching | "Teaches" | Built in learning modes |

## 1. Notch and menu bar monitors (the closest on the surface)

The search for "notch app Claude Code Codex" returned at least eight apps ([search, 8 Nov 2026](https://vibeisland.app/best-ai-agent-notch-apps/)). The category is crowded and mostly free or cheap.

| Name | What it does | For whom | Price | Traction | Better than Squibby at | Where Squibby wins |
|---|---|---|---|---|---|---|
| **Vibe Island** ([site](https://vibeisland.app/)) | Native Swift app. Status for 30 coding agents, approve or deny permissions and answer questions from the notch, jump to the exact terminal, plan review, usage tracking, SSH. Local only, no account, no telemetry (site claims) | Developers running several agents | $19.99 one time for 1 Mac (early bird, includes one year of updates), free trial (site, 8 Nov 2026) | No user count on the site | Breadth: 30 agents, 20+ terminals, approvals, speed to market | It does not review what changed, fix it, undo it, teach, or keep notes. It is a remote control and a gauge |
| **CodeIsland** ([repo](https://github.com/wxtsky/CodeIsland)) | Free notch panel, status and approvals for 30+ tools, iPhone and Apple Watch companions | Developers | Free, MIT | 2,558 stars, pushed 28 Oct 2026 | Open source, wide tool coverage, phone and watch | Same as above. Also it is a possible fork base (MIT) if Squibby ever needs a faster notch shell. Not recommended: the founder chose own panel work |
| **Chimlo** ([Product Hunt](https://www.producthunt.com/products/chimlo-agents-in-your-macbook-notch)) | Track Codex and Claude Code, answer from the notch. Free, open source, no telemetry by default (listing) | Developers | Free | Not found | Approvals for Claude Code | Same |
| **NotchDeck** ([site](https://www.notchdeck.app/)), **NapCat** ([site](https://napcat.app/)), **AgentNotch** ([repo](https://github.com/appgram/agentnotch), 221 stars, no licence file), **hyderay/notch** (2 stars), **agent-notch** (GPL-3.0, 1 star) | Status for Claude Code and Codex, a few with approvals | Developers | Free or early access | Small | Nothing Squibby lacks | Same |
| **vibe-notch (Claude Island)** ([repo](https://github.com/farouqaldori/vibe-notch)) | Claude Code notifications and a session list in the notch | Developers | Free, Apache-2.0 | 2,531 stars, last push 20 Apr 2026 | Early and well known | Same |
| **Boring Notch** ([repo](https://github.com/TheBoredTeam/boring.notch)) | Music and widgets in the notch. Not a coding tool | Everyone | Free, GPL-3.0 (ideas only) | 11,302 stars | Shows people love notch apps | Not a competitor, but it is the proof the notch is a shelf people accept |

**What this group tells us.** Notch status for coding agents is already a commodity: free, open source, or $19.99. Squibby must not sell "status in the notch". The notch is the front door. The product behind it has to be review, proof, Undo and teaching.

## 2. On screen AI companions

| Name | What it does | For whom | Price | Traction | Better than Squibby at | Where Squibby wins |
|---|---|---|---|---|---|---|
| **HeyClicky** ([YC page](https://www.ycombinator.com/companies/heyclicky)) | Voice buddy next to the cursor. Sees the screen, points, explains, runs walkthroughs, starts background agents. Mac only, Windows waitlist | Everyone: founders, kids, video editors, builders | Sources conflict. Squibby's research (6 Oct 2026) lists Free, $20, $100 on its pricing page. A directory lists a free tier with 150 agent messages a month ([everydev](https://www.everydev.ai/tools/hey-clicky)) | YC, listed as Spring 2026 by the search result (Squibby's research says April 2026). Claims 25,000+ users (claim, via the repo's 10 Oct 2026 research). One tracker lists $500,000 raised, mostly YC (secondary) | Brand, reach, voice quality, general purpose "ask about anything on screen". It removed proactive agents in Aug 2026 because users "felt watched" (per repo research) | It cannot review or prove code changes, has no undo, no project memory shared with other tools, and is not built for the coding loop |
| **Big platform assistants** (Gemini for Mac, Siri on screen in macOS 27, Meta Muse, Microsoft Copilot Vision) | Screen aware help | Everyone | Free or bundled | Huge reach | Free and built in | Per product research section 12, none of them teaches inside a project, proves a fix, or works across builders. Not re checked in this pass |

## 3. AI code review for everyone (closest on "reviews every change")

| Name | What it does | For whom | Price | Traction | Better than Squibby at | Where Squibby wins |
|---|---|---|---|---|---|---|
| **CodeRabbit** ([pricing](https://www.coderabbit.ai/pricing)) | AI review on pull requests, and now in the CLI, the IDE and "agent loop" reviews before a PR exists, with one click fixes | Engineering teams on GitHub, GitLab and similar | $30 per developer per month (Essentials, $24 yearly), $60, $90, enterprise. Free for public repos. Extra reviews $0.25 per reviewed file (pricing page, 8 Nov 2026) | Series C $143M at $1.5B, 12 Aug 2026 (secondary coverage: [aggregators](https://www.scalevp.com/press/coderabbit-raises--60-million-series-b--valuation-hits--550-million) confirm the 2025 Series B of $60M at $550M). Estimates of 8,000 to 17,000 customers vary by source | Depth of review, integrations, money, team features, a sales team. **It now reviews inside the coding loop, which is Squibby's ground** | It reviews code for engineers. It does not explain in plain words, keep an Undo outside git, work in the notch, or serve a non engineer. $30 a seat is a team price |
| **Greptile** ([pricing](https://www.greptile.com/pricing)) | Reviews that know the whole codebase; learns your team's style; Knowledge Base MCP | Engineering teams | Free for one developer (50 credits a month); Pro $1 per credit, a base review is 1 credit; Plus 3; Apex 10; no seat fees; pre Series A startups get 500 credits a month for 6 months (pricing page) | Series A, about $25M to $30M, Benchmark, Sep 2025, about $180M valuation (secondary; sources differ on the amount). 2,000+ customers per a Jan 2026 report | Whole codebase understanding | Same as CodeRabbit |
| **Graphite (now part of Cursor)** ([Dealroom note](https://ai-startups.dealroom.co/news/note/cursor-acquires-graphite-to-expand-its-developer-workflow-into-code-review)) | Stacked pull requests and review | Teams | Not checked | Cursor agreed to buy it, 19 Dec 2025. Terms not disclosed. Graphite had raised over $50M | Workflow | Same |
| **Cursor Bugbot** ([docs](https://cursor.com/docs/bugbot)) | Reviews pull requests, comments with fixes, Autofix starts a cloud agent to fix | Cursor users | Usage based billing; the docs page gives no price. Exact rates not checked | The docs page gives no resolution statistics | Built into the most used AI editor | Same. It also only covers code in Cursor's world |
| **Claude Code Desktop** (per repo research, 6 Oct 2026) | "Verifies automatically after every edit"; worktrees; Remote Control | Claude users | Part of the Claude plan | The supplier | It is the supplier and it is free with the plan | See section 5 |

**What this group tells us.** Review is the best funded category in the whole list. All of them are built for pull requests and teams. A review that happens on the person's own Mac, within seconds of each file change, explained to someone who cannot read the diff, with a one tap Undo that never touches their git, is not what any of them sells. But CodeRabbit's move into the CLI and agent loop means the gap is narrowing. Treat it as the main long term threat.

## 4. Agent dashboards and orchestrators

| Name | What it does | For whom | Price | Traction | Better than Squibby at | Where Squibby wins |
|---|---|---|---|---|---|---|
| **Conductor** ([site](https://www.conductor.build)) | Mac app. Runs many Claude Code and Codex agents, each in its own git worktree; review and merge in one place. Cloud alpha added mid 2026 | Developers running several agents | App is free; you pay your model provider (secondary review) | Y Combinator, listed as Summer 2024 (secondary). A $22M Series A (31 Mar or 8 May 2026, aggregators disagree) is **unverified** | Parallel work, worktrees, merge flow | It manages agents. It does not judge what they changed for a beginner, and it is a git tool (Squibby's rule is it never touches the user's git) |
| **Superset** ([repo](https://github.com/superset-sh/superset), per its own site source available under ELv2) | Desktop app to run 100+ parallel agents | Developers | Free plus team plans (aggregator, March 2026) | $500K seed listed by a tracker, Jan 2026 (secondary) | Scale of parallel agents | Same as Conductor |
| **Emdash** ([repo](https://github.com/generalaction/emdash)) | Open source multi agent coding environment | Developers | Free, Apache-2.0 | 6,215 stars; YC W26 and $500K total per directory sources (secondary) | Open source and agent agnostic | Same |
| **Sculptor (Imbue)** ([repo](https://github.com/imbue-ai/sculptor)) | Parallel agents in containers; Imbue also released Vet, an open source verifier for agent output | Developers | Free beta (a competitor's page says so) | 246 stars, MIT. Imbue is a well funded lab | Verification research | Squibby is for non engineers and lives beside the tools they already use |
| **Vibe Kanban** ([shutdown post, 10 Apr 2026](https://vibekanban.com/shutdown)) | Kanban board that sends tasks to coding agents | Developers | Cloud plans cancelled | Its company, bloop, **shut down on 10 April 2026**. The CEO said "the vast majority are free users and we couldn't find a business model that we could get excited about". Still open source (Apache-2.0, 28,613 stars) | n/a | **A warning:** a popular free developer tool did not become a business. Daily users were "thousands" (their words) |
| **Claude Squad** ([repo](https://github.com/smtg-ai/claude-squad)) | Terminal app to manage several agents | Developers | Free, **AGPL-3.0** | 8,746 stars, last push 20 Aug 2026 | Simple and popular | Same |
| **Crystal, now Nimbalyst** ([repo](https://github.com/stravu/crystal), MIT, 3,129 stars, last push 26 Feb 2026) | Desktop agent manager. Nimbalyst is the active successor, free for individuals (per [Nimbalyst](https://nimbalyst.com/blog/vibe-kanban-after-bloop-whats-next/)) | Developers | Free for individuals | Small | n/a | Same |
| **Omnara** ([repo](https://github.com/omnara-ai/omnara)) | Started as a mobile view of Claude Code. The repo now calls itself "the open source managed agent platform" (Apache-2.0) with a cloud and a self host option | Developers building agents | No platform fee; pay for sandboxes (repo page) | 3,365 stars. YC S25 is not confirmed | Remote and phone access | It moved to a different market (agent infrastructure) |
| **Terragon** ([repo](https://github.com/terragon-labs/terragon-oss)) | Remote background agent orchestrator. The repo now says "formerly Terragon Labs" | Developers | n/a | 261 stars, last push 10 Feb 2026. I found nothing on why it stopped | n/a | n/a |
| **Many Claude Code add-on suites** (`oh-my-claudecode` 40,669 stars MIT, `ruflo` 81,172 MIT, `ECC` 299,139 MIT) | Agents, skills and memory bundles for Claude Code | Developers | Free | Large star counts | Free, huge community | They are configurations for people who read config files |

**What this group tells us.** Free open source tools set the price at zero. One of them (Vibe Kanban) had thousands of daily users and still closed. The buyer for a pure developer orchestration tool is hard to find. All of them assume the user reads diffs and uses git.

## 5. The AI tools' own built in features (the real threat)

| Name | Relevant built in feature | Source | What it means |
|---|---|---|---|
| **Claude Code** | `/rewind` and checkpoints, plan mode, auto memory (200 lines or 25KB per session), reads `AGENTS.md` when there is no `CLAUDE.md`, `/usage` with cache statistics and "recommendations" on what to change, `/insights` | [costs](https://code.claude.com/docs/en/costs), [memory](https://code.claude.com/docs/en/memory) | The supplier already ships cost advice and memory. It will keep improving. Squibby cannot win by being a better `/usage` |
| **Codex** | AGENTS.md; Memories (off by default, local, redacted) | [OpenAI docs](https://learn.chatgpt.com/docs/customization/memories?surface=app) | Same |
| **Cursor** | Rules, AGENTS.md, Bugbot, Autofix | [rules](https://cursor.com/docs/context/rules), [Bugbot](https://cursor.com/docs/bugbot) | Same |
| **Lovable** | Built in security scanning (a v2.0 feature per a blog) and an AI pentest with Aikido, launched at $100 per test for Lovable apps | [Aikido post](https://aikido.dev/blog/lovable-aikido-pentesting), [DEV article](https://dev.to/solobillions/lovable-just-added-ai-pentesting-heres-what-it-means-for-every-other-vibe-coder-27ka) | The builders are closing their own safety gaps, but only for their own apps |
| **Replit** | A Security Agent (per a vendor blog, [Lushbinary](https://lushbinary.com/blog/replit-security-agent-vibe-coding-vulnerability-scanning-guide/)) | secondary | Same |

**Pattern.** Each tool fixes its own safety and memory gaps inside its own walls. Nobody fixes the space between tools. That is Squibby's real argument: one reviewer and one memory across Claude Code, Codex, Cursor and Lovable, none of which has a reason to help the others.

## 6. Vibe code rescue and security

| Name | What it does | Price | Notes |
|---|---|---|---|
| **Repair freelancers and agencies** | Humans fix broken AI built apps. Squibby's research (22 Oct 2026) records $30 Fiverr gigs, $299 diagnoses, $1.5K to $10K audits, $15K to $50K rebuilds (sources are in that file) | See left | Proves people pay to get unstuck. Not a product competitor |
| **Vibe App Scanner** | Scans deployed Lovable and similar apps | $5 starter scan, $19 one time deep scan, $29 per month weekly, as of July 2026 per a comparison site ([vibe-eval](https://vibe-eval.com/alternatives/vibeappscanner/) and [vibecoding.app](https://vibecoding.app/blog/security-scanners-for-vibe-coded-apps)) | Vendor sourced prices |
| **Vibecheck** ([compare page](https://www.vibecheck.it.com/compare)) | Scanner aimed at Lovable apps | £12 per month solo (vendor comparison page, July 2026) | Vendor sourced |
| **VibeSecur, SecureMyVibes, VibeScan** | New scanners | Not confirmed | Many small entrants |
| **Aikido** | AI pentest inside Lovable | $100 per test at launch | A real security company with distribution through Lovable |

The size of the problem is documented: one disclosure (CVE-2025-48757) found 170 of 1,645 scanned Lovable showcase apps exposing data (reported by a blog, [DEV article](https://dev.to/solobillions/i-tested-every-vibe-coding-security-scanner-2026-heres-what-actually-works-p9k)). The scanners are cheap, thin and many. They scan a deployed app. None of them fixes the code, proves the fix, and gives Undo. That makes "fix with proof" the differentiator, not "find issues".

## 7. AI coding cost and token savers

| Name | What it does | Price and licence | Traction | Note |
|---|---|---|---|---|
| **ccusage** ([repo](https://github.com/ccusage/ccusage)) | Reads Claude Code's local logs and reports token use and cost | Free, MIT per its LICENSE file | 19,355 stars | The default way developers see their spend |
| **Claude Code Usage Monitor** ([repo](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)) | Live terminal monitor of limits | Free, MIT | 8,796 stars, last push 5 Jul 2026 | |
| **RTK** ([repo](https://github.com/rtk-ai/rtk)) | Compresses command output before the model sees it. Claims 60 to 90% less on common dev commands (claim) | Apache-2.0 plus BUSL-1.1 (README badge) | 85,833 stars, created 22 Jan 2026 | Fast growth shows how much people want "cheaper". Its own README says the saving "dilutes" across total cost |
| **Anthropic `/usage` recommendations** | Tells you what to change (trim CLAUDE.md, lower effort, compact) | In Claude Code | The supplier | Direct overlap with any "make it cheaper" feature ([costs](https://code.claude.com/docs/en/costs)) |

The signal is demand: a command output filter reached 85,833 stars in under ten months. But the savings are small pieces and the supplier is adding the same advice. Squibby's honest angle is not "we compress tokens". It is "we stop the wasted tries" (the fix loop breaker) and "we cut repeated exploration with small notes", both measured (see the memory file's section 7).

## 8. Memory products

Full detail is in `2026-11-08-memory-for-ai-tools.md`. Short list with funding:

| Name | What | Price and licence | Traction |
|---|---|---|---|
| **claude-mem** | Local memory for coding agents, hooks plus SQLite | Free, Apache-2.0 | 114,435 stars |
| **Mem0** | Memory API and OpenMemory | Open core, Apache-2.0 | 68,577 stars, $24M raised ([Built In](https://builtin.com/articles/mem0-raises-24m-AI-memory-infrastructure-20251103)), YC S24 badge |
| **Supermemory** | Memory API, local mode | MIT | 31,564 stars |
| **Letta** | Stateful agents | Apache-2.0 | 25,380 stars, $10M seed (secondary) |
| **Zep and Graphiti** | Temporal graph memory | Apache-2.0 | 32,629 stars (Graphiti) |
| **Cognee** | Graph memory | Apache-2.0 | 33,125 stars, $7.5M seed (Feb 2026) |
| **Basic Memory** | Markdown notes through MCP | AGPL-3.0 | 4,523 stars |

**What they do better:** more stars, more money, benchmark scores, developer integrations.
**Where Squibby can win:** each stores or searches memory for a developer to wire up. None is a Mac app for a non engineer where every line shows its source and has a Forget button, and where the same notes appear in every tool's AGENTS.md. But "memory" is the most crowded and best funded layer here, and the AGENTS.md study (arXiv 2602.11988) warns that bigger memory files can cost more. Do not lead with memory.

## 9. Teaching

Built in learning modes (ChatGPT Study mode, Claude Code's Learning output style, Gemini Guided Learning) exist but are opt in. Squibby's research (10 Oct 2026) cites a two year Khanmigo trial where students used the tutor in 17% of their mistake moments, and Anthropic's Jan 2026 study where AI assisted learners scored 50% against 67% on a comprehension quiz, the biggest gap in debugging. Squibby's approach, teaching at the moment of a real change in the person's own project, has no direct competitor found, but it is also the hardest part to prove people value or pay for. Treat as unproven.

## 10. Open gaps

| Gap | Who comes closest | Why it is still open | Strength of the gap |
|---|---|---|---|
| Review every change another tool makes, locally, as it happens, in plain words | CodeRabbit CLI and IDE reviews | They review for engineers, per developer seat, inside the coding loop but in developer language | Medium, narrowing |
| An Undo that works across tools and does not touch the person's git | `/rewind` in Claude Code (one tool), git worktrees in Conductor | Each tool's undo works only inside that tool; git tools use git | **Strong** |
| A fix that is proven, not just suggested | Cursor Autofix, CodeRabbit one click fixes, Claude Code Desktop auto verify | Proof is attached to the tool's own run, not shared | Medium |
| One reviewer and one set of notes across Claude Code, Codex, Cursor and Lovable | Nothing found | Each vendor has no reason to serve the others | **Strong** |
| Notch as home for the above (not just status) | Vibe Island, CodeIsland | They show status and approvals only | Medium. The notch itself is easy to copy |
| A non engineer buyer for dev tooling | Lovable, Replit (bundled) | Scanners and monitors target developers | Medium, unproven willingness to pay |
| Plain language teaching tied to the real change | Built in learning modes | Opt in, generic | Weak to medium, unproven |
| Memory a person can read, edit and forget, shared across tools | Basic Memory (AGPL, developers) | Aimed at developers; crowded layer | Medium, but not a headline |
| Measured token and try savings, with the method published | RTK (claims), Anthropic `/usage` | Everyone claims; almost nobody publishes net results | **Strong, if Squibby really measures** |

## 11. Where Squibby should position (blunt)

Do not sell the notch, do not sell memory, and do not sell "tokens". The notch is free or $19.99 and copied monthly. Memory is the best funded and most crowded layer, and a 2026 paper says over described repos cost more, not less. Token tools are growing fast but the supplier is shipping the same advice inside Claude Code. Review is the best funded category (CodeRabbit at $1.5B), but it is built for pull requests and teams, and Cursor agreed to buy Graphite. What is actually missing is **the safety net that works across AI coding tools for the person who cannot read the diff: it notices every change another tool makes, tells you in plain words if it broke something, fixes it with proof, and lets you undo it with one tap without touching your git.** That is one sentence, no competitor does all of it, and each AI vendor is structurally unlikely to do it for its rivals. Memory and teaching are how the safety net gets better and stickier over time, not why anyone downloads it. The risks are real: Claude Code Desktop already verifies after edits, CodeRabbit is moving into the loop, Vibe Kanban's closure shows free developer tools struggle to earn, and a solo founder has little time. The way through is to own "undo and prove, across every tool" for non engineers first, publish measured results, and let the notch be the doorway.

## Sources (all read 8 Nov 2026 unless noted)
- Notch app list: https://vibeisland.app/best-ai-agent-notch-apps/ and the vendor pages linked above
- CodeRabbit pricing: https://www.coderabbit.ai/pricing; funding: https://www.scalevp.com/press/coderabbit-raises--60-million-series-b--valuation-hits--550-million (Series B, 2025); Series C figures are from aggregators in a web search and not a primary source
- Greptile pricing: https://www.greptile.com/pricing; funding: TechCrunch, 18 Jul 2025: https://techcrunch.com/2025/07/18/benchmark-in-talks-to-lead-series-a-for-greptile-valuing-ai-code-reviewer-at-180m-sources-say
- Cursor and Graphite: https://ai-startups.dealroom.co/news/note/cursor-acquires-graphite-to-expand-its-developer-workflow-into-code-review
- Cursor Bugbot: https://cursor.com/docs/bugbot
- Vibe Kanban shutdown: https://vibekanban.com/shutdown (10 Apr 2026)
- Omnara repo: https://github.com/omnara-ai/omnara
- Anthropic docs: https://code.claude.com/docs/en/costs, https://code.claude.com/docs/en/memory
- Squibby's own research: `docs/research/product_research.md` section 12, `docs/research/2026-10-10-market-research.md`, `docs/research/2026-10-22-reality-check.md`
- GitHub API for stars, licences and dates
- Not verified: Conductor's Series A, Omnara's YC batch, Superset and Emdash funding, CodeRabbit's Series C and customer counts (aggregators only), HeyClicky's current pricing
