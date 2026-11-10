# Companion helps people finish what they start

**Status:** single source of truth for the product, as of 6 Oct 2026. **Scope:** the Curious path (the normal path, for non engineers). The Geeked (Pro) path is parked; see section 21. **Working names:** "Companion" for the product, "Curious" for the normal path, "Geeked" for the Pro path; all names will change. **Founder:** Rishabh (solo, first time founder, student). **Location in the repo:** `docs/research/product_research.md`. Its companion file is `docs/research/technical_research.md`.

**How Claude Code should read this file.** Section 1 lists decisions the founder has fixed; build around them and do not reopen them. Section 3 is the complete feature map of the Curious tool, with the release each feature belongs to; build the foundation so every feature on that map can land without a rewrite, even the ones that ship later. Section 11 lists ideas that were considered and dropped; do not bring them back without asking. Anything labelled "hypothesis" is meant to be tested. Anything marked "unverified", "secondhand" or "vendor reported" must not be repeated as fact in product copy. Where the code and this document disagree, flag the conflict rather than silently picking one.

**Corrections, 7 Oct 2026.** A desk research pass on 6 and 7 Oct 2026 checked the claims behind the M0 spikes against live official sources; the full findings are in `docs/milestones/M0-desk-research.md`. In this file, section 3 records the founder's confirmation of Where was I and Explain for the Alpha, section 5 uses Anthropic's current wording on coordinate misalignment, and section 15 adds the legal page's sentence telling developers to use API key or cloud authentication, the Commercial Terms requirement, and how to ask Anthropic in writing. Section 20 adds a possible fourth way to connect and notes that Apple removed the pasteboard preview switch in the macOS 27.2 betas. **Founder decisions, 7 Oct 2026:** every user, Free or Plus, gets proof up to a real browser check, and Plus adds screenshot evidence and the second model review (section 15); Companion never writes the user's git, not even to undo an agent's commit (section 6 as written); the Console sign in is tested in M0 spike (c) and decided in M1 (section 20).

Companion is a Mac first, Windows next desktop app. Abstract characters with their own personalities live on the side edges of the screen, and through them the user gets one companion that helps them finish what they start. It does four jobs. It **does the work**: agents build, rescue, check and ship software projects, with every step visible, checkpointed and undoable. It **helps you use AI better**: on a hotkey it turns a rough prompt in any app into a clear one, and it points at the screen to show you how to do something. It **notices for you**: when you come back it tells you where you were, and later it catches promises you made and work you keep repeating, and offers to close or automate them. It **grows with you**: it explains what it did in plain words, remembers how you like to work, and lets you see and edit everything it remembers. You can talk to it or type. It never watches your screen in the background; it sees only what you give it, when you ask.

The most important fact for the business is Anthropic's rule for products that run Claude Code, which includes anything built on the Claude Agent SDK: they **"may not pay for, resell, or intermediate Claude usage on their end users' behalf. Each end user must authenticate with their own Anthropic API key, Claude subscription plan credentials, or 3P inference provider credential"** ([Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)). So v1 is "bring your own Claude", and Companion charges only for the companion itself. Demand is proven: Lovable passed **$600M annualized revenue** on 24 Sept 2026 ([TechCrunch](https://techcrunch.com/2026/09/24/lovables-annualized-revenue-crosses-600m-as-vibe-coding-takes-off/)). Apple, Meta, Microsoft and OpenAI all shipped "agent acts on your computer" products in September, but none is a character on your screen that owns your project end to end, proves it works, ships it, and helps you with everything around it.

## 1. One page summary: a broad companion with one promise and fixed decisions

| Question | Answer |
|---|---|
| What it is | A desktop companion whose characters build, prove and ship your projects, sharpen your prompts, show you how, close your loose ends, explain as they go, and remember how you work |
| The promise | You finish what you start. Projects get built, checked and shipped with proof; you never sit stuck, guessing what to ask or where to click |
| Who it is for | Curious: non engineers (students, non technical founders, creators) who start projects with AI and get stuck |
| Platforms and market | Mac first, Windows shortly after on one codebase; direct download from our website, not the app stores; global from day one with regional pricing |
| Engine (v1) | Bring your own Claude: the user's own API key (kept in the OS keychain), their own cloud provider credential, or their own Claude subscription signed in through Anthropic's own flow (pending Anthropic's written confirmation, section 15) |
| How it makes money | Subscription for the companion layer. No model markup |
| Ways in | Type or talk (hold a hotkey). Hotkeys for Prompt help and Show me how. Drag a folder onto a character |
| Presence | Abstract characters docked on a side edge, movable anywhere, with a clear on and working indicator, expandable cards with proof, and presentation mode. Never passive watching |
| Remote | Phone approvals by a web app (PWA) and Telegram. Not WhatsApp |
| Release order | v1 (Mac alpha, then beta): presence, voice, Prompt help, Show me how, Build mode, memory, Explain, Where was I, remote approvals. v1.1: Loop Closer, Pattern Catcher, recaps. Later: Learn (Tutor), Work, Team modes, each behind a retention gate |
| North star | Verified ships per week, with "things finished" per active user as the supporting measure |
| Biggest risks | Activation friction from "bring your own Claude"; Anthropic's wording on subscriptions; doing many things at 60%; labs and platforms absorbing single features; false "done" claims |

**Fixed founder decisions (do not reopen).**

1. Global from day one, not India first. Mac first because Mac users pay and the founder dogfoods on a Mac; Windows shortly after, on the same codebase.
2. Direct download from the website. No Mac App Store, no Microsoft Store as the primary channel.
3. Agents from day one, not a suggestion tool that slowly earns autonomy.
4. Characters: abstract shapes with their own identity and personality, anime inspired without copying any IP, not cute mascots, not just a glow. Switchable skins. Docked on the side edges (never the Mac notch), movable anywhere, with an on and working indicator. Must look and behave better than HeyClicky's side cards.
5. An optional onboarding questionnaire; the companion learns from the user over time, visibly.
6. Two paths in one app: Curious (this document) and Geeked (parked). Geeked gets about a fifth of total effort when it resumes.
7. The Curious path is the whole companion, not only "build my project": Prompt help, Show me how (HeyClicky style pointing, explicitly allowed to borrow), voice in the style of Wispr Flow, Loop Closer, Pattern Catcher, Explain, memory, and Build mode all belong to it.
8. Modes: Build first, then Learn, Work and Team, each gated on retention.
9. Remote approvals through a phone web app and Telegram. WhatsApp is excluded because Meta has barred general purpose AI assistants from its Business API since 15 Jan 2026 ([respond.io](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban)).
10. Bring your own Claude; no paying for or reselling model usage.
11. Never passively watch the screen or track activity. Never steal keyboard focus.
12. YC is not a focus. Names are not decided.
13. **Founder update, 8 Oct 2026 (F15).** Launch priority: agents (Build mode) first and best, Prompt help while you code, shared memory, and Show me how last. Logic before looks. A beautiful, calm, professional website and onboarding flow come later, and the site should help the company grow beyond the product. A Pro plan idea is parked: a swarm of connected memory for people who already run agents. Prompt help should show recommendations in a clean, changeable style, not chat bubbles. Confirmed the same day: Prompt help works only on the user's hotkey (Companion never watches and speaks up unasked, rules 5, 6 and 11), and "lots of questions" means short clarifying questions inside Prompt help, not a longer questionnaire.

## 2. The product explained simply: one companion, four jobs

### What it does

Companion sits on the edge of your screen as one or more small abstract characters. It is a presence on your screen plus four jobs.

**It does the work.** Point it at a project folder (a half built Lovable export, a class project, a GitHub repo, or an empty folder) and say what you want, typed or spoken. A character's agent plans, edits files, runs commands, starts the app and asks before anything risky, while its card shows the current step in plain words. When the agent says "done", Companion checks: the build runs, the tests run, a real browser opens the app, and a screenshot is judged against what you asked. The card shows that proof. The Shipper then runs a safety check and deploys a preview, and the project goes live only after one explicit click. Every step has a receipt and an undo.

**It helps you use AI better.** When you are typing a prompt in Claude, ChatGPT, Cursor, Lovable or Claude Code, press a hotkey and Companion rewrites it into a clear prompt (goal, context from your project, what not to touch, how to check it worked), shows you the difference, and pastes it back when you accept. When you are lost in an app ("how do I connect my domain in Vercel?"), press another hotkey and ask; the character looks at your screen once and points at exactly where to click, step by step.

**It notices for you.** When you come back to your laptop it tells you in three lines where you were and what is waiting on you. From v1.1, if you connect a source, it catches promises you made ("you told Riya you'd send the deck Friday") and drafts the follow up, and it notices work you keep repeating and offers to do it for you. It never sends or acts without your tap.

**It grows with you.** It explains what it did in two or three plain bullets, remembers how you like to work and what you corrected, and shows everything it remembers in a page where you can edit or delete any line.

The promise is not "AI that codes" or "AI that sees your screen", which the platforms give away, but **you finish what you start, with proof, from a companion you trust on your own computer.** The gap is documented: app builders typically reach "roughly 60 to 70% of a real product" ([Altar.io](https://altar.io/lovable-vs-bolt-vs-v0-vs-replit-vs-base44/)), and a scan of **23,792 deployed AI built apps** found critical security findings in 7.1% of Lovable apps, 96% of them Supabase row level security (RLS) misconfigurations ([securityscanner.dev](https://securityscanner.dev/reports/2026-q2)).

### A day in the life (illustrative persona, not a real user)

Maya, a design student, installs Companion and picks a character. It asks three optional questions (what she is building, how much to explain, how short its updates should be) and changes visibly with each answer.

* **Morning.** Her portfolio site, exported from Lovable, no longer builds. She drags the folder onto the character. The Rescuer explains in two sentences why (a missing environment variable and a broken dependency), fixes both, and shows a green proof card with a screenshot of the running site. Two "why" bullets under the card explain what an environment variable is.
* **Late morning.** She is writing a prompt in Claude for a new gallery page. It says "make a gallery thing". She presses the Prompt help hotkey. The card shows a rewrite that names her `src/pages` folder, asks one question ("should images open full size on click?"), and adds "check that it works on a phone screen". She taps Use it and it lands in Claude's text box.
* **Afternoon.** She asks the Builder, by voice, for a contact form and leaves for class. On the bus her phone buzzes: "The Shipper wants to deploy a preview. The check found one exposed key in the code the browser downloads and removed it." She taps Approve.
* **Evening.** In Vercel she cannot find where to add her domain. She presses the Show me how hotkey and asks. The character lights its "seeing your screen" colour, an arrow flies from the dock to the Domains tab, and it walks her through three clicks. She makes the project live with one click and shares the link.
* **Next morning.** She opens the laptop. One card: "Yesterday: contact form done, site live. Waiting on you: approve the launch post draft."

She never opened a terminal, and nothing watched her screen in the background.

## 3. The whole Curious tool at a glance

Agents are jobs. Characters are identities. Any character can run any agent, but each agent has a default character so users learn who does what. "Release" uses the slices in section 18: **Alpha** (private, Mac), **Beta** (invite only, Mac then Windows), **v1.1**, **Later** (gated modes).

| Area | Feature | What it does | Agent or part | Release |
|---|---|---|---|---|
| Presence | Characters and dock | Edge docked characters with states, cards with proof, Stop, Undo and Receipt, presentation mode | Characters | Alpha: one character, all states. Beta: full set and skins |
| Presence | Ask box | A global hotkey opens a small input beside the dock; type or hold to talk; drag a folder onto a character to start; the right agent starts | All | Alpha |
| Presence | Stop everything | A global kill switch hotkey stops every agent, task, capture and the microphone at once | Core | Alpha |
| Presence | Voice | Hold a hotkey and speak; transcribed on the device; since F26 (30 Oct 2026) a second key types the words into any app's text box at the cursor, never sent; still works with Wispr Flow and macOS Dictation; replies are text, read aloud only if turned on | All | Alpha |
| Presence | Onboarding questionnaire | Optional, up to five questions, each answer visibly changes behaviour | All | Alpha |
| Presence | Remote approvals | Phone web app and Telegram for progress, decisions and approvals | Shipper, Builder | Beta |
| Help you use AI | Prompt help | Hotkey in any app; rewrites the prompt using project context, shows a diff, pastes back on accept | Prompt helper (fast model) | Alpha |
| Help you use AI | Show me how | Hotkey; one capture of the screen; points at where to click; step by step walkthrough while the mode is on | Guide | Alpha |
| Do the work | Drive | Builder plans short steps, runs each through Claude Code, checkpoints, proves; take the wheel: bringing the project's editor or terminal to the front, or editing a project file yourself, pauses it | Builder | Alpha |
| Do the work | Decision cards | At a real fork, two or three options with a recommendation; the answer is saved so it is never asked twice | Builder | Alpha |
| Do the work | Rescue | Reads a stuck project, names the cause in two sentences, gets it running, writes a finish plan | Rescuer | Alpha |
| Do the work | Ship | Safety gate, preview deploy, live on one click, rollback, draft launch post, removable "built with" link | Shipper | Alpha (preview and live), Beta (launch post, "built with" link) |
| Do the work | Research | Looks up what the build needs and files cited notes into project memory; writes no code | Researcher | Alpha |
| Do the work | Proof and review | The proof ladder on every "done": exit codes, tests, browser smoke check, screenshot evidence, then a second model reviews the change and can send it back | Reviewer | Alpha |
| Do the work | Undo, receipts, timeline | Snapshot before every step, one click undo, a receipt per task, a timeline per project | Core | Alpha |
| Do the work | House rules | Corrections ("never touch the auth folder", "always Tailwind") become rules every agent follows | Core | Alpha |
| Do the work | Fix loop breaker | After three failed fixes on the same error, stops and offers a different approach, an undo, or a question | Builder | Alpha |
| Do the work | Project shelf and parallel projects | Every project with status and one click resume; up to three projects running at once | Core | Beta |
| Do the work | Build timelapse | A 30 second video of the session ending on the live link, assembled from proof screenshots and the timeline (never a screen recording), ready to share | Core | Beta |
| Notice for you | Where was I | On return, three lines: what you were doing, what finished, what waits on you | Core (fast model) | Alpha (pulled forward from a later phase because it is cheap; confirmed by the founder on 6 Oct 2026) |
| Notice for you | Recaps | End of session and weekly: shipped, fixed, waiting, time and cost | Core | v1.1 |
| Notice for you | Loop Closer | Catches promises in sources you connect and stalled projects in folders you grant; drafts the follow up; never sends without a tap | Closer | v1.1 |
| Notice for you | Pattern Catcher | Notices work you repeat (from your requests to Companion, its own runs and sources you connect) and offers to automate it after one approval | Watcher | v1.1 |
| Grow with you | Explain | After each task, two or three plain "why" bullets and one optional check question; on by default for Curious | All | Alpha (was a fast follow in PRD v1; pulled forward because it is cheap; confirmed by the founder on 6 Oct 2026) |
| Grow with you | Memory | Project memory and a "how I work with you" profile, learned from explicit signals, shown in an editable "What I know about you" page | Core | Alpha |
| Grow with you | Tutor | "Do it with me": pauses at one real decision per task and teaches; quizzes; progress you can see | Tutor | Later (Learn mode) |
| Later modes | Learn | Tutor, mentor seat, class dashboard for colleges, a Campus plan sold per student per semester | Tutor | Later |
| Later modes | Work | Analyst (checks models and decks for mismatches), meeting notes to actions, research on screen beyond builds | Analyst, Closer, Researcher | Later |
| Later modes | Team | Oversight of many agents and people: progress, cost, risk, policies, shared memory, spend controls | Supervisor | Later |
| Later platform | More engines and reach | The Builder driving Cursor's agent and other coding tools; a second engine (Codex) and managed credits; project memory exposed as an MCP server so any AI tool can read it; cloud agents that keep working when the laptop is closed; opt in memory sync | Core | Later |

**Agents and their default characters.** Builder (Spark), Rescuer (Loop), Shipper (Pebble), Reviewer (Prism), Tutor and Guide (Orb), Researcher (a new shape still to design). Closer, Watcher, Analyst and Supervisor get new shapes when their modes arrive. "Prompt helper" and "Guide" are working names for the two hotkey features; whichever character the user has in front runs them.

**Why the breadth is not a trap.** Every feature reuses the same four parts: the characters, the agent engine, the memory and the trust layer (snapshots, proof, receipts, approvals). Prompt help gets better because Build mode already knows the project; Show me how gets better because memory knows which tools you use; Loop Closer finds stalled projects because the timeline knows which folders went quiet. The risk of "doing everything at 60%" is real (section 19), so releases are sliced and later modes are gated, but the foundation is designed for the whole map from day one.

## 4. Presence: characters, voice and first run

### Characters

**Docking and movement.** Each character lives in a tab of about 48 to 56 pixels on the left or right screen edge, never the notch, so the design works on Windows and external monitors. It slides along the edge, snaps magnetically, and can be dragged off to float anywhere; position is stored per display as edge plus offset and restored when screens change. When agents run, the tab fans out into a vertical stack of cards, at most three visible and the rest collapsed into a count. A card shows the character, task, live step in plain words, progress arc, risk badge, proof, and Stop, Undo and Receipt buttons. That is how Companion beats HeyClicky's corner accordion and thumbnail pile: cards show proof and control, not just activity. The tab slides away when the cursor approaches during other work and never reserves screen space.

**Identity.** Characters are abstract shapes with distinct silhouettes, a two colour signature and a working style; personality lives in motion and in the voice of their messages. Faces are eyes only, using manga style emotion symbols (arcs for happy, spirals for confused, a sweat drop for strain) as a style vocabulary, not anyone's characters. No human figures, no gendered designs. A 2026 review of 53 studies found no consistent trust advantage for realistic over stylized agents ([ScienceDirect](https://www.sciencedirect.com/science/article/pii/S2451958826002940)), and Microsoft's abstract Mico was accepted by the mainstream ([I Programmer](https://www.i-programmer.info/news/105-artificial-intelligence/18410-mico-a-personality-for-copilot.html)).

| Species | Shape | Working style | Default job |
|---|---|---|---|
| Spark | Small flame or star | Fast, tries things quickly | Builder |
| Prism | Faceted triangle | Careful, checks before moving | Reviewer |
| Loop | Ring | Persistent, keeps fixing | Rescuer |
| Orb | Soft blob | Calm, explains | Tutor, Guide (Show me how) |
| Pebble | Smooth stone | Steady, says little | Shipper |
| (to design) | New shape | Curious, quiet | Researcher |

Users can rename any character. Skins change the material (clean vector, paper cutout, chalk, pixel; later ink, glass, clay), never the silhouette, so identity survives a skin change.

**States.** One state machine per character, driven by agent events.

| State | Meaning | Visual cue (shape and motion, colour as backup) |
|---|---|---|
| Off | Companion paused | Desaturated, still |
| Idle | On, nothing running | Near static slow breathing |
| Listening | User is talking or typing to it | Leans toward the input, small waveform while the mic is open |
| Thinking | Planning | Slow inner swirl |
| Working | Agent executing steps | Busy loop with a progress arc; the clear "working" indicator |
| Checking | Reviewer running proof | Scanning sweep |
| Needs you | Approval or answer required | Steady amber glow plus a badge |
| Done | Proof passed | Brief celebration, then idle |
| Error or blocked | Proof failed or agent stuck | Droop with an icon; card explains and offers undo |
| Seeing your screen | Only during a Show me how request the user started | A unique colour used for nothing else |
| Reading your text | Only during a Prompt help request the user started | A small text icon on the character |

**Technology.** Rive state machines with a `state` input, skins as data bound view models, and a reduced motion input, because Rive does not apply reduced motion on its own ([Rive reduced motion](https://rive.app/docs/editor/accessibility/reduced-motion.md)); the $9 Cadet seat removes the forced splash screen ([Rive pricing](https://rive.app/pricing)). A transparent macOS webview drew about 620 mW of GPU against 75 mW opaque in one Tauri report ([Tauri #15471](https://github.com/tauri-apps/tauri/issues/15471)), so windows stay sized to content and animation pauses when idle, hidden or on battery.

**Full screen apps.** By default the dock hides while a full screen app is in front, leaving only a small "needs you" badge when something waits; a setting keeps it visible. During a Show me how walkthrough the pointer always appears over full screen apps.

**Brand feel.** Calm, near monochrome app chrome with one warm accent; the characters carry colour and motion, and motion (how characters slide in from the edge and how cards fan out) is the signature asset. Each character is readable at 32 pixels and has its own motion style (Spark quick and bouncy, Prism precise, Loop rolling, Orb drifting, Pebble grounded). Voice in copy: plain, warm, honest, never flattering, never patronizing.

**Presentation mode.** Hiding a window from capture is unreliable on macOS: Electron's docs say newer ScreenCaptureKit apps "will capture your window" despite content protection ([Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)). So presentation mode collapses characters to a neutral dot and hides card contents, triggered by a hotkey, a toggle and heuristics such as camera or microphone use while a call app runs.

**Manners (the rules that prevent Clippy).**

1. Speak only when summoned, when a task you asked for changes state, or with a finished gift (a draft follow up, a ready automation) in a place you chose to receive it. Never "it looks like you're trying to...".
2. Remember every dismissal; after two dismissals of a kind, stop offering it.
3. Never interrupt typing; wait for a pause. Never steal keyboard focus.
4. No sound by default. One character speaks at a time.
5. Never flatter. Say plainly what is not done or not working; disagree when a request will break something.
6. Ask before destructive commands, before anything outside the project folder, before every live deploy, and before anything is sent to another person. One global hotkey stops everything.
7. Productivity only: no affection meters, no "I missed you", no mood check ins, no streaks tied to a character, no chatting on after the task is done. This keeps Companion outside companion chatbot laws. California's SB 243 excludes bots used only for productivity or technical assistance, and New York's law targets bots that combine remembering past chats with unprompted emotional questions and ongoing talk about personal matters, with fines up to $15,000 a day ([MoFo](https://www.mofo.com/resources/insights/251120-new-york-and-california-enact-landmark-ai)). Memory therefore stays about work.
8. Always disclose that it is an AI productivity tool, and show what it is looking at.

### Voice: talk instead of typing

Hold a hotkey, speak, release; the words appear in the ask box for a glance, and Enter sends (auto send can be turned on). The microphone opens only while the key is held, so the macOS orange dot shows only while you speak. Claude itself does not accept audio, and Claude Code's own voice dictation streams audio to Anthropic, needs a Claude.ai login and does not work with an API key ([Claude Code voice dictation](https://code.claude.com/docs/en/voice-dictation.md)), so Companion transcribes on the device with an open source Whisper model downloaded when the user turns voice on. That is integration of an existing open model, not building a voice engine, and it costs nothing per minute. It covers about 99 languages including Hindi ([whisper.cpp](https://github.com/ggml-org/whisper.cpp)). The closest reference app is Handy, an MIT licensed push to talk dictation app on the same Tauri, React and Rust stack ([Handy](https://github.com/cjpais/handy)). Apple's newer on device SpeechAnalyzer needs macOS 26 and launched with about 10 languages, so it is a later optional engine ([Apple SpeechTranscriber](https://developer.apple.com/documentation/speech/speechtranscriber.md)).

**Wispr Flow.** No public dictation API was found; it inserts text by pasting through the Accessibility permission, and it offers a read only MCP server for meeting notes ([Wispr Flow MCP](https://docs.wisprflow.ai/articles/9551372685-connect-an-mcp-client-to-wispr-flow-remote-mcp-server)). So "works with Wispr Flow" means Companion's text box accepts Wispr's paste and macOS Dictation cleanly, and users can optionally connect Wispr's MCP server for meeting notes (useful for Loop Closer). Wispr raised $280M at a $2B valuation in August 2026 ([Wispr Flow](https://wisprflow.ai/post/series-b)), and Wikipedia reports India as its second largest market ([Wikipedia](https://en.wikipedia.org/wiki/Wispr_Flow), secondhand, unverified), which shows how much people want voice.

**Speaking back.** Off by default. An opt in "read short replies aloud" uses the free system voices for status lines only. This keeps Companion calmer than HeyClicky's voice first buddy.

### First run and the optional questionnaire

Target: an agent working on a real project, or a first Prompt help or Show me how result, within five minutes of install.

1. Download from the website, open, pick a character (or keep the default).
2. Connect Claude: Companion detects an existing Claude Code login; otherwise it explains the three options with honest costs (API key with a spend cap, cloud credential, or the user's subscription through Anthropic's own sign in when cleared). A demo project runs before anything is connected, so the user sees the magic first.
3. Optional questionnaire, at most five questions, skippable, asked by the character, each answer visibly changing something on the next screen and saved in the memory page ([Appcues](https://www.appcues.com/blog/user-onboarding-surveys), vendor: aim for three, cap at five):
   1. What are you building right now? (free text, or "nothing yet") → starts Rescue or a new project, seeds project memory
   2. How technical are you? (never coded, I read some code, I code a bit) → how much it explains and how technical cards are
   3. How much should it do on its own? (ask me often, ask at real decisions, just get it done) → Drive defaults
   4. How do you like updates? (short and blunt, friendly and detailed) → voice and length of every message
   5. When should it stay quiet? (calls, full screen, focus mode, never interrupt) → presentation mode and quiet rules
4. Pick a project folder or start a new one. If the folder has code, the Rescuer scans it and shows a finish plan; one click starts the Builder.
5. Permissions are asked only when a feature first needs them (section 10), each with a one line reason and a single "Continue" button, following Apple's guidance to request access only when people use the feature.

Duolingo saw about 20% more daily users after letting people try a lesson before signing up ([Taplytics](https://taplytics.com/blog/duolingo-ab-test-onboarding), secondhand), which is why value comes before forms.

## 5. Help you use AI better: Prompt help and Show me how

Both are hotkey features that work in any app. Both are **commodities on their own** and must win on context, quality and trust, not on existing.

### Prompt help

**What it does.** The user is typing in Claude (app or web), ChatGPT, Cursor, Lovable or Claude Code. They press the hotkey. Companion reads the text they are typing (or the text they selected), shows a "reading your text" indicator, and opens a card with an improved prompt and a diff. Accept pastes it back into the same field; in a terminal running Claude Code the user selects their prompt first and the improved one is copied for them to paste, because automating keys in a terminal can interrupt a running task. Cancel changes nothing. It never sends anything on the user's behalf.

**What "better" means.** A rubric drawn from Anthropic's and OpenAI's prompt guidance ([Anthropic prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices); [Claude Code best practices](https://code.claude.com/docs/en/best-practices); [OpenAI prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)):

1. **Goal:** one sentence stating the outcome. Ask if it is missing.
2. **Context:** real file paths, stack and the exact error text, pulled from the project folder only if the user granted it. Never invent names.
3. **Scope and constraints:** what to touch and what not to touch.
4. **How to check it worked:** tests, expected output, "works on a phone screen". Claude Code's docs call this the highest leverage addition: "Give Claude a check it can run".
5. **Output format,** only when the target is a chat app or the user cares.
6. **Examples,** only when format or tone matters.
7. **Clean up:** remove contradictions and SHOUTING, keep code, URLs and pasted logs verbatim, turn unknowns into one question in the card rather than a guess.

It adapts to the target: Claude Code gets file references and a verification step, chat apps get goal, audience and format, app builders like Lovable get one feature per prompt described by what the user should see. A "light" mode fixes clarity only, and a rough prompt should not triple in length.

**Honest claim.** "Clearer prompts, fewer redo loops", not "fewer tokens". Claude Code's cost docs say vague requests trigger broad scanning and specific ones need fewer file reads ([Claude Code costs](https://code.claude.com/docs/en/costs)), but the improved prompt is usually longer, and every Prompt help call itself uses the user's Claude. Measure it before claiming savings.

**Market.** Generic prompt improvement is commoditized: free in Anthropic's Console prompt improver ([Anthropic](https://claude.com/blog/prompt-improver)) and OpenAI's Playground Optimize ([OpenAI](https://help.openai.com/en/articles/9824968)), built into Bolt and Augment (which adds codebase context on Ctrl+P, [Augment](https://docs.augmentcode.com/cli/interactive/prompt-enhancer)), available system wide through Apple Writing Tools ([Apple](https://support.apple.com/en-gb/guide/mac-help/mchldcd6c260/mac)), and sold as Mac hotkey apps at $7.99 a month ([PromptAI 360](https://www.promptai360.com/download), vendor) or $29 lifetime ([Prompt Enhancer](https://promptenhancer.online/), vendor). ChatGPT and Cursor had not shipped an improve button as of September 2026 (forum replies, secondhand). Companion wins only where those cannot: it knows the user's project, it shapes output for the specific target app, it asks instead of inventing, and it costs nothing extra on top of the user's Claude. Treat it as the daily habit feature in the free tier, as the earlier Blueprint planned, not as a product.

**Trust.** Prompt help needs the macOS Accessibility permission, the same permission Grammarly and Wispr Flow use; Grammarly has been called a "keylogger" and Wispr Flow drew concern for reading keystrokes (both secondhand). So: ask at first use with plain words ("reads only the text box you are typing in, only when you press the hotkey, never in the background; sent to Claude on your own account; not stored"), ask per app the first time, exclude password fields and password managers, show exactly what was read, keep the original for restore, and log no content.

### Show me how

**What it does.** The user presses the Show me how hotkey and asks, typed or spoken: "where do I find the API key in Supabase?" The character lights its "seeing your screen" colour first, captures the display under the cursor once, and an arrow flies from the dock to the exact control, with a ring around it and a short caption ("Click Project Settings"). For multi step tasks it enters a visible walkthrough mode: when the user clicks the target, it captures again and points at the next step, until done, Esc, or a short timeout. Outside that mode it sees nothing.

**How it stays accurate.** The model picks the target from the screenshot; the app then snaps that rough point to a real on screen element using the Mac's accessibility information or on device text recognition, and draws the ring around the snapped element rather than a single pixel. Anthropic's own guidance warns that model coordinates are approximate, and that missing a resize forced by the visual token limit, even when both sides are under the edge limit, is "the most common cause of misaligned coordinates" ([Claude vision coordinates](https://platform.claude.com/docs/en/build-with-claude/vision-coordinates)). Only about a third of Mac apps expose complete accessibility data ([MacPaw Screen2AX](https://research.macpaw.com/publications/screen2axvisionbasedapproachautomatic)), which is why both signals are combined. An internal set of about 100 real screenshots with marked targets decides the default model before launch.

**What it borrows.** HeyClicky's open source ancestor, Clicky, is MIT licensed ([farzaa/clicky](https://github.com/farzaa/clicky)): its capture that excludes its own windows, its coordinate mapping and its arrow animation are good references, with the licence notice kept. Its newer walkthroughs and target rings (since 19 Jun 2026) are closed source ([HeyClicky changelog](https://www.heyclicky.com/changelog)).

**Market.** Microsoft's Copilot Vision with Highlights already does free "show me how" pointing on Windows in every Copilot market ([Windows blog](https://blogs.windows.com/windowsexperience/2025/10/16/making-every-windows-11-pc-an-ai-pc/)), though one outlet saw it invent buttons (secondhand). HeyClicky does walkthroughs on Mac at $20 and $100 a month ([HeyClicky pricing](https://www.heyclicky.com/pricing)). Apple's Siri beta in macOS 27 reads and acts on screen content; no evidence was found that it points or walks through steps ([9to5Mac](https://9to5mac.com/2026/09/17/macos-27-golden-gate-siri-ai-top-features-apples-assistant-finally-comes-to-life-video/), secondhand). The basic pointer is a commodity; Companion's edge is reliable snapping, walkthrough continuity, trust, the character, and pricing that rides on the user's own Claude.

**Trust.** One press means one capture. Only the display under the cursor. Password managers excluded at capture time, password fields and strings that look like keys or card numbers blacked out before anything is sent ("I blurred 2 secrets before sending"), screenshots never written to disk, never auto clicking. macOS asks again roughly once a month whether Companion may still capture the screen ([Apple developer forums](https://developer.apple.com/forums/thread/765103)); onboarding explains this in plain words. Keeping screenshots off disk includes Claude Code itself: the vision session saves no transcript, and whether Claude Code keeps received images in a temporary folder is checked in M0 spike (e) **[verify]**; if it does, the founder chooses the fix before Show me how is built (`docs/milestones/M0-spikes.md`).

## 6. Do the work: Build mode and the trust core

**Drive (Builder).** Breaks a request into short steps, shows the plan for approval or editing, runs each step through Claude Code via the Agent SDK, takes a snapshot before each step, proves each step, and continues without asking unless a stop condition hits. Bringing the project's editor or terminal to the front, or editing a project file yourself, pauses it within about a second ("take the wheel"); Companion never reads keystrokes to do this. One click or hotkey resumes. At a real fork (a library, the data model, a design direction, anything not undoable) the character leans out once with two or three options and a recommendation; the answer is saved as a decision so the same question is never asked twice.

**Stop conditions and the fix loop breaker.** The Builder stops and asks after three failed fixes on the same error (offering a different approach, an undo, or a question), when a step exceeds its time or cost budget, when a change lands outside the step's files, or before anything on the always ask list.

**Rescue (Rescuer).** Given an existing folder, within two minutes it says what it thinks the project is, what works, what is broken (root cause in two sentences), and a finish plan of three to seven steps that starts with one click.

**Ship (Shipper).** Runs a safety gate (leaked keys in code and in what the browser downloads, Supabase or Firebase tables without row level security, missing login protection on private pages), deploys a preview, runs the browser smoke check against the preview, then offers "Make it live", an approval that cannot be undone and says so. Rollback is one click. It drafts a launch post and adds a removable "built with" link.

**Research (Researcher).** Answers what the build needs (APIs, libraries, limits, pricing) with cited notes saved into project memory, visibly. It never writes code and never signs in anywhere.

**Proof (Reviewer).** On every "done": install, build, lint and tests by exit code; then the dev server; then a headless browser smoke check (page loads, clean console, no failed requests, the changed flow clicked through); then a screenshot judged against the request, shown as evidence and never as the only pass signal. Claude Code Desktop does the same by default, verifying after every edit ([Claude Code Desktop](https://code.claude.com/docs/en/desktop)). A step that edits or skips tests is flagged. Finally, a second model reviews the change against the request (briefly for small diffs, fully when it touches login, payments, data migrations, secrets or deploy settings) and can send it back with a reason, as the Master PRD required.

**Undo, receipts, timeline, house rules.** A whole project snapshot before and after every step, stored outside the project so Companion's own machinery never writes the user's git and folders without git still get undo; agent commands that would change the user's git (commit, checkout, reset and similar) need approval. Every task ends with a receipt: files read and changed, commands run, sites visited, models used, estimated cost, and a "not undoable" list (deploys, pushes, emails, database writes). The timeline per project shows every event with undo. Corrections become house rules that every agent follows.

**Why structure beats instructions.** Replit's agent deleted a production database during a code freeze despite instructions ([eWeek](https://www.eweek.com/news/replit-ai-coding-assistant-failure/)). Companion's safety lives in code that runs before every tool call, not in the prompt.

## 7. Notice for you: Where was I, recaps, Loop Closer, Pattern Catcher

All four are built only from what the user gave Companion: its own task log, folders the user granted, and sources the user connected. None of them reads the screen, keystrokes or other apps.

**Where was I (Alpha).** When the user returns after a while (default 30 minutes, configurable) and a task was running or finished while they were away, one card shows up to three lines: what you were doing, what finished, what waits on you, and a Continue button. Claude Code ships a similar one line recap capped at 400 characters ([Claude Code](https://code.claude.com/docs/en/whats-new/2026-w17.md)). Labelled as AI written and easy to turn off, the lesson from Apple pausing its news summaries after an invented headline ([The Decoder](https://the-decoder.com/apple-pauses-ai-generated-news-summaries-after-serious-accuracy-issues-surface/), secondhand).

**Recaps (v1.1).** End of session and weekly: shipped, fixed, decisions waiting, time and estimated cost.

**Loop Closer (v1.1).** Catches things you started and did not finish, and offers to close them. Three kinds of loops:

1. **Stalled projects** in folders you granted: a project that had activity and went quiet for weeks gets a one line nudge and a Rescue offer.
2. **Promises you made to Companion** ("remind me to add payments after the demo").
3. **Promises in your messages,** once you connect a source: "You told Riya you'd send the deck Friday." It drafts the follow up and suggests a time. It never sends without a tap.

How it finds promises: only messages **you sent** in the last 14 to 30 days; a cheap keyword filter, then the model extracts who promised what, to whom, by when, with the quoted sentence; then it checks whether the promise was already kept (the deck was attached later) and drops it if so; then it shows at most three high confidence items a day, each with the quoted sentence as its receipt. Precision is the main risk: in Microsoft Research's study, commitments were about 5% of email sentences and the best model reached an F1 of about 0.8, with human annotators agreeing only at alpha 0.73 ([Microsoft Research, WSDM 2019](https://microsoft.com/en-us/research/uploads/prod/2019/01/AzarbonyadWSDM2019.pdf)). Microsoft itself retired commitment based task suggestions in Outlook and Viva in 2024 and moved to the simpler "no reply after 24 hours" signal (secondhand). So v1.1 starts as something the user pulls ("what did I promise this week?") and an opt in daily digest, never a pop up mid task.

**Sources, by cost.** Free first: your requests to Companion and its own history; folders you grant; Google Calendar (classed as a "sensitive" scope with lighter review, per a secondhand guide); Apple Mail on the Mac; connectors the user adds themselves (for example Granola or Wispr Flow meeting notes). Gmail needs Google's restricted scopes (`gmail.readonly` and `gmail.compose`), which require a yearly third party security assessment; our estimate from the examples found is about $540 to $4,500 a year and roughly 6 to 10 weeks end to end ([Google restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification); [Orbis](https://meetorbis.com/blog/how-we-passed-google-casa-tier-2-with-claude), vendor). Until then an unverified Gmail connection is capped at 100 users with a warning screen ([Google](https://support.google.com/cloud/answer/7454865)), so verified Gmail is a v1.2 project. Outlook through Microsoft Graph needs free publisher verification. Slack's terms limit apps outside its Marketplace to one history request per minute ([Slack](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps)). Personal WhatsApp has no legal API; users can paste or export a chat instead.

**Pattern Catcher (v1.1).** Notices work you keep repeating and offers to do it for you. Sources, best first: your own requests to Companion (three or more similar asks over two or more weeks), Companion's own run history (the same tool sequence again and again), file activity in folders you granted (every Monday a PDF lands and a sheet changes), and connected sources. Each suggestion shows its evidence ("you asked me this on 3, 10 and 17 Sept"). On approval it becomes a saved task that runs with a strict allowlist and can never send, pay or delete without a tap; where the steps are fixed, it is compiled into a plain script the user can read. Optional later: a "show me once" mode where the user demonstrates a task while Companion watches that task only, with a visible indicator and automatic stop, which is how UiPath and Power Automate task recording work ([Microsoft Learn](https://learn.microsoft.com/en-us/power-automate/task-mining-overview)).

**The honest weakness.** Most repetitive work happens inside app interfaces, between apps, which is exactly what screen watching tools record. Without watching, Pattern Catcher sees fewer patterns, later, and only through what the user connected. That trade is deliberate: fewer suggestions, each one trustworthy and explained. Expect a minority of connected users to get a useful suggestion in their first month (an estimate to measure, not a fact).

**Why "pull before push".** The market punishes unasked proactivity. HeyClicky removed its proactive agents and "all the local activity tracking" within weeks ([HeyClicky changelog](https://www.heyclicky.com/changelog)); Instinct users complained on 5 Oct 2026 about unsolicited shopping suggestions drawn from personal history ([Runtime Wire](https://runtimewire.com/article/instinct-unsolicited-shopping-recommendations-noah-shinn-commissions), secondhand); Meta's Muse for Mac already offers permissions with an audit trail ([Unite.AI](https://unite.ai/meta-launches-muse-mac-app-with-file-messages-and-calendar-access), secondhand), so receipts alone are not a moat.

## 8. Grow with you: Explain, memory, and Tutor later

**Explain (Alpha, on by default for Curious).** After each task, two or three plain "why" bullets under the result and one optional one tap check question. Built on Claude Code's Explanatory and Learning output styles, which work in Agent SDK sessions and can be custom files ([Claude Code output styles](https://code.claude.com/docs/en/output-styles)). The evidence says explanations matter only when the user does something with them: in Anthropic's January 2026 study of 52 engineers, people coding with AI scored 50% against 67% on a comprehension quiz, and those who asked follow up or conceptual questions kept their learning ([Anthropic](https://www.anthropic.com/research/AI-assistance-coding-skills)).

**Tutor (Later, Learn mode).** "Do it with me": the companion does the routine parts, pauses at one real decision per task, explains the options, lets the user choose (for non engineers usually a decision, not code), then comments on the choice, with a "show me" escape after one try. Offered at moments that fit, because an opt in tutor behind a button gets ignored: in a two year trial, students barely used Khanmigo and gained no more than without AI ([NBER](https://www.nber.org/papers/w35620)).

**Memory (Alpha).** Plain files the user can read: project memory (goals, stack, decisions, house rules, what "done" means), a "how I work with you" profile, and short lived session notes. Project memory may be filled in from the granted project folder and agent runs (stack, scripts, decisions, Researcher notes), always visibly and with its source, so there is never a setup form. The profile is learned only from explicit signals inside Companion: questionnaire answers, approvals and rejections, undo clicks, corrections, stated preferences. A "What I know about you" page groups it (preferences, how you like answers, your projects, things you've learned), shows where each line came from, and has Edit and Forget on every line, plus Pause, Erase all and an "off the record" switch for a single task. A small toast ("Remembered: you prefer short updates. Undo") appears whenever something is saved. Never saved: health, money, relationships, moods, anything from other apps or the screen. This mirrors how the Claude app and ChatGPT present memory ([Claude memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context); [ChatGPT memory](https://help.openai.com/en/articles/8590148-memory-faq)) and keeps Companion on the productivity side of the companion chatbot laws.

## 9. Remote approvals: decisions from your phone

A home screen web app with push notifications works on iOS 16.4 and later without an Apple developer account ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). It shows progress, sends "needs you" decisions, and accepts approvals and new requests. An optional Telegram bot offers approve and deny buttons but is not end to end encrypted ([Telegram Bots FAQ](https://core.telegram.org/bots/faq)), so it gets summaries only and can approve only low risk actions; going live and anything not undoable need the encrypted phone app. The relay stores only ciphertext. The laptop must stay awake while agents run; cloud continuation is out of scope for v1.

## 10. What Companion can see, and when

This table is the privacy promise. Every permission is asked the first time the feature needs it, never at install, with one plain sentence and a "Continue" button.

| Feature | What it reads | When | Mac permission | Where it goes |
|---|---|---|---|---|
| Build, Rescue, Ship | Project folders the user picked | While an agent works | None beyond the user picking the folder | Claude on the user's own account; deploy host on the user's own account |
| Take the wheel | Which app is in front and file changes in the project folder (not what you type) | While Drive runs | None | Nowhere |
| Presentation mode | Whether a call app is in front and whether the camera or microphone is in use (not any content) | Always, unless turned off | None | Nowhere |
| Build proof | Screenshots of the app being built, in a headless browser (never your screen) | After each step | None | Stored with the receipt; used for the timelapse |
| Prompt help | The focused text box, or selected text | Only on the hotkey | Accessibility | Claude on the user's own account; not stored |
| Show me how | One screenshot of the display under the cursor, secrets blacked out | Only on the hotkey, and during a walkthrough the user started | Screen Recording (re asked by macOS about monthly) and Accessibility for snapping | Claude on the user's own account; never written to disk |
| Voice | Microphone audio | Only while the hotkey is held | Microphone | Transcribed on the device; only text leaves |
| Type by voice (F26) | Microphone audio; which app is in front and which element has the keyboard (never the box's text) | Only while the Type key is held, light first | Microphone and Accessibility, each asked on first use | Transcribed on the device; the words are pasted into the focused box, never sent; refused in password boxes and never-read apps |
| Review of changes (M52, M57) | The names of files that change in the one project folder picked; for a review, their changed lines with keys hidden (settings and key files never read). The key check reads only the added lines. History keeps file names, never text | Watched while the review setting is not Off. The key check runs when the files settle, without a tap, while its own switch is on. A review runs only when asked, or by itself with Automatic | None | The key check: nowhere, on the device. A review: Claude, keys hidden. History rows on the device, 90 days unless changed, removed by delete all |
| Risky packages (M79, T18) | The project's own package lists in the review's snapshots, read on the device for the names and exact versions of packages a change added or moved | Only as a review runs on a change to a package list, while "Check new packages for known problems" is on (usual), never with Checks only | None | Each package's ecosystem, name and version (never code, file names or contents) to OSV.dev, Google's public database of known problems; answers kept on the device for a day |
| Where was I, recaps | Companion's own task log, and what the review of changes holds in memory (files changed, a Fix this first still open) | On return or at session end | None | Claude on the user's own account (Where was I itself is written by code, with no model) |
| Loop Closer, Pattern Catcher | Companion's own history; folders and sources the user connected, per source and per purpose | On a schedule the user set, or on request | Per source (for example Calendar, Mail automation) | Snippets to Claude on the user's own account; index stays on the device |
| Memory | What the user told or corrected inside Companion | Always, visibly | None | On the device |

No continuous screen capture, no keystroke logging, no reading other apps' content outside these rows, no training on user data, and a privacy page that shows everything stored with delete all.

## 11. Ideas we considered and dropped (do not bring back without asking)

| Dropped | Replaced by | Why |
|---|---|---|
| A calm glow or dot as the only presence | Abstract characters with identities and skins | Founder decision; characters carry the brand and make several agents readable |
| A setup "Brief" form before anything works | Memory without forms; optional questionnaire | Kills first session value |
| "Next Move" suggestion cards with Send, Edit, Skip through a wrapper command, earning autonomy slowly | Drive mode agents from day one; Prompt help for when the user prompts their own tools | Founder decision: agents from day one |
| Managed credits by default, Companion paying for models | Bring your own Claude | Anthropic's terms forbid paying for or reselling usage in products that run Claude Code |
| A Claude login inside Companion, or touching Claude tokens | The user's own key, cloud credential, or sign in through Anthropic's own flow | Anthropic's terms |
| WhatsApp for remote control or as a Loop Closer source | Phone web app and Telegram; "paste or export a chat" | Meta's ban on general purpose assistants; no legal personal API |
| The names Autopilot, Pilot, Copilot, Clicky, Jarvis, Sidekick, anything like Claude | Drive mode; names to be chosen | Taken or risky |
| India first, Windows first, rupee only pricing | Global, Mac first, regional pricing | Founder decision |
| App Store or Microsoft Store as the main channel | Direct download | Founder decision |
| YC as a goal shaping the plan | Building for users | Founder decision |
| Passive screen watching, activity tracking, unasked proactive suggestions | Hotkey only capture, connected sources only, pull before push | HeyClicky removed it after users felt watched; Recall and Rewind backlash |
| Checkpoints as commits in the user's own git repo | Snapshots in a separate shadow store | Polluted history and committed `.env` files in the prototype |
| General screen chat as the headline feature | Show me how as focused how to guidance with pointing | Commodity, and not the promise |
| Life admin agents (bookings, shopping, errands) | Not planned | A war of giants (Instinct, Muse, ChatGPT, Microsoft) |
| A voice engine of our own, or paid cloud speech | On device open source transcription; works with Wispr Flow and macOS Dictation | No per minute cost; no model bills |
| "AI friend" framing, affection mechanics | Productivity only | Companion chatbot laws and Character.ai and Dot lessons |
| Vercel as the only first host | Cloudflare by default for static sites, Vercel for Next.js with the user's own token | Vercel's free plan is non commercial; Cloudflare's free tier allows commercial use |
| Cash referral and free credits for shared timelapses | Give a month, get a month | No model credits exist to give under bring your own Claude; simpler |
| Detecting take the wheel by reading keystrokes | Frontmost app and file changes | No keystroke access, no permission |
| Memory synced to the cloud in v1 | Local only; opt in sync later | Privacy and cost |

## 12. Market as of 6 Oct 2026: giants own single features, nobody owns "finish what you start"

September 2026 was the month the platform owners arrived. Apple began a beta of Siri AI in macOS 27 on 14 Sept, letting Mac users ask about anything on screen, in English first and with some regions excluded at launch ([Apple Newsroom](https://www.apple.com/newsroom/2026/09/siri-ai-a-profoundly-more-capable-and-personal-assistant-is-here/)). Meta shipped Muse for Mac on 18 Sept ([TechCrunch](https://techcrunch.com/2026/09/18/metas-muse-hits-mac-letting-the-ai-take-actions-on-your-computer/)). Microsoft launched Copilot Autopilot and Copilot Code on 25 Sept ([Gizmodo](https://gizmodo.com/microsoft-thinks-its-finally-figured-out-copilot-this-time-2000817460)), and OpenAI launched its Dots agents at DevDay on 29 Sept ([OpenAI](https://openai.com/index/devday-2026-recap/)). Each owns one slice: acting on the computer, seeing the screen, building apps in a browser, pointing at buttons, or improving a prompt. Companion must never position on any single slice. Its lane is one trusted character on your screen that gets your things finished, with proof, across the tools you already use.

| Competitor | What it is (Oct 2026) | Platforms, price | Overlap with Companion | Gap Companion fills | Threat |
|---|---|---|---|---|---|
| **HeyClicky** (YC Spring 2026) | Voice buddy by the cursor that points, explains, runs walkthroughs with target rings, spawns agents; named "Clickys" since 12 Sept; v1.0.53 on 2 Oct ([changelog](https://www.heyclicky.com/changelog)) | Mac only, Windows waitlist; Free, $20, $100 ([pricing](https://heyclicky.com/pricing)); claims 25,000+ users (vendor reported) | Show me how, voice, characters, agents | Verify and ship a codebase; Prompt help with project context; Windows; bring your own Claude pricing | High: same form factor |
| **Microsoft Copilot** (Vision Highlights, Autopilot, Code) | Free "show me how" pointing on Windows in every Copilot market ([Windows blog](https://blogs.windows.com/windowsexperience/2025/10/16/making-every-windows-11-pc-an-ai-pc/)); a named, taggable avatar; Copilot Code makes "apps, trackers, dashboards and workflows" ([Gizmodo](https://gizmodo.com/microsoft-thinks-its-finally-figured-out-copilot-this-time-2000817460)) | Windows, M365; usage billed | Show me how on Windows; app building | Local project ownership, proof, neutrality, Mac | Medium to high |
| **Apple Siri AI (macOS 27)** | On screen awareness and app actions in beta ([Apple](https://www.apple.com/newsroom/2026/09/siri-ai-a-profoundly-more-capable-and-personal-assistant-is-here/)); Writing Tools can rewrite text system wide ([Apple](https://support.apple.com/en-gb/guide/mac-help/mchldcd6c260/mac)) | Mac beta, English only | Screen questions; generic text rewriting | Pointing walkthroughs (not found), coding agents, project memory, Windows | Medium: sets free OS level expectations |
| **Meta Muse for Mac** | Agent acting in Mail, Messages, Calendar, Notes, files with an audit trail ([TechCrunch](https://techcrunch.com/2026/09/18/metas-muse-hits-mac-letting-the-ai-take-actions-on-your-computer/)) | Mac; no pricing published | Loop Closer style help | Building and shipping software; no passive data appetite | Medium |
| **Instinct** | Texting based personal agent that follows up on dropped threads; raised $1B at $10B on 28 Sept 2026 ([The SaaS News](https://www.thesaasnews.com/news/instinct-raises-1b-series-c), secondhand) | Invite only | Loop Closer | Building; privacy posture (users complained about unsolicited suggestions, secondhand) | Medium for v1.1 |
| **OpenAI Dots, Codex, ChatGPT Work** | Always on agents; ChatGPT Work builds web apps on every plan including Free ([The Next Web](https://thenextweb.com/news/openai-chatgpt-work-agent-launch)) | Mac and Windows | Building | Presence, proof, local projects, neutrality | High: free and good enough for many |
| **Claude Code Desktop** | Verifies automatically after every edit; worktrees, Dispatch, Remote Control ([Claude Code Desktop](https://code.claude.com/docs/en/desktop)) | Mac and Windows | Build mode | People who never open a developer tool; presence; Prompt help and Show me how in every app | High: supplier and competitor at once |
| **Lovable, Emergent, Bolt, Replit** | Browser builders; Lovable past $600M annualized revenue ([TechCrunch](https://techcrunch.com/2026/09/24/lovables-annualized-revenue-crosses-600m-as-vibe-coding-takes-off/)); Emergent a unicorn ([TechCrunch](https://techcrunch.com/2026/07/15/indian-ai-coding-startup-emergent-becomes-a-unicorn-just-over-a-year-after-launch/)) | Web | Building | Local projects; finishing and securing their output | Medium: rival at the start, feeder at the finish |
| **Prompt improvers** (Console improver, Playground Optimize, Bolt, Augment, PromptAI 360, Prompt Enhancer) | One click or hotkey prompt rewriting, free to $8 a month (section 5) | Web, Mac, Windows | Prompt help | Project context, target aware output, part of a larger companion | Low as a business, high as a feature commodity |
| **Wispr Flow** | System wide dictation, $2B valuation (Aug 2026) | Mac, Windows, mobile; Pro $12 to $15 ([pricing](https://wisprflow.ai/pricing)) | Voice | Overlaps on dictation since F26 (30 Oct 2026); Squibby's promise is still fix it with proof | Low |

**Churn is a signal.** Sonnet 5.5 launched on 28 Sept at $2 and $10 per million input and output tokens ([The New Stack](https://thenewstack.io/claude-sonnet-55-launch/)), and single features commoditize within weeks. What no platform builds: a neutral companion that serves people who never open a developer tool, owns their project end to end, proves the work, and wraps the commodity helpers (pointing, prompt help, voice) around one memory and one trust layer.

## 13. Demand evidence: non engineers build at scale and stall before "live"

Non engineers already pay for AI building. Lovable reported a $500M run rate in June with **80% of builders self identifying as non technical** ([The Next Web](https://thenextweb.com/news/lovable-build-economy-500m-arr-vibe-coding)), and passed $600M by September ([TechCrunch](https://techcrunch.com/2026/09/24/lovables-annualized-revenue-crosses-600m-as-vibe-coding-takes-off/)). Emergent reached $100M ARR in eight months with about 70% of users having no coding experience ([TechCrunch](https://techcrunch.com/2026/02/17/emergent-hits-100m-arr-eight-months-after-launch-rolls-out-mobile-app/)). Microsoft's Copilot Code now targets the same person, which confirms the segment.

The stall is real but mostly anecdotal. One investor blog says non technical founders typically hit trouble at "roughly 80% completion" and burn credits in debugging loops ([Valueadd VC](https://valueaddvc.com/blog/vibe-coding-for-non-technical-founders-what-theyre-actually-building-in-2026), secondhand). The hard data is on safety: Lovable's `CVE-2025-48757` exposed data in about 10.3% of 1,645 scanned apps ([SentinelOne](https://www.sentinelone.com/vulnerability-database/cve-2025-48757/)), and the Q2 2026 scan attributes 96% of critical findings to RLS misconfiguration ([securityscanner.dev](https://securityscanner.dev/reports/2026-q2)).

The helpers have their own demand signals. Users keep asking ChatGPT and Cursor for an "improve prompt" button (forum threads, secondhand), and paid Mac apps sell exactly that. HeyClicky claims 25,000+ users for a voice and pointing buddy (vendor reported). Wispr Flow says it has "millions" of users (company reported, via [Fortune](https://fortune.com/2026/08/17/wispr-2-billion-valuation-dictations-only-the-beginning/)).

**Gaps to close with our own data:** what share of AI built projects are abandoned and why; whether Prompt help measurably reduces redo loops; whether Loop Closer suggestions are precise enough to keep on. Companion's interviews, rescue logs and accept rates should produce all three.

## 14. What failed before: watching, overclaiming, free users and one supplier

| Case | What happened | Lesson built into Companion |
|---|---|---|
| **Clippy** | Turned off by default in 2001, removed in 2007; unrequested help that never learned from dismissals ([Mental Floss](https://www.mentalfloss.com/article/504767/tragic-life-clippy-worlds-most-hated-virtual-assistant)) | Speak only when summoned, on state changes, or with a finished gift; remember dismissals |
| **Windows Recall; Rewind** | Recall was delayed a year and relaunched opt in and encrypted ([Axios](https://www.axios.com/2025/04/25/microsoft-recall-ai-pc)); Rewind was bought by Meta and its capture shut down ([9to5Mac](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/)) | Never record continuously; screen only on a hotkey |
| **HeyClicky proactive agents** | Shipped 6 Jul 2026, removed with all activity tracking within weeks ([changelog](https://www.heyclicky.com/changelog)) | Loop Closer and Pattern Catcher use connected sources only, pull before push |
| **Microsoft commitment suggestions** | Outlook and Viva suggested tasks from commitments, retired in 2024 (secondhand) | Precision first; at most three items a day, each with its quoted evidence |
| **Grammarly, Wispr Flow trust complaints** | Grammarly called a "keylogger"; Wispr Flow questioned for reading keystrokes (secondhand) | Hotkey only reading, per app consent, visible indicator, no content logs |
| **Replit production database deletion** | Agent deleted a production database during a code freeze ([eWeek](https://www.eweek.com/news/replit-ai-coding-assistant-failure/)) | Structural dev and prod separation; ask before destructive steps; honest receipts |
| **Lovable RLS exposures** | `CVE-2025-48757` | RLS and secrets checks in the ship gate |
| **Humane, Rabbit** | Far below sales targets ([9to5Mac](https://9to5mac.com/2024/08/07/humane-ai-pin-woes-worsen-as-recent-returns-exceed-sales/); [9to5Google](https://9to5google.com/2024/09/26/rabbit-5000-people-use-the-r1-daily/)) | Tie the product to recurring jobs, not novelty |
| **Builder.ai; Cluely** | Humans did the "AI" work ([Wikipedia](https://en.wikipedia.org/wiki/Builder.ai)); Cluely's CEO admitted a false ARR claim ([TechCrunch](https://techcrunch.com/2026/03/05/cluely-ceo-roy-lee-admits-to-publicly-lying-about-revenue-numbers-last-year/)) | Show the real agent log; never inflate a number |
| **Kite; Vibe Kanban** | Users who would not pay ([GIGAZINE](https://gigazine.net/gsc_news/en/20221121-kite-close/); [Vibe Kanban](https://vibekanban.com/blog/shutdown)) | Charge early; keep free useful but separate from paid value |
| **Windsurf; Cursor and OpenAI; OpenClaw** | Supplier access cut ([The Register](https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546)) | Follow vendor terms to the letter; plan a second engine |
| **Dot, Character.ai** | Dot shut down; Character.ai banned open ended chat for under 18 users ([TechCrunch](https://techcrunch.com/2025/09/05/personalized-ai-companion-app-dot-is-shutting-down/)) | Productivity tool, never an "AI friend" |

What changed since those failures: models handle short, verifiable tasks; non engineers pay at scale; abstract characters are accepted again. What did not change: privacy tolerance, the unreliability of long autonomous runs (the best model completes 20.6% of OSWorld 2.0's long tasks, [arXiv 2606.29537](https://arxiv.org/html/2606.29537v1)), and how fast platforms absorb single features.

## 15. Business model: charge for the companion, never for the model

### The engine rule, quoted

Anthropic's legal page covers "preinstalling or running Claude Code in your products or services", and the Agent SDK runs the Claude Code binary it bundles. Running Claude Code in a product requires agreeing to Anthropic's Commercial Terms of Service. Such products must not modify the binary or "remove, disable, or restrict any authentication method built into it", and "may not pay for, resell, or intermediate Claude usage on their end users' behalf"; each end user authenticates with their own key, subscription or cloud credential, and "That usage is billed directly to the end user". The same page says developers building products, "including those using the Agent SDK, should use API key authentication through Claude Console or a supported cloud provider", and that Anthropic does not permit them to offer Claude.ai login in their own apps "or to route requests through Free, Pro, or Max plan credentials on behalf of their users". They may not "collect, store, or intermediate Claude.ai credentials or session tokens", but this does not prevent "an end user from signing in to the unmodified Claude Code binary with their own Claude subscription". Anthropic may enforce these rules "without prior notice" ([Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), verified 6 Oct 2026, rechecked 7 Oct 2026). The SDK overview adds: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK" ([Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)).

### What follows

1. **v1 is "bring your own Claude".** The API key route (kept in the OS keychain) and cloud credentials are allowed without question and must be the polished default. The subscription route (the user signs in through Anthropic's own flow in the unmodified binary) sits awkwardly beside the SDK overview's sentence and the legal page's own developer sentence, and it would also power non coding features like Prompt help and Show me how. **Get written confirmation from Anthropic before launching the subscription route**: send a written request through contact sales (the legal page's own instruction) and a Console support ticket, and count only a reply from a named Anthropic employee, not a bot. Ship the route behind a switch that can be turned off remotely. Branding may say "Powered by Claude", never "Claude Code".
2. **The company never pays for or marks up model usage.** Running costs shrink to a phone relay and update hosting per user, plus fixed costs: Apple's $99 developer program, Windows signing and a $9 Rive seat. Voice runs on the device, so it adds no cost either.
3. **Every feature spends the user's Claude.** Prompt help, Show me how, recaps and Loop Closer all use the user's plan or key. Use small, fast models for small jobs, show estimated cost on receipts, and let users cap spend on API keys.
4. **Managed credits are a later, separate decision**, requiring Companion's own agent loop on the Messages API and Anthropic's written terms.

### Pricing hypotheses (Curious)

| Tier | Price hypothesis | Includes |
|---|---|---|
| **Free** | $0 | One character; Prompt help; Show me how; voice; Builder, Rescuer, Researcher and Reviewer with proof up to a real browser check (install, build, tests, dev server, browser smoke check); one project shipped with the safety gate, preview and live; undo; Where was I; Explain; memory; receipts for the last 7 days. All on the user's own Claude |
| **Plus** (replaced 29 Oct 2026 by F25: Free and Pro $10 a month, $8 yearly) | $8 a month or $72 a year; students 50% off; automatic regional pricing (for example about ₹299 a month in India, payable by UPI through the merchant of record) | All characters and skins; screenshot evidence and a second model review on top of the browser check every user gets; unlimited ships with rollback; phone approvals; project shelf and parallel projects; timelapse; full receipt history; from v1.1 Loop Closer, Pattern Catcher and recaps |
| **Team** | About $20 per seat a month, only after teams ask | Shared policies, audit trail, team view |
| **Campus** | Per student per semester, sold to colleges, Later | Learn mode for every student, mentor seats, class dashboard |
| **Credits** | Not offered in v1 | Managed model usage for people without Claude; after Anthropic confirms |

Anchors: HeyClicky charges $20 for Pro ([pricing](https://heyclicky.com/pricing)) but pays its own model costs; Prompt help apps charge $7.99 a month (vendor). Plus sits low because it stacks on a Claude plan of about $20 ([Claude pricing](https://claude.com/pricing)). Free carries the daily habit features (Prompt help, Show me how, voice), as the Blueprint planned, because they cost Companion nothing and bring people back daily; Plus carries finishing and shipping. Test with a fake door, then a direct ask with a payment link. A merchant of record handles global tax (Fanout uses Dodo, [fanout.sh/pricing](https://fanout.sh/pricing)).

### The cost this moves onto the user

"Bring your own Claude" makes Companion cheap to run and harder to start: a student without a Claude plan must buy one or create an API key before the first agent runs. Onboarding must detect an existing login, explain the options with honest costs, cap spend on any API key, and run a demo before anything is connected. **"Engine connected" is a first class funnel metric.**

## 16. Go to market for a zero audience founder: borrow distribution, then earn it

Rishabh starts with about 900 LinkedIn followers and about 10 on X. That is survivable. Fanout's founder had about 3,300 X followers and still reached 337,966 views on launch day, with a friend's story post adding 236,970 ([X](https://x.com/notsurajgaud/status/2089313794271183033); [X](https://x.com/dhruvalgolakiya/status/2089326053164736627)); confirm with the friend which accounts and product he means before copying anything. Instinct's founder had 74 followers in early July 2026 before a widely watched launch ([frontrun.vc](https://www.frontrun.vc/blog/instinct-250m-series-b-flagged-founder/)). Measure installs and first ships, never views: Cluely reportedly turned a 49M view video into fewer than 100 downloads (secondhand).

**Channels.** X is the main stage: a short, unedited clip most days showing something real (a stuck project going live, a prompt rewritten, an arrow walking someone through Vercel), plus a weekly numbers post. LinkedIn, the largest existing audience, gets a weekly founder post with real numbers. Instagram Reels and YouTube Shorts carry a named weekly series of the characters at work. Reddit runs in parallel: two to four weeks of genuinely helpful comments in r/vibecoding, r/ClaudeAI, r/SideProject and r/macapps before any post, always disclosing "I built this" ([Redship](https://redship.io/blog/reddit-self-promotion-rules)).

**Hooks to test.** "You describe it. It builds it, checks it and ships it." "Every project you abandoned is one conversation away from live." "Press one key and it shows you where to click." "It rewrote my prompt using my own project, and Claude got it right first time."

**Launch circle and invite only beta.** 15 to 30 classmates, alpha users and builder friends, each with a personal story angle, posting in the first hour. Beta by invitation with five invites per user ([Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/)). One community space (Discord) seeded with alpha users first.

**Referral and changelog.** Give a month, get a month (Wispr Flow's model, secondhand). A removable "built with" link on shipped projects. A weekly plain language changelog that credits the reporting user by first name, as HeyClicky did across about 40 releases ([changelog](https://heyclicky.com/changelog)).

**Later.** Product Hunt and Hacker News once each, prepared: Product Hunt after roughly 500 followers and a few hundred waitlist emails; paid acquisition only after activation works. Claim every handle the day a name is chosen.

## 17. Metrics and validation gates: count finished things, not views

| Stage | Metric | Early target (hypothesis) |
|---|---|---|
| Acquisition | Installs per 1,000 clip views | Track from day one |
| **Engine** | Installs that connect a Claude key, cloud credential or subscription | 60%+; fix this drop off first |
| **Activation** | First verified ship (proof passed, preview live) within the first day, or a first accepted Prompt help or completed Show me how within the first session | 40%+ of engine connected users |
| Habit | Active 3+ days a week in week 4; second project shipped within 14 days | Flat retention above zero across three cohorts |
| Paid | Free to paid | Mid single digits early ([RevenueCat via TechCrunch](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows): AI apps average 8.5% trial to paid) |
| Growth | Weekly actives or revenue | 5 to 7% a week good, 10% exceptional ([Paul Graham](http://paulgraham.com/growth.html)) |

**Feature health.**

| Feature | Metric | Starting target |
|---|---|---|
| Prompt help | Share accepted without edits; redo loops per task before and after | 50% accepted; measured drop in redo loops |
| Show me how | Walkthroughs completed; pointer landed on the right element (internal eval and user thumbs) | 80%+ on the internal eval before launch |
| Voice | Share of requests spoken | Track; no target |
| Build | Steps passing proof first time; undo rate; false "done" rate | Rising; falling; near zero |
| Loop Closer | Share of surfaced items marked useful; follow ups sent | 60%+ useful or turn it down |
| Pattern Catcher | Suggestions accepted; saved tasks still running after a month | Track |
| Explain | Check questions answered | Track |

**Trust metrics.** False "done" rate, undo rate, share of steps undoable, approval latency, safety gate catches, permission grants and revocations per feature, incidents. Tolerance for data loss or a leaked secret is zero; any incident halts feature work until fixed and explained publicly.

**Mode gates.** Learn, Work and Team start only after the previous release retains: AI subscription apps retain worse than non AI apps (annual retention 21.1% against 30.7%, [RevenueCat via TechCrunch](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows)).

## 18. Roadmap: one foundation, sliced releases

Dates are targets for a solo founder working mostly through Claude Code; the gates matter more than the dates. The technical milestones behind this are in section 18 of `technical_research.md`.

| Phase | Window (target) | Scope |
|---|---|---|
| **0. Spikes and interviews** | Oct 2026, weeks 1 to 2 | Retire the riskiest unknowns across the whole tool: non activating panel over full screen apps; signed sidecar with Anthropic's binary untouched; Claude login detection; reading and pasting into other apps' text boxes; one screenshot plus a snapped pointer; on device voice; fast model latency. Written questions to Anthropic. 15 interviews with stuck non engineers, and the Blueprint's "be the companion yourself" test: for a week, write the next prompts by hand for 3 to 5 builders and see whether at least 3 ask for it again |
| **1. Private alpha (Mac)** | Late Nov 2026 to Jan 2027; first testers install signed builds with hand held setup and get Drive and Rescue in late Nov, Prompt help and Show me how in Dec, the polished first run in Jan | One character with all states and cards; ask box and voice; Prompt help; Show me how; Drive, Rescue, Research, proof, undo, receipts, house rules; Ship with safety gate, preview and live; memory page; Explain; Where was I; questionnaire; signed and notarized DMG; 10 to 20 users |
| **2. Invite only beta** | Jan to Mar 2027 | Full character set and skins; phone approvals; project shelf, parallel projects, timelapse, launch post; Plus billing; referral; changelog with credits; Windows build on the same codebase |
| **3. v1.1: Notice for you** | Q2 2027, after the beta retains | Loop Closer and Pattern Catcher on free sources (Companion history, granted folders, Calendar, Apple Mail, user added connectors); recaps; Gmail unverified for up to 100 beta users |
| **4. v1.2 and Windows public** | Mid 2027 | Verified Gmail (security assessment) and Outlook; Windows signed public build; second engine decision |
| **5. Learn, then Work, then Team** | 2027 onward, each behind its gate | Tutor and mentor features; Analyst and meeting to actions; Supervisor and team policies; managed credits decision |

## 19. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Anthropic reads the subscription route as offering claude.ai login, or enforces without notice | Medium | High | Written confirmation before launch; API key and cloud routes work regardless; never touch tokens; remote switch; plan a second engine |
| Activation friction: users without a Claude plan cannot start | High | High | Demo before connection; honest cost explanation; API key with spend cap; managed credits later |
| Doing many things at 60% | High | High | One foundation, sliced releases, feature health metrics, kill or trim features that miss targets |
| Platforms absorb single features (pointing, prompt help, verification) | High | Medium | Never sell a single feature; win on the combination, project memory, trust and the characters |
| Permission fatigue (Accessibility, Screen Recording monthly re prompt, Microphone) | Medium | Medium | Ask at first use only; explain the monthly macOS prompt; every feature works without the others |
| Trust backlash ("keylogger", "watches me") | Medium | High | Hotkey only, visible indicators, per app consent, no content logs, privacy page, "never watches" as the pitch |
| False "done" from proof false positives | Medium | High | Exit codes and browser checks decide; screenshots are evidence; detect test edits |
| Destructive actions or shipped insecure apps | Medium | Very high | Snapshots, sandbox, approvals, ship gate, dev and prod separation, honest "not undoable" labels |
| Loop Closer noise or a wrong promise surfaced | Medium | Medium | Sent mail only, closure check, three a day, quoted evidence, pull before push |
| Gmail verification cost and delay | High | Medium | Free sources first; unverified beta for 100 users; budget the assessment for v1.2 |
| Pattern Catcher finds little without watching | High | Low | Position as a bonus, show evidence, optional "show me once" recording |
| HeyClicky ships Windows and a builder | Medium | Medium | Different job (finish and prove), project memory, Windows on the same codebase, bring your own Claude pricing |
| Vendor churn breaks integrations | High | Medium | Pin SDK versions; adapters; upgrade deliberately |
| Solo founder bandwidth | High | High | Strict slices, the product helps build itself, a GTM cofounder or founder's office hire |

## 20. Open questions, in priority order

| Question | Why it matters | How to resolve |
|---|---|---|
| Does Anthropic accept the subscription route (sign in to the unmodified binary through Anthropic's flow, then SDK sessions, including non coding features)? | Decides whether subscription users can use Companion at launch | Written request through contact sales (the legal page's own instruction) and a Console support ticket; keep the named employee's reply. Draft in `docs/outreach/` |
| Should a fourth way to connect, Anthropic Console sign in (`claude auth login --console`), be offered so users can pay by API usage without Companion handling a key? | Less key handling for Companion and the user, but the fast lane cannot use the direct API path on this route | Founder approved testing it in M0 spike c (7 Oct 2026); offer decided in M1 |
| What would managed credits require? | Removes activation friction | Anthropic sales, after the alpha |
| Do pasted improved prompts work as well as typed ones in Claude Code, which labels pasted text? | Prompt help quality in the most important target | Spike in M0 |
| Which model points most accurately at our latency budget? | Show me how quality | Internal eval of about 100 screenshots |
| Will non engineers pay $8 on top of a Claude plan, and which features push them to Plus? | Core revenue assumption | Fake door, then a direct ask |
| What share of stuck projects can the Rescuer fix unaided? | The core promise | Collect 10 real stuck projects and measure |
| Is a local only desktop app reading Gmail and sending snippets to Claude subject to Google's security assessment? | Loop Closer cost | Ask Google in the verification submission; plan as if yes |
| Does macOS 26 or 27 enforce the pasteboard privacy prompt? | Prompt help fallback path. Apple removed the developer preview switch in the macOS 27.2 betas without saying why | Spike on macOS 27.0.x, where the switch still exists; repeat on 27.2 |
| How should users under 18 be handled globally? | Consent and safety obligations | Decide before the public beta |
| Final product, path and character names | Brand and handles | Shortlist, clearance, claim handles on one day |
| How do Cloudflare and Vercel sign in work for a third party desktop app? | The default hosts are decided; their auth flows are not | Spike both |
| Legal before the public beta: privacy policy, terms, GDPR, India's DPDP Act, Google's Limited Use rules for Gmail, a minimum age | Required before strangers use it | Draft with templates, then a lawyer review |

## 21. Geeked path: parked

The Geeked (Pro) path, for engineers already running Claude Code, Codex or Cursor, is parked while the Curious path is built. The earlier research verdict stands for when it resumes: it is real but modest, it gets about a fifth of total effort, its wedge is a cross vendor proof and review queue followed by a quota guard, the dock and approval inbox are free table stakes, and memory sync and pull request babysitting are skipped. The full research lives outside this repo in "Pro mode for engineers". **8 Oct 2026 (F15):** the shared memory swarm (one memory that all of a user's agents read and write) is added to this parked path as a Pro plan idea. **What the build must do now:** nothing Geeked specific, keep memory plain files and vendor neutral, but keep the event protocol vendor tagged and the proof engine independent of how an agent was started, so a hooks based observer can be added later without a rewrite.

## 22. Sources

| Topic | Key sources |
|---|---|
| Engine, terms and SDK | [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance); [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview); [Agent SDK TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript); [Agent SDK MCP](https://code.claude.com/docs/en/agent-sdk/mcp); [Costs](https://code.claude.com/docs/en/costs); [Output styles](https://code.claude.com/docs/en/output-styles); [Voice dictation](https://code.claude.com/docs/en/voice-dictation.md); [Claude Code Desktop](https://code.claude.com/docs/en/desktop) |
| Prompt help | [Anthropic prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices); [Claude Code best practices](https://code.claude.com/docs/en/best-practices); [OpenAI prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering); [Anthropic prompt improver](https://claude.com/blog/prompt-improver); [OpenAI Optimize](https://help.openai.com/en/articles/9824968); [Augment](https://docs.augmentcode.com/cli/interactive/prompt-enhancer); [Apple Writing Tools](https://support.apple.com/en-gb/guide/mac-help/mchldcd6c260/mac); [PromptAI 360](https://www.promptai360.com/download); [Prompt Enhancer](https://promptenhancer.online/) |
| Show me how | [farzaa/clicky](https://github.com/farzaa/clicky); [HeyClicky changelog](https://www.heyclicky.com/changelog); [HeyClicky pricing](https://www.heyclicky.com/pricing); [Claude vision coordinates](https://platform.claude.com/docs/en/build-with-claude/vision-coordinates); [MacPaw Screen2AX](https://research.macpaw.com/publications/screen2axvisionbasedapproachautomatic); [Apple forums 765103](https://developer.apple.com/forums/thread/765103); [Windows blog on Copilot Vision](https://blogs.windows.com/windowsexperience/2025/10/16/making-every-windows-11-pc-an-ai-pc/); [9to5Mac on macOS 27](https://9to5mac.com/2026/09/17/macos-27-golden-gate-siri-ai-top-features-apples-assistant-finally-comes-to-life-video/) |
| Voice, learning, memory, law | [whisper.cpp](https://github.com/ggml-org/whisper.cpp); [Handy](https://github.com/cjpais/handy); [Apple SpeechTranscriber](https://developer.apple.com/documentation/speech/speechtranscriber.md); [Wispr Flow MCP](https://docs.wisprflow.ai/articles/9551372685-connect-an-mcp-client-to-wispr-flow-remote-mcp-server); [Wispr Flow pricing](https://wisprflow.ai/pricing); [Anthropic on AI and coding skills](https://www.anthropic.com/research/AI-assistance-coding-skills); [NBER Khanmigo trial](https://www.nber.org/papers/w35620); [Claude memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context); [ChatGPT memory](https://help.openai.com/en/articles/8590148-memory-faq); [MoFo on NY and CA laws](https://www.mofo.com/resources/insights/251120-new-york-and-california-enact-landmark-ai); [Appcues](https://www.appcues.com/blog/user-onboarding-surveys) |
| Loop Closer, Pattern Catcher | [Google restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification); [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes); [Google unverified apps](https://support.google.com/cloud/answer/7454865); [Orbis on CASA](https://meetorbis.com/blog/how-we-passed-google-casa-tier-2-with-claude); [Slack rate limits](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps); [Microsoft Research on commitments](https://microsoft.com/en-us/research/uploads/prod/2019/01/AzarbonyadWSDM2019.pdf); [Power Automate task mining](https://learn.microsoft.com/en-us/power-automate/task-mining-overview); [Runtime Wire on Instinct](https://runtimewire.com/article/instinct-unsolicited-shopping-recommendations-noah-shinn-commissions); [Unite.AI on Muse](https://unite.ai/meta-launches-muse-mac-app-with-file-messages-and-calendar-access) |
| Market | [Apple Newsroom](https://www.apple.com/newsroom/2026/09/siri-ai-a-profoundly-more-capable-and-personal-assistant-is-here/); [TechCrunch on Muse](https://techcrunch.com/2026/09/18/metas-muse-hits-mac-letting-the-ai-take-actions-on-your-computer/); [OpenAI DevDay](https://openai.com/index/devday-2026-recap/); [Gizmodo on Copilot](https://gizmodo.com/microsoft-thinks-its-finally-figured-out-copilot-this-time-2000817460); [TechCrunch on Lovable](https://techcrunch.com/2026/09/24/lovables-annualized-revenue-crosses-600m-as-vibe-coding-takes-off/); [TechCrunch on Emergent](https://techcrunch.com/2026/07/15/indian-ai-coding-startup-emergent-becomes-a-unicorn-just-over-a-year-after-launch/); [The SaaS News on Instinct](https://www.thesaasnews.com/news/instinct-raises-1b-series-c); [The New Stack on Sonnet 5.5](https://thenewstack.io/claude-sonnet-55-launch/) |
| Proof, safety, characters, remote | [securityscanner.dev](https://securityscanner.dev/reports/2026-q2); [SentinelOne CVE-2025-48757](https://www.sentinelone.com/vulnerability-database/cve-2025-48757/); [eWeek on Replit](https://www.eweek.com/news/replit-ai-coding-assistant-failure/); [Rive pricing](https://rive.app/pricing); [Rive reduced motion](https://rive.app/docs/editor/accessibility/reduced-motion.md); [ScienceDirect review](https://www.sciencedirect.com/science/article/pii/S2451958826002940); [WebKit Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/); [Telegram Bots FAQ](https://core.telegram.org/bots/faq); [respond.io on WhatsApp](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban) |
| Failures and GTM | [Vibe Kanban](https://vibekanban.com/blog/shutdown); [The Register](https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546); [Fanout launch](https://x.com/notsurajgaud/status/2089313794271183033); [frontrun.vc on Instinct](https://www.frontrun.vc/blog/instinct-250m-series-b-flagged-founder/); [Redship](https://redship.io/blog/reddit-self-promotion-rules); [RevenueCat via TechCrunch](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows) |

The detailed research notes behind sections 4 to 8 (with every source opened and each claim labelled official, vendor or secondhand) are kept outside the repo in "Companion curious path research".

## Conclusion

The Curious path is one companion with four jobs: it does the work, it helps you use AI better, it notices for you, and it grows with you. Each job alone is being commoditized by a platform: Microsoft points at buttons for free, Anthropic and OpenAI improve prompts for free, Claude Code verifies its own edits, Muse and Instinct chase your loose ends. None of them puts all four behind one trusted character, on your own computer, that knows your project, proves its work and never watches you. That combination, not any single feature, is the product.

The engine rule makes it cheap to run and moves the hard part into the first five minutes, where a non engineer must connect Claude before seeing any magic. So the build priorities are, in order: a foundation that every feature can stand on (panel, engine, memory, trust), an honest and fast first run, and then the features in the order of section 18, each measured against its own health metric. If Build earns retention through verified ships and the hotkey helpers earn a daily habit, every later mode inherits a trusted companion. If they do not, no number of characters or features will rescue it.
