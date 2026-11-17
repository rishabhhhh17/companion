# M103: Catch agents reaching for saved logins

Status: plan approved by the founder on 15 Nov 2026 ("Yes, build it all", for the whole M97 to M109 plan as written). Built 17 Nov 2026. Not committed. Nothing is spent: no model call of any kind, no key, no account. Fixtures, temporary folders and the real hook commands run with `sh` only.

From "Catch agents reaching for saved logins" (the 15 Nov plan, Part 2).

## Why (from the plan, sources seen 15 Nov 2026)

- An agent hijacked by hidden instructions can quietly read your logins, and nothing in the guard catches it today.
  - `runner/src/guard.ts` judges only destructive and live commands, and reads only `tool_input.command`.
  - So `security find-generic-password`, `dump-keychain`, or reading `~/.aws/credentials` or `~/.claude/.credentials.json` pass unseen.
  - Squibby's own runs are covered (`safety.ts` SYSTEM_TOOLS, `secretfiles.ts`).
  - A real example of an agent sent to the Keychain: the Jules "Turndown" export prompt (jules.google/docs/changelog, 29 Oct entry, seen 15 Nov 2026). That flow is legitimate and Jules is closing, so it is not a rival to beat. It shows why the answer is ask, not block. "No orchestrator warns about this" is unconfirmed, so it is not claimed.

What the person gets: if any AI tool tries to read saved passwords or login files, Squibby says so in plain words. Where the tool allows asking, it asks first.

## What to build (from the plan)

1. A "saved logins" class in the guard:
   - `security find-*-password`, `dump-keychain` and `export`
   - reads (`cat`, `less`, `head`, `cp`, and the file read tools) of any path `isBuiltInSecretFile` matches, plus `~/.claude/.credentials.json` and `~/.config/gh/hosts.yml`
   - match on words and paths only, and never open the file or the Keychain item (rule 2)
2. Read the file path field of each tool's read hook shape, not only the command field.
3. Ask first in Claude Code, Cursor, the VS Code agent and Antigravity.
4. In Codex, Gemini CLI and Windsurf, let it run by default, then show a notch note and a History row. A Settings switch (safe default: note only) can block instead, so the person's own export flows never break silently.

## Tests first (from the plan)

- Each command form is caught.
- False positives are not: a project file named `credentials.ts`, `grep security`, a `security` folder.
- The guard never reads file contents.
- Each tool's hook shape is handled.

## Rules it must hold

Rules 2 and 12, and the guard's own rule of never silently breaking the person's session (customizable everything).

Pitch: "Stops a hijacked agent from quietly grabbing your logins."

## How it works (as built)

- **Words and paths only.** `runner/src/savedlogins.ts` judges a command (through `shell.ts commandsOf`, so `sh -c`, `eval`, `$(...)` and `sudo` are seen through) and a file read tool's path. The Keychain: `security find-*-password`, `dump-keychain`, `export` (not `list-keychains` or `--help`). Files: programs that show, copy, pack or send a file (cat, less, head, tail, cp, scp, base64, grep, curl `@file` and `-d@file`, editors and `open` (vim, vi, nano, emacs, code, open), a `<` redirect and the like, and the paths named in an inline script: `python -c`, `node -e`, `ruby -e`, `perl -e`, looking only at words with a slash or starting with `.`, `~` or `$HOME`, never a bare word like credentials) naming a path `isBuiltInSecretFile` matches, or a home login file: `~/.claude/.credentials.json`, `~/.config/gh/hosts.yml`, `~/.git-credentials`, `~/.docker/config.json`, `~/.kube/config`, gcloud credentials, Keychain files. Code and templates with those names (`credentials.ts`, `secrets.py`, `.env.example`) are not. The module imports nothing that reads files or starts programs, and a test checks that.
- **The read tools reach the guard.** `guard.ts parseRead` takes only the path and folder from Claude Code's `Read` (`file_path`), Gemini CLI's `read_file` (`absolute_path` or `file_path`), the VS Code agent's `read_file` (`filePath`) and Antigravity's `view_file` (`AbsolutePath`, [verify]). The matchers are now `Bash|Read` (Claude Code), `run_shell_command|read_file` (Gemini CLI) and `run_command|view_file` (Antigravity). Codex stays on `Bash` (it reads through its shell). Cursor's `beforeReadFile` is deliberately not used: it hands the hook the file's contents (rule 2). A guard already turned on shows as "a newer version" in Settings (M85's stale mark); the person presses Update on the saved copy signal in Settings, and the Update card now says what the new line does about saved logins.
- **Ask, tell or block.** The setting `safety.savedLogins` (ask, block, note, off; default ask). Ask: Claude Code, Cursor, the VS Code agent and Antigravity ask the person, with the reason; Codex, Gemini CLI and Windsurf are let through and the person is told. "Let through" (outcome `ran`) means only that Squibby did not stop it: the hook fires before the tool runs, so the tool's own approval or the person may still stop it, and no word claims the read happened. Block: those three get their own "do not run" answer (`donesignal.ts GUARD_BLOCK`: Codex `permissionDecision: "deny"`, Gemini CLI `decision: "deny"`, Windsurf `decision: "block"`), and the ask tools still ask. Tell me only: nothing asks or stops about saved logins, but a command that also touches a live system is still asked about (M85), and the login read is kept as let through. Off: nothing. A closed or slow Squibby still never blocks: every hook ends with its tool's own go on.
- **Said and kept.** `guard.asked` now carries `kind: "login"` and `outcome` (asked, ran, blocked), and `tool`: each guard request is named `<token>.<pid>.<tool>.ask` (or `.block`), so the note says which AI tool it was; an older hook has no tool and says "your AI tool". History keeps it as an ask row (status `login_*`, the tool as agent `tool:<id>`, never counted as a live system ask in Your numbers). The pages: the notch's line for a few seconds (the tool, never the command, so a passer by cannot read it), Now's notice for the open project with the tool, the command, the reason and the next step on it, and See in History, which opens History at that row; Today; and History's row "Saved logins: <command>" with Asked you (blue), Let through (amber) or Stopped (red), the mark in that colour too, the reason and the tool.
- **Where the choice is.** Settings, Privacy, Your AI tools, Saved logins, on the main level (the label was shortened from "Saved logins in your AI tools" since the group says it). Every guard's yes card names it.

## Built

- `runner/src/savedlogins.ts` (new), `guard.ts` (`parseRead`, the login class, `.block` requests), `donesignal.ts` (`GUARD_BLOCK`, `canBlock`, matchers), `tasklog.ts`, `main.ts`.
- `protocol/index.ts` (`LOGIN_OUTCOMES`, `GuardAsked.kind/outcome`, `AskedRowView.kind/outcome`, checks), `protocol/settings.json` (`safety.savedLogins`), fixtures `m103e1` to `m103e4` in `protocol/fixtures/events.jsonl`.
- `app/src/model.ts` (`askedNoticeOf`, `askedLineOf`), `home.ts`, `safetyNet.ts`, `notchPeek.ts`, `card.tsx`, `strings.ts` (`S.guard.login`, the setting, the hook consent words now name file reads and the Block exception), `settingsPages.ts`.
- `app/src-tauri/src/runner.rs`: `m103_a_saved_logins_note_carries_its_kind_what_happened_and_words_only`.

## Tests

- `runner/test/m103-saved-logins.test.ts`: every command form caught (31 with the review's 11: `-d@file`, inline Python, Node, Ruby and Perl, `open`, vim, vi, nano, emacs, code), false positives not (27, including `credentials.ts`, `grep security`, a `security` folder, `.env.example`, `source .env`), paths for read tools, the guard never reads contents (no file access in the module, the same answer with or without the file, a sentinel never reaches an event or row), each tool's hook shape run for real with `sh` (ask in four tools, let through by default in three, block, tell me only, tell me only still asks about a live system in the same command, the tool named from the request name and an unknown one refused, off, harmless unchanged, saved copy first, closed Squibby), the setting, History and the protocol (tool only one of the seven).
- `app/src/m103.test.ts`, `app/dom/m103.test.tsx`, `runner/test/settings-registry.test.ts` (the new setting).
- Expectations changed on purpose in the review (the product changed, nothing weakened): `runner/test/m85-ask.test.ts` (the live ask event now carries `tool: "claude"`, and the test's older guard is made from the new request name); `app/src/m85.test.ts` (the tool ask row's mark is now "Asked you", and the look has `who`); `app/src/settingsPages.test.ts` (Privacy's main level gains Saved logins in your AI tools, so the main levels together may be 55, one more than 54).
- Expectations changed on purpose when built: the guard matcher in `runner/test/m77-guard.test.ts` (`Bash` to `Bash|Read`) and in `runner/test/m80-every-tool.test.ts` (Antigravity `run_command|view_file`, Gemini CLI `run_shell_command|read_file`).

## Compared with the best (17 Nov 2026)

Sources: `coderabbit.md`, `heyclicky.md`, `orchestrators.md` (15 Nov research) and the Coucou notes in the 17 Nov plan section.

| | CodeRabbit | HeyClicky | Coucou and notch monitors | Squibby after M103 |
|---|---|---|---|---|
| Notices an agent reading saved logins | No: it scans committed code for secrets (Betterleaks, TruffleHog), after the fact | No: it asks before its own agents use the Mac, not before your coding tool reads a login | Shows permission prompts and status; no rule about logins | Yes, in seven tools, before the read, by words and paths only |
| Steps for the person | Read a PR comment | Allow once, Always allow, Not now | Approve in the notch | Zero by default where the tool can ask (the ask is in the tool you are already in); zero where it cannot (a note); one Settings choice to block |
| Speed | Minutes, per PR | Instant | Instant | Answered as the hook fires (one 0.1 second poll); no network, no model |
| Words | Engineer findings | Plain | Short status | Plain: "This reads ~/.aws/credentials, a file of saved logins or keys. If you did not ask for that, your AI tool may be following hidden instructions." |
| Look and motion | GitHub comments | Notch cards | Notch ticker | The existing notch line, Now's notice, Today and History rows in the M71 look; no new motion |

Where we match: a clear ask with the reason before something sensitive (HeyClicky's Allow once pattern, done through each tool's own ask); a short note in the notch (Coucou).

Where we are better: none of the three compared here watches the person's own coding tools for login reads (whether any orchestrator does is unconfirmed, so it is not claimed); it works across seven tools; it never opens the file; it says why in plain words; and the person can choose ask, block, tell me only or off.

Gap closed here:
- History's mark for an ask was long ("Your AI tool asked you") and squeezed the reason on narrow Home; login rows and the M85 tool ask row use "Asked you", "Let through", "Stopped", and the mark is drawn in the row's own colour, so Stopped (red) and Let through (amber) read apart without the icon.
- The reason is on the notice itself, with the next step (CodeRabbit puts the why on the finding), and See in History opens History at that row, instead of "the reason is in History".
- The setting was under More options, How fixes run; it is now one press into Settings, on Privacy's main level, and every guard's yes card names it (HeyClicky keeps its permission choices close to the prompt).
- The tool is named on the notch line, the notice and the History row (HeyClicky and Coucou name the agent).
- The words say only what is known: "let through", never "read", since the hook fires before the tool runs.

Gaps left (not this milestone):
- The notch note is the existing line (hover tooltip and VoiceOver) plus Now's notice; it does not flash a card out of the notch. M113's live feed is the place for a visible notch card.
- Approving from the notch (Coucou, HeyClicky): the ask is answered in the person's own tool. M114 covers answering from the notch.
- Reading `.env` in a project also asks in Claude Code. That is the plan's rule (an injected agent sending `.env` away is the main risk), but it may be frequent for some people; Tell me only or Off is one choice away. Worth watching once real use shows how often it fires.
- Cursor file reads are not seen (its read hook carries contents); its shell reads are. Windsurf's read tool name is not documented yet.
- Words only can always be dodged: a script file the agent writes first and then runs, a path built from pieces (`"$HOME/.aw"s/credentials`), or a program not in the list. The matcher catches the common one line forms; it is a tripwire, not a wall.
- A hook written before the review has no tool name, so its notes say "your AI tool" until the person presses Update.

## [verify]

Each on a real Mac, in a throwaway practice project in a temporary folder, with a harmless stand in file (for example a `~/.netrc` made for the test and removed after, never a real login). No model spend beyond each tool's own normal use.

1. Claude Code: press Update on the saved copy signal in Settings (the newer version), ask it to read `~/.netrc` with its Read tool and with `cat`: both ask, with the reason, and History shows "Saved logins" rows with Asked you. Note whether each Read feels slower.
2. Cursor: `cat ~/.netrc` asks.
3. The VS Code agent: its read tool is `read_file` with `filePath`, and it asks.
4. Antigravity: its file read tool is `view_file` with `AbsolutePath` (unconfirmed). If not, change `READ_TOOLS` in `guard.ts` and the matcher in `donesignal.ts`.
5. Gemini CLI: `read_file` carries `absolute_path` or `file_path`; the default runs it and the note shows.
6. With Settings, Privacy, Saved logins set to Ask first, block otherwise: Codex honours `permissionDecision: "deny"`, Gemini CLI `decision: "deny"`, Windsurf (Devin) `decision: "block"`, each showing the reason; then set it back.
7. `security find-generic-password -s squibby-test -w` for an item that does not exist: Claude Code asks first; nothing is read by Squibby.
