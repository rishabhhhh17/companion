# M102: Every warning shows why

Status: plan approved by the founder on 15 Nov 2026 ("Yes, build it all", for the whole M97 to M109 plan as written). Built 17 Nov 2026. Not committed. Nothing was spent: no model call of any kind, no key, no account. Stand in models, temporary fixture folders and the engine's own shadow store only.

From "few findings, each one shown to be true" (the 15 Nov plan, Part 2).

## Why (from the plan, sources seen 15 Nov 2026)

- CodeRabbit is noisy. A preprint (not peer reviewed) of 31,073 CodeRabbit comments found 56.3% rejected. 43.3% were false positives, though it is unclear whether that is a share of all rejections (arxiv 2607.03316). The study counts only comments that got a reply, and its readers are engineers.
- Claude's managed Code Review sells a verification step (code.claude.com/docs/en/code-review).
- The 28% noise figure from CodeRabbit's webinar is single source and unconfirmed.

What the person gets: every "worth a look" or "stop" says in one line why Squibby is sure: the rule and file:line, the failing check and its exit code, the OSV id, or the house rule.

## What to build (from the plan)

Rules already set the rating (`runner/src/review/rate.ts`). Style is never a concern, and there are at most three notes (`runner/src/review/words.ts`). The work:

1. Where the model's words are read (`runner/src/review/service.ts`), a model "concern" may raise the rating only if it names a file and line that code checks falls inside a changed hunk. If it passes, show it as a reason with "why I'm sure: file:line". If it fails, show it as an ordinary note that leaves the rating alone.
2. A one line proof display for every reason (mostly display work; most reasons already carry the data).
3. Add the reason kind to the existing local Looks fine and Fix it counts in `runner/src/metrics.ts`. Counts only, nothing leaves the Mac.
4. Keep the model's summary and notes. Do not drop lines that have no evidence.

## Tests first (from the plan)

- A concern with no file and line cannot raise the rating.
- A file and line outside the hunk cannot raise it.
- An inside hunk concern shows its proof line.
- The counts are stored per kind.

## Rules it must hold

Rules 12, 14 and 17. The rules decide the rating, never the prompt: a model's worry is only allowed to raise it once code has checked the place it names. Counts stay on the Mac (rule 15).

Pitch: "Every warning shows why." Not "fewer comments than CodeRabbit".

## How it works (as built)

- **The model must point at a changed line.** The change sent for the review's words now numbers each line as it is in the file now (`teach.ts` `diffForExplain(…, numbered)`; Explain and the other callers are unchanged). The model is asked for `concernFile` and `concernLine` with any concern (`review/words.ts`), and `parseWords` keeps only a file name and a whole line number ("file:line" in one field is read as both).
- **Code checks the place.** `rate.ts` `concernPlace` accepts the place only when the file is one of this batch's changed places and the line is one it added, or, for lines only taken away, the line now standing where they were (the numbered change shows it with its number), or the file's last line when they ended the file. A line around a change, another file, no file or no line all fail. Only then does `rate` add `model_concern`, with `file`, `line` and its proof `{ by: "line" }`. A worry that fails is kept as the first note, word for word (cleaned as before), and the rating is left alone. The model's summary and notes are never dropped.
- **Every reason carries its proof** (`protocol/index.ts` `ReviewProof`, checked by `proofOk`): `rule` (a fixed rule matched at file and line, or the first file that made a risky touch, the first removed file, the first settings file), `line` (a checked worry), `check` (the failing check's label and exit code from the check runs, or `outcome` for a claimed pass), `osv` (the OSV id, set in `osv.ts`), `house_rule` (the rule's words with secrets hidden, set in `look.ts`), `setting` (a chosen stop, or the batch size with count and max) and `run` (a page that opened without a sign in). `rate.ts` `withProofs` fills them after the model step, so nothing new is ever sent to a model. Never a line of code or a value.
- **One line on the card.** `app/src/proofLine.ts` turns a proof into "Why I'm sure: …" ("Where it is: …" for the model's worry, which stays a guess: "Try it to be sure") with words from `strings.ts` (`S.proof`). The lead finding shows it under its place without saying the place again ("the line shown above"), each other finding's one line card shows it instead of the bare place, and every finding under Why does this matter? shows it (`findingList.tsx` `SureLine`, label in weight, never colour alone). The page keeps a proof only of the known shape (`review.ts`), and masks a house rule's words again. An older review with no proof shows its place as before.
- **Counts per kind, on this Mac only.** `metrics.ts` remembers the reason kinds of recent reviews in memory (never written) and, when Fix it or Looks fine closes that card, counts each kind once (`review_fix_kind:<kind>`, `review_looks_fine_kind:<kind>`, a fixed list made from the protocol's kinds). A page cannot name one, and a damaged file cannot plant an unknown one. Beta numbers say them in plain words only when there is any.

## Built

- `protocol/index.ts`: `REVIEW_PROOF_BY`, `ReviewProof`, `proofOk`, `ReviewReason.proof`. Fixture `m102e1` in `protocol/fixtures/events.jsonl`.
- `runner/src/review/rate.ts` (`touchFiles`, `concernPlace`, `withProofs`, the worry needs `concernAt`), `words.ts`, `service.ts`, `osv.ts`, `look.ts`, `runner/src/teach.ts`, `runner/src/metrics.ts`.
- `app/src/proofLine.ts`, `strings.ts` (`S.proof`), `review.ts`, `findingShape.ts`, `reviewHead.ts` (`sure`), `reviewCard.tsx`, `findingList.tsx`, `settings.ts` (beta numbers by kind), `ui/homeNow.css` (spacing only, no colour).
- No new setting: this changes what a review may claim, not a choice. Review strictness and Don't flag this kind here again still apply to a checked worry as before.

## Tests

- `runner/test/m102-why.test.ts`: the four tests from the plan (no place cannot raise, outside the changed place cannot raise, an inside worry has its proof, counts per kind), plus the model request, `parseWords`, the numbered diff, a proof for every kind, the protocol refusing bad proofs, end to end with a stand in model, and the shared fixture.
- `app/src/proofLine.test.ts`, `app/dom/m102.test.tsx`, and `m102_every_reason_in_the_shared_review_carries_a_proof_of_known_fields_only` in `app/src-tauri/src/runner.rs`.
- Expectations changed on purpose (the product changed, nothing weakened): `runner/test/review-rules.test.ts` (a worry raises the rating only with its place), `runner/test/review-service.test.ts` (the stand in model's worry now names the changed line), `runner/test/m79-packages.test.ts` (OSV reasons now carry their proof).

## Compared with the best (17 Nov 2026)

Sources: `coderabbit.md`, `heyclicky.md`, `orchestrators.md` (15 Nov research) and the Coucou notes in the 17 Nov plan section.

| | CodeRabbit | Claude Code Review | HeyClicky | Coucou | Squibby after M102 |
|---|---|---|---|---|---|
| Says why a finding is true | Severity label and the comment; no proof line | A verification step, not shown to the reader | No review | No review (status only) | One line per finding: the rule and file:line, the check and exit code, the OSV id or the house rule |
| A model's guess raising an alarm | Yes, the main source of noise (56.3% of replied comments rejected, preprint) | Filtered by its own verification | n/a | n/a | Only if code finds its line inside the change; otherwise a note |
| Steps to see why | Open the comment | Open the PR | n/a | n/a | None on the card; the full list is one tap (Why does this matter?) |
| Speed | Minutes per PR review | Minutes, GitHub only | Instant answers | Instant status | No extra wait: no new model call or network, the proof is the review's own data |
| Words | Engineer jargon, severity names | Engineer words | Plain, spoken | Short status | Plain words, file:line kept short |
| Learns from dismissals | Learnings: preferences saved from chat replies on reviews | REVIEW.md | n/a | n/a | Don't flag this kind here again (M57) plus counts per kind (new), on this Mac |

Where we match: one click fix for the whole review (Fix it), a copyable prompt for another tool (Copy for my AI), severity groups (Must fix, Should fix, Worth a look), findings checked again after a newer change.

Where we are better: every warning shows its proof on the card itself; a model's worry cannot raise the rating without a place code has checked; the checks are run and the exit code is named, where CodeRabbit and Claude's review read code only; it is all in plain words for a non engineer.

Gap closed here: the why was going to live only behind Why does this matter?; it now shows on the lead card and on each other finding's one line card, so seeing it takes no step.

Gaps left (not this milestone):
- CodeRabbit shows the suggested fix as a diff before you apply it. Squibby's Fix it runs and proves the fix, then offers undo, but shows no preview of the edit. A candidate for a later milestone.
- CodeRabbit saves review preferences from what people reply (Learnings). Squibby now counts Looks fine per kind; making a kind quieter on its own is left until the counts show a pattern, and would be the founder's call.
- HeyClicky and Coucou answer in motion (captions, a live ticker). The why line is static text; the notch line (M96, M113) does not show it yet.

## Not done, and why

- No real model was asked. Whether Haiku and the stronger lane name a correct changed line often enough is a [verify] below; until then a worry that names no line simply stays a note, which is the safe side.
- The notch and hover panel do not show the why line: they show one short line per review, and the plan scopes this to the card.

## [verify]

1. **A real model names the line.** On a real Mac with the founder's key (costs cents), in a throwaway practice project in a temporary folder (never a real project): make a change that breaks something (for example a total added twice), open Review changes, and check (a) the card shows Worth a look with "Where it is: the written review points at the line shown above, and Squibby checked this change touched it. Try it to be sure." under the code box, and the line is the right one; (b) a harmless change gives no worry, or a note only. Do this for the cheap lane and the stronger lane (a change to sign in or payments). Record how often the worry had a place inside the change across 10 changes.
2. **Real checks give the exit code.** In the same copy, make `npm test` fail, press Review them, and check the lead line reads "Why I'm sure: <check> did not pass (error code N)" with the real code.
3. **Counts.** With beta numbers on, press Fix it on one card and Looks fine on another, then Settings, Your numbers: the by kind lines show the two kinds, and `~/Library/Application Support/Companion/metrics.json` holds only counts.
