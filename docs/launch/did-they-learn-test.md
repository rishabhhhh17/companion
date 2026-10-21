# Did they learn? A small test (22 Oct 2026)

**The claim to test:** when a fix teaches inside the work ("Your turn" and the two line why), people can fix the next similar problem themselves. If that is not true, the learning story is a slogan.

Why it matters: our own research says opt in lessons fail (17% understood) and teaching built into the work works (98%) (F16). That is research, not our product. This measures our product.

## Who and how many
8 to 10 people who build with AI and are not engineers. Split in two:
- **Group A (Companion as it ships):** a fix that teaches (Your turn on, the two line why, the check question).
- **Group B (the control):** the same fix with the teaching turned off (Settings: Your turn off, Explain off).
Eight people is too few to prove anything. It is enough to see whether the gap is big or nothing. If it is nothing, we have learned that cheaply.

## The session (about 30 minutes each, you silent)
1. The person opens a practice project with a stuck moment (the practice library has five; use the signup one first).
2. They use Companion to fix it. Group A gets the teaching; Group B does not.
3. **The transfer test, 20 minutes later:** a similar but different bug in a different file (a second variant of the same kind of mistake). They fix it **without Companion open**. This is the one that counts.
4. Then the questions below.

## What to write down
| Measure | How |
|---|---|
| Fixed the similar bug alone | Yes or no, and minutes it took (stop at 10) |
| Could say why in their own words | Ask: "Why was it broken?" Score 0 to 2: wrong, partly right, right. Two people score it without seeing the group |
| Confidence | "How sure are you that you could fix this again?" 1 to 5 |
| Felt taught or felt lectured | One line, in their words |
| Would use it again | Yes, no, only when stuck |

## What counts as a result
- **Real:** Group A fixes the similar bug alone clearly more often than Group B (for example 6 of 8 against 2 of 8), and explains why better.
- **Nothing:** about the same. Then teaching is not the reason to buy, and we say that to ourselves.
- **Backfire:** Group A feels lectured or slower. Then "Your turn" needs to be lighter.

## What is ready now (no spending)
- **A transfer project for each of the five practices**, in `app/sample/transfer/<practice id>/project` (each practice's
  `transfer` field in `app/sample/practices.json` points there). The same kind of mistake, in a different file with
  different names and words:
  - signup: the contact form in `site/contact.html` sends to `/api/contact`, the server listens at `/api/messages`.
  - setting: the booking page needs `BOOKING_EMAIL`, and the error does not say where settings go.
  - route: the menu page (not the home page) links to `/hours`, the page's address is `/opening-hours`.
  - import: `lib/receipt.js` (not `server.js`) asks for `./sales-tax`, now named `lib/tax.js`, with no note saying so.
  - open-table: the `shopping_lists` table has no row level security, and its owner column is `owner_id`.
- **The answers, for the observer only:** `FIX.md` beside each project (the right fix, the other right fixes, what a
  cheat looks like) and `fix.json` (the same fix, for the test).
- **One command to copy and one to check**, from the `runner` folder: `bun run scripts/transfer-check.ts copy <id>
  <folder>` makes the participant's copy without the answers; `... check <id> <folder>` says Fixed or Not fixed. It puts
  back the test and the other files the fix should not touch before checking, so editing or deleting the test never
  passes, and it names those files. For the open table it uses Companion's own database access check on the files.
- **A test that proves all of this:** `runner/test/transfer-library.test.ts` (no model, no network): every transfer
  fails as shipped with its plain words and passes after its fix, and the cheats do not pass.
- **The observer sheet, the scoring guide for "why" and the Group B settings recipe:**
  `docs/launch/did-they-learn-observer-sheet.md`.

Found while preparing: "Your turn" only offers when a fix makes the same change in two places, and every practice is
fixed with one change, so Group A will rarely see it. The difference between the groups is mostly Explain. If the
test is meant to measure Your turn too, a practice whose fix repeats one change in two places is needed first.

Honest limit: this measures one kind of mistake in a short window. It says nothing about a month later. If the gap is real, the next test is whether they come back.
