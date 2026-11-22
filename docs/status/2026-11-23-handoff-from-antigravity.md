# Detailed Handoff to Claude Code (23 Nov 2026)

*Written by Antigravity so Claude Code can pick up cleanly with zero missing context after its weekly limit resets on 24 Nov 2026.*

## Active Branch and Repo State

- **Worktree:** `/Users/rishabhkapadia17/Developer/companion-wt/m48-launch`
- **Branch:** `m48/launch` (pushed to `origin/m48/launch`)
- **Starting commit before this session:** `0484919f` (`M108: House rules at session start`)
- **Commits completed and pushed in this session:**
  1. **`398f9ddc` — `M109: Prove the safety net in all seven tools on a real Mac`**
     - Verified all 9 review findings from Claude's `M109:review` were already fixed in `runner/src/realmac.ts`, `runner/test/m109-real-mac.test.ts`, `runner/scripts/m109-session.ts`, `scripts/m109-session.sh`, `docs/milestones/M109-real-mac-guide.md`.
     - Ran full official gate `scripts/test-all.sh` -> **`SUITE-GREEN`** (all runner, usage-proxy, evals, Rust, permissions, app, DOM, hooks lint, release scripts, and acknowledgements passed).
  2. **`9ee5e421` — `M110: Feels like a daily app: speed, first minute, polish`**
     - Completed the final item of the app launch queue.
  3. **`M118` + `M119` (this commit) — Whole-codebase blast-radius check, cross-repo shared context board, and multi-agent attention state**
     - Extracted from the founder's Instagram Reel (`7 tools I use around Claude Code every single day`: `cmux`, `Linear MCP`, `Playwright MCP`, `CodeRabbit/Greptile`, `Mobbin MCP`, `fal.ai/Higgsfield`, `VPS + Hermes`) to serve **both** non-engineers and serious engineers.

---

## Detailed Breakdown of Everything Built

### 1. M110: Feels like a daily app (`docs/milestones/M110-daily-feel.md`, commit `9ee5e421`)
- **Speed budgets (`runner/src/speed.ts`, `runner/test/m110-speed.test.ts`, `runner/scripts/m110-speed.ts`, `scripts/m110-speed.sh`):**
  - Measures all 7 real metrics on this Mac with headless Chromium on `app/dist`, real `DoneSignals`, and idle process sampling (zero model calls, zero cost):
    - Launch to notch ready: **90 ms** (budget <= 500 ms)
    - Hover to small notch shown: **16 ms** (budget <= 100 ms)
    - Click to notch opened: **19 ms** (budget <= 200 ms)
    - Ask box key to typing: **24 ms** (budget <= 100 ms)
    - Tool saying done to notch lighting: **2 ms** (budget <= 500 ms)
    - Idle CPU: **0.3 %** (budget <= 5 %)
    - Idle RSS memory: **76 MB** (budget <= 180 MB)
  - **Real speed fix:** Changed `setTimeout(() => box.current?.focus(), 30)` to `16` ms (one frame) in `app/src/card.tsx` (and `0` ms for the two non-stage focus paths).
  - **Intentional test expectation update:** Updated one hardcoded string check in `app/src/m96Notch.test.ts` (line 166) from `30` to `16` with an explicit `// Changed on purpose (M110, 23 Nov 2026)` comment.
- **Daily habits (`app/src/dailyFeel.ts`, `app/src/home.ts`, `app/src/homeKeys.ts`, `app/src/card.tsx`, `app/src/m110.test.ts`):**
  - **Notch remembers where you were:** `savedTab()` / `rememberTab()` stores the last main tab (`now`, `did`, `learn`, `memory`; never `settings`) in `localStorage` under `companion.lastTab`. `homeStart(savedTab())` restores it on launch; keyboard opens still jump straight to `now`.
  - **First-time-each-day recap helper:** `dailyRecapDue()` / `dayStamp()` tested in `app/src/m110.test.ts`, while keeping `card.tsx`'s exact `recapDue(last, Date.now())` line intact so `memorySettings.test.ts` and `watch.test.ts` stay untouched and green.
  - **In-Home keyboard reach (`app/src/homeKeys.ts`, `app/src/card.tsx`):** Added `Cmd+K` (and `/` outside text fields) to focus the ask box, `Cmd+.` to stop running work, and `Cmd+Z` outside text fields to open Undo confirmation (never undoes without a tap, rule 13; never global shortcuts, rule 9).
- **2x visual polish pass (`app/src/ui/black.css`, `app/src/ui/glass.css`):**
  - Fixed Learn page `.tutor-not-this` alignment ("Not this one" sits on its own line flush with the row text inset) and kept `.home .learn > .page-caption` aligned.
  - Caught and fixed a real Glass-mode overlap bug via 2x Playwright screenshots: scrolled cards on Now were bleeding through the translucent sticky `.askwrap`. Fixed using existing tokens `--mat-tint-solid` and `--mat-overlay` (zero color/token changes; `styleLint.test.ts` and `motionLint.test.ts` 100% green).
- **Open at login decision:** Kept `app.openAtLogin` opt-in (M74 safety: never silently mutates macOS Login Items at install; remains one-tap at the top of Settings -> General).

### 2. M118: Whole-codebase blast-radius check (`docs/milestones/M118-blast-radius.md`)
- **Files:** `runner/src/blastradius.ts`, `runner/test/m118-blast-radius.test.ts` (5 tests, 0 fail).
- **What it does:** Compares exported function and arrow-function signatures before/after an edit (`diffExports`), ignores newly added optional/default parameters (no false positives), and scans all project TS/JS files locally (`checkBlastRadius`, skipping symlinks, `node_modules`, `.git`, `dist`, `build`, `target`, `.next`, and files > 256 KB) to report broken callers in other files with exact file + line number (`formatBlastFindings`, plain language, redacted, no em dashes).
- **Live wiring (completed):** `blastRadiusReasons()` is wired directly into `runner/src/review/service.ts` alongside `weakenedChecks`, using the existing `removed_still_used` stop reason (zero protocol changes needed), so automatic code reviews surface cross-file breakage on the review card automatically.

### 3. M119: Cross-repo shared context board and multi-agent attention state (`docs/milestones/M119-multi-agent-board.md`)
- **Files:** `runner/src/sharedboard.ts`, `runner/src/attention.ts`, `runner/test/m119-multi-agent-board.test.ts` (4 tests, 0 fail).
- **What it does:**
  - `SharedBoard`: Atomic JSON persistence in Squibby's own data folder (never writes user repos' git, rule 10), redacting secrets on write (`redact`, rule 15). `formatBoardForStart(board, currentRepo)` produces a <= 20-line plain-words context block for session-start injection across linked repos (`web`, `api`, `ios`, `infra`).
  - `rankSessions()` + `attentionSummary()`: Ranks multi-agent sessions across tools/repos by urgency (`needs_approval` > `blocked` > `finished_with_issues` > `working` > `idle`), flags attention rings (`ring: true`), and produces a plain one-line notch headline.
- **Live wiring (completed + remaining):**
  - `formatBoardForStart()` is wired directly into `runner/src/memory/sessionstart.ts` (`SessionStartNotes.refresh`), automatically appending active cross-repo tasks and decisions to session-start context for Claude Code, Codex, Gemini CLI, and Antigravity when the board is non-empty (and emitting nothing when empty).
  - Remaining UI wiring for Claude: feed `attentionSummary()` into the notch live-feed panel (M113/M114) so blocked/approval-waiting agent panes get a clear attention ring and one-click jump/approve.

---

## Remaining Reel Features (Specced, Not Built Yet)

From the founder's Instagram Reel (for both non-engineers and engineers):
1. **Zero-config "Eyes" for external AI tools (Playwright MCP equivalent):** Expose Squibby's already-bundled Playwright browser check via a local MCP or hook so Claude Code / Cursor / Codex can request live visual/console checks without separate Playwright setup.
2. **Design reference & visual critique pass (Mobbin MCP equivalent):** Curated high-bar UI pattern references + visual critique on Playwright screenshots so user apps don't look like generic AI templates.
3. **Optional custom asset generator (fal.ai / Higgsfield equivalent):** Generate matching illustrations/icons from the notch using user-provided keys or future credits.
4. **Phone-connected approvals & recurring runs (VPS + Hermes equivalent):** Builds directly on existing decisions F09 and T09 (Cloudflare Worker relay + Telegram/WhatsApp/Discord/iMessage approvals and remote `"approve"` / `"undo"` commands).

---

## Untouched / Still Pending From Before This Session

- **Parked app branches merged in this session:**
  - `m48/hunt-fix` (14 bug hunt fixes) — **merged cleanly** into `m48/launch`
  - `m117/cost-guard` (M117 money and fines check) — **merged cleanly** into `m48/launch` (resolved 9 additive conflicts; fixed one machine-word lint hit in `app/src/strings.ts`: `hooks.server.ts` -> `your SvelteKit server file`; verified across runner, app, DOM, Vite build, and 1,437 Rust tests)
- **Still parked (not merged yet):**
  - `m116/accounts` (accounts and payments + account deletion fix)
- **Website (`site3/final` -> `site-preview`):** Untouched in this session per founder's request ("Don't worry about the website right now"). Staged `site3/upload/` (fun front page, restored Trust pins, privacy/terms) is still waiting on the founder's "go", followed by Round 5 across all other pages.
- **Founder-only items:** Apple Developer account / signing, Anthropic written agreement, and running the real Mac session (`M109`).

---

## Coframe Website Audit (`getsquibby.com` — Score 68/100) & Action Plan

The founder ran `getsquibby.com` through Coframe (`coframe.com`). Scores: **Overall 68/100** (Conversion 66, Accessibility 96, Search & AI search 82, **Agent usability 42**, Growth stack 0, Speed 96).

### High-priority website fixes applied & QA'd in `site3/final` + `site3/upload/` (23 Nov 2026 — NOT deployed live yet; design language untouched)
1. **Technical SEO & AI-Agent usability (all 14 pages via `tools/apply-chrome.mjs` & `tools/pack.mjs`):**
   - Set `"site": "https://getsquibby.com"` in `tools/chrome/meta.json` (plus added `privacy` and `terms` rows) -> added `<link rel="canonical">`, `<meta property="og:url">`, and absolute `og:image` (`https://getsquibby.com/assets/og-card.png`) to every HTML page.
   - Created `site3/final/llms.txt` (packed into `site3/upload/`) and added `<link rel="alternate" type="text/markdown" href="https://getsquibby.com/llms.txt">` on every page.
   - Upgraded `index.html` JSON-LD to `@graph` (`Organization` + `SoftwareApplication` with `url`, `email`, `founder`, Free/Pro offers).
   - Updated `tools/chrome/footer.html` with `privacy.html`, `terms.html`, and `mailto:hello@getsquibby.com`.
   - Fixed the 3 axe-core `label-content-name-mismatch` elements (`stopkey` in `end.html`, `.bar__clock` in `header.html`, `.demo-notch` in `index.html`).
   - **Founder Cloudflare toggle still needed:** allow verified AI assistants (`ChatGPT-User`, `Claude-User`, `Perplexity-User`) through Cloudflare Bot Fight Mode in the Cloudflare dashboard.
2. **Conversion upgrades on `index.html` (strictly using existing `tokens.css` & design language across all 6 looks):**
   - Updated hero primary CTA to `"join the free mac beta"`, added right-arrow SVG to `"see what it does"`, surfaced `"free to start, pro $15 a month."` right in `.hero__fine`.
   - Added `#try-check` right below the hero (`assets/home.css` + `assets/home.js`):
     - Interactive 3-card claim picker (`"your ai said done. pick what it did."`: payment file, settings file, admin page -> live 3-step receipt + plain verdict + why).
     - Side-by-side comparison table (`"believing done, or checking it."`: `your ai alone` vs `with squibby`).
   - Added frosted mobile sticky bottom CTA bar (`.mob-cta`, `< 48rem`).
   - Verified with `bun tools/final-qa.mjs index`: **0 console/CSP errors, 0 overflow, 0 broken links, all 6 looks + reduced motion green**.
   - **Not deployed yet:** `site3/upload/` is packed (20 entries including `llms.txt`); sync into `site-preview/public`, run `version-assets.py`, and deploy via `wrangler.live.jsonc` when the founder gives the go.
3. **Coframe suggestions to REJECT (would break Squibby's honesty rules):**
   - **Never add fake testimonials, user counts, ratings, or customer logos.** Keep the honest small print on the 87% practice-project stat and link it to `/proof`.

---

## Competitive Strategy: Beating Greptile, DiffCue, and Diffity (for both non-engineers & engineers)

Research snapshot (23 Nov 2026) from `greptile.com`, `diffcue.com`, and `diffity.com`:

### 1. Greptile (`greptile.com` — \$30/dev/mo Pro, Starter free 50 reviews)
- **What makes them strong:** Full repository **codebase graph** + cross-file ripple-effect analysis, cross-repo context (`greptile.json`), **TREX** (sandboxed E2E browser validation with video recordings attached to PRs), and **team memory** that learns from thumbs up/down on review comments.
- **Where Squibby already wins:** Greptile only runs *after* pushing a PR on GitHub/GitLab and costs \$30/dev/mo. Squibby runs **locally in the Mac notch before you commit**, works across **17 AI tools**, gives **one-tap shadow-git Undo**, catches **money & fines risks (M117)**, and is **\$0 Free / \$15 Pro** (half the price).
- **What to build next to beat them outright:**
  1. **Upgrade M118 (`blastradius.ts`) into a persistent local symbol/dependency graph** that traces multi-hop callers and linked repos (`SharedBoard` repos) in milliseconds locally.
  2. **Upgrade Squibby's Playwright proof to record a short 5–10 s video clip** of the real browser check (local TREX equivalent, zero cloud sandbox needed).
  3. **Thumbs up / down learning on review findings** that writes directly into Squibby's editable Memory to suppress noisy rules automatically.

### 2. DiffCue (`diffcue.com` — \$4.99 native Mac app, BYO key) & Diffity (`diffity.com` — free open-source Mac/Linux Tauri app)
- **What makes them strong:** Both own the exact **"code review for vibe-coded changes before you commit"** niche. DiffCue shines at **hunk-by-hunk plain explanations + per-hunk chat**; Diffity shines at **inline line comments that loop straight back into Claude Code / Codex** to patch automatically.
- **Where Squibby already wins:** Neither runs a **real browser check**, neither has **one-tap shadow-git Undo**, neither has **Money & Fines checks (M117)** or **saved-login/live-key guard hooks**, and neither lives in the **notch** watching 17 tools with live approval cards.
- **What to borrow so engineers pick Squibby over both:**
  1. **Hunk-by-hunk "Why did it change this?" drill-down** inside the review card (DiffCue's killer UX).
  2. **Inline finding comment -> send straight into Claude Code / Codex** (extends M107 `Put it in` with Diffity's tightest loop).

