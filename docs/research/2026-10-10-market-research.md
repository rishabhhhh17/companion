# Market research: the wedge, the ICP and "fun" (10 Oct 2026)

Written for the founder and their mentor after the mentor's session. Built the way the mentor asked: the problem and the person first, then what exists and why it fails, then the wedge, then the hypothesis and how to test it. Six research passes (on-screen companions, big tech, ICP pain, flow of work and memory, fun and retention, market and platform rules), every claim sourced in the working notes; numbers marked "company says" or "unverified" where they could not be checked against a primary source. Research date: 10 Oct 2026.

---

## 1. Who and what hurts (the ICP and the problem)

**Who:** people who build with AI but are not engineers. Students, early professionals and founders using Lovable, Bolt, Replit, v0, Cursor or Claude Code. This is now a mass market:
- Lovable says 80% of its builders are in non technical roles, about 200,000 new projects a day (May 2026), revenue about $400M a year in Feb 2026 (unverified reports of about $600M by Sep).
- Replit: 50M+ registered users, about $525M a year (estimate, Apr 2026). Cursor: about $4B a year (unverified, Jun 2026). Codex: 8M weekly users (Jul 2026), India up 27x this year.
- Stack Overflow 2025: about 73% of people learning to code use AI tools, 39.5% every day.

**What hurts, ranked by strength of evidence:**

| # | Pain | Evidence | Strength |
|---|---|---|---|
| 1 | Stuck in debugging loops, cannot work out what is wrong | Stack Overflow 2025: the top frustration (66%) is "almost right, but not quite", and 45% say debugging AI code takes longer. A review of 101 practitioner sources (Oct 2025): people "reach dead ends" and 11% abandon. a16z's non engineer partner: "maybe 50/50" success. Addy Osmani's "70% problem" | Strong |
| 2 | Does not understand the code, so stays dependent on the AI | Anthropic's own randomized study (Jan 2026): learners using AI scored 50% vs 67% for those who coded by hand, and **the biggest gap was debugging**. People who asked "why" questions kept their learning; people who delegated did not | Strong |
| 3 | Security holes they cannot see | About 10% of Lovable showcase apps had open databases (CVE-2025-48757). One scan of about 5,600 vibe coded apps found 400+ exposed secrets. Veracode: AI picked the insecure option in 45% of tasks | Strong that it happens; weak that people feel it before it bites |
| 4 | Credits and limits burned in fix loops | A stubborn bug costs 10 to 20 credits vs 1 to 3 for a feature (vendor guide); Claude limits complaints | Medium |
| 5 | Cannot get from "works on my laptop" to live | a16z "localhost" meme; deploy guides call it "where vibe coded projects die" | Medium |
| 6 | Starts projects, does not finish them; false confidence | 11% abandonment; METR: experienced developers 19% slower while believing they were 20% faster | Medium |
| 7 | Courses and YouTube are boring and not about their own project | Mostly inference. The best hard signal: an AI tutor offered by email was used by 17%, the same tutor built into the course work by 98% | Weak to medium |
| 8 | Context lost between sessions | Often mentioned, never measured | Weak |

**The key reading:** the pain that is proven is **being stuck**, not **wanting to learn**. People pay to get unstuck (fixer agencies, credits, $800 cohorts) more clearly than they pay to learn. Learning only sticks when it is built into work the person already has to do.

## 2. What they try today, and why it fails them

| What exists | Why it does not solve the ICP's problem |
|---|---|
| The builders themselves (Lovable, Bolt, Replit, Cursor, Claude Code) | They help only inside their own tool, and the fix loop *is* the problem. Lovable has no learn or explain mode |
| Built in learning modes (ChatGPT Study mode, Claude Code's Learning style, Gemini Guided Learning) | Opt in, and hidden in a setting or a chat toggle; Claude's is inside a developer tool only. Opt in tutoring does not hold people: a two year trial of Khan Academy's AI tutor found students used it in only 17% of the moments they made a mistake, with no extra learning gain |
| YouTube, docs, courses (Codecademy, Scrimba, Boot.dev, $800 cohorts) | Not about their project; they have to leave the work to learn |
| HeyClicky (YC, Apr 2026; $20 Pro; says 25,000+ users) | General consumers (video editing, kids' games, founders), not builders. Points but never proves the fix worked. Caps agent use (about $0.25 per action). It removed proactive agents in Aug 2026 because users "felt watched". Its own team "barely used agents" |
| Big tech: Gemini for Mac (Fn hold to talk, screen aware editing, Jul 2026), Google Magic Pointer (testing), Codex and Claude computer use, Claude Cowork for non coders (2026), Copilot Vision, Siri on screen awareness in macOS 27 | Each helps only inside its own stack. They *do the clicking for you* or chat about the screen; none teaches inside your project, proves the fix, or helps with a project started in a rival's tool. Google is the biggest threat and the one to watch |
| Fixer agencies and freelancers | Expensive, slow, and you learn nothing |

**Nobody found:** a funded product that helps a stuck non engineer inside their own project, across tools, on their screen, and proves the fix worked.

## 3. The wedge (point A to point B)

**Recommendation: a rescue tutor.** Press one key when you are stuck in any AI builder. It looks at your project and, if you allow it, your screen. It gets you unstuck with a fix it has *checked*, shows you where to click if you need to, and teaches you the one "why" behind it in a sentence or two.

- **Point A to point B:** from "my AI built app is stuck" to "it is live, it works, and I understand why".
- **Why this and not "a tutor":** the evidence says people come for unstuck, not for lessons. The tutoring rides along at the moment of need, which is the only place learning was shown to stick (17% vs 98%).
- **Why this survives big tech:** it is neutral across Lovable, Bolt, Cursor, Claude Code and Replit; it proves the fix (checks, receipts, undo); it keeps memory on the person's Mac; it never watches passively. Each of those is something big tech is structurally unlikely to do soon.
- **What it is not, at launch:** five characters, a general screen chat, a memory product, a friend.

**What we have already built that is this wedge:** Rescue (diagnose a stuck project and plan the fix), the proof ladder (a fix is not "done" until checked), undo and receipts, Show me how (points at the real button), hold to talk, Prompt help, Explain (two or three "why" lines plus a check question), project memory and the shared AGENTS.md, the security gates (secrets, open databases). Most of the wedge exists; it needs to be *positioned and packaged* as "unstuck", not as a suite.

**Gaps to close for the wedge:**
1. Open a project from Lovable, Bolt or Replit easily (export or folder), and recognise the common stacks.
2. A "Why did it ignore my rule?" check and one tap "make this a hard rule" (see section 5).
3. Short visual explanations on screen (beyond the pointer), because long text is the reason people skip learning modes.
4. A shareable "it's live" card (see section 4).
5. Beta measurement built in (see section 6).

## 4. Defining "fun" (the mentor's homework)

**Evidence first:**
- AI apps convert to paid well but keep users worse: 21% still subscribed after a year vs 31% for other apps (RevenueCat 2026).
- "AI friend" products mostly failed or backfired: Dot shut down (Oct 2025), Pi faded, the Friend pendant sold about 3,000 units after $1M of subway ads and drew vandalism, Grok's companions are being retired, Character.ai shrank.
- What retains are daily work tools with taste: Wispr Flow (company says about 70% still active at a year, $2B valuation Aug 2026) and Granola (50% at 10 weeks).
- Characters do help when they are tied to a job: Finch (self care pet) D1 54% and D7 37%, slightly above Duolingo; Duolingo says its growth slowed when its mascot posted less. HeyClicky's biggest update gave its helpers faces that react while they listen, think and talk.
- Magic without a job fades: Rabbit (about 5% daily use), Humane, BeReal.

**The hypothesis (to write in the document):**
> Beginners abandon AI building because it feels like fighting an invisible machine: it is stuck, opaque and lonely, and the help is in another window. If the help appears on the screen the moment you are stuck, shows you what it is doing through a character, proves when something worked, and celebrates when it goes live, beginners will finish more projects and come back without being reminded.

**Fun, defined as four testable things:**

| Definition | Mechanism | Metric |
|---|---|---|
| Momentum you can see | The character shows the real state (looking, fixing, checking) and celebrates real progress (checks pass, it is live). No guilt, no streak punishment | Share who ship at least one project by week 2; D7 and D30 of shippers vs non shippers (target 2x) |
| I want to show someone | A shareable "it's live" card with the proof (a screenshot that passed checks) | Unprompted shares per active user per week; target 20%+ share once |
| Small surprises tied to the work | A rare reaction or animation when something hard is fixed | Unprompted opens per week; "did it make you smile this week, when?" |
| A capable teammate, not a tool | Personality used to explain and to push back ("that will break your login, here is why"), short and visual | Sean Ellis "very disappointed" 40%+, and how many name the character as the reason |

**Do not define fun as affection.** New York and California AI companion laws exclude productivity tools; a product that builds a relationship, asks about feelings or remembers moods can fall inside them (disclosures every 3 hours in New York, users can sue in California). Avoid the word "companion" in marketing, and the current working name is itself a risk. The EU has required telling people they are talking to an AI since 2 Aug 2026.

**Flow of work lessons (Wispr Flow):** it won on one habit change inside the app you are already in, not on accuracy, with a tail latency target (p99 under 0.7 s) and bottom up spread. It nearly lost trust over hidden screenshots; our hotkey only, light first, nothing stored design is a selling point to say out loud.

## 5. Memory: where it is and is not a differentiator

- **Not as storage:** Mem0 is well funded, Supermemory shut its consumer app (Sep 2026), AGENTS.md is a standard read by about 15 tools, ChatGPT and Claude both have editable memory.
- **Yes as "memory you can see working":** the mentor's example is real. Claude Code reads CLAUDE.md as a suggestion, "no guarantee of strict compliance"; files over 200 lines are followed less; AGENTS.md is silently skipped when a CLAUDE.md sits higher up; rules said only in chat are lost after the conversation is compressed. Developer tools show what was *loaded*, never in plain words what was *followed*. A plain "why did it ignore my rule?" check, plus one tap to turn a soft rule into a hard one (we already enforce house rules in code), fills a gap nobody serves for non engineers.
- **Cross model shared memory:** keep it out of v1 (the mentor's doubt is supported: beginners rarely switch models, and the standalone product just failed).

## 6. How to test it

**Interviews first (10 to 15 people, before the beta).** Find them in r/lovable, r/vibecoding, college groups, and people who stopped using HeyClicky or Lovable. Ask about behaviour, not opinions:
1. Tell me about the last time you got stuck building something with AI. What were you making? What happened?
2. What did you try next? How long did it take? Did you finish it?
3. Have you ever given up on a project? Where did it die?
4. When the AI fixed something, did you understand why it worked? Did that matter to you?
5. Have you paid for anything to get unstuck or to learn (credits, a course, a person, a bootcamp)? How much? Was it worth it?
6. Which AI tools do you use, and which did you stop using? Why did you stop?
7. Has an AI tool ever done something you could not undo, or broken something that worked?
8. When you need help, do you prefer to read, watch, or be shown on your screen?
9. (Show the 30 second demo last.) What would you use this for first? What would make you stop?

**Closed beta (about 50 people, 4 weeks).**
- Who: the interviewees plus friends who are actively building something with AI right now.
- Measure from week 2 on (ignore the novelty spike): D1 at least 50%, D7 at least 35% and a flat D30 curve; Sean Ellis "very disappointed" at least 40% (ask only people who used it twice in the last two weeks); share who ship at least one project; unprompted opens; unprompted shares; "made you smile" answers.
- With 50 people, one person is 2 points: report counts, not only percentages, and lean on the big signals.

## 7. Price and money (for later, owned by the founder)

- Bring your own key products price below all inclusive ones: Raycast, Superwhisper, Wispr at $8 to $15 a month; HeyClicky, Cursor, Lovable at $20 to $25. Our users already pay Anthropic, so Plus must sit clearly below $20. Test $8, $12 and $15; India ₹299, ₹399, ₹499 (ChatGPT Go at ₹399 is the anchor); 40 to 50% student discount.
- Paddle supports UPI Autopay for subscriptions in India (since Jun 2026) and handles global tax; Dodo Payments is the comparison; Razorpay alone is not a merchant of record.
- Anthropic: since 7 Oct 2026, Max subscribers get monthly API credits that also cover the Agent SDK, which makes our API key route cheaper for them. The plan sign in route stays behind its switch until Anthropic confirms in writing (their policy page still reads both ways). OpenAI openly supports apps running on a user's ChatGPT plan; a Codex route is a hedge.

## 8. Risks

1. **Google** (Gemini for Mac with Fn voice, screen aware editing, Magic Pointer in testing). Watch monthly.
2. **Anthropic moving into the same users** (Cowork for non coders, computer use) with the model we depend on.
3. **HeyClicky and its clones** (Peek $10, Shadow $8, Guidy, TryUncle) moving into coding.
4. **macOS friction:** the Screen Recording permission asks again about monthly.
5. **Being treated as a "companion" app** under the New York and California laws, and the EU disclosure rule.
6. **Novelty decay:** a character without a recurring job fades; the job (unstuck, shipped) has to carry it.

## 9. Open questions

- **"Mania"** could not be found under that name (mania.ai is a parked domain). Ask the mentor for a link.
- Reddit and X could not be searched by the research tools, so first hand quotes from vibe coders are missing; the interviews fill that.
- What Indian students will actually pay: no 2026 data; a landing page test or a short survey answers it.

## 10. First hand evidence from X (read on 10 Oct 2026 through the founder's own browser)

Reddit is blocked for the research tools in every browser available (safety restriction), so Reddit is still missing; X was read directly. Likes show how much a line resonated.

**Stuck in fix loops is the loudest pain:**
- Andrew Chen (1.6K likes, Feb 2025): "You can get the first 75% trivially, and it's amazing. Then try to make changes and iterate..."
- levelsio (2K, Apr 2025): AI "stops understanding large code bases", so after the first prototype "you get stuck".
- Matt Shumer (968, May 2025) shared a prompt for getting out of loops: people need help escaping them.
- forgebitz (523, Jun 2025): "stuck in endless loops".
- A small account (7 Oct 2026): "Vibe coding is 10 minutes of magic and 3 hours of telling the AI it didn't fix it. It always says it is fixed now." This is exactly what a checked fix answers.

**Not understanding your own code:**
- "Pure vibe coding is a Ponzi scheme. Eventually, the technical debt comes due, and if you don't understand the foundations, you can't pay it off." (5.4K, Mar 2026)
- "Vibe coding works... until you need to change something. Then you realize you don't understand your own codebase." (277, Apr 2026)

**Deploy is a known wall:** a paid hosting campaign (Jun 2026) runs on the line "deployment is still where most people get stuck". Advertisers target this pain.

**Short beats long for learning:** "most 'learn to code with AI' tutorials drag on for hours and bury the good stuff in filler" (714, Sep 2026). A list of resources "grouped by what you're stuck on" got 3.9K likes (Sep 2026): people organise their learning around being stuck.

**Credits and cost:** "Spend $200 in credits. Ship a buggy MVP." (May 2026); a competitor attacks Lovable on "$960/mo, limited credits" (Jul 2026). Bring your own key is a real advantage.

**Claude ignoring instructions:** posts mostly blame the user ("your CLAUDE.md is useless, here is how to fix it", 279) and a behaviour file with a claimed 190K GitHub stars promises to stop "the four things every user complains about". People want the agent to follow their rules and do not know why it does not: medium signal for the "why did it ignore my rule" check.

**HeyClicky, what the timeline shows:**
- Growth came from founder demo videos (one with 14K likes) and fans who make animations and remixes of the character. The character itself creates love and free marketing.
- HeyClicky is moving toward beginners who code: "let me help you finally install claude code plz" (Jun 2026).
- A public teardown of its app (19 Jul 2026, 389 likes) questioned analytics data collection against its privacy policy. Privacy is a live wound in this category; our hotkey only, nothing stored design is a visible difference.
- On 10 Oct 2026 it posted "i am changing": a change is coming; watch it.


## Where we beat HeyClicky (founder's notes, 11 Oct 2026)

Inferred from their changelog and this research, not from using their app. The founder will try HeyClicky on a real stuck moment and note what it gets wrong; until then treat this as a strong guess.

1. They are a generalist (named agents, routines, several accounts, referral payouts): nobody is the hero user. We are the one thing for people stuck while building with AI.
2. They guess from the screen; we know the project. Point at the problem uses the real failing line, terminal error and proof run. Hard to copy without running the project.
3. They do not prove anything. Proof plus the visual receipt ("this works now", the change ringed) needs machinery they do not have.
4. They hold your hand or do it for you; we do both. Your turn mode points and waits for the last click, then celebrates; "just do it" is one button away.
5. Trust: they removed their proactive features twice and their routines run in the background. We never watch in the background, never touch your git, snapshot before every change, and have Undo. One line on the site.
6. Cost: their plans are $0, $20 and $100 with upgrade prompts. We bring your own Claude key: no seat price for a beginner or student.

**Do not copy:** agents, routines, referral programs (F16 parks them). **Risks:** a beginner who is not stuck in week one never sees the hero (answered by M10 item 6b, the sample stuck moment); they can add a "builder mode", so being deeper and earlier, fast, is the protection.
