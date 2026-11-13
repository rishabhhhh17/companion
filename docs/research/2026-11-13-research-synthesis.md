# Squibby: what the research says (synthesis, 13 Nov 2026)

This pulls together five checked research files in this folder: `yc-companies.md`, `b2b.md`, `competitors.md`, `user-needs.md` and `visuals.md`. Every claim below comes from one of them, and the URL is the one those files opened. Anything they could not confirm is marked **unconfirmed**. I did not open new sources for this summary.

One limit to keep in mind. "Built" means the feature was present in the newest branch the researchers could read (worktree `agent-ad1481be1b6c65dab`, last commit 22 Oct 2026). The founder's later work may already cover more. So "built" means "seen in code", not "shipped".

---

## 1. What Squibby is, and the one line pitch

### What it is

Squibby sits in your Mac's notch and watches the AI coding tools you already use. It has hooks into seven of them: Claude Code, Codex, Cursor, VS Code Copilot, Antigravity, Gemini CLI and Windsurf. After your AI changes something, Squibby:
- explains the change in plain words,
- proves it works with your project's own checks and a browser check,
- lets you undo it in one tap, without touching git,
- and saves a copy before any agent runs a destructive command.

### Why it is not HeyClicky

HeyClicky is the closest product. It is a YC company (Spring 2026) with the same shape: notch, hover peek, voice, drawing on screen, 3D, Windows. Its YC one liner is "The simplest interface in the world to talk AI models + spawn agents" ([YC](https://www.ycombinator.com/companies/heyclicky)). That is almost the founder's own vision line. Its site claims "25,000+ happy users" and never mentions code review, proof or undo ([heyclicky.com](https://heyclicky.com/)).

So the vision line "HeyClicky for coding agents" is a risk in a pitch. It invites the question "why not a HeyClicky feature?". The evidence supports leading with what HeyClicky does not do: proof and undo for coding agents.

### The pitch the evidence supports

> **Squibby lives in your Mac's notch and checks what your AI coding tool just did: it explains every change in plain words, proves it works, and undoes it in one tap.**

A short contrast line for talks: "HeyClicky shows you where to click. Squibby checks what your AI built and proves it works." (from `yc-companies.md`).

### Why this pitch holds up

- **The pain is real and recurring.** The user needs file counts 66 distinct complaints in 8 groups. The biggest group is "the agent wiped work" with 21 items, for example Opus 5 running `rm -rf "$HOME"` and deleting 57,235 files ([CC #93099](https://github.com/anthropics/claude-code/issues/93099)). Next is "false done" with 12 items, for example a "ALL PASSED" report while tests failed ([CC #46940](https://github.com/anthropics/claude-code/issues/46940)).
- **The built in undo has holes.** Claude Code's checkpoints do not track files changed only by Bash. Most subagent edits are not restored. Snapshots go after about 30 days ([Claude Code docs](https://code.claude.com/docs/en/checkpointing)). Its sandbox is off by default ([docs](https://code.claude.com/docs/en/sandboxing)). Cursor checkpoints cover Cursor only ([Cursor docs](https://cursor.com/docs/agent/chat/checkpoints)). The researchers found no official Codex undo ([Codex commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)).
- **YC funds this shape.** Plover Labs (Fall 2026) sells "deterministic verifiers instead of another model's judgment" and has five figure monthly contracts ([YC](https://www.ycombinator.com/companies/plover-labs)). Tilo (Fall 2026) says "Every change is attributed and can be undone" ([YC](https://www.ycombinator.com/companies/tilo)). Both are for engineers or enterprises. None of the companies checked claims the whole package for one non engineer on their own Mac.
- **YC itself named the problem.** In 2025 Diana Hu said: "You have to have the taste and enough training to know that an LLM is spitting bad stuff or good stuff" ([TechCrunch](https://techcrunch.com/2025/03/06/a-quarter-of-startups-in-ycs-current-cohort-have-codebases-that-are-almost-entirely-ai-generated)).

### What does not make Squibby different

Be honest about these. They are table stakes, not the pitch.
- Notch, hover peek, voice, pointing, 3D drawing: HeyClicky shipped all of them between 24 Sep and 6 Nov 2026 ([changelog](https://heyclicky.com/changelog)).
- Hooking many agents: Vibe Island lists 30 ([site](https://www.vibeisland.app/)), CodeIsland 30+ ([GitHub](https://github.com/wxtsky/CodeIsland)), HOL Guard 16 ([HOL](https://hol.org/blog/what-is-hol-guard)). Seven is behind.
- Running the app to prove a change: Claude Code ships `/verify` ([commands](https://code.claude.com/docs/en/commands)).
- Blocking dangerous commands with receipts: HOL Guard Pro costs $15 a month, the same as Squibby Pro ([HOL](https://hol.org/blog/what-is-hol-guard)).

The defensible part is the combination, plus the fact sheet behind it: snapshots, exit codes, browser proof and hooks across tools.

---

## 2. B2B: the verdict and the smallest offer

### Verdict

**Yes, but later, and small.** Do not lead with B2B.

- **Enterprise security is taken.** Turbot, Endor Labs, Cycode, GitGuardian and Palo Alto (Koi) already sell guardrails for coding agents to security teams ([Turbot](https://turbot.com/blog/2026/06/introducing-guardian), [Endor Labs](https://endorlabs.com/learn/introducing-security-for-ai-coding-agents-and-workstations), [Cycode](https://cycode.com/blog/ai-guardrails-real-time-ide-security/), [GitGuardian](https://www.gitguardian.com/developer-endpoint-protection), [CyberScoop](https://cyberscoop.com/palo-alto-networks-acquires-koi-agentic-ai-security/)). They need SOC 2, admin consoles and MDM. A solo founder cannot win those deals now.
- **"Non engineers build at work" is taken too, in the cloud.** Sparkles (YC W26): "Make everyone on your team an engineer", every run ends in a pull request ([YC](https://www.ycombinator.com/companies/sparkles)). Runtime: "Sandboxed coding agents for everyone on a team" ([Launch HN](https://news.ycombinator.com/item?id=48225040)). This is almost exactly the founder's B2B idea, already funded.
- **The platforms add their own admin controls.** Claude Code Team and Enterprise can push deny lists and hooks to every seat ([docs](https://code.claude.com/docs/en/server-managed-settings)). Cursor Teams has required Team Rules ([docs](https://cursor.com/docs/context/rules)), but those are instructions to the model, not hard blocks.
- **The pain is real at big companies.** For example, 73% of 650+ security leaders said AI assisted development outpaces what they can review ([Security Boulevard](https://securityboulevard.com/2026/03/purple-book-community-and-armorcode-survey-flags-shadow-ai-ai-generated-code-risks)). Claude Code assisted commits leaked secrets at 3.2% against a 1.5% baseline ([GitGuardian](https://blog.gitguardian.com/the-state-of-secrets-sprawl-2026/)). These surveys are vendor run.
- **The open gap is small teams.** 5 to 50 person startups and agencies with no security team, where people run several agents on their own Macs. Squibby works on the laptop beside any tool. Sparkles and Runtime move the work into their cloud. **No source measures demand at this size. That is the first thing to test.**
- **YC lines it up.** The Fall 2026 request "Multiplayer AI" (Aaron Epstein) asks for teammates to "watch, redirect, or take over" agent runs, with approvals and shared history ([Modelence mirror](https://modelence.com/yc-rfs-fall-2026/multiplayer-ai), third party copy). YC's current Winter 2027 list has nothing on coding tools ([YC RFS](https://www.ycombinator.com/rfs)).

### The smallest B2B offer: "Squibby for Teams" pilot

1. **Shared hard blocks.** One team rules file (no `rm -rf` outside the project, no `.env` reads, no force push, no deploy or broad cloud token without a tap). Every teammate's Squibby enforces it through hooks in all seven tools. The pitch against Cursor Team Rules: enforced, not suggested.
2. **Team receipts feed.** The plain words receipts, posted to a Slack webhook or shared folder the team sets up. Example: "Priya's Cursor deleted 3 files in billing/, Undo available."
3. **Undo and saved copies.** Already built. Gartner's words for the need are "rapid rollback mechanisms" ([The Register](https://www.theregister.com/AI-ML/2026/05/27/4-in-10-ai-agents-headed-for-demotion-or-the-rubbish-bin/5246964)). Be honest that it covers local files, not cloud databases (see PocketOS, [AIID 1469](https://incidentdatabase.ai/cite/1469)).
4. **How to sell it.** A flat paid 30 day pilot for 3 to 5 small teams, sold by the founder. Agree success numbers up front: destructive commands caught, undos used, secrets blocked. A per seat price to test is about $20 to $30 a month. That is a guess, not evidence. For scale, Claude Team is $20 to $25 a seat ([Claude pricing](https://claude.com/pricing)) and Cursor Teams is $30+ ([Cursor pricing](https://cursor.com/pricing)).
5. **Keep it within the rules.** Each team brings its own Claude, so Squibby never routes usage (rule 1). Keep the feed on device plus a webhook the team owns, so there is no Squibby server. A team feed is still a new data flow. That needs a founder decision before any code.

---

## 3. Ranked features to build next

Ranked by evidence strength, how much it sets Squibby apart, and what a YC partner will ask. **Built** = seen in the 22 Oct code. **Partly** = some of it is there.

| # | Feature | Status | Evidence |
|---|---|---|---|
| 1 | **Notch hover that shows "waiting on you"** for each agent in each tool, plus the latest review card with Undo and the proof result, one tap from the hover | Partly (notch states exist; the founder says the hover looks basic) | Founder request. HeyClicky's hover peek shows each Clicky's three newest files ([changelog](https://heyclicky.com/changelog), 24 Sep). Rindler makes "waiting on you" a first class state ([YC](https://www.ycombinator.com/companies/rindler)). Vibe Island and CodeIsland only relay approvals. Showing proof and Undo in the peek is something none of them do. |
| 2 | **Prove the destructive command guard works in every hooked tool**, not only in Squibby's own runs | Built for Squibby's runs (`safety.ts`); unverified in the other six tools | Group A, 21 complaints, including five `$HOME` deletes ([CC #88462](https://github.com/anthropics/claude-code/issues/88462), [CC #93099](https://github.com/anthropics/claude-code/issues/93099)). Claude Code's sandbox is off by default ([docs](https://code.claude.com/docs/en/sandboxing)). This is the claim the demo and the pitch rest on. |
| 3 | **Approval card for commands that touch live systems**: `DROP`, `supabase db reset`, `terraform destroy`, production URLs, broadly scoped cloud tokens | Not built | A local snapshot cannot undo these. A12, A13, A21 in user needs ([CC #27448](https://github.com/anthropics/claude-code/issues/27448)); PocketOS lost a production database through an API token ([AIID 1469](https://incidentdatabase.ai/cite/1469)). Endor Labs already blocks DROP and DELETE through MCP for enterprises ([Endor](https://endorlabs.com/learn/introducing-security-for-ai-coding-agents-and-workstations)). |
| 4 | **"Not what you asked for" and "said one thing, ran another" flags** in the plain words review | Review built; these two flags not built | H1 and H3: a Cursor agent said it was reverting only this chat's work but ran `git checkout HEAD --` and wiped 7 files ([Cursor forum](https://forum.cursor.com/t/cursor-still-in-2026-says-one-thing-and-does-another/170593)). False done, 12 complaints (Group B). B8: one user counted "27 false claims in a day" ([CC #106546](https://github.com/anthropics/claude-code/issues/106546)). |
| 5 | **Usage runway gauge** in the notch: warn before a big job, save the job, resume after the reset | Not built | The loudest complaint group (F, 9 items): Codex threads with about 624, 324 and 210 comments ([#14593](https://github.com/openai/codex/issues/14593), [#13568](https://github.com/openai/codex/issues/13568), [#28879](https://github.com/openai/codex/issues/28879)); Anthropic said people were "hitting usage limits in Claude Code way faster than expected" ([The Register](https://www.theregister.com/2026/03/31/anthropic_claude_code_limits/)). It hits Squibby too, since "Hand Squibby the job" uses the user's Claude. What the Agent SDK reports about plan limits is **unverified**. |
| 6 | **"Watch what changed"**: a short animated replay of each review, built only from facts Squibby already has | Not built (the SVG pen, `sketch.ts`, and the "Draw it for me" diagram layout are built) | HeyClicky draws to teach, never to review code ([changelog](https://heyclicky.com/changelog)). The reel the founder sent sells "your product explained in one video" ([Instagram](https://www.instagram.com/reel/DfqFscXxR5q/), caption only). cubic groups changes and draws diagrams for engineers ([YC](https://www.ycombinator.com/companies/cubic)). No evidence yet that a replay beats text. Test it. |
| 7 | **"Why is live broken?" check**: Stripe webhook delivery, every env value present in Vercel Production, an anonymous browser visit to private pages | Partly (Supabase RLS check in `ship/rls.ts` is built; the rest is not) | Group E, 6 items: 405 Stripe webhooks with no fix ([Vercel community](https://community.vercel.com/t/stripe-webhook-405-error/27898)); "the last '20%' still takes 80%+ of the time" ([HN](https://news.ycombinator.com/item?id=47386636)); a Lovable built app exposed 18,697 records through inverted auth ([The Register](https://www.theregister.com/2026/02/27/lovable_app_vulnerabilities/)). YC's "A Cloud for Small Software" request asks for "Versioning and instant rollback" ([Modelence mirror](https://modelence.com/yc-rfs-fall-2026/a-cloud-for-small-software)). |
| 8 | **Shareable receipt page**: "what my AI did today", with proof | Not built (receipts are built) | HeyClicky's growth came from short video ("super viral on Instagram", [Launch YC](https://www.ycombinator.com/launches/QNN-this-is-heyclicky-an-ai-buddy-that-lives-next-to-your-computer-cursor)). Spacesheep makes agent output shareable ([YC](https://www.ycombinator.com/companies/spacesheep)). It answers "how do you get users?", which no research file could answer. |
| 9 | **Spoken status**: "your fix passed its checks", "Cursor is waiting on you" | Partly (hold to talk is built; spoken status not seen) | Agent FM reported 410 engineers, 60+ paying and 1.2 hours a day of audio updates ([YC isoquant](https://www.ycombinator.com/companies/isoquant)). Cheap to add on the existing voice. |
| 10 | **Re-send house rules after the agent compacts its context** | Partly (memory of decisions is built; re-sending after compaction is unverified per tool) | Group G, 8 items, for example compaction losing CLAUDE.md rules ([CC #19736](https://github.com/anthropics/claude-code/issues/19736)). |
| 11 | **"How your app fits together" map**, where changed parts glow | Partly (the "Draw it for me" layout in `layout.ts` is the base) | Anthropic's trial: the AI group scored 50% vs 67% on understanding their code ([Anthropic](https://www.anthropic.com/research/AI-assistance-coding-skills)). Serves "Where was I" and Explain. |
| 12 | **Catch loosened test assertions**, for example `toBe(5)` changed to `toBeDefined()` | Partly (`testguard.ts` already flags removed, fewer and skipped tests) | B1 "manipulates tests instead of following instructions" ([CC #7074](https://github.com/anthropics/claude-code/issues/7074)). |
| 13 | **Squibby for Teams pilot**: shared hard blocks and a team receipts feed | Not built | See section 2. Needs a founder decision on the team feed, and demand is untested. |
| 14 | **More hooked tools** (Cline, OpenCode, Aider and others) | 7 built | Vibe Island and CodeIsland list about 30. Breadth matters less than depth, so keep it low. |

**Leave out for now:** 3D models. Code has no physical object to turn around. The app map (item 11) is the useful picture. three.js would add about 175 KB gzip ([jsDelivr](https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.min.js)). Add it only if users ask.

**Already built (seen in code), so not on the list:** plain words review, proof with project checks plus a browser check, one tap Undo with shadow snapshots, saved copies including private `.env` copies, the fix loop breaker, the test tamper guard, the Supabase RLS check, the secrets scan before going live, memory, Show me how, hold to talk, prompt help and "Draw it for me".

---

## 4. Visual features and the explainer video

### What the screenshot and the reel point at

- **The 3D drawing on screen** is HeyClicky's "draw in 3D, 2D and much more" release of 23 Oct 2026 ([changelog](https://heyclicky.com/changelog)). HeyClicky's new code is private ([Clicky README](https://raw.githubusercontent.com/farzaa/clicky/main/README.md)). The labelled Raspberry Pi demo in the founder's screenshot could not be found: **unconfirmed**.
- **The best public guide to the technique** is OpenClicky (MIT). The model writes a tiny drawing program. A sandboxed page runs it line by line as it streams and paints SVG strokes, timed to the spoken words. Labels move apart. 3D uses three.js ([draw stage doc](https://raw.githubusercontent.com/prasanthsasikumar/openclicky/HEAD/docs/draw-stage.md)). Its shipped version is Windows. The Mac version is a 4 Nov design spec. Study it and credit it if adapted. Never copy HeyClicky.
- **Are we doing something like this?** Partly. Squibby's overlay already draws rings, arrows, underlines and boxes in SVG in a panel that ignores the mouse. "Draw it for me" already builds a small "why did this break" diagram. What is missing is drawing in time with the voice, labels that keep apart, and 3D.
- **The reel** is a video editor selling explainer videos for software products ([Instagram](https://www.instagram.com/reel/DfqFscXxR5q/)). Only the caption could be read. Squibby has no explainer video yet.

### The three visual features

1. **"Watch what changed" replay** (build first, feature 6 above). 3 to 6 short beats, each one sentence. The runner builds a fact sheet: files changed, which part of the app, checks with exit codes, the proof screenshot. The model only arranges it. A validator rejects any beat that names something not in the sheet. Uses the existing `sketch.ts` pen. A small playing thumbnail sits in the notch hover card, full size on "Watch". Settings: on or off, speed, reduce motion, voice. Cost: one capped model call per review on the user's own key. Measure tokens in a spike. Make it off by default if it costs too much.
2. **"How your app fits together" map** (feature 11 above). Built mostly without a model from routes, handlers, schema and services, using the existing `layoutDiagram`, so the same project always looks the same. Changed parts pulse. Click a part to ask about it. Saved in project memory with its source, visible and forgettable (rule 15).
3. **A 60 second explainer, rendered from code.** See the plan below.

All three follow the rules: drawing only on a hotkey or a review the user opened (rule 5), never taking focus (rule 9), cleared by Stop everything (rule 11). Hide the overlay from screenshots with ScreenCaptureKit's window exclusion, as Clicky does ([Clicky source](https://raw.githubusercontent.com/farzaa/clicky/main/leanring-buddy/CompanionScreenCaptureUtility.swift)). Memory and frame rate of the overlay on a real Mac are **not measured**. They need a spike first (rule 18).

### The explainer video plan

- **Length and shape:** 60 seconds, six scenes of about 10 seconds:
  1. The problem: your AI just changed 14 files and you do not know what.
  2. Squibby in the notch.
  3. The plain words review.
  4. The replay.
  5. Proof: checks pass, browser check passes.
  6. The save: the agent runs a destructive shell command, Squibby already has a copy, one tap Undo.
- **Pick a shell command on purpose for scene 6.** Claude Code's own rewind does not cover files changed only by Bash ([docs](https://code.claude.com/docs/en/checkpointing)). That shows the gap in one shot.
- **Slow and clear.** Runtime's launch demo was called fast and dizzying, and the founder agreed ([Launch HN](https://news.ycombinator.com/item?id=48225040)).
- **Real captures, fixture projects only.** Never a user's project.
- **Tooling:** Remotion. It is free for individuals and companies with up to 3 employees. It is source available, not MIT, and the licence "will slightly change" in 5.0, so check again before relying on it ([licence](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md), [prices](https://www.remotion.dev/license)).
- **Keep the replays and the video in sync.** Render the replay scenes from the same drawing programs as feature 1, so the video never drifts from the product.
- **Look:** black base, one blue accent, meaning colours only.
- **The same video serves the YC application,** the website and short social clips. Short video is how HeyClicky grew.

---

## 5. The YC application: what it needs and what Squibby lacks

### What YC asks for (its own pages)

- **Say what it is in the first sentence,** "in the simplest possible terms". Being well designed and easy to use "is not an insight" ([How to apply](https://www.ycombinator.com/howtoapply)).
- **A video.** "Statistically we're much more likely to interview people who submit a video" ([How to apply](https://www.ycombinator.com/howtoapply)).
- **Solo founders are fine.** "We regularly accept solo founders" ([FAQ](https://www.ycombinator.com/faq)).
- **Traction is not required, but it helps.** "On average, 40% of the companies we fund in each batch are just an idea". YC invests $500,000 ([FAQ](https://www.ycombinator.com/faq)).

### What Squibby already has

- A working Mac app, built solo, with hooks into seven tools. That answers "why you?" if it is shown in the video.
- A clear trust model: proof first, undo without git, safety in hooks, no usage resale.
- A clean answer on Anthropic: the API key route is the default, and the subscription route stays off until Anthropic confirms in writing.
- A checked list of 66 public complaints that maps to the features.

### What Squibby still lacks (most important first)

1. **Real users and numbers.** This is the biggest gap. HeyClicky claims 25,000+ users. Report it the way Agent FM and Plover did: weekly users, paying users, reviews done, undos used, fixes that passed checks the first time. No research file found any Squibby usage data.
2. **First hand research with non engineers.** All 66 complaints come from developers on GitHub and HN. Reddit and X could not be read. Five to ten recorded sessions with non engineers would outweigh all of it.
3. **One sharp insight, not a feature list.** Candidate: "People building with AI cannot read the code, so they need proof and undo, not code review."
4. **The 60 second video** (section 4).
5. **An answer to "why won't HeyClicky, Anthropic or Cursor just do this?"** The answer has to be shown, not said: one undo across every tool including shell commands, plain words, and proof. It needs feature 2 proven in all seven tools.
6. **A distribution plan.** None of the research found one. Short videos of a disaster avoided, plus shareable receipts (feature 8), are the best candidates.
7. **Proof that people pay $15 a month.** No pricing evidence exists. HeyClicky Pro is $20. HOL Guard Pro is $15.
8. **A size for the market.** No source counts the non engineers who run coding agents each week: **unknown**.
9. **A platform risk answer.** What happens when a tool changes its hooks, or turns its sandbox on by default and the "wiped work" pain shrinks? Name it up front.
10. **The B2B line, kept short.** Person first now. A team plan later (per seat, bring your own key, receipts as an audit trail, shared approvals). Do not lead with B2B.

---

## Still unconfirmed (do not quote as fact)

- HeyClicky's funding, founders and internal drawing technique; the Raspberry Pi demo in the founder's screenshot.
- The shots inside the reel (only the caption was read).
- Whether Squibby's guard reaches sessions in the other six hooked tools.
- What the Agent SDK reports about plan limits.
- Overlay memory and frame rate on a real Mac.
- Any Squibby code newer than 22 Oct 2026.
- Any buyer demand for a team plan, and the size of either market.
- Fall, Summer and Spring 2026 YC requests come from third party copies, not YC's own page.
