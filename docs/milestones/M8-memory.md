# M8: Shared memory, Explain and Where was I. Plan for approval

**Status:** waiting for the founder's approval. No code until approved. **Written:** 9 Oct 2026. **Source:** technical doc section 11 and the M8 row in section 18; product doc section 8 (Grow with you) and section 10 (what Companion can see); decisions F15 (shared memory is third in the launch order, logic first), T14 (plain files plus SQLite), T10 (the fast lane), rule 15 in `AGENTS.md`. The onboarding questionnaire and first run demo are left out on purpose (F15 says onboarding comes later).

## What M8 is

Today Companion forgets everything between tasks, except the house rules file and the task history. M8 gives it one memory that every part uses: Build mode, Prompt help, Rescue and Research all start knowing what you are making and how you like to work. You can read all of it, see where each line came from, fix it, or forget it. Nothing is hidden and nothing leaves your Mac.

## Split into two parts

**M8a: the memory itself (this plan's first half).**
1. **Project memory** (`.companion/project.md` in the project): goals, the stack and how to run it, decisions, what "done" means, deploy targets. Filled in from the project folder and from what agents did, always with its source ("from package.json", "from the plan you approved on 9 Oct"). No setup form.
2. **Your profile** (`profile.md` in Companion's own folder): how you like to work. It learns only from things you do inside Companion: approving or refusing, pressing Undo, editing what an agent wrote, saying "shorter" or "never touch the auth folder". Capped near 200 lines.
3. **Session notes** (`.companion/session.md`): short lived notes for one Drive run, cleared when it ends.
4. **Using it:** the project memory and profile are added to every agent's instructions, and to Prompt help's context. Claude Code's own hidden auto memory stays off, so nothing is remembered where you cannot see it.
5. **The shared `AGENTS.md`** (decided by the founder): Companion writes a plain `AGENTS.md` in the project, plus a `CLAUDE.md` whose first line is `@AGENTS.md`, so the tools people code with all start from the same facts: Claude Code, Cursor, Codex, Copilot and VS Code, Windsurf, Zed and others that read `AGENTS.md`. Tools with their own file name (for example Gemini CLI, which looks for `GEMINI.md` unless told otherwise) get a one line file that points to `AGENTS.md`, added only if the founder agrees per tool. Rules for this file:
   - It holds **project facts only**: how to run, build and test, the stack, conventions, the "never touch" list, and house rules. Nothing from your profile, nothing personal, no keys or `.env` values, because the file travels with the project and may be shared or published.
   - **It never overwrites or edits a file you already have.** If a project already has an `AGENTS.md` or `CLAUDE.md`, Companion asks first and, if you agree, adds one clearly marked section at the end that it can later remove. If you say no, it leaves the file alone and keeps its memory only in `.companion/`.
   - It is kept in step with `.companion/project.md`, so the two cannot disagree, and the page shows when it was last written.
6. **The "What I know about you" page:** every line shows its source and date, with Edit and Forget. Pause (keep it, learn nothing new), Erase all (asks first), Export as a readable file. A small toast with Undo for ten seconds whenever something new is saved.
7. **Off the record:** one switch for a single task that neither reads nor writes memory and leaves nothing in the timeline.
8. **Decisions saved** (the piece left over from M4a): when you answer a fork, the answer is saved so you are never asked twice.
9. **Things memory must never hold:** health, money, relationships, moods, and secrets or `.env` values. This is code, not a promise: a filter refuses to save them, with tests (rule 15).

**M8b: Explain and Where was I (after M8a is approved and working).**
- **Explain:** after a task, two or three plain "why" bullets under the result and one optional check question. It costs a few extra words, and the card says so.
- **Where was I:** when you come back after a while (30 minutes by default) and something ran or finished while you were away, three lines: what you were doing, what finished, what waits on you. It reads only Companion's own task history, and says "From your tasks with Companion only".

## How we'll know it worked

Tests first for the risky parts (rule 17), run after every change:
- every memory line has a source and a date, and Forget really removes it from the file;
- text about health, money, relationships, moods, and anything that looks like a key, password or `.env` value is never saved, in a long list of examples, including sneaky wording;
- the profile learns only from explicit signals: a screen reading, another app's text or a voice recording can never become a line (a test checks there is no such path in the code);
- an off the record task writes nothing to memory, the timeline or the task log's content columns;
- Pause stops learning but keeps lines; Erase all removes the files; Export is readable;
- the 200 line cap trims the oldest low value lines, never silently drops a house rule;
- a damaged or hand edited file is still read, or reported in plain words and left alone, never overwritten;
- memory is injected for Drive, Rescue, Research and Prompt help, and not for an off the record task;
- the shared `AGENTS.md` never contains anything from the profile, and never overwrites or edits an existing file without asking;
- Claude Code's own auto memory stays off (the agent's startup report shows no memory tool);
- Where was I appears only after an absence with activity, and uses only task log rows.

Then a real run with you (about 20 minutes, one step at a time): build something small, watch lines appear with their sources, forget one, see that the next task no longer knows it, and run one off the record task.

## What I need from you

1. **Approve this plan,** including leaving the questionnaire and first run demo for later.
2. **Two small choices** (I recommend the first in each):
   - Where the project memory lives: `.companion/project.md` inside the project (travels with the folder, easy to read), or only in Companion's own folder (nothing added to your projects). I recommend inside the project, because `.companion/` is already protected from agents.
   - Whether to also write the shared `AGENTS.md`. **Decided by the founder on 9 Oct 2026: yes, write it**, so any editor or command line tool a person codes with can read the project facts. Project memory lives inside the project (`.companion/project.md`), also decided on 9 Oct.
3. Nothing to install or download. Real Claude is used only for the fast lane that drafts "why" bullets and the three lines, in M8b, with small limits on the test login.

## Time

About **5 to 7 working days** for M8a and **3 to 4** for M8b, mostly on my own. You are needed for the approval, the two choices, and one short try out at the end of each part.

## Risks and plan B

- **Memory that is wrong or creepy.** Every line shows its source and can be forgotten, learning can be paused, and the filter is strict. If the filter is too strict, it skips a line, which costs little. If it is too loose, that breaks rule 15, so strict wins every tie.
- **A project with its own `AGENTS.md` or notes.** Companion never edits them. Its own memory stays in `.companion/`.
- **Too much memory makes agents slower or dearer.** A size cap on what is added to each task (about 2,000 words), and the most relevant lines first.
- **A hand edited file.** Read it as is; if it cannot be understood, say so in plain words and keep the original.

## Approval

Say **approved** (and your two choices if different from my recommendations), and I will start with the tests for the sensitive-content filter and the memory file reader.
