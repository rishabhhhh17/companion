# M85: ask before live systems, and catch what the AI hid

Status: built 14 Nov 2026, tests pass. Not committed.

The why comes from the checked research of 13 Nov 2026 (synthesis section 3), features 3, 4 and 12. The complaint ids below are the research's own (user needs, groups A, B, C and H).

## (a) Ask before live systems (feature 3)

A saved copy on this Mac cannot bring back a dropped live database, destroyed cloud resources, a production deploy or history rewritten on GitHub. The cases: A12 ("Deleted entire database on minor update", CC #27448), A13 (data lost because Claude did not ask, CC #13729), A21 (a production setup deleted, HN 47287420), and the PocketOS database lost through an API token (AIID 1469).

**What counts as live** (`runner/src/livesystems.ts`, plain rules on the command's words, no model, never reads `.env`):
- SQL that drops, truncates, or deletes or updates every row (`dbsafety.ts destructiveSql`), sent by psql or mysql to a host that is not this Mac, or to a database named only by a setting such as `$DATABASE_URL`.
- `supabase db reset --linked` or `--db-url` to a server; `supabase db push` unless `--local`.
- `prisma migrate reset` and `prisma migrate deploy` (Squibby never reads `.env` to learn the address, so it says the database "may be" live). (M85 review) `prisma db push --force-reset` or `--accept-data-loss`, and `drizzle-kit push` or `migrate`.
- `terraform` or `tofu` `destroy`, `apply` and `apply -destroy`; `kubectl delete` and `drain`; `helm uninstall`.
- `vercel --prod`, `vercel promote`, `vercel rm`; `netlify deploy --prod`; `fly deploy`, `fly apps destroy`; Railway, Heroku, Firebase and Wrangler deploys and deletes.
- `git push --force`, `--force-with-lease`, `--mirror`, `+branch`, `--delete` and `:branch`. (M85 review) `gh repo delete`, and `gh api -X DELETE` or `--method DELETE`.
- `curl`, `wget`, `http` or a `fetch` in `node -e` with DELETE or PUT to a host that is not this Mac.
- A broadly scoped key used on the line, by its setting's name (for example `SUPABASE_SERVICE_ROLE_KEY`, `AWS_SECRET_ACCESS_KEY`, `STRIPE_SECRET_KEY`, `VERCEL_TOKEN`), or a live payments key written out. Only the name is ever said.
- `aws s3 rm --recursive`, `rb`, `sync --delete`, any `aws ... delete-*` or `terminate-*`; `gcloud`, `az` and `doctl` deletes; `gsutil rm -r`.

**In the person's own AI tool.** The guard hook (M77, M80) now answers "ask" with Squibby's plain reason, so the tool asks the person. Squibby never blocks and never approves: ask is the person deciding in their own tool. Per tool, from each tool's own docs, read 14 Nov 2026:

| Tool | Ask? | What the hook prints |
|---|---|---|
| Claude Code | yes | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":…}}` |
| Cursor | yes | `{"permission":"ask","user_message":…,"agent_message":…}`, exit 0 |
| VS Code agent | yes | `{"permissionDecision":"ask","permissionDecisionReason":…}` |
| Antigravity | yes | `{"decision":"ask","reason":…}` (ask keeps the person's own Always Allow; force_ask is never used) |
| Codex | **no** | Its docs say `permissionDecision: "ask"` is "parsed but not supported yet": the hook run is marked failed and the tool call continues. Kept today's exit 0. |
| Gemini CLI | **no** | BeforeTool decisions are allow or deny (block is deny). Kept today's exit 0. |
| Windsurf (Devin) | **no** | PreToolUse decisions are approve or block. Kept today's exit 0. |

The research brief said Codex supports ask. Its docs say otherwise, so Codex keeps going on as before; this is noted here and in technical research item 30.

How it travels: a hook that can ask names its request `<token>.<pid>.ask` in Squibby's own guard folder. The engine's answer file stays empty to let the command go, or holds the reason as a JSON string; the hook then prints its tool's ask with it and exits 0. A closed or slow Squibby, an empty answer, or a hook written before M85 all end exactly as before. The reason is redacted and at most 300 characters. (M85 review) The answer file of an ask is written at once, as the snapshot of a destructive command starts, and the snapshot finishes on its own: a slow snapshot of a big project can never outlast the hook's 5 second wait and lose the ask (the person still has to answer in their tool). Each ask is said (`guard.asked`) and kept as a History row with its reason only after its answer file is written. The pages show it in the notch for 10 seconds ("Your AI tool is asking you first: <command>", in any project), as Now's notice with the command for the open project only (it goes by itself after 30 seconds, since the person answers in their tool), and as a row of Today.

A guard line written before M85 is still Squibby's and still works, but cannot ask. Settings shows it as older with an Update button; Update opens a card that says it replaces Squibby's older line in that file, and what the new one does (for a tool that can ask: it asks you first before something live; for one that cannot: it works as before), with today's lines, and only the yes writes them.

Setting: **Ask before live systems** (`safety.askBeforeLive`, on).

**In Squibby's own runs.** These commands already asked (safety.ts). Now the card says Squibby's live reason, marks the question as live, and offers only Allow once.

**HeyClicky's three choices** (its changelog, 12 Sep 2026: Allow once, Always allow, Not now) on Squibby's own Home cards: **Not now** (the safe choice, first, with the keyboard), **Allow once**, and **Always allow for this project** only where it fits. It fits only a plain read of one named file outside the project (`rules.ts alwaysLineFor`): never a command, an edit, anything destructive, live or that Undo cannot take back. The card says openly which file it would always allow ("Always allow reading plan.md (in ~/notes)"). On the yes, the engine adds the one line `allow reading <file>` to `.companion/rules.txt` as it is on disk at that moment (`rules.ts addHouseRule`, never through a link, every other line kept), then answers; it never takes a list from a page, so a rule added by hand meanwhile is never lost (M85 review). `approval.resolved` says `always: "saved"` or `"notSaved"`; if the line cannot be saved, the answer is Allow once, said plainly. The house rule is visible and removable in Settings, Checks. The engine accepts Always only for a card that offered it. An `allow reading` rule skips that one question and nothing else, never a refusal (`rules.ts allowedByAlways`). The house rules editor does not offer this kind; only the card writes it. Every answer is a History row with its reason and what was answered, naming the command or the file itself (a long path keeps its end). An off the record task keeps no ask row (its words are not kept).

Setting: **Offer Always allow for this project** (`approval.offerAlways`, on).

## (b) Two flags in the result (feature 4)

(M85 review) The flags come first on the result, in an amber block right under the headline and before Keep and Undo. A proven result with flags keeps its Proven pill (that is what the checks say), and its headline adds "but check these first".

`runner/src/review/drift.ts`, plain rules, on the receipt of Squibby's own runs:
- **Not what you asked for.** The task changed files beyond the ones the request named (when it named any; the named file's test and files in a named folder count as asked), or changed a file the request said to leave alone. C2 (CC #23067) and H1 (HN 48920537).
- **Said one thing, ran another.** A command contradicts the words the agent said just before it: undo only its own work, then `git checkout HEAD --`, `git reset --hard`, `git stash` or `git clean` (H3 and A19, the Cursor forum, 4 Sep 2026); "read only", then a write; "won't delete", then `rm`; "a dry run", then a live command for real; "only on this Mac", then a live system.

**Not built for the other tools, on purpose.** The done hook never reads its input (M75: no content travels), so Squibby does not receive another tool's request or its last message. Reading `last_assistant_message` from the Stop hook would change that promise; it is left for a founder decision. The guard already receives every shell command of a connected tool, so the "ran" half is ready when that is decided.

## (c) testguard: loosened assertions (feature 12)

B1 (CC #7074). `runner/src/proof/testguard.ts` now compares each test that still exists, by name, before and after: a check removed (expect, assert, `t.Errorf`), an exact check made loose (`toBe(5)` to `toBeDefined()`, `toEqual` to `toBeTruthy`, `toHaveLength` to `not.toBeNull`, `toThrow("x")` to `toThrow()`, `assert.equal` to `assert.ok`, `assert x == 5` to `assert x`, `assertEqual` to `assertTrue`), or a limit widened (`toBeLessThan(100)` to `1000`, a lower floor, fewer `toBeCloseTo` digits, a wider `approx(rel=)`, `assert t < 1` to `< 10`). At most five lines per file. The review of another tool's change (`review/weakened.ts`) also catches a widened limit now.

## Tests

- `runner/test/m85-live-systems.test.ts`: 62 cases, live and not live.
- `runner/test/m85-ask.test.ts`: each tool's hook run for real with sh against a real HookGuard on a temporary folder; the four asks, the three that keep going, a harmless command, the switch off, a closed Squibby, a tricky reason, an older guard line, History rows.
- `runner/test/m85-own-cards.test.ts`: where Always allow fits, the cards of Squibby's own runs with a stand in engine, the receipt's flags.
- `runner/test/m85-drift.test.ts`, `runner/test/m85-testguard.test.ts`.
- `app/src/m85.test.ts`: the three choices, the model, History rows, the older guard row.
- Protocol fixtures for Rust and TypeScript: `guard.asked`, `approval.request` with `always` and `live`, `approval.resolve` scope `project`, the receipt's `flags`, `tasks.list` `asked`, `donesignal.state` `stale`, and the `allow reading` rule cases (`houserules.rs`).
- Expectations changed on purpose, and only those: the rule kinds list now has `allow_read` (`settings-checks-registry.test.ts`); the Home card's safe choice is now "Not now" before "Allow once" (`a11y.test.ts`, `auditFirstHalf.test.ts`).
- M85 review, expectations changed on purpose: `approvalChoices` no longer takes whether the page knows the rules (the engine saves the line), so its test drops that case and `withAlwaysRule` is gone; the ask's notice is now a sentence with the command, for the open project only; an ask row's command no longer starts with "Read: "; `askedRowLook` also returns the lead and the command on their own. New tests: the engine's one line save (a rule added by hand meanwhile is kept; a linked `.companion` is Allow once), off the record keeps no ask row, the slow snapshot ask, seven more live commands, the notch line, Today's asks, the Update card, the flags before Keep, History's word breaks, and settings search.

## [verify] on a real Mac (technical research section 20, item 30)

1. Claude Code shows its own permission prompt with Squibby's reason for `supabase db reset --linked`, in default and in auto accept modes.
2. Cursor shows its ask for `beforeShellExecution` with `permission: "ask"` and the user message, with no hook error.
3. The VS Code agent reads `permissionDecision: "ask"` at the top level (its page shows that form; the Copilot hooks reference may also take `hookSpecificOutput`).
4. Antigravity's IDE prompts on `decision: "ask"` and shows the reason.
5. Codex, Gemini CLI and Windsurf: the command goes on as before, with no hook error.
6. Squibby's own runs: whether the text the agent says before a tool call reaches `lastText` before the SDK asks for the tool (the order of text and tool use in one assistant message).
