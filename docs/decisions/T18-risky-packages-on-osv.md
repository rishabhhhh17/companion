# T18. Risky packages are looked up on OSV.dev, names and versions only

- **Status:** Accepted, 11 Nov 2026 (M79). The founder approved the look up on 6 Nov 2026 ("look up package names and versions on OSV.dev, never code"), with a decision record, a privacy row and an off switch.
- **Date:** 2026-11-11
- **Source:** OSV's API docs, checked 11 Nov 2026: https://google.github.io/osv.dev/post-v1-querybatch/ and https://google.github.io/osv.dev/get-v1-vulns/
- **Related:** M52 and M57 (the review of every change), M58 (the fixed finding shape), rules 13, 15 and 17, product research section 10, `docs/alpha/PRIVACY.md`

## Decision
- When a review batch adds a package or moves one to a new version, the engine reads the project's own package lists from its shadow snapshots, on the Mac: `package.json`, `package-lock.json`, `npm-shrinkwrap.json`, `requirements*.txt`, `pyproject.toml`, `poetry.lock`, `uv.lock`, `go.mod`, `Cargo.toml` and `Cargo.lock` (`runner/src/review/packages.ts`).
- Only exact versions are looked up. A range (`^1.2.0`) is resolved by the lock file in the same folder; with no lock file it is not guessed, and the review says those packages were not checked.
- **What leaves the Mac:** for each package, its ecosystem (npm, PyPI, Go, crates.io), its name and its version. Nothing else: no file name, no line, no code, no file contents, no project name, no account.
- **To whom:** OSV.dev (`https://api.osv.dev`), Google's free public database of known problems in open source packages. One `POST /v1/querybatch`, then `GET /v1/vulns/{id}` for each record it names, at most 20 records a review (`runner/src/review/osv.ts`).
- **When:** only as a review runs (on the person's press, or by itself with Automatic), only when that batch changed a package list, only while `packages.check` is on (On as usual), and never when the review may send only its checks (`review.send` Checks only; the review says so), never for a practice reviewed by the rules alone, and never with the stand in engine.
- **Cache:** the answers (names, versions, ids, severity and fixed versions) are kept in `osv-cache.json` in Squibby's own data folder for a day. Delete everything removes it with the folder.
- **What the review says:** a critical problem (the record's own rating, GitHub's CRITICAL, or a CVSS 3 base score of 9 and up) is a Must fix (`package_critical`, Fix this first); a high one (HIGH, or 7 and up) is a Should fix (`package_high`, worth a look). Moderate, low and unrated records say nothing. The finding's words: "<name> <version>: This package has a known serious problem: <id>, fixed in <version>." Neither kind can be hidden by Quiet or a "do not flag" line.
- **Honest when it cannot tell:** no answer, a timeout, a status that is not 200, or anything that is not OSV's JSON means "not checked", said in the review's notes as "not known to be safe". Never "safe".
- **Off switch:** Settings, Fixing, More, "Check new packages for known problems" (`packages.check`).

## Why
- A non engineer cannot tell that an AI tool added a package with a known hole. OSV is free, needs no key and no account, and covers npm, PyPI, Go and crates.io in one schema.
- Names and versions of public packages are not the person's code. Sending only those keeps rule 15's spirit and the review's own rule (settings and key files never read).
- The day's cache keeps the number of requests small and makes the same change cheap to review again.

## Not done
- yarn.lock, pnpm-lock.yaml, bun.lock, Gemfile.lock and other ecosystems are not read yet (their packages are not checked, and nothing claims they were).
- CVSS 4 vectors are not scored; a record rated only that way says nothing unless its database also rates it.
- A package's fixed version is the lowest `fixed` above the version in use, compared part by part; an unusual version scheme may pick a later fix than needed.

## Revisit only if
OSV's API, terms or rate limits change, or the founder wants another source (for example GitHub's advisory database).
