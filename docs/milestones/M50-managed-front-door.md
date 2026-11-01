# M50: the managed front door (plan, 1 Nov 2026)

**Founder decision, 1 Nov 2026:** people do not bring their own key. Squibby pays Anthropic and charges a monthly price. This milestone builds the part Anthropic's support has already said is a standard setup: the light features (the guide, Explain, Second Look, Prompt help, picture reading and voice answers) on the plain Messages API under Squibby's own key. It reopens F10 for the first run only. Fixing still runs on Claude Code, which Squibby may not pay for without a written agreement (F22), so it keeps the person's own Claude for now and says so plainly.

Decision record: `docs/decisions/F22-company-pays-for-usage-gated.md`. Checklist for going live: `docs/launch/company-paid-go-live-checklist.md`. The usage server: `usage-proxy/`. The runner already has a managed route (`runner/src/engines.ts`, `runner/src/direct.ts`).

## What the person sees
- **First run, three screens:** hello, "Sign in with Google" (one button, no key, no card), then pick a folder. A small link under it, "Use my own Claude instead", is the old key screen. It is the only way to fix a project until the engine question is settled.
- **Home** works at once for the guide and explanations. Pressing Fix on the managed route says: "Fixing needs your own Claude for now. Add your key in Settings." The reply is the existing `MANAGED_NEEDS_OWN_CLAUDE` line.
- **Settings, Account:** the email, the plan (Free), what is left today, Sign out. The own key moves under Advanced.
- **At the daily limit:** the server's plain message, when it resets, and a button to use their own Claude.

## What gets built (all offline, no spending, the remote switch stays off)
1. **A real store and the Worker** in `usage-proxy/`: a Cloudflare Worker that receives the app's requests and the payment webhook, and one Durable Object per person so two requests can never both pass the same budget. The existing store tests must pass against it unchanged.
2. **The runner:** the Squibby sign in token lives in the Keychain beside nothing else; on the managed route the light lanes call the proxy with it. It never reaches Claude Code, a hook, a command or a log. Anything the person says is sent only to the proxy.
3. **The shell (Rust):** the Google sign in (the system browser, the loopback return and PKCE, so no password or token is ever typed into our window), storing the token, sign out that revokes it, and the switch read from the remote setting.
4. **The pages:** the new second first-run screen, the Account row, the limit message, and the words in `strings.ts`.
5. **The rules and docs, in the same change:** `AGENTS.md` rules 1 to 3 (company paid light features on the plain API are allowed; the fixing engine is never company paid without a written agreement; the own key route stays as the fallback), F22 status, `product_research.md`, T03, `CHANGELOG.md`, and the privacy words (this route is not "no server of ours").

## Tests first (rule 17)
- The Durable Object store: no two requests pass one budget; a cut short stream still charges; a suspended owner stops at once.
- The token never appears in an environment given to Claude Code, a log line, an error or a receipt.
- With the switch off, nothing leaves the Mac and the first run shows the old key screen.
- First run on each path: sign in, own key, and neither yet.
- A real browser sign in is a [verify] on a real Mac with the founder's Google client id.

## What waits on the founder, so it cannot be done here
Cloudflare account and the domain; Squibby's own Anthropic key and a prepaid balance; the Google sign in client id; Dodo (test mode first); the lawyer reading the legal pages and Anthropic's reply; the acceptable use terms published. None of it blocks the build. All of it blocks switching it on. The order is in the go live checklist.

## Not in this milestone
Payments, the fixing engine on company money, the Windows build, and any change to what Squibby shows without a sign in.

## Stop points
After step 1 and again after step 4 the full suite runs and the app is launched, before the next step. The route stays off for everyone until the checklist's items 1 to 11 are done.
