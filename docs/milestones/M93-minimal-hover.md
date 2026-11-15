# M93: A minimal notch hover, a greeting and one action

Status: built 14 Nov 2026, tests pass. Not committed. Nothing was spent on a real model: fixtures and stand ins only.

## The founder's feedback

14 Nov 2026, on the real app, with a screenshot of the M84 hover panel (Flowflow, "Hi there · Squibby practice signup page", "Not checked yet", Settings and Open, a "Connect your AI tools" row, a "Check it once to see where it stands" row, then Ask, Check my project and the key hint):

> "I don't like this, it's too much for just a notch. It just needs to be like 'Hey Rishabh' and some CTA."

This reverses M84's direction (more in the hover). The hover becomes minimal. Recorded in F32 (update of 14 Nov 2026, M93).

## What it does now

Pointing at the notch (or at the peeking character, M90) opens two rows, 106 points tall instead of 222:

1. **Flowflow's live face** beside **"Hey <first name>"**, or **"Hey there"** with no name. Under it, **at most one short line, only when it matters**: Squibby is not running, Squibby is getting ready, a line the notch must say (listening, an update), the job at work by its name, questions waiting, "Claude is waiting for you" (this project only, the same words as the notch's own line), the key warning in the changes, "2 changes to review", "A check failed", new results. Nothing when all is quiet.
2. **One action that fits the moment**, then a quiet **Open Home** in words:

| State | Line | Action | Opens |
|---|---|---|---|
| A job runs | its name | Stop | sends the stop (the only press that acts by itself) |
| Engine stopped | Squibby is not running | See why | Home on Now |
| Claude not set up | Squibby is getting ready | Open Home (alone) | Home on Now |
| A question waits | 1 question is waiting for you | Answer | Home on Now (the question cards keep their own panel) |
| Claude Code waits here | Claude is waiting for you | See what Claude asks | Home on Now (its notice) |
| No project | none | Pick a project | Home on Now (the folder picker) |
| Changes to review | 2 changes to review | Review changes | `{ do: "review" }` |
| A check failed | A check failed | Fix it | `{ do: "find" }` |
| Not checked, or changed since | none | Check my project | `{ do: "find" }` |
| All fine | none | Ask | `{ place: "ask" }` |

An action whose tool is turned off (F20 groups), or with the panel's buttons off (`panel.showButtons`), becomes Open Home alone. Stop always shows while a job works. The engine stopped and a question keep their one action whatever is off.

Same black look and tokens (M71), still borderless and non activating (no focus taken), every press through `island_go` except Stop. A question or a fresh result that opens the panel by itself is unchanged (its cards, Allow and Don't allow, Keep, Undo, See proof). The M68 opt in hello is unchanged. M90's peek opens this same panel (the shell opens the island's hover panel; nothing in it changed).

## The name

- The greeting uses the **first word** of what the person typed in **Your name** (`you.name`), cleaned: control characters, zero width and direction marks are removed (each splits the word where it was), stray punctuation at the ends goes, letters of any script stay, and a long name is cut to 16 letters with an ellipsis. Blank says Hey there.
- **Not built: reading the Mac account's full name.** The task asked for the first name from the Mac account's full name. F28 (founder decision, 30 Oct 2026) says "The name is one the person types (you.name), never the Mac account name", and the 31 Oct review removed the command that read it (`islandPanel.test.ts` pins that no `first_name` or `NSFullUserName` exists in the shell). Founder decisions are not reopened (AGENTS.md rule 19), and the founder's words ("Hey Rishabh") do not ask for the Mac name, so the name stays typed only. The founder gets "Hey Rishabh" by typing it in the first run or in Settings. Reading the Mac name needs the founder's own yes to amend F28.
- **Settings:** Your name moved from Account to **General, More options, Notch** (General's main level already holds its ten, the spec 3.4), after the peek settings. The help says the notch greets you with the first word, that only what you type is used, and that it stays on this Mac.

## Where everything else went (nothing lost)

| Left the hover | Where it is in Home |
|---|---|
| The AI tools rows, Connect your AI tools | Home's side list (M84) and Now's Connect row (M82) |
| The latest review card, its proof and Undo | Now's timeline of today (M84) and the receipt with its Undo |
| The next useful thing, the practice offer | Now's main button and Learn |
| The usage ring (M89) | **New on Now**, under the status strip: "Claude usage" and the ring (`runwayRing.tsx NowRunway`) |
| The key hint | The foot of Home's ask box (`homeLayout.ts barKeyChord`) |
| Settings and Open | Home's side list foot, and Open Home in the panel |
| The job's progress line | Home's work card |

`app/src/m93Hover.test.ts` checks each of these places exists.

## Code

- `app/src/notchMinimal.ts` (new): `firstName`, `hoverGreeting`, `hoverLine`, `hoverAction`, `hoverSecondary`, `HOVER_H`. No words (all in `strings.ts`, `S.m93`), no colours (meaning colours only).
- `app/src/islandPanel.tsx`: the hover is the head and the action row. Gone: the AI tools rows and their own ask (`donesignal.show`; the panel now sends nothing on opening), the review and next cards, the foot and key hint, Settings and Open, the runway ring, the progress line.
- `app/src/runwayRing.tsx` (new): `RunwayRing` moved here, and `NowRunway` for Now.
- `app/src/notchPeek.ts`: the M84 rows and heights (`peekRows`, `peekHeight`, `PEEK_*`) removed; `toolsRow`, `sideTools`, `todayLine` stay for Home; `latestReview` and `nextPeek` stay as tested logic, no longer drawn.
- `app/src/ui/notch.css`: two rows, 106 points; the M84 row styles removed. `ui/pages.css`: the ring on Now. `ui/tokens.css`: the unused `--peek-mark`, `--peek-line` and `--loop-progress` removed.
- `app/src/settingsPages.ts`, `strings.ts`: Your name moved; help for Your name and Pointing at the notch opens says what the panel now does.

## Tests

- `app/src/m93Hover.test.ts` (30): the name (blank, one word, full name, odd characters, very long, never read from the Mac), the line (quiet, each that matters, another project's waiting, colours), the action in every state with its arrival, tools off and buttons off, Open Home once, the height against the shell and CSS, the panel's source, words and colours out of the logic, and each removed fact's place in Home.
- `app/dom/m93Hover.test.tsx` (7): one glance in six states (two rows, one greeting, at most one line, one action, at most two buttons, one face), and the ring on Now in Home.
- **Old expectations changed on purpose** (the product changed): `notchQuick.test.ts` (the head, the action pill, island_go pins, the ellipsis rule, the greeting pin, help words, the long project name check), `islandPanel.test.ts` (Stop pin, the greeting pin, the status line view gone), `m83Notch.test.ts` and `m84Peek.test.ts` (height 106 instead of 222; the M84 rows), `island.test.ts` and `reviewEveryDay.test.ts` (new results and the key warning are the one line, from `notchMinimal.ts`), `settingsPages.test.ts` and `notchHello.test.ts` (Your name moved to General), `dom/hoverPanel.test.tsx` (each M84 test now holds the M93 equivalent: the rows are gone, the panel sends nothing, where each went), `dom/m86.test.tsx` (no review card in the hover), `dom/m89.test.tsx`, `dom/m89Off.test.tsx`, `dom/m91.test.tsx`, `dom/m91WarnAt.test.tsx` (the ring is rendered on Now).

## [verify] on a real Mac

Also in `docs/research/technical_research.md` section 20, item 38.
- The 106 point panel opens and closes under the real notch on 14 and 16 inch MacBook Pros, with no jump as a line comes or goes, and never takes focus.
- Pointing at M90's peek opens this same panel.
- The greeting and the line are cut cleanly with a long name or a long job name at every text size.
- Stop in the panel stops a real job at once.

## Shots

Served from `app/dist` with a stand in for the app (`island_state` peek on a notch), headless Chromium at 2x, 640 by 190 points, in the session's scratch folder (not committed): `m93/` with ten states (not checked, no name, changes, Claude Code waiting, check failed, all fine, job running, no project, engine stopped, a very long name). Against the founder's shot of the M84 panel (greeting with the project, a fact, Settings and Open, two rows of cards, three buttons and a key hint), each now reads as one glance: the greeting, at most one line, one button and Open Home. The panel keeps the 560 point width it shares with the question and result cards. After the review, Open Home sits at the action row's right edge so the rows span the panel instead of leaving the right half empty; narrowing the panel itself (about 360 points for the quick and job layouts, island.rs) touches the shell's window maths, needs a [verify] on a real notch, and is left for the founder to call.
