# F15. Launch priorities, the Pro memory idea, the website and onboarding

- **Status:** Fixed. **Launch priorities amended by F17 (12 Oct 2026); where they differ, F17 wins.** Founder decision of 8 Oct 2026; both open points confirmed by the founder the same day. It changes the order inside the Alpha, not the product (F07 stands: Show me how stays, it just comes last).
- **Date:** 2026-10-08
- **Source:** founder message of 8 Oct 2026 (this record keeps its meaning in plain words)
- **Related:** F03, F06, F07, F10, F11, T10, T11

## Decision

1. **Build order for the launch.** Companion is for people who are coding with AI. Priority, highest first:
   1. **Do the work (agents).** Build mode is "the best part": Drive, Rescue, Proof and the rest, with the best possible Claude prompting underneath. Agents first (F03).
   2. **Prompt help while you code.** Start Companion while coding and it helps with the prompt in front of you (see "How Prompt help should feel").
   3. **Shared memory.** One memory the whole companion uses (the Memory feature, section 8 of the product doc).
   4. **Show me how (the "Clicky" pointing feature) last.** Still part of the launch scope (F07) but built after the three above.
2. **First work is the logic.** The founder wants the engine, agents, memory and Prompt help logic built before the look. The founder will provide API keys; they go in the Keychain, never in chat or the repo (F10, AGENTS.md rule 2).
3. **A website people download from:** beautiful, calm and professional. Later, not now. Direct download stays the channel (F02).
4. **A calm, professional onboarding flow:** later, not now. It builds on F05 (the optional questionnaire).
5. **The website is more than the product:** it should help Companion grow (a home for content, a changelog, a community and the "building in public" story). Scope is open and not designed yet.
6. **Pro plan idea (parked):** for people who already run agents, a **swarm of connected memory**: one shared memory that all their agents read and write, so any one of them can do the work with everything the others learned. Not built now. See "What this changes in the Geeked path".
7. **The point:** many people already have agents. Companion should make their life easier than "make an agent and let it work": the memory, the proof and the prompt quality, not another agent.

## How Prompt help should feel (the founder's picture)

- While you code, you start Companion. It can ask you questions to learn what you are building, and it can give you recommendations either as a prompt to copy, or written straight into the box you were typing in (paste back, with a diff, as today).
- You write a one or two line prompt, then press a hotkey or talk to it. It answers by typing or by voice.
- It shows recommendations in a clean, pleasing, simple style. **Not chat bubbles.** The look can be changed (a simple style or a richer one).
- It can offer "Do you want recommendations?" or "Start with prompt recommendations?" as a question.

## Where this meets the rules that never bend (both confirmed 8 Oct 2026)

- **"If it's in the middle, it's going to see everything."** Rules 5, 6 and 11 (F11) say the screen and other apps' text boxes are touched only on a user hotkey, with a visible indicator, never in the background. So Companion **cannot watch your coding and pipe up on its own**. **Confirmed by the founder: hotkey only.** Companion reads a prompt only when you press the hotkey (hold to talk counts, it is a hotkey), with the indicator lit, and then it asks "Want recommendations?". A prompt that comes up unasked after you type in another app is **not** allowed. F11 and rules 5, 6 and 11 stay as they are.
- **"It will ask me a lot of questions."** The onboarding questionnaire is capped at five optional questions (F05). **Confirmed by the founder:** Prompt help may ask short clarifying questions about the prompt in front of it. The first run questionnaire stays at five optional questions (F05).
- **GPT and other keys.** Bring your own Claude is fixed (F10). Other engines (GPT, Codex) are "Later: more engines". Nothing in the Alpha uses a non Claude key.

## What this changes in the Geeked path

F06 stays: the Geeked (Pro) path is parked and we build nothing for it now. The founder adds one idea to the parked list: **the shared memory swarm is a Pro plan feature**. Constraints so nothing blocks it later:
- Keep memory as plain files plus a local task log (T14), with a vendor neutral shape, so other agents can read it later (the product doc already lists "memory exposed as an MCP server" under Later).
- Memory rules still apply: always visible, with its source, forgettable, never health, money, relationships, moods or secrets (rule 15).
- It needs the same proof, snapshot and approval layers, so shared memory is never a way around the trust layer.

## What this means for the build

- **Spike order changes slightly.** Show me how (spike e) moves to last. Prompt help's spike (d, reading and pasting text in other apps) moves up, next to the login and fast lane spikes (c, g). Nothing else in M0 changes.
- **Alpha order inside the months:** Drive and Rescue first (the plan already had them in late Nov), Prompt help next, memory throughout, Show me how last.
- **Website and onboarding flow** are not part of M0 to M9. They get their own plan after the alpha engine works.
- Names stay placeholders (F12).

## What it rules out

- A companion that comments on your work unasked, by watching in the background (stays dropped, F11).
- Building any Pro or swarm feature now.
