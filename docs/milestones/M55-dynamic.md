# M55: Squibby feels alive (plan, 3 Nov 2026)

**What the founder said:** "make the tool more dynamic". Asked what that means, he picked all four of these: smooth motion, live progress, adapts to you, the character reacts.

**What still holds:** the look stays calm. The usual is Black with one blue accent, and nothing moves at rest (`calm-colour-by-default`, F28). Motion answers something that happened. It never loops to get attention. Reduce motion, Less motion and How lively are always respected.

## 1. Smooth motion
- **Moving between places:** Now, Learn, History, Memory and Settings change with a short cross fade and a small slide (about 180 ms, ease out).
- **Cards:** they grow in when they appear and fold away when they go, with no jump in the layout.
- **Numbers:** the time and the cost count up rather than jumping.
- **Buttons:** they answer a press (a slight press in, then back), and a hover is a soft change, never a colour flash.
- **Opening Home:** it drops from the notch with one smooth motion.
- **One set of tokens:** durations and easing come from one place in `ui/tokens.css`. Exits are faster than entrances.
- **When motion is reduced:** with Reduce motion or Less motion, everything is instant or a plain fade.

## 2. Live progress
- **The work card shows what is happening as it happens:**
  - each step ticks the moment it finishes (Finding, Fixing, Checking, Proven);
  - the files being changed appear one by one as the agent changes them;
  - each check (install, build, tests, the browser check) shows running, passed or failed live;
  - the elapsed time and the cost tick.
- **The notch shows the work too:** the current step in a few words and a thin progress line, quiet, with no sound.
- **Only what really happened:** the engine's events say what happened, and nothing is faked. A step shows done only when the engine says so (rule 14).

## 3. Adapts to you
- **The app in front.** Home's main action follows it. Only which app it is is used, never anything inside it (rules 5 and 7):
  - **an editor or AI coding app** (VS Code, Cursor, Antigravity, Xcode, the Claude desktop app, Codex): "Review what changed" when changes are waiting, otherwise "Find the problem";
  - **a browser:** "Is it safe to go live?" or "Check the site";
  - **a terminal:** "Explain this error".
- **The project's state:**
  - not checked yet: Check my project;
  - failing: Fix it;
  - changes waiting: Review them;
  - proven: Check before going live;
  - a task left half way: Carry on.
- **What you do often:** the actions you use most rise to the top of "More ways to ask". It is learned only from your own presses inside Squibby (rule 15), and can be reset.
- **A setting:** "Home follows the app in front", on by usual, with a plain help line.

## 4. The character reacts
The water bubble with its two follower bubbles reacts to real events:
- it looks toward the pointer in Lively;
- it looks at the ask box while you type;
- the follower bubbles circle while it works;
- a small splash when a fix is proven;
- a small dip when something fails;
- a gentle lift when it needs you;
- it leans toward the review card when changes are waiting.

All of it follows How lively, Reduce motion and Less motion. In Still, it reacts only to news.

## Tests first (rule 17)
- The motion tokens and the reduced motion rules.
- The live events turn into ticks only when the engine says so.
- The main action for each app and state pair, and that the app in front is never read beyond its identity.
- The "used often" order is learned only from presses inside Squibby and can be reset.
- The character's reactions for each state.

## [verify] on a real Mac
- Motion smoothness and battery.
- The notch progress line.
- Which apps are recognised in front.

## Status (3 Nov 2026)

Built in the `m55/alive` worktree, with tests first, and checked on the real pages in a headless browser (Playwright, frame sequences). Not yet run on a real Mac.

**Built**
- **1. Smooth motion:** all of it. `smoothMotion.ts` (places, cards, what stays, `CountUp`), the tokens in `ui/tokens.css`, the press and hover tokens in `ui/parts.css`, the drop from the notch. Moving between places fades the old place out first and only then the new one in, so the two never show at once (the review found text over text when they overlapped). With the light off, the room behind Home no longer drifts unseen.
- **2. Live progress:** all of it. New event `agent.file` (protocol fixtures read by the runner and the Rust shell), `runner/src/livefile.ts`, the files and checks on the work card (`jobLive.tsx`), the step on the notch with its thin line (setting `island.showStep`). Proven is never the step under way: once every check passed it stays on Checking until the result says proven (rule 14; the review found the notch saying Proven too early). While files or checks are listed, the line under way is left out, so a file is not named twice.
- **3. Adapts to you:** built, with one change from the list above. The shell tells Home only the kind of app in front (editor, AI app, browser, terminal, other) through `everyday.rs home_kind`. The project comes first: no project gives Choose a project, half way gives Carry on, failing gives Fix it, proven gives Check before going live, in every app. Only while the project is not checked yet does the app pick: a terminal gives Explain an error, anything else Check my project. Changes waiting lead Home with Review the changes in every app. The wording above ("Find the problem", "Is it safe to go live?", "Explain this error") was not used: each action keeps its one name (the audit, item 9). Settings `home.followFrontApp` and `home.usedOftenFirst`, and the Ways you use most row with Reset.
- **4. The character reacts:** all of it, in `flowflow/` (engine, controller, view), behind `character.reacts` ("Reacts to what happens"). The notch's small character stays still.

**Still [verify] on a real Mac**
- Motion smoothness and battery, with the frames a second measured in the app, not only in a headless browser.
- The notch progress line and the wider wings (`WING_MAX` 96) on a real notch.
- Which apps are recognised in front (the bundle ids in `protocol/apps.json`), and that the kind follows a switch between apps within half a second.
- That `agent.file` arrives once per real change with the real engine, not only with the scripted one.
