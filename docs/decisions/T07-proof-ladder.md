# T07. Proof: exit codes first, eyes last

- **Status:** Accepted from research; open items checked in M3. Updated 7 Oct 2026 after review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 7; section 7 (also section 18 M3 and M4, section 19 pitfalls 21 to 23); product_research.md sections 6, 15, 17 and 19
- **Related:** T05, T06, T08, T10

## Decision
"Done" means proven. After each turn that changed files, the runner climbs a proof ladder: exit code gates, then the dev server from `.claude/launch.json` with `autoPort`, then a Playwright smoke check, then a vision judgment shown only as evidence, then a second model review of the diff.

## Why
- It mirrors Claude Code Desktop's auto verify, which starts dev servers, screenshots, inspects the DOM and fixes what it finds (section 7).
- A vision judge can approve a page with dead buttons. Exit codes and a Playwright click through decide (pitfall 21).
- Agents edit or skip tests to pass. Diffing test files and counts against the checkpoint catches it (pitfall 22).
- False "done" is a high impact risk (product_research.md section 19).

## Alternatives considered
- A vision judge as pass or fail: rejected; screenshots are evidence only (section 1, row 7).

## Founder decision (7 Oct 2026, F14)
Every user, Free or Plus, gets rungs 1 to 5, including the real browser check, so "done" means the same thing on every plan. Plus adds rungs 6 and 7 (screenshot evidence and the second model review). The pricing table in product_research.md section 15 now says so.

## What this means for the build
Pass signals and timeouts per rung are in technical_research.md section 7.
- Rung 1: install if the lockfile changed, with the lockfile's manager.
- Rung 2: build, typecheck and lint exit 0 per script present (`CI=1`, 5 minute timeout).
- Rung 3: tests exit 0 and the count is not lower than at the checkpoint. Fail if the step edited, deleted or skipped tests (`.skip`, `.only`).
- Rung 4: the dev server answers within 60 s. Never attach to a server started before the step (pitfall 23).
- Rung 5: Playwright smoke: the page loads, no console errors, no failed requests, expected text present, one click through of the changed flow.
- Rung 6: a vision verdict with a screenshot, on the receipt only, never the pass signal.
- Rung 7: a separate read only review session (Opus 5.5 by default) reads the request and the diff, not the author's transcript, and can approve, comment or send back.
- On failure, send the evidence back into the same session, up to two retries within budget, then stop with "not done". The character goes to `error`, never `done`.
- Use Playwright's bundled Chromium, downloaded on first proof, never the user's real Chrome. Proof screenshots show the app under build, never the user's screen.
- M3 builds rungs 1 to 5, the retry loop, receipts and the timeline; rung 7 lands in M4. Rung 6 has no milestone in technical doc section 18 yet; the M3 plan assigns it. M3 passes when five seeded broken projects (Vite, Next.js, static HTML, Express API, Supabase app) never reach `done` while a rung fails, a deleted test is flagged, and the receipt diff matches the snapshot diff exactly.

## Open [verify] items
- None marked [verify]. The Chromium download size was not found in sources; measure it in M3, when Playwright is first downloaded (section 7). Measured 16 Oct 2026 (see below): 203 MB on disk, and the archive is 103,778,487 bytes (about 104 MB) over the network.

## What the build settled (hardening pass, 9 Oct 2026)
- Proof commands run with a short allow-list environment (no keys), `CI=1` only for install and tests, and a stop signal that ends everything they started.
- A start command that exits cleanly is a tool, not a website: the start and browser rungs are skipped, not failed.
- The browser check answers any write request with "no content" while it presses buttons, so a button can never change a server, and a hard deadline always closes the browser.
- The test guard also catches `|| true`, `; exit 0`, `--passWithNoTests`, commented out tests, and counts Python and Go tests. A moved test file is fine when no test is lost.
- A second model answer of "approve, but with concerns" counts as changes needed.

## What the build settled (the browser download, 16 Oct 2026)
- "Downloaded on first proof" is done as a visible, one time download the person starts. Until the browser is there, rung 5 is skipped, the result is "passed with gaps" (never "passed"), and the skipped step carries `needs: "browser"` (so do Point at the problem's answer and a Put it online preview that could not be opened), which is the only signal the card uses to offer "Get the browser check (about 200 MB, once)". Why a press and not on its own: a 200 MB download is never a surprise (AGENTS.md bar rules 7 and 12).
- The press runs Playwright's own installer into `~/Library/Application Support/Companion/browsers` (removed by Delete everything). One download at a time; a second press does nothing; Stop everything and closing the app end it. Only a download with Playwright's finished marker counts as installed, so a download stopped while it unpacked is never used.
- Integrity is Playwright's own: https from Playwright's servers, retried, and thrown away if fewer bytes arrive than announced. There is no checksum of the archive. The person's environment cannot change the download host (the installer gets the short allow-list environment).
- Measured: Chrome Headless Shell 156 (Playwright 1.64, build 1248) is 203 MB on disk on an Apple silicon Mac. Its archive (`chromium-headless-shell-mac26-arm64-1248.zip`) is 103,778,487 bytes, about 104 MB. This was read from a real download that a test started by mistake on 16 Oct 2026, into a temporary folder, before its stand in installer was wired up; those tests now also point the installer at a dead local proxy so that cannot happen again.
- Playwright's installer always adds FFmpeg (a video tool, about 1 MB, from the same servers) to a browser install; there is no option to leave it out. Companion never uses it. It downloads after the browser, with its own progress lines, so only the browser's lines count as progress (the bar never goes back and the size stays the browser's) and FFmpeg is part of "Setting it up". If FFmpeg fails, or the person stops it, after the browser is in place, the card says Ready, because the browser check works.
- The installer runs in its own process group, which the app's force stop of the engine (a stuck engine after Stop everything, a crash, quitting) does not reach. It ends with the engine instead: a helper in the installer's group waits on a pipe that only the engine holds open, and when the engine ends, however it ends, the helper ends the whole group (tested by killing the engine with SIGKILL during a download). This replaces the reviewer's idea of a saved process number killed on the next start: it acts at once, not at the next start, and can never hit an unrelated program that reused the number. Proof rung commands (tests, builds, dev servers) still run without this, so a force stop of the engine can leave one running until it ends by itself; that was not changed here.
- The installer keeps its archive in `browsers/.download`, not the Mac's shared temporary folder, and that folder is cleared before and after every run. A stopped download used to leave its archive (about 104 MB) in the shared temporary folder, because Playwright cannot clean up when it is stopped.

## What the build settled (Python projects, 16 Oct 2026)
- A folder without a package.json that has requirements, a pyproject.toml, setup.py, a Pipfile, manage.py or top level Python files is read as a Python project (`runner/src/proof/python.ts`). A folder with a package.json stays a Node project exactly as before.
- Which Python: the project's own `.venv/bin/python`, then `venv/bin/python`, else a `python3` on the tool path. macOS's `/usr/bin/python3` is only used when Apple's command line tools are there, because without them it opens an install window instead of running. A virtual environment whose Python is gone is called broken, with the commands to make it again; the Mac's Python is not used behind its back.
- Rung 1 never installs Python packages, inside a virtual environment or outside one. It is skipped with a plain note that names the Python used.
- Rung 2: ruff (`-m ruff check --no-cache .`) when the project uses it, else flake8 (with the virtual environment excluded), and mypy (`-m mypy --cache-dir /dev/null`, mypy's own way to keep its `.mypy_cache` out of the project) when configured. Rung 3: pytest (`-m pytest -q --tb=short -p no:cacheprovider`) when there are tests or the project lists pytest. Exit codes decide; pytest's exit code 5 (no tests collected) is "skipped", not "failed". Every Python command runs with `PYTHONDONTWRITEBYTECODE=1`, so with the flags above no `__pycache__` or cache folder is written into the project. (The first version let mypy write `.mypy_cache`, which the shadow snapshots do not skip; fixed the same day.)
- A check that fails only because a package is not installed (`No module named pytest`, or a `ModuleNotFoundError` for a package the project lists) is a gap: the rung is skipped with the command the person can run (inside a virtual environment), and the verdict is at best "passed with gaps", never "passed". A module the project does not list is a real mistake in the code and stays a failure.
- Rungs 4 and 5: the framework's own dev server (Django `manage.py runserver --noreload`, Streamlit with `--server.headless true --browser.gatherUsageStats false`, uvicorn for FastAPI, `flask run --no-reload`), told `127.0.0.1` and a free port on the command line, with the same start, wait and stop handling as Node. The app's own `python main.py` is not used, because it picks its own host and port. A real FastAPI app through real uvicorn was started, answered and stopped on this Mac in a test (Python 3.9.6).
- The visual receipt's earlier version borrows the virtual environment by one link, and a package that is not installed there is "not pictured", never "the page crashed".
- Point at the problem reads pytest's report (long, short, line and summary only), ruff (old and new formats), flake8 and mypy. The pytest, ruff, flake8 and mypy samples in the tests were written by hand in those tools' formats; pytest is not installed on this Mac and nothing was downloaded to capture them, so a real pytest run is still to be checked.

## Revisit if
The false "done" rate does not stay near zero, its target in product_research.md section 17.
