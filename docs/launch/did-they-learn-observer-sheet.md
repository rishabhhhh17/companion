# Did they learn? Observer sheet (22 Oct 2026)

For the person running a session of `docs/launch/did-they-learn-test.md`. Print this. One session is one person, one
practice, then its transfer project. Use the signup practice unless you have a reason not to.

## Before each session (5 minutes, before the person arrives)

1. **Set the group** in Squibby (Home, then the Settings tab, section "Memory, Explain and teaching"):

   | Setting (as it reads on screen) | Group A (as it ships) | Group B (teaching off) | Key in `protocol/settings.json` |
   |---|---|---|---|
   | Your turn after a fix | On | Off | `teach.yourTurn` (true / false) |
   | Explain after a task | Reasons and a quick check question | Off | `explain.mode` (`reasonsAndQuestion` / `off`) |

   Leave every other setting at its usual value in both groups. "Your turn after a fix" says "From the next task" when
   changed, so change it before the practice starts, not during it. Typing "your turn" or "explain" in Search settings
   finds both. Look at both again just before the person sits down.
2. **Make the transfer copy**, from the repo's `runner` folder (it copies the project only, never the answers):
   `bun run scripts/transfer-check.ts copy signup ~/Desktop/"Contact page"`
   For another practice, use its id (`setting`, `route`, `import`, `open-table`) and any new folder name.
3. Remove the practice copy from the last person (Learn tab, Remove my copy) so this person starts fresh.
4. Check Node is installed (`node --version`). Have a plain text editor and Terminal ready. Close every AI tool.

## What to say at the start (read it, the same words every time)

"Thanks for coming. This is a test of the app, not of you. First you will use Squibby to fix a small project that has
one thing wrong on purpose. Then we take a break. Then I will give you a different small project to fix on your own,
without Squibby. I will stay quiet the whole time, and I cannot help, so do what you would do if you were alone. There
are no wrong answers. You can stop any time."

## What not to say

- Nothing about the bug: never name a file, a line, "address", "setting", "link", "file name" or "table".
- Never "it is like the first one", "remember the practice" or "same as before".
- No hints, no "you are close", no nods or sighs. If they ask for help: "I cannot help with this part. Do what you
  would do on your own." If they ask whether they may use AI: "Not for this part."
- Never say which group they are in, or that there are groups.

## Timing

| Minute | What happens |
|---|---|
| 0 to 2 | The words above. |
| 2 to 12 | The practice in Squibby (Learn tab, the practice, Find what is wrong, Fix it with me). Let them read what Squibby shows. |
| 12 to 32 | The break, 20 minutes, the same for both groups: a coffee, or the background questions at the bottom. Nothing about code. Quit Squibby now (menu bar, Quit Squibby). |
| 32 to 42 | The transfer. Open their copy in Finder, say the one line for that project (below), start the clock. **Stop at 10 minutes.** |
| 42 to 47 | The questions, in order. |

A session is about 45 minutes because of the break, not 30.

**The one line to say for the transfer** (the symptom only):
- signup: "On this contact page, pressing Send shows Not found. Make Send work."
- setting: "This booking page will not start. Get it to start."
- route: "On this cafe site, go to the menu and click Opening hours: it says Not found. Make the link work."
- import: "This receipt page stopped starting after its files were tidied up. Get it to start."
- open-table: "Before going live, a check said: This table is open to anyone with your site address: shopping_lists.
  Turn on row level security for it and add the rules that say who may see what. Fix it so each person can only see
  their own lists."

They may use the editor, Finder, Terminal (`npm run dev`, `npm test`) and the browser. If they ask how to see the page:
"Type npm run dev in Terminal in that folder, then open the address it prints." Nothing else.

**When they say they are done, or at 10 minutes:** from the `runner` folder,
`bun run scripts/transfer-check.ts check signup ~/Desktop/"Contact page"`. It says Fixed or Not fixed in plain words, and
names any file they changed that the fix should not touch (the test, `package.json`, or the code that reads a setting).
The check uses the original of those files, so changing the test never passes. What the right fix is, and what a cheat
looks like, is in that practice's `evals/did-they-learn/transfer/<id>/FIX.md`. Never show FIX.md or fix.json to the person.

## What to write down

One row per person. The scorers of "why" see only the answer, never the group.

| Measure | Write down |
|---|---|
| Fixed the similar bug alone | Yes or no, from the check (not from what they say). Minutes from the one line to done, or "10+" if stopped. Any file the check named, and what they did there in a few words ("deleted the test", "put the value in the code"). |
| Could say why in their own words | Ask: **"Why was it broken?"** Write the answer word for word. Do not ask a second time or help. Scored later, see below. |
| Confidence | Ask: **"How sure are you that you could fix this again, from 1 (not at all) to 5 (completely)?"** The number. |
| Felt taught or felt lectured | Ask: **"Did the first part feel like it taught you something, or like a lecture?"** One line, in their words. |
| Would use it again | Ask: **"Would you use Squibby again?"** Yes, no, or only when stuck. |

Also write: the person's id (never a name on the same sheet as the answers), the group, the practice, the date, and
whether Squibby showed the two reasons and the question (Group A should see them, Group B should not).

## Scoring "Why was it broken?" (0, 1, 2)

Score the meaning, not the words. Plain words are full marks. A **2** says what did not match or was missing, and why
that broke it. A **1** has one of those two parts. A **0** is wrong, or only says it was broken.

| Transfer | 2 (right) | 1 (partly right) | 0 (wrong) |
|---|---|---|---|
| signup (contact form) | "The form sent the message to one address and the server was listening at another, so nothing answered. They have to match." | "The form was pointing at the wrong place." (no idea of the two sides) | "The Send button was broken." / "The server was down." |
| setting (booking page) | "It needs an email setting that was never set. Settings go in the .env.local file, not in the code." | "An email address was missing." (no idea of where settings live) | "There was an error in the code." / "It needed npm install." |
| route (cafe site) | "The link went to /hours, but the page's address is /opening-hours. The link and the page need the same address." | "The link was wrong." / "The page was missing." (one side only) | "The site was broken." / "The page did not load." |
| import (receipt) | "A file was renamed and another file still asked for it by its old name, so Node could not find it." | "It could not find a module." (repeats the error, no why) | "A package was missing." / "The tax was wrong." |
| open-table (shopping lists) | "The lists table had no row level security, so anyone could read everyone's lists. It needs it turned on and a rule that each person sees only their own." | "The table was not secure." / "It needed a policy." (no who sees what) | "The database was broken." / "A password was missing." |

Two people score every answer on their own, without the group. Where they differ, they talk and agree on one score;
write both first scores down too.

## Background questions for the break (the same for both groups)

What do you build with AI? Which AI tools do you use? When did you last get stuck, and what did you do? Have you used
Terminal before? (Write the answers down; they help explain results, they are not scored.)

## Known limits, so nobody reads too much into one result

- **Your turn will rarely show in these practices.** It only offers when a fix makes the same change in two places,
  and each practice is fixed with one change. So the real difference between A and B is Explain (the two reasons and
  the question).
- **Some words teach in both groups.** The practice card's own lines (for example "An address must match on both
  sides" on the route practice) are not settings, so Group B sees them too. The setting practice is a lesson, which
  teaches by its steps in both groups. Prefer the signup practice.
- The transfer projects live in the repo (`evals/did-they-learn/transfer`), not in the app, so a participant cannot find
  the answers inside Squibby. Give participants the copy that `transfer-check.ts copy` makes, never the repo folder.

**Update (22 Oct 2026): Your turn now shows on the route practice.** Its home page has the same broken link twice (the menu and a button), so Squibby fixes one and offers the second as Your turn; tested end to end with the real checks (`runner/test/practice-e2e.test.ts`, "Your turn on the route practice"). **Use the route practice for both groups**, so Group A gets the whole learning loop (Your turn, the two line why and the check question) and Group B gets none of it. The transfer test for it is `evals/did-they-learn/transfer/route`.
