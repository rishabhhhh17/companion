# M123: Did it do what you asked? Watch it try.

Status: plan written 27 Nov 2026. All five slices built 27 Nov 2026 on branch m123/asked (not committed). Not tried on a real Mac; the promises were tried with the real hidden browser on a test page. The share link server routes stay off (SHARE_ON, RECEIPTS KV) until the server is deployed. The founder said "yeah, both build it" (27 Nov 2026) after the Greptile comparison. Feature code starts after this plan is read back to the founder. M122 is left free for the autonomous fix loop (M121 "out of scope").

## Why

Greptile (greptile.com, studied 27 Nov 2026) reviews code changes for engineers, and its new TREX runs tests on every change. That is a cloud review of the code. Squibby's own lane is the person on a Mac at the moment the AI says done, who never opens a pull request. The question that person has is not "is the code good" but "did it do what I asked". No competitor answers that in plain words with proof.

## What is already built (do not rebuild)

- **Not what you asked for** (M85, `runner/src/review/drift.ts`): flags files changed beyond the ones the request named. It checks *which files*, not *what the app now does*.
- **Watch what changed** (M86, `runner/src/review/replay.ts`): a drawn replay of 3 to 6 beats. The proof screenshot has no beat yet.
- **Share what my AI did** (M88, `app/src/shareReceipt.ts`, `receiptfile.rs`): a redacted, self contained web page saved as a file. No server, no upload.
- **Go live report** (M76): Save as a web page or PDF.

## What M123 adds

1. **Promises from the request.** For Squibby's own runs, the request becomes 1 to 5 plain promises a person can see ("a pricing page opens at /pricing", "each plan has a button", "the menu links to it"). Rules first; with `promises.model` on, one capped call on the person's own key may phrase them better. A validator drops any promise that names a page, file or element the request and the change do not contain. The person can edit or remove a promise before the check runs (off as usual: shown, not asked).
2. **The hidden browser tries each promise.** Each promise maps to steps the existing browser check already knows (open, find, press, fill). Each gets one of: kept, not kept, could not check (said with the reason). Exit codes still come first (rule 14); a kept promise never overrides a failed build or test.
3. **The receipt says it.** A new "what you asked" block on the receipt, above the checks: each promise with its mark. The stamp is "works" only when the checks passed and every promise that could be checked was kept. "Could not check" never counts as kept.
4. **Watch it try.** Each promise gets a beat in Watch what changed with its proof screenshot (the hidden browser's picture of the app being built, stored with the receipt as today, never the user's screen). The broken moment is marked on the picture.
5. **A receipt you can send as a link** (off as usual). On a tap, the M88 page (same redaction, same `receiptfile.rs` check) is uploaded to a Cloudflare free tier store and the person gets a link. The link ends after 30 days, the person can delete it at any time from History, and nothing is uploaded without the tap (rule 13). The privacy page says exactly what goes up.

## Founder decision (F33, 27 Nov 2026)

- **Other tools' requests:** option (b). The done card gets one optional line, "what did you ask?", where the person types or pastes their ask. Squibby's own runs use the request they already have. The done hook still never reads its input (M75, M85). See `docs/decisions/F33-your-ask-for-other-tools.md`. The founder said "start doing it, go with your pick" (27 Nov 2026), which is the approval to build.

## Out of scope

- Reviewing code style or standards (Greptile's lane).
- Any check that needs the user's screen.
- Paying for hosting: Cloudflare free tier only; if the free limits are reached, links stop and saving as a file still works.

## Tests first

- Promise rules and the validator (nothing named that the request and change lack).
- Promise to browser step mapping, and the three outcomes.
- The stamp rule: works only with passed checks and every checkable promise kept.
- Replay beats with a screenshot, still rejecting any beat not in the fact sheet.
- Share link: nothing uploads without the tap; the uploaded string equals the previewed string; delete removes it; the link ends.
- Redaction is the M88 redaction, unchanged.

## Order

1. Promises and validator (runner), 2. browser mapping and outcomes, 3. receipt block and stamp rule (pages), 4. replay beats, 5. share link (relay Worker + shell + History row), 6. site copy and CHANGELOG.

## Built (27 Nov 2026, branch m123/asked)

- `runner/src/review/promises.ts`: `promisesFrom` (rules), `validPromise`, `stepFor`, `outcomeFrom`, `stampWith`, `cleanAsk`, `tryPromises`. Tests: `runner/test/m123-promises.test.ts`.
- `runner/src/proof/ladder.ts`: `promises` option, tried after the page opened with no errors; outcomes on `LadderResult.promises`; the verdict is not changed there.
- `runner/src/agent.ts`: Squibby's own runs pass their request's promises; the receipt carries `promises`; a run with a broken promise is not counted as a proven fix. Reviews of other tools pass the typed ask (`checkLive`).
- `runner/src/review/service.ts`: `review.now` `asked` (F33), cleaned and sent to the checks with the changed files; a broken promise turns passed checks into failed with a plain note. Tests in `runner/test/review-service.test.ts`.
- `protocol/index.ts`: `Receipt.promises`, `ReviewNow.asked`, `review.result` `promises`.
- App: `app/src/asked.ts` (parse, count), `verdict.ts` (`notKept`: Not fixed yet, never proven), the receipt list in `card.tsx`, the optional ask line and the list on the review card (`reviewCard.tsx`), strings, `ui/fix.css`. Tests: `app/src/m123.test.ts`.
- Known limits: the rules find pages, quoted words, buttons and "link it from the menu"; counts ("three plans") are not checked yet. A link promise passes when a link or button with the page's name can be pressed on the home page.

## Built later the same day (slices 4 and 5)

- **Slice 4, watch it try.** `promises.ts` `forReceipt`: each promise keeps the hidden browser's picture (`image`, base64 JPEG, at most 700,000 characters, plain base64 only) when Make pictures is on and the task is not off the record. Button and link promises use `press` (find by words, with the browser check's own guard against risky buttons), not `click` (a selector). App: `askedView.tsx` shows one picture at a time, the broken one first, changed only by a press. Real browser test: `runner/test/m123-real-browser.test.ts`.
- **Slice 5, a receipt as a link.** Server: `usage-proxy/src/receipt-links.ts` (`POST /v1/receipts` signed in only, 30 a day; `GET /r/<id>` with a policy that lets nothing run, load or be framed, and noindex; `DELETE /v1/receipts/<id>` with the delete token or by the owner; KV with a 30 day expiry; `checkPage` allowlist, which passes the M88 fixture). Off unless `SHARE_ON` is set and the `RECEIPTS` KV namespace is bound (wrangler.toml shows how). Engine: `runner/src/receiptlinks.ts` (the Squibby sign in only, https only, the link must be on the same server, delete tokens kept in `receipt-links.json` at 0600). Protocol: `receipt.share`, `receipt.unshare`, `receipt.shares`, event `receipt.shared`. App: Copy a link and Delete link in the share preview (`m88Panels.tsx`, `shareLink.ts`).
- **Before turning it on:** create the KV namespace, set SHARE_ON, and add one paragraph to the privacy page (what goes up: the receipt page as previewed; kept 30 days; delete any time). The share page does not show the promises yet.
