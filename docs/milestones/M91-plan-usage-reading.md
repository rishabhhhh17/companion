# M91: The real plan usage reading

Status: built 14 Nov 2026, tests pass. Not committed. Nothing was spent on a real model in any test: fixtures and fake query functions only, in temporary folders.

## Why

M89 built the usage runway, but the plan route's `rate_limit_event` was read from the SDK's type definitions only. On 14 Nov 2026 the founder approved one real run in chat: their own plan login (a Max plan), the SDK's bundled binary, `CLAUDE_CONFIG_DIR` unset, `settingSources: []`, `strictMcpConfig`, no tools, haiku, "say ok". It showed the types were not enough.

## What the real run showed

- Message order: `system/init` (`apiKeySource: "none"`, no tools, no MCP servers), assistant, assistant, `rate_limit_event`, result/success.
- The `rate_limit_event` comes **on every turn**, even with `status: "allowed"`, not only near the limit.
- It has **no top level `utilization`**. The share used per window is in `rate_limit_info.unifiedWindows`: `five_hour {utilization: 0.2}` and `seven_day {utilization: 0.46}`, each a fraction from 0 to 1 with its own `resetsAt` in unix seconds. `unifiedWindows` is not in the SDK 0.3.293 type.
- `rateLimitType` was `five_hour` although the week was the fuller window. `overageStatus: "rejected"`, `overageDisabledReason: "org_level_disabled"` and `isUsingOverage: false` came too (not used).
- The SDK's experimental usage call said `rate_limits_available: true`, `subscription_type: "max"`, and whole percents (21 and 46) with ISO resets, plus a `limits` list. Its name says not to rely on it, so product code never calls it; it is noted in the research doc only.

The shape (numbers only, stand in ids, no words, account or organisation) is kept as `runner/test/fixtures/real-run-1114/plan-route-say-ok.json`.

## Built

- **Engine** (`runner/src/runway.ts`). `fromRateLimitEvent` reads `unifiedWindows` and shows the window closest to its limit, with that window's own reset. A tie goes to the window Claude named. Near or reached (`allowed_warning`, `rejected`), the window Claude named is shown, since its reset is when work can go on; with no share of its own (the Opus week, say) it is shown with the top level reset and no percent (review fix 4). A top level `utilization` is still read, for the window `rateLimitType` names. Status stays as before: allowed is room, allowed_warning is near, rejected is out. Window shares are read with the new `fractionPct` (always a fraction: 1.02 is 100%, never 1%); `percentOf` stays for the top level value. Broken window entries are left out. The runner already tells the pages only when the reading changed, so the event on every turn is sent once.
- **The notch's ring** (`app/src/runway.ts runwayMark`, `windowName`, `NEAR_PCT`). It names the window and says the share is used, on two small lines like the panel's own head: "Week" over "46% used", or "5 hour" over "91% used" (review fix 2), and its label says "The Claude week limit is 46% used. It resets on Wed at 9:00 am." It turns amber from the mark picked in Warn me before a big job (`runway.warnAt`, `nearPct`), or from 80% (`NEAR_PCT`) when that is off, even while the plan still says allowed, as the real route says allowed on every turn (review fix 3). A window it cannot name (overage, other) keeps the M89 words.
- **Home's warning** (`warnTitle`). Unchanged rule: near or out as Claude said, or the share at or above `runway.warnAt` (80% as usual). Its title now names the window: "The Claude week limit is close".
- **Words** in `app/src/strings.ts` under `m91`. No new settings. One protocol change from the review: `usage.runway` may carry the next window (`nextPct`, `nextResetsAt`, `nextWindow`, all three or none), with a fixture (`m91e1`) read by the runner, the pages and the Rust suite.
- **The subscription route stays behind its remote switch, off** (rule 3). Nothing here turns it on.

## Review fixes (14 Nov 2026)

1. **The reading outlived only one window.** With the 5 hour window at 85% (reset in 2 hours) and the week at 84%, the 5 hour window was shown, and once it reset the reading ended: no ring, and Run it started a big job with no warning while the week was 84% used. Now the runner also sends the fullest window that resets later (`nextPct`, `nextResetsAt`, `nextWindow`), and `runwayNow` switches to it when the shown window resets, as room or close by its own share (the plan's near or reached was about the window that reset). The warning now starts at or above `runway.warnAt` in that case too.
2. **The ring's short text did not say used.** "Week 46%" could be read as 46% left, and "5 hour 85%" like a time. It is now the window on a small line over the share used: "Week" over "46% used", "5 hour" over "85% used". On one line ("Week: 46% used") the shots showed the review's free space was not there: the headline "Last check passed 30 minutes ago" was cut by 13 points at the panel's 560 point width. Two lines make the ring 83 points wide (121 on one line), and the headline fits whole.
3. **The ring's amber did not follow the setting.** It was fixed at 80 while Home's warning followed `runway.warnAt`. The ring now uses the same mark (80 when the warning is off or unknown), so at 70 both start at 70 and at 90 both start at 90.
4. **Near or reached on a window with no share named the wrong window.** A rejected `seven_day_opus` with only the 5 hour and week shares showed the fuller of those, with its reset. Now it is the Opus week, with the top level reset and no percent ("The Claude Opus week limit is reached").

## Tests

- Review fixes: `runner/test/m91-plan-runway.test.ts` (2 more: the next window, and a named window with no share), `app/src/m91.test.ts` (6 more: the next window kept and switched to, reached then the week by its share, the ring's amber at 70, 90 and off, the Opus week named), `app/dom/m91WarnAt.test.tsx` (4: the ring and Run it agree at 70 and at 90). Changed on purpose: two runner expectations now include the next window; the short text expectations are now "46% used" with the window over it ("Week"), in `app/src/m91.test.ts`, `app/dom/m91.test.tsx` and `app/dom/m89.test.tsx` (one test); the Rust fixture check counts four runway readings and allows the three next keys.
- Runner: `runner/test/m91-plan-runway.test.ts` (14: the real event, the 5 hour window, the three states, the named window near or reached, a tie, fractions above 1, broken entries, a top level utilization beside the windows, resets, an unknown window, the protocol, the real message order through the engine, once per change through the runner). `m89-runway-spike.test.ts`: the header and the plan route test now use the real shape (that test was split in two; the old assertion is kept as the second).
- Pages: `app/src/m91.test.ts` (10), `app/dom/m91.test.tsx` (4: the ring on the real reading and at 85%, Run it starting at 46% and asking first at 85% of the week).
- Expectations changed on purpose: in `app/dom/m89.test.tsx` the `near` reading has `window: "five_hour"`, so the warning's title is now `S.m91.warnTitle("5 hour")` (two tests), and the ring's label and text name the 5 hour window (one test).

## [verify] on a real Mac (also in `docs/research/technical_research.md` section 20, item 34)

- Resolved: the plan route event on a real Max plan (one run, 14 Nov 2026).
- Still open: the event near and past the limit (`allowed_warning`, `rejected`, and what `unifiedWindows` holds then). The real run had room left; those cases are tested with stand ins only.
- Still open: other plans (Pro, Team) and the per model weeks (`seven_day_opus`, `seven_day_sonnet`), which the run did not send.

## Suites (14 Nov 2026)

- Runner: `bun test` 5755 pass, 3 skip, 0 fail (5758 tests, 281 files); `bunx tsc --noEmit -p .` clean.
- Pages: `bun run test` 4097 pass (src) and 102 pass (dom), 0 fail; typecheck clean; `vite build` built.
- Rust: `cargo test` 1375 passed, 8 ignored, 0 failed (no Rust change).

## Shots

Taken with the stand in shell, headless Chromium, scale 2: the panel with the real reading (Week 46%, grey), the 5 hour window at 85% (amber), and Home's warning at 85% of the week ("The Claude week limit is close"). After the review: the week at 46% (the headline whole), 72% with the warning at 70 (amber), 85% with the warning at 90 (grey), the week at 84% after the 5 hour window reset (amber), and the 5 hour window at 100% while a job runs.
