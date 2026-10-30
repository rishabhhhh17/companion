# M45 spec: Tell the truth

Source: the executive review, section 4 (F1, M1, M2, M3, M4); the plan `docs/milestones/M45-M49-the-product-it-should-be.md` (M45); and three read-only code maps of `/Users/rishabhkapadia17/Developer/companion-wt/m36-type`. Line numbers come from that worktree and may drift by a few lines. Before you edit, find each spot by the code quoted next to it.

**Goal.** One pure function decides what a finished task's result is. Every surface that shows a result reads that function and nothing else. After Undo, no surface says "proven", shows a green tick, or uses the done tone.

---

## 0. Order of work

1. Write the tests in section 7 first and watch them fail.
2. Make the protocol and runner changes (section 3.1 and 3.4). These are additive and change no wire meaning.
3. Add `app/src/verdict.ts` and the new strings (sections 1 and 6).
4. Make the reducer changes (section 3.2).
5. Switch every call site over (section 2).
6. Make the `safety.ts`, `rules.ts` and approval card changes (section 4).
7. Change the failure and loop cards (section 5).
8. Change the zero cost and first run words (section 6).
9. Run `scripts/test-all.sh`. Rebuild the app, open it, and walk one task through Undo. Add a CHANGELOG line in plain words.

---

## 1. The verdict function: `app/src/verdict.ts` (new)

The file is pure. It imports only `S` from `./strings.ts`, plus `import type` where it needs types. It has no runtime import from `model.ts`, so there is no import cycle. The adapters that read the `Model` live in `model.ts` (section 2.1).

### 1.1 Types

```ts
import { S } from "./strings.ts";

/** What the checks showed. "none": no check ran (proof "skipped", or no proof). */
export type ProofFact = "passed" | "partial" | "failed" | "none";
/** How the task ended. "unknown": the receipt did not say. Never read as done. */
export type EndFact = "done" | "stopped" | "limit" | "needsYou" | "failed" | "unknown";
export type LimitWhy = "spending" | "daily" | "turns";
export type FailWhy = "check" | "noConnection" | "claudeBusy" | "error";

export type Facts = {
  proof: ProofFact;
  ended: EndFact;
  limit?: LimitWhy;        // only read when ended === "limit"
  failWhy?: FailWhy;       // only read when ended === "failed"
  undone: boolean;         // an Undo put the files back after this task
  back?: boolean;          // and then "Bring the fix back" put them back again
  changed: number;         // files the task changed (0 when unknown)
  missing: string[];       // display names of checks that could not run (partial). [] when unknown
  canBringBack?: boolean;  // the Undo's safety copy is known, so the fix can be brought back
  turnOpen?: boolean;      // a "your turn" has put old code back in one place
};

export type VerdictKind =
  | "proven" | "partial" | "unchecked" | "noChange" | "turn"
  | "failed" | "stopped" | "limit" | "needsYou" | "error"
  | "undone" | "back";
export type Tone = "good" | "mixed" | "bad" | "plain" | "ask";
export type VerdictIcon = "tick" | "cross" | "wait" | "stop" | "undo";   // all exist in icons.tsx
export type Offer = "undo" | "bringBack" | null;

export type Verdict = {
  kind: VerdictKind;
  headline: string;        // short, no full stop: "Fixed and proven"
  line: string | null;     // one full sentence under it, or null
  say: string;             // headline and line as one sentence, for copy, VoiceOver, speech, notch
  tone: Tone;
  icon: VerdictIcon;
  offer: Offer;            // the one undo kind of button this result offers
  proven: boolean;         // true only for kind "proven". The only "proven" anywhere.
};

export function verdictOf(f: Facts): Verdict;
export function missingWords(names: string[]): string;   // "The tests and the browser check could not run."
```

### 1.2 Precedence and truth table

The function evaluates the rows top to bottom. The first row that matches wins.

"Has fix" means `f.changed > 0 || f.proof === "passed" || f.proof === "partial"`.

| # | Condition | kind | headline | line | tone | icon |
|---|---|---|---|---|---|---|
| 1 | `undone && back` | back | The fix is back | proof passed or partial: "It passed its checks before the Undo. Nothing was checked since." Otherwise: "Nothing was checked since." | plain | wait |
| 2 | `undone && has fix` | undone | Undone | proof passed or partial: "The fix is gone, so the problem is back." Otherwise: "Your project is back as it was before this task." | plain | undo |
| 3 | `ended === "needsYou"` | needsYou | Waiting for your answer | proof failed: "A check failed, and it needs something only you can give." Otherwise null | ask | wait |
| 4 | `proof === "failed"` (any ending) | failed | Not fixed yet | ended stopped: "A check failed, and then you stopped it." ended limit: "A check failed, and then it stopped at {limitWhere}." Otherwise: "A check failed." | bad | cross |
| 5 | `ended === "stopped"` | stopped | Stopped | changed > 0: "It changed files before you stopped it. Nothing was checked." Otherwise: "Nothing was changed." | plain | stop |
| 6 | `ended === "limit"` | limit | by limit: spending "Stopped at this task's spending limit", daily "Stopped at today's limit", turns "Stopped at the most turns allowed" (no limit given: spending) | changed > 0: "It changed files before it stopped. Nothing was checked." Otherwise null | plain | stop |
| 7 | `ended === "failed"` (proof is not failed) | error | noConnection: "Stopped: could not reach Claude". claudeBusy: "Stopped: Claude was busy". error, check or nothing given: "Something went wrong" | error, check or nothing given: "It stopped before it finished. Nothing was checked." Otherwise null | bad | cross |
| 8 | ended done or unknown, `proof === "passed"`, `turnOpen` | turn | Proven before your turn | "One place has its old code again." | mixed | wait |
| 9 | ended done or unknown, `proof === "passed"` | proven | Fixed and proven | null | **good** | **tick** |
| 10 | ended done or unknown, `proof === "partial"` | partial | Fixed, not fully proven | `missingWords(missing)`, or "Some checks could not run." when `missing` is empty | mixed | wait |
| 11 | ended done or unknown, proof none, `changed > 0` | unchecked | Changed, not proven | "There was no check to run on it." | plain | wait |
| 12 | ended done or unknown, proof none, `changed === 0` | noChange | Nothing was changed | null | plain | wait |

Notes on the rows:

- **Ended unknown.** An ending of "unknown" reaches row 9 only when the proof passed. The ladder runs only after a complete round, so a pass already implies the task got that far. With proof none and an unknown ending, the result is never good.
- **Undo with nothing to undo.** Undone with no fix (a read-only answer) is ignored, and evaluation goes on to the next rows.
- **Offer**, worked out after the kind:
  - `"undo"` when `changed > 0 && (!undone || back)`.
  - `"bringBack"` when `undone && !back && canBringBack`.
  - Otherwise `null`.
  - Failed, stopped, limit and error rows with changes all offer `"undo"`. That is the hook for M48's "Stop and undo my changes".
- **say.** When `line` is set, `say` is `${headline}. ${line}`. Otherwise it is `${headline}.`. Build it with `S.verdict.say(headline, line)`.
- **proven** equals `kind === "proven"`.

`missingWords(names)`:

- One name: `"The browser check could not run."`
- Two names: `"The tests and the browser check could not run."`
- Three or more: `S.verdict.someCouldNotRun`.
- The first letter is a capital.

Display names come from `S.verdict.check[rung]`, falling back to the step's `label` in lower case.

### 1.3 Mapping tone to the existing CSS hooks

The verdict's `Tone` is mapped once, in the adapters, never in surfaces:

| Verdict tone | Hero tone | Notch job tone | Notch job state |
|---|---|---|---|
| good | done | done | done |
| bad | notDone | failed | error |
| mixed | partly | partly | idle |
| plain | plain | plain | idle |
| ask | needsYou | needsYou | needsYou |

- `homeHero.ts` `Hero.tone` grows to `"idle" | "working" | "needsYou" | "done" | "notDone" | "partly" | "plain"`.
- `islandPanel.ts` `JobTone` grows to `"working" | "needsYou" | "done" | "failed" | "partly" | "plain"`.
- In `style.css`, add `[data-tone="partly"]` (the amber colour token on the dot only) and `[data-tone="plain"]` (the idle look). Only `done` keeps green (style.css:606 and the `.bar-dot` rule).

---

## 2. Call sites to switch over

After this section, a grep for `proof === "passed"`, `proof === "failed"`, `S.proven`, `S.notChecked`, `S.provenGaps`, `islandDone` and `saidDone` in `app/src` (outside tests and `verdict.ts`) must return nothing, except `reactions.ts:16`, which is kept on purpose (see section 8).

### 2.1 Adapters in `app/src/model.ts`, next to `receiptProofWords`

```ts
import { verdictOf, type Facts, type Verdict } from "./verdict.ts";

export function receiptFacts(m: Pick<Model, "receipt" | "task" | "teach">): Facts | null {
  const r = m.receipt; if (!r) return null;
  const steps = m.task?.proof?.steps ?? [];
  return {
    proof: r.proof === "passed" || r.proof === "partial" || r.proof === "failed" ? r.proof : "none",
    ended: r.end ?? "unknown", limit: r.limit, failWhy: r.failWhy,
    undone: !!r.undone, back: !!r.back, changed: r.changed.length,
    missing: r.proof === "partial" ? steps.filter((s) => s.status === "skipped").map((s) => (S.verdict.check as Record<string, string>)[s.rung] ?? s.label.toLowerCase()) : [],
    canBringBack: !!r.undoSafety,
    turnOpen: !!(m.teach && m.teach.checkpoint === r.checkpoint && teachOpen(m.teach)),
  };
}
export const receiptVerdict = (m: Pick<Model, "receipt" | "task" | "teach">): Verdict | null => { const f = receiptFacts(m); return f ? verdictOf(f) : null; };

/** A What I did row as facts. "running" is not a verdict: callers check it first. */
export function historyFacts(h: Pick<HistoryItem, "status" | "proof" | "changed" | "undone">): Facts {
  const s = h.status;
  const ended: Facts["ended"] = s === "done" ? "done" : s === "needs_you" ? "needsYou" : s === "interrupted" ? "stopped"
    : s === "error_max_budget_usd" || s === "daily_limit" || s === "error_max_turns" ? "limit" : "failed";
  const limit = s === "daily_limit" ? "daily" : s === "error_max_turns" ? "turns" : s === "error_max_budget_usd" ? "spending" : undefined;
  const failWhy = s === "not_done" ? "check" : s === "no_connection" ? "noConnection" : s === "claude_busy" ? "claudeBusy" : ended === "failed" ? "error" : undefined;
  const p = h.proof;
  return { proof: p === "passed" || p === "partial" || p === "failed" ? p : "none", ended, limit, failWhy, undone: !!h.undone, changed: h.changed ?? 0, missing: [] };
}
```

### 2.2 Every surface

| # | Site | Today | Change |
|---|---|---|---|
| 1 | `model.ts:1288-1292` `receiptProofWords` | passed, failed, else "Not checked" | Body becomes `return receiptVerdict(m)?.say ?? ""`. Keep the export so `copytext.ts`, `speech.ts` and older tests compile. The `S.teachProvenBefore` branch is replaced by row 8. |
| 2 | `homeHero.ts:35-39` `heroWords`, receipt branch | `headline: label`, `line: doneLine(proofWords, cost)`, tone done or notDone | `const v = receiptVerdict(m)!`. Return `{ headline: v.headline, line: S.look.doneLine(title(m.task.label), costWords(m.receipt.usdEstimate)), detail: v.line ?? undefined, tone: heroTone(v.tone) }`. Add an optional `detail?: string` to `Hero`. In `card.tsx:1532-1533`, draw `hero.detail` as one more muted line under `hero.line`. |
| 3 | `homeHero.ts:45` `undoCan` | `changed.length > 0 && !m.undo && project` | `receiptVerdict(m)?.offer === "undo" && !m.undo && !!project`. This fixes the case where a bisect undo still offered Undo. Add `bringBackCan(m, project)`: `offer === "bringBack" && !m.undo && !!project && !cardWorking(m)`. |
| 4 | `islandPanel.ts:36-39` `islandJobs`, receipt card | `failed ? error : done` | `const v = receiptVerdict(m)!`. Push `{ key: \`done:${checkpoint}\`, state: jobState(v.tone), tone: jobTone(v.tone), title, sub: v.say, cost }`. `workPeekKey` (`:46`) needs no change: the tone and the sub now change on Undo. |
| 5 | `card.tsx:1958-1963` receipt proof row | class and icon from `m.receipt.proof`, text from `receiptProofWords` | `const v = receiptVerdict(m)!`. Use `<div className={\`proof ${v.tone === "good" ? "ok" : v.tone === "bad" ? "bad" : "wait"}\`}><Icon name={v.icon} size={16} /><span><b>{v.headline}</b>{v.line ? \` ${v.line}\` : ""}</span></div>`. Show the row for every receipt with `changed.length > 0` or `v.kind !== "noChange"`. |
| 6 | `card.tsx:556` `const undone` | `m.undo?.stage === "done"` | `const undone = !!m.receipt?.undone \|\| m.undo?.stage === "done";`. This hides the picture, "Show me what changed" and the turn offer after a timeline or bisect undo too. |
| 7 | `card.tsx:1997-2000` undo status | "Undone." only through `m.undo` | Keep the line. When `m.receipt.undone && !m.undo` (a timeline or bisect undo), show nothing extra, because row 5 already says Undone. Add the Bring back button and confirm step under it (section 3.3). |
| 8 | `proofChips.ts:9-14` | never reads undone | Return `[]` when `m.receipt.undone`, including after a bring back. Chips are proof for the files as checked, and those files changed. The signature stays the same. |
| 9 | `card.tsx:1928-1944` proof panel | heading "Checking the work", tries note, reason | Heading: `isFixing ? S.fixing : steps.some(running) ? S.checkingTitle : m.receipt?.undone ? S.checksBeforeUndo : S.checksTitle`. Hide `triesNote` when `m.receipt?.undone`. The failure line is covered in section 5. |
| 10 | `model.ts:1012-1017` `triesNote` | "Fixed after N tries" | Return null when `m.receipt?.undone`. Change the "Fixed after" wording to `S.passedAfter(n)` "Passed after {n} tries" (the check passed; "fixed" is the verdict's word). Move the three hard-coded strings to `strings.ts`. |
| 11 | `model.ts:1233-1243` `characterWords` | "Not done" or `stateLabel` | Before the final `return stateLabel(...)`: `if ((m.character === "done" \|\| m.character === "error") && m.receipt && m.task && !isFixing(m)) return receiptVerdict(m)!.headline;`. Delete the line `m.character === "error" && notDoneReason(m) ? "Not done"`; row 4 covers it. |
| 12 | `home.ts:216-229` `islandWings` | `done` gives a tick | When `v === "done" && v === m.character && m.receipt`: mark is `"tick"` only when `receiptVerdict(m)!.proven`; `"red"` when the tone is bad; otherwise return `null` (bare notch). Show me's own done (`your_turn_done`) keeps its tick. The cheer (`island.tsx:128-136`) follows `ticking`, so it now fires only for a proven fix. |
| 13 | `home.ts:285` `islandLineBase` | `S.islandDone(label)` | When `v === "done" \|\| v === "error"`, `own`, and `m.receipt`: `cut(S.islandResult(receiptVerdict(m)!.headline, label))`. Otherwise keep `stateLabel(v)`. Delete `S.islandDone` if nothing else reads it. |
| 14 | `a11y.ts:35-38` | `saidNotDone` or `saidDone` | `const v = receiptVerdict(m)!`. Push `{ key: \`receipt:${checkpoint}:${v.kind}\`, text: on("receipt", S.saidResult(label, v.say)) }`. The kind in the key makes Undo announce "Undone" once. Delete `saidDone` and `saidNotDone` if nothing else reads them. |
| 15 | `speech.ts:216` `repliesIn` | `receiptProofWords` | `text: receiptVerdict(m)!.say`. Keep the key as it is, so the reply is spoken once, at the end. |
| 16 | `copytext.ts:24-36` `receiptCopy` | the proof words, "free so far" | Use `receiptVerdict(m)!.say` for the proof line (always, not only when there are changes). Cost line: `usd > 0 ? \`${commands} ${S.commands} · ${S.cost}: ${formatUsd(usd)}\` : \`${commands} ${S.commands} · ${S.noCost}\``. |
| 17 | `model.ts:991-1004` `historyWords` | its own switch with hard-coded words | `if (t.status === "running") return S.historyRunning; return verdictOf(historyFacts(t)).headline;`. This fixes `daily_limit`, which used to fall to "Something went wrong", and makes undone rows read "Undone". Move "Running" to `S.historyRunning`. |
| 18 | `card.tsx:261` history row | `historyWords · formatUsd` | `historyWords(h) · costWords(h.usd)`. |
| 19 | `history.ts:11-18` `statusGroup` | no undone group | Take the item, not the status: `statusGroup(h: Pick<HistoryItem,"status"\|"undone">)`. `h.undone` gives `"undone"`. Add `"undone"` to `HistoryStatus`, to `HISTORY_STATUSES` and to `S.historyStatus` ("Undone"). Update `filterHistory`. |
| 20 | `history.ts:42-48` `historyUndo` | the `undone` argument only | Add `if (h.undone) return null;` before the newest check. The `undone` argument stays for the in-session case. |
| 21 | `recentList.tsx:22-25` | icon and sr from `proof` only | Add a pure `recentMark(i): { icon: VerdictIcon; words: string }` (exported; `"running"` gives `{icon:"wait", words:S.historyRunning}`), using `verdictOf(historyFacts(i))`. Render `<Icon name={mark.icon}/>`, with the dot only for `wait`, `sr = mark.words`, and `data-proof={kind}`. |
| 22 | `strings.ts:216` `provenGaps`, `:215` `proven`, `:217` `notChecked` | phrasings spread around | Delete `proven`, `provenGaps` and `notChecked` once nothing reads them. `recentList` used `S.proven`, and that use is gone. `S.notDone` stays only if the proof panel or the practice still read it. Otherwise delete it too. |

Left alone on purpose: `waitsForAnswer`, `canFollowUp`, `answerGone`, `receiptSaid` and `canOfferTurn` already read `undone` correctly. `groups.ts:94-96` reads the raw `ended` of the event, and it keeps doing so.

---

## 3. Reducer, protocol and runner

### 3.1 Protocol (`protocol/index.ts`), additive only

1. **`Receipt`, `:194-206`.** Add `endedWhy?: "check_failed" | "spending_limit" | "daily_limit" | "turns" | "no_connection" | "claude_busy" | "error"`. In the validator at `:546`, add `opt("endedWhy", oneOf("endedWhy", [...]))`. `ended` keeps its four values, because `groups.ts` (F20) depends on them.
2. **`TaskSummary`, `:268`.** Add `undone?: boolean`. The validator does not check task rows field by field (`list("tasks")`), so it needs no change.
3. **`approval.request` risk enum, `:544`.** Add `"house_rule"`. Rust does not enumerate risks; `peek.rs` was checked.
4. **Fixtures, `protocol/fixtures/events.jsonl`.** Add:
   - a receipt with `ended:"failed", endedWhy:"spending_limit"`
   - a receipt with `ended:"stopped"`
   - an `approval.request` with `risk:"house_rule", undoable:true`
   - a `tasks.list` row with `undone:true`

   Leave the old receipts without `ended` (lines 8, 89, 98 and 99) as they are. They test the "unknown" path.

### 3.2 App reducer (`app/src/model.ts`)

**The `Receipt` type, `:29`.** Add:

```ts
end?: "done" | "stopped" | "limit" | "needsYou" | "failed";
limit?: "spending" | "daily" | "turns";
failWhy?: "check" | "noConnection" | "claudeBusy" | "error";
undoSafety?: string;   // the safety copy the Undo made first: "Bring the fix back" restores it
back?: boolean;        // the fix was brought back after the Undo
```

Add `undone?: boolean` to `HistoryItem` (`:31`).

**`case "receipt"`, `:851-859`.** Keep the runner's ending. Add `...endOf(e)`:

```ts
const endOf = (e: Ev) => {
  const why = e.endedWhy;
  if (e.ended === "done") return { end: "done" as const };
  if (e.ended === "needs_you") return { end: "needsYou" as const };
  if (e.ended === "stopped") return { end: "stopped" as const };
  if (e.ended !== "failed") return {};   // no ending sent: "unknown", never done
  if (why === "spending_limit") return { end: "limit" as const, limit: "spending" as const };
  if (why === "daily_limit") return { end: "limit" as const, limit: "daily" as const };
  if (why === "turns") return { end: "limit" as const, limit: "turns" as const };
  return { end: "failed" as const, failWhy: why === "no_connection" ? "noConnection" as const : why === "claude_busy" ? "claudeBusy" as const : why === "check_failed" ? "check" as const : "error" as const };
};
```

A new receipt is built fresh, so `undone`, `back` and `undoSafety` start cleared. That is the only place they are cleared. Add a comment saying so.

**Where undone is set:**

- **`checkpoint.restored`, `:476-486`.** Before the existing "any undo in this project" line, handle Bring back. If `m.receipt?.undone && m.receipt.undoSafety === e.checkpoint`, then `m = { ...m, receipt: { ...m.receipt, back: true, undoSafety: undefined }, undo: null }` and return. Keep `undone` true: the follow up gates must stay closed, because the runner's `lastTask.undone` stays true.

  Otherwise, keep the existing marking and add `undoSafety: typeof e.safety === "string" ? e.safety : undefined` and `back: false`.

  Then turn the task agent's finished state to rest. If `m.task?.agent` is `"done"` or `"error"` in `m.agents`, call `withAgents(m, { ...m.agents, [a]: "idle" })`. This removes the green tick and the "Done" line at once, instead of waiting 4 seconds for `ui.settle`.

- **`bisect.undone`, `:435-441`.** Same idea: set `undone: true, back: false, undoSafety: e.safety` if the event carries it (check `runner/src/agent.ts:1833-1850`; add `safety` to that event if it is missing), and turn the agent from done to idle.

- **`app.runner_restarted`, `:543-550`.** No change. `gone` is separate. A Bring back after a restart still works, because the safety snapshot is on disk.

**Bring back state.** Reuse `m.undo` with a flag rather than adding a second state machine:

- `ui.bringBackAsked` sets `undo: { stage: "confirm", checkpoint: m.receipt.undoSafety, back: true }`.
- `ui.undoSent` and `ui.undoCancelled` work as they do today.
- `checkpoint.restored` with `undo.back` is handled by the branch above, which sets `undo: null`.

Add `back?: true` to the `UndoState` type.

**History refresh.** `card.tsx:850` already asks for `tasks.list` when `[project, m.receipt]` changes. A receipt marked undone is a new object, so the list refreshes.

### 3.3 Bring the fix back (app UI, minimal; M48 moves it into the result card)

It sits inside the receipt in `card.tsx`, under the undo status line. It shows when `bringBackCan(m, project)`:

- A button: `S.bringBack` ("Bring the fix back").
- A `ConfirmStep` with `S.bringBackSure`, plus `S.bringBackYes` / `S.bringBackNo`. Pressing yes sends `undo(project, m.receipt.undoSafety)` (`commands.ts:45`).
- While it runs, `S.bringBackWorking`.

This uses only the shadow snapshots, so rule 10 holds.

**[verify] first.** A runner test must show that `checkpoint.restore` accepts the safety id from an earlier restore and puts the task's files back (`checkpoints.ts:651-657`: `restoreNow` looks the id up in `this.refs()`). If it does not, ship M45 without the button. `canBringBack` then stays false, and `strings.ts:109` loses "so you can undo the Undo".

### 3.4 Runner

1. **`runner/src/agent.ts:1173`.** Add `endedWhy` to the receipt when `ended` would be `"failed"`:
   - `proof === "failed"` or `status === "not_done"`: `"check_failed"`
   - `error_max_budget_usd`: `"spending_limit"`
   - `daily_limit`: `"daily_limit"`
   - `error_max_turns`: `"turns"`
   - `no_connection`: `"no_connection"`
   - `claude_busy`: `"claude_busy"`
   - anything else: `"error"`

   Put this in one exported function, `endedWhyOf(status, proof)`, in `followup.ts`, next to `endingOf`. Leave `ended` and `agent.state` (`:1174`) as they are.
2. **`runner/src/tasklog.ts`.**
   - Add the column `undone_by TEXT` in `setup()`, the same way as the other `ALTER TABLE` lines.
   - Add `markUndone(project, fromN: number, safetyId: string)`. It runs `UPDATE tasks SET undone_by = ? WHERE project = ? AND undone_by IS NULL AND checkpoint IS NOT NULL AND <checkpoint number> >= ?`. Parse the number with `CheckpointStore.num`. Do it in TypeScript over `list(project)` if SQL parsing is awkward.
   - Add `bringBack(project, safetyId)`, which sets `undone_by = NULL WHERE undone_by = safetyId`.
   - In `list()`, add `undone: r.undone_by != null`.
3. **`agent.ts:686-700` (`checkpoint.restore`).** After a successful restore, call `this.o.log.bringBack(cmd.project, cmd.checkpoint)` first. That returns nothing harmful when the target is not a safety copy. Then call `this.o.log.markUndone(cmd.project, CheckpointStore.num(cmd.checkpoint), r.safetyCheckpoint)`. Make the same calls in `bisect.undo` (`:1833-1850`).
4. **`wherewasi.ts:44-50`.**
   - An undone row reads `"You undid it, so the project is back as it was before it."`
   - `partial` reads `"It finished, but some checks could not run."`
   - Move both to the runner's own strings, if it has them, or keep them as constants in that file. The runner has no `strings.ts`; follow the file's own style.
5. **`recap.ts:20-27`.** Do not count undone rows as checked.

---

## 4. Approval cards (`runner/src/safety.ts`, `runner/src/rules.ts`, `app/src/approvals.ts`)

### 4.1 One fact

Undo puts back project files from a shadow snapshot. It never touches `.git` (F13, rule 10) and never takes back anything that left the Mac (T06). So:

- **Invariant in `safety.ts:26`.** Replace the helper with:

  ```ts
  const ask = (risk: Risk, reason: string, undoable: boolean): Verdict =>
    ({ decision: "ask", risk, reason, undoable: risk === "irreversible" || risk === "git" ? false : undoable });
  ```

  `undoable` is now required (no default), so the compiler shows every call site. Each one is reviewed below.
- `allow(reason = "ok", undoable = true)`. The `userAskedCommit` allow at `:685` passes `false`, so a commit the person asked for lands in the receipt's "Cannot be undone" list (`agent.ts:2241`).

### 4.2 Which verdicts become not undoable

These all move from true to false. Most do so through the invariant, a few explicitly:

| Line | What | New risk | undoable |
|---|---|---|---|
| 237 (stops) | TaskStop or KillShell on a shell this task did not start | irreversible | false |
| 237 (reads) | BashOutput of a shell this task did not start | **outside_project** (a read) | true (no Undo line is shown, see 4.4) |
| 284 | unknown Google tool | irreversible | false |
| 288 | Bash with no command | irreversible | false |
| 291 | unknown tool | irreversible | false |
| 417, 445, 456, 469 | nested too deep, redirect worked out at run time, command builds itself, command name worked out at run time | irreversible | false |
| 479, 480 | sh, bash, source, `*.sh` | irreversible | false |
| 484 | xargs | irreversible | false |
| 497, 499, 539 | bun -e, node from stdin, inline code | irreversible | false |
| 620 | find -delete / -exec / -ok / -fprint | irreversible | false |
| 630 | `OTHER_FOLDER` (git pointed at another folder) | outside_project | **false** (explicit) |
| 683 | `mutates` in git (remote, branch, tag, stash, config, default: commit, add, reset, checkout, switch, restore, merge, rebase, cherry-pick, revert, pull, clean, rm, mv, init, gc, worktree, submodule) | git | false |
| 731 | npm, pnpm or yarn `config set/delete/edit` | irreversible | false |
| rules.ts 181-182 | house rule deny and ask | **house_rule** | see 4.3 |

These stay `true` and pass `true` explicitly:

- `settings` at 96 and 380 (T06 keeps a 0600 copy).
- `outside_project` reads at 252, 260, 437, 439, 476, 478, 558, 576, 577, 595 and 680.

Already `false`, unchanged: 255, 270, 283, 473, 503, 504, 508, 509, 645, 660, 673, 687, 691, 728, 729, 730, 743, 750-759, 768 and 770.

Decisions (allow, ask, deny) do not change anywhere. Only `undoable`, the house rule risk label and the reason words change.

### 4.3 House rules

- `rules.ts:181-182`: `risk: "house_rule"`. Add `"house_rule"` to `Risk` in `safety.ts:16`.
- `agent.ts:2189`:

  ```ts
  const verdict: Verdict = ruled && rank[ruled.decision] > rank[base.decision]
    ? { ...ruled, undoable: ruled.undoable && base.undoable } : base;
  ```

  A rule can never turn something that is not undoable into undoable.
- `agent.ts:2187` (the rules file cannot be read): `risk: "house_rule"`. It already keeps `base.undoable`.
- `taskScopeCovers` (`:223-229`) takes `byHouseRule` as a separate argument and gates on `undoable`. A rule asking about an Edit inside the project stays covered for the rest of the task. Test that it still is.

### 4.4 How the card picks its words (`app/src/approvals.ts:21-29`)

```ts
const KNOWN = ["irreversible", "git", "outside_project", "install", "network", "settings", "house_rule"];
export type ApprovalWords = { question: string; what: string | null; why: string; undo: string | null; canUndo: boolean };
export function approvalWords(a, project = "") {
  const known = KNOWN.includes(a.risk);
  const canUndo = known && a.undoable === true && a.risk !== "irreversible" && a.risk !== "git";
  const question = known ? S.approval.question[a.risk] : S.approval.question.irreversible;
  const isRead = /^Read:/.test(a.action ?? "");
  return { question, what: whatOf(a.action, project), why: sentence(a.title), undo: isRead ? null : canUndo ? S.approval.undoYes : S.approval.undoNo, canUndo };
}
```

What this guarantees:

- "Do something that can't be undone?" can only appear together with "Undo can't take this back."
- When `undoable` is missing, the card says "Undo can't take this back."
- An unknown risk reads as irreversible and not undoable.

Changes on the card itself:

- `whatOf(action, project)` runs `plainPath` (`model.ts`) on the result, so paths show from the project folder down (M4).
- `card.tsx:1759`: the class comes from `w.canUndo`, not `a.undoable`.
- `card.tsx:1761-1762`: Allow loses `primary`, so Allow and Don't allow carry equal weight (M4). Don't allow keeps `data-safe` and the focus.

Add `house_rule: "Allow this? One of your house rules asks first."` to `S.approval.question`. `islandPanel.ts` `HERE` is not changed, so house rule asks open Home.

### 4.5 Plain reasons, old to new

These reasons appear under the card's "Why I'm asking", and they also reach Claude in deny messages. Keep the meaning and change only the words. Each reason is one full sentence, plain words, no em dashes.

| Line | Old | New |
|---|---|---|
| 237 | this stops something this task did not start | This stops a program that this task did not start. |
| 237 | this reads something this task did not start | This reads the output of a program this task did not start. |
| 252 | no file path given | This read does not say which file it wants. |
| 260 | reading outside the project | This reads a file outside your project folder. |
| 284 | unknown Google tool "X" | This uses a Google tool that has not been checked yet (X). It might send or change something. |
| 288 | no command given | This command is empty, so there is nothing to check. |
| 291 | unknown tool "X" | This uses a tool that has not been checked yet (X). It might send or change something. |
| 417 | command nests too deeply to check | This command is too tangled to check first. |
| 437 | this command reads from a place it works out while it runs | This command decides while it runs which files to read, so it can't be checked first. |
| 439, 558, 595, 680 | X is outside the project | X is outside your project folder. |
| 445 | this command writes to a place it works out while it runs | This command decides while it runs where to save, so it can't be checked first. |
| 456 | this command builds part of itself while it runs, so I cannot check it | This command puts itself together while it runs, so it can't be checked first. |
| 469 | the command is worked out while it runs, so I cannot check it | This command's name is decided while it runs, so it can't be checked first. |
| 478 | cpio reads whatever files it is handed, which I cannot check | This copies whatever files it is given, and that list can't be checked first. |
| 479, 480 | a script I cannot read | This runs a script. What a script does can't be checked first. |
| 484 | xargs runs another command on many things at once | This runs another command on many files at once. |
| 497, 499, 539 | bun / node / X would run code I cannot check | This runs code typed into the command itself, which can't be checked first. |
| 503 | X Y changes your Mac | This changes software installed on your Mac, not just your project. |
| 504 | pip install may change your Mac | This installs Python packages for your whole Mac, not just this project. |
| 508 | X changes containers or sends images away | This changes Docker containers, or sends images to another computer. |
| 576, 577 | X reads the files listed in another file, which I cannot check / zip reads whatever files it is handed, which I cannot check | This reads a list of files from somewhere else, and that list can't be checked first. |
| 620 | find can delete things or run commands on everything it finds | This can delete files, or run a command on every file it finds. |
| 630 | this points git at a folder outside the project, so it would read another project's history and files | This points Git at a folder outside your project. |
| 645, 660 | this changes how git behaves for one command, which can run a program | This changes how Git behaves for one command, and that can run another program. |
| 687 | git push sends your work to a remote | This sends your work to another computer (git push). |
| 691 | deletes saved history | This deletes Git's saved history. |
| 692 | changes remotes | This changes where Git sends your work. |
| 695 | changes branches | This changes your Git branches. |
| 697 | changes tags | This changes your Git tags. |
| 698 | changes the stash | This changes work Git has set aside. |
| 699 | changes git settings | This changes your Git settings. |
| 700 | git X changes your repository | This changes your project's Git history (git X). |
| 728 | a global install changes your Mac | This installs a tool for your whole Mac, not just this project. |
| 731 | changes package manager settings | This changes package manager settings for your whole Mac. |
| rules.ts 181-182 | House rule: "X" | Your house rule says: "X" |

Unchanged, because they are already plain: 96, 283, 380, 473, 729, 730, 743, 750-759, 768, 770 and `agent.ts:2187`.

---

## 5. Failure and loop cards

### 5.1 The "Not done" reason line

`model.ts:1020-1025` `notDoneReason` returns `${f.label}: ${checkParts(f).summary}`, with no raw output. `checkParts` comes from `checkDetail.tsx`; if importing it into `model.ts` would create a cycle, move `checkParts` to a new `checkParts.ts`. The fallback stays "A check failed.", moved to `S.verdict.failedLine`.

`card.tsx:1941` renders `S.notDoneHelp` plus the reason. The raw output is already behind Details on the failed step's own row (`card.tsx:1936`, `<CheckDetail parts={checkParts(s)} />`), so it is no longer printed twice, and never printed bare.

### 5.2 The loop breaker

**Model.** `StuckCard.failure` (`model.ts:41`) becomes `{ label: string; parts: CheckParts }`. In `model.ts:808`:

```ts
failure: { label: String(e.failure?.label ?? ""), parts: checkParts({ status: "failed", detail: String(e.failure?.detail ?? ""), summary: typeof e.failure?.summary === "string" ? e.failure.summary : undefined, problem: e.failure?.problem }) }
```

The fallback options move to strings: `S.stuckDifferent` "Try a different way" and `S.stuckStop` "Stop here".

**Card.** `card.tsx:1774`:

```tsx
<div className="line"><b>{m.stuck.failure.label}</b><CheckDetail parts={m.stuck.failure.parts} /></div>
```

The result is one plain sentence (`parts.summary`, with "It did not pass." as the fallback), then the place, then the raw output behind "Details".

**Not in M45.** "Stop and undo my changes" on the loop card belongs to M48 (M2). The verdict's `offer: "undo"` on failed results is the hook it will use.

---

## 6. Strings (`app/src/strings.ts`)

All new words go here. None contain an em dash.

```ts
noCost: "No cost",
verdict: {
  proven: "Fixed and proven",
  partial: "Fixed, not fully proven",
  someCouldNotRun: "Some checks could not run.",
  couldNotRun: (names: string) => `${names} could not run.`,
  and: "and",
  check: { install: "the install", checks: "the build", tests: "the tests", start: "the start check", browser: "the browser check", review: "the second look" } as Record<string, string>,
  unchecked: "Changed, not proven",
  uncheckedLine: "There was no check to run on it.",
  noChange: "Nothing was changed",
  failed: "Not fixed yet",
  failedLine: "A check failed.",
  failedThenStopped: "A check failed, and then you stopped it.",
  failedThenLimit: (where: string) => `A check failed, and then it stopped at ${where}.`,
  stopped: "Stopped",
  stoppedChanged: "It changed files before you stopped it. Nothing was checked.",
  stoppedNothing: "Nothing was changed.",
  limit: { spending: "Stopped at this task's spending limit", daily: "Stopped at today's limit", turns: "Stopped at the most turns allowed" },
  limitWhere: { spending: "this task's spending limit", daily: "today's limit", turns: "the most turns allowed" },
  limitChanged: "It changed files before it stopped. Nothing was checked.",
  needsYou: "Waiting for your answer",
  needsYouFailed: "A check failed, and it needs something only you can give.",
  noConnection: "Stopped: could not reach Claude",
  claudeBusy: "Stopped: Claude was busy",
  error: "Something went wrong",
  errorLine: "It stopped before it finished. Nothing was checked.",
  undone: "Undone",
  undoneFix: "The fix is gone, so the problem is back.",
  undoneOther: "Your project is back as it was before this task.",
  back: "The fix is back",
  backLine: "It passed its checks before the Undo. Nothing was checked since.",
  backLineUnchecked: "Nothing was checked since.",
  turn: "Proven before your turn",
  turnLine: "One place has its old code again.",
  say: (headline: string, line: string | null) => (line ? `${headline}. ${line}` : `${headline}.`),
},
checksTitle: "What was checked",
checksBeforeUndo: "Checked before the Undo",
passedAfter: (n: number) => `Passed after ${n} tries`,
passedAfterGaps: (n: number) => `Passed after ${n} tries, with some checks skipped`,
stillFailing: (n: number) => `Still failing after ${n} tries`,
historyRunning: "Running",
islandResult: (headline: string, what: string) => `${headline}: ${what.charAt(0).toUpperCase()}${what.slice(1)}`,
saidResult: (what: string, say: string) => (what ? `${what}: ${say}` : say),
bringBack: "Bring the fix back",
bringBackSure: "This puts back what the task changed, as it was just before you pressed Undo.",
bringBackYes: "Yes, bring it back",
bringBackNo: "Leave it undone",
bringBackWorking: "Bringing the fix back…",
slNoCost: "This check cost nothing.",
```

`historyNoConnection`, `historyClaudeBusy`, `historyTurns` and `historyNeedsYou` may point at the `S.verdict` values, so each phrase exists once.

**Zero cost.** Add to `model.ts`:

```ts
export const costWords = (usd: number) => (usd > 0 ? formatUsd(usd) : S.noCost);
```

`formatUsd(<= 0)` changes from "free so far" to "0 cents", as a backstop that reads correctly in any template.

| Site | Change |
|---|---|
| `card.tsx:1977` | `usd > 0 ? S.fixCost(formatUsd(usd)) : S.noCost` |
| hero `doneLine` | `costWords` |
| `card.tsx:261` history row | `costWords` |
| `copytext.ts:34` | see section 2.2, row 16 |
| `practicePanel.tsx:32` | `${S.cost}: ${formatUsd}`, or `S.noCost` at zero |
| `model.ts:1179` | `usd > 0 ? S.slCost(formatUsd(usd)) : S.slNoCost` |

The working line already uses `workingFree`, and the notch already hides zero (`islandPanel.ts:24`).

**First run Undo line.** In `strings.ts:364`, `:371` and `:109`:

- `beats.undo`: "Not happy? Undo puts it back exactly." becomes "Not happy? Undo puts back the files it changed."
- `more.undo`: becomes "Before it changes a file, it saves an undo point. Undo puts those files back and leaves files you changed yourself as they are. Anything sent online can't be taken back. A fix like this costs a few cents of your own Claude."
- `undoReplaces`: keep "so you can undo the Undo" only if Bring back ships (section 3.3). Otherwise end the sentence at "…the safety copy Undo makes first."

---

## 7. Tests to write first

Write them all before any code, and run them to see them fail.

### 7.1 `app/src/verdict.test.ts` (new)

1. **"every combination has exactly one honest verdict"**
   - Write the full matrix out by hand as an explicit expectations table. Do not compute it.
   - Dimensions:
     - proof: passed, partial, failed, none
     - ended: done, stopped, limit with spending, limit with daily, limit with turns, needsYou, failed with check, failed with noConnection, failed with claudeBusy, failed with error, unknown (11 endings)
     - undone: false, true
     - changed: 0, 2

     That is 176 rows, each with the expected `kind`. Add rows for `back` (with proof passed and with proof none) and for `turnOpen` (with proof passed and done).
   - For every row, assert `kind`, `tone`, `icon` and `offer`.
2. **"only proven is good"**. Over the matrix: `tone === "good"` if and only if `icon === "tick"`, if and only if `proven`, if and only if `kind === "proven"`, if and only if `proof === "passed" && (ended done or unknown) && !undone && !turnOpen`.
3. **"after Undo nothing is proven"**. Over the matrix: when `undone` is true and there is a fix, `kind` is undone or back, `tone !== "good"`, and `offer !== "undo"` unless `back`.
4. **"a stopped or limited task is never done"**. Over the matrix: ended stopped or limit gives a tone other than good.
5. **"an unknown ending is never done unless proven"**.
6. **"partial names its missing check"**:
   - `missing:["the browser check"]` gives a `line` of "The browser check could not run."
   - Two names give "The tests and the browser check could not run."
   - None gives "Some checks could not run."
7. **"Undo offered only with changes, Bring back only with a safety copy"**.
8. **"words are plain"**: every `headline`, `line` and `say` in the matrix is non-empty, has no em dash, never contains "free so far", "Checked and working" or "Done, checked", and contains "proven" only in "Fixed and proven", "not fully proven", "not proven" or "Proven before your turn".

### 7.2 App surfaces

| File | Test name | Asserts |
|---|---|---|
| `model.test.ts` | receipt keeps how it ended | `ended:"failed", endedWhy:"spending_limit"` gives `end:"limit", limit:"spending"`. `ended:"stopped"` gives `end:"stopped"`. No `ended` leaves `end` undefined. |
| | undo marks the receipt and rests the character | `checkpoint.restored` sets `undone`, `undoSafety === e.safety`, and the task agent goes from done to idle. |
| | bisect undo marks the receipt | `bisect.undone` with ok sets `undone` and rests the agent. |
| | bring back sets back, not a second undo | A restore of `undoSafety` sets `back:true`, keeps `undone`, sets `undo:null`, and `canFollowUp` stays false. |
| | a new receipt clears undone | |
| | notDoneReason has no raw output | A step whose detail is "Tests failed.\n  at x.ts:3 …" gives "Running the tests: Tests failed." |
| | loop card keeps raw output behind Details | `loop.stuck` gives `failure.parts.raw` holding the output and `failure.parts.summary` plain. |
| | historyWords for every status | `daily_limit` gives "Stopped at today's limit". An undone done row gives "Undone". `running` gives "Running". |
| | characterWords after a limit stop | "Stopped at this task's spending limit", not "Something went wrong". |
| `homeHero.test.ts` | after Undo the hero never says proven | Tone is not done, the headline is "Undone", the detail is undoneFix, and `undoCan` is false. |
| | a stopped task's hero is plain | |
| | a partial hero names the browser check | |
| | zero cost says No cost | The line ends "· No cost". |
| | Undo hides after a bisect undo | `m.undo` null and `receipt.undone` give `undoCan` false and `bringBackCan` true when there is a safety copy. |
| `islandPanel.test.ts` | after Undo the notch card is not green | Tone plain, state idle, sub "Undone. The fix is gone, so the problem is back." |
| | the peek key changes on Undo | |
| | a stopped task's card is plain | |
| `proofChips.test.ts` | no chips after Undo | |
| | no chips after Bring back | |
| `a11y.test.ts` | Undo is announced once as Undone | The key differs from the first announcement. |
| | a stopped task is not announced as Done | |
| `copytext.test.ts` | the copied receipt after Undo says Undone | |
| | zero cost says No cost | No "free so far" anywhere. |
| `speech.test.ts` (or an existing one) | the reply after a limit stop names the limit | |
| `history.test.ts` | undone rows group as undone | |
| | no Undo for an undone row | |
| | recentMark | Proven gives a tick. Undone gives the undo icon and "Undone". Stopped gives the stop icon. Partial gives wait and "Fixed, not fully proven". |
| `home.test.ts` | no tick or cheer for an unproven done | Proof skipped and done give null wings. |
| | the island line after Undo is not Done | |
| | a failed result shows red | |
| `approvals.test.ts` | never says it can and can't at once | For every risk, including an unknown one, crossed with undoable true, false and missing: when the question is the irreversible one, the undo line is undoNo. Git never gives undoYes. |
| | missing undoable says Undo can't | |
| | house_rule has its own question | |
| | reads show no Undo line | |
| | paths are shown from the project | |
| | fix fixture `:24` | "a script I cannot read" with `undoable:true` now gives undoNo. |
| `firstLook.test.ts` | the Undo promise matches Undo | `beats.undo` and `more.undo` do not contain "exactly", and `more.undo` mentions files you changed yourself and things sent online. |
| `writing.test.ts` (existing) | covers the new strings automatically | Confirm the new `S.verdict` keys are walked. |

### 7.3 Runner and protocol

| File | Test name | Asserts |
|---|---|---|
| `runner/test/safety.test.ts` | every irreversible ask is not undoable | A corpus with one command per line in the table in section 4.2 (`sh x.sh`, `./deploy.sh`, `xargs rm`, `bun -e`, `node < x`, `python -c`, `find . -exec`, `$(x) y`, `echo > $F`, `npm config set x`, unknown tool, unknown Google tool, empty Bash, TaskStop on another shell) gives `decision:"ask"` and `undoable:false`. |
| | every git write is not undoable | commit, add, reset, checkout, switch, restore, merge, rebase, cherry-pick, revert, pull, clean -fdx, rm, mv, stash, `tag -a`, `branch -d`, `remote add`, `config user.name x` and `git -C ../other commit` all give `undoable:false`. |
| | decisions did not change | The same corpus keeps its old `decision`, as a snapshot of decisions taken before the change. |
| | git reads still allowed | status, diff, log, fetch. |
| | a commit the person asked for lands in Cannot be undone | `userAskedCommit` with commit gives allow and `undoable:false`. |
| | reasons are plain | No verdict reason contains "I cannot" or "cannot check", none contains an em dash, and every reason is a full sentence that starts with a capital. |
| `runner/test/rules.test.ts` | a house rule keeps the base undo fact | A rule ask on `git commit` gives `risk:"house_rule"` and `undoable:false`. |
| | a house rule on an Edit stays undoable | |
| `approval-scope.test.ts` | a house rule on an Edit is still covered for the task | |
| `agent.test.ts` | the receipt says why it failed | Over budget gives `endedWhy:"spending_limit"`. A failed check gives `"check_failed"`. Max turns gives `"turns"`. Done gives no `endedWhy`. |
| `tasklog.test.ts` (new or existing) | undo marks rows undone | Restoring T.before marks T and later rows. |
| | bring back clears them | |
| | old log files get the column | |
| | list carries undone | |
| `undo-safety.test.ts` | [verify] the safety copy can be restored | Restoring `safety` from the first restore puts the task's files back. |
| `wherewasi` / `recap` tests | an undone task is not "finished and checked" | Partial says some checks could not run. |
| `protocol.test.ts` | `endedWhy` enum | |
| | `house_rule` risk | |
| | `TaskSummary.undone` is optional | |
| | the new fixture lines validate | |

---

## 8. Risks, and what not to change

**Proof.** Rule 14 stands: exit codes first, browser checks second, and a screenshot judgment only as extra evidence. The verdict only reads `proof` and the ending. Do not touch `proof/ladder.ts`, the rungs, or how `agent.ts:1054-1147` sets `proof` and `status`.

**Undo and git.** Rule 10: Undo and Bring back use `checkpoint.restore` on shadow snapshots only. Nothing in M45 runs or writes git. The git verdicts only change their `undoable` flag and their words.

**Strings.** Rule 21: every new word lives in `strings.ts`. Move the hard-coded verdict words in `model.ts` (`historyWords`, `triesNote`, the loop card fallbacks) there in the same change. Use no em dashes; `writing.test.ts` enforces this. Compound words stay open (on device, hold to talk).

**Safety only gets stricter.** No allow, ask or deny decision changes. Flipping `undoable` to false has two visible effects:
- Those calls now appear on the receipt under "Cannot be undone" (`agent.ts:2241`).
- "Allow for the rest of this task" no longer covers them (`taskScopeCovers`). Today it covers only file reads and house rule file asks, so in practice nothing changes there.

Add a CHANGELOG line for the receipt change.

**Reason words reach Claude.** The new reasons go into deny messages. Keep each reason's meaning, and update the tests that match reason text.

**F20 groups.** `ended` keeps its four values, and `groups.ts:94-96` is not touched. `endedWhy` is additive.

**Not changed:**
- `reactions.ts:16`: the party fires once, on the raw receipt with proof passed.
- `canRetry` (`model.ts:956-960`): stopped tasks still get no Try again, which may be intended.
- The practice path (`model.ts:87`, `practicePanel`): already honest.
- `cardlogic.ts`, `failwords.ts`, `undoWords.ts`, `madePanel.tsx`.

**Belongs to later milestones:**
- **Notch behaviour.** The notch will now peek on Undo, because `workPeekKey` changes. That is honest. When the notch drops on its own is M46's call.
- **Layout.** The result card, Undo inside it, "Stop and undo my changes", and Home's layout are M48. M45 changes words, tones and which buttons may show.
- **Allowed actions that Undo can't take back.** These stay allowed and keep `undoable:true`: `rm -rf node_modules dist` (excluded from snapshots, and `safety.test.ts:106` wrongly says "undo covers it"), `npm install`, `git fetch`, a plain `curl` GET, Bash writes to ignored files, pip into a virtual environment outside the project, and `cargo install` with no tap at all (`safety.ts:503`). Flag these as a separate follow up.
  - Changing `cargo install` adds a new prompt. It is a rule 13 safety gap, so tell the founder; do not fold it into M45.

**Wording is the founder's.** "Fixed and proven", "Not fixed yet" and "Undone" are copy and can be changed in one place. Not every task is a fix, so the undone line depends on whether a fix existed (`undoneFix` against `undoneOther`).

**[verify] Bring back.** Ship the button only after the runner test in section 7.3 passes on a real restore. Otherwise remove the "undo the Undo" promise in `strings.ts:109`.

**Done means seen.** The milestone ends with the full suite green, the app rebuilt and opened, and one real task run through check, Undo and Bring back on a Mac. Add it to the next hands on Mac session list.