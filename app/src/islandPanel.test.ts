import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MAX_JOBS, PANEL_DO, islandJobs, panelNote, panelView } from "./islandPanel.ts";
import { initial, reduce, type Model } from "./model.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const started = [ev({ type: "checkpoint.created", project: "/p", agent: "a", checkpoint: "cp_1", label: "Before: fix the join button", files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];

describe("the panel under the notch shows the work, not a character", () => {
  test("nothing going on: no cards", () => {
    expect(islandJobs(initial())).toEqual([]);
  });
  test("work going on: one card with what it is doing, and the cost once there is one", () => {
    const m = run(started);
    const [c] = islandJobs(m);
    expect(c.tone).toBe("working");
    expect(c.title).toBe("Fix the join button");   // the task's name, starting with a capital
    expect(panelNote("Flow: Working on: Fix the join button", [c]), "never said twice").toBe("");
    expect(panelNote(S.islandNotConnected, [])).toBe(S.islandNotConnected);
    expect(c.cost).toBeNull();
    const paid = run([ev({ type: "cost.update", agent: "a", usdEstimate: 0.04 })], m);
    expect(islandJobs(paid)[0].cost).toBe("4 cents");
  });
  test("a plan running: the card says which step", () => {
    const m = run([...started, ev({ type: "drive.step", agent: "a", index: 2, total: 3, title: "Rename the function", status: "started" })]);
    expect(islandJobs(m)[0].sub).toBe(S.panel.step(2, 3, "Rename the function"));
  });
  test("a question waiting comes first, and says it can be answered here", () => {
    const m = run([...started, ev({ type: "approval.request", approval: "ap1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "install", title: "Install a package", expiresAt: "2099-01-01T00:00:00Z" })]);
    const c = islandJobs(m);
    expect(c[0]).toMatchObject({ tone: "needsYou", title: S.approval.question.install, sub: S.panel.askHere });   // M28: the plain question
  });
  test("never more than a glance", () => {
    let m = run(started);
    for (let i = 0; i < 6; i++) m = run([ev({ type: "approval.request", approval: `ap${i}`, agent: "a", checkpoint: "cp_1", toolUseId: `t${i}`, risk: "install", title: `Q${i}`, expiresAt: "2099-01-01T00:00:00Z" })], m);
    expect(islandJobs(m).length).toBe(MAX_JOBS);
  });
  test("its buttons ask Home for Undo's question and for Settings at the key, and the shell lets only those through", () => {
    expect(PANEL_DO).toEqual({ undo: { do: "undo" }, key: { set: "account.claude" } });
    const win = read("../src-tauri/src/arrival.rs");
    expect(win).toContain('Some("undo") => Some(serde_json::json!({ "do": "undo" })),');
    expect(win).toContain('return ok.then(|| serde_json::json!({ "set": id }));');
    const view = read("./islandPanel.tsx");
    expect(view).toContain('invoke("open_card_cmd", { then: PANEL_DO.undo })');
    expect(view).toContain('invoke("open_card_cmd", { then: PANEL_DO.key })');
    expect(view).not.toContain("openSettingsWindow");
  });
  test("the island draws the panel and no live character any more; it tells the app the panel's measured height", () => {
    const page = read("./island.tsx");
    expect(page).not.toContain("FlowflowView");
    expect(page).toContain("<IslandPanel");
    expect(page).toMatch(/invoke\("island_alert", \{ on: out, panel: panelH, cheer: cheering, ask, wing \}\)/);
  });
});

// F28, the overhaul spec 4.3: the hover panel shows exactly one live thing, and never a greeting or a launcher button.
describe("the hover panel shows only what is live (F28, 4.3)", () => {
  const receipt = (o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "join.js", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.05, ended: "done", ...o });
  const finished = (o: Record<string, unknown> = {}, state = "done") => run([...started, receipt(o), ev({ type: "agent.state", agent: "a", state })]);
  const ask = run([...started, ev({ type: "approval.request", approval: "ap1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "install", title: "Q", expiresAt: "2099-01-01T00:00:00Z" })]);
  const o = { note: "", status: "test-shop works. Last fix proven 2 hours ago." };
  test("a question comes first, then a job, then a result, then Add your key, then one true line", () => {
    expect(panelView(ask, islandJobs(ask), o).kind).toBe("questions");
    const working = run(started);
    expect(panelView(working, islandJobs(working), o)).toMatchObject({ kind: "job", job: { tone: "working", title: "Fix the join button" } });
    const proven = finished();
    expect(panelView(proven, islandJobs(proven), o)).toMatchObject({ kind: "result", canUndo: true, verdict: { proven: true } });
    const off = run([ev({ type: "auth.status", method: "none" })]);
    expect(off.connected).toBe("none");
    expect(panelView(off, islandJobs(off), o).kind).toBe("connect");
    expect(panelView(initial(), [], o)).toEqual({ kind: "line", line: o.status });
    // A line the island already has to say (the engine stopped, an update) comes before the project's line.
    expect(panelView(initial(), [], { ...o, note: S.islandOff })).toEqual({ kind: "line", line: S.islandOff });
  });
  test("Undo shows only where the result offers it, and never while an undo is under way", () => {
    const stopped = finished({ ended: "stopped", proof: "skipped", changed: [] }, "idle");
    expect(panelView(stopped, islandJobs(stopped), o)).toMatchObject({ kind: "result", canUndo: false });
    const asked = run([ev({ type: "ui.undoAsked", checkpoint: "cp_1" })], finished());
    expect(panelView(asked, islandJobs(asked), o)).toMatchObject({ kind: "result", canUndo: false });
  });
  test("the panel draws each: Stop on a job, Undo this fix and See proof on a result, Add your key as the one silver", () => {
    const view = read("./islandPanel.tsx");
    expect(view).toContain('onClick={() => void invoke("send_command", { cmd: stopAgent() }).catch(() => {})}><Icon name="stop" size={12} />{S.stop}</Button>');
    expect(view).toContain("<VerdictLine verdict={view.verdict} sub={view.job.title} />");
    expect(view).toContain("<ProofChips m={m} />");
    expect(view).toContain("{view.canUndo && <Button size=\"sm\" tabIndex={tab} onClick={click(view.job.key,");
    expect(view).toContain('<Button kind="quiet" size="sm" tabIndex={tab} onClick={click(view.job.key, () => void invoke("open_card_cmd").catch(() => {}))}>{S.home.seeProof}</Button>');
    expect(view).toContain('<Button kind="primary" size="lg" tabIndex={tab} onClick={() => void invoke("open_card_cmd", { then: PANEL_DO.key }).catch(() => {})}>{S.home.addKey}</Button>');
    expect(view.match(/kind="primary"/g)?.length).toBe(1);
    expect(view).toContain('<p className="ip-status" role="status">{view.line || S.home.notchNothing}</p>');
  });
  test("no greeting, no launcher buttons, no Settings or Open Home button: a click on the notch opens Home", () => {
    const view = read("./islandPanel.tsx");
    for (const gone of ["greeting(", "ip-hello", "ip-hi", "ip-go", "ip-pill", "ip-open", "ip-row", "S.panel.go", "S.look.chipFind", "S.look.chipSafe", "first_name", "panel.showHello", "panel.showButtons"]) expect(view, gone).not.toContain(gone);
    const css = read("./style.css").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const gone of [".ip-hello", ".ip-hi", ".ip-go", ".ip-pill", ".ip-open", ".ip-row", ".ip-plus"]) expect(css, gone).not.toContain(gone);
    // Their settings are kept in the registry, hidden, so a value already set does nothing and nothing offers it.
    const reg = JSON.parse(read("../../protocol/settings.json")).settings as { key: string; hidden?: boolean }[];
    for (const k of ["panel.showHello", "panel.showButtons"]) expect(reg.find((d) => d.key === k)?.hidden, k).toBe(true);
    // With the greeting gone, nothing reads the Mac account's full name: the command is neither defined, registered nor
    // allowed (review, 31 Oct), so no page can ask for personal data that nothing needs.
    const main = read("../src-tauri/src/main.rs"), groups = read("../../protocol/groups.json"), island = read("../src-tauri/src/island.rs");
    for (const [name, src] of [["main.rs", main], ["groups.json", groups], ["island.rs", island]] as const) {
      expect(src, name).not.toMatch(/\bfirst_name\b/);
      expect(src, name).not.toContain("NSFullUserName");
    }
  });
});

describe("the bare notch at rest (M46, F28: the sun leaves the notch)", () => {
  test("no sun on the black, and the black is exactly the notch", () => {
    const page = read("./island.tsx"), css = read("./style.css");
    expect(page).toContain("const shapeW = shape.w;");
    expect(page).not.toContain("sun-lime.svg");
    expect(page).not.toContain("prefers-color-scheme");   // no guessing the menu bar's colour from the Mac's theme
    expect(css).not.toContain(".island-sun");
  });
});

// M23: answer in the notch. Only questions that can be taken back are answered here, once, and only after the card has
// been seen for a moment; the rest open Home to look first.
import { ARM_MS, answerHere, armed } from "./islandPanel.ts";
import { answerApproval } from "./commands.ts";

describe("answering in the notch (M23)", () => {
  const ask = (risk: string) => run([...started, ev({ type: "approval.request", approval: "ap1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk, title: "Q", expiresAt: "2099-01-01T00:00:00Z" })]);
  test("questions that can be taken back are answered here", () => {
    for (const r of ["network", "install", "outside_project", "settings"]) expect(answerHere(r), r).toBe(true);
  });
  test("what cannot be undone, and anything touching the person's git, opens Home to look first", () => {
    for (const r of ["irreversible", "git", "something new"]) expect(answerHere(r), r).toBe(false);
  });
  test("a file outside the project that Undo can't take back opens Home, where the card says so (M45)", () => {
    const outside = (undoable: boolean, action: string) => run([...started, ev({ type: "approval.request", approval: "ap1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "outside_project", title: "This points Git at a folder outside your project.", action, undoable, expiresAt: "2099-01-01T00:00:00Z" })]);
    expect(islandJobs(outside(false, "Running: git -C ../other log"))[0]).toMatchObject({ here: false, sub: "git -C ../other log" });
    expect(islandJobs(outside(true, "Read: /Users/me/other/a.txt"))[0].here).toBe(true);
    expect(answerHere("outside_project", false)).toBe(false);
    expect(answerHere("network", false), "network asks stay as M23 left them").toBe(true);
  });
  test("paths on the notch's question are shown from the project folder (M45)", () => {
    const m = run([...started, ev({ type: "approval.request", approval: "ap1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "settings", title: "Q", action: "Write: /p/.env", undoable: true, expiresAt: "2099-01-01T00:00:00Z" })]);
    expect(islandJobs(m)[0].sub).toBe(".env");
  });
  test("the card carries the question's id and risk", () => {
    expect(islandJobs(ask("install"))[0]).toMatchObject({ approval: "ap1", risk: "install" });
    expect(islandJobs(run(started))[0].approval).toBeUndefined();
  });
  test("the buttons wait until the card has been on screen for a moment", () => {
    expect(ARM_MS).toBeGreaterThanOrEqual(500);
    expect(armed(null, 10_000)).toBe(false);
    expect(armed(1000, 1000 + ARM_MS - 1)).toBe(false);
    expect(armed(1000, 1000 + ARM_MS)).toBe(true);
  });
  test("an answer from the notch is for this once only", () => {
    expect((answerApproval("ap1", true) as { scope: string }).scope).toBe("once");
    const src = read("./islandPanel.tsx");
    expect(src).toContain("answerApproval(");
    expect(src).not.toMatch(/scope:\s*"task"/);
  });
});

// M46 (replacing M26's work peek): a card drops from the notch by itself only for a result that matters, a proven fix or a
// failure. A job starting, moving a step, its cost, a partly checked or a plain (stopped, not checked) result, and Undo
// stay up in the notch: the person rests the pointer on it to see them.
import { RESULT_PEEK_MS, resultPeekKey } from "./islandPanel.ts";

describe("only a proven fix or a failure drops from the notch by itself (M46)", () => {
  const receipt = (o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "join.js", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.05, ended: "done", ...o });
  const finished = (o: Record<string, unknown> = {}, state = "done") => run([...started, receipt(o), ev({ type: "agent.state", agent: "a", state })]);
  const undone = (m: Model) => run([ev({ type: "checkpoint.restored", project: "/p", checkpoint: "cp_1", safety: "cp_2", recovered: [], largeLeftAlone: [], leftAlone: [] })], m);
  test("a start, a step and a cost give nothing", () => {
    expect(resultPeekKey(islandJobs(initial()))).toBe("");
    const a = run(started);
    expect(resultPeekKey(islandJobs(a))).toBe("");
    expect(resultPeekKey(islandJobs(run([ev({ type: "drive.step", agent: "a", index: 2, total: 3, title: "Rename the function", status: "started" })], a)))).toBe("");
    expect(resultPeekKey(islandJobs(run([ev({ type: "cost.update", agent: "a", usdEstimate: 0.04 })], a)))).toBe("");
  });
  test("partly checked, plain (stopped, not checked) and Undo give nothing", () => {
    expect(resultPeekKey(islandJobs(finished({ proof: "partial" })))).toBe("");
    expect(resultPeekKey(islandJobs(finished({ ended: "stopped", proof: "skipped" }, "idle")))).toBe("");
    expect(resultPeekKey(islandJobs(undone(finished())))).toBe("");
  });
  test("a proven fix and a failure each give their own key, never built from the card's line", () => {
    const proven = resultPeekKey(islandJobs(finished()));
    const failed = resultPeekKey(islandJobs(finished({ ended: "failed", endedWhy: "check_failed", proof: "failed" }, "error")));
    expect(proven).not.toBe(""); expect(failed).not.toBe(""); expect(proven).not.toBe(failed);
    expect(proven).toBe("done:cp_1|done");
    const [c] = islandJobs(finished());
    expect(resultPeekKey([{ ...c, sub: "another line" }])).toBe(proven);
  });
  test("questions are never part of it (they open by their own setting)", () => {
    const m = run([...started, ev({ type: "approval.request", approval: "ap1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "install", title: "Q", expiresAt: "2099-01-01T00:00:00Z" })]);
    expect(resultPeekKey(islandJobs(m))).toBe("");
  });
  test("it stays down as long as the done tick shows", () => {
    expect(RESULT_PEEK_MS).toBe(4000);
    expect(read("./island.tsx")).toContain('useSetting("island.showWork") !== false');
    expect(read("./islandPanel.tsx")).toContain("brief");
  });
});

// M46: a card that opened by itself ignores every click for its first ARM_MS: Look first, a result card, Allow and Don't
// allow. The pointer that happened to sit there cannot press anything by accident.
describe("a self opened panel is armed after a moment (M46)", () => {
  test("ignored at 599 ms, accepted at 600 ms, whatever the button", () => {
    expect(ARM_MS).toBe(600);
    expect(armed(0, 599)).toBe(false);
    expect(armed(0, 600)).toBe(true);
    const view = read("./islandPanel.tsx");
    expect(view).toContain("const openedAt = useRef<number | null>(null);");
    expect(view).toContain('data-armed={ready() ? "yes" : undefined}');
    for (const b of ['<Button size="sm" className="ip-yes" tabIndex={tab} onClick={click(j.key, () => void invoke("island_click").catch(() => {}))}>', '<div className="ip-result" data-armed={cardOk(view.job.key, now) ? "yes" : undefined}>', 'onClick={click(view.job.key, () => void invoke("open_card_cmd", { then: PANEL_DO.undo }).catch(() => {}))}']) expect(view, b).toContain(b);
    expect(view).toContain("const click = (key: string, f: () => void) => () => { if (!ready() || !cardOk(key, Date.now())) return; f(); };");
    expect(view).toContain("const keys = jobs.map((j) => j.key).join(\" \");");   // every card's first sight, not only questions'
    expect(read("./style.css")).toContain(".island-panel button.ip-job:not([data-armed]) { cursor: default; }");
    expect(read("./style.css")).toContain(".island-panel[data-brief]:not([data-armed]) { cursor: default; }");
  });
});

import { cardReady } from "./islandPanel.ts";
describe("a card that drops into a panel already open by itself waits its own moment (M46)", () => {
  test("opened at 0 for a result, a question at 2 s: its Look first ignores 2599 ms and takes 2600 ms", () => {
    expect(cardReady(0, 0, 599)).toBe(false);
    expect(cardReady(0, 0, 600)).toBe(true);
    expect(cardReady(0, 2000, 2599)).toBe(false);
    expect(cardReady(0, 2000, 2600)).toBe(true);
    expect(cardReady(0, null, 9000)).toBe(false);   // not drawn yet: nothing to press
  });
  test("opened by the pointer, every card is ready at once", () => {
    expect(cardReady(null, null, 0)).toBe(true);
    expect(cardReady(null, 5000, 5001)).toBe(true);
  });
});

describe("M45: the notch card after a result tells the truth", () => {
  const receipt = (o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "join.js", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.05, ended: "done", ...o });
  const finished = (o: Record<string, unknown> = {}, state = "done") => run([...started, receipt(o), ev({ type: "agent.state", agent: "a", state })]);
  const undone = (m: Model) => run([ev({ type: "checkpoint.restored", project: "/p", checkpoint: "cp_1", safety: "cp_2", recovered: [], largeLeftAlone: [], leftAlone: [] })], m);
  test("a proven fix is green", () => {
    const [c] = islandJobs(finished());
    expect([c.tone, c.state, c.sub]).toEqual(["done", "done", "Fixed and proven."]);
  });
  test("after Undo the notch card is not green", () => {
    const [c] = islandJobs(undone(finished()));
    expect(c.tone).toBe("plain");
    expect(c.state).toBe("idle");
    expect(c.sub).toBe("Undone. The fix is gone, so the problem is back.");
  });
  test("Undo never drops a card by itself (M46): the proven key goes, nothing new comes", () => {
    const m = finished();
    expect(resultPeekKey(islandJobs(m))).not.toBe("");
    expect(resultPeekKey(islandJobs(undone(m)))).toBe("");
  });
  test("a stopped task's card is plain", () => {
    const [c] = islandJobs(finished({ ended: "stopped", proof: "skipped" }, "idle"));
    expect([c.tone, c.state]).toEqual(["plain", "idle"]);
    expect(c.sub).toBe(`${S.verdict.stopped}. ${S.verdict.stoppedChanged}`);
  });
  test("a failed check is red, a partial one amber", () => {
    expect(islandJobs(finished({ ended: "failed", endedWhy: "check_failed", proof: "failed" }, "error"))[0]).toMatchObject({ tone: "failed", state: "error" });
    expect(islandJobs(finished({ proof: "partial" }))[0]).toMatchObject({ tone: "partly", state: "idle" });
  });
});
