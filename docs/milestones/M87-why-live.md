# M87: Why is live broken?

Status: built 14 Nov 2026, tests pass. Not committed. Nothing was spent on a real model, and the real `vercel` and `stripe` tools never ran: every command output in the tests is a fixture.

The why comes from the checked research of 13 Nov 2026: synthesis section 3, feature 7, and user-needs group E (setup walls). E3: Stripe webhooks to a Vercel production endpoint failing with 405, with no fix in the thread. E4: Vercel's own guide says environment values must be defined the same way in Production. E5: the "100 hour gap", values not shared with Vercel and "the last 20% still takes 80%+ of the time". E1 and E2: an app that let anyone in through inverted auth, and Supabase apps with no row security. The research found nothing in Squibby for E3 and E4 before this.

## What it does

In Go live (the Ready to go live? panel, and Putting it online once a site is live), the person presses **Why is live broken?**. Nothing runs before that press, nothing runs on a timer, and Stop everything ends it. It is read only: no snapshot, nothing written to the project, nothing changed in Vercel or Stripe.

Four parts, in order, each shown as it finishes (`runner/src/ship/livecheck.ts`, event `ship.whyLive`):

1. **Settings in Vercel Production** (`envPart`). The code's own files are read for the values it uses (`process.env.X`, `process.env["X"]`, `import.meta.env.X`, destructuring from `process.env`, `Deno.env.get`, `os.environ` and `os.getenv`). Tests, scripts, fixtures and Supabase's own functions are left out, and so are the names the host sets itself (`NODE_ENV`, `VERCEL_*` and the like). A read with a fallback (`?? "x"`, `|| "x"`, a Python default) is not a must; it is only mentioned. Then the person's own `vercel env ls production` runs, in a folder linked to Vercel only. Only the first word of each row under the header (the name) is kept; a value, even a plain one the table shows, never leaves the parser (a test holds that). A missing value is named with the file and line that reads it.
2. **Stripe webhooks** (`stripePart`). Only when the project uses Stripe or has a Stripe webhook route. The person's own `stripe` tool reads the webhook endpoints, then the events whose delivery did not succeed (`delivery_success=false`). The project's endpoint is the one on the live host, or on a webhook route found in the code. With neither to match, the part says it could not tell which endpoint is this project's (`endpoint_unknown`, the address box shows) and checks nothing in the account, so another project's endpoint or one `stripe listen` made is never blamed. Failed events are listed for the whole account, not one endpoint: an endpoint is named as their target only when it is the account's one switched on endpoint and it is this project's; otherwise the line says "your Stripe account's webhook endpoints" (review of M87). Problems: no endpoint while the code has a webhook route; none pointing at the live site; the endpoint switched off by Stripe; events in the last 7 days still not delivered, with how many, which kinds and the newest time. Only an endpoint's host and path are shown, never its query or signing secret, and no event's contents. Live mode by default (`live.stripeMode`, per project: Live or Test).
3. **Private pages** (`pagesPart`). The M75 anonymous visit (`browser.ts visitWithoutSignIn`, which `openWithoutSignIn` wraps) on the live address: the address the person typed, else the last one Squibby put live (`.companion/ships.json`). It now also takes a plain https address on the internet (`isSafeUrl`), with every connection through the public only proxy that preview checks use, so nothing on the Mac or the home network is reached. Still only read: nothing pressed, no form sent. With no known address, the panel shows a box for one. Each route answers one of three ways: open, asked for a sign in (401 or 403, moved to another page, a password field, sign in words), or unreachable (the visit could not start, no answer, a time limit, 404, 500 and up, an empty page). Fine only when every route asked for a sign in; otherwise `unreachable` names the ones not reached (review of M87: a site that is down was read as protected).
4. **Database rules** (`databasePart`). The existing Supabase row security check (`rls.ts rlsGate`), in its own words.

**Missing tools or logins:** each part says exactly what to run and is skipped: `npm install -g vercel` and `vercel login`, `vercel link` for a folder not linked, `brew install stripe/stripe-cli/stripe` and `stripe login`. Squibby never asks for, reads or keeps a key: the Vercel login is seen only as whether its file exists (as before), and the Stripe login only through what the tool says when it is missing.

**Read only, in code** (`readonly.ts refuseWrite`): exactly `vercel env ls production`, and `stripe get` on `/v1/webhook_endpoints` or `/v1/events` with only `-d limit=N`, `-d delivery_success=false` and `--live`. Every other `vercel env` command (add, rm, pull, another environment, `--decrypt`) and every other `stripe` command (post, delete, trigger, listen, resend, login, another path, another `-d`, `--api-key`) is refused with a plain line. Each command is checked again just before it runs.

**Copy for my AI** (`app/src/whyLive.ts whyLiveCopy`): what is broken first, each with its file and line and its next step, then what could not be checked, then the ask (never show or write down a secret value; ask before changing anything live, in Vercel or in Stripe). Names only: no value is ever known.

**Where the words live:** the engine sends data only (a part id, a state, a reason code, names, counts, a place). Every sentence is in `app/src/strings.ts whyLive`, the database part's sentence aside, which is the row security check's own (as in the ship gates). A database check that broke sends no sentence of its own. An engine with no tools for it sends a done event with `reason: not_set_up`, never an English error line.

**Never left waiting:** every press ends in a final event. An internal break is `done` with the parts so far and a `failed` part for the step that broke, never `stopped`. Close shows while it runs. A helper restart or exit (`app.runner_restarted`, `app.runner_down`) ends the wait on the page (`interrupted`), and a late answer is not taken. The panel opens right below the panel whose button was pressed (`from`: gates or online), scrolls into view and moves focus to its heading. In Ready to go live? the button reads Check my live setup and the panel Your live setup. When no part reached an answer the top line says nothing could be checked yet.

## Protocol

- Command `ship.whyLive` `{ project, url? }` (a plain https address), gate never (a safety feature on Free, like `ship.check`), page true, project bound. Fixtures `m87c1`, `m87c2`.
- Event `ship.whyLive` `{ project, stage: running | done | stopped, parts, liveUrl?, reason?: not_set_up }`. Each part is one of the four, at most once, with a known state and a reason that part can give (`LIVE_WHY` in `protocol/index.ts`, shared by the engine and the pages). Fixtures `m87e1` to `m87e5` (m87e4: not set up; m87e5: unreachable pages, unknown endpoint, a failed database part).
- Setting `live.stripeMode` (checks, per project, Live by default) in `protocol/settings.json`, `strings.ts`, `settingsPages.ts` (Fixing, More, checks) and `runner/test/settings-registry.test.ts`.

## Tests

- `runner/test/m87-why-live.test.ts` (28): the read only rule; the values the code reads (Next, Vite, destructuring, Python, fallbacks, left out folders); the Vercel list parsed to names only; every Vercel and Stripe case from fixture outputs (missing, all there, no tool, not signed in, not linked, a login flow, a time limit, a no, an unreadable answer; failing, delivered, switched off, pointing elsewhere, no endpoint, test mode, a key without the right); the live address; the visit refusing home network and plain http addresses; the database part; the engine's events, Stop everything, and the protocol fixtures.
- `runner/test/connections.test.ts`: unchanged expectations still hold (every `vercel env` write is refused).
- `app/src/m87.test.ts` (14): the page's state, every reason in words with no em dash, the next steps for skipped parts, the top line, the address box, Copy for my AI.
- `app/dom/m87.test.tsx` (3): nothing sent before the press; the panel filling in; Copy for my AI; the typed address; Stop everything.

## Not built

- A way to start it outside Go live (the ask box, the notch, a Home chip). Today the button is in the Ready to go live? panel and in Putting it online once live.
- Reading why a delivery failed (the HTTP status of each attempt). The Stripe API's event list does not say it; the next step sends the person to Stripe's own page for it.
- Telling Preview from Production values (E4 also means "defined the same way"); only Production is read.
- Values set in Vercel but not read by the code, and values a framework reads by itself (for example a database URL read by an ORM's own config file that is not code).
- Offering the fix with proof (synthesis section 4): Copy for my AI hands it to the person's own AI tool.

## [verify] on a real Mac

- The exact table `vercel env ls production` prints with the current Vercel tool (header words, columns, stdout or stderr).
- That `stripe get` sends `-d` as query parameters on a GET and takes `--live`.
- Whether the restricted live key `stripe login` makes may read webhook endpoints and events (if not, the part says so as no_permission).
- The words the Stripe tool prints when it is not signed in.
- The anonymous visit on a real live site, including one behind Vercel's own protection.

## Shots (fixtures only)

Served from `app/dist` with a stand in for `window.__TAURI__`, shot with Playwright at 2x, wide and tall: the button in Go live; the panel while it runs; four parts with three broken; every part skipped with its next step and the address box; and all fine.
