# T12. One screen capture and a snapped pointer

- **Status:** Accepted from research; open items checked in M0 spike (e). Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 12; section 14 (also sections 3, 18, 19 and 20); M0-desk-research-details.md section (e)
- **Related:** F07, F11, T01, T10

## Decision
For Show me how, Rust takes one ScreenCaptureKit capture of the display under the cursor, with Companion and password managers excluded, then redacts and resizes it on the device. Claude picks a target through a custom `point_at` tool. Rust snaps that point to an accessibility element or an on device OCR box, and a non activating overlay per display draws the pointer.

## Why
- Model coordinates are approximate, and a missed resize is the most common cause of misaligned ones; snapping makes them exact (section 3).
- Only about 33% of Mac apps expose complete accessibility data, so OCR is the second signal (section 14).
- Claude Code's own computer use needs an interactive session and a claude.ai login (section 3).

## Alternatives considered
- Continuous capture: not now; passive watching is dropped (F11).
- Raw model points: approximate, and they drift if the image is resized (pitfall 34).
- `xcap` (deprecated capture API), or trusting `sharingType = .none` to hide windows (not reliably honoured).
- `captureImage(in:)` for the zoom crop: it ignores the content filter, so excluded apps would appear.

## Pending founder decision (only if spike (e) confirms Claude Code keeps received images on disk)
None decided. Only two options keep the rule "captures of the user's screen are never written to disk":
1. API key users' Show me how calls go straight to the Messages API, so images never pass through Claude Code.
2. A supported no disk mode from Anthropic.

Pointing `CLAUDE_CODE_TMPDIR` at a Companion owned folder and wiping it after each answer still writes the screen to disk for seconds. It changes the promise exactly like rewording it, and needs the founder's explicit yes. For plan users, without an Anthropic switch: Show me how works only with an API key, or the promise changes. No Show me how code until the founder picks.

## What this means for the build
The pipeline is in technical_research.md sections 14 and 3. Rules a coding agent must never miss:
- The indicator lights **before** any capture. One press means one `SCScreenshotManager` capture, with a content filter that excludes Companion, password managers, Keychain Access and banking apps the user adds. The frame stays in memory; Companion never writes it to disk.
- Redact first: secure text fields, plus card numbers, IBANs, API keys and tokens found by OCR; refuse while secure keyboard input is on. Tell the user how many were blurred.
- Pre resize to at most 2000 px on the long edge, about 1280 px by default, well under about 3.75 MB. Treat Claude Code's "original ..., displayed at ..." note as an error in development, and scale coordinates by the resized size (pitfall 35).
- The vision session sets `strictMcpConfig: true`, `persistSession: false` and `settingSources: []`; `system/init` must list only `point_at`, `zoom` and `finish` (T10). A low confidence `zoom` crops the frame already in memory, with no second capture.
- The overlay is hidden unless a walkthrough runs; a walkthrough captures again only while it is visibly on.
- Screen Recording and Accessibility are asked at first use; never edit the approvals file. Keep Clicky's MIT notice.

## Settled by the real check (9 Oct 2026)
- **Claude Code does write the picture to disk.** With a real call on the test login, two copies appeared: the image itself in `/tmp/claude-<uid>/.../images/1.jpg` (and it stays after the call), and the whole picture as text inside the saved conversation file in the config folder.
- **What Companion does about it** (so rule 5 stays true without a new switch from Anthropic): the saved conversation is turned off for Show me how (`persistSession: false`), and Claude Code's temporary folder (`CLAUDE_CODE_TMPDIR`) is a small drive that lives in memory only (`runner/src/ramdisk.ts`, 32 MB, made on first use, erased after every answer, removed after two idle minutes and when the engine closes). If that drive cannot be made, nothing is sent. A repeat of the real check found no copy of the picture on the SSD.
- **Founder to confirm:** this keeps the promise "captures are never written to disk" in its plain meaning (a drive in memory is not stored on the SSD), and it works for plan and API key users alike. The two options listed above (API key only, or wait for Anthropic) are no longer needed. If the founder prefers the stricter wording, say so and Show me how can be limited to API key users.

## Open [verify] items
- **[verify]** (high impact) whether Claude Code writes received images to disk. The 2.1.288 binary suggests an image store under `/tmp/claude-<uid>` or `CLAUDE_CODE_TMPDIR` that only a diskless launch mode (not exposed by the SDK) skips. Spike (e) watches the folders during a real run.
- **[verify]** image resizing: answered from reading the 2.1.288 binary (a 2000 x 2000 px cap for Sonnet 5.5 and Opus 5.5, recompression above about 3.75 MB raw). Spike (e) confirms on 2.1.291 (section 20, question 14); the pre resize rule holds either way.
- **[verify]** whether macOS shows its purple capture icon for a single frame, and for how long (section 20, question 15).
- **[verify]** the Accessibility hit test may return Companion's own window, or a coarse element in Chrome.
- **[verify]** the roughly monthly Screen Recording re prompt on macOS 26 and 27 (confirmed only for macOS 15).
- **[verify]** Windows OCR through `Windows.Media.Ocr` (section 20, question 19).
- Overlay click through broke in a macOS 26.3 release candidate and reportedly again in a 26.4 beta; smoke test it on every point release (pitfall 38).

## M11 additions (16 Oct 2026, the M11 plan the founder approved, build order step 6)
Built and unit tested with stubs only; nothing here has been seen on a real screen or with a real model yet.
- **Several targets from one answer.** The vision lane may answer with up to five targets in order, each with a short line, a mark (ring, arrow, underline or box) and its screen; malformed, off picture and duplicate targets are dropped (`runner/src/lanes.ts parseTargetsText`). The page plays them in turn (`app/src/sequence.ts`): about 0.9 s lead in while the pointer flies, the line, about 0.35 s pause; only the last one waits for the click; a step below 0.4 confidence is said in words. Each target is snapped by Rust exactly as one was before (`showme_aim`, one step at a time). No second capture between targets.
- **The window is noted with the picture.** The windows on screen (owners and sizes, no permission) and the app in front are recorded under the same light as the capture. Before each target is drawn, the window under it must still be the same one in the same place, uncovered, with the same app in front (`showme::unchanged`); if not, nothing more is drawn and the person is told to press again (rule 22). A new look happens only on a new press (rule 5).
- **Every ring is watched while it is up** (found and fixed the same day): before, only the ring that waits for the click was. A step in the middle of a multi step answer, and Point at the problem's ring on a line or an error, now check their window four times a second (`anchor::watch`, `watch_ring` in main.rs) and go away the moment it moves, closes, is covered or another app comes to the front; a Show me answer then stops (no more steps drawn or said) and the person is told to press again.
- **Review fixes to the rings and the sequence** (16 Oct 2026). (1) A ring with no ordinary window under it (a menu, a dialog, the desktop; it is soft then) was never watched; now it is watched against the app that was in front when it went up and goes away when another app comes to the front (`anchor::Watched`), the your turn ring included. (2) The overlay counted its ten seconds from landing, after a flight of up to 1.6 s, while the watch and the confetti hold ran 10.5 s from the draw; now the overlay counts from the draw (`RING_MS` in `app/src/pointer.ts`), so the whole ring is watched. (3) Closing the card, holding to talk and Point at the problem now end a Show me answer still on its way or still playing: no later step is drawn or said, what was seen is forgotten at once (`showme::Pending`), and the card drops any line still waiting to be said ("hush"). A ring waiting for the click is left alone. A restarted engine also drops what was kept for an answer that will not come. (4) A lesson rings the click target, the last of the answer's targets, not the first, and the aim eval scores that one (`clickPoint`).
- **Hand drawn marks on the real screen**, with the Draw it for me pen (`app/src/marks.ts`): only on a confirmed target, every point kept inside the target's window, faded after its line, then the steady ring; reduced motion respected. A guess keeps the soft ring only.
- **More than one display, opt in.** Product doc sections 5 and 10 promise one capture of the display under the cursor, so that stays the default. A setting the person turns on ("Show me on all screens", off by default) captures every display under the same light, the cursor's first, at most four, secrets covered on each, each picture labelled "Screen N of M" for the model; the model names the screen and Rust maps the point to that display (`coords::screen_label`, `coords::shot_for`, `showme::start_on`). The Computer Use lane takes one picture only and steps aside when there are several. **Founder to decide** whether all screens should be the default; if yes, product doc sections 5 and 10 change with it.
- **Every picture that is sent is read with the careful text reader** (found in review, 16 Oct 2026). The other displays were first read with Vision's quick level to save time, but those text boxes are all the secret covering has to go on, and one misread character in a card number or a token would have left it uncovered in the picture sent to the model. Only Point at the problem, which sends nothing, still reads quickly first.
- **[verify]** on a real Mac with two displays: the labels and the mapping put the ring on the right display; how much time each extra display adds now that each one gets the careful read.
- **[verify]** with a real model: how often it gives several targets, whether their order and marks are sensible, and the duplicate rule (16 px) on real answers.

## The aim eval's hard set (17 Oct 2026, M11 wave 3, part A.5)
- `evals/show-me-how/` adds 40 asks on four synthetic busy dashboards (a deploy settings page, a database table editor, a project settings page, a code host's repository page), each in light and dark, with every target labelled in the page (`data-eval-target`). They are made up products in local files, rendered in the hidden browser the way the aim eval already renders its pages: never a real website, never the person's screen, and the pictures are not kept.
- A point is scored by the target's label, not its words, so a click on one of six Edit buttons is a miss unless it is the right one (`evals/show-me-how/score.ts`, shared with the aim eval).
- `runner/scripts/eval-aim.ts` is now dry by default (it renders and checks every target, and asks Claude nothing). It spends only with `--spend`, through the eval harness (`evals/lib/harness.ts`), with a cap per ask and a total; until the real run harness is plugged in, `--spend` is refused. This replaces the old default, which called Claude on the test plan login straight away.

## Revisit if
The internal eval of about 100 screenshots misses the ship bar: at least 80% hits, with a median under about 2.5 seconds from hotkey to pointer (targets, not sourced; section 14).
