# M110: Feels like a daily app: speed, first minute, polish

*Status: in progress (23 Nov 2026). Founder ask (15 Nov 2026): "I hope you make this a really well made product like Wispr Flow and HeyClicky, something people consume on a day to day basis."*

## Plan

1. **Speed budgets, measured on this Mac** (`runner/src/speed.ts`, `runner/scripts/m110-speed.ts`, `scripts/m110-speed.sh`).
   - Print real numbers on this Mac and fail when any measurement is over its budget. No model calls, no money spent.
   - Budgets:
     - Launch to notch ready (`island.html` cold load to `.island` drawn): under 500 ms.
     - Hover to small notch shown (`island.html` hover event to `.island-panel` visible): under 100 ms.
     - Click to notch opened (`card.html` `opened` event to visible Home painted): under 200 ms.
     - Ask box key to typing (`opened` with `keyboard: true` to ask box focused and taking a keystroke): under 100 ms.
     - Tool saying done to notch lighting (real done marker touched via `DoneSignals` to done event): under 500 ms.
     - Idle runner processor and memory with nothing happening: under 5% of one core and under 180 MB RSS.
   - Fix the slowest: remove the unconditional 30 ms `setTimeout` before focusing the ask box when Home opens from the keyboard (`app/src/card.tsx`), focusing immediately on the current frame.

2. **The first minute.**
   - Under 60 seconds from first open to the first useful moment:
     - Practice path: 1 click from Welcome ("Try a practice project") straight to the first practice check.
     - Real project path: 2 counted screens (Welcome, Pick a project) and 3 clicks to the first check.
   - Permissions stay asked only at first use (rule 8).
   - Open when you log in (`app.openAtLogin`) remains opt in (M74: a lasting change to the Mac happens only when the person turns the switch on in Settings, General).

3. **Daily habits** (`app/src/dailyFeel.ts`, `app/src/homeKeys.ts`, `app/src/card.tsx`).
   - **The notch remembers where you were:** keep the last open main place (`now`, `did`, `learn`, `memory`; never `settings`) in local storage so reopening restores where you left off. Opening from a keyboard shortcut still lands on Now ready to type.
   - **First time each day recap:** on the first open of a new local calendar day (unless `where.after` is `off`), ask for Where was I once for that day. Show a card only when something actually happened (`recapWorthACard`). No streaks, no mood check ins (rule 16).
   - **Keyboard reach for every main action inside Home** (read only from Home's own key events, never global shortcuts, rule 9):
     - Existing: `Cmd+1` to `Cmd+4` (places), `Up` / `Down` (list rows), `Cmd+,` (Settings), `Esc` (step back or close).
     - Added: `Cmd+K` (and `/` outside a field) focuses the ask box; `Cmd+.` stops running work; `Cmd+Z` outside a field opens the Undo confirmation when Undo is available (never undoes without a tap, rule 13).

4. **Polish pass (2x screenshots of every screen and state).**
   - Fix the known Learn page padding issue: `.tutor-not-this` ("Not this one") sits on its own line flush with the row's text inset, and `.learn > .page-caption` ("What you have learned" footnote) keeps full horizontal alignment.
   - Shoot notch rest, small hover panel, small chat, Now, Learn, History, Memory, Settings, First run, and error states at 2x; inspect every shot and fix rough edges without changing any colour or theme token.

## Compared with the best

- **HeyClicky (notch companion):** matches its instant notch feel and compact keyboard reach (`Esc`, `Cmd+,`, `Cmd+K`), while keeping Squibby's strict non activating focus rule (rule 9) and explicit confirmation before Undo (rule 13).
- **CodeRabbit (AI code review):** matches fast keyboard navigation over findings and summaries, and adds local daily Where was I recaps with zero network calls.
- **Coucou (notch agent watcher):** matches fast done signal pickup (< 500 ms budget) and low idle footprint (< 5% CPU, < 180 MB RSS), backed by an automated speed gate script (`scripts/m110-speed.sh`).
- **Left for later:** real cold launch timing of the signed macOS `.app` bundle on a real Mac (`[verify]`).

## Verification and [verify]

- Built and tested with `runner/test/m110-speed.test.ts`, `app/src/m110.test.ts`, `app/src/homeKeys.test.ts`, and `scripts/m110-speed.sh`.
- Skills used (ECC): `ecc-tdd-workflow` (failing tests first for speed budgets, tab memory, daily recap, keyboard reach, and Learn padding) and `ecc-verification-loop` (build, type check, lint, full test suites, diff review).
- `[verify]` on a real Mac: measure cold launch of the signed `.app` bundle to notch visible, confirm hover open feel matches under 100 ms after `island.openDelay`, and confirm `Cmd+K`, `Cmd+.`, `Cmd+Z` inside the real Tauri panel.
