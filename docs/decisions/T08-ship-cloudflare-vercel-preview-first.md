# T08. Ship: Cloudflare and Vercel, preview first

- **Status:** Accepted from research; open items checked in M7 and the Cloudflare and Vercel auth question. Updated 7 Oct 2026 after review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 8; section 9 (also section 8 pre ship gates, section 18 M7, section 19 pitfall 27, section 20 question 9); product_research.md sections 6, 11 and 20
- **Related:** F10, T05, T07, T09

## Decision
Static sites and SPAs deploy to Cloudflare. Next.js apps deploy to Vercel with the user's own token. Every ship deploys a preview first, and going live takes one explicit click.

## Why
- Commercial use and free tier terms (section 1, row 8). Free tiers as checked on 16 Sept 2026 (section 9):
  - Cloudflare: unlimited static requests and bandwidth, 100k Worker requests a day, 500 builds a month, no card, commercial use allowed.
  - Vercel Hobby: 100 GB transfer, 100 deployments a day, "non commercial, personal use only". Still the best fit for Next.js with SSR.
- As with Claude, the deploy account and its billing belong to the user (section 9).

## Alternatives considered
- Netlify: 300 credits a month with a hard stop, 15 credits per production deploy, and the account pauses when exceeded. Agent redeploy loops burn credits (section 9; pitfall 27).
- Vercel as the only first host: dropped because its free plan is non commercial (product_research.md section 11).

## What this means for the build
Details are in technical_research.md section 9. Rules a coding agent must never miss:
- Deploys run in the runner's Ship adapters, never through agent Bash, so T05's deploy deny rules do not block Ship.
- Order: safety gates, preview deploy, Playwright smoke against the preview URL, then "Make it live". That approval is irreversible, bound to the checkpoint, and says so.
- Safety gates: gitleaks on the diff and on built client bundles, where `NEXT_PUBLIC_` style keys leak; Supabase tables without RLS block shipping (section 8).
- Prefer the vendor's own CLI under the user's own login. Store any token only in the Keychain.
- Batch deploys rather than redeploying per iteration. Warn business users about Vercel Hobby terms.
- "Sign in with Vercel" is GA but its API permissions are private beta; its tokens last one hour with 30 day rotating refresh tokens (section 9 has the deploy API).
- Deploys are flagged `undoable: false` and listed under "not undoable" (section 6). Rollback is one click (product_research.md section 6).
- Telegram can never approve going live; that needs the signed phone web app (section 10).
- M7 passes when a seeded `NEXT_PUBLIC_` secret blocks ship, a table without RLS blocks ship, and the preview passes smoke before "Make it live" is enabled (section 18).

## Open [verify] items
- **[verify]** Cloudflare auth for a desktop app: `wrangler login` under the user's account, or a scoped API token. Check both flows (section 9; section 20, question 9).
- How Cloudflare and Vercel sign in work for a third party desktop app. Spike both (product_research.md section 20).

## What the build settled (deploy failure rescue, 16 Oct 2026)
- "It works on my Mac but the deploy failed" is read through the person's own Vercel tool, the same way Ship calls it (the short allow-list environment, no keys, stopped if a login starts, stopped by Stop everything). It is read only: `vercel list --format json` (or `vercel list` on an older tool), then `vercel inspect <url> --logs` for the newest finished deploy, only if that one failed. It never deploys, promotes, rolls back or removes anything. The address is checked to be a `*.vercel.app` deployment and quoted before it reaches the shell.
- Only for a folder linked to a Vercel project (`.vercel/project.json`): in any other folder `vercel list` lists every project's deployments, which would be someone else's failure. A folder Vercel builds from GitHub but that was never linked here gets nothing; `vercel link` in the project folder fixes that.
- When the tool is missing or signed out, the person reads one plain line with what to do (`npm install -g vercel`, or `vercel login` in Terminal). Signed in is only whether the Vercel tool's login file exists; it is never opened.
- `runner/src/ship/buildlog.ts` finds what to point at in the log: the line Next.js, Turbopack, TypeScript, Vite (Rollup and Rolldown), esbuild or ESLint stopped at; an import that cannot be found, including a file named with a capital that the code asks for in small letters (fine on a Mac, not on Vercel), whether the bundler or TypeScript's "Cannot find module" says so first (TypeScript keeps its own words for a file that is there or a package, since missing types may be the cause); the name of a missing setting (from the tool's words, or Supabase's "supabaseUrl is required", "supabaseKey is required" and the `@supabase/ssr` "URL and Key are required" matched to the names the code reads, each named with "or" when the build cannot tell which one is missing), with the line that reads it and whether the Mac has it in a local `.env` file; or a Vercel project setting (Output Directory, Root Directory, Node.js Version). Names only, never values, and the words are cleaned of secrets. The first failure the build printed wins; "Command ... exited with 1" is never passed off as the cause.
- A deploy's line is ringed only when that file and line are in this folder and, when the log shows the line, it reads the same here. Otherwise it says in words that this folder may not be the version that was deployed (rule 22). A deploy problem with no line in this folder (a setting Vercel lacks, say) is Companion's own sentence, so the card says it and the screen is not looked at for it.
- Point at the problem reads the deploy only when the project's own checks pass here (or there is nothing to check), so a problem on the Mac always comes first. Rescue adds it to its evidence whenever the folder is linked. The build log is not stored.
- Not proven: no real Vercel deployment's log has been read. The Next.js 14, Vite 8 and TypeScript parts of the test logs were captured on this Mac; the Vercel lines around them, and the Vite 5, Prisma, ESLint, Output Directory, TypeScript "Cannot find module" and Supabase samples, were written by hand in their formats. The `vercel list --format json` and `vercel inspect --logs` output shapes come from reading the Vercel tool's package, not from running it against an account. Needs the founder's Vercel login and one broken deploy.

## Revisit if
Cloudflare's or Vercel's free tier or commercial use terms change, since those terms are the reason for this split (section 1, row 8).
