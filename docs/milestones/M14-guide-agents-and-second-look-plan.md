# M14: the guide for everyone, agents on day one, and Second Look (plan, 22 Oct 2026)

Decision: `docs/decisions/F23-three-layers-hero-guide-helper.md`. Read this and veto anything. **No UI is built here** (the look is still yours to decide); this plan is the engine and the evidence behind it.

## Update after the reality check (22 Oct 2026)
The research (`docs/research/2026-10-22-reality-check.md`, agreed by the founder: "Yeah, I like it") changes the weight of this plan:
- The guide ships as a **free front door**. HeyClicky's waves two and three (named agents, a chat window, connections, routines) **wait for evidence**; the platforms and cheap clones are covering the general guide. Agents with no project stay minimal (commodity).
- Second Look is a **contained feature**, leading with numbers and tables, risky code lines, any desktop app, and "I can't tell". Not a headline until people come back to it.
- The light features (the guide, pointing, Explain, Second Look) should call the Messages API directly, so they can be company paid now (F22 update).

## Part 1: the guide, "exactly what HeyClicky does", in an order that works

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
