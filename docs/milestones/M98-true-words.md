# M98: True words on screen: the F29 story, and no fake "getting ready"

Status: plan approved by the founder on 15 Nov 2026 ("Yes, build it all", for the whole M97 to M109 plan as written, including the words proposed for M98 below). Built 15 Nov 2026, tests pass. Not committed. Nothing was spent: no real model call, no key, no deploy, no account; fixtures, stand ins and temporary folders only.

The why (repo, read 15 Nov 2026): two kinds of wrong words reach customers.

- **The dead end.** With no key, `blockerOf` returns `"key"` (`app/src/homeHero.ts`). Home then says Squibby "is getting ready on this Mac ... Try again in a moment", and the setup list says "could not connect yet. Check your internet, then press Try again". The notch says "getting ready" too. Try again can never work: first run has no key step (F29) and the managed route is not live.
- **Old bring your own Claude words.** `S.google.signInLine` ("Your own Claude key keeps working without one"), the notch's "Add your Claude to start" and "Squibby uses your own Claude, never ours", and the engine's `NOT_CONNECTED` and `MANAGED_NEEDS_OWN_CLAUDE`, which tell the person to add an API key or sign in with a Claude plan.

## The founder's calls

- **15 Nov 2026: the whole plan, as written,** with the proposed words for the key blocker (they answer the open question in `docs/milestones/M69-full-fledged.md`):
  - Headline: "Fixing is not switched on for this Mac yet."
  - Line: "Checks and explanations still work. Squibby will tell you here when fixing is ready. Your project is safe."
  - Never "No AI connected", which implies the person should connect something.
- AGENTS.md rules 1 to 4 are left alone here. F29 says they change with the M100 plan.

## What to build (from the plan)

1. `blocked.key`, the notch's not connected lines, the setup list's line and the hover line: the words above, never "getting ready".
2. Remove the Try again button. Point the main button at something that works without the engine (Check my project), after confirming it runs.
3. Keep "getting ready" only for the `claudeGetting` state, where it is true.
4. Rewrite `S.google.signInLine` and the notch's not connected title and line in F29 words.
5. Reword `MANAGED_NEEDS_OWN_CLAUDE` and `NOT_CONNECTED` in `runner/src/engines.ts` (and the direct lanes' own) so they never mention an API key or a Claude plan.
6. Keep the developer key row, labelled "For developers", hidden by default behind a developer switch, with a test.
7. Delete the dead strings that could come back by accident: `obWelcome2`, `obKeyHelp`, `fr.claudeLine`, `keyPrivacy`, `keyCost`, and `honestLines` in `onboarding.ts` with its test.
8. Leave AGENTS.md rules 1 to 4 alone.
9. Fix the "Not committed" lines in the M85 to M97 docs and the old "(in progress)" CHANGELOG headings, after checking each against `git log`.

## Tests first

- `blocked.key` never contains "Try again", "key", "connect" or "sign in".
- No customer string contains "API key", "your own Claude" or "Claude plan" (a scan of every string in `strings.ts`, with an allowlist for the developer row only).
- The engine's not connected and managed route texts never contain "API key", "Claude plan" or "your own Claude".
- The developer row is hidden unless the developer switch is on.
- A homeHero test for the key blocker's words and main button.

## Built

- **The key blocker** (`app/src/strings.ts` `S.home.blocked.key`): headline "Fixing is not switched on for this Mac yet", line "Checking your project still works. Squibby will tell you here when fixing is ready. Your project is safe.", and no main button of its own.
- **One button that works** (`app/src/homeHero.ts` `blockMainFor`, wired in `card.tsx`): with a project open, Home's main button is Check my project (the project's own checks, `runner/src/agent.ts` `problemFind`, which runs the ladder with no model). With no project, the setup list leads with Pick a project. The old Try again, which only restarted the engine, is gone from Home and from the setup list (`SetupAct` has no `retry` now).
- **Not a setup step** (`app/src/setupList.ts`): fixing not switched on is no longer something the person must do, so the list ticks Ready on this Mac and moves on to the project; with a project open there is no list. The headline's line shows over the list too, since the list does not say it.
- **Calm while nothing is broken** (`blockerPose`, `heroStatusOf`): the character keeps its usual pose (the error pose only for a stopped engine or a missing part), and the status line says the project's own state (Not checked yet, Proven) instead of Needs you.
- **The notch**: `islandNotConnected`, the hover line (`S.m93.line.notReady`), the small chat (`S.m96.chat.notReady`) and the peek (`S.m84.next.notConnected`, `notConnectedLine`) say fixing is not switched on and that checking still works. `notConnectedNotice` (a marker only, never shown) says the same.
- **"Getting ready" only where true**: the `claudeGetting` headline and the setup row that waits for the part.
- **Google sign in**: "Sign in with Google to have a Squibby account. Google's own page opens in your browser."
- **The engine** (`runner/src/engines.ts`, `direct.ts`, `agent.ts`): `NOT_CONNECTED` and `NOT_CONNECTED_DIRECT` say "Squibby's AI is not switched on for this Mac yet, so this could not start. Checking your project still works, and so does Undo." `MANAGED_NEEDS_OWN_CLAUDE` is renamed `MANAGED_FIXING_OFF`: "Fixing is not switched on for this Mac yet. Checking your project, the guide and explanations still work." (true on managed usage, where the light lanes run on the sign in). The three refusals for a missing helper (pictures, Explain, Second Look) no longer say "connect Claude". Each passes through to the card as written (`plainFailure`, `plainError`).
- **The developer key row**: a new switch, `developer.tools` (Developer tools, off), in Settings, More options, Account, For developers (the topic was "For developers: your own Claude key"). The key row draws, and search finds it, only while it is on (`settingsSearch.ts` `developerShown`, `shownResults`). Removing a key a developer saved stays in the Danger zone, shown only when a key is saved.
- **Dead strings deleted**: `obWelcome2`, `obKeyHelp`, `obConnectTitle`, `obConnected`, `obKeySave`, `obPlanLater`, `addYourKey`, `home.addKey`, `setRows.setupKey`, `screens.setupWhy.key`, and the old Your Claude screen's `S.fr` words (`claudeTitle`, `claudeLine`, `keyPrivacy`, `keyCost`, `keyPlan`, `keyHow`, `keyPage`, `skipKey`, `keyNeeded`), with `honestLines` in `onboarding.ts` and its test, as the plan said. The runway ring's help no longer says "With an API key".
- **Docs**: the "Not committed" status lines in the M85 to M97 docs now say when and in which commit each was committed (checked against `git log`, each doc is in its commit); the fifteen "(in progress)" CHANGELOG headings (M58 to M80) are plain, each matched to its commit. The M69 doc's open question points here.

## Fixed after review (15 Nov 2026)

- **The status tag's colour** (`app/src/meaning.ts` `heroMeaning`, now given the blocker): fixing not switched on keeps the project's own colour (grey Not checked yet, green Proven, red only for a failing project); a part on its way is working blue. Only a stopped engine or a missing part is red. It said NOT CHECKED YET in red before.
- **No project open** (`homeHero.ts` `blockLineFor`, `setupList.ts` `readyDoneWords`): the line is "Fixing comes later. You can pick a project now and check that it works." (never "your project" when there is none), and the ticked step says "Checking is ready on this Mac", not "Ready on this Mac" under a headline that says fixing is not on.
- **No dead end after Check my project** (`homeHero.ts` `fixOffered`, `card.tsx`): while fixing is not switched on, a found problem shows Show me where and Close, no Fix it, no Why? Draw it and no "Fix what the check found" chip (each needs the model), and one line: "Fixing is not switched on for this Mac yet. Squibby will offer Fix it here when it is." The practice is left out of the setup list then, since it ends in Fix it.
- **Narrow Home** (`app/src/ui/wide.css`, `pages.css`): under 36rem the list on the left is a rail of its tiles (each keeps its name for VoiceOver), and each setup row stacks its button under its words at full width.
- **Developer tools' help**: one text, "Shows a row for a model key, for people who build Squibby itself. You never need it." The clause "Squibby pays for the AI it uses" is gone until M100 makes it true.

## A change to the approved words, and why

The approved line said "Checks and explanations still work." The plan asked to confirm what runs first. Checks do: `problemFind` runs the project's own checks with no model. Explanations do not: Explain an error and Explain each fix call the model, and with no model route they stop with the engine's not switched on sentence. So the line says "Checking your project still works." instead, and the rest is as approved. The headline drops its full stop, as every other headline on Home does. The founder can pick other words; only `S.home.blocked.key` changes.

## Expectations changed on purpose

- `app/src/auditFirstHalf.test.ts`: `S.home.blocked.key.main` is now empty (was "Try again"); the pose check reads `as={blockerPose(blocker)}`.
- `app/src/homeHero.test.ts`: the same pose line in the card's source.
- `app/src/homeInstrument.test.ts`: the key blocker's status line is the project's own (`proven` for a project that works), no longer `needs`.
- `app/src/pages.test.ts`: the setup list with the key blocker ticks Ready and opens Pick a project (was step 1 open with Try again).
- `app/src/m98TrueWords.test.ts` and `app/src/pages.test.ts` (after review): the setup list with the key blocker and no project is ready, project (step 2 of 2); it was ready, project, practice (step 2 of 3). The practice is left out on purpose while fixing is off.
- `app/src/onboarding.test.ts`: the honest lines test went with `honestLines` (plan item 7); the describe's title says so.
- `runner/test/direct-wiring.test.ts`, `direct-lanes.test.ts`, `engine-privacy.test.ts`: the not connected refusal is matched as `/not switched on/` (was `/Not connected/`), and the managed refusal as `MANAGED_FIXING_OFF`. Each checks the same refusal as before.
- `runner/test/settings-registry.test.ts`: `developer.tools` added to the defaults, with its own test.
- `runner/test/secondlook-wire.test.ts` and `runner/test/main.test.ts`: Second Look's refusal and the real engine's no key error are matched as `/not switched on/` (were `/Claude/` and `/not connected/i`).

## Not built, and why

- A practice started from Learn still offers its Fix it while fixing is not switched on; that fix stops with the engine's sentence. The setup list no longer offers the practice then (fixed after review); the Learn page waits for M100, when fixing turns on.
- A review of another AI tool's changes still sits under the key blocker on Home (mode "blocked" comes first). Unchanged here; it is how Home ranked blockers before.
- `S.obKeySteps` (dead, old key steps) is kept: an existing test reads it, and removing it would mean deleting that test.
- AGENTS.md rules 1 to 4: unchanged, as the plan says (M100).

## Tests

- `app/src/m98TrueWords.test.ts` (13): the approved words with no Try again, key, connect or sign in; Check my project as the button, only with a project; the calm pose and status line; not a setup step; Home's wiring; "getting ready" only in two places; the notch's four lines; a scan of every string in `strings.ts` (search words left out, since they are never shown) for "API key", "your own Claude", "Claude plan" and the like, with an allowlist for the developer row and its Danger zone row only; the engine's sentence reaching a card as written; Google's line; the dead strings gone; the developer row's place, switch and search.
- `app/dom/m98.test.tsx` (4): Home rendered with no model route says the words, has no Try again, and its Check my project sends `problem.find` (never `restart_engine`); the key row is not in Settings search with Developer tools off, and is with it on.
- `runner/test/m98-true-words.test.ts` (4): the three engine sentences never name a key, a plan, a sign in or connecting; each says what still works; each passes `plainFailure` as written; the helper refusals never say connect Claude.

## [verify] on a real Mac

Also in `docs/research/technical_research.md` section 20, item 43.

- A release build with no key: Home, the notch's hover line, its small chat and its peek all say fixing is not switched on, never "getting ready" or Try again.
- Check my project runs the checks to a result there.
- Fix it on what it found, and Explain an error, show the engine's not switched on sentence on the card, not Something went wrong.
- Settings, More options, Account, For developers shows only the Developer tools switch until it is turned on.

## Shots

Headless Chromium at 2x, the pages built from this tree and served with a stand in for `window.__TAURI__` (`auth.status` method none): Home wide, tall and narrow, with a project and with none, and Settings, For developers, with Developer tools off and on. Paths are in the final report.
