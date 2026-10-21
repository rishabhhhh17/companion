# Reality check: will this work? (22 Oct 2026)

Four research passes on the live web, each told to look for evidence against the idea as hard as for it: (1) is the stuck moment a real, frequent pain; (2) are the builders and coding agents already solving it; (3) will people pay, and how do we reach them; (4) is there demand for the guide and Second Look. Evidence types: **hard** (measured or a primary record), **vendor** (a company's own claim or a vendor survey), **anecdote**. Reddit could not be searched (blocked for every tool) and X was not read, so the voice of the user comes from forums, Hacker News, Trustpilot and freelancer listings.

## The verdict
**It can work, but not as it was framed.** The pain is real and people pay to get rid of it. The part we planned to lead with (fix, prove, undo) is being given away free by the tools people already use. The version that can win:
- **For:** non engineers whose project matters (it left the builder, has users, or is going live).
- **Headline:** never stuck alone, and you actually understand what happened.
- **The moat to prove:** the learning result, measured (`docs/launch/did-they-learn-test.md`).
- **Front door:** the guide, free. **Feature:** Second Look. **Price:** about $15 with caps.

The founder agreed on 22 Oct 2026 ("Yeah, I like it").

## 1. The pain: real, and people pay; how often is unproven
- Lovable passed $600M annualized revenue (hard, [TechCrunch 24 Sep 2026](https://techcrunch.com/2026/09/24/lovables-annualized-revenue-crosses-600m-as-vibe-coding-takes-off/)); about 1M new projects a week ([TechCrunch 9 Jun 2026](https://techcrunch.com/2026/06/09/lovable-says-it-has-hit-500m-in-annualized-revenue-with-1-million-new-projects-a-week/)); 80% of builders self identify as non technical (vendor, [The Next Web](https://thenextweb.com/news/lovable-build-economy-500m-arr-vibe-coding)). Emergent: 70% with no coding experience (vendor, [TechCrunch 17 Feb 2026](https://techcrunch.com/2026/02/17/emergent-hits-100m-arr-eight-months-after-launch-rolls-out-mobile-app/)).
- 83.8% of 600 US non developers hit problems with AI written code; the top one is knowing whether to trust it (35.2%) (hard but a hosting company's survey, [20i, 21 Aug 2026](https://www.20i.com/blog/vibe-coding-survey/)).
- Lovable rationed free "Try to fix" to 10 a day from 10 Aug 2026 (vendor fact, [changelog](https://docs.lovable.dev/changelog)): errors are constant.
- A repair economy exists: $30 Fiverr gigs, $299 diagnoses, $1.5K to $10K audits, $15K to $50K rebuilds ([vibecoderescue.dev](https://vibecoderescue.dev/), [justinmckelvey.com](https://justinmckelvey.com/vibe-code-rescue), [Indeed on "vibe code cleanup specialist"](https://www.indeed.com/career-advice/news/vibe-code-cleanup-specialist)).
- Fix loops burn money: a new Replit user reported €600 in a week; an agent told a non technical founder to "hire an outside developer" (anecdotes, [Replit forum, Feb and Oct 2026](https://replit.discourse.group/t/replit-told-me-to-hire-an-outside-developer-for-problem-my-replit-agent-created/13679)).
- Security: 57% of 3,680 checkable Supabase apps let a stranger read at least one table, but only 52 of 30,998 apps leaked keys that could spend money (hard, vendor scanner, [Reeve 19 Aug 2026](https://reeve.page/research/vibe-coded-app-security-2026)).
- **Against:** no rigorous abandonment or fix loop rate exists anywhere; a16z says retention is strongest among technical users ([a16z, Mar 2026](https://www.a16z.news/p/top-100-gen-ai-consumer-apps-march)); much of the work is throwaway; the code often lives in the cloud and needs an export.
- **Group size (low confidence):** about 1.5 to 3M paying non engineers building with AI worldwide; about 300K to 1M of them on a Mac with a project they care about. A real niche, not a mass market.

## 2. The builders and agents: closing the gap fast
Shipped in 2026 (vendor facts, dated in each changelog):
- **Lovable:** Try to fix; browser testing in the normal flow (22 Jun); tests before "done" (16 Oct); security scans with auto fix (1 Jun); plain explanations of findings (23 Sep); a Chat mode that explains without changing code (21 Sep); restore; a Mac desktop app (Apr); an expert partner marketplace (9 Sep). [changelog](https://docs.lovable.dev/changelog)
- **Replit:** the agent tests the app in a real browser and fixes it; checkpoints. **v0:** Fix with v0 and browser screenshots. **Bolt:** security audit with fixes, version restore.
- **Claude Code desktop:** auto verify is on by default, checkpoints and rewind, and a Learning style that leaves a `TODO(human)` for the person to write ([desktop docs](https://code.claude.com/docs/en/desktop), [output styles](https://code.claude.com/docs/en/output-styles)).
- **Gemini CLI** keeps checkpoints in a shadow git repo, the same idea as our Undo ([docs](https://geminicli.com/docs/cli/checkpointing/)).
- **HeyClicky** has shipped nothing since v1.0.53 (2 Oct 2026) and never mentions coding.

**What stays ours:** working across tools (projects that left the builder); teaching that is on by default, inside the fix, and checked (builders earn per fix, so teaching people to need fewer fixes works against how they make money); pointing at the real problem on the Mac screen from the project's own checks; the user's own key with no proxy (on that route).

**Biggest threats:** Anthropic itself (it has every mechanic except beginner packaging and screen pointing), Lovable and the builders (the stuck moment happens inside them), and OpenAI's ChatGPT desktop app (screen capture, a coding agent and computer use on a plan people already pay for).

## 3. Money and reach
- People pay to get unstuck. A second monthly subscription after the stuck moment passes is **not proven**: AI apps keep 21.1% of subscribers after a year against 30.7% for other apps (hard, RevenueCat via [TechCrunch 10 Mar 2026](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows)); builder churn runs 20 to 40%.
- Price anchors: HeyClicky $0, $20, $100 with message caps; Raycast Pro $10 (own key needs Pro); Wispr Flow $15; Claude Pro and ChatGPT Plus $20. Tools that bring your own key cluster at $8 to $10; bundled tools at $14 to $20.
- **Recommended:** about $15 a month ($12 yearly), a free tier with 2 or 3 checked fixes, a student price, a one time "rescue pack". **A hard fix cap is required:** our measured costs ($0.04 to $0.12 a fix) come from small test projects; budget 3 to 5 times that until real projects are measured.
- HeyClicky reached about $10K a month by late June 2026, about 500 payers (inferred from its changelog). Its founder says they know "exactly how much money we lose" on some users.
- **Reach:** the founder's own short clips of a real stuck project going from a red error to a green check with Undo, on Reels, X and TikTok; then vibe coding creators and referrals. Product Hunt helps a little. HeyClicky's founder had a large audience already; this founder does not.

## 4. The guide and Second Look
- **The guide:** moderate demand, turning into a commodity. Clones at $10 a month or $20 to $69 once; Microsoft's Copilot Vision points on Windows; macOS 27 Siri answers about what is on screen; Google's Gemini Mac app shares the screen on Option+Space. HeyClicky paused all its teaching skills (12 Sep). **Ship it as a free front door. Do not chase HeyClicky's waves two and three** (named agents, a chat window, connections, routines). Agents with no project are commodity.
- **Second Look:** the pain is strong (about 2,046 court decisions involving AI invented material by Sep 2026; the Deloitte refund; 70% of AI users check only sometimes or never, [F-Secure 23 Sep 2026](https://www.prnewswire.com/news-releases/people-dont-trust-ai-but-70-still-dont-regularly-check-its-answers-before-using-them-302887757.html)). The habit is weak: Google's free double check is ignored, and only about 1% click a cited source. **Build it as a contained feature,** leading with what others skip: redoing numbers and tables, risky code lines, any desktop app, an honest "I can't tell". Measure repeat use before making it a headline.

## 5. Anthropic's terms, checked live on 22 Oct 2026
- Running Claude Code in a product (the Agent SDK included): "Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf", unless mutually agreed ([legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)). The fix engine cannot be company paid without a written agreement. **Precedent:** JetBrains' Claude Agent is built on the Agent SDK and included in the JetBrains AI subscription ([Anthropic customer story](https://claude.com/customers/jetbrains-2)).
- The plain API is different: the Commercial Terms allow using it "to power products and services Customer makes available to its own customers" ([Commercial Terms](https://www.anthropic.com/legal/commercial-terms)). **So the light features (the guide, pointing, Explain, Second Look) can be company paid today,** if they call the Messages API directly and not through Claude Code.
- To look at: Claude Managed Agents with self hosted sandboxes [verify]; OpenAI's "Sign in with ChatGPT" (commercial apps on a waitlist) as a hedge.

## What would prove it either way
10 to 15 interviews with stuck builders; the hero run on 10 real stuck projects; the "did they learn?" test; the founder's Mac session.
