# M117: Money and fines, before you go live

Status: **built 21 Nov 2026 on `m117/cost-guard`, not committed; real Mac [verify] items open (below).** See "Built" at the end for what changed from this plan and why. The founder asked for it on 21 Nov 2026 ("lets try fixing it", after the list of what Squibby does not check: rate limiting, abuse protection, spending caps, and the basics that get you fined). Plan written 21 Nov 2026, before any code, on branch `m117/cost-guard`. This plan waits for the founder's yes before any feature code (AGENTS.md, How we work). Nothing is spent: no model call of any kind, no key, no account, no deploy, no network. Static rules in code, fixtures and temporary folders only. Real projects on a real Mac are [verify] items below.

## Why

People who ship with AI forget the things that cost money or get them fined once the app is live:

- **Rate limiting.** A route that calls a paid AI, or sends email or SMS, with no limit on how often it can be called. Bots find it, and the bill explodes.
- **Abuse protection.** A public sign up, contact, waitlist or comment form, or a sign in route, with no bot check and no limit. Fake accounts, spam sent through the person's own email account, password guessing.
- **Spending caps.** Paid APIs with no monthly budget or alert. Squibby cannot see the provider's dashboard, so this is honest guidance, never a claim.
- **Fines basics.** Accounts or collected emails with no privacy policy page; trackers with no cookie consent; accounts with no way to delete the account and its data.

Today Squibby checks none of these. The go live check (`runner/src/ship/gates.ts runGates`) covers the work being checked, keys that would be published and open database tables. The review of every change (`runner/src/review/rate.ts`, `look.ts`, `service.ts`) covers keys, open tables, weakened checks, removed files still used, risky packages and house rules. The user needs research says the same gap in its own words (`docs/research/2026-11-13-user-needs.md`, group D: "spending caps on keys already leaked" are not covered).

## What the person gets (user stories)

1. **Before going live.** Maya built a chat app with Lovable and presses Is this safe to go live. Under the usual checks she sees a new part, Money and fines: "Anyone can call your AI without a limit. app/api/chat/route.ts, line 4, calls OpenAI, and nothing limits how often it can be called." Under it: why it costs money ("A bot can call it thousands of times an hour, and each call is billed to your OpenAI account"), and Copy for my AI. She pastes the words into Lovable, it adds a limit, she presses Check again and the line is gone.
2. **A form bots will find.** Sam's waitlist form posts to a route that sends a welcome email through Resend. The go live check says the form has no bot check and the route has no limit, in two lines, with one Copy for my AI that fixes both.
3. **Spending caps, honestly.** Priya's project uses OpenAI, Replicate and Twilio. The check lists the three, each with where it was found, and says: "Set a monthly budget and an alert in each one's dashboard. Squibby cannot see your dashboards, so it did not check this." Never a tick.
4. **The fines basics.** Leo's app has Clerk sign in and Google Analytics. The check says: no privacy policy page found; Google Analytics loads with no cookie consent; and, because Clerk's own account page is in use, deleting an account is already there. Each fines line ends with "This is the usual baseline; it is not legal advice."
5. **Every change.** Ana's Cursor adds a new route that calls Anthropic with no limit. The review card says Worth a look, never Stop, with the file and line and Copy for my AI. A change that adds Meta Pixel with no consent gets the same.
6. **When Squibby cannot tell.** Ben's Express app builds its routes in a loop from a list. The check says: "Some routes are made by code at run time, so I could not check them for limits." It never says safe, and it lists that part under What was not checked.
7. **Already covered elsewhere.** Zoe set a rate limit rule in Cloudflare's dashboard. She presses "I set this up outside the code" on the line; Squibby keeps one line in What I remember about this project, with its source ("you told me, 21 Nov"), and the report says "You said a limit is set outside the code. Squibby could not see it." It is never turned into a pass, and the line can be forgotten like every memory line.

## Rules it must hold

- Rule 12 and the engine rule for reviews (F30, M52): the rules decide, in code. No model decides any finding; a model may only add words, and only where it already does today (the review's written summary). The go live part uses no model at all.
- Rule 13: building the list sends nothing. Copy for my AI copies only; Squibby never types into another app. The person sets budgets in their own dashboards; Squibby never signs in, never calls a provider, never changes a setting there.
- Rule 14: never a false all clear. "None seen in what I could read" is the most Squibby ever says, with how much it read. Anything it could not read or follow is "Could not check", with why, and is listed under What was not checked.
- Rule 15: findings carry a file, a line, a route path and fixed ids only. Never a value, a key, an environment value or a line of the person's code. `.env` files are never read for this check (names of settings are read only where code reads them, such as `process.env.OPENAI_API_KEY`, and only the service it points to is kept). The "set up outside the code" line goes into project memory visibly, with its source, and can be forgotten.
- Rule 16 and the writing style: plain words, short sentences, no fear words, no legal advice claims.
- Rule 17: tests first (below). Rule 18: [verify] items below, added to `technical_research.md` section 20 as item 56.
- Rule 21: every word in `app/src/strings.ts`; colours only from `app/src/ui/tokens.css`, and no new colour: the existing marks (Worth a look, Not sure, Not checked) carry the meaning. The look is locked: the new part reuses the go live panel's rows and the review card's rows as they are.

## Where it plugs in (files and functions)

### New, in the runner (pure rules, no file access of their own)

- `runner/src/money/routes.ts`: `routesIn(files): { routes: Route[]; unsure: Unsure[] }`. A `Route` is `{ file, line, framework, method?, path?, kind: "route" | "action" | "function" | "form_handler" }`. One reader per framework (below). Comments and strings are stripped before matching (the same light stripping `weakened.ts` uses).
- `runner/src/money/services.ts`: `PAID` (the fixed list of services, each with its packages, import names, call shapes and API hosts, family `ai`, `email`, `sms`, `heavy`), `paidCallsIn(file, text)`, `servicesInManifests(files)` (package.json, requirements files, pyproject.toml, read with `packages.ts packagesIn`, names only).
- `runner/src/money/limits.ts`: `limitOf(route, files): "limited" | "none" | "unsure"` and `projectLimits(files)`, the limiters a whole project or a middleware applies, with each middleware's matcher read only when it is written out as plain text.
- `runner/src/money/bots.ts`: `formsIn(files)`, `authRoutesIn(routes, files)`, `botCheckOf(form or route, files): "checked" | "hosted" | "none" | "unsure"`.
- `runner/src/money/fines.ts`: `accountsOf(files)`, `privacyPageOf(files)`, `trackersOf(files)`, `consentOf(files)`, `deleteAccountOf(files)`.
- `runner/src/money/check.ts`: `moneyCheck(files, o): MoneyReport`, the whole check, pure. And `moneyOfProject(dir)`, which reads the project with the walker `ship/scan.ts scanProject` uses (moved out as `readProject(dir, filter)`, same skip list, same 1 MB cap, links never followed), leaving out every `.env` file, every built or published folder (`dist`, `.next`, `build`, `out`), tests, stories, `scripts/` and `examples/`. At most 3,000 files (`MONEY_MAX_FILES`); past that, the rest is Could not check with its count.
- `runner/src/money/review.ts`: `moneyReasons({ changed, before, after, context }): Reason[]`, the review's part: only what the change added (a finding at the newer version that was not there before, matched by kind, file and route), the same way `look.ts openData` says only what the change opened.

### Changed, in the runner

- `runner/src/ship/gates.ts runGates`: after the three gates, `money: moneyOfProject(o.project)` in a try (a failure is the whole part as Could not check, never empty). It is **not a gate**: `canShip`, `blockedBy` and `needsYou` are worked out exactly as today, so nothing here can hold back Put it online. `GateReport` gains `money?: MoneyReport`.
- `runner/src/agent.ts gateReport` and `shipCheck`: pass `money` through to `ship.gates`. The setting `money.checks` off leaves it out and sends `money: { off: true }`.
- `runner/src/review/service.ts reviewBatch`: reads the extra context files the money rules need at `b.to` and `b.from` from the undo store (`store.readFiles`, a fixed list: package lists, `middleware.*` and `proxy.*`, `src/middleware.*`, `hooks.server.*`, `server/middleware/**`, `nuxt.config.*`, `wrangler.toml` and `wrangler.json*`, `vercel.json`, `supabase/config.toml`, the server entry files `server.*`, `app.*`, `index.*`, `main.*` at the top and in `src/` and `server/`, at most 40 more files, never a settings or key file), then adds `moneyReasons(...)` to `found` beside `weakened`, `page.page`, `open`, `house` and `pk.reasons`. The setting `money.checks` off skips it.
- `runner/src/review/rate.ts`: nothing in `rate()` changes. The three new kinds are not in `FOUND_STOP`, so they land in `look`, so the rating is at most Worth a look. A test pins this.
- `runner/src/review/look.ts`: the new kinds are not in `STOP_KINDS` and not in `NEVER_SILENCED`. `Recheck` gains `{ how: "money"; kind; file; anchor: string; context: string[] }` (the route's line as a hash, as `lineHash` does today) and `recheckHolds` runs the same money rule again on the file and its context. `recheckFiles` names them.
- `runner/src/review/fixcheck.ts outcomeOf`: a money reason is Gone when its rule no longer finds it, Still there when it does, Look at it when its context could not be read (M104's words, unchanged).
- `runner/src/review/sendback.ts`: the review's Send back to my AI already quotes each reason's `say`; the new kinds add one fixed closing line of the engine's own (outside the quote): "If a fix needs a new service or account (for example Upstash for a limit), tell me first and wait. Do not sign up for anything."
- `protocol/settings.json` and `runner/src/settings.ts`: `money.checks` (on by default), in Settings, Checking: "Check for money and fines".

### Changed, in the protocol

See "Protocol changes" below.

### New and changed, in the pages

- `app/src/moneyFines.ts` (new): the words per kind and family, the row shapes for the go live panel and the report, and `moneyCopy(kind, places, framework)`, the Copy for my AI text, built only from fixed words in `strings.ts` and the finding's file, line and route path (each made one line with `sendback.ts`'s file name cleaning, and quoted with "> " like every place taken from the project).
- `app/src/moneyFines.tsx` (new): the Money and fines part, drawn with the go live panel's existing rows, marks and buttons; in `app/src/shipPanels.tsx` under the gates.
- `app/src/goLiveReport.ts buildReport`: a new section `money` ("Money and fines") between Before going live and What the review found. `ReportSection.id` gains `"money"`. `Mark` gains `"noneSeen"` ("None seen", drawn in the existing `skip` colour, never `ok`). The Could not check parts of money go into What was not checked, as every other part that did not run.
- `app/src/findingShape.ts FINDING_LEVEL`: the three new review kinds are `"look"`. `app/src/review.ts` and the review card need nothing more: a new kind draws through the fixed shape.
- `app/src/strings.ts`: `S.money` (all words below), `S.homeNow.reviewHead`, `S.finding.meansFor`, `S.finding.howFor`, `S.finding.fineFor` for the three new kinds, `S.goLive.sections.money`, `S.goLive.mark.noneSeen`, the setting's label and help.
- `app/src/model.ts`: `ShipReport` gains `money?`; the "set up outside the code" press sends `money.mark` and waits for the memory line to come back, as Don't flag this kind here again does.

### Docs that must stay true

`docs/architecture.md` (a Money and fines row: trust layer, owned by `runner/src/money/`), `docs/research/technical_research.md` section 20 item 56, `AGENTS.md` repo map only if a top folder changes (it does not), `CHANGELOG.md` in plain words when it ships.

## The detection rules

All rules read text already in memory: the project's files for the go live check, the two snapshots for a review. No rule runs the person's code, starts a server or opens a network connection.

### Step 1: find the server routes, per framework

A framework counts only when its package is in a package list (or, for Python, a requirements or pyproject file) **and** its files are found. A server package found with no reader below (Koa, NestJS, Elysia, Hapi, AdonisJS, Django, Rails, Laravel, Go, Rust servers) is Could not check: "This project uses Koa, which Squibby cannot read for limits yet."

| Framework | What counts as a route | Line given |
|---|---|---|
| Next.js, app router | `app/**/route.{ts,js,tsx,jsx,mjs}` (and under `src/`) exporting `GET`, `POST`, `PUT`, `PATCH` or `DELETE` (a function or a `const`). Server Actions: a file or function marked `"use server"` that exports an async function (anyone can call it with a POST). | The export |
| Next.js, pages router | `pages/api/**` (and under `src/`) with a default export. | The default export |
| Express | `app.METHOD(` or `router.METHOD(` with a path written as text, in a file that imports `express`. `app.use(` with a router mounts its path. | The route call |
| Hono | `app.METHOD(` or `.on(` in a file that makes `new Hono(`; `app.route(path, sub)` mounts. | The route call |
| Fastify | `fastify.METHOD(` or `app.METHOD(`, `.route({ method, url })`, in a file that imports `fastify`. | The route call |
| Remix and React Router 7 | `app/routes/**` exporting `action` (a POST) or `loader` (a GET). `routes.ts` route lists in React Router 7 are read when written out as text. | The export |
| SvelteKit | `src/routes/**/+server.{ts,js}` exporting a method; `+page.server.{ts,js}` exporting `actions`. | The export |
| Nuxt | `server/api/**` and `server/routes/**` with `defineEventHandler` or `eventHandler`; the method from the file name (`chat.post.ts`). | The handler |
| Supabase edge functions | `supabase/functions/<name>/index.ts` with `Deno.serve(` or `serve(`. Its path is `/functions/v1/<name>`. | The serve call |
| Cloudflare Workers and Pages | A `wrangler.toml` or `wrangler.json(c)` and its `main` file with `export default { fetch`; Pages Functions `functions/**` exporting `onRequest`, `onRequestPost` and the rest. A Worker that routes inside `fetch` by hand counts as one route for the whole Worker. | The fetch or export |
| Vercel functions (not Next.js) | `api/**/*.{ts,js,mjs,py}` at the project top with a default export, an exported method, or a Python `handler` class or `app`. | The export |
| Flask | `@app.route(`, `@bp.route(`, `@app.post(` and the other method decorators, in a file that imports `flask`. | The decorator |
| FastAPI | `@app.METHOD(` and `@router.METHOD(`, in a file that imports `fastapi`. | The decorator |

Could not check, per route source: a route registered with a computed path or method (`app[method](`, a loop over a list, a path built from a variable), a router mounted from a file Squibby cannot resolve, and a Next.js `middleware` or `proxy` matcher that is not written out as text. These are said with the count of routes they may hide, never ignored.

### Step 2: which routes cost money

A route costs money when its file, or a project file it imports (followed two steps, with the same import resolving `rate.ts jsTargets` and `pyTargets` use today, `@/` and `~/` included), does one of these:

- **Calls a paid AI** (family `ai`): `openai`, `@anthropic-ai/sdk`, `ai` with `generateText`, `streamText`, `generateObject`, `streamObject` or `embed`, any `@ai-sdk/*`, `@google/genai`, `@google/generative-ai`, `@google-cloud/vertexai`, `replicate`, `groq-sdk`, `@mistralai/mistralai`, `cohere-ai`, `together-ai`, `@fal-ai/*`, `@huggingface/inference`, `@deepgram/sdk`, `assemblyai`, `elevenlabs` and `@elevenlabs/*`, `@langchain/openai`, `@langchain/anthropic`, `openrouter` clients; in Python `openai`, `anthropic`, `google.genai`, `google.generativeai`, `replicate`, `litellm`, `groq`, `mistralai`, `cohere`. Also a `fetch` or request to a known API host written as text (`api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.replicate.com`, `openrouter.ai/api`, `api.groq.com`, `api.mistral.ai`, `api.elevenlabs.io`).
- **Sends email or SMS** (families `email`, `sms`): `resend`, `@sendgrid/mail`, `postmark`, `mailgun.js`, `@aws-sdk/client-ses`, `@aws-sdk/client-sesv2`, `nodemailer`, `@react-email/*` with a sender, `twilio`, `@aws-sdk/client-sns`, `vonage` and `@vonage/*`, `messagebird`, `plivo`; Python `resend`, `sendgrid`, `twilio`, `boto3` with `ses` or `sns`.
- **Does heavy work** (family `heavy`): `puppeteer`, `playwright`, `@sparticuz/chromium`, `fluent-ffmpeg` or `ffmpeg`, `sharp` on an uploaded file. Said more softly ("can be slow and costly to run"), because hosting bills are less sudden than AI bills.

A route that does none of these is never flagged for rate limiting. This keeps the list short and true: a plain page of data with no limit is not what costs money.

Left out on purpose, even when they call a paid service:

- **Webhooks** that check a signature (`stripe.webhooks.constructEvent`, `svix`, `Webhook(...).verify`, `verifyWebhook`, `x-hub-signature` checks): only the provider can call them.
- **Scheduled jobs** that check a secret header (`CRON_SECRET`, `authorization` compared with a setting) or are listed under `crons` in `vercel.json`.
- Files under tests, stories, `scripts/`, `examples/` and built folders.

### Step 3: is there a limit

A route is **limited** when any of these is true; **unsure** when the rule cannot tell; otherwise **none**.

In the route's own file, or a wrapper it imports (two steps):

- `express-rate-limit`, `express-slow-down`, `rate-limiter-flexible`, `@upstash/ratelimit` (with `.limit(`), `@arcjet/*` with `fixedWindow`, `slidingWindow` or `tokenBucket` and `.protect(`, `hono-rate-limiter`, `@hono-rate-limiter/*`, `@fastify/rate-limit`, `@nestjs/throttler`, `@vercel/firewall` with `checkRateLimit`, `next-rate-limit`, `limiter` with `RateLimiter`, `@unkey/ratelimit`, a Cloudflare rate limiting binding used with `env.<NAME>.limit(`, `@convex-dev/rate-limiter`; Python `slowapi`, `flask_limiter` (`Limiter`, `@limiter.limit`), `fastapi_limiter`, `django_ratelimit` (read, though Django routes are not).
- A wrapper written in the project (`withRateLimit(handler)`) counts when its own file uses one of the above.

For the whole project, or a part of it:

- Express: `app.use(rateLimit(...))` or a limiter `app.use` before the routes in the entry file; `app.use("/api", limiter)` covers that path.
- Hono: `app.use("*", ...)` or `app.use("/api/*", ...)` with a limiter.
- Fastify: `register(rateLimit` is global unless `global: false`.
- Next.js: `middleware.*` or `proxy.*` (top or `src/`) that uses a limiter, with a `config.matcher` written as text that matches the route's path. A matcher built by code is unsure.
- SvelteKit: `src/hooks.server.*` `handle` that uses a limiter.
- Nuxt: `server/middleware/**` that uses a limiter, or the `nuxt-security` module in `nuxt.config.*` with `rateLimiter` not turned off.
- Cloudflare: a `ratelimits` or `unsafe.bindings` entry of type `ratelimit` in `wrangler.*` and the binding used in the Worker.
- Supabase: `[auth.rate_limit]` in `supabase/config.toml` covers Supabase's own sign in routes only, never an edge function. Edge functions have no limit of their own, so they need one in code.

Dashboard only (Vercel Firewall rules, Cloudflare WAF rate limiting rules, an API gateway): Squibby cannot see these. The line says so ("If you set a limit in your host's dashboard, this is already covered. Squibby cannot see dashboards.") and offers "I set this up outside the code".

A limit that exists but is very loose (for example 10,000 a minute) is not judged in this milestone; it counts as limited. Gap left, below.

### Step 4: abuse protection

**Forms that count.** A page form (`<form`, a form library's submit, or a `fetch` POST from a page) that has an email or password field, or is named or posts to a path with `signup`, `sign-up`, `register`, `join`, `waitlist`, `subscribe`, `newsletter`, `contact`, `feedback`, `comment`, `review`, `invite`, `forgot`, `reset`. And the route it posts to, when found.

**Sign in routes that count.** Routes with `login`, `signin`, `sign-in`, `auth`, `password`, `otp`, `magic-link` in their path, or that call `signInWith*`, `signUp`, `createUserWith*`, `bcrypt.compare`, `verifyPassword`.

**A bot check counts when found**, on the page or on its route:

- Cloudflare Turnstile (`@marsidev/react-turnstile`, `react-turnstile`, `cf-turnstile`, the `challenges.cloudflare.com/turnstile` script, a server `siteverify` call), hCaptcha (`@hcaptcha/react-hcaptcha`, `hcaptcha`), reCAPTCHA (`react-google-recaptcha`, `react-google-recaptcha-v3`, `grecaptcha`, the `recaptcha/api.js` script), Vercel BotID (`botid/client` and `checkBotId`), Arcjet (`detectBot`, `protectSignup`, `shield`), Friendly Captcha, ALTCHA.
- A limit from step 3 on the form's route also counts for a contact or waitlist form (it stops a flood, not every bot, and the line says "has a limit but no bot check" only in Careful strictness).

**Hosted forms and sign in** are said as handled by their service, never flagged: Formspree, Netlify Forms (`data-netlify`), Tally, Typeform, Google Forms, Basin, Getform embeds. Sign in services: Clerk (bot protection on sign up is Clerk's own setting; the line says "Clerk has its own bot protection. Check it is on in Clerk's dashboard." as guidance, never a pass), Auth0 (its own Attack Protection, same words), Supabase Auth (a pass only when `[auth.captcha]` is on in `supabase/config.toml`; otherwise "turn on captcha in Supabase's Auth settings", because the live project's setting cannot be seen), Firebase Auth (App Check; same honest words), Better Auth (it has a built in limit [verify]; counts as a limit, not a bot check), Auth.js and NextAuth, Lucia, Passport and hand written sign in (nothing built in: checked like any route).

### Step 5: paid services and spending caps

Every service from the `PAID` list found in a package list, an import, or a `process.env.<NAME>` or `os.environ["<NAME>"]` read in code (only the name is matched, such as `OPENAI_API_KEY`; no value is read and no `.env` file is opened) is listed once, with the first place found. Each gets the same honest line, and a short "where to look" from a fixed table in `strings.ts`:

| Service | Where to look (words to check on the real pages before shipping [verify]) |
|---|---|
| OpenAI | Settings, Limits: a monthly budget and an email alert |
| Anthropic | Console, Settings, Limits: a spend limit |
| Google (Gemini, Vertex) | Google Cloud Billing, Budgets and alerts |
| Replicate | Account, Billing: a spend limit |
| Twilio | Console, Usage triggers |
| Resend, SendGrid, Postmark, Mailgun | Their plan has a monthly cap; check what happens past it |
| AWS (SES, SNS) | AWS Budgets |
| Vercel | Settings, Billing, Spend management |
| Supabase | Billing, Spend cap |
| Cloudflare | Billing, notifications |
| Others in the list | "its dashboard's billing or limits page" |

It is never a finding with a file to fix and never a Must or Should: it is a list with Not checked marks, because Squibby did not check it. There is no Copy for my AI for setting a budget (an AI tool cannot set it either); there is "Copy this list", for the person's own notes. The review of every change says one line, Worth a look, only when a change **adds** a paid AI service the project did not use before: "This change starts using Anthropic. Set a monthly budget and an alert in its dashboard."

### Step 6: the fines basics

**Does the project have accounts or collect emails?** An auth package or call (`next-auth`, `@auth/*`, `@clerk/*`, `@supabase/ssr` or `supabase.auth.signUp`, `firebase/auth`, `better-auth`, `lucia`, `passport`, `@kinde-oss/*`, `@auth0/*`, `flask_login`, `fastapi_users`), or a form with an email field (step 4), or a mailing list service (`@mailchimp/*`, `convertkit`, Resend audiences, `loops`). If none, the privacy and delete rules are Not needed, said as "No accounts or email collection found".

**A privacy policy page counts when found:** a page or route named `privacy`, `privacy-policy`, `datenschutz`, `politique-de-confidentialite`, `legal/privacy` in any framework's page folders above, a `privacy.html` or `privacy.md` in a public or content folder, or a link whose text or address says privacy (including a hosted policy from Termly, iubenda, GetTerms, TermsFeed). Not found: "I could not find a privacy policy page." (Never "you have none".)

**Trackers that count** (set cookies or identify people across visits): Google Analytics and Google Tag Manager (`gtag(`, `googletagmanager.com`, `@next/third-parties/google`, `react-ga4`, `nuxt-gtag`), Google Ads tags, Meta Pixel (`fbq(`, `connect.facebook.net`), PostHog (`posthog-js`, unless set to memory only or cookieless), Mixpanel (`mixpanel-browser`), Hotjar (`@hotjar/browser`, `static.hotjar.com`), Segment (`@segment/analytics-next`, `analytics.js`), Amplitude, Heap, Microsoft Clarity (`clarity.ms`), LinkedIn Insight, TikTok Pixel, Intercom and Crisp chat widgets.

Said as cookieless by their makers and not flagged, with the line "says it does not use cookies, by its maker's own words": Plausible, Fathom, Simple Analytics, Umami, Vercel Web Analytics, Cloudflare Web Analytics, Pirsch. That is a description, not advice.

**Consent counts when found:** a consent tool (`vanilla-cookieconsent`, `react-cookie-consent`, `@c15t/*`, Cookiebot, CookieYes, OneTrust, Osano, Termly, iubenda, Klaro, Usercentrics, Didomi), Google Consent Mode (`gtag('consent', 'default'`), or the tracker started only after a consent check written in code (PostHog `opt_out_capturing_by_default`, Mixpanel `opt_out_tracking_by_default`, a tracker loaded inside an `if` on a consent setting). Not found: "Google Analytics loads with no cookie consent I could find."

**A way to delete an account counts when found:** Clerk's `<UserProfile` (it has Delete account by default [verify]) or `users.deleteUser`, Supabase `auth.admin.deleteUser`, Firebase `deleteUser(` or `user.delete()`, Auth0's management `users.delete`, a route or action named `delete-account`, `deleteAccount`, `deleteUser`, `close-account`, a database delete of the user's row (`prisma.user.delete`, `DELETE FROM users`, `db.delete(users)`). A privacy page that says people can ask by email to be deleted is said as "You ask people to email you; keep that working" (a known way, not flagged). Not found: "I could not find a way for people to delete their account and its data."

Every fines line ends with: "This is the usual baseline; it is not legal advice."

### Step 7: what the review of every change raises

Only Worth a look, never Stop, and only for what the change **added** (not there at the version before):

- `paid_route_open`: a new or changed route that now calls a paid AI or sends email or SMS, with no limit (step 3 none). Unsure is not raised in a review (it is said in the go live check), so a review never nags about what it cannot tell.
- `form_open`: a new public form or sign in route with no bot check and no limit.
- `tracker_no_consent`: a tracker added with no consent found.
- And the one spending line when a paid AI service is new to the project (said as `paid_route_open`'s sibling note in `notes`, not a reason, so it never raises the rating by itself).

The three kinds take "Don't flag this kind here again" (`REVIEW_SILENCE_LINES`), and Quiet strictness hides them, as every Worth a look. The privacy page and delete account rules are **not** in the review: no single change makes them true or false in a way worth a card each time; they live in the go live check.

## False positives and false negatives, and how each is handled

| Risk | Kind | How it is handled |
|---|---|---|
| A limit set in a host's dashboard (Vercel Firewall, Cloudflare WAF, an API gateway) | False positive | The line says Squibby cannot see dashboards; "I set this up outside the code" keeps a visible memory line; the report says "You said ..., Squibby could not see it", never a pass |
| A hand written limiter (a Map of counts, Redis `INCR`) | False positive | Recognised only through the list; the same "I set this up" press. A test fixture shows it flagged, so the words are checked to be gentle |
| A route only signed in people can call | False positive, partly | Still flagged when it calls a paid AI, with "only signed in people can call it, but anyone can sign up" (one sign up is enough for a bot); not flagged for email |
| Webhooks and scheduled jobs | False positive | Left out by their signature or secret check (step 2); a test for each |
| A wrapper limiter more than two imports away | False positive | Said as flagged; the import depth is a constant with a test; the "I set this up" press covers it |
| Code in comments, tests, examples or docs | False positive | Comments stripped; those folders left out; a test for each |
| A privacy page under an unusual name or in another language | False positive | A list of names in several languages, links with "privacy" in text or address, hosted policy services; the line says "could not find", never "none" |
| A consent tool loaded from a tag manager | False positive | Google Consent Mode and the tool names are matched anywhere, the GTM container is not readable, so the line says "If your consent banner is set up inside Google Tag Manager, this is already covered" |
| Routes made at run time, unknown frameworks, a computed matcher | False negative | Never silent: Could not check with the count and why, in What was not checked |
| A paid call through an internal SDK or a package of the person's own (a monorepo workspace) | False negative | Workspace packages are followed when they are in the project folder; past two imports or outside the folder is said as "I followed calls two files deep" in the part's About line |
| A paid service called with raw `fetch` to an address built from a setting | False negative | Known hosts written as text are matched; an address from a setting is not; said in the About line |
| A limit that is far too loose | False negative | Counts as limited in this milestone; gap left |
| A tracker added through a tag manager container | False negative | Only the container is seen; the GTM line above says what is not known |
| Big projects | False negative | At most 3,000 files; past that the rest is Could not check with its count |

The one rule over all of these: when a rule cannot tell, it says it could not check. "None seen" always comes with what was read ("in 41 route files across Next.js and Supabase functions").

## The plain words

Every line has: what is wrong (the head), where (file, line, and the route's path when known), why it costs money or risks a fine, and the next step. All in `S.money`.

| Kind | Head | Why |
|---|---|---|
| `paid_route_open` (AI) | Anyone can call your AI without a limit. | A bot can call it thousands of times an hour, and every call is billed to your {service} account. |
| `paid_route_open` (email, SMS) | Anyone can make your app send {email or texts} without a limit. | Bots use open routes to send spam through you. It costs money and can get your {service} account blocked. |
| `heavy_route_open` | Anyone can start slow, costly work without a limit. | Each call keeps your server busy, and hosting is billed by use. |
| `form_open` | Your {sign up, contact, waitlist} form has no bot check. | Bots fill open forms with fake accounts and spam. If the form sends an email, each fake one costs you. |
| `auth_open` | Your sign in has no limit on tries. | Bots can guess passwords again and again until one works. |
| `paid_unchecked` | You use {services}. Set a monthly budget and an alert in each one's dashboard. | Squibby cannot see your dashboards, so it did not check this. A budget stops a surprise bill. |
| `no_privacy_page` | I could not find a privacy policy page. | Your app {has accounts, collects emails}. A privacy policy is the usual baseline when you collect people's details; app stores and payment providers ask for one too. This is the usual baseline; it is not legal advice. |
| `tracker_no_consent` | {Tracker} loads with no cookie consent I could find. | In many places, including the EU and the UK, trackers that set cookies need a yes first. This is the usual baseline; it is not legal advice. |
| `no_delete_account` | I could not find a way for people to delete their account and its data. | Many privacy laws give people the right to have their data deleted. This is the usual baseline; it is not legal advice. |
| could not check | I could not check {part}: {why}. | So this part is not known, not safe. |
| none seen | None seen in what I could read ({count} route files, {frameworks}). | This is what Squibby could see, not a promise. |

The part's About line, always shown: "Money and fines is checked by rules on this Mac. No model was used and nothing was sent. Squibby cannot see your dashboards."

The buttons: Copy for my AI (each finding but `paid_unchecked`), Copy this list (`paid_unchecked`), I set this up outside the code (rate limit and bot check findings), Check again.

## Copy for my AI prompts

Fixed words from `strings.ts`, with only the places filled in (each place cleaned to one line and quoted, as `sendback.ts` does). The framework hint is chosen by the framework id, never by text from the project. Each prompt ends with the same three lines: "If this needs a new service or account (for example Upstash or Arcjet), tell me which and wait for my yes. Do not sign up for anything. Do not change anything else. Then run the project's build and tests and show that they pass."

- **`paid_route_open`:** "My app has routes that call a paid service with no limit on how often they can be called:" then the places ("> app/api/chat/route.ts, line 4, POST /api/chat, calls OpenAI"). "Add a rate limit to each one, per person or per IP address, that fits normal use (for example 20 calls a minute), and return a clear 'Too many requests, try again soon' message when it is reached." Hint per framework: Next.js "a limit in the route or in middleware.ts with a matcher for these paths"; Express "express-rate-limit on these routes"; Hono "hono-rate-limiter"; Fastify "@fastify/rate-limit"; SvelteKit "a limit in hooks.server.ts"; Nuxt "a server middleware or nuxt-security's rate limiter"; Remix and React Router "a limit at the top of the action"; Supabase functions "a limit at the top of each function, kept in a small table or a store such as Upstash"; Cloudflare Workers "Cloudflare's rate limiting binding"; Flask "Flask-Limiter"; FastAPI "slowapi".
- **`form_open` and `auth_open`:** "My app has public forms or sign in routes with no bot check:" then the places. "Add a bot check that people barely notice (Cloudflare Turnstile is free), check its answer on the server before doing anything, and add a limit on tries to the route. Keep the form working for people using a keyboard or a screen reader."
- **`no_privacy_page`:** "My app {has accounts, collects emails} and I could not find a privacy policy page. Draft a privacy policy page from what this code really collects and uses: list what you find (for example emails, sign in details, analytics, payment details, the services they are sent to). Mark it at the top as a draft for me to check. Add a link to it in the footer and next to every sign up or email form. Do not claim the app follows any law; I will check the text myself."
- **`tracker_no_consent`:** "My app loads {trackers} with no cookie consent:" then the places. "Add a small consent banner. Load these trackers only after a yes, keep No as easy to press as Yes, remember the choice, and let people change it later from the footer."
- **`no_delete_account`:** "My app has accounts and I could not find a way for people to delete their account. Add Delete my account to the account settings. It asks to confirm, deletes the account and the data that belongs to it in the database (find every table that holds it and list them for me first), cancels anything that bills them, and signs them out. Show me the list of tables before you delete anything."

## Protocol changes (`protocol/index.ts`)

1. **The review's new reasons.** `REVIEW_REASONS` gains `paid_route_open`, `form_open`, `tracker_no_consent`. Each reason carries only `kind`, `say`, `file`, `line` and `proof: { by: "rule", file, line }`, as today; `isReviewReason` needs no new field. `REVIEW_SILENCE_LINES` gains one line each ("In reviews of this project, do not flag routes with no rate limit.", "... forms with no bot check.", "... trackers with no consent."). The comment block above `REVIEW_REASONS` says M117.
2. **The money part of `ship.gates`.** `ShipGates` gains an optional `money` (the event without it stays valid, so a page and a runner of different builds agree):

   ```ts
   export const MONEY_FAMILIES = ["rate", "abuse", "spend", "fines"] as const;
   export const MONEY_KINDS = ["paid_route_open", "heavy_route_open", "form_open", "auth_open", "no_privacy_page", "tracker_no_consent", "no_delete_account"] as const;
   export const MONEY_SERVICES = ["openai", "anthropic", "google_ai", "replicate", "groq", "mistral", "cohere", "together", "fal", "huggingface", "deepgram", "assemblyai", "elevenlabs", "openrouter", "resend", "sendgrid", "postmark", "mailgun", "ses", "nodemailer", "twilio", "sns", "vonage", "plivo", "puppeteer", "playwright", "ffmpeg", "sharp"] as const;
   export const MONEY_TRACKERS = ["google_analytics", "google_ads", "meta_pixel", "posthog", "mixpanel", "hotjar", "segment", "amplitude", "heap", "clarity", "linkedin", "tiktok", "chat_widget"] as const;
   export const MONEY_FRAMEWORKS = ["next_app", "next_pages", "express", "hono", "fastify", "remix", "sveltekit", "nuxt", "supabase_fn", "cloudflare", "vercel_fn", "flask", "fastapi"] as const;
   export const MONEY_UNSURE = ["dynamic_routes", "unknown_framework", "matcher_not_text", "too_many_files", "unreadable", "import_too_deep", "check_failed"] as const;
   type MoneyFinding = { kind: MoneyKind; file: string; line?: number; method?: string; path?: string; framework?: MoneyFramework; services?: MoneyService[]; trackers?: MoneyTracker[]; form?: "signup" | "contact" | "waitlist" | "comment" | "other"; told?: true };
   type MoneyReport = { off?: true; findings: MoneyFinding[]; paid: { service: MoneyService; file: string; line?: number }[]; unsure: { family: MoneyFamily; why: MoneyUnsure; count?: number; name?: string }[]; seen: { family: MoneyFamily; routes?: number; files: number; frameworks: MoneyFramework[] }[]; accounts: boolean; cookieless?: string[] };
   ```

   No free text: every word on the page is made from these ids and the file, line, method and path. `file` passes `fileInProject`; `path` is a route path (`/^\/[A-Za-z0-9_\-./:\[\]*$]{0,200}$/`); `method` is one of the HTTP methods; `name` is a framework package name that passes `NAME_OK`; `cookieless` names come from a fixed list; at most 50 findings, 30 paid, 20 unsure. `told` means the person said it is set up outside the code (from memory).
3. **The "I set this up outside the code" press.** A command `money.mark`: `{ project, kind: "paid_route_open" | "heavy_route_open" | "form_open" | "auth_open", file, path? }`. It names the project, so the shell holds it to the chosen folder. The engine writes one project memory line ("Rate limit for app/api/chat/route.ts is set up outside the code (you told me).") with its source, through the memory store, and runs the check again. Forgetting the line in What I remember brings the finding back. In `groups.json` beside `review.dismiss`'s group.
4. **Settings:** `money.checks` in `protocol/settings.json`, `true` by default.
5. **Fixtures**, read by the runner's protocol tests, the pages' tests and Rust (`app/src-tauri/src/runner.rs`, beside `m104_a_...` and `m114_a_...`):
   - `protocol/fixtures/events.jsonl`: `m117e1` a `ship.gates` with a full `money` part (an AI route, an email route, a form, the paid list, a tracker, an unsure part, none seen for fines delete); `m117e2` `ship.gates` with `money: { off: true }`; `m117e3` a `review.result` rated `worth_a_look` with `paid_route_open` and `tracker_no_consent`; `m117e4` and `m117e5` refused shapes (a finding with a free text field such as `say` or `value`, a path with a space, a service not in the list), which every side must refuse.
   - `protocol/fixtures/commands.jsonl`: `m117c1` `money.mark` accepted; `m117c2` refused (a kind not allowed to be marked, `no_privacy_page`; a file outside the project).
   - Rust: `m117_a_money_part_carries_ids_files_and_lines_only_and_a_bad_shape_is_refused` checks the shapes against the same fixtures and that nothing of it is written to the log as text.

## Tests to write first

Written first, run red, then the code (ecc-tdd-workflow), each over fixture folders made in a temporary folder.

**`runner/test/m117-routes.test.ts`** (per framework, one small project each):
- Each of the 13 frameworks: its routes are found with the right file, line, method and path; files in tests, examples, scripts and built folders are not.
- Next.js Server Actions with `"use server"` count as routes. Remix `action` counts, `loader` counts as GET.
- A route made in a loop, `app[method](`, a computed matcher: said as unsure with a count, never as limited and never left out.
- A server package with no reader (Koa) is unsure `unknown_framework` with its name.

**`runner/test/m117-paid.test.ts`**:
- Each `PAID` service found by its import, and a known host by `fetch`; Python ones by `import`.
- Followed through a helper two imports deep (`@/lib/ai`), not three.
- A webhook with `constructEvent` and a cron with a `CRON_SECRET` check are left out.
- A plain route with no paid call is never flagged.
- Settings names: `process.env.OPENAI_API_KEY` lists OpenAI; a `.env` file is never opened (the reader's filter is asked, and a fixture `.env` with a key shaped value never appears in any output).

**`runner/test/m117-limits.test.ts`**:
- Each limiter in the list makes its route limited, in the file, through a wrapper, and project wide (Express `app.use`, Hono `use("*")`, Fastify `register`, Next.js middleware with a matching and a non matching text matcher, SvelteKit hooks, Nuxt middleware and `nuxt-security`, Cloudflare binding).
- Supabase `[auth.rate_limit]` does not cover an edge function.
- A told route (memory line) is `told`, never limited.

**`runner/test/m117-abuse.test.ts`**:
- Sign up, contact and waitlist forms found; each bot check makes them checked; Formspree and Netlify Forms are hosted; Clerk and Auth0 give the guidance line, never a pass; Supabase Auth passes only with `[auth.captcha]` on.
- A sign in route with no limit is `auth_open`.

**`runner/test/m117-fines.test.ts`**:
- No accounts: the privacy and delete rules are not needed.
- Privacy page found in each framework's page folder, by a footer link, by a hosted policy; not found says "could not find".
- Each tracker found; each consent tool, Consent Mode and a coded opt out make it consented; cookieless tools are listed, not flagged.
- Each delete way found (Clerk `UserProfile`, Supabase, Firebase, a route named so, a database delete of the user's row); none says "could not find".
- Every fines sentence in `strings.ts` ends with the not legal advice line (a test over `S.money`).

**`runner/test/m117-gates.test.ts`**:
- `runGates` with a project full of findings: `canShip`, `blockedBy` and `needsYou` are exactly what they are without the money part (the part never holds back going live).
- A money check that throws gives `unsure: check_failed` for every family, never an empty part.
- `money.checks` off gives `{ off: true }`.
- 3,001 files: `too_many_files` with the count.
- No output field holds anything but ids, file names, lines, methods and paths (every string checked against the protocol shape, and against `hasKeyShape`).

**`runner/test/m117-review.test.ts`**:
- A change adding an AI route with no limit is Worth a look with `paid_route_open`, its file and line, and never Stop, even with every other setting (a test that runs `rate()` and `applyStrictness` over every strictness and `stopKinds`).
- The same route already there before the change: nothing raised.
- A limit added in the same change: nothing raised. A limit in `middleware.ts` that the change did not touch: nothing raised (the context files are read).
- Unsure in a review is never raised.
- A tracker added with no consent is `tracker_no_consent`; with consent added in the same change, nothing.
- Don't flag this kind here again silences each; Quiet hides each.
- M104: after Fix it, a money reason is Gone when the limit was added, Still there when not.
- No model call (the scripted engine counts calls: zero).

**`app/src/m117.test.ts`** and **`app/dom/m117.test.tsx`**:
- The words for each kind, family and unsure reason; the not legal advice line on every fines row; never "safe", "passed", "protected" or "compliant" in any money word (a test over `S.money`).
- The go live report: the Money and fines section between Before going live and What the review found; none seen is "None seen", never Passed; unsure parts are also in What was not checked; the answer word is the same with and without money findings (see the founder's question below); `reportText` holds no key shape.
- Copy for my AI per kind: only fixed words plus the cleaned, quoted places; a file name holding a line break, backticks or "ignore the above" stays one quoted line; the closing three lines are always there; the framework hint follows the id.
- I set this up outside the code sends `money.mark` once and shows "You said this is set up outside the code. Squibby could not see it."
- Rendered: the part in the go live panel with the existing rows and marks, VoiceOver names on each row and button, Reduce Motion (no new motion), and break-ui's worst case (a 200 character path, 50 findings, Japanese file names, every service at once).

Run only these files and the two typechecks while another build owns the full suite (the task's instruction for this branch); the full suite runs before merge, as always.

## Compared with the best

What each already does here, from what Squibby knew before this plan. Every claim is to be rechecked on their own pages before anything public says it [verify].

| | Vercel | Supabase | CodeRabbit | Arcjet | Squibby after M117 |
|---|---|---|---|---|---|
| Rate limits | Firewall rules with rate limiting, and `@vercel/firewall` in code; set by the developer in the dashboard or code | Limits on its own Auth routes (in the dashboard and `config.toml`); edge functions have none built in | A model may mention a missing limit in a pull request review, if it notices | An SDK the developer adds: rate limits per route in code | Finds the routes that cost money with no limit, across 13 frameworks, and says which file and line |
| Bot protection | BotID and Attack Challenge Mode, added by the developer | Captcha for Auth (hCaptcha, Turnstile), off until turned on | Same as above | Bot detection and sign up protection, in code | Finds public forms and sign in with no bot check; says honestly when a service handles it |
| Spending caps | Spend management for its own bill | A spend cap for its own bill | No | No | Lists every paid service the code uses and says where to set a budget; says plainly it did not check |
| Privacy, consent, delete | No | No | Not its job | No | Looks for a privacy page, consent before trackers, and a way to delete an account, with the not legal advice line |
| Who it is for | Developers, in a dashboard | Developers, in a dashboard | Engineering teams, on pull requests | Developers writing code | People who build with AI and do not read code |
| When | After it is live, when set up | When set up | On each pull request | When added to code | Before going live, and on every change the AI makes |
| Words | Engineer words | Engineer words | Engineer findings | Engineer docs | Plain words, why it costs money, and Copy for my AI |
| Decides by | Rules the developer writes | Settings | A model | Rules the developer writes | Rules in code; no model decides; nothing leaves the Mac |

**Where we match.** File and line for each finding (CodeRabbit); recognising the tools developers already use for limits and bot checks (the same libraries Arcjet, Upstash and Vercel ship), so a protected route is not flagged.

**Where we are different, and better for these people.**
- It finds the gap; the others are tools the person must already know to add. A first time builder does not know to look for Vercel Firewall or Arcjet.
- Plain words, with why it costs money or risks a fine, and one Copy for my AI that the person's own AI tool can act on.
- Before going live and on every change, so the gap is caught when the AI adds it, not after the bill.
- Honest about what it cannot see: dashboards, run time routes, unknown frameworks. Never a green tick for a budget it did not check.
- Nothing leaves the Mac and no model decides, so the same project gives the same answer every time, at no cost (F29).
- Across hosts: Vercel and Supabase see only their own part; Squibby reads the whole project.

**Gaps left (not this milestone).**
- Limits that exist but are far too loose are counted as limits.
- Dashboard settings (Vercel Firewall, Cloudflare WAF, Supabase Auth captcha on the live project, provider budgets) cannot be read. Reading them through the person's own CLI on their press, as M87's Why is live broken does for Vercel and Stripe, is a later step, with the founder's yes.
- Django, Rails, Laravel, Koa, NestJS and Go servers are Could not check.
- Terms of service, a minimum age, cookie banner wording and data processing agreements are not checked.
- A deeper import trace than two files.

## Questions for the founder (answers change only the words or one default)

1. **Should money and fines gaps change the go live answer?** Recommended: no. The answer (Ready, Not ready, Not fully checked) stays about the checks as today; when the money part has findings, the answer line adds "Money and fines: 3 things worth a look below." This keeps "never Stop for these" true in the report too. The other choice: a money finding makes the answer "Not fully checked".
2. **Free or Pro?** Recommended: everyone, like the browser check (F14). It is rules only and costs nothing to run.
3. **The name of the part.** "Money and fines" (the founder's words), or "Costs and the law".

## [verify] on a real Mac

Each in a throwaway practice folder, made by `scripts/m117-practice.sh <next|express|sveltekit|supabase|flask>` (to write, with the tests), which builds a small project with known gaps. No model, no key, no account, no deploy.

1. On a real Next.js project from Lovable, v0 or Bolt (a copy in a temporary folder): the routes found match the app's real API routes, and the time the money part adds to the go live check on a project of a few thousand files is not noticeable (to measure: target under 1 second).
2. Clerk's `<UserProfile>` shows Delete account by default, and Better Auth limits its own routes by default, on their current versions.
3. Supabase `config.toml` keys for `[auth.rate_limit]` and `[auth.captcha]` match the current Supabase CLI.
4. Cloudflare's rate limiting binding in `wrangler.toml` and `wrangler.jsonc` (its key names on the current Wrangler).
5. Next.js 16's `proxy.ts` name for middleware, and its matcher shape.
6. Each "where to look" in the spending table, on the providers' real pages, before those words ship.
7. The comparison table above, on Vercel's, Supabase's, CodeRabbit's and Arcjet's own pages, before any public claim.
8. With Reduce Motion on, the part appears with no new motion; VoiceOver reads each row and button.

These go into `docs/research/technical_research.md` section 20 as item 56, and into the real Mac guide (`docs/milestones/M109-real-mac-guide.md`) when built.

## Skills to apply when building

ecc-tdd-workflow (the tests above, red first), ecc-verification-loop (the touched tests, both typechecks, the build, clippy, a diff review), security-audit (the new reader never follows links out of the project, never reads `.env`, and the copy text cannot carry instructions from a file name), break-ui (the worst case above), better-writing (every word in `S.money`), ecc-frontend-a11y (row and button names).

## Built (21 Nov 2026)

Built on `m117/cost-guard` as planned, with the changes below. No model, no key, no account, no network, no deploy; fixture projects in temporary folders only. The full suite was not run (another build owns it); only the touched files and both typechecks.

**Where the code is.** `runner/src/money/` (`text.ts` comment blanking, imports and two step following; `routes.ts`; `services.ts`; `limits.ts`; `bots.ts`; `fines.ts`; `check.ts` `moneyCheck`, `readForMoney`, `moneyOfProject`; `review.ts` `moneyFilesAt`, `moneyReasons`, `moneyHolds`; `told.ts`). `protocol/money.ts` (ids, shapes, `moneyReportOk`, the told line), re-exported by `protocol/index.ts`. `ship/gates.ts` `runGates({ money })`, `agent.ts` `gateReport`, `review/service.ts` `moneyOf`, `review/look.ts` the `money` recheck, `review/sendback.ts` the no sign ups line, `main.ts` the told ledger. Pages: `app/src/moneyFines.ts`, `moneyFines.tsx`, `shipPanels.tsx` (`money` slot), `card.tsx`, `goLiveReport.ts`, `findingShape.ts`, `model.ts`, `strings.ts` (`S.money` and the three review kinds), `settingsPages.ts`. `app/scripts/stage-engine.sh` copies `protocol/money.ts`.

**Tests (exact counts at the end of the build).** Runner: `m117-routes` 20, `m117-paid` 33, `m117-limits` 23, `m117-abuse` 19, `m117-fines` 42, `m117-gates` 9, `m117-review` 14 (160 new), plus the touched `protocol.test.ts` and `settings-registry.test.ts`: 265 pass, 0 fail across 9 files. Pages: `app/src/m117.test.ts` 16, `app/dom/m117.test.tsx` 6, plus the touched `reviewEveryDay.test.ts` and `findingShape.test.ts`: 56 pass, 0 fail. Rust: `runner.rs` `m117_a_money_part_carries_ids_files_and_lines_only_and_a_bad_shape_is_refused` passes. Both typechecks clean. Related existing files run once as a regression check, all passing: runner review, ship and settings files (14 files, 240 tests; 9 settings files, 419 tests), pages findingShape, m76, proofLine, bugbash-review, launchreview, settings files and m79, Rust `settings` (78). The tests were written beside each rule, file by file, rather than all red first.

**Changed from the plan, and why.**
1. **No `money.mark` command.** "I set this up outside the code" sends the ordinary `memory.add` with a fixed line (`moneyToldLine`: "Rate limit for app/api/chat/route.ts is set up outside the code (you told me)."). The engine counts a line only when the person pressed for it (`told.ts`, `money-told.json` in the data folder), the way Don't flag this kind here again works (`review/silence.ts`), because the memory file is inside the project where the checked tool could write the same words. No new command, no `groups.json` change, and the shell already holds `memory.add` to the chosen folder. The row says "Saved in What I remember" at once; Check again shows it marked. Fixture `m117c1`.
2. **Refused shapes are in `protocol/fixtures/money-refused.jsonl`** (7 cases), not `events.jsonl`, because every line of `events.jsonl` must parse. Both sides read it.
3. **More ids.** `MONEY_SERVICES` gained `other_ai` (the AI SDK with no named provider), `vercel`, `supabase` and `cloudflare` (hosts for the spending list). New lists: `MONEY_AUTH` (guidance rows), `MONEY_FORMS`, `MONEY_COOKIELESS`, `MONEY_METHODS`. The report gained `emails`, `deleteByEmail` and `guides`. Off is `MoneyPart = MoneyReport | { off: true }`.
4. **Ship's walker was not moved.** The money part has its own reader, `readForMoney`, with the same rules (no links, no `.env`, the 1 MB cap) plus its own skip list, so Ship's key scan and its tests are untouched.
5. **The review raises `auth_open` as `form_open`** (one protocol kind for abuse), and never `heavy_route_open` (step 7 lists only paid AI, email and SMS).
6. **The answer (founder question 1) took the recommended default:** money never changes Ready, Not ready or Not fully checked. Its could not check parts are listed under What was not checked but are left out of the answer, and the answer line adds "Money and fines: N things worth a look below." **Free or Pro (question 2):** everyone; nothing gates it. **Name (question 3):** "Money and fines".
7. **Sign in forms** (a page named login or sign in) are left to the sign in route rule, so a log in form is not called a sign up form with no bot check.
8. **Not needed is said only when everything was read.** With any fines part could not check, "No accounts or email collection found" is not said.
9. **An engine of an older build** sends no money part, and the report says nothing about it.
10. **`scripts/m117-practice.sh` is not written.** The [verify] items below still need it or a copied real project.

**Fixed after the review (21 Nov).** A limiter package that is imported but never applied no longer limits anything: an Express, Hono or Fastify route counts as limited only when the limiter is passed in its own call, used in its handler, or put on its path by a `use`; a Flask or FastAPI route only with a limit decorator in its own stack, a `RateLimiter` in its dependencies, or default limits. A limiter kept in a helper counts only when the route (or middleware) calls its limit. A webhook counts only with a verification call, not a header name alone. An app's own sign in (a password route or a password field) counts as accounts. A privacy page must be a page, not a code file named privacy. A consent check written in code counts only in the tracker's own file and only with a cookie, analytics or tracking word in its name. Apps in a subfolder (a monorepo) are read from their own folder. A limit inside an if on the path is could not check. A file whose name the part cannot carry is counted as could not read instead of throwing the part away. Not needed is never shown beside a tracker finding, and ends with the not legal advice line. The review follows the context files' imports and the files that mount a changed router, and Fix it checks again over the files found at the fixed version.

**Known limits found while building (recorded, not fixed here).** A consent tool anywhere counts for every tracker. A limiter checked inside a function the project wrote itself and passed to a route (`app.post("/x", check, handler)`) is not seen, so that route is flagged. A hand written limit (a Map of counts) is flagged; the row's words say a dashboard limit counts and offer I set this up outside the code. Next.js Server Actions behind a middleware matcher are could not check, because their page's path is not known from the action.

**[verify] still open.** All eight items above, unchanged, now `technical_research.md` section 20 item 56.

