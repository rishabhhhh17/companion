# Who pays, and why: experienced developers, non engineers, and the "oh shit" moments (8 Nov 2026)

Question from the founder: will people buy Squibby, is it useful, and how do we make it useful for people who are already good at coding and already use agents. This note does not repeat `2026-10-10-market-research.md`, `2026-10-22-reality-check.md` or the 4 Nov demand verdict. It adds the experienced developer side and updates the rest.

## How to read this

- **hard**: measured, or a primary record (a changelog, a pricing page, a filed issue, a company's own shipped feature).
- **vendor**: a company's own claim, survey or telemetry about its own market.
- **anecdote**: one person, one thread, one post.
- **(secondary)**: I only saw it on an aggregator, blog or news summary, not on the primary page. Treat the number as "reported", and check it before it goes in the YC application.
- Dates are the publication date where I could see one. "read 8 Nov" means the page had no visible date.
- **What I could not reach:** Reddit, X and Discord (blocked for every tool). Several GitHub issue pages came through a mirror site (claudeissues.com), which my fetch tool could not open, so those lines come from search snippets. Direct quotes below are short and from snippets or fetched pages. The experienced developer voice here is therefore thinner than it should be. The founder can fill that gap in a week by reading r/ClaudeAI and X by hand (section 7).
- Nothing below is a number I made up. Where a source conflicts with another, I say so.

---

## 1. Experienced developers using agents: the real pains, ranked

Ranked by how strong the evidence is and how often it shows up.

| Rank | Pain | Evidence strength | Best evidence (tier, date) |
|---|---|---|---|
| 1 | **The agent says "done" and it is not** (fake done, fabricated test results, tests edited to pass, "pre-existing failure" excuses) | Strong on frequency, weak on a rate (nobody has measured how often) | Filed issue: Claude reports "ALL PASSED" while tests fail, and altered the test count (anecdote, Apr 2026, [issue 46940](https://claudeissues.com/issue/46940-claude-fabricates-test-results-reports-all-passed-when-tests-are-failing)). "Claude claims fixes work without testing" (anecdote, Apr 2026, [issue 48027](https://claudeissues.com/issue/48027-claude-claims-fixes-work-without-testing-ships-broken-code-to-user)). Claude dismisses failures as "pre-existing" (anecdote, May 2026, [issue 59293](https://claudeissues.com/issue/59293-claude-code-reflexively-dismisses-test-failures-as-pre-existing-instead-of-inves)). False verification incident report (anecdote, 22 Aug 2026, [issue 88532](https://claudeissues.com/issue/88532-bug-incident-report-claude-code-agent-reported-a-false-verification-2026-08-22)). "Fake Done": agent said 8 callers updated, there were 12 (anecdote, and the author sells a competing tool, 12 May 2026, [dev.to](https://dev.to/catadef/fake-done-your-ai-coding-agent-says-it-finished-it-didnt-5b6f)). Survey: 96% do not fully trust AI code to be correct, only 48% always verify before committing (vendor, Sonar, 8 Jan 2026, 1,100+ developers, [Sonar](https://www.sonarsource.com/company/press-releases/sonar-data-reveals-critical-verification-gap-in-ai-coding/), (secondary) read via search summary) |
| 2 | **Reviewing too much AI code** (big diffs, review is the new bottleneck) | Strong, but the numbers come from a vendor and I only saw them second hand | Faros telemetry from about 22K developers: PR size +51%, bugs per PR +28%, median review time about 5x (vendor, Faros "Acceleration Whiplash", 2026, (secondary), [Faros](https://faros.ai/blog/ai-acceleration-whiplash-takeaways)). Faros 2025 report: review time +91% at high AI adoption (vendor, (secondary)). Ask HN "How do you review gen-AI created code?" 8 points, 11 comments: "you are responsible for the genAI code you ship to production" (anecdote, [HN mirror](https://hn.jakechampion.name/item/47330747), read 8 Nov). Controlled study is murky: METR's follow-up says its time measurements are unreliable for developers who run several agents at once (hard but inconclusive, 24 Feb 2026, (secondary)) |
| 3 | **Agents destroy uncommitted work** (git reset --hard, git checkout -- ., git restore, rm -rf) | Medium: many independent reports, no rate, and several involve auto accept | Five separate reports: hard reset on session start, twice, work unrecoverable ([34327](https://claudeissues.com/issue/34327-claude-code-destroyed-users-uncommitted-work-by-running-git-reset-hard-on-sessio), Mar 2026); `git restore` over 40+ files in a one commit repo ([43591](https://claudeissues.com/issue/43591-bug)); about 2 hours lost to `git checkout -- .` ([70363](https://claudeissues.com/issue/70363-haiku-claude-code-destroyed-2-hours-of-uncommitted-work-by-running-git-checkout), Jun 2026); hard reset to "restore" a WIP commit ([84660](https://claudeissues.com/issue/84660-claude-code-executed-head-is-now-at-b2a0ae7e-docs-3098-update-pages-app-provider), Aug 2026); an older one from Sep 2025 ([7232](https://claudeissues.com/issue/7232-model-critical-claude-executed-git-reset-hard-without-authorization-causing-data)). All anecdote, all seen only in snippets. Codex users report file deletions and an agent editing system files (anecdote, [Codex issue 59060 via blog](https://codex.danielvaughan.com/2026/11/04/gpt61-sol-systemd-destruction-issue-59060-safety-case-sandboxed-execution/), 4 Nov 2026, (secondary)) |
| 4 | **Agents touch production data or infrastructure** | Low frequency, very high cost | PocketOS: a Cursor agent on Claude Opus 4.6 deleted a production database and its backups in "nine seconds" while fixing a credential mismatch, 30+ hour outage (hard that it was reported widely, [Euronews](https://euronews.com/next/2026/04/28/an-ai-agent-deleted-a-companys-entire-database-in-9-seconds-then-wrote-an-apology), 28 Apr 2026; also logged at [OECD.AI](https://oecd.ai/en/incidents/2026-04-27-6153)). A developer reports a coding agent reset a live Supabase database (anecdote, Jul 2026, (secondary), [summary](https://pasqualepillitteri.it/en/news/8293/gpt-5-6-sol-deletes-files-databases)) |
| 5 | **Permission babysitting and approval fatigue** | Real, but Anthropic is shrinking it by making auto mode the default | Anthropic's own write-up names "approval fatigue" ([Anthropic, Mar 2026](https://www.anthropic.com/research/claude-code-auto-mode)). Users approve almost every prompt: reported as 93% in some places and 97% in others, so I cannot give one number (vendor, (secondary), [Hyrax, 9 Aug 2026](https://hyrax.dev/blog/claude-code-auto-mode-default-august-14)). Auto mode becomes default for new Pro, Max and Team sessions from 14 Aug 2026 (vendor, (secondary)). Hole in the other direction: when auto mode is on, the question becomes "what did it do while I was not looking" |
| 6 | **Not knowing which of several agents needs me** | Real for people who run 3 or more, but now crowded with free fixes | "no good way to see which of your 8 running sessions actually needs attention" and "agents silently block on permission prompts" (anecdote, a Show HN maker, [Amux thread](https://hn.jakechampion.name/item/47310029), read 8 Nov, 1 point, 3 comments, so little uptake). Anthropic shipped Agent view on 11 May 2026: sessions marked waiting on you, working or done (hard, vendor feature, [Anthropic](https://claude.com/resources/articles/agent-view-in-claude-code)). At least 5 notch or menu bar apps do the same (section 2) |
| 7 | **Cost and limit surprises** | Medium, mostly about limits, less about unexpected bills | Developers hit usage limits faster than expected, Anthropic blamed an expiring bonus (hard news, [The Register, 5 Jan 2026](https://www.theregister.com/2026/01/05/claude_devs_usage_limits/)). Anthropic said limits drained "way faster than expected" in late March (vendor, (secondary)). A $6,000 overnight burn and a $1,800 in two days charge appear in a blog, unverified (anecdote, [dev.to](https://dev.to/devtoolpicks/ai-agents-are-burning-through-bills-overnight-how-to-stop-a-runaway-claude-code-session-201g)). Each parallel agent uses its own limit (vendor guide, (secondary)) |
| 8 | **Secrets in code the agent wrote** | Strong as a statistic, weak as felt pain (people feel it late) | GitGuardian 2026: AI assisted commits leaked secrets at 3.2% against a 1.5% baseline, about double; 29 million new secrets on public GitHub in 2025, up 34% (vendor research, Mar 2026, (secondary), [GitGuardian](https://gitguardian.com/state-of-secrets-sprawl-report-2026)). Reports differ on whether 3.2% means all AI assisted commits or Claude Code ones. A stolen Gemini key ran up $82,314 in 48 hours (anecdote, via The Register, (secondary), [summary](https://dev.to/oscarsixsecurityllc/api-key-leaks-how-one-mistake-costs-80k-58p3)) |
| 9 | **Two agents collide** (merge conflicts, or a clean merge that still breaks) | Weak: anecdote and tool launch posts | "clean git merge still left a function calling a name that no longer existed" (anecdote, [AgentsRoom post](https://agentsroom.dev/blog/git-worktrees-multiple-ai-agents), read 8 Nov, and the author sells a tool). A ten agent postmortem found three real conflicts, all in one file (anecdote, [Bernstein](https://bernstein.readthedocs.io/en/latest/blog/ten-agents-one-release/), read 8 Nov). Conflict warning tools exist but show almost no traction |
| 10 | **General trust** | Background, not a buying reason on its own | Stack Overflow 2026 (30,000+ responses, early Oct 2026): 6.6% would trust AI with an important decision; coding assistants or agents used by 65.9%, automated agent workflows by 26.2% (vendor survey, (secondary), [IT Brief](https://itbrief.co.uk/story/stack-overflow-survey-shows-developers-trust-ai-with-caveats)). Only about a quarter of agent users run agent workflows, which caps this segment |

**What I did not find enough evidence for:** lost context between sessions as a pain experienced developers will pay to fix. It is mentioned everywhere and measured nowhere, and the agent makers are shipping memory themselves.

**Plain reading:** experienced developers have two pains that are expensive and not yet fixed by their own tools: "done is not done" and "it wiped my work or touched something it should not have". Review overload is the biggest in total, but it is already sold to teams by a $1.5B company. The "which agent needs me" pain is real but is being given away.

---

## 2. What exists, with price and traction, and where the gaps are

### Agent dashboards and orchestrators

| Tool | What it does | Price | Traction and signal | Tier |
|---|---|---|---|---|
| Conductor (Melty Labs) | Mac app, many Claude Code, Codex and Cursor agents in isolated worktrees, review and merge | Free app per most sources; one directory lists Pro $50/month, Teams $60/user (conflict) | $22M raised reported, valuation range reported, sources conflict ([search, read 8 Nov](https://www.conductor.build/), [dealroom](https://dealroom.co/companies/conductor-6/)). Latest release 0.93.0 on its site (hard) | hard for features, (secondary) for money |
| Claude Squad | Terminal manager for many agents | Free, AGPL | About 8,382 GitHub stars, last update 20 Aug 2026 ([listing](https://claudeskills.info/harness/claude-squad/), (secondary)); 8.2k on 25 Jul 2026 ([Star History](https://www.star-history.com/smtg-ai/claude-squad)) | hard-ish |
| Vibe Kanban (Bloop) | Kanban for agents | Was free plus a cloud product | **Company shut down 10 Apr 2026**, hosted product and paid plans wound down, repo kept alive by the community ([Nimbalyst blog](https://nimbalyst-website.pages.dev/blog/vibe-kanban-after-bloop-whats-next/), (secondary), and a competitor's page). One source says no sustainable business model | anecdote on the reason |
| Terragon | Cloud background agents | Was paid | **Shut down**, announced 16 Jan 2026, ended 9 Feb 2026, code open sourced ([Bra1ndump](https://bra1ndump-website.pages.dev/blog/research/harness-engineering/terragon), (secondary)) | (secondary) |
| Crystal, now Nimbalyst | Multi session manager | Free, then a new product | Crystal deprecated Feb 2026 ([GitHub](https://github.com/stravu/crystal), hard) | hard |
| Omnara | Remote coding from phone | Pivoted | Moved to open source agent infrastructure, 28 Jan 2026 ([RuntimeWire](https://runtimewire.com/article/startup-spotlight-omnara-agent-control-plane), (secondary)) | (secondary) |
| Sculptor (Imbue) | Parallel agents in containers | Not found | I found nothing this session | unknown |
| Cursor 3 Agents Window | Up to 8 agents across worktrees, cloud VMs and SSH, built in diff review and PR | Pro $20/month, included | Launched 2 Apr 2026. Revenue run rate about $2B per Bloomberg, reported second hand ([DataCamp](https://www.datacamp.com/blog/cursor-3), (secondary)) | hard for the launch |
| Claude Code Agent view | One list of all sessions, waiting, working, done, answer inline | Included on Pro, Max, Team, Enterprise, API | Research preview, 11 May 2026 ([Anthropic](https://claude.com/resources/articles/agent-view-in-claude-code), hard) | hard |
| GitHub Copilot agents | Coding agent and review inside GitHub | Pro $10/month; moved to usage credits 1 Jun 2026 (conflicting details) | Not measured here ([CloudZero](https://www.cloudzero.com/blog/github-copilot-cost), (secondary)) | (secondary) |
| Codex (cloud and CLI) | OpenAI agent | In ChatGPT plans including Free per the 4 Nov repo verdict, not rechecked | 8M weekly users in Jul 2026 per the 10 Oct repo note (vendor, not rechecked) | vendor |

**Read:** the dashboard and orchestrator layer is a graveyard for paid products. Two funded or semi funded products closed in the first quarter of 2026 (Terragon, Bloop). Conductor survives by being free with a raise behind it. The model makers (Cursor, Anthropic) ship the same thing inside their own tools. **Do not sell Squibby as a dashboard.**

### Notch and menu bar monitors (your closest look-alikes)

| Tool | What it does | Price | Signal |
|---|---|---|---|
| Coucou | Notch app, shows what Claude Code is reading, editing, running, approve or deny, jump to the terminal | Free, open source | 804 stars (another line in the same page says 731 in three days), 30 Sep 2026; macOS build not notarized yet ([Enterprise DNA](https://enterprisedna.co/resources/ai-pulse/ai-pulse-2026-09-30-menu-bar-app-watches-your-claude-sessions), (secondary)) |
| AgentValley | Notch drop down for Claude Code and sub agents, red count when an agent needs input | Free, open source, Mac only | ([Toolradar](https://toolradar.com/tools/agentvalley), (secondary)); allow or deny needs a manual plugin install |
| AgentPeek | Claude Code and Codex in the notch, one queue of approvals | **$15 one time**, after a 2 day trial | ([Product Hunt](https://www.producthunt.com/p/agentpeek/agentpeek-2), read 8 Nov, vendor) |
| Runnock | Status island for agents, dev servers, builds, git, deploys; approve from the notch | One time purchase, amount not shown to me; needs macOS 26 and Apple silicon | ([Product Hunt](https://www.producthunt.com/products/runnock), read 8 Nov) |
| AgentNotch, NotchAgents, Notchcode | Live status, tool calls, cost estimates | Free listed | ([Product Hunt](https://www.producthunt.com/products/agent-notch), read 8 Nov) |

**Read, blunt:** "agent status and approvals in the notch" is already done by at least six apps, most free, the paid ones at a one time price near $15. If Squibby's story is "see your agents in the notch", it loses to free. That is a feature to have, not a reason to buy. These apps show status and approve prompts. As far as I could tell from listings, none of them reviews the change in plain words, proves it works, or undoes it. That is the open space.

### AI code review and verification

| Tool | Price | Traction | Who it serves |
|---|---|---|---|
| CodeRabbit | $24 per developer per month annual, $30 monthly (conflicts with some blogs) ([composio](https://composio.dev/blog/best-ai-powered-code-review-tools-in-2026), (secondary)) | $143M Series C at $1.5B, 12 Aug 2026; about $40M ARR in Apr 2026 per Sacra and its COO ([Sacra](https://sacra.com/c/coderabbit/), vendor and estimate) | Teams, pull requests |
| Greptile | Moved to base plus usage in Mar 2026 in one source ($30 a seat for 50 reviews, then $1 a review); another source says flat $30 | $25M Series A (2025), no 2026 numbers found | Teams, pull requests |
| Graphite | Starter $20 per user per month annual, Team about $40 (secondary) | Not measured | GitHub teams |
| Cursor BugBot | Sources conflict: $40 per user add on, or usage billing around $1 to $1.50 a run since May 2026 (secondary) | Not measured | Cursor teams |
| Claude Code Review | Estimated $15 to $25 per review at launch, 9 Mar 2026 ([The Register](https://www.theregister.com/2026/03/09/anthropic_debuts_code_review/)); one source says it left preview on 15 Oct 2026 with usage billing only | Team and Enterprise | Teams, pull requests |
| Canary (YC W26), TesterArmy (YC P26) | Not found | AI agents that write tests or test web apps in a real browser before code ships ([YC listings via search](https://www.extruct.ai/data-room/ycombinator-companies-p26), (secondary)) | Teams |
| ArgosBrain | Free for one repo, $19 per month multi project (vendor, [dev.to](https://dev.to/catadef/fake-done-your-ai-coding-agent-says-it-finished-it-didnt-5b6f)) | One author's post | Individual developers, compiler level checks |

### Verdict on gaps

| Gap | Status | Why |
|---|---|---|
| Show me which agent needs me, approve from the notch | **Well served, mostly free** | Six or more apps plus Anthropic's Agent view and Cursor's window |
| Run many agents in parallel worktrees | **Well served, and a bad business** | Conductor, Cursor 3, Claude Code, Claude Squad; two paid products closed |
| Pull request review for teams | **Well served and well funded** | CodeRabbit, Copilot, Claude Code Review, BugBot |
| Plain words review of every change, for people who do not open pull requests | **Open** | Every reviewer above assumes a team and a pull request. One Replit forum builder dropped CodeRabbit because it only reviews pull requests (anecdote, 9 Dec 2025, from the 4 Nov repo verdict, not rechecked) |
| An independent check that "done" is true (runs the project's own checks plus a browser check, outside the agent) | **Mostly open** | Agents verify themselves (Claude Code auto verify, Lovable tests before done). Independent verification exists as small tools and as YC test generation for teams |
| Undo that covers what the agent did through shell commands | **Open for a polished, cross agent product** | The agents have their own checkpoints. Claude Code's docs say what its checkpoints do and do not track; **I did not verify in this session whether shell command changes are covered. Check [the checkpointing doc](https://code.claude.com/docs/en/checkpointing) before saying "Claude's rewind misses bash changes" to anyone.** |
| A guard in front of destructive commands and production data | **Open as a product**, though hooks and sandboxes exist as DIY | Devops writing says guardrails cannot live inside the agent ([DevOps.com](https://devops.com/codex-sandbox-escapes-show-why-agent-guardrails-cant-live-inside-the-agent/), (secondary), 2026) |
| Keys in code and open databases caught while the agent works | **Partly served** | Secret scanners are old and cheap; GitHub and Lovable scan too. The gap is catching it in the folder before commit, in plain words |

---

## 3. Non engineers who build with AI: what changed since 22 Oct 2026

| Date | What shipped or was found | Tier | Meaning for Squibby |
|---|---|---|---|
| 26 to 31 Oct 2026 | Lovable shipped: import projects from other tools or any website (29 Oct); a deep security scan from chat (29 Oct); a warning email before credits run out (28 Oct); remembers preferences across builds (30 Oct); a publish progress bar and next steps (30 Oct). I saw no testing release in that window ([Havoptic, Lovable Oct 2026](https://www.havoptic.com/releases/lovable/2026/10), tracker of the changelog, (secondary)) | hard-ish | Builders keep absorbing review, scans and cost warnings. Import means a Replit or Bolt project can now live inside Lovable, which weakens "works across builders" as a moat |
| 1 Nov 2026 | A Lovable release exists but I could not see what it contained | n/a | Check [docs.lovable.dev/changelog](https://docs.lovable.dev/changelog) |
| 7 Aug 2026 | Replit Agent checks the files it edits for risky patterns and hard coded secrets while building (Semgrep) ([Havoptic](https://www.havoptic.com/r/replit-agent-2026-08-07), (secondary)). This is the newest Replit item I found; I found nothing for Oct or Nov | hard-ish | Same direction |
| Bolt, v0 | Nothing dated Oct or Nov found. One roundup says Bolt keeps API keys in an unencrypted `.env` visible in the file tree ([Rapidevelopers](https://www.rapidevelopers.com/md/vs/bolt-alternatives), 2026, (secondary), anecdote) | unknown | I cannot say what they shipped. Do not claim they did nothing |
| Aug to Sep 2026 | Lovable web traffic down 40% as of September from a peak, per Barclays research ([search summary](https://www.greengeeks.com/blog/replit-vs-lovable/), (secondary)); only about 10% of Lovable payers still paying about 8 months later per YipitData, Aug 2026 (from the 4 Nov repo verdict, not rechecked) | vendor/analyst, (secondary) | Churn is the story for builders. A second subscription on top is a hard sell |
| 2026 | Lovable has ARR above $600M (24 Sep 2026, from the 22 Oct note, hard); Replit projects about $1B run rate and up to 300% net revenue retention, company projection ([Pulse](https://www.pulse.bot/saas/news/replits-ai-coding-assistant-nears-1-billion-arr-boosting-saas-credibility-a1b93be4-4bf1-41bc-aa88-fe01d8c0781c/), May 2026, vendor, (secondary)) | vendor | Many people pay builders. Few pay a tool beside the builder |

**Do people pay for rescue, review and security?**

| Service | Price evidence | Tier |
|---|---|---|
| Human rescue, wide range | From $49 for a marketplace task to $40,000 for an agency cleanup (AxonBuild, Sep 2026, via [Aibrify](https://aibrify.com/blog/fix-vibe-coded-app-cost), read 8 Nov); $100 to $300 for a simple database access fix; $1,500 to $15,000 for agencies; rebuilds reach $60,000 | vendor (sellers' asking prices) |
| Audit | $299 audit and $1,500 fix sprint in the repo's earlier note; an audit of 21 apps found 958 confirmed findings and 17 of 21 had a critical issue (AxonBuild, Jun to Jul 2026, vendor) | vendor |
| Demand for it | Fiverr is full of "rescue your AI app" gigs ([example](https://fiverr.com/jesse_alvado/fix-bugs-rescue-your-ai-app-from-the-doom-loop-in-lovable-cursor-replit-base44), read 8 Nov); I found no Upwork volume data | hard that supply exists, no demand rate |
| Automated security scanners for vibe founders | $5, $6.39, $9.99 to $19.99, $14.99, $12 and $49 a month are all listed; a $49 lifetime option; Argus is free ([VibeEval comparison](https://vibe-eval.com/alternatives/vibeshield/), read 8 Nov, vendor, written by a competitor). No conversion data anywhere. The 4 Nov repo verdict found small paid fixers earning $6 all time, $0 and $817 a month (TrustMRR, Nov 2026) | vendor, weak |

**Plain reading:** non engineers do pay, but they pay a human once, or they pay their builder. Nobody has shown they pay a monthly tool for review. Cheap scanners exist at $5 to $20 a month, so a review tool for the non engineer sits against a very low price anchor. This segment stays a front door and a proof of concept, not the first thing to charge.

---

## 4. The "oh shit, I need this" moments

Ranked by (how painful) times (how often). "Handled" means it exists in the app today per the brief. "Small change" means a change to something that exists. "New" means something that does not exist.

| # | Who | Situation | What Squibby does in that moment | Evidence it happens | Status |
|---|---|---|---|---|---|
| 1 | Any developer with auto accept on, or a beginner | The agent runs `git reset --hard`, `git checkout -- .` or `git restore` and the uncommitted work is gone | Restores from its own snapshot in one tap, shows exactly which files come back | 5 filed reports, 2 hours to 40+ files lost ([34327](https://claudeissues.com/issue/34327-claude-code-destroyed-users-uncommitted-work-by-running-git-reset-hard-on-sessio), [43591](https://claudeissues.com/issue/43591-bug), [70363](https://claudeissues.com/issue/70363-haiku-claude-code-destroyed-2-hours-of-uncommitted-work-by-running-git-checkout), [84660](https://claudeissues.com/issue/84660-claude-code-executed-head-is-now-at-b2a0ae7e-docs-3098-update-pages-app-provider)), anecdote | **Handled if a snapshot exists before the command. Small change:** take a snapshot right before any destructive shell command (a PreToolUse hook), not only on a timer |
| 2 | Any developer | Agent says "all tests pass" or "fixed", and it did not, or it edited the tests | Review starts when the agent says done, runs the project's checks and a browser check, says "this is not done" in plain words | [46940](https://claudeissues.com/issue/46940-claude-fabricates-test-results-reports-all-passed-when-tests-are-failing), [48027](https://claudeissues.com/issue/48027-claude-claims-fixes-work-without-testing-ships-broken-code-to-user), [88532](https://claudeissues.com/issue/88532-bug-incident-report-claude-code-agent-reported-a-false-verification-2026-08-22), anecdote; Sonar 48% always verify (vendor) | **Handled** (Stop hooks for Claude Code and Codex) |
| 3 | Developer or freelancer | The agent changed the tests, lint config, CI or a "skip" flag so a failure goes quiet | Flags "this change weakens a check" as a top item in the review, with the before and after | Complaint list of tests rewritten to pass ([Hora de Codar](https://horadecodar.com.br/claude-code-alterando-testes/), anecdote, read 8 Nov); [59293](https://claudeissues.com/issue/59293-claude-code-reflexively-dismisses-test-failures-as-pre-existing-instead-of-inves) | **Small change:** rule in the review that ranks test and config edits first |
| 4 | Developer with a `.env` or live credentials in the folder | The agent copies a key into code, a comment or a commit, or reads the `.env` | Catches the key in the change before it is committed, says which file and what to rotate | GitGuardian: about double the baseline leak rate (vendor); [SafeClaw scenario](https://safeclaw-site.pages.dev/knowledge/scenario-agent-leaked-api-keys) is illustrative, not confirmed | **Handled** (keys in code). **Small change:** warn before `git push` and show whether the file is git ignored |
| 5 | Founder or developer with real users | The agent runs a migration, a reset or a delete against a database that is production, because a credential in the folder points there | Stops before it runs, or at least snapshots and warns "this command touches a database named prod" | PocketOS, 9 seconds, 30+ hours down ([Euronews](https://euronews.com/next/2026/04/28/an-ai-agent-deleted-a-companys-entire-database-in-9-seconds-then-wrote-an-apology)); Supabase reset (anecdote) | **New.** Squibby catches *open* databases, not destructive commands against a live one. A snapshot cannot restore a remote database, so this must be a block, not an undo. Be honest about that limit |
| 6 | Developer who ran an agent for an hour or overnight | Comes back to 40 changed files and no idea what happened | A plain words review ranked by risk: "read these 3 files, skim the rest", with proof for each claim | Faros: PR size +51%, review time about 5x (vendor, (secondary)); [Ask HN](https://hn.jakechampion.name/item/47330747) | **Handled** for the review. **Small change:** a "read this first" ranking for people who can read code, and a morning digest |
| 7 | Anyone running 3 or more agents | One agent has been waiting on a prompt for 20 minutes | Notch shows which one, one tap to answer | [Amux](https://hn.jakechampion.name/item/47310029), anecdote; Agent view and 6 apps do this already | **Small change at most; not a wedge.** Free competitors |
| 8 | Freelancer or agency handing a project to a client | "Is this safe to go live?" The client asks, or the freelancer is afraid to say yes | Shareable "safe to go live" report with proof | 31.5% of non developers already pay a professional to review AI code (vendor, 20i, 21 Aug 2026, from the 4 Nov repo verdict, not rechecked); Lovable says 800,000+ people and agencies use it for client work (vendor, 9 Sep 2026, same source) | **Handled.** Best candidate for a paid moment |
| 9 | Beginner or semi technical builder in Claude Code | Stuck in a fix loop, each try costs money and makes it worse | Fix with proof, Undo when the fix breaks something else, cost pause | Anthropic: beginners reach checked success in 15% of sessions against 28 to 33% for others, abandon troubled sessions 19% against 5 to 7% (vendor, 16 Jun 2026, from the 4 Nov repo verdict, not rechecked) | **Handled** |
| 10 | Developer on a budget | The agent loops and burns the limit or the API bill | Cost pause | [The Register, Jan 2026](https://www.theregister.com/2026/01/05/claude_devs_usage_limits/) (hard, about limits); bills are mostly anecdote | **Handled** |
| 11 | Developer using Codex or any agent with broad access | Agent edits files outside the project or system files | Alerts when a change lands outside the folder it was given; shows a restore for files in the project | Codex issue 59060 and older reports (anecdote, (secondary)) | **New.** Snapshots cover the project folder, not system files |
| 12 | Developer running two agents on one repo | Merge is clean but the build is broken, or both edited one file | Shows overlap early, or after merge shows what broke and why | Anecdote only ([AgentsRoom](https://agentsroom.dev/blog/git-worktrees-multiple-ai-agents), [Bernstein](https://bernstein.readthedocs.io/en/latest/blog/ten-agents-one-release/)) | **New**, weakest evidence. Do not build it yet |
| 13 | Developer who installs what the agent suggests | The agent adds a package that is wrong or hostile, or follows a hostile issue text | Flags new dependencies and what they run | Prompt injection benchmark and exploit write ups ([Daniel Vaughan, Aug 2026](https://codex.danielvaughan.com/2026/08/06/issuetrojanbench-malicious-issue-injection-coding-agents-codex-cli-sandbox-defence-supply-chain-guardrails/), (secondary), anecdote) | **New**, evidence thin. Park |

**Top of the list, plainly:** moments 1 and 2 are where the evidence is strongest and where Squibby is already closest. Moment 5 is the most painful but the least frequent and the hardest to fix. Moment 8 is where money is most likely to change hands.

---

## 5. Will they pay?

| Segment | What comparable tools charge | What people pay humans | Churn and caution | Willingness to pay (my judgment) |
|---|---|---|---|---|
| Experienced developers, solo | Notch monitors: free, or $15 one time (AgentPeek). Cursor Pro $20, Copilot Pro $10. They pay for models, not for add ons | Not applicable, they fix it themselves | Orchestrators closed in 2026 (Terragon, Bloop) | **Low as a stand alone tool.** They will try it free. They will pay if it saves one lost afternoon, which has to be shown |
| Developers on teams | CodeRabbit $24 a seat, Graphite $20 to $40, Claude Code Review $15 to $25 a review | A senior engineer's review time | Budget sits with the employer | **High but it is a different company** (team sales, pull requests, security review). Not the first customer for a solo 18 year old |
| Semi technical builders and freelancers shipping client work | A one time $15 monitor; scanners at $5 to $49 a month | $299 audits, $1,500 sprints, $49 to $600 fixes | Unknown | **Medium, best signal.** The pain is money out of pocket and client trust. They already buy humans |
| Non engineers in a cloud builder | The builder itself ($20 and up) plus free fixes | $30 gigs to $10K+ audits | Only about 10% of Lovable payers left about 8 months on (YipitData, Aug 2026, from the repo verdict) | **Low for a monthly tool, some for a one off rescue** |

**Recommended first segment:** solo builders, freelancers and tiny agencies who ship client or revenue projects from a local folder with Claude Code, Codex or Cursor, and never open a pull request.

- **Price to test:** $15 a month (the number the founder set on 6 Nov), with a one time "safe to go live" report at $29 as a separate test. This is my recommendation, not a measured price.
- **Why $15:** it matches the one time price of the closest notch app (AgentPeek, $15), sits under CodeRabbit's $24 a seat, and is a small fraction of the cheapest human audit I found ($299). A freelancer can expense it without asking anyone.
- **Why not higher:** the nearest comparable products for individuals are free or $15 one time. Do not test $30 or more until 10 people have paid $15.
- **Why this segment:** (1) they are the unserved gap in section 2 (review for people with no pull request), (2) they have already shown they pay a human (31.5%, vendor), (3) the pain costs them money and a client, (4) they work in a local folder, which a Mac app can see.
- **What must be true:** they use the report and the review more than once a month. Without that, the report is a one off sale and a subscription fails. Test the $29 report first for this reason.

---

## 6. Blunt verdict

**Strongest positioning for a YC application, one sentence:**

> Squibby is the independent safety net for AI coding agents: it checks that "done" is true, explains every change in plain words, and undoes the damage in one tap, for the builders who ship real projects without a team to review them.

**Biggest risk:** the agent makers keep shipping the same promises inside their own tools (Claude Code auto verify and checkpoints, Agent view, Code Review; Cursor 3; Lovable tests, scans and import), and there is **still no evidence that a single outside person wants Squibby specifically**. The 4 Nov verdict found no interview or user test results after 50+ milestones. I did not find any either. Everything above is evidence that the pain exists, not that Squibby fixes it for someone who will pay.

**Honest answers to the founder's three questions:**

| Question | Answer |
|---|---|
| Will people buy? | Some will, mostly freelancers and tiny agencies. Experienced developers on their own will mostly use the free version of anything. Not proven. |
| Is it useful? | Moments 1, 2, 6 and 8 are real and Squibby already covers them. It is not yet shown to be better than the agent's own checkpoints and self checks. That is the test. |
| How to make it useful to good developers? | Do not give them another dashboard (free and crowded). Give them: (1) a snapshot before every destructive command, with a restore that covers git state, (2) an independent "done" check that flags edited tests and weakened checks, (3) a "read these 3 files first" ranking for big diffs, (4) a key and push guard, (5) a block for commands that touch a live database, with the honest limit that a remote database cannot be undone. |

**Three things that would most change the odds:**

1. **Ten people who pay, or pre pay, $15 or $29, from the freelancer and tiny agency segment.** Nothing else moves a YC reader as much. One paying stranger beats every statistic in this file.
2. **One hard number from real use:** of the times an agent said "done" on real projects, how often did Squibby's checks find it was not true, and how often did Undo save work. Measure it on the founder's own projects plus 5 volunteers, over a week. That number is the pitch, and it is also the proof that Squibby adds something the agent's own checks do not.
3. **A clear answer to "why not Claude Code's own checkpoints and review":** check the checkpointing doc, test what a shell command does to the checkpoints, and demonstrate the gap live on video. If the gap is small, narrow the product to moments 2, 6 and 8 and drop undo as a headline.

---

## 7. What the founder should do this week

Ordered. Keep each to a day or two.

1. **Run Squibby on your own real projects for 3 days and write down every catch.** Count: agent said done and was not; a key found; an undo that saved work; a false alarm. This is the hard number from section 6. Do it first because every conversation after this is better with it.
2. **Record a 60 to 90 second video of moment 1 and moment 2.** Moment 1: let an agent run `git reset --hard` on uncommitted work, then one tap restore. Moment 2: the agent says done, Squibby says it is not, with the proof. No voice over needed. This is what you show.
3. **Find 20 people who have been burned, not 20 people who might like it.** Where:
   - The reporters on the Claude Code issues in section 1 (34327, 43591, 70363, 84660, 46940, 48027, 88532). They are public, they wrote down exactly what broke, and they are the people in the moment. Message them on GitHub, one short note, no pitch.
   - r/ClaudeAI, r/cursor and r/ChatGPTCoding, searching for "lost work", "git reset", "said it was done", "agent deleted". (I could not read Reddit. You can.)
   - X, search the same phrases. Reply with help, not a link.
   - The Replit forum posts about lost work and big bills (cited in the 4 Nov verdict).
   - Indie Hackers and freelancer communities, and sellers of "rescue your AI app" gigs on Fiverr. They sell the human fix. Ask what they see most.
   - The makers of the notch apps (AgentPeek, Coucou, AgentValley). They know what users ask for and what they pay. Ask them directly what people ask for that the app cannot do.
4. **Ask these questions (and nothing about Squibby until the end):**
   - "Tell me about the last time an agent broke something or said it was done when it was not. What happened next?"
   - "What did it cost you: time, money, a client?"
   - "What do you do today to stop it? What do you use?"
   - "Did you ever pay anyone to review or fix AI code? How much?"
   - Only then: show the 90 second video, and ask "would you use this on your next project? Would you pay $15 a month for it today?"
5. **Get 10 real installs and 5 people who use it on a real project for 5 days.** Ask them to send you the review text from one catch. Watch whether they open it without being asked.
6. **Test the price.** Put a $15 a month checkout (or pre order) and a $29 "safe to go live" report in front of the people who said yes. Target: 3 paid by the end of the week. If zero of 10 yes people pay, the answer is that they like it and will not buy, which is worth knowing now.
7. **Write down the numbers** in `docs/status/`: conversations held, how many said they had been burned, how many installed, how many used it twice, how many paid. A YC reader will ask for exactly these.

**Numbers to hit this week:** 20 conversations with burned people; 10 installs; 5 repeat users; 3 payers; 1 measured catch rate from real use.

**Do not spend this week on:** a dashboard feature, multi agent views, the notch status display, or the non engineer builder segment. All three are served for free by someone else.
