# F23. Three layers: the hero for the niche, the guide for everyone (HeyClicky class, agents on day one), and an AI helper for every LLM user

- **Status:** Amended by F28 (30 Oct 2026, default switch only): the Second Look switch (`secondLook.on`) and the Draw it switch (`drawIt.on`) now start off. The rest of this record stands. Founder decision, 22 Oct 2026. It reopens F18 item 4 ("general assistant features are not in the launch") and un-parks things F16 and F17 parked. F10's gate still applies to the model bill: see F22.
- **Date:** 2026-10-22
- **Source:** the founder, in the build session of 22 Oct 2026: "the hero product has to be where someone always does like niche, but the HeyClicky product has to be able to be used for everyone, and we also have features that make us better than HeyClicky." "I want my HeyClicky feature to do exactly what HeyClicky can do now. I don't mind having the agents run from the first day. They can be very basic agents: they can make websites, random things." "Our hero product is this. The cross sell is the HeyClicky thing, and a third cross sell is making your life easier with using AI." "Everyone with an LLM, whoever they are (CEOs, founders, engineers, non engineers)."
- **Related:** F16, F17, F18, F22, M11 (`M11-match-and-beat.md`), M14 (`docs/milestones/M14-guide-agents-and-second-look-plan.md`)

## Decision
One app, three layers, in this order of weight:

1. **The hero (the niche).** People who build with AI and are not engineers, and get stuck. "Press the key. It finds the problem on your screen, fixes it, proves it worked, and shows you why." This is the headline, what is sold first, and what must be loved before anything else matters. **Learning is built into the fix, not offered as a course:** "Your turn" is on by default (22 Oct 2026), because teaching offered separately fails (17% understood) and teaching built into the work works (98%) (F16).
2. **The guide (the cross sell, for everyone).** Everything HeyClicky does today that our rules allow: push to talk, the screen tutor that points, step by step walkthroughs, spoken replies, files you drag in, and **basic agents from day one** (build a website, make a small thing, research something). It must work for anyone, on any app, with no coding project involved. Our own parts on top: honest pointing, proof of each step, and the safety rules.
3. **The AI helper (the third cross sell).** Something that makes everyone's use of any LLM better, that HeyClicky does not do. The first is **Second Look** (check any AI answer): see M14.

## What this unlocks
The things F16 and F17 parked as "cut by founder", each a milestone of its own and not all on day one (build order in M14): persistent named agents (Clickys) with their own memory; routines (F21 already allows watch routines); app connections (Gmail, Calendar, Slack, Notion and more) and custom MCP connections; system wide dictation and typing for you anywhere; a Home chat window; character and cursor customisation; the guide's per app teaching skills; plans with bundled AI usage (F22, off until Anthropic confirms).

## What stays blocked (by AGENTS.md rules, not by the founder)
Each is a rule in `AGENTS.md`. The founder can reopen one at a time, knowing what it costs:
- Always on listening, realtime voice by default, anything that reads key events (modifier only chords, double tap, the Fn key): rules 5 and 8.
- Proactive suggestions, morning greetings, and activity tracking that watches: rules 5, 6 and 16.
- "Look back at the page you just left" (a screen history): rule 5 (captures are never kept).
- Computer use that clicks and types for you in any app or browser: held back by rule 13 (never send, pay, delete or go live without a tap); the closest allowed version is "does it with a tap on each step". Needs its own decision.
- Sending screenshots or prompts through Companion's server without saying so: F22's privacy rules.

## Built so far (22 Oct 2026)
Second Look is wired end to end on the engine's side (`docs/milestones/M14-guide-agents-and-second-look-plan.md`, Built so far): its hotkey, the read, the protocol, the daily limit, Stop, a switch, and a capped web search with sources on the plain API. Its card uses the existing panel with no new look, which stays the founder's to decide.

## Honest limits
- "Exactly what HeyClicky can do now" is a moving target; they shipped 53 versions in a few months. The aim is parity on the daily features, then pull ahead where our rules make us different (proof, undo, honest pointing, safety).
- Nothing in the guide has been tested on a real app yet. Parity is claimed only after the head to head in M14.
- The more layers, the more can break on the first day. The hero must work first.

## Revisit only if
The founder decides to.
