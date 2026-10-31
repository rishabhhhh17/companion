# Results: the practices without Node (31 Oct 2026)

**Answer: yes, with Bun's own test runner, not through the practices' npm scripts.** Run on this Mac (macOS 27, Apple Silicon) with Bun 1.4.2, the version `stage-engine.sh` pins, copied the way the app's engine holds it. Every command ran in the safety box for checks with only this Mac's own addresses, and with a tool path that had no `node` and no `npm`.

## What was run and what happened

| Tried | Result |
|---|---|
| `command -v node`, `command -v npm` on that tool path | Neither found; only `<engine>/bin/bun` |
| A connection to 192.0.2.1 (a documentation address) from Bun inside the box | Refused at once (`ECONNREFUSED`). Outside the box the same line waits until it gives up, so the box is what refused it |
| How the engine reads that refusal (review, 31 Oct 2026) | Node reports the box's refusal as `connect EPERM`, Bun as `connect ECONNREFUSED`. The box's own check (`proof/box.ts` boxRefusal) read only EPERM, so a practice test on Bun that reached for the internet was scored as the practice's failure. It now also reads `ECONNREFUSED` to an address that is not this Mac's, only for a command on the engine's own Bun (`practicerun.ts` onEngineBun); a local server that is down stays a real failure. Checked in the box on this Mac (`runner/test/proof-sandbox.test.ts`) |
| `npm run test` (what the checks run today) | `npm: command not found`, exit 127, for every practice |
| `bun run test` (the practice's own script, `node --test`) | In the box: `node: command not found`, exit 127. Outside the box Bun puts a stand in for `node` on the path, but it does not know Node's `--test` ("Missing script to execute"). So the scripts cannot be used as they are |
| `bun run dev` (the script, `node server.js`) | In the box: `node: command not found`, exit 127, for every practice |
| `bun test --config=/dev/null --no-install --no-env-file`, the practice as shipped | Fails (exit 1) for signup, setting, route and import. Bun runs the practices' `node:test` files as they are |
| The place Point at the problem finds in that output | Exactly the catalog's place for all four: `test/signup.test.js` line 17 ("/api/signup"), `settings.js` line 16 ("SHOP_NAME is not set"), `test/links.test.js` line 19 ("goes to /prices"), `server.js` line 3 ("Cannot find module"), after two small reading fixes below |
| The same command after the practice's one small fix | Passes (exit 0) for all four |
| `bun --config=/dev/null --no-install --no-env-file 'server.js'`, through the runner's `startServer` in the box | All five practices' servers start and answer `200` on 127.0.0.1 |
| Plain `bun test` in a copy with a `bunfig.toml` that preloads a file, and a `.env` | The preload ran and the `.env` was loaded. Node does neither |
| `bun test` as the engine runs it (the flags above) in that copy | The preload did not run and the `.env` was not loaded |
| A file that needs a package that is not there, as the engine runs a file | `Cannot find package 'left-pad'`, exit 1, nothing fetched |

## Two things the output reading needed

- **Folder names with spaces.** Every practice copy has spaces in its folder name (`Squibby practice missing page`). The place reader read a path up to the first space, so it found `page/test/links.test.js`, which is not in the project, and fell back to the error's words only. This was true with Node too: `node --test` (Node 18.20.8 on this Mac) in a folder named that way gave a message and no place, so on a real copy the practice would have said the check fails somewhere else. The project tests never showed it because their temporary folders have no spaces. Now the project's own folder, where the output names it in full (also as a `file://` address with `%20`), is read as `./` before places are looked for (`locate.ts inProject`). After the fix, the same Node run finds `test/links.test.js` line 19.
- **Bun's own words.** Bun prints a thrown error as `error: SHOP_NAME is not set...` under a `# Unhandled error between tests` heading, which was being read as the error. In Bun's report the `error:` line is now the error's words. And Bun says a missing file as `Cannot find module './lib/format-price' from '/path/server.js'`, with no line. The line is the one line in that file that asks for exactly that name, the rule already used for Vite's "Failed to resolve import"; it is used only for a whole path inside the project.

## What this decides

- A practice copy on a Mac with no Node runs its tests as `'<engine bun>' test --config=/dev/null --no-install --no-env-file` and its server as `'<engine bun>' --config=/dev/null --no-install --no-env-file 'server.js'`, in the box (`runner/src/proof/practicerun.ts`). The flags keep Bun as strict as Node: no `bunfig.toml` (it could load code before the tests), no `.env` loaded on its own, no install while it runs.
- Only the practice's own two script shapes are translated (`node --test` and `node <file>.js`); any other script is left as it is and fails the way it would without Node.
- Only a practice copy: its folder is named the way Companion names copies, its package is `practice-<id>`, and it needs no packages. The person's own projects are never run on Bun this way, with or without Node.
- With Node on this Mac, nothing changes: the practices run on Node exactly as before.
- With neither (an engine that is not Bun), the practice waits for Node, as before, with the same calm line.

## Not proven

- **A real Mac without Node.** This Mac has Node (Homebrew, nvm and `/usr/local/bin`), so "no Node" was a tool path without it, not a fresh Mac. The engine's own tool path (`env.ts toolPath`) adds those folders only when they exist, so on a Mac without them the result should be the same.
- **The Bun inside a signed `Squibby.app`.** The spike used a byte for byte copy of the same Bun outside an app (building the app was out of scope). Bun inside the hardened runtime app, run through `sandbox-exec`, is untested.
- **The agent's own commands.** During a practice's fix Claude Code may still try `npm test` itself and get "command not found". The work is proven by Companion's own check, which runs on Bun, not by the agent's commands.
- **Node's and Bun's test runners are not the same program.** Bun runs `*.test.js` files anywhere in the project; Node's `--test` looks in its own set of places. For the practices (one `test/*.test.js` file each) they run the same tests.
