# M56: trust fixes, second pass

A second review (4 Nov 2026) checked the must fixes from the review of 4 Nov after they were built on the `m48/launch` branch. Its verdict: mostly sound, with one real regression and several fixes that went only part of the way. This file says what was fixed in answer, what is still open, and what must be checked on a real Mac before anyone relies on it (rule 18).

Every fix below had a test that failed first (rule 17). Nothing here was committed.

## What was fixed

### Must fixes 1 and 22: an update restart that never came back (the regression)

`install_update` runs off the main thread, so Tauri 2.12.1 restarts the app only after the `RunEvent::Exit` handler returns. When the hold to talk worker did not answer in time, that handler called `_exit(0)` first, so the update installed and Squibby never reopened.

Now `install_update` marks the exit as a restart (`quit::set_restarting`). The exit handler asks `quit::ending(hard, restarting)`. When it must end at once and is restarting, it starts the updated copy first (`open -n` on the app bundle, so macOS starts a fresh copy and does not just bring this one forward), waits up to two seconds for `open` to hand it over, and then ends. The new copy waits for the one copy lock (`instance.rs`, up to five seconds), which macOS lets go the moment the old process ends.

Files: `app/src-tauri/src/quit.rs`, `app/src-tauri/src/main.rs`. Tests: `quit::tests` (three new, one updated).

### Must fix 4: reducer guard and the two windows without a boundary

- The reducer guard now notes the event's kind, the error's own message and the functions it was in (from either stack form, WebKit or V8), keys hidden, 400 characters at most, never what the event carried (`useModel.ts eventFailureDetail`).
- The character page (`dock.tsx`) and the notch (`island.tsx`) now sit in a `PartBoundary` with `auto`: a drawing error draws them again by itself up to three times, 1.5 seconds apart, and then shows the plain line and Reload this part. Each failure is noted with `note_failure`.

Tests: `app/src/partBoundary.test.ts` (three new).

### Must fix 10: the usage proxy (switched off today)

- (a) Each request now holds its worst case, its whole `max_tokens` priced as output, while it runs. The check and the hold happen in one store step (`Store.hold`, `Store.unhold`), so many requests opened at once with a cent left cannot all pass before any is booked. `spent` counts what is held. The hold goes when the request ends, and only the real cost is booked.
- (b) A reply that Anthropic itself ended with an error event (for example `overloaded_error`) is booked from the usage it reported, not as its full output. Words in a reply that look like an error event never count as one: only a line that starts with the event's own type does.

Files: `usage-proxy/src/proxy.ts`, `usage-proxy/src/store.ts`, `usage-proxy/src/usage.ts`. Tests: `usage-proxy/test/proxy.test.ts` (five new).

The real store (Cloudflare Durable Objects or a database) does not exist yet. When it is written it must implement `hold` as one atomic step, as the in memory store does.

### Must fix 11: "changed since its last check" after a relaunch, and its cost

- The version the last check ran on (and its verdict) is now kept beside the project's snapshots, outside the project (`<id>.last-proof.json` in the shadow folder), so a relaunch or Stop everything does not forget it. Only a passed check ever leads to "same". The kept version is also guarded from pruning. A kept version the store no longer has counts as changed. Delete everything removes it with the rest of the shadow folder.
- Home asks again each time it opens (inside the existing "opened" listener) and when the pointer comes onto it (at most once every three seconds), not only on `focus`, which a non activating panel may never get.
- The cost: `changedSinceNow` keeps one index of its own between asks (`index-since` in the shadow folder), so git rereads only files whose size or time changed, not the whole project. It runs as upkeep, so it no longer pushes back the weekly clean up's idle test. If the clean up removed an object only that index pointed at, the index is made again from the newest version.

Files: `runner/src/agent.ts`, `runner/src/checkpoints.ts`, `app/src/card.tsx`. Tests: `runner/test/timeline.test.ts` (two new), `runner/test/checkpoints-since.test.ts` (new, three), `app/src/sinceCheck.test.ts` (one new).

### Must fix 24: internet previews and DNS rebinding (an incident under bar rule 9)

A page on this Mac already had the browser's own lock. An internet preview had only the rule on names, so a public name that answered with a home address was fetched (shown by a test before the fix: the stand in router got five requests). Now an internet preview's browser sends every connection, this Mac's own names included, through a proxy of the check's own (`runner/src/proof/publicProxy.ts`). It looks each name up itself, refuses the connection unless every answer is a public address (mapped, NAT64 and 6to4 addresses are judged by the IPv4 address they carry), and connects to the very address it checked. A tunnel (https, WebSockets) is passed on as it is. A plain http request has only its first line and connection headers rewritten, so it closes after its answer. A refused name is said in the existing gap line and never counted as the page failing. UDP calls are switched off as for a local page.

Tests: `runner/test/public-proxy.test.ts` (new, six), and a rebinding test in `runner/test/browser-reach.test.ts` that plays the attack with names the hidden browser maps to 127.0.0.1.

`browserCheck` gained a `_testNet` option for that test only. The app never sets it.

### Must fix 24 tests: no silent passes on a Mac without a network address

The WebSocket, press, redirect and worker reach tests are now `test.skipIf(!lan)`, so a run shows them as skipped. A new test fails the run on such a Mac unless `COMPANION_NO_LAN_OK=1` says it is running without them on purpose. Checked by running the file with a fake network list: one fail, four skips.

### Must fix 25: Fix it lost its own instructions on a long change

`finish` now takes the engine's opening lines, the quoted parts and the closing lines separately. The opening and closing lines are always kept whole. When the message is too long, whole quoted lines are left out, notes first, then file names, then the summary, then problems, and the message says "Some of the review was left out to keep this short." Tests: `runner/test/review-sendback.test.ts` (three new).

### Merge with M55 (`m55-alive`): the Pro tag on Check before going live

M55's `card.tsx` puts `<ProTag />` on the Is it safe chip and the main button, and its own `plan.test.ts` expects them there, so taking M55's side of both files would silently undo must fix 20 (F25). `app/src/freeSafety.test.ts` is a file of its own with no counterpart on M55, so it survives the merge and fails it. Checked against M55's `card.tsx`: all three of its tests fail there.

## Still open

- **Merging M55.** Two conflicts remain by hand: the Home chip row (`orderWays` in M55) must keep the chip and main button without the Pro tag, and `StatusKind` and `MainAct` in `homeHero.ts` must keep both `changed` (this branch) and M55's new values. M55's `plan.test.ts` expectations for `shipTagged` and the chip's tag must be dropped in the merge.
- **Nothing on screen when an event cannot be read.** The reducer guard now logs enough to find the bug, but the page still only keeps its old state. A visible line ("Squibby missed an update, reopen Home") was not added, since it touches the model the M55 branch is also changing.
- **The full rehash of every snapshot (must fix 27)** is unchanged. Only the "changed since" ask keeps its own index.
- **Worst case input cost is not held.** A request's hold counts its output only. Input is not known before it is sent, and estimating it from the body would hold far too much for a request with pictures. One request can still pass a limit by its own size, as before.
- **The real proxy store** (Durable Objects or a database) must implement `hold` atomically when it is written.

## [verify] on a real Mac

- **The update restart.** Hold to talk, press Install update straight away (so the worker is still busy), and confirm Squibby comes back on its own, with `update_relaunched` in the log and no second copy left running. Also confirm a normal update restart (worker idle) still comes back, through Tauri's own restart.
- **`open -n` and the one copy lock.** That the new copy waits for the lock and then runs, and does not leave as a second copy.
- **Internet previews through the proxy.** Run the browser check on a real Vercel preview (https, HTTP/2, a WebSocket if the project has one) and confirm the page loads and passes as before. Then confirm a preview that fetches a name pointing at the router (for example a test name in `/etc/hosts` set to 192.168.1.1) is refused and said as a gap.
- **Anthropic billing for a reply that ends in an error event.** The proxy now books only the usage Anthropic reported in that case. Confirm with Anthropic's billing that a reply ended by `overloaded_error` is not billed as more than that, before the proxy is switched on.
- **Home's refresh.** With Home open, edit a file in Cursor, move the pointer back onto Home, and confirm it says "<name> changed since its last check" within a few seconds, both before and after a relaunch.
- **The cost of "changed since".** On a project with tens of thousands of files, time the second and later asks; they should take well under a second.

## Suite results (this change, real runs)

- Runner: `bun test` on the files touched plus protocol and settings registry (`timeline`, `checkpoints-since`, `browser-reach`, `public-proxy`, `review-sendback`, `protocol`, `settings-registry`): 124 pass, 0 fail. Also run because their source changed: `checkpoints`, `review-service`, `agent-proof`, `proof-server-browser`: 99 pass, 0 fail. `bun run typecheck`: clean.
- Pages: `bun run test`: 2754 pass, 0 fail. `bun run typecheck`: clean.
- Rust: `cargo test`: 1213 pass, 0 fail, 7 ignored.
- Usage proxy: `bun test`: 198 pass, 0 fail. Typecheck: clean.
