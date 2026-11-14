# M92 (B): The real test kit

Status: built 14 Nov 2026, tests pass. Not committed. Nothing reached the network, no account was made, and no real Supabase, Vercel or Stripe tool ran: the kit's script only writes files, and every tool answer in the tests is a fixture.

## Why

Label it (M86), Why is live broken? (M87) and Ask before live systems (M85) were tested on stand in data only, never on a real Supabase, Stripe or Vercel project. You have none yet. This kit is a throwaway app with three holes put in on purpose, so one guided session on your own free accounts can show each feature finding a real one. One limit, said plainly: Why is live broken?'s Database rules part reads the migration files in `supabase/migrations` on this Mac, not the live database (M87 gives it no live query), so step 9's Database rules line proves the file check only. On the real Supabase project, only Label it (step 6) looks at the live tables; the live database check stays unproven (technical research item 37).

## What was built

`docs/outreach/demo-project/make-real-test-kit.sh <new folder>` writes a tiny plain Node app (no package to install) into a folder that must not exist yet. It only writes files, only there. It never runs git, never reaches the network, and holds no key or password.

| Part | Files | The hole, on purpose |
|---|---|---|
| Supabase | `supabase/migrations/20261114000000_kit.sql`: `notes` (row level security on, anyone may read) and `signups` | `signups` has row level security switched off, so anyone with the public key can read every email |
| Vercel | `vercel.json`, `api/notes.js`, `api/signup.js`, `public/` | The guide leaves `STRIPE_WEBHOOK_SECRET` out of Vercel Production |
| Stripe | `api/webhooks/stripe.js`, `lib/stripe-signature.js` (Stripe's signature scheme with Node's own crypto) | Without its secret the webhook answers 500, so Stripe's test deliveries fail |
| Pages | `public/login.html`, `public/admin/index.html` | `/admin` looks private and opens for anyone |

`KIT.json` names the holes; `README.md` says what each file does; `.env.example` lists the three names with no values.

## Tests

`runner/test/m92-real-test-kit.test.ts` (10). The script runs with a stand in for git, curl, wget, npm, npx, bun, node, supabase, vercel, stripe, brew, open, security and psql first on PATH, each leaving a mark if it runs; none does.

- It refuses with no folder, or a folder that exists, and writes nothing there.
- It writes exactly the 14 files listed, only inside the new folder, and points to this guide.
- No key, secret or token is in any file; `.env` is ignored; no dependencies.
- Squibby's own checks on the kit, offline: the database check finds `signups` and only `signups`, in the migration file at its create line; the code reads `STRIPE_WEBHOOK_SECRET` (at `api/webhooks/stripe.js` line 19), `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_URL`, none with a fallback; the webhook route `/api/webhooks/stripe` and the private looking page `/admin` are found.
- Why is live broken? on the kit with fixture answers shaped like the real tools': all four parts broken, in test mode (no `--live`), with the Stripe part naming the endpoint address; each part said through the pages' own sentences (`strings.ts`) starts with the quoted line in step 9 below, word for word.
- `supabase db reset --linked` asks with "This resets your live Supabase database: all its data is deleted. A saved copy on this Mac can't bring it back."; plain `supabase db reset` (this Mac only) does not.
- The kit's own code: the signature check takes Stripe's scheme and refuses a changed body, another secret, an old time and an empty header or secret; the webhook answers 500 with a plain reason without its secret, 405 for anything but POST, 400 for a bad signature and 200 for a good one.

## The guided session

One step per message: you run the step, tell me what you saw, and we check it against the expected result together. You make every account and type every password yourself; never paste a key, password or secret into the chat. Everything here is free and in Stripe's test mode, where no real money moves.

**Before you start:** Squibby is open, with your AI tool connected (Now, Connect your AI tools, then the saved copy signal for Claude Code), and Settings, Fixing, More options shows Ask before live systems on (it is on unless you turned it off).

**Step 1. Make the kit.** In Terminal, in the Squibby repo: `sh docs/outreach/demo-project/make-real-test-kit.sh ~/Desktop/squibby-real-kit`
Expected: `Made /Users/<you>/Desktop/squibby-real-kit.` and the line pointing to this guide. The folder holds `api`, `lib`, `public`, `supabase` and six files.

**Step 2. Make three free accounts yourself.** supabase.com (sign up, the free plan), vercel.com (Hobby, free) and stripe.com (sign up; you can stay in test mode, no business details needed). Use your password manager.
Expected: you can open each dashboard. Stripe shows a Test mode switch, on.

**Step 3. Install the three command line tools.** `brew install supabase/tap/supabase`, then `brew install vercel-cli`, then `brew install stripe/stripe-cli/stripe` (all three through Homebrew, so Node and npm are not needed). Then `supabase --version`, `vercel --version` and `stripe --version`.
Expected: three version numbers, no errors.

**Step 4. Make the Supabase project.** In the Supabase dashboard, New project, name it `squibby-real-kit`, pick the free plan, and let it make a database password (save it in your password manager). Wait until it says the project is ready. Copy the project's reference: the short id in its address, `supabase.com/dashboard/project/<this part>`.
Expected: an empty project, its Table Editor showing no tables.

**Step 5. Link the folder to Supabase and make the tables.** In Terminal: `cd ~/Desktop/squibby-real-kit`, then `supabase login` (your browser opens; approve it there), then `supabase init` (say no to the editor questions), then `supabase link --project-ref <your reference>` (type the database password when it asks, in Terminal only), then `supabase db push`.
Expected: `supabase db push` lists `20261114000000_kit.sql` and finishes. The Table Editor now shows `notes` with 2 rows and `signups` with none, and `signups` is marked as having row level security off (Supabase calls it Unrestricted, or shows a warning). Note: you ran this in your own Terminal, not through your AI tool, so Squibby does not ask here; that is expected.

**Step 6. Label it on the Supabase Table Editor.** Open the Table Editor on `signups` in your browser, in front. Press your Show me key (or type in the ask box) and ask: "label this".
Expected: the light comes on first, then 1 to 8 short labels appear on the screen, placed so none covers another, each with a dot on the thing it names. One of them, in red (risk), sits on the row level security marker for `signups` and says, in a few words, that the table is open. They go after 30 seconds, on Esc, or when you scroll or switch windows. Home has a line about them with Close. Nothing is saved to disk.

**Step 7. Put it on Vercel, with one value left out on purpose.** In the kit folder: `vercel login` (approve in the browser), `vercel link` (yes to set up, your own account, a new project named `squibby-real-kit`). Then add two values for Production, each pasted from the Supabase dashboard (Project Settings, API) into Terminal, never into a chat: `vercel env add SUPABASE_URL production` and `vercel env add SUPABASE_PUBLISHABLE_KEY production` (the publishable key; an older project calls it the anon key). Do not add `STRIPE_WEBHOOK_SECRET`. Then `vercel --prod`.
Expected: a production address like `https://squibby-real-kit.vercel.app`. Opening it shows the two notes. `/admin` opens with no sign in. `<address>/api/webhooks/stripe` in the browser says Stripe sends POST only.

**Step 8. Point a Stripe test webhook at it, and send one event.** In the Stripe dashboard, test mode, add a webhook endpoint. Stripe has moved this menu, so it is one of two places: Developers, Webhooks, Add endpoint; or Workbench, Webhooks, Add destination, then pick Webhook endpoint [verify]. Give it the address `<your production address>/api/webhooks/stripe`, the event `checkout.session.completed`. Then in Terminal: `stripe login` (approve in the browser), then `stripe trigger checkout.session.completed`.
Expected: the trigger says it made the event. In the dashboard the endpoint shows the delivery as failed with 500 ("STRIPE_WEBHOOK_SECRET is not set on this server"). Stripe will retry it for a while; do step 9 the same day, while it is still retrying.

**Step 9. Why is live broken? on the Vercel deploy.** In Squibby, open the kit folder as a project (Home, Pick a folder). In Settings, Fixing, More options, set Stripe mode for Why is live broken? to Test. Then open Go live: Ready to go live? shows Check my live setup (Squibby did not put this site live itself, so it does not know the address). Press it, type your production address in Your live address, and press Check this address.
Expected: "4 things look broken." and these four parts, all Broken:
- Settings in Vercel Production: "Your code reads a value that Vercel Production does not have: STRIPE_WEBHOOK_SECRET." with `api/webhooks/stripe.js, line 19`.
- Stripe webhooks: "In the last 7 days, Stripe could not deliver 1 event in test mode (checkout.session.completed) to squibby-real-kit.vercel.app/api/webhooks/stripe." (the address is yours, and the count may be higher if you triggered more than once).
- Private pages: "This page opened on your live site with no sign in: /admin."
- Database rules: "This table is open to anyone with your site address: signups." This line is read from `supabase/migrations` on this Mac, not from the live project, so it shows whether or not steps 4 and 5 were done or worked.
It only reads: nothing changes in Vercel, Stripe or the folder. Copy for my AI puts all four in one message, with no value in it.

**Step 10. Ask before live systems, from your AI tool.** In your AI tool (Claude Code works; Codex, Gemini CLI and Windsurf cannot ask yet), in the kit folder, ask: "Reset my linked Supabase database back to the migrations with supabase db reset --linked." When it is about to run the command, your tool stops and asks you.
Expected: the ask shows Squibby's reason: "This resets your live Supabase database: all its data is deleted. A saved copy on this Mac can't bring it back." Answer no. The command does not run (the two notes are still in the Table Editor), and the ask is in Squibby's History. As a check the other way, `supabase db reset` without `--linked` (this Mac only) would not ask; you do not need to run it (it needs Docker).

**Step 11 (optional). Fix one and check again.** Copy the webhook's signing secret from the Stripe dashboard into Terminal: `vercel env add STRIPE_WEBHOOK_SECRET production`, then `vercel --prod`, then resend the failed event from the dashboard. Press Check again in Squibby.
Expected: Settings in Vercel Production is Fine. The Stripe part may still say Broken until Stripe stops counting the old delivery as pending [verify]; the new delivery shows 200 in the dashboard.

**Step 12. Clean up, yourself.** Delete the Supabase project (Project Settings, General, Delete project), the Vercel project (Settings, Advanced, Delete Project), the Stripe test webhook endpoint, and the `~/Desktop/squibby-real-kit` folder. Squibby and I never delete any of these.
Expected: nothing left on any account.

## [verify] in the session (also in `docs/research/technical_research.md` section 20, item 37)

- That Vercel serves `public/` and the `api/` functions with this `vercel.json` and no build step, and that reading the raw body as a stream works in a plain Vercel function.
- That a new Supabase project shows `signups` as Unrestricted after `alter table ... disable row level security`, and that the publishable key alone in the `apikey` header reads `notes`.
- That Label it's labels land on the right things on the real Table Editor, and that the Supabase checklist is picked from the window title.
- `vercel env ls production`'s real table, `stripe get` with `-d` and test mode, and the Stripe tool's restricted key reading webhook endpoints and events (M87's own [verify] items).
- How long Stripe keeps a failed test event as pending, so step 9 and step 11 read as expected.
- The Stripe dashboard path to add a webhook endpoint (Developers, Webhooks, or Workbench, Webhooks, Add destination), for step 8.
- That Claude Code shows Squibby's ask with the reason, on the real `supabase db reset --linked`.

## Suites (14 Nov 2026, again after the M92 review fixes)

- Runner: `bun test` 5767 pass, 3 skip, 0 fail (5770 tests, 282 files); `bunx tsc --noEmit -p .` clean.
- Pages: `bun run test` 4104 pass (src) and 106 pass (dom), 0 fail; typecheck clean; `vite build` built.
- Release scripts (`cd app && bun test ./scripts`): 25 pass, 0 fail (3 files, 11 of them new in `sign-release.test.ts`, 2 added after the M92 review).
- Rust: `cargo test` 1375 passed, 8 ignored, 0 failed (no Rust change, so clippy is unchanged).

No page changed, so no shots were taken.
