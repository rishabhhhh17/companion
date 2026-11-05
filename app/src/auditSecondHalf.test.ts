// The ranked UI audit (2 Nov 2026), second half (items 28 to 54): what is logic is pinned with the decisions themselves
// (model.ts, homeHero.ts, checkParts.ts, strings.ts); what is only a look is pinned by reading the stylesheets and the page
// as text, as in auditFirstHalf.test.ts. Each describe names its audit item.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, notDoneLine, reduce, type Model } from "./model.ts";
import { heroWords, retryOwnsMain } from "./homeHero.ts";
import { checkParts } from "./checkParts.ts";
import { S } from "./strings.ts";
import { ALL_CSS } from "./ui/cssFiles.ts";
import { historyStamp, sideStamp } from "./itemLook.ts";
import { verdictMark } from "./ui/partsLogic.ts";
import { verdictOf } from "./verdict.ts";
import { historyFacts, type HistoryItem } from "./model.ts";
import { claudeMain, goesOnAfterTest, LEVEL } from "./onboarding.ts";
import { fromTest } from "./failingLine.tsx";
import { memoryDate } from "./memorySettings.ts";
import { wingMarkShown } from "./home.ts";
import { placeSaid } from "./review.ts";
import { practiceKind } from "./practice.ts";

const P = "/Users/me/shop";
const A = "builder-1";
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const css = ALL_CSS().replace(/\/\*[\s\S]*?\*\//g, "");
const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const card = read("./card.tsx");
const begin = [ev({ type: "checkpoint.created", project: P, agent: A, checkpoint: "cp_1", label: "Before: fix the price", files: 3, skipped: [] }), ev({ type: "agent.state", agent: A, state: "working" })];
const failedProof = (steps: Record<string, unknown>[]) => ev({ type: "proof.result", agent: A, verdict: "failed", steps, tries: 1 });
const receipt = (proof: string) => ev({ type: "receipt", agent: A, checkpoint: "cp_1", changed: [{ file: "a.js", kind: "modified" }], commands: 0, notUndoable: [], proof, usdEstimate: 0.02 });
const failedRun = (steps: Record<string, unknown>[]) => run([...begin, failedProof(steps), receipt("failed"), ev({ type: "agent.state", agent: A, state: "error" })]);
const buildFailed = [{ rung: "checks", label: "Building", status: "failed", detail: "The page answered with an error (500). at /src/app.js:3" }];

describe("(34) a failed result: one way forward, the failure said once, no raw codes", () => {
  test("while Try again is offered, it is the one main step, so Home's main button steps aside", () => {
    const m = failedRun(buildFailed);
    expect(retryOwnsMain(m, P)).toBe(true);
    expect(retryOwnsMain(run([...begin, receipt("passed"), ev({ type: "agent.state", agent: A, state: "done" })]), P)).toBe(false);
    expect(retryOwnsMain(initial(), P)).toBe(false);
    expect(card).toMatch(/retryOwnsMain\(m, project\) \? null/);
  });
  test("the failure is not said again under the check row that already says it", () => {
    expect(notDoneLine(failedRun(buildFailed))).toBeNull();
    // With no failed row to read (only skipped ones), the line is the only place that says why.
    expect(notDoneLine(failedRun([{ rung: "checks", label: "Building", status: "skipped", detail: "No build step." }]))).toBeTruthy();
    expect(card).toContain("{notDoneLine(m) && !isFixing(m)");
  });
  test("an HTTP code is said in words", () => {
    const p = checkParts(buildFailed[0]);
    expect(p.summary).not.toMatch(/\(\d{3}\)/);
    expect(p.summary).toBe("The page answered with an error: the server ran into a problem.");
    expect(checkParts({ status: "failed", detail: "The page answered with an error (404). more" }).summary).toContain("the page was not found");
  });
  test("Try again is the one primary; the follow up box is the other way", () => {
    expect(card).toContain('<button className="btn primary" type="button" disabled={sending} onClick={() => { if (sending) return; onSent(false); void sendQuiet(retryTask(project)).catch(onRefused); }}>{S.tryAgain}</button>');
  });
  test("the failed proof is drawn as failed (red), on the column, never as needing you", () => {
    expect(card).not.toMatch(/notDoneReason\(m\) && !receiptUndone\(m\.receipt\) \? "amber"/);
    expect(css).toMatch(/\.proof-panel\[data-failed\] \.tone-slot \{[^}]*color: var\(--bad\)/);
    expect(css).toMatch(/\.tone-slot \{[^}]*width: 16px/);
  });
  test("a check's detail is on its own line, and Details opens with the chevron in the page's face", () => {
    expect(css).toMatch(/\.proof \.check-detail \{[^}]*display: block/);
    expect(css).toMatch(/details\.raw > summary \{[^}]*list-style: none[^}]*font-family: var\(--font\)/);
    expect(read("./checkDetail.tsx")).toContain('<Icon name="chevron" size={12} />');
  });
  test("Find which task broke it is in More ways, not under the checks", () => {
    const more = card.slice(card.indexOf('<details className="more">'), card.indexOf("</details>", card.indexOf('<details className="more">')));
    expect(more).toContain("S.bisectButton");
    const proof = card.slice(card.indexOf("const proofPanel"), card.indexOf("const urgentCards"));
    expect(proof).not.toContain("S.bisectButton");
  });
});

describe("(32) the working card's steps are told apart by more than colour", () => {
  test("a done step has a tick and says done to VoiceOver, in full ink", () => {
    // M69: each run row has its mark (a tick when done, a cross when failed) and its status in words, never colour alone.
    const view = read("./runListView.tsx");
    expect(view).toContain('<span className="run-mark" aria-hidden="true"><RowMark state={r.state} /></span>');
    expect(view).toContain("<span className=\"run-status\">{r.status}");
    expect(css).toMatch(/\.run-row\[data-state="done"\] \.run-mark, \.tick-row\[data-state="ok"\] \.run-mark \{ color: var\(--ok\); \}/);
  });
  test("the card and its steps have different names, and no empty box holds the Stop button's place", () => {
    expect(card).toContain('<section className="panel job" aria-label={m.task.label || S.home.jobLabel}>');
    expect(S.home.jobLabel).not.toBe(S.home.stepsLabel);
    expect(card).not.toContain("{S.home.safetySaved}</p> : <span />}");
  });
});

describe("(33) boxes inside a glass card are a faint wash, never a flat grey hole", () => {
  test("reasons, changed files, notes, the segmented track and History's search", () => {
    expect(css).toContain('.home .review-reasons li, .home .changes, .home .note, .home .ui-seg, .home .hist input[type="search"] { background: color-mix(in srgb, var(--fg) 4%, transparent); }');
  });
});

describe("(35) the changed files keep their columns with a long name", () => {
  test("three columns: the mark, the name with its folder, how it changed", () => {
    expect(css).toMatch(/\.changes li \{ display: grid; grid-template-columns: 1em minmax\(0, 1fr\) auto;/);
    expect(read("./changesCard.tsx")).toContain('<span className="changes-file"><b>{name}</b>');
    expect(css).not.toMatch(/\.changes li b \{ font-weight: 600;/);
  });
});

describe("(36) after Undo the receipt says what Undo did", () => {
  test("the changes card says Put back, and what Undo could not take back is said as still there", () => {
    expect(S.putBackFiles(2)).toBe("Put back: 2 files");
    expect(card).toContain("<ChangesCard changed={m.receipt.changed} undone={undone} />");
    expect(read("./changesCard.tsx")).toContain("undone ? S.putBackFiles(changed.length) : S.changedFiles(changed.length)");
    expect(card).toContain("{undone ? S.stillThere : S.cannotUndo}");
    expect(card).toContain("{receiptSaid(m) && !undone && ");
  });
  test("the put back note is in the verdict's own line, and the card settles without a stretch", () => {
    expect(card).toMatch(/<VerdictLine verdict=\{v\} size="card" sub=\{said \|\| putBackShown \?/);
    expect(css).toContain("@keyframes card-settle { from { opacity: .6; transform: translateY(-4px); } }");
  });
});

describe("(43) recent work shows once in the wide Home", () => {
  test("the Recent fixes card outside rest is never drawn beside the side list", () => {
    expect(card).toContain('mode !== "rest" && mode !== "working" && !side && <RecentList');
  });
});

describe("(44) a mouse click on a menu draws no keyboard ring", () => {
  test("the active option's ring follows :focus-visible", () => {
    expect(css).toContain(".ui-menu-list:focus-visible .ui-menu-item[data-active]");
    expect(css).not.toContain(".ui-menu-list:focus .ui-menu-item[data-active]");
  });
});

describe("(45) small pixel tells", () => {
  test("one hairline at the side list's edge, steady numbers, the Learn tile, History names, the follow up hint, the count pill", () => {
    expect(css).not.toMatch(/\.home\[data-side\] \.side \{[^}]*box-shadow: inset calc\(var\(--hair\) \* -1\)/);
    expect(css).not.toMatch(/\.settings-side \{[^}]*box-shadow: inset calc\(var\(--hair\) \* -1\)/);
    expect(css).toMatch(/\.subline \{[^}]*font-variant-numeric: tabular-nums/);
    expect(css).toContain(".pr-head .tile { margin-top: -1px; }");
    expect(css).toMatch(/\.hist-name \{[^}]*text-wrap: pretty/);
    expect(S.followUpPlaceholder.length).toBeLessThanOrEqual(24);
    expect(css).toMatch(/\.home \.fr-count \{ padding: 3px var\(--space-3\);/);
  });
});

describe("(46) the review's What it touches labels read as labels", () => {
  test("no outline, a badge's corners, a faint fill", () => {
    expect(css).toMatch(/\.review-tag \{[^}]*border: 0; border-radius: var\(--r-stamp\); background: color-mix\(in srgb, var\(--fg\) 8%, transparent\);[^}]*font-weight: var\(--w-strong\)/);
  });
});

describe("(47) History's toolbar is one height and one look", () => {
  test("the filter is a full size keycap menu, the search the same height", () => {
    expect(card).toContain('<Menu label={S.historyStatusLabel} size="md"');
    expect(css).toContain(".home .bar .ui-menu-btn, .home .hist .ui-menu-btn {");
    expect(css).toMatch(/\.home \.hist input\[type="search"\] \{ box-sizing: border-box; height: var\(--h-md\);/);
  });
});

describe("(48) Settings has one headline", () => {
  test("the bar's title is a card size title in Settings", () => {
    expect(css).toMatch(/\.home\[data-view="settings"\] \.view-title \{ font: var\(--w-strong\) var\(--t-answer\)/);
  });
});

describe("(29) needing you is an amber rim and glow, not olive water", () => {
  const shader = read("./flowflow/shaders.ts");
  test("the core takes only a little amber, and the rim glows amber", () => {
    expect(shader).toContain("uAmber * 0.18);");
    expect(shader).not.toContain("uAmber * 0.6);");
    expect(shader).toContain("col += vec3(1.0, 0.69, 0.125) * uAmber * fres * 0.9;");
  });
});

describe("(30) no dark pencil outline on a light page", () => {
  const shader = read("./flowflow/shaders.ts");
  test("the rim reflects the page's own sky (--pond), read again when the theme changes", () => {
    expect(shader).toContain("uniform vec3 uEnvBase;");
    expect(shader).toMatch(/env\(r\) \+ uEnvBase \* 0\.9/);
    expect(read("./flowflow/renderer.ts")).toContain("setEnvBase(css: string)");
    const view = read("./flowflow/view.tsx");
    expect(view).toContain('getPropertyValue("--pond")');
    expect(view).toMatch(/attributeFilter: \[[^\]]*"data-theme"/);
  });
});

describe("(31) one status, one drawing, never colour alone", () => {
  const h = (o: Partial<HistoryItem>): HistoryItem => ({ id: 1, label: "Fix it", status: "done", usd: 0.1, startedAt: "2026-11-01T09:00:00Z", endedAt: "2026-11-01T09:05:00Z", checkpoint: "cp_1", changed: 1, proof: null, ...o });
  const NOW = Date.parse("2026-11-01T12:00:00Z");
  test("nothing changed is an empty ring (a dash read as remove); changed but not proven keeps the dot; partly proven is the half circle", () => {
    expect(verdictMark(verdictOf(historyFacts(h({ changed: 0 })))).mark).toBe("ring");
    expect(verdictMark(verdictOf(historyFacts(h({})))).mark).toBe("wait");
    expect(verdictMark(verdictOf(historyFacts(h({ proof: "partial" })))).mark).toBe("half");
  });
  test("a running task is the working mark on Now's recent list, as in the side list and History", () => {
    expect(read("./ui/parts.tsx")).toContain('const mark = running ? "spin" : verdictMark(verdict).mark;');
    expect(read("./recentList.tsx")).toContain('running={i.status === "running"}');
  });
  test("History stamps Not fixed yet as it stamps Proven; the side list keeps its cross for it", () => {
    expect(historyStamp(h({ status: "not_done", proof: "failed" }), NOW)).toBe("notFixed");
    expect(S.look.stamp.notFixed).toBe("Not fixed yet");
    expect(sideStamp("notFixed")).toBeNull();
    expect(css).toMatch(/\.stamp\[data-stamp="notFixed"\] \{ color: var\(--bad\); \}/);
  });
  test("each dot in the side list carries its own small drawing", () => {
    const marks = read("./itemMarks.tsx");
    expect(marks).toContain('export const DOT_GLYPH = { working: "spin", new: "sparkle", proven: "tick", needsYou: "alert", notFixed: "cross" } as const;');
    expect(marks).toContain("{dot ? <Icon name={DOT_GLYPH[kind]} size={10} /> : S.look.stamp[kind]}");
    const icons = read("./icons.tsx");
    for (const n of ["spin", "sparkle", "alert"]) expect(icons).toMatch(new RegExp(`^  ${n}: `, "m"));
    expect(css).toMatch(/\.home\[data-side\] \.side-work \.stamp\[data-dot\]::before \{ display: none; \}/);
  });
});

describe("(39) the page does not lurch when a task starts and ends", () => {
  test("M66 fix 10: the layout takes Flowflow's new size in one frame, and the drawing eases by scale only", () => {
    // Transitioning the registered --char laid the whole hero out again on every frame; it is gone.
    expect(ALL_CSS()).not.toContain("@property --char");
    expect(css).not.toMatch(/transition:[^;]*--char/);
    expect(css).toContain(".home-pond .home-char { width: var(--char); margin: -8px -10px -4px; transform-origin: 50% 100%; }");
    expect(read("./homeCharacter.tsx")).toContain("useSizeEase(box, !orb);");
  });
});

describe("(49) a room change runs at one speed", () => {
  test("M66 fix 11: every colour of the room changes at once, together; only the old light fades out on top, by opacity", () => {
    expect(css).not.toMatch(/\.home\[data-element\] \{ transition:/);
    expect(css).not.toMatch(/transition:[^;]*--el-/);
    expect(css).toContain(".room.room-was { z-index: 0; animation: room-was-out var(--dur-3) var(--ease-out) both; }");
    expect(css).not.toMatch(/520ms/);
    expect(css).toMatch(/\.home\[data-side\] \.side \.sb-item\[aria-current="page"\] \{[^}]*transition: background-color var\(--dur-3\) var\(--ease-out\)/);
  });
});

describe("(42) icons have one stroke weight and grow with the text", () => {
  test("a 1.5 point stroke that never scales with the drawing's size", () => {
    const icons = read("./icons.tsx");
    expect(icons).toContain("strokeWidth: 1.5,");
    expect(css).toMatch(/\.ic \* \{ vector-effect: non-scaling-stroke; \}/);
  });
  test("the sizes are in rem, and a button's drawing and a list's mark each have one size", () => {
    expect(ALL_CSS()).toContain("--icon-sm: calc(12rem / 14); --icon-md: calc(16rem / 14); --icon-lg: calc(20rem / 14);");
    expect(ALL_CSS()).toMatch(/--h-sm: calc\(28rem \/ 14\);/);
    expect(css).toMatch(/\.btn \.ic \{ flex: none; width: var\(--icon-md\); height: var\(--icon-md\); \}/);
    expect(css).toMatch(/\.side-mark \.ic, \.ui-chip-mark \.ic, \.ui-menu-tick \.ic, \.job-label \.ic \{ width: var\(--icon-sm\); height: var\(--icon-sm\); \}/);
  });
});

describe("(37) the review card is found and heard", () => {
  const review = read("./reviewCard.tsx");
  test("its heading carries the rating, and the rating's arrival is said once", () => {
    expect(review).toContain('{S.review.title}{look && <span className="sr">: {look.words}</span>}</h2>');
    expect(review).toContain('<div className="sr" role="status">{look ? S.review.arrived(look.words, look.line) : ""}</div>');
    expect(S.review.arrived("Fix this first", "One change needs a look.")).toBe("Changes to review: Fix this first. One change needs a look.");
  });
});

describe("(51) empty History and the landmarks", () => {
  test("M69 (spec 3.6): History with nothing yet has the character at rest, one sentence and Start practice", () => {
    expect(card).toContain('<div className="page-empty-char" aria-hidden="true"><HomeCharacter as="idle" rest /></div>');
    expect(card).toContain("{S.screens.historyEmpty}");
    expect(card).toContain("{onPractice && <Button kind=\"primary\" onClick={onPractice}>{S.screens.startPractice}</Button>}");
    expect(S.screens.historyEmpty).toBe("Nothing here yet. Your first fix will show up here with its proof.");
  });
  test("one Places landmark in the wide Home, a region only for a place, the heading without its line, keys and Send named", () => {
    expect(card).toContain('return side ? <div className="places">{children}</div> : <nav className="places" aria-label={S.look.placesLabel}>{children}</nav>;');
    expect(card).not.toMatch(/role="region" id=\{tabPanelId\(home\.tab\)\} aria-labelledby="home-title"/);
    expect(card).not.toContain('size="headline" sub={status.sub');
    // M69: the hold to talk keys are named by the microphone's tooltip and its press (nodeadbuttons.test.ts).
    expect(card).toContain('label={S.look.micLabel} title={talkKeysLine(keys)}');
    expect(S.look.send).toBe("Send");
  });
});

describe("(38) the first run's Your Claude step fits and has one way on", () => {
  const ob = read("./onboarding.tsx");
  test("Continue saves and tests a typed key, and carries on once it works", () => {
    expect(claudeMain(false, "", null)).toEqual({ act: "none", disabled: true });
    expect(claudeMain(false, "sk-ant-abc", null)).toEqual({ act: "saveThenGo", disabled: false });
    expect(claudeMain(false, "sk-ant-abc", "checking")).toEqual({ act: "none", disabled: true });
    expect(claudeMain(true, "", "works")).toEqual({ act: "continue", disabled: false });
    expect(claudeMain(true, "", "refused")).toEqual({ act: "none", disabled: true });
    expect(claudeMain(true, "sk-ant-new", "refused")).toEqual({ act: "saveThenGo", disabled: false });
    expect(goesOnAfterTest(true, true, "works")).toBe(true);
    expect(goesOnAfterTest(true, true, "checking")).toBe(false);
    expect(goesOnAfterTest(false, true, "works")).toBe(false);
    expect(ob).not.toContain("S.fr.keyTest");
  });
  test("M69 (F29): the first run has no key step, so no key fold and no key page button", () => {
    expect(ob).not.toContain('fold("how", S.fr.keyHow,');
    expect(ob).not.toContain("KEY_PAGE");
    expect((LEVEL as Record<string, number>).claude).toBeUndefined();
  });
  test("Flowflow stays on Your Claude in the 480 tall window too, riding above Continue (the review, 2 Nov 2026: it was gone)", () => {
    expect(css).not.toContain('@media (max-height: 560px) { .fr[data-step="claude"] .fr-float { display: none; } }');
    // The water's line always clears the main button's row, so Continue is never half in the water and Flowflow is above it.
    expect(css).toMatch(/\.fr > \.fr-tank \{[^}]*height: max\(var\(--level, 20%\), calc\(var\(--h-lg\) \+ var\(--space-6\) \+ var\(--space-4\)\)\);/);
  });
});

describe("(52) first run polish", () => {
  const ob = read("./onboarding.tsx");
  test("while the first check runs, the step it is on shows with the live dot", () => {
    const m = run([{ type: "ui.findProblem", fresh: true }, ev({ type: "proof.step", agent: A, rung: "tests", label: "Running the tests", status: "running", detail: "" })]);
    expect(m.point).toMatchObject({ stage: "checking", label: "Running the tests" });
    // A step that finished leaves the line as it was.
    const after = reduce(m, ev({ type: "proof.step", agent: A, rung: "tests", label: "Running the tests", status: "passed", detail: "" }) as never);
    expect(after.point).toMatchObject({ stage: "checking", label: "Running the tests" });
    expect(ob).toContain('<p className="fr-line fr-live"><span className="live" aria-hidden="true" />{point?.label || S.fr.checkPromise}</p>');
  });
  test("only Stop the check while it runs, never its near twin Skip the check", () => {
    expect(ob).not.toContain("{ stopCheck(); finish(); }}>{S.fr.skipCheck}");
  });
  test("a disabled main key is a quiet outline, the folds sit above the water, and Flowflow is Home's size, held at Huge", () => {
    expect(css).toMatch(/\.home \.fr \.fr-key\.primary:disabled \{ border: var\(--hair\) solid var\(--line-strong\); background: var\(--bg\);/);
    expect(css).toMatch(/\.fr-folds \{[^}]*position: relative; z-index: 1;/);
    expect(css).toMatch(/\.fr-tank \.fr-float \{[^}]*width: min\(calc\(136rem \/ 14\), 150px\)/);
  });
});

describe("(40) More ways opens over the ask box, each way with a drawing and a line", () => {
  const more = card.slice(card.indexOf('<details className="more">'), card.indexOf("</details>", card.indexOf('<details className="more">')));
  test("every way has its drawing and its one line (as its tooltip and description), keys in the tooltip, not as caps", () => {
    const chips = more.match(/<Button size="sm"[^\n]*/g) ?? [];
    expect(chips.length).toBeGreaterThanOrEqual(10);
    for (const c of chips) { expect(c, c).toContain("<Icon name="); expect(c, c).toMatch(/title=\{tip\(/); }
    expect(more).not.toContain("<Caps ");
    for (const k of ["find", "safe", "explain", "showMe", "plan", "rescue", "research", "online", "drawIt", "bisect"] as const) {
      const words = S.look.moreHelp[k];
      expect(words.split(/\s+/).length, k).toBeLessThanOrEqual(12);
    }
  });
  test("the voice toggle lives in Settings, Keys and voice, not here", () => {
    expect(more).not.toContain('buttonShown("autoSend")');
    expect(read("./settingsPages.ts")).toMatch(/"more\.keys\.talking"[^\n]*"talk\.autoSend"/);
  });
  test("it opens downward in the ask box's column and pushes the work up, never a popover over anything (M69, spec 3.15)", () => {
    expect(more).toContain('<div className="more-pop">');
    expect(css).not.toMatch(/details\.more > \.more-pop \{[^}]*position: absolute/);
    const system = read("./ui/system.css");
    expect(system).toMatch(/\.home \.askwrap details\.more > \.more-pop \{ position: static;[^}]*max-height: 34vh;[^}]*overflow: auto;/);
    // Jobs on top, this request's options under a divider.
    expect(more.indexOf('<hr className="more-rule" />')).toBeGreaterThan(more.indexOf('className="more-ways"'));
    expect(more.indexOf('<hr className="more-rule" />')).toBeLessThan(more.indexOf('className="more-opt"'));
  });
});

describe("(41) the practice's found state shows what is wrong, not test code the learner must not change", () => {
  const panel = read("./practicePanel.tsx");
  test("a problem whose line is in a test file is a test's line", () => {
    expect(fromTest({ kind: "line", file: "test/signup.test.js", line: 3, message: "x" } as never)).toBe(true);
    expect(fromTest({ kind: "line", file: "src/__tests__/join.js", line: 3, message: "x" } as never)).toBe(true);
    expect(fromTest({ kind: "line", file: "tests/prices.spec.ts", line: 9, message: "x" } as never)).toBe(true);
    expect(fromTest({ kind: "line", file: "src/signup.js", line: 3, message: "x" } as never)).toBe(false);
    expect(fromTest(null)).toBe(false);
  });
  test("then its line is behind Details, and the plain message leads", () => {
    expect(panel).toContain("{fromTest(p.problem) ? <details className=\"raw\"><summary><Icon name=\"chevron\" size={12} />{S.checkDetails}</summary><FailingLine problem={p.problem} /></details> : <FailingLine problem={p.problem} />}");
  });
  test("the start is two sentences, and the house rule note is folded", () => {
    expect(S.practiceStartIn("practice", "It is a page.").split(/(?<=[.!?])\s+/).length).toBe(2);
    expect(panel).toContain("{task && <details className=\"raw pr-rules\"><summary><Icon name=\"chevron\" size={12} />{S.practiceRulesTitle}</summary><p className=\"line muted\">{S.practiceRulesNote}</p></details>}");
  });
});

describe("(50) the Memory page", () => {
  test("titled What I remember, with About this project and About you", () => {
    expect(S.memoryTitle).toBe("What I remember");
    expect(S.memoryProject).toBe("About this project");
    expect(S.memoryProfile).toBe("About you");
  });
  test("dates in words, never raw ISO", () => {
    const d = memoryDate("2026-11-02T10:00:00Z");
    expect(d).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(d).toMatch(/2026/);
    expect(memoryDate("")).toBe("");
    expect(memoryDate("soon")).toBe("soon");
  });
  test("a failed look up says so and offers Try again, never loading for ever", () => {
    const m = reduce({ ...initial(), folder: P } as Model, ev({ type: "protocol.error", failed: "memory.list", reason: "The memory file could not be read." }) as never);
    expect(m.memoryNote).toBeTruthy();
    expect(m.error).toBeNull();
    expect(card).toContain("{show(\"memory\") && project && !m.memory && !m.memoryNote && m.runnerUp &&");
    expect(card).toContain("onClick={() => { dispatch({ type: \"ui.memoryRetry\" }); void send(listMemory(project)); }}>{S.tryAgain}</button>");
    expect(reduce(m, { type: "ui.memoryRetry" } as never).memoryNote).toBeNull();
  });
  test("the settings are rows in one group, there is no Close, and notes sit on the spacing grid", () => {
    const mem = card.slice(card.indexOf('<section className="panel memory"'), card.indexOf("</section>", card.indexOf('<section className="panel memory"')));
    expect(mem).toContain("<Group title={S.memorySettingsTitle}>");
    expect(mem).not.toContain("S.memoryClose");
    expect(css).toMatch(/\.note \{[^}]*padding: var\(--space-3\) var\(--space-4\);/);
  });
});

describe("(54) the notch and the desktop label", () => {
  test("under Reduce motion the working arc is a still dot, never a frozen open arc", () => {
    expect(wingMarkShown("arc", true)).toBe("dots");
    expect(wingMarkShown("arc", false)).toBe("arc");
    expect(wingMarkShown("bars", true)).toBe("dots");
    expect(wingMarkShown("tick", true)).toBe("tick");
    expect(read("./island.tsx")).toContain("<Mark w={w} count={m.approvals.length} reduced={reduced} />");
  });
  test("both wing marks sit in one same size box, the same inset from the shape's edge", () => {
    expect(css).toMatch(/\.island \{[^}]*--wing-mark: 20px;/);
    expect(css).toMatch(/\.island-wing > \.island-flow, \.island-wing > \.mark \{ flex: none; width: var\(--wing-mark\); height: var\(--wing-mark\);/);
  });
  test("the peek's lines are on the row's left edge and Stop is a pill", () => {
    expect(css).toMatch(/\.island-panel \.ip-status, \.island-panel \.ip-note, \.island-panel \.ip-new \{ text-align: left; \}/);
    expect(css).toMatch(/\.island-panel \.ip-live > button \{ border-radius: var\(--r-pill\); \}/);
  });
  test("the desktop label and the drop's words are fixed glass, readable on any wallpaper in any theme", () => {
    expect(css).toMatch(/\.dock-label \{[^}]*color: var\(--glass-ink\); background: var\(--glass-quiet\);[^}]*box-shadow: 0 0 0 var\(--hair\) var\(--glass-edge\)/);
    expect(css).toMatch(/\.drop-over-character \{[^}]*background: var\(--glass-quiet\); color: var\(--glass-ink\);/);
  });
});

describe("(53) copy that says each thing once", () => {
  test("the working line is the cost so far, said once, in the one cost pattern", () => {
    expect(S.look.working("7 cents")).toBe("About 7 cents so far");
    expect(card).not.toContain('<ProofChip kind="cost" label={formatUsd(m.task.costUsd)} />');
    expect(S.fixCost("7 cents")).toBe("About 7 cents");
    expect(S.review.cost("7 cents")).toBe("About 7 cents");
    expect(S.practiceCostKey(7)).toBe("About 7 cents");
  });
  test("Copy says what it copies", () => {
    expect(card).toContain("{state === \"copied\" ? S.copied : label}</button>");
  });
  test("a review reason that already names its file does not repeat the place", () => {
    expect(placeSaid({ say: "app.js now sends the key to the browser.", file: "src/app.js", line: 4 })).toBe(true);
    expect(placeSaid({ say: "A key is sent to the browser.", file: "src/app.js", line: 4 })).toBe(false);
    // M58: the findings are drawn in their fixed shape by findingList.tsx, with the same rule.
    expect(read("./findingList.tsx")).toContain("!placeSaid({ say: f.parts.detail ?? \"\", file: f.file }) && <code className=\"review-at\">");
  });
  test("no project is said once: the folder menu says No project, and no notice repeats it", () => {
    expect(S.look.noProject).toBe("No project");
    expect(card).toContain("placeholder={project ? (project.split(\"/\").filter(Boolean).at(-1) ?? project) : S.look.noProject}");
    expect(card).not.toContain('{!project && <div className="notice">{S.folderNone}</div>}');
  });
  test("the ask box has a chat drawing, not a search glass; the review row an eye", () => {
    expect(card).toContain('<span className="ask-mark" aria-hidden="true"><Icon name="sparkle" size={16} /></span>');
    expect(read("./homeSide.tsx")).toContain('<Icon name="eye" size={12} />');
    expect(read("./icons.tsx")).toMatch(/^  eye: /m);
  });
  test("Settings help: no sentence runs past 25 words (writing.test.ts holds it there)", () => {
    expect(read("./writing.test.ts")).toContain("no Settings help sentence runs past 25 words");
  });
});

describe("(53) when a card owns the moment, the hero says the finding and the card's title goes", () => {
  test("a problem found: the hero's big words are what broke, the check under it, and the card's title is for VoiceOver only", () => {
    const m = { ...initial(), folder: P, point: { stage: "found", label: "Building and checking the code", message: "x is not defined", problem: { kind: "line", file: "app.js", line: 3, message: "x is not defined" } } } as unknown as Model;
    const w = heroWords(m, P);
    expect(w.headline).toBe("x is not defined");
    expect(w.line).toBe("Building and checking the code");
    expect(card).toContain('<h2 className={m.point.stage === "found" && !m.practice ? "sr" : undefined}>{m.point.stage === "clear" ? S.screens.pass.title : S.pointTitle}</h2>');
  });
});

describe("(53) no bare Ready under the hero", () => {
  test("a look that waits on Now says its card is just below", () => {
    const m = { ...initial(), folder: P, ph: { stage: "ready" } } as unknown as Model;
    const w = heroWords(m, P, { key: "ph:ready", tab: "now", why: S.phTitle, mustShow: true });
    expect(w.line).toBe(S.look.answerBelow);
    expect(w.line).not.toBe("Ready");
  });
});

describe("(53) Learn: each practice and lesson is told apart, the first practice leads, the disclaimer is said once", () => {
  const panel = read("./practicePanel.tsx");
  test("a practice's tile says its kind: a fix, going live, or a setting to learn", () => {
    expect(practiceKind({ fix: "task", prove: "checks" } as never)).toBe("fix");
    expect(practiceKind({ fix: "task", prove: "gate" } as never)).toBe("live");
    expect(practiceKind({ fix: "lesson", prove: "checks" } as never)).toBe("explain");
    expect(panel).toContain("<ItemTile label={r.title} big kind={practiceKind(r.entry)} />");
  });
  test("the first practice, not yet started, is a featured card", () => {
    expect(panel).toContain('r.entry.id === FIRST_PRACTICE && state === "notStarted" && lead ? " pr-feature" : ""');
    expect(css).toMatch(/\.home \.pr-item\.pr-feature \{/);
  });
  test("each lesson's Start names its lesson, and the new lesson note is said once under the list", () => {
    expect(card).toContain("aria-label={`${l.saved ? S.lessonContinue : S.lessonStart}: ${l.title}`}");
    expect(card).not.toContain('{l.status !== "tried" && <div className="line muted">{S.lessonDraft}</div>}');
    expect(card).toContain('.some((l) => l.status !== "tried") && <div className="line muted">{S.lessonDraft}</div>}');
  });
});
