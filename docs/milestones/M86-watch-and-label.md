# M86: Watch what changed, and Label it

Status: built 14 Nov 2026, tests pass. Not committed. Nothing was spent on a real model: fixtures and stand in models only.

The why comes from the checked research of 13 Nov 2026: synthesis section 3 (feature 6) and section 4, visuals.md feature 1, and the founder's ask for HeyClicky style drawing on the screen (M84-86 plans, section M84, "Label it"). The complaint groups are the research's own: B (false done, for example B8, "27 false claims in a day", CC #106546) and E (setup screens: Stripe webhooks, Vercel production values, Supabase row level security).

## (a) Watch what changed

After each review, a short drawn replay of what the change did, made only from facts the review measured.

**The fact sheet** (`runner/src/review/replay.ts factSheet`): the files changed (names only, at most 8 drawn, the rest counted; settings and key files never named) and which part of the app each is (`partOf`: pages, server, database, styles, tests, settings, packages, other, from the path alone); the project's checks with how each ended and the exit code of the last command it ran (`agent.ts reviewRuns`, from the proof ladder's own `runs`); and the proof screenshot's path. The screenshot is the hidden browser's picture of the app being built (never the screen), saved with the receipts under Make pictures and Pictures to keep (`agent.ts keepReviewShot`), only once the page opened.

**The beats:** 3 to 6, each one sentence and one drawing step: the whole list of files (`count`, the opening, which names every part), a file, a part of the app, a check, or the verdict (last, exactly once). The rules write them with no model (`ruleBeats`). Checks that did not run are never said to pass; the verdict then says the change is not proven. The proof screenshot has no beat and no box until the board can show the picture itself (review fix, 14 Nov: an empty grey "Your page" box read as broken).

**The validator** (`validateBeats`) rejects a set whose verdict is not the last beat, or comes more than once, and a beat that: names a file or folder not in the sheet (by path or by its own name), draws a file, part or check not in the sheet, says something passed when nothing did or failed when nothing did, says it works, is working, fixed, ready, safe, proven, done, all good or has no problems unless a check passed and none failed (said as not done, it is fine), gives an exit code no check gave, gives the wrong number of files, is more than one sentence or 120 letters, or holds markup. The protocol checks the same refs again (`protocol/index.ts replayOk`), and so do the pages (`app/src/replay.ts replayOf`): a replay that breaks a rule is dropped whole, never mended.

**The model call** (`makeReplay`, `replay.model`): one call per review on the cheap lane, on the person's own key, booked like any other. It gets the sheet as data (never a line of code) and may only arrange it. Its answer is capped at 600 tokens: asked of the plain API lane as `max_tokens`, and cut by the runner itself on every lane at about 2,400 letters (Claude Code cannot be told a max). An answer that fails the validator, or is cut off, is thrown away and the rules' beats are used; what it cost is still booked. When a lane throws on being stopped (cut off, or past its time), the cost is estimated from the request and the letters already seen, four letters a token, at the quick model's price (`spentSoFar`).

**It never holds up the review:** `review.result` goes out at once with the rules' beats. The model's call then runs on its own limit of 8 seconds (`REPLAY_TIMEOUT_MS`), and its replay follows as `review.replay` (protocol fixture `m86e3`), only when it checked out, for the card's own review. The pages check it again and put it in place of the rules' replay. Never sent with "What a review may send: checks only", for the key practice, or at the day's limit.

**The cost, measured with the stand in model's token counts** (four letters a token, `runner/test/m86-replay.test.ts`): the biggest possible sheet (8 long paths, 4 checks, a screenshot) is under 1,200 tokens in with the instructions, and the answer is at most 600 out. On the quick model (Haiku 4.5) that is under one cent per review, worst case. The plan said off by default only past a few cents, so `replay.model` is on as usual. **[verify]** the real token counts and cost on a real review.

**Where it shows:** on Home's review card, under its first lines (`app/src/replayView.tsx`): the board (files down the left with their part, checks down the right), each beat's mark drawn on with the hand drawn pen (`sketch.ts`) in its meaning colour, the beat's sentence under it, who arranged it, and Watch again. The board fills the card's text column (320 to 640 points wide, drawn one to one so its words keep their size) and is only as tall as what it shows; the sentence line is as tall as the longest sentence, so nothing jumps. The notch keeps its pass or fail tile (review fix, 14 Nov: an 84 by 44 thumbnail with no words was unreadable and hid the tile that said the checks failed).

**Timing:** each beat lasts its words at 2.6 words a second (at least 1.4 seconds), times the speed (slow 1.4, normal 1, fast 0.7).

**Settings** (Fixing, More, Watch what changed): `replay.show` (on), `replay.speed` (normal), `replay.reduceMotion` (Like my Mac: still when the Mac or Squibby's Less motion says so; Still; Always draw), `replay.model` (on).

## (b) Label it

Ask with the Show me key or the ask box: "label this", "what are these settings?", "which of these do I need for webhooks?" (`app/src/labelReveal.ts labelAsk`). A question with click, press, tap, where, which one, select or choose in it is Show me's own pointing (labels never point), and so is a walkthrough's next step or a look after a click. The press takes Show me how's own path: the light first, one capture, secrets covered, nothing written, Screen Recording asked the first time. The engine asks for up to 8 labels as data (`runner/src/labelit.ts`): a point on the picture, the labelled thing's own box (optional), at most 4 words, an optional one line note, a tone (info, look here, risk). It never clicks or types. The picture is dropped as soon as the answer is in, and the look is booked.

**Checked hard in Rust** (`app/src-tauri/src/labels.rs validate`, like `diagram.rs`): 1 to 8 labels, each point inside the picture, at most 4 words and 32 letters, a note of one plain line of at most 100, a known tone, no markup or control characters, nothing but its data. The page hands the engine's answer to the shell (`showme_labels`), which checks it, takes what was seen (so it is drawn once), and draws it over the display the picture was of.

The prompt also says never to make a label that only repeats the text already on the thing. A box must be inside the picture and around its point (4 pixels slack), checked in the runner, the protocol and Rust.

**No overlaps** (`app/src/layout.ts placeLabels`, the rule from visuals.md): the dot sits on the labelled thing's edge (its point when there is no box) and a label takes the first side that fits on the screen past that edge (right, left, below, above); no label covers another label, a dot, or any labelled thing's box (a box over a quarter of the screen is not kept clear, and only when there is no room at all may a label go over a thing); one that would land on another label, or on another label's point, moves the least it can, up or down before sideways, and earlier labels keep their places so the order holds. 400 random screens of up to 8 labels in the tests: never an overlap, always on the screen.

**Reveal:** one after another, 90 ms apart, a short fade and slide; with Reduce Motion all at once with no motion. Lines and dots in meaning colours from the tokens: info blue, look here orange, risk red.

They are placed against the display the shell names (`w`, `h` in `overlay-labels`), never the panel's size at that moment (it is resized in the same tick).

**They go** after 30 seconds, on Esc (the screen's Esc), Stop everything, a newer question, Squibby being hidden, or as soon as the window under them moves or changes (the Show me ring's rule, F17 rule 22). When they go by themselves the shell tells Home (`done`, or `window_changed`), so Home's line about them ends with them; that line has Close, and a voice Show me ends when they are drawn. It says Esc clears them only when Esc does (`home.escStops`); otherwise "They go in 30 seconds."

**Setup checklists** for Supabase, Stripe, Vercel, Clerk, Firebase and GitHub: the shell reads the front window's title on a Label it press only, after the light came on and the capture was taken (inside the ask callback; `ax.rs front_window_title`), and `labels::guide_from_title` picks the product named last, whole words only. The engine adds that product's short checklist to the question so a label can mark a risk in red with the plain words why. Only an id the shell named is taken, never one from the question's words.

**The overlay is never in Squibby's own captures:** every capture leaves out every window of Squibby's process with ScreenCaptureKit's window exclusion (`macos_see.rs capture_display`), so labels, rings and replays are never sent as part of the screen. A test holds that line.

## Not built

- The small bar beside the labels with the question, Close and Keep. The overlay panel ignores the mouse, so a clickable bar needs its own panel. Today Esc, Stop and a new question clear them, and they go after 30 seconds.
- Spoken replays (the replay timed to the voice). Silent timing only.
- The full size replay on the screen from the notch ("Watch"): the notch shows its tile, and See it opens Home's card with the replay.
- The proof picture on the board: it needs the picture shown through the asset protocol first (not turned on today).

## [verify] on a real Mac

- The replay's real token counts and cost on a real review (stand in counts only so far).
- Label it end to end: a real capture, the model's points landing on the right things, the title read for the checklist in Safari, Chrome and Arc, and the labels going when the window moves.
- The overlay's labels left out of a second Show me capture taken while they are up.
- How the drawing feels at each speed.
- That the model's boxes are tight enough on a real screen for labels to sit clear of what they label.

## Shots (fixtures only, never a real capture)

Served from `app/dist` with a stand in for `window.__TAURI__`, shot with Playwright at 2x: Home's review card mid drawing and still (wide and tall; a passing review, and a failing one, which never has a proof picture), the notch hover with its tile, and Label it over an invented settings page with each thing's box (all in, revealing, and Reduce Motion).
