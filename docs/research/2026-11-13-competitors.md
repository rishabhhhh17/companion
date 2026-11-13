# Competitive map, 13 Nov 2026 (fact checked)

Research for Squibby (working name). A second pass on 13 Nov 2026 reopened every source in the first draft and checked each claim against it. Anything I could not confirm is marked **unconfirmed**. Most sources are the vendors' own pages, so they show what each company claims, not independent tests.

## What the fact check changed

- **HeyClicky quotes fixed.** The hover peek line and the homepage "draws" line were not verbatim in the first draft; both now quote the source exactly. The model is "GPT-6 Luna" with "GPT-6 Sol" for deep answers, not just "GPT-6". The 12 Sep entry gives each Clicky "its own name, face, memory, and job", not "files". Added the 18 Sep and the 6 Nov Windows notch entries.
- **New and important: HeyClicky is a YC company (Spring 2026)**, and YC lists its one-liner as "The simplest interface in the world to talk AI models + spawn agents". That is very close to Squibby's own vision line.
- **Codex blog claim corrected.** The blog does not say "ghost snapshots". It says an experimental `/undo` "existed briefly but was removed", and cites GitHub issue #16784. I have now read the whole Codex command page (all ~143,000 characters). It lists no undo, rewind or checkpoint command.
- **Claude Code ultrareview corrected.** The 3 free runs are a one time allotment per account and do not refresh. After that a review typically costs $5 to $25 in usage credits.
- **Claude Code rewind nuance added.** Rewind does undo Bash changes to a file Claude already edited with its file tools. Only files that Bash alone changed are left alone. A background `/code-review --fix` run also edits outside the checkpoints.
- **Lovable corrected.** The Quick scan runs "on every publish", not "when the publish dialog opens".
- **Bolt.** I removed the unsourced "third party blog says it is paid" line. Bolt's own post names no plan limit.
- **CodeIsland.** Credential redaction is documented for push notifications, not for every command.
- **Added for the B2B question: Sparkles (YC W26) and Runtime (YC P26).** Both let non engineers at companies run coding agents. Both run in the cloud and end in a pull request.

## Summary

- **HeyClicky is the closest product in shape, it is YC backed, and its pitch overlaps Squibby's.** Since 23 Oct 2026 it runs on Mac and Windows, draws 2D and 3D explanations on screen, can drive the computer with your approval and lives in a notch. Hovering the notch has opened a small peek since 24 Sep. Its sources say nothing about reviewing, proving or undoing code.
- **The tools you build with now cover review, undo and "prove it works" for themselves.** Claude Code has `/rewind` (aliases `/undo`, `/checkpoint`), `/code-review --fix`, `/security-review` and `/verify`, which runs the app to confirm a change. Cursor has checkpoints and Bugbot. Lovable and Bolt run security checks at publish time. Each covers only its own tool.
- **Agent notch apps (Vibe Island, CodeIsland) show status and handle approvals for about 30 agents.** Neither says it offers review, proof or undo.
- **Local guards (dcg, HOL Guard, Belay) block dangerous commands across tools.** HOL Guard Pro costs $15 a month, the same as planned Squibby Pro, and keeps local receipts.
- **The B2B version of "non engineers build with coding agents" already has two 2026 YC companies (Sparkles, Runtime).** Both are cloud sandboxes that end in a pull request for engineers to review. Neither is a local, on device helper.
- **Squibby's real gap is the whole package in one place, locally, across seven tools, in plain words.** That is a review written for non engineers, proof from the project's own checks plus a browser check, undo that covers changes from any tool without touching git, and a saved copy before destructive commands. No single competitor I found combines these. Each piece on its own exists somewhere.

---

## 1. HeyClicky (formerly Clicky)

**Company.** Y Combinator Spring 2026, founded 2026, San Francisco. YC's one-liner: "The simplest interface in the world to talk AI models + spawn agents". The founders section on the YC page is empty. Source: https://www.ycombinator.com/companies/heyclicky. **Unconfirmed:** a funding amount. A search summary named a founder and a June 2026 pre seed round from aggregator sites, but I did not open a primary source for either, so I leave them out.

**What it does.** An AI helper you call with a hotkey. It sees your screen, answers by voice and "draws right on your screen to point the way". Saying "heyclicky agent" has it do a task. Source: https://heyclicky.com

**Platforms.** Mac needs macOS Sonoma 14.2 or later. Windows needs Windows 10 or 11. Source: https://heyclicky.com

**Pricing** (https://heyclicky.com):
- Free: 25 talk messages and 25 agent messages a month
- Pro: $20 a month, unlimited talk and dictation, 150 agent messages a month
- Max: $100 a month, unlimited talk and dictation, 1,000 agent messages a month
- Yearly billing is 20% off. Students get 50% off their first month of Pro.

**Privacy claim.** "we only see your screen when you press the hotkey, and screenshots are never stored." The same page says it keeps "basic text summaries" for context. Source: https://heyclicky.com

**Changelog** (all from https://heyclicky.com/changelog):
- **12 Sep 2026 (1.0.49 Mac), "Introducing Clickys".** Each Clicky has its own name, face, memory and job. Adds Home, routines, custom MCP connections and computer use permissions (Allow once, Always allow, Not now).
- **18 Sep 2026 (1.0.51 Mac).** Home can be resized from the notch; suggestions become a one card carousel.
- **24 Sep 2026 (1.0.52 Mac).** "Hovering the notch now opens a small peek instead of the whole Home sheet". The peek shows each Clicky's three newest files. Adds invite and earn: the friend gets 25% off their first monthly month and you get 25% of their plan for up to 12 months. Clickys "now run on GPT-6 Luna, and deep answers use GPT-6 Sol."
- **2 Oct 2026 (1.0.53 Mac).** Several accounts per connected app.
- **23 Oct 2026 (1.1.1 Mac and Windows), "HeyClicky can draw in 3D, 2D and much more".** It "circles, points and sketches right on your screen while it talks" and "builds a 3D model you can drag around". With your yes it moves the mouse and types. Agents can work in your own Chrome. "Everything now lives in your notch." First Windows release. Captions, and routines set up by asking.
- **30 Oct 2026 (1.1.2 Mac, 1.1.4 Windows).** Chats open into "a resizable window that grows out of the notch" with a sidebar for every agent's chat. Talks in more than 130 languages, 30 new voices. On Mac, updates install after 5 minutes idle.
- **6 Nov 2026 (1.1.3 Mac, 1.1.5 Windows).** Long jobs run until done, answer preferences, file uploads, a Stop button in an agent's chat. On Windows "the notch stays small".

**Gap Squibby fills.** Nothing on the homepage or in these entries mentions code review, proving a fix, undoing a coding agent's changes, or hooks into coding tools. It runs its own models (GPT-6 per the changelog), while Squibby runs on the user's own Claude.

**Threat (high).** Same shape (notch, hover peek, voice, pointing, 3D drawing, computer use, Windows), YC backing, and a one-liner close to Squibby's vision. A move into coding agents would be a short step. Its hover peek is a small card per agent with its newest files, which is direct prior art for the notch hover the founder wants to improve.

## 2. CodeRabbit

**What it does.** AI review of pull requests. Every plan lists "AI Code Review before the PR in CLI, IDE, and coding-agent loops" and "Slop Detection". Source: https://www.coderabbit.ai/pricing

**Price per user per month:** Essentials $24 annual or $30 monthly; Team $48 or $60; Advanced $72 or $90; Enterprise on request. Source: https://www.coderabbit.ai/pricing

**Gap.** Built for developers and their pull requests. The pricing page does not mention undo, a saved copy before destructive commands, a browser proof check or plain language summaries. **Unconfirmed:** which agents its agent loop review supports.

## 3. Cursor Bugbot

**What it does.** Reviews pull requests in GitHub and "provides fixes directly in your Cursor editor or through our Background Agent". Source: https://cursor.com/bugbot

**Price.** No separate subscription; billed through usage. An average review costs $1.00 to $1.50. Source: https://cursor.com/bugbot

**Gap.** GitHub pull requests only. No local review, undo or cross tool work is described.

## 4. Graphite (owned by Cursor)

**What it does.** Stacked pull requests, AI reviews, merge queue. Banner: "Cursor Cloud Agents are now in Graphite." Source: https://graphite.com/pricing

**Ownership.** Cursor announced it was buying Graphite on 19 Dec 2025. The price was not disclosed; Graphite had raised more than $50 million. Source: https://siliconangle.com/2025/12/19/cursor-acquires-ai-code-review-startup-graphite/

**Price.** Hobby free (limited AI reviews); Starter $20 per user a month; Team $40 per user a month (no review cap); Enterprise custom. Starter and Team are billed annually. Source: https://graphite.com/pricing

**Gap.** A team git workflow, not a solo non engineer's local tool.

## 5. Greptile

**What it does.** Automated code review paid in credits (Base 1, Plus 3, Apex 10). Pro includes a Knowledge Base MCP and coding agent integrations. Self hosting is Enterprise only. Source: https://www.greptile.com/pricing

**Price.** Starter free (1 developer, 50 credits a month). Pro $1 per credit, no seat fees, 14 day trial. Pre Series A startups with under $2M revenue in the last 12 months get 500 credits a month for 6 months. Source: https://www.greptile.com/pricing

**Gap.** Same as the other pull request reviewers.

## 6. Claude Code: checkpoints, /rewind, /code-review, /verify

**Checkpoints.** A checkpoint is taken before each prompt that starts a turn; snapshots are kept for the 100 most recent. `/rewind` or Esc twice (with an empty prompt) restores code, conversation or both. Snapshots are deleted about 30 days after the session last saved one, by default. Source: https://code.claude.com/docs/en/checkpointing

**Limits (same page):**
- A file that only Bash commands changed is not tracked. Bash changes to a file Claude already edited are undone.
- Most subagent edits are not restored, including a background `/code-review --fix` run.
- Manual changes and edits from other sessions are normally not captured.
- Symlinked and hard linked files are skipped.
- "Not a replacement for version control".

**Aliases.** `/rewind` also answers to `/checkpoint` and `/undo`. Source: https://code.claude.com/docs/en/commands

**Review and proof.**
- `/code-review` (alias `/review`) finds correctness bugs locally, and `--fix` applies them. It works on any plan and counts toward normal usage. Source: https://code.claude.com/docs/en/code-review-local
- `/code-review ultra` runs a cloud review: 3 free runs on Pro, Max and Ultra, a one time allotment per account, then typically $5 to $25 per review in usage credits. Source: https://code.claude.com/docs/en/ultrareview
- `/security-review` checks the branch diff for vulnerabilities and needs an `origin` remote. Source: https://code.claude.com/docs/en/commands
- `/verify` confirms a change "by building your project's app, running it, and observing the result, rather than relying on tests or type checks". `/run` launches and drives the app. Source: https://code.claude.com/docs/en/commands

**Gap.** All of this covers Claude Code only and is written for people who read a terminal. Undo misses Bash only files, background subagent edits and other tools' edits. A saved copy taken before destructive commands, across tools, covers exactly those holes.

**Threat (high).** "Prove it works" and "review the diff" are built into the tool Squibby wraps. Squibby must add plain language, one view across tools and a wider undo, not repeat these.

## 7. Codex (OpenAI): undo

**Official docs.** I read the whole command reference. It lists `codex review` (uncommitted changes, a base branch diff, a commit or custom instructions) and `codex fork`. Esc twice edits the previous message and forks the chat. It lists no `/undo`, `/rewind`, checkpoint or rollback command. Source: https://learn.chatgpt.com/docs/developer-commands?surface=cli

**Third party.** A blog says that as of v0.125 Codex CLI has no production ready built in undo, and that an experimental `/undo` "existed briefly but was removed", citing GitHub issue #16784. Source: https://codex.danielvaughan.com/2026/04/25/codex-cli-error-recovery-rollback-patterns-git-safety-nets/ (**unconfirmed** by OpenAI; I did not open the issue).

**Gap.** As far as I can confirm, Codex has no official file undo, so Squibby's cross tool undo adds the most value here.

## 8. Cursor checkpoints

**What it does.** The agent saves local snapshots automatically before significant changes. You restore from the chat timeline. Restoring "reverts files only" and keeps messages. "Checkpoints are stored locally and separate from Git." Source: https://cursor.com/docs/agent/chat/checkpoints

**Gap.** Cursor only. **Unconfirmed:** whether changes from terminal commands are covered; the page does not say.

## 9. Lovable security scans

- A Quick scan (database review, dependency audit, MCP server exposure) runs automatically on every publish.
- A Deep scan (access control, unauthenticated endpoints, injection, leaked secrets, payments, auth, sensitive data) runs when you start it.
- A security review in chat (uses credits), AI penetration tests through Aikido (billed by Aikido) and optional Wiz scans.
- Admins can turn on "Block publishing with critical issues"; it is on by default for new Enterprise workspaces.
- Scans are free. 10 free fixes per account, each back 24 hours after use. The Security center is on Business and Enterprise.

Source: https://docs.lovable.dev/features/security

**Gap.** Only for apps built inside Lovable.

## 10. Bolt security audit

A security audit at publish time checks access control, auth, business logic, database policies, information disclosure, secrets in code and injection or XSS. It applies mechanical fixes, flags bigger changes for review and gives a risk score. Two to three minutes per app. "It's free, and it never touches your tokens." Posted 30 Jul 2026. No plan limit is named. Source: https://bolt.new/blog/security-audit-on-publish

**Gap.** Only for apps built inside Bolt.

## 11. Notch apps for agents

**Vibe Island** (https://www.vibeisland.app/):
- Allow or deny from the notch, answer agent questions, preview plans in Markdown.
- Its example permission request shows a diff count (+3 -1); no separate diff feature is described.
- Jumps to the exact tab in 20+ terminals, 8-bit sound alerts, quota for Claude, Codex, Kimi, GLM and DeepSeek, agents over SSH.
- Fully local, no account, no telemetry.
- 30 agents.
- $19.99 one time per Mac, 1 year of updates, free trial.
- No review, proof, undo or rollback is mentioned. Version and date are not shown.

Its own comparison page lists Open Island (free, 9 agents), Claude Island (free, 1), Notchi (free, 1) and AgentNotch (free, 2). Source: https://vibeisland.app/alternatives/ (vendor page, biased).

**CodeIsland (wxtsky)** (https://github.com/wxtsky/CodeIsland):
- MIT, about 2.6k stars and 327 forks.
- Live status for 30+ tools; approve, deny or always allow; SSH hosts; free iPhone and Apple Watch companion.
- Credential redaction for commands and messages in push notifications.
- Antigravity and AiWork are display only, because their hooks cannot carry a decision.
- No undo mentioned. The Releases section is empty, so no release date.

**Gap.** These answer "what is my agent doing, and should it run this?", not "what did it change, does it work, can I take it back?" They assume developers (terminal jumping, SSH).

**Threat.** Crowded and cheap: free or about $20 once. Thirty agents is normal here, so seven tools is not a selling point on its own.

## 12. Local guards that work across tools

**dcg (Destructive Command Guard).** A Rust hook that blocks destructive shell, git and filesystem commands, with 50+ rule packs (databases, Kubernetes, Docker, cloud, Terraform). Works with Claude Code, Codex, Gemini, Copilot, Cursor and others. About 6.4k stars. **Unconfirmed:** licence. Source: https://github.com/Dicklesworthstone/destructive_command_guard

**HOL Guard** (published 26 Oct 2026; https://hol.org/blog/what-is-hol-guard):
- Reviews shell commands, file access, package installs and MCP calls before they run, and screens for prompt injection.
- Keeps a receipt of every decision in `~/.hol-guard`.
- Guard 3.x lists 16 agents, among them Codex, Claude Code, Copilot CLI, Cursor, Cline, Gemini CLI, Antigravity, OpenCode and Devin. Windsurf is not in the list.
- Codex, Claude Code and Cursor are blocked through hooks; Gemini CLI and Antigravity through a launcher shim and pre launch scan.
- Local runtime Apache-2.0. Free on one machine; Solo $4.99 a month; Pro $15 a month; Team $30 per seat a month.

**Belay.** Open source, local first. Community edition AGPL-3.0, with a commercial option. Gates tool calls in under 100 ms with "no LLM in the decision path". Enterprise adds fleet management, SSO and central policy. Source: https://www.developersdigest.tech/blog/ai-coding-agent-firewalls-compared-2026 (28 Jul 2026, third party).

**Gap.** These block. None says it takes a saved copy and lets you undo, reviews in plain words or proves the fix. Squibby saves a copy and lets the command run. They can work side by side.

**Threat.** HOL Guard Pro is $15 a month, the same as Squibby Pro, and already sells receipts across many tools. Squibby's pitch must not read as just a guard.

## 13. Plain words for non engineers

**Reverse** (https://www.reverse.dev/):
- Maps an existing app as a flowchart with docs that update themselves.
- You describe a change; an agent makes it on a separate branch, and you preview before it ships.
- For solo builders who don't code, mixed skill teams and agencies. Imports from Claude Code, Cursor, v0, Lovable and Replit. Needs GitHub.
- Limited pilot. Free credits to start, then credit bundles from $10, or $20 one time to use your own Anthropic key.

**Gap.** Cloud and GitHub based, not local while your agent works. Undo is GitHub history. Closest on the "plain words for non engineers" angle and aimed at the same person.

## 14. The B2B version already exists in YC (new)

**Sparkles (YC Winter 2026, team of 2).** "Make everyone on your team an engineer". Non engineers start Claude Code, Codex or OpenCode on the company's GitHub repos from a web app or Slack. Agents run in an isolated cloud sandbox linked to Linear, Sentry, Notion and Figma. Every run ends in a pull request, and existing reviews and branch protections still apply. Source: https://www.ycombinator.com/companies/sparkles. **Unconfirmed:** funding (aggregators disagree).

**Runtime (YC P26).** Launch HN: "Sandboxed coding agents for everyone on a team". Engineering sets instructions, skills and integrations once; everyone else runs Claude Code or Codex in snapshotted sandboxes with secrets behind a proxy, command allow and deny lists, network egress controls, per user access and a preview URL. Triggered from web, CLI, Slack, Linear, GitHub or an API. Free tier, then "flat platform fee plus compute" with no token markup. Core is open source (Apache-2.0, MIT and AGPLv3 parts). Source: https://news.ycombinator.com/item?id=48225040. A third party write up dates the launch to 22 May 2026 and names a fintech unicorn among early users (**unconfirmed**): https://clauday.pages.dev/article/f86200ac-42ee-4378-954f-eca3bd17729b

**What this means for a Squibby B2B plan.** "Companies let non engineers build with agents" is a real, YC funded category in 2026. Both players sell to the engineering team, run in the cloud and use pull requests as the safety net. A B2B Squibby would compete with them unless it stays different: on device, in the tools people already use (Cursor, Claude Code and so on), with plain words review, proof and undo before anything becomes a pull request. A possible angle is a team plan that sits in front of a Sparkles or Runtime style flow (shared house rules, receipts an engineer can read, admin set allowlists), not a replacement for it. **Unconfirmed:** that any company would pay for this. No buyer evidence was gathered.

---

## Where Squibby is truly different

1. **Review, proof and undo in one place, across tools, on the device.** Claude Code, Cursor, Lovable and Bolt each cover parts of this inside their own tool. Notch apps and guards cover none of it. Sparkles and Runtime cover it through cloud pull requests. I found no product that does all three locally across Claude Code, Codex, Cursor, Copilot, Antigravity, Gemini CLI and Windsurf.
2. **Undo that fills the built in gaps without touching git.** Claude Code's rewind skips Bash only files, background subagent edits and other tools' edits. Cursor's checkpoints cover Cursor only. I found no official Codex undo.
3. **Plain words for non engineers.** Every reviewer above (CodeRabbit, Bugbot, Graphite, Greptile, `/code-review`) writes for developers. Reverse, Sparkles and Runtime target non engineers, but all through GitHub in the cloud.
4. **"Hand Squibby the job".** It writes the prompt, runs it, then reviews and proves, from a notch. HeyClicky drives general tasks. Vibe Island and CodeIsland only relay approvals.
5. **Bring your own Claude, local first.** No per message cap of Squibby's own, unlike HeyClicky. Structural, but not something users see at first.

## Where Squibby is not different

1. **Notch, hover peek, voice, pointing on screen, 3D drawings.** HeyClicky shipped all of these between 24 Sep and 6 Nov 2026, plus Windows and computer use. Show me how and hold to talk match it; they do not set Squibby apart.
2. **Hooking into many agents.** Vibe Island and CodeIsland list about 30, HOL Guard 16. Seven is behind.
3. **Proving a change by running the app.** Claude Code ships `/verify` and `/run`.
4. **Blocking dangerous commands and keeping receipts.** dcg, HOL Guard and Belay, some free. HOL Guard Pro is $15 a month.
5. **Security checks before go live.** Lovable and Bolt do this free inside their own tools.
6. **Price.** Notch apps are free or about $20 once, HeyClicky Pro is $20 a month, HOL Guard Pro $15 a month. At $15 a month Squibby must win on how the pieces work together.

## Questions a YC partner would ask (not answered by this research)

These need the founder's own evidence; I have no data for any of them.

1. **Who exactly is stuck, and how many of them are there?** Name the user (for example a non engineer using Cursor or Claude Code on a real project) and show how you know they get stuck. Context only: TechCrunch reported in March 2025 that about a quarter of YC's Winter 2025 batch had codebases about 95% AI generated, per Jared Friedman (https://techcrunch.com/2025/03/06/a-quarter-of-startups-in-ycs-current-cohort-have-codebases-that-are-almost-entirely-ai-generated). That is founders, not Squibby's user, and it is from 2025.
2. **Why won't HeyClicky, Anthropic or Cursor just do this?** HeyClicky has the same shape and YC money; Claude Code already has `/verify`, `/code-review` and `/undo`. The answer has to be the cross tool, plain words, undo anything package, shown working.
3. **What usage or revenue exists today?** No users, retention or paid conversion were found or given in the research.
4. **How do users find you?** No distribution plan is in the sources.
5. **Platform risk.** Squibby depends on hooks in seven tools and on the user's own Claude. The subscription route stays off until Anthropic confirms in writing. What happens if a tool changes its hooks?
6. **B2B: who is the buyer and why not Sparkles or Runtime?** Needs at least a few company conversations before it is claimed.

## Unconfirmed or not checked

- HeyClicky funding amount and founders (YC page lists neither)
- Codex's undo history (official docs show none; one blog says an experimental one was removed; I did not open GitHub issue #16784)
- Whether Cursor checkpoints cover terminal command changes
- Which agents CodeRabbit's agent loop review supports
- dcg's licence
- Vibe Island's version and date; CodeIsland's release date
- Sparkles funding; Runtime's launch date and early customers beyond the HN post
- Any buyer demand for a B2B Squibby
