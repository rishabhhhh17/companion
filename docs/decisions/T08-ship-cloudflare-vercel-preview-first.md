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

## Revisit if
Cloudflare's or Vercel's free tier or commercial use terms change, since those terms are the reason for this split (section 1, row 8).
