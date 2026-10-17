# M11 wave 3: ready for real Claude, home in the notch, the companion from anywhere (17 Oct 2026)

Approved to start by the founder on 17 Oct 2026, with the answers recorded in F18. Part B (rebindable hotkeys in general, voice settings, accessibility pass, small gaps) waits; general assistant features stay out of the launch.

## A. Ready for a real Claude key (so the $72 of tests measure quality, not avoidable errors)
Checked against the current Claude API notes on 17 Oct 2026:
- Claude Sonnet 5.5 refuses "thinking off" (`thinking: {type: "disabled"}` returns 400). The vision lane (Show me how, default Sonnet 5.5) sends exactly that, so on default settings every Show me request would fail. Claude Opus 5.5 also refuses it at every effort level; effort is the control there (default medium).
- Claude Sonnet 5.5 and Opus 5.5 accept computer use only through `computer_toolset_20260801`; `computer_20251124` (what `runner/src/aim.ts` sends) returns 400.
- Forced `tool_choice` (`any` or `tool`), assistant prefill and non default sampling (temperature) return 400 on the new models: audit every call.
- Prices per million tokens (input / output): Opus 5.5 $4 / $20, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50 (Haiku 4.5 is $1 / $5). Haiku 5.5 for the fast lane is a measurement question for the eval, not a guess.

Work:
1. Fix the above, tests first, with a fallback where a request shape cannot be checked without a key.
2. `real-verify.ts` must handle the new loop card (three identical failures now stop and ask) instead of hanging.
3. One real run harness: bundled binary, key read from the `companion-dev` Keychain item in code, throwaway `CLAUDE_CONFIG_DIR`, explicit `settingSources`, `strictMcpConfig`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, a check that `system/init` lists only the expected tools, a per case and a total spending stop, and a dry mode that spends nothing.
4. A smoke script (about $0.50, not run until the founder says go) and one checklist of everything marked "unproven until a real run".
5. The eval sets themselves, built now so the key time is only running them: fix cases (the 15 rescue projects turned into fix cases plus 10 AI builder breakages), the loop breaker set (5), seeded risky diffs for the second model review (10), Explain scoring, and a synthetic hard set for pointing.

## B. Home in the notch (F18.1)
A non activating island at the notch (a pill at top center where there is no notch) that opens downward into Home: Now, What I did, Learn, Memory, Settings. The current card's content moves into it. Hidden in full screen apps and from screen sharing; never takes focus by itself.

## C. The companion comes from anywhere (F18.2)
The character docks on any edge or corner, per display, and when it has something it comes beside the window it is about, never over it, then goes home. Reduced motion respected. The art and the water theme come with the founder's designs.

## D. Two key hold to talk (F18.3)
Option and Space by default, held to talk; a plain message and a short picker of free two key chords if it is taken. Hints and docs updated.

## How it is built
Same as waves 1 and 2: one builder per area in its own worktree, tests first, the full suite green, an adversarial review, fixes, then the lead merges one by one with the suite before each merge. Nothing is launched, nothing makes a sound, no real Claude runs.
