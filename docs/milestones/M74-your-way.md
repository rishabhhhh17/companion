# M74: your way

Status: plan written and built on m48/launch (6 Nov 2026), not committed. All four suites pass (counts in the report). The checks that need a real Mac are at the end. Shots: scratchpad m74-shots (every changed Settings page, wide and tall).

## Why

The founder: "add all the customizations". His standing rule: every behaviour gets a Settings control with a safe default. The audit of 6 Nov 2026 (section 2, Customization) found that most settings already exist but are hard to find, and that eleven behaviours have no setting at all.

## Rules this milestone keeps

- The look stays fixed (M71): Colour, Character, Layout, Text size. No new look options.
- Never a setting for a safety rule: the deny rules, the git write ban, approvals for send, pay, delete or go live, and screen and microphone only on a hotkey (rules 5, 10, 12, 13). A key in the code and open data always stop (M57).
- Every new setting is in `protocol/settings.json`, `strings.ts`, `settingsPages.ts` and `runner/test/settings-registry.test.ts`, with a safe default. A value stored before M74 always loads (no key is renamed or removed).
- No cents and no amounts where a customer looks (F29, M69). The spend warning says "most of today's limit", never a number.
- Strings only in strings.ts, colours only in tokens.css, plain words, no em dashes.
- Tests first for the logic (rule 17).

## A. Easier to find

| What | Change |
|---|---|
| How strict reviews are (`review.strictness`) | Main Fixing page, under Review changes |
| Warn at once about a key (`review.keyWarning`) | Main Fixing page. Still off by default |
| How many times to try a fix (`work.tries`) | Main Fixing page, its own group, label "How many times to try a fix" |
| When a review starts | One line under Review changes, from the wait settings ("A review starts once your files have not changed for 20 seconds, or a minute in Automatic.") |
| Keep reviews in History (`review.keepDays`) | Also said on the Privacy page, one line with a button that goes to the setting (one row per setting stays true) |
| Settings that need a project | A "Pick a project first" note at the top of a page that has a project setting, while no project is open |
| The notch (`island.*`) | The More options topic is called Notch and has one plain summary; the main Notch group gets a summary too |

## B. The missing settings

| # | Setting | Options (default) | Page | Where it works |
|---|---|---|---|---|
| 1 | `spend.warnAt` Tell me when a project nears its limit | Off, At half, Near the limit (Near the limit = 80 percent) | Account, main | Runner: after each booking, once a day per project and level, `spending.warn` (no amount). Pages: a note "This project has used most of today's limit." |
| 1b | Pause a task at an amount | Already built as `budget.task` (Most one task may spend): the task stops there and Carry on or Try again goes on. Moved to the main Account page instead of a second, overlapping setting. | Account, main | as before |
| 2 | `review.ignore` Folders and files reviews skip | Your own names or paths, on top of the built in list (empty) | Fixing, More | Runner batcher: the built in list first, then yours. Yours can never remove a built in one. |
| 3 | `review.modeHere` Review changes in this project | Same as everywhere, Ask first, Automatic, Off (Same as everywhere) | Fixing, main (project) | Runner and shell read the project's choice, else `review.mode`. Pages show the card by the same rule. |
| 4 | `app.openAtLogin` Open when you log in | Off, On (Off) | General, main | Shell (`loginitem.rs`): macOS login item (`SMAppService.mainApp`), asked of macOS before the value is saved, so a refusal leaves it off with a plain line. The page asks first. Turning it off, Restore usual, Reset all and Delete everything remove the login item. |
| 5 | `undo.keepSize`, `undo.keepAge` Safety copies | 1, 2, 5 GB (2); 7, 30, 90 days, Any age (Any age, which is today) | Privacy, main | Runner checkpoints: the size cap and an age limit. Starred saves, what History, an open card or Your turn point at, and the newest 20 are always kept. |
| 6 | `privacy.neverSend` Files never sent to Claude | Your own names or patterns, on top of the built in .env and key rules (empty) | Privacy, main | Runner `isEnvFile`: the built in rule, or one of yours. Every reader of that rule (the agent's deny hook, the sandbox, reviews, Explain, attachments) gets them. Protective: no reset removes them. |
| 7 | `review.send` What a review may send to Claude | Words and checks, Checks only (Words and checks) | Privacy, main | Runner review: Checks only never calls a model; the rules write the words and the card says so. |
| 8 | `quiet.on`, `quiet.from`, `quiet.to` Keep the notch quiet | Off (22 to 7) | General, More (Quiet hours for the notch; the main page holds ten already) | Pages (the notch page): during quiet hours the notch shows no review dot and no "changes to review" line. A key written into the code is still said. Home still shows everything. |
| 9 | `review.stopKinds` Also stop for | Sign in, Payments (none, which is today) | Fixing, More | Runner rate: a change to a chosen kind is Fix this first. Keys and open data always stop and are not on the list. |
| 10 | `review.whenNothing` When a review finds nothing | Keep it in Home, Close it quietly (Keep it in Home, which is today) | Fixing, More | Pages: Close it quietly closes a safe review with no reasons after 4 seconds; its History row says "Nothing found, closed by itself" (a new `quiet` close and `closed_quietly` row, never "you said it looks fine"). |
| 11 | `review.maxFiles` Biggest change to read file by file | 50, 200, 500 files (200) | Fixing, More | Runner rate and the batch's cap. |

Defaults that keep today's behaviour where the audit suggested a change: `review.whenNothing` (the audit said Close quietly; today the review stays, so that stays the default and Close quietly is one tap away) and `undo.keepAge` (today has no age limit, so Any age is added as the default; removing safety copies by default would delete work the person may want).

## Not built, and why

- No setting for the safety rules listed above. They stay in code.
- No second per task setting next to `budget.task` (see 1b).
- The login item is only checked in tests by its wiring; registering it needs a signed app on a real Mac.

## Tests first

- `runner/test/settings-registry.test.ts`: every new key, its default, its options, and that refused values stay refused.
- `runner/test/m74-your-way.test.ts`: ignore patterns (on top of the built in list, never removing it), the never send patterns (built in always holds), the per project review mode, the stop kinds (keys and open data always stop), the biggest change, Checks only sends nothing to a model, the spend warning (once a day per level, no amount), the safety copies' age and size (starred and guarded kept).
- `app/src/m74.test.ts`: the review start line, quiet hours (across midnight), close quietly, the project note, the Privacy line, the page places (one place per setting), and the words (no cents, no em dash).
- Rust: the login item's wiring is called from `setting_applied`, and `review_watched` reads the project's choice.

## Checks on a real Mac

- Turn on Open when you log in, log out and in: Squibby opens. Turn it off: it no longer opens, and System Settings, Login Items no longer lists it.
- Quiet hours: set them to cover now, make a change with another tool: no dot on the notch. Home still shows the card.
- A spend warning appears once when a project passes 80 percent of the day's limit.
