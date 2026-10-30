# Squibby, seen whole: an executive review and the product it should be

*A read only review of branch `m36/type`, from the checkout at `/Users/rishabhkapadia17/Developer/companion-wt/m36-type`. Sources: six surface audits, three separate review angles (focus, craft and the person using it) and the review screenshots. Every claim points to a file and line or to a screenshot. "Needs the founder's yes" marks anything that would change a founder decision (an F record in `docs/decisions/`) or a choice the founder made during a build. Where two founder decisions disagree with each other, this review flags the conflict and does not pick a side, as AGENTS.md requires. Technical words are explained in the appendix at the end.*


**Status after this review (30 Oct 2026, evening).** Two findings were fixed the same day by the better-interface review's milestone, which took the number M44 (docs/design/2026-10-30-better-interface-review.md): M15 (the Claude notice pushing the ask bar under the side list) and the Node line in F4 that pointed at a missing button. The build order in section 10 therefore starts at M45; read its "M44" to "M48" as M45 to M49.

---

## 1. The verdict in five lines

1. The promise is right and the engine under it is honest. It never calls a partial pass proven, it stops after three identical failures, and Undo leaves your own edits alone.
2. The screens on top of that engine let the promise down. In one case they contradict themselves: after Undo, the receipt says "Undone." while the proof line, the Home headline and the notch still say "Checked and working" in green.
3. Squibby tries to be many products at once. Beyond the hero it ships file conversion, watch routines, Google connections, Second Look, Draw it, type by voice in any app, Prompt help, Show me how, Explain and lessons. It has nine global hotkeys at launch and 146 settings. The research names exactly this risk: "doing many things at 60%". F16 said to launch with one job.
4. The "cheap" and "childish" feeling is not about colour. About six restyles in four days (CHANGELOG.md, 27 to 30 Oct) did not fix it, because the real problem is structure: no focus, no single verdict, and a mascot that never sits still.
5. It is not shippable as it stands. A quarter of it would be, once the founder has watched it work on a real Mac. Nothing since M29 has been.

---

## 2. What Squibby is, in one sentence, and who it is for

**Your AI built it and something broke. Say what is wrong, or press one key, and Squibby finds what broke, fixes it, proves it works with your project's own checks and a real browser, and hands you a receipt with Undo, on your own Claude, a few cents at a time.**

It is for someone like Maya. She sells candles. Lovable built her shop, and this morning the signup button stopped working. She is not technical. She is scared of making it worse, scared of a surprise bill, and has already lost an afternoon going round in circles with her AI. Judge every pixel, word and motion by one question: does this make Maya calmer and closer to a working shop, or does it make her think about the tool?

---

## 3. What is genuinely good and must be kept

These parts are strong. Protect them through every change that follows.

**The promise.** "Your AI built it. Let's finish it." (strings.ts:286), with "I find what broke, fix it, and prove it works. You stay in charge of every change." (strings.ts:287). Do not touch it. firstrun-1.jpg is the best screen in the product.

**An engine that refuses to overclaim.**
- A pass with gaps is marked "partial" and is never called proven (runner/src/agent.ts:1109).
- After the same failure three times, it stops and asks (agent.ts:1116-1124).
- Proof chips show only checks that really ran, each with an icon and a word, not colour alone (proofChips.ts:9-14).
- blockedNote ("2 actions were not done") stops "Done" from being read as "all of it" (model.ts:1194-1199).

**Undo that respects the person.** By default it leaves your own edits alone and names them (undoWords.ts:10-13). It offers "Put those back too" with its own confirm. The confirm puts focus on the safe choice (confirm.tsx:16-18). The confirm copy says what happens to your later edits (strings.ts:107-109). This is the most trustworthy writing in the product.

**Approval cards with the right shape.** A plain question for the kind of risk, the exact command, and a line about Undo (approvals.ts:22-29, card.tsx:1752-1765). The keyboard lands on "Don't allow", never on Allow (card.tsx:574-581 moves focus to `data-safe`, which Don't allow carries at card.tsx:1762). An unanswered card counts as no and says so (model.ts:528-531). Anything that cannot be undone, or that touches git, is never answered in the notch; it gets "Look first" (islandPanel.ts:14-15).

**The before and after picture.** A picture of the fixed page with the change circled, on by default (protocol/settings.json:117). It is the most convincing proof the product has.

**Honest money.** Cost is shown on the person's own Claude and never marked up (strings.ts:143). There is a $10 a day limit per project (runner/src/spending.ts:7). It is invisible today, but it exists.

**Careful key handling.** A password field, emptied the moment the key is saved (onboarding.tsx:94), stored in the Keychain, and checked once, with a specific sentence for each result (strings.ts:399-405).

**Value before any ask.** The first run plays a recorded fix before it asks for a key, a folder or a permission, and it says honestly that nothing on your Mac was changed (strings.ts:357). No permission is asked during setup (strings.ts:310), as rule 8 requires.

**Notch engineering.** The notch animation updates the screen directly instead of redrawing the whole page each frame (island.tsx:47-49). Hover timing is tested: it opens after 400 ms and closes after 300 ms (island.rs:339-340, 705-736). A question in the notch ignores clicks for its first 600 ms, so a click meant for something else cannot answer it (islandPanel.ts:18-19). The Prompt help "use this suggestion" key exists only while a suggestion is on screen, never at launch (keymap.rs:165). Most notch apps get this wrong.

**The press against the edge.** A drag measures how hard you push (docking.rs:245). A tuned bounce flattens the drop against the real screen edge (engine.ts:54). It is the one interaction that feels like a real material. The lighting on the water (shaders.ts:100-109) is skilled.

**The settings registry.** One typed list with safety floors that cannot be turned off: the browser check always runs (settings.json:112), and no answer means no (105, 114). Search reaches every setting (settingsRows.ts:82). Most settings can therefore be moved out of sight without being deleted.

**Accessibility done with care.** The notch button states its status in words for screen readers (home.ts:296), focus moves to each first run heading, Reduce motion is handled everywhere, and card.tsx announces changes to screen readers throughout.

---

## 4. What is wrong, ranked

### Fatal: each one alone would sink the launch

**F1. After Undo, most of the screen still says the fix is proven.**
- *Evidence:* model.ts:440 and :483 set `receipt.undone = true`. Inside the receipt, card.tsx:1998 then shows "Undone." (strings.ts:106), and card.tsx:556 hides the picture and "Show me what changed". But everything else that shows the verdict ignores it:
  - receiptProofWords (model.ts:1288-1292) still returns "Checked and working", and the proof line and chips under it are not gated (card.tsx:1958-1964).
  - heroWords (homeHero.ts:35-38) keeps the Home headline in its "done" tone.
  - The notch card stays green (islandPanel.ts:36-38, style.css:606).
  - The practice path does handle it ("the fix was undone, so the problem is back", model.ts:87), so the main path is the inconsistent one.
- *Why it matters:* proof is the whole product. A screen that says "Undone." and "Checked and working" at once, over a broken project, is one screenshot away from ending the only claim that sets Squibby apart.
- *Fix:* one tested verdict function over three inputs: the proof (passed, partial, failed, skipped), how the task ended (done, stopped, limit, needs you), and whether it was undone. Every surface reads it, and no surface decides "proven" on its own. This comes before everything else.

**F2. The Settings a real user opens is not the one anyone designed.**
- *Evidence:*
  - The gear opens a separate window first (homeHero.ts:52).
  - Its side list groups pages through settingsGroups.ts:6-12, which only knows the old section names, so all nine pages fall under "More".
  - settings.html lacks the `home-page` class, so none of the M34 or M43 styling applies. On a Mac in light mode it renders on a white page (#ffffff).
  - settingsWindow.tsx:40 checks for a page, `home`, that no longer exists.
  - settings.jpg came from the browser preview, not the real window, which is why nobody has seen this.
- *Fix:* one Settings surface in the same look as Home, grouped by the current page names, plus a test that every page is grouped.

**F3. Under the default settings, the character never rests and drains the battery.**
- *Evidence:*
  - The slower 20 frames a second rest rate applies only when Lively is off (controller.ts:114), and Lively is on by default (settings.json:55, lookfeel.ts:41).
  - Pointer updates arrive every 50 ms whenever the pointer moves anywhere on screen (gaze.rs:7, main.rs:1048-1060). Each one forces full speed for 4 more seconds.
  - The water animates forever, with no stopping point (shaders.ts:50-55).
  - The ring's background task wakes 125 times a second (follow.rs:12, main.rs:1073).
  - F04 sets the budget: under 1% CPU and no graphics work after 10 seconds idle (also technical_research.md:464). No measurement exists, and the CHANGELOG's "Easier on your battery" does not hold under the defaults.
- *Conflict to flag, not resolve:* F04 says "animation paused when idle". F27, added later, says "At rest, the point sways, slow waves run up its sides and the base spreads and gathers." Both are founder decisions and they cannot both hold as written. See section 9, item 12.
- *Fix:* whichever way the founder settles that conflict, measure it. Turn pointer following and the ring off by default (needs the founder's yes, F27). Then measure on an M1 Air with the default settings.

**F4. Time to the first real fix is far past the product's own five minute target, and the magic moment needs Node.**
- *Evidence:*
  - Nine steps (onboarding.ts:11) and about 14 decisions before anything real happens, most of them about the mascot (onboarding.tsx:159-197).
  - Every practice needs Node (app/sample/practices.json, `needsNode: true`). Without Node, the main button on the last screen is disabled (onboarding.tsx:269), and its help line points at a button that is not on that screen (strings.ts:807).
  - The target is "an agent working on a real project, or a first Prompt help or Show me how result, within five minutes of install" (product_research.md:179). F05 says "A setup form before anything works kills first session value."
- *Fix:* three screens, mascot choices after the first proven fix, and a practice that runs without the person installing Node. Note that the research also counts a first Prompt help or Show me how result. Any launch cut must keep at least one of those reachable in the first five minutes (see section 6).

**F5. No focus.**
- *Evidence:* the feature groups list (settings.json:11) holds 22 ids. About half are parts of the hero and its safety (proof, undo, followUp, whichTask, drive, rescue, findProblem, practice, yourTurn). The rest are separate products: a file converter with 10 settings down to jp2 output and audio sample rates (settings.json:152-161), watch routines, Gmail, Calendar and Drive (CHANGELOG, 29 Oct), Second Look, type by voice, read aloud, Explain, lessons. There are nine global hotkeys at launch (keymap.rs:145-182; the tenth, "use a Prompt help suggestion", is registered only while a suggestion shows, keymap.rs:165) and 27 panels on Home's Now tab. F16 said "Launch with one job" and parked "dictation everywhere" and "routines"; both have since shipped under later records (F23, F26). F23's own Honest limits say: "The hero must work first." The hero has not been seen working on a real Mac.
- *Fix:* a launch cut (section 6). This is the root cause behind most of the major items below.

### Major, grouped by what the person feels

**M1. Proof is said badly, in the moment that matters most.**
- A partial pass reads "Not checked" with a grey icon, while green "Builds" and "Tests pass" chips sit right under it (model.ts:1288-1292). What I did calls the same task "Done, partly checked" (model.ts:993).
- The runner sends how the task ended (agent.ts:1171), and the app drops it (model.ts:858). A task that was stopped, or stopped by the spending limit, wears a calm green "done".
- The headline is the person's own request (homeHero.ts:37). The verdict is a small grey line under it (style.css:644).
- The verdict appears in six phrasings: "Checked and working", "Proven", "Done, checked", "Tests pass", "Running the tests: Passed" and "Fixed, and proven".
- A panel titled "Checking the work" stays in the present tense after the work is done (card.tsx:1929).
- The receipt opens with up to 600 characters of the model's own text, formatting symbols and all (asks.ts:10, card.tsx:1948-1955).
- A zero cost renders as "About free so far of your Claude" (model.ts:1042, strings.ts:143).
- Core job words are written straight into the code instead of strings.ts (model.ts:530, 993-1002, 1016, 1205-1208; card.tsx:1873), so they cannot be checked or renamed in one place.
- *Fix:* the verdict is the headline, from the one verdict function. One result card. The model's own text goes behind a disclosure.

**M2. Undo is cut off from the fix it undoes.**
- It is a pill stuck to the window foot (card.tsx:2302-2305). Its confirm opens higher up, inside the receipt (card.tsx:1989).
- It vanishes when pressed. The copy promises "you can undo the Undo" (strings.ts:109), but no redo command exists (commands.ts has undo, undoPutBack and undoOneTask only), although the safety copy it would need exists (checkpoints.ts:657).
- It is absent on the failure card and the loop breaker, which offer only "Try a different approach" and "Stop here" (card.tsx:1767-1781).
- *Fix:* "Undo this fix" inside the result card. "Bring the fix back" after an undo. "Stop and undo my changes" on failure.

**M3. Failure cards print raw error output.**
- *Evidence:* notDoneReason returns the check's name and its raw output (model.ts:1020-1025), shown bare at card.tsx:1940. The loop breaker does the same (model.ts:808, card.tsx:1773). A tidy Details disclosure already exists (checkDetail.tsx:10-34) but is not used in either place.
- *Fix:* one plain sentence, with the output behind Details.

**M4. The approval card can contradict itself.**
- *Evidence:* safety.ts:26 assumes every risk can be undone (`undoable = true`), even risks marked irreversible (:417, :479-480, :484, :497, :499). The card then reads "Do something that can't be undone?" above "Undo can take this back." (strings.ts:91, 100).
- Reasons are in the engine's voice: "Node would run code I cannot check."
- Allow is the filled silver button and Don't allow is plain (card.tsx:1761-1762). Focus already goes to Don't allow; the problem is only that the eye goes to Allow.
- Paths are full disk paths (approvals.test.ts:14).
- *Fix:* the heading and the Undo line come from one fact. Reasons are written for the person. Allow and Don't allow carry equal visual weight. Paths are shown from the project folder down.

**M5. Home at rest says nothing about the project.**
- *Evidence:* home-now.jpg. The right column shows "What are we fixing?", "In test-shop", "Watches" and two folder buttons, and the bottom 45 percent is empty. heroWords in homeHero.ts returns only the idle headline and the folder line.
- The question sits under the box that answers it (style.css:1042). Three lines say "type here" three ways (strings.ts:64, 76, and the invite line).
- The side list shows ^⌥⌘F key combinations under a bare "Do" heading (card.tsx:39-43, strings.ts:147). That is a developer habit aimed at the wrong person.
- Memory sits in a catch all row (card.tsx:2255-2261), headings are nested inside headings (card.tsx:291), and pages that already have Back also have Close (card.tsx:2260, :1664).
- *Fix:* a status headline built from what Squibby already knows, and one next step chosen by that status.

**M6. History does not deliver receipts.** Recent rows all open the same list, not the task they name (recentList.tsx), although the file's own comment promises "its full receipt". What I did shows name, status and cost, with Undo on the newest task only (card.tsx:259-276). Its empty state is a dead end (what-i-did.png).

**M7. One action has five names.** "Point at the problem" (strings.ts:436, 952, 1265), "Find the problem" (:67), "Fix something" (:332), "Describe the problem" (:64) and "The stuck key works in any app". Going live has three names (:69, :202, :203). Memory has four (:990, :1184). Squibby, Flowflow and "I" take turns speaking within three first run screens. The plan card says "Nothing runs until you press Start." over a button labelled "Start the plan" (strings.ts:158-159). Two settings are nearly the same words: "Show work under the notch" and "Show work in the notch" (strings.ts:1321, 1342).

**M8. The notch breaks F18 at rest, and on hover it is a launcher, not a status.**
- *A broken founder decision, not a taste call:* at rest the black is 52 points wider than the hardware notch, 26 per side (island.rs:87, :150; island.tsx:172-173), with a silver sun on the left (style.css:619-620). F18 says it "is the bare notch at rest", and that the part inside the menu bar "is always the notch or the pill, so the app menus and status icons beside the notch stay clickable". The code's own comments still say "the black shape stays exactly the notch" (island.rs:84-85, :443). It also sits above the menu bar's status icons (island.rs:99).
- *A conflict to flag:* the sun was the founder's own "yeah" in M16 (island.rs:83). That choice and F18's bare notch cannot both hold. **Needs the founder's yes** either way.
- On hover with nothing running, every control just opens Home (islandPanel.tsx:81-91): "Evening.", a silver "+ Fix something" bar, two pills and two icons. The founder asked for this hover panel and the greeting, after HeyClicky's notch (islandPanel.ts:1-2, :55).
- The "brief" panel is 340 px wide, but the black shape behind it stays 400 points (style.css:579-581 vs island.rs:152). Plain words under questions fall back to a code typeface (style.css:908).
- A job card has no Stop, and a done card has no Undo. The research's own card contract calls for both (product_research.md:119).
- *Fix:* bare notch at rest, which restores F18. On hover, status with Stop, Undo and proof. Removing the sun, the greeting and the launcher buttons **needs the founder's yes** (M16, M33, 27 Oct choices).

**M9. The notch weakens rule 5's light and drops itself over your work.**
- "Looking at your screen" and "working on your code" draw the same arc (home.ts:209, model.ts:1223). Rule 5 needs a visible light before any capture; one the person cannot tell apart from "working" does not do that job.
- The panel drops on its own at every step change (islandPanel.ts:46, workPeekKey). Those cards do not ignore early clicks, so a click meant for a browser tab opens Home (islandPanel.tsx:68).
- It never checks whether you are presenting or on a call (main.rs:498-518 never calls quiet()). F18's "What stays" says presentation mode and hiding from screen sharing apply to the home (rule 7, M11).
- When Claude is not connected, the big button still says "Fix something", and the true line is small grey text that cannot be clicked (islandPanel.tsx:85, strings.ts:1201).

**M10. The character watches and performs.**
- By default its eyes follow your pointer anywhere on screen and a ring rides your cursor (settings.json:59, gaze.rs:13). The first run says so: "It watches your pointer" (strings.ts:308). In a product whose rule is "never watch passively", this reads as surveillance, even though it reads only the pointer position.
- Idle tricks (hop, double bounce, shake, stretch, bubble) run every 4 to 8 seconds (engine.ts:28-35). That is the "AI friend" register rule 16 forbids.
- "Needs you" looks the same as "listening" (behavior.ts:52-53). Thinking, working and checking look the same too.
- The "Calm" option promises "Moves only when it has news" (strings.ts:302), but the water keeps swaying.
- Old style rules still bob, squash and rotate the live drawing, because the rule meant to switch them off looks for a marker (`data-flow`) the live drawing never sets (style.css:51-56, 290-297, 460-461 vs dock.tsx:220).
- A 7 degree lean tilts the flat face off the real screen edge (style.css:418-419).
- On a white wallpaper it reads as opaque blue candy. It is 94% opaque, its colour is boosted by a third, and it reflects a fixed dark studio rather than your desktop (shaders.ts:104, 130, 151). F04 says "Not cute mascots."
- Droplets are coloured in a different colour space from the body, so they never quite match it (renderer.ts:53 vs :62, :70). The ring's speech bubble still uses the old silver gradient (follow.html:5). These are cheap fixes for the "cheap" feeling.

**M11. Show me how makes you wait for decoration.** The default water style spends 1.4 to 2.2 seconds on a split, an arc and a squash before the ring appears (water.ts:11-13, pointer.ts:15, overlay.ts:183-225). Captions use handwriting fonts (overlay.ts:332), and some words are written into the code instead of strings.ts (overlay.ts:163, 272).

**M12. The key step loses non engineers and hides the safeguards.**
- "Make a free account" hides that a card is needed (strings.ts:397).
- Pro and Max subscribers get no explanation. The line that addressed them was deleted (CHANGELOG.md:132), and obPlanLater is unused.
- The $10 a day limit, the "no server of its own" line (obWelcome2) and the permission explanations (obPerm1-3) are written and never shown.
- Cost is stated four ways: "a few cents", "around 20 cents", "Five dollars covers many", and a 60 cent cap.
- "Getting Claude ready" (strings.ts:314) confuses someone who already uses Claude.

**M13. The first run works against its own goal.**
- The person can switch off Flow, the core product, on screen five (onboarding.tsx:183-190). The practice they are sent to next then dead ends (practicePanel.tsx:83-84).
- The main final button sends them to a toy copy instead of the project they just picked (onboarding.tsx:269), and it throws away their questionnaire answers (:79-88).
- The questions break F05. F05 asks for five specific questions (what you are building, how technical you are, how much it does on its own, updates, quiet), each "visibly changing something on the next screen". The build asks four different ones: explain, short, plain and send on release (onboarding.ts:61-66).
- The progress count says "5 of 5" on the folder step, and another screen follows (onboarding.ts:16). The key step is required (onboarding.ts:13), yet a Skip link sits beside a disabled Continue (onboarding.tsx:228).
- The demo promises public/signup.js line 8. The real practice points at test/signup.test.js line 17 (practices.json, strings.ts:739).
- The demo ends "Not happy? Undo puts it back exactly." (strings.ts:363). The real Undo keeps your own edits and leaves very large files alone (strings.ts:108, 120). The first promise the person hears is stronger than the product.
- There is no route for a project that lives on Lovable or GitHub (onboarding.tsx:234-240).
- A privacy line is garbled: "Watches you add ask your own web address" (strings.ts:1233).

**M14. The design system is layers of sediment.**
- style.css stacks 29 milestone layers (M15 to M43), each overriding the last. `.btn.primary` appears in 17 rules. There are 92 hex colours.
- The header promises corner sizes the file breaks (style.css:7-9). `--lime` is silver (:19).
- M43 says silver is for one main button per screen (:1078), yet every "on" switch is silver (:1009, :1033-1034), and so is every Learn Start button (practicePanel.tsx).
- The silver gradient runs a dark grey band at 52% (style.css:997), which cuts right through the "Fix something" label (notch-panel.jpg).
- The interface mixes typefaces: the rounded face (`var(--round)`) is used about 40 times, including in the notch (style.css:610, 612), next to the plain system face.
- Only Night is designed. Deep and Paper are left out of the M43 colours (:1080).
- look.md still describes the sunset look of 27 October.

**M15. Home's grid breaks during the first launch.** While Claude downloads, the download notice appears before the ask bar (card.tsx:1479). The side list spans rows 3 to 14 (style.css:1043), so the full width ask bar is pushed under the whole side list. This is likely from the layout rules rather than seen, and it would happen exactly when a new user is looking.

**M16. Settings hides a second, much larger Settings.** It opens on about 25 choices (CHANGELOG.md:141), which is the right number. But behind Advanced sit about 118 more, including 10 timing knobs and 17 pointer knobs, and the broken window in F2 is what a person actually opens. The "Voice" power switch also turns off typed Prompt help (strings.ts, set['voice.on']). "Flow" sits one row from a page titled "Flowflow". "Caption colour: Lime / White" offers two choices that look the same (overlay.html:4, 7).

**M17. Nothing since M29 has been judged on a real Mac.** Several bugs above (F2, M15, the stuck pose clipping an eye, the notch taking menu bar clicks) can only be confirmed on hardware. A 640 by 640 preview is not where this product is decided.

---

## 5. The product it should be

### The feeling

It should feel like handing your car to a very good mechanic, who hands it back with the old part in a bag.

- **A glance tells you the state.** Open Home or look at the notch, and one sentence tells you, in your project's own name: "test-shop works. Checked 2 hours ago." or "test-shop: the signup check is failing."
- **Safety shows up before fear does.** "Safety copy saved. Undo is ready." appears before the first file changes.
- **Waiting reads as progress, not money.** A strip moves Finding, Fixing, Checking, Proven, with the time so far. Stop is always in reach.
- **The finish is quiet and exact.** "Fixed and proven" over a before and after picture of your own page. The tick draws once. No confetti, no pet tricks, no greeting.
- **When it cannot finish, it says so first.** "Not fixed yet." Then the way out: "Stop and undo my changes."
- **Nothing moves unless something is true.** (This depends on how the founder settles F04 against F27; see section 9, item 12.)

The emotion is relief, then confidence. Delight comes from the proof, not from the pet.

### The materials: what changes

M43 already has the right base: page #0B0B0C, cards #141416, a near black notch, and motion timings of 120, 200, 280 and 400 ms with a .97 press (style.css:10-13, :1080). Keep all of that. What changes:

- **Silver becomes flat.** Replace the banded gradient at style.css:997 (its dark band at 52% is what looks cheap) with a flat fill near today's #E9ECF1, a bright top edge and a darker bottom edge near today's #5C6168. This keeps the founder's silver, without the stripe.
- **Silver goes on one control per screen.** Remove it from switches (style.css:1009, :1033-1034), the switch knob, Learn's Start buttons, menu hover (:1008) and the ring's speech bubble (follow.html:5). Switches become greyscale: a light track with a black knob when on, a faint track when off.
- **Water, #59D2FF, means only "Squibby is acting".**
- **Meaning colours, one job each:** amber #FFB020 means needs you, green #4CC27F means proven, red #FF6B5E means not fixed. Everything else is greyscale. Rename `--lime`, which is silver today (:19), and remove lime everywhere. Check every colour pair for contrast in a11y.test.ts, as today.
- **Corners, from outside in:** 20 on the Home panel, 12 on cards, 8 on controls, 4 on key labels. No pill shapes, except the status dot. Then fix the header so it matches (style.css:7-9).
- **One typeface family.** Remove the rounded face (`var(--round)`, about 40 uses, including the notch at style.css:610 and 612) and the handwriting fonts (overlay.ts:332). Use the code typeface only for commands and paths, never for plain words (style.css:908). Use figures of equal width for every cost, time and count, so numbers do not jump as they change.
- **Two sound cues, specified.** A "proven" note: one short, soft tone of about 300 ms, quieter than the Mac's own alert sound, from one file made for it. A "stopped" cue: a short low tap of about 120 ms. Each has its own switch.
- **One haptic.** A single light tap through the trackpad when the drop presses past the edge. It works only on Force Touch trackpads, and nothing happens with a mouse, which is fine.

### The principles (seven)

1. **One job, one name.** The hero action is "Fix it" everywhere: key, Home, notch, Settings and first run. A naming table in the strings file is checked by a test, the way names.json already is. Every other feature earns its place by serving that job.
2. **The verdict is the product.** One function over proof, ending and undone decides the verdict, and every surface reads it. No word on screen may be stronger than the proof behind it, including the first run's promise about Undo.
3. **State before ask.** Every surface first says how the project is, then offers the one right next step. Never a launcher.
4. **Motion means news.** The character, the notch and the pointer move for working, needs you, done, failed, listening or looking at the screen. Whether the drop also sways gently at rest is the open F04 against F27 conflict. Whatever the founder picks must meet F04's idle budget, measured.
5. **One of everything.** One main button per screen, one theme until it is perfect, one water material, one way of showing keys (Mac symbols on key labels, words only for screen readers), and one voice. Squibby speaks as "I". Flowflow is how Squibby looks, not a second speaker.
6. **Safety is shown before it is needed, in plain words.** Show the privacy line and the spending limit before the key, and the safety copy before the first change. Raw output, hidden file names, full disk paths and the engine's inner voice stay behind "Details". No greetings and no affection (rule 16).
7. **Nothing counts until it is seen on a real Mac.** No milestone is done until the founder has watched it run on a notched MacBook and an external display, timed. A screen that exists only in a preview is a draft.

### Home

**How it looks at rest.** One column, top to bottom:

1. **Top bar, 44 pt.** The project name at 13 pt semibold, with a chevron that opens a menu: Change folder, Open from a link. At the right, three labelled words: History, Memory and Settings. Learn appears as a fourth only until the first practice is done. The Close X stays. Memory opens both halves that F05 and rule 15 require: "This project" and "What I know about you", every line with its source, Edit and Forget.
2. **Status headline.** 22 pt, bold, slightly tight: "test-shop works" or "test-shop: the signup check is failing". A small dot in the meaning colour sits before it, with one grey line under it: "Built and checked 2 hours ago." If the project has never been checked, it says "Not checked yet".
3. **One silver button, chosen by the status.**
   - "Fix it" when something fails.
   - "Check before going live" when everything is green.
   - "Check my project" when nothing is known.
4. **The ask field.** 44 pt tall with 12 pt corners. Placeholder: "Or tell me what's wrong". No search icon. A quiet key hint, "⌥ Space to talk", sits inside it. Return starts a fix.
5. **The last fix as one compact receipt row:** verdict mark, name, cost. Up to three more below it. Each opens its own receipt.

**Delete:** the "Do" list, the ^⌥⌘ combinations on rows, the invite line (card.tsx:1522), "In test-shop", the "How to talk" pill (card.tsx:1499), the "Watches" disclosure (it folds into the status), the catch all Memory row (card.tsx:2255-2261), Close on pages that have Back (card.tsx:2260, :1664) and the foot folder buttons (card.tsx:2273-2295). This also removes the grid bug in M15.

**Needs the founder's yes:** this drops the two column dashboard layout the founder chose in M42. It keeps M42's visual language: near black, thin lines, the command field. The reason: a side list of commands is a launcher, and Home's first job is to report state, not launch tools.

**How it feels:** a car dashboard, not a developer console. Five seconds to "is my thing OK, and what do I do?"

**How it behaves:** the panel unrolls from the notch with a gentle settle and almost no bounce. Typing never moves the layout. Nothing moves while idle.

### The core job and proof

**While it works, the job is the whole of Home.**
- The ask field, the recent rows and the folder menu step away.
- The headline is the request, written as an order ("Fix the signup button"), as islandWorkingOn already does for the notch.
- At the start, one line with a tick: "Safety copy saved. Undo is ready."
- A four step strip, Finding · Fixing · Checking · Proven (the names already exist at strings.ts:372). Each segment is a thin line that fills with water as its step completes.
- The current step in plain words at 15 pt: "Reading signup.js".
- Small, on the right: the time so far, "usually 1 to 2 minutes" once measured, and the cost last.
- Stop is a labelled button at the top right of the card.
- A retry steps the strip back to Fixing and says "Trying again (2 of 3)". The strip reads the runner's real states and never invents progress.

**When it ends, one result card, top to bottom:**
1. **The verdict as the headline,** 28 pt, with an icon in the meaning colour. One of:
   - "Fixed and proven"
   - "Fixed, not fully proven: the browser check could not run"
   - "Not fixed yet"
   - "Stopped"
   - "Stopped at today's limit"
   - "Undone. The problem is back."
2. **The before and after picture** of the person's own page, with the change circled in green.
3. **Two plain lines:** "Found: signup.js, line 8" and "Changed 1 file". Build them from the actual change and where it was found, not from the model's own text.
4. **One row of proof chips:** Builds, Tests pass, Works in a browser.
5. **One row of actions:** "Undo this fix" (outlined), then the cost as "$0.06 · today $0.18 of your $10 limit", then a "More" menu holding Copy receipt and See the changes.
6. **A "How it was proven" disclosure** holding the step rows and "What it said", the model's own words.

**Behaviour in each case:**
- **Proven:** the strip turns into the verdict in place. The tick draws once, and the card settles with one small bounce. That is the only bounce in Home.
- **Undo:** the tick undraws, the headline becomes "Undone. The problem is back.", the picture and chips dim, and the card offers "Bring the fix back". That needs a new command over the existing safety copy. It never touches the user's git (rule 10).
- **Partial:** name the check that did not run, say why, and offer one button to fix it, for example "Get the browser check". The browser check is every user's right (F14).
- **Failed:** "Not fixed yet. The signup test still fails on signup.js, line 8." The raw output sits behind Details. No red fill, no shake, no sound.
- **Loop breaker:** "I've tried 3 times and it still fails." Three choices: "Try another way", "Stop and undo my changes", "Stop and keep the changes".

**Approval cards.** A thin amber edge on the left. A plain question that matches the risk ("Run a script I can't read first?"). One sentence of why, written for the person: "This runs code inside your project that I can't read ahead of time." The command in the code typeface, with paths from the project folder down. One true line about Undo, from the same fact as the heading. "Don't allow" first, keeping the focus it already gets, and "Allow" beside it with equal weight. Neither is silver: a safety question should not have a visually favoured answer.

### The notch

**At rest:** exactly the hardware notch. No margin, and the clickable area equals the visible black. This is what F18 already says; the build drifted from it. Removing the sun **needs the founder's yes** (M16). On a Mac without a notch, keep F18's pill. Going further, to a small dot or nothing, needs the founder's yes.

**While working:** 40 pt wings, which F18's 27 Oct change allows.
- The left wing holds one flat status icon. Removing the small live Flowflow from the wing **needs the founder's yes**, because F27 says Flowflow is drawn live in the notch.
- The right wing holds a thin ring that fills with water as steps advance. islandPanel.ts:35 already knows the step number and the total. It fills smoothly between steps and never spins endlessly.
- **Looking at your screen** gets its own mark, used for nothing else: a white ring with a filled centre. This is rule 5's light, lit before any capture starts.
- **Listening** keeps the three bars.
- **Needs you** is an amber dot that pulses three times, then holds steady. Today it pulses forever (style.css:378).
- **Proven:** the ring fills to the top, the tick draws, and the wings widen slightly once. Everything tucks away after 4 seconds.

**On hover (keep the 400 ms wait):** a black panel that grows out of the notch, one typeface, as wide as the black behind it (fixing the 340 against 400 mismatch). It shows exactly one of these:
- **A live job:** step, time so far, and Stop.
- **A finished job:** the verdict, "Undo this fix" and "See proof".
- **A question:** Allow / Don't allow, ignoring clicks for its first 600 ms. Only for actions a file copy can truly take back, which means network requests leave this list.
- **Nothing live:** one true line, such as "test-shop works. Last fix proven 2 hours ago."
- **Not connected:** one silver button, "Add your key", which opens that step in Home. Never a login form (rule 2).

**It opens on its own for three events only:** a question, a proven result and a failure. Never on step changes. Never while you are presenting, on a call or in a full screen app (F18, "What stays"). Every card that opens on its own ignores clicks for its first 600 ms. The unseen count shows "9+", and hovering lists those results. A click on the notch opens Home.

**Trim, with the founder's yes:** the greeting "Evening, Rishabh." (M33), the silver "+ Fix something" bar, both pills and the Settings and Open icons (the founder's 27 Oct HeyClicky style hover), the compact size, and about 9 of the 13 notch settings. Keep four visible: show it, open on hover, open for questions, which display. The rest move under More in Settings; none is deleted.

### Flowflow and the pointer

**How it looks:** a well lit glass drop, about 56 pt visible at rest, in line with F04's 48 to 56 pt tab. The flat face presses exactly parallel to the screen edge, with no lean. To stop it reading as blue candy on a white wallpaper, the material has to change, not just a number. Today it reflects a fixed dark studio (shaders.ts:1-2, :104), so it cannot pick up the desktop behind it. Try two options, a lighter studio and a soft contact shadow where it meets the edge, and judge both on a white and a dark wallpaper on a real Mac.

**Its eyes.** Keep the eyes, because F27 fixes them. Make them quieter: smaller, softer than near black, and no white glint at rest. **Needs the founder's yes**, because it changes F27's look.

**How it behaves:**
- At rest: the open conflict. F27 says it sways gently; F04 says it pauses when idle. This review recommends stillness after 3 seconds without news, because that is the only state that surely meets F04's budget and answers "childish". The other option is F27's sway at a low, capped rate, kept only if it measures inside F04's budget. **Needs the founder's yes.**
- It moves for news:
  - **Working:** a slow band of light rising inside the body, with no bobbing.
  - **Needs you:** an amber light in the core, pulsing twice and then holding. It must look different from listening and be readable when half tucked away.
  - **Listening:** surface ripples driven by the microphone level.
  - **Proven:** one bright flash travelling up through the body.
  - **Not fixed:** the body settles slightly flatter and duller until the next task.
- Its eyes turn to you only when it needs you, and to the target only when it points.
- It pauses completely in Low Power Mode, while presenting or on a call, and behind full screen apps.
- The press against the edge stays exactly as it is, plus the one trackpad tap.

**The pointer:**
- The cursor ring is off by default. It appears only while Squibby is listening or pointing. **Needs the founder's yes**, because F27 defines the ring; this changes its default, not the decision.
- Show me how puts the ring at the target at once and draws it quickly. The water flight becomes an option, not the default.
- A guess stays a dashed amber ring with "Somewhere around here."
- Success turns the ring green and draws a tick. No confetti, no lime burst, no drop flying home.
- Captions use the system font, and all their words live in strings.ts.

**Remove:** idle tricks (engine.ts:28-35), pointer following across the whole screen, droplets (or fix their colour space, renderer.ts:53), invisible ripples, every old style animation and rotation on the live drawing (style.css:51-56, 290-297, 418-419, 460-461) and the fast follow task (follow.rs:12). The hidden live Flowflow in Home (card.tsx:1529) draws nothing anyone sees, yet costs power. F27 lists Home as a place it is drawn live, so the founder chooses: show it properly, or remove it. **Needs the founder's yes** (F27).

### The first run

Three screens, each with one silver button.

**Screen 1.** The headline over the water, with the recorded fix playing on the same screen, beat by beat. Show only beats that have happened; remove the faded future beats (style.css:514). The last beat tells the truth about Undo: "Not happy? Undo puts my changes back." Flowflow rises once. Button: "Set it up".

**Screen 2, "Add an Anthropic key".** Directly above the key field:
- "Your code goes from this Mac straight to Anthropic, on your own account." Say "Squibby has no server" only while that is true: the repo holds usage-proxy/ (F22, built and switched off), and Google connections shipped on 29 Oct. Tie the line to those switches.
- "A fix usually costs 5 to 15 cents. Squibby stops at $10 a day per project, and you can change that." Set the range only once it has been measured; F22 measured $0.04 to $0.12.
- "Signing in with a Claude Pro or Max plan is not available yet. An Anthropic key is billed separately and needs a card." This keeps rule 3: the subscription route stays behind its switch, and the line only says so honestly.

Then the steps, the field, and no Skip link while the key is required. Say "Your key works." when it checks out.

**A route to note, not to decide here.** F22 describes a company paid route for the light features (guide, pointing, Explain, Prompt help) and product_research.md:179 counts a first Prompt help or Show me how result as first value. If the founder turns that route on, a person could reach first value before adding a card. That is the founder's call under F22.

**Screen 3, "Which project are we finishing?"** Three choices: "Choose a folder on this Mac", "It's on GitHub or Lovable" (which uses the existing Open from a link) and "Show me on a practice first". The progress count, if kept, must count the screens that really follow.

**After the folder pick:** Squibby runs the project's own checks and lands on Home with the status filled in. A project's own checks are code, and check.install defaults to "auto" (protocol/settings.json:114), so they may install packages and change the folder. Do not promise "Nothing will change." Instead, take a safety copy first, run this first check with installs set to ask, under the runner's normal safety rules (rule 12), and say: "Checking test-shop. A safety copy is saved first, and I'll ask before installing anything." What "read only" can honestly mean for a project's own scripts needs a technical record and a test.

**The practice runs without the person installing Node.** One route is the runtime Squibby already ships. That is a **[verify]** item: whether Bun can run the practice's `node --test` check must be proven in a spike. The other route is to offer to install Node, with consent.

**After the first proven fix, once:** "Want to rename or move Flowflow, or tell Squibby how you like things?" The questions move after the first fix, and they become F05's five, each visibly changing something on the next screen. Moving them **needs the founder's yes** (F05 timing). The current four questions (onboarding.ts:61-66) are not F05's and should be replaced either way. Fix can never be switched off in the first run.

The group step goes away from the first run. F20 gives each group its own place in the island, Home and the first run, so dropping it **needs the founder's yes** (F20).

### Settings

- One Settings surface, in the same Night look as Home. Pick the window or the Home tab, not both, and delete the second grouping (settingsGroups.ts).
- Five pages, about 25 visible controls:
  - **General:** where Squibby lives, sound, motion.
  - **Claude and spending:** key, daily limit with today's spend, plan status (F25).
  - **Keys:** the default keys.
  - **Privacy:** what it may see, hidden from screen sharing, Delete everything.
  - **About.**
- Everything else sits under "More", which search reaches. Nothing is deleted: every behaviour keeps its control.
- Switches are greyscale, as in the materials above. No silver.
- Safety floors stay impossible to turn off.
- "Flow" becomes "Fix". The "Voice" switch splits into "Talking" and "Prompt help", so turning off voice no longer turns off typed Prompt help.
- Merge the two edge switches (character.peek and character.stick).
- Fix, do not delete, the broken controls: "Caption colour" must offer two choices that look different, and the garbled "Sample rate for Change the sample rate" label needs plain words. Rename one of "Show work under the notch" and "Show work in the notch" so they cannot be confused.

---

## 6. Say no to

Each "no" here protects the hero.

- **Many products at launch.** File conversion, watch routines, the Google connections, Second Look, Draw it and type by voice in any app stay in the code but out of the launch surface, until the hero is loved on real Macs. Use F20's existing group switches, set off by default for these groups, rather than inventing a second on and off system called "Labs". *Why:* F16 said "Launch with one job", F23's own Honest limits say the hero must work first, and every extra layer is a new way to fail on day one. **Needs the founder's yes** (F19, F20, F21, F23, F26).
- **Nine global hotkeys at launch.** The defaults become four: Fix it, Hold to talk, Prompt help and Stop everything. Prompt help keeps its key because it works in another app's text box: that app must stay in front (rule 9), and its text is touched only on a user hotkey (rule 5). Show me how starts by holding the talk key and asking ("Show me how to..."), with the screen looking light lit before any capture (rule 5); if a spike shows voice is not a reliable trigger, it keeps its own key. A button on Home cannot start a screen capture of another app. "Use a Prompt help suggestion" stays as it is: live only while a suggestion shows. The others stay assignable but unbound. *Why:* a non engineer cannot learn nine three key combinations, and each one can collide with another app. **Needs the founder's yes** if a key's default is fixed in an F record.
- **A launcher in the notch.** *Why:* Home already owns every button the notch repeats, and Apple's own island shows what is live, nothing else. **Needs the founder's yes** (27 Oct hover panel).
- **Any surface deciding "proven" on its own.** *Why:* one false proof ends the product.
- **Raw output, hidden file names, full disk paths and engine reasons in plain view.** *Why:* the person cannot read them, so they read as danger.
- **Money as the progress signal** ("Working · 12 cents so far"). *Why:* it teaches the person to watch the meter instead of the work.
- **Idle pet behaviour:** hops, bubbles, shakes, eyes that follow the cursor, a ring on the cursor all day, confetti. *Why:* it is the root of "childish", it costs battery, and it contradicts "never watch". The ring default **needs the founder's yes** (F27).
- **Mascot decisions before the first fix:** naming, liveliness, edge, follow my pointer, choosing from a set of one, "Who do you want with you?", "Say hello". *Why:* they spend the momentum the demo just built.
- **Deep and Paper themes until Night is finished.** *Why:* three half designed themes look like three products.
- **118 settings behind Advanced, shown as one page.** *Why:* a choice the team can make well is a default. The controls stay, reachable by search; they leave the pages, not the product.
- **Silver gradients with a dark band.** Silver is a flat fill with one edge of light, on one control per screen.
- **Another restyle before a real Mac session.** *Why:* six looks in four days were taste by reaction. The seventh will not fix a structural problem either.
- **Adding another override layer to style.css.** *Why:* each layer makes the next screen inconsistent. From now on, change the component, never add a layer at the bottom.

---

## 7. Must be perfect

These get far more polish than anything else, in this order.

1. **The verdict.** One tested function over proof, ending and undone, read by Home, the notch, the receipt and History. Test every combination.
2. **Undo.** One tap, inside the result card, true to its words, with "Bring the fix back". Offered on failure and on the loop breaker. The first run promises no more than it does.
3. **Stop everything** (rule 11). One key halts every agent, capture and microphone. The notch and Home show it within 100 ms, with the short low tap so you know it worked.
4. **The approval card.** The heading and the Undo line never contradict each other. Plain reasons. Equal weight, with focus kept on Don't allow.
5. **Install to first proven fix in under five minutes,** timed with a stopwatch on a clean Mac without Node, by someone who is not the founder.
6. **The browser check for every user** (F14). When it cannot run, the card says so and offers the fix.
7. **The notch's honesty.** Exactly the notch at rest, as F18 says. A screen looking light that differs from the working light. No drops while presenting or on a call. It never takes a click meant for something else.
8. **Idle cost.** Under 1% CPU and no graphics work after 10 seconds, measured on an M1 Air with the default settings, whichever way the F04 and F27 conflict is settled.
9. **The status headline on Home.** True, current, in the project's own name, never an empty word like "Ready".
10. **One name per thing,** enforced by a test: Fix it, Check before going live, Show me how, Prompt help, History, Memory, Squibby.

---

## 8. The first five minutes, scene by scene

**0:00, the promise.** Maya opens Squibby. A black panel grows from the notch. "Your AI built it. Let's finish it." sits in white over grey, above a line of water. Below it a recorded fix plays one beat at a time: "The Join button fails." Then "Found it: public/signup.js, line 8." Then "One word changed." Then the check turns green, "Proven", and "Undo puts my changes back." She thinks: that is exactly my problem. In the background, the engine is already downloading. One silver button: "Set it up".

**0:40, the key.** She reads three sentences that answer her three fears. Her code goes from her Mac straight to Anthropic, on her own account. A fix like that costs a few cents, and Squibby stops at $10 a day. Her Claude Pro plan cannot be used here yet, and a key is billed separately. She makes an account, adds $5 and pastes the key. It is checked once, the box empties, and "Your key works." appears with a tick.

**2:30, the project.** "Which project are we finishing?" She picks her shop folder. Had her shop lived only on Lovable, the second choice would have shown her how to bring it down. Squibby says: "Checking test-shop. A safety copy is saved first, and I'll ask before installing anything."

**3:15, the state.** The panel shows one line: "test-shop: the signup check is failing." One silver button: "Fix it". A field below it for anything else.

**3:20, the work.** She presses Fix it. "Safety copy saved. Undo is ready." The strip moves Finding, then Fixing ("Changing signup.js"), then Checking ("Opening your shop in a browser"). The notch grows short wings, and its ring fills as each step lands. The drop on the screen edge glows slowly inside. She switches to her browser, and nothing drops over her tabs.

**4:30, the proof.** The ring fills, the tick draws, the wings widen once and settle, and one soft note plays. The notch panel drops on its own for this one event: "Fixed and proven". Her own signup page, before and after, with the button circled. "Found: signup.js, line 8. Changed 1 file." Builds, Tests pass, Works in a browser. "$0.07 · today $0.07 of your $10 limit." "Undo this fix" sits right there. Then everything settles, and the notch is just the notch again.

**4:45, the only extra question.** One quiet line: "Want to rename or move Flowflow, or tell Squibby how you like things?" She skips it, and copies the before and after picture to send to a friend.

**Day ten.** Before a sale she opens Home: "test-shop works. Checked this morning." She presses "Check before going live", gets one plain finding, fixes it in one press and goes live. She trusts it because it has never once said something worked when it did not.

---

## 9. Where the three review angles disagreed, and the call

**1. Home layout: one column, or keep the two column M42 layout?**
- *Focus* wanted one column. *Craft* kept the left list as recent fixes. *Person* wanted a single status column.
- **Call:** one column, with recent fixes as rows under the result.
- *Why:* 640 pt is too narrow for two columns plus a result card. The main job got about 380 px in the audit. The founder's density and thin lines survive.
- **Needs the founder's yes** (M42 layout choice).

**2. Flowflow's eyes.**
- *Craft* kept F27's eyes but quieter. *Focus* and *Person* limited where they look.
- **Call:** keep the eyes, make them smaller and softer, no glint at rest, and let them look only when it needs you or points.
- *Why:* F27 stands, and making them less prominent answers both "childish" and "it watches me".
- **Needs the founder's yes** (F27 look).

**3. The water ring.**
- *Focus* said off by default. *Craft* and *Person* said show it only while listening or pointing.
- **Call:** off at rest, on while listening (moving with the microphone level) and while pointing.
- *Why:* that is the one moment the ring tells you something.
- **Needs the founder's yes** (F27 default).

**4. Allow on approval cards: silver or plain?**
- *Craft* kept Allow as the silver control. *Focus* and *Person* wanted equal weight.
- **Call:** equal weight, no silver on either button, focus kept on Don't allow as it is today.
- *Why:* the one silver button means "press this". A safety question must not have a visually favoured answer (rule 13).

**5. Sound on by default?**
- *Craft* wanted two designed cues on by default. Today sound is off (settings.json:61).
- **Call:** turn on only the proven note and the needs you knock, only when Home is not in front, and silent while presenting or on a call. Everything else stays off, and every cue keeps its own switch.
- *Why:* the proven moment is silent for everyone today, and a cue for something the person cannot see is information, not decoration.
- This is the founder's call as a default.

**6. Where the extra features go.**
- **Call:** F20's group switches, off by default for the non hero groups, not a new "Labs" and not a "More" menu on Home. Prompt help keeps its key. Show me how starts from the talk key.
- *Why:* a "More" menu on Home brings the launcher back, cannot start a screen capture under rule 5, and a "Labs" switch would be a second on and off system next to F20's.
- **Needs the founder's yes** (F19, F20, F21, F23, F26).

**7. "History" or "What I did"?**
- **Call:** "History".
- *Why:* it names a place, not an action. It stops competing with the receipt's own words, and it matches the bank statement feeling it should have.

**8. The top bar: labelled words or icons with tooltips?**
- **Call:** words. History, Memory and Settings, plus Learn while it is new.
- *Why:* a non engineer should never guess what a mortarboard or a bookmark means, and Memory must stay one step away (F05, rule 15).

**9. The notch on Macs without a notch: a small dot, or F18's pill?**
- **Call:** keep F18's pill.
- *Why:* F18 is a founder decision. The dot is offered as an option that needs the founder's yes.

**10. Cost words.**
- The angles used "4 cents on your Claude", "$0.06" and "$0.06 · today of your limit".
- **Call:** dollars with two decimals, in equal width figures, with today's spend against the limit on every receipt, and "No cost" at zero.
- *Why:* one style, and the limit is what an anxious first time payer needs to see.

**11. A conflict in the records: the notch.** product_research.md:35 and :119 say characters are docked "never the Mac notch". F18 moved Home to the notch, and the build puts a live Flowflow in the notch wing (which F27 also asks for). AGENTS.md says to flag this, not pick one. Removing the Flowflow from the wing would narrow the gap, but it needs the founder's yes under F27, and product_research.md still needs updating to match F18. **Needs the founder's yes.**

**12. A conflict in the records: motion at rest.** F04 says "animation paused when idle" and sets an idle budget of under 1% CPU and no graphics work after 10 seconds. F27 says "At rest, the point sways, slow waves run up its sides and the base spreads and gathers." This review leans to stillness, because the measured budget is the harder promise and the swaying feeds "childish". It does not decide. **Needs the founder's yes**, then a measurement either way.

---

## 10. A build order: the next five milestones, smallest first

Each one gets its plan in `docs/milestones/` and the founder's approval before any code, per AGENTS.md. Each one ends with the founder watching it on a real Mac.

**M44: Tell the truth.**
- **Scope:**
  - The one verdict function over proof, ending and undone. The app keeps the runner's ending instead of dropping it and reads the undone flag. Home, the receipt, the notch and History all use it.
  - Partial names its missing check.
  - Zero cost says "No cost".
  - safety.ts marks irreversible risks as not undoable, and approval reasons are rewritten for the person.
  - Failure and loop cards put raw output behind Details.
  - Core job words move into strings.ts. The first run's Undo line is made true.
  - A naming table test, with the first names fixed (Fix it, Check before going live, History, Memory).
- **Done looks like:** tests for every combination of proof, ending and undone, and for every irreversible risk. Not one place outside the verdict function decides "proven". The founder presses Undo on a real Mac and sees "Undone. The problem is back." in both Home and the notch, with nothing on screen still saying "Checked and working".

**M45: Quiet by default.**
- **Scope:**
  - The founder settles F04 against F27 first. Then the character loop follows that call, whatever Lively says.
  - Pointer following off except for needs you and pointing. The ring off at rest.
  - Old style animations and the 7 degree lean removed from the live drawing. Idle tricks gone, droplets fixed or gone. The hidden Home Flowflow shown or removed, as the founder chooses.
  - The notch is exactly the hardware at rest (restoring F18), with its own screen looking mark.
  - The amber pulses three times, then holds.
  - Drops on its own for three events only, ignore early clicks, and stay quiet while presenting or on a call.
- **Needs the founder's yes** for the F27 changes (sway at rest, live in Home and the notch, ring default) and for the M16 sun.
- **Done looks like:** an Activity Monitor and power reading on an M1 Air with the default settings, under 1% CPU and no graphics work after 10 seconds, recorded in technical_research.md. The founder can tell "working" from "looking at my screen" from across the desk.

**M46: One Settings, and the launch cut.**
- **Scope:**
  - One Settings surface in the Night look, grouped by the current page names, with a test for that.
  - Five pages, about 25 visible controls, the rest under More and search.
  - "Fix", and the Voice switch split from Prompt help. Broken controls fixed, confusing labels renamed.
  - F20's group switches off by default for the non hero groups.
  - Four default hotkeys: Fix it, Hold to talk, Prompt help, Stop everything. Show me how from the talk key, checked in a spike against rule 5.
  - Deep and Paper hidden.
- **Needs the founder's yes** for F19, F20, F21, F23 and F26.
- **Done looks like:** the gear opens a dark, correctly grouped Settings on a Mac in light mode. A count shows 4 default global keys and about 25 visible controls. Nothing was deleted from the code, and search still finds every setting.

**M47: Home and the result card.**
- **Scope:**
  - The status headline and the next step chosen by status.
  - The working strip with Stop.
  - The single result card with Undo inside and "Bring the fix back".
  - History rows that open their own receipt, and empty states with a "Fix it" button.
  - Memory in the top bar, with both halves.
  - Notch hover as status, with Stop, Undo and See proof.
  - Built on a new set of shared parts (Button, Card, Row, Switch, Key label, Verdict line, Proof chip), each defined once. The old layers are deleted, not overridden. look.md is rewritten to match.
- **Needs the founder's yes** for leaving the M42 layout and for replacing the hover panel and greeting.
- **Done looks like:** with the founder watching on a real Mac, Home answers "is my project OK, and what do I do?" in five seconds. A full fix runs from Fix it to "Fixed and proven" to Undo to "Bring the fix back", with screenshots of every state: working, approval, proven, partial, failed, loop breaker and undone. style.css has no layer added after M47.

**M48: Three screen first run, measured.**
- **Scope:**
  - Hello and the replay on one screen, with no faded beats and a true Undo line.
  - The key screen with the privacy line tied to the real switches, the limit and the honest Pro and Max line, using the unused strings where they fit. No Skip beside a required step.
  - The project screen with local, GitHub or Lovable, and practice.
  - A first check of the real project, with a safety copy first and installs set to ask, landing on Home's status.
  - The practice running without the person installing Node (a **[verify]** spike first).
  - Mascot choices and F05's five questions after the first proven fix.
  - The garbled privacy line fixed, one cost claim, a progress count that is true, and the demo's found line matching the real practice.
- **Needs the founder's yes** for the F05 timing and for dropping the F20 group step from the first run.
- **Done looks like:** a stopwatch on a clean Mac without Node, run by someone who is not the founder, shows the first proven fix in under five minutes. The time and the cost are written into practices.json in place of the estimates.

Once these five land, Squibby is one product: press Fix it, and it finds what broke, fixes it, proves it, and hands back a receipt with Undo. That is the whole promise, kept on every screen. After that, the groups waiting behind their switches can be earned back one at a time.

---

## Appendix: words used in this review

- **Verdict function:** one piece of code that decides what the result card says ("Fixed and proven", "Not fixed yet" and so on), so no two screens can disagree.
- **receipt.undone, ended:** the flags in the app that record that a fix was undone and how a task ended (finished, stopped, hit the limit).
- **quiet():** the check that tells Squibby you are presenting or on a call.
- **Shader, WebGL, uTime:** the code that draws Flowflow's water on the graphics chip, and the clock that keeps it moving.
- **Frames a second, thread wakes:** how often the screen is redrawn, and how often a background task wakes up. Both cost battery.
- **Style rules, layers:** the rules in style.css that decide how things look. A "layer" is a block added at the bottom to override earlier ones.
- **Tokens:** named colours and sizes (like `--lime`) reused across the app.
- **Hidden file names, full disk paths:** names like `.env` and paths like `/Users/maya/...`, which mean nothing to a non engineer.
- **Spike:** a short throwaway test on a real Mac to prove something before building on it. **[verify]** marks a claim that needs one.
- **M42, M43 and so on:** the build milestones, in order. **F records:** founder decisions in `docs/decisions/`, which only the founder can change.
- **Launcher:** a screen made of buttons that open other things, instead of telling you what is going on.
- **Powermetrics:** a Mac tool that measures power use.