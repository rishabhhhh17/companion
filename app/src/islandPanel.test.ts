import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MAX_JOBS, PANEL_DO, islandJobs, panelNote } from "./islandPanel.ts";
import { initial, reduce, type Model } from "./model.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const started = [ev({ type: "checkpoint.created", project: "/p", agent: "a", checkpoint: "cp_1", label: "Before: fix the join button", files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];

describe("the panel under the notch shows the work, not a character", () => {
  test("nothing going on: no cards (the ask bar and the two quick buttons are always there)", () => {
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
  test("the quick buttons ask Home for the two things Squibby is for and for Settings inside it, and the shell lets only those through", () => {
    expect(PANEL_DO).toEqual({ find: { do: "find" }, ship: { do: "shipCheck" }, settings: { place: "settings" } });
    expect(read("../src-tauri/src/settingswin.rs")).toContain('Some("settings") => Some(serde_json::json!({ "place": "settings" }))');
    expect(read("./islandPanel.tsx")).toContain('invoke("open_card_cmd", { then: PANEL_DO.settings })');
    expect(read("./islandPanel.tsx")).not.toContain("openSettingsWindow");
    const win = read("../src-tauri/src/settingswin.rs");
    expect(win).toContain('Some("find") => Some(serde_json::json!({ "do": "find" }))');
    expect(win).toContain('Some("shipCheck") => Some(serde_json::json!({ "do": "shipCheck" }))');
    const card = read("./card.tsx");
    expect(card).toContain('if ("do" in t) { if (t.do === "find") findFromHome(); else shipIt(); return; }');
  });
  test("the island draws the panel and no live character any more; it tells the app the panel's measured height", () => {
    const page = read("./island.tsx");
    expect(page).not.toContain("FlowflowView");
    expect(page).toContain("<IslandPanel");
    const view = read("./islandPanel.tsx");
    expect(view).toContain('invoke("open_card_cmd", { then: PANEL_DO.find })');
    expect(view).toContain('<button className="ip-go" type="button" tabIndex={tab} onClick={() => void invoke("open_card_cmd").catch(() => {})}>');
    expect(view).toContain('invoke("open_card_cmd", { then: PANEL_DO.ship })');
    expect(page).toMatch(/invoke\("island_alert", \{ on: out, panel: panelH, cheer: cheering, ask \}\)/);
  });
});

describe("the sun inside the notch (M20)", () => {
  test("at rest the notch's black grows into the window's margin, and the sun sits on it in lime, sharp on any wallpaper", () => {
    const page = read("./island.tsx"), css = read("./style.css");
    expect(page).toContain("const shapeW = shape.w;");
    expect(page).toContain('src="./brand/sun-lime.svg"');
    expect(page).not.toContain("prefers-color-scheme");   // no guessing the menu bar's colour from the Mac's theme
    expect(css).toMatch(/\.island\.notch\[data-mode="rest"\]:not\(\[data-tuck\]\) \.island-sun \{ display: block;/);
    expect(css).not.toContain("island-sun-breathe");   // it holds still: no fading in and out on the black
    const lime = readFileSync(new URL("../public/brand/sun-lime.svg", import.meta.url), "utf8");
    expect(lime).toContain('fill="#C6F432"');
    // The mark is exactly seven identical rays (make_logo.py rotates one path 360/7 degrees) and a sun with its smile cut out.
    expect(lime.match(/transform="rotate\(/g)?.length).toBe(7);
    expect(new Set([...lime.matchAll(/<path d="([^"]+)" fill="#C6F432" transform/g)].map((m) => m[1])).size).toBe(1);
    expect(lime).toContain('mask="url(#cutn)"');
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

// M26: work cards that hang from the notch by themselves for a moment (like a phone's live activity): when a job starts,
// moves to a new step, and ends with its proof. Then they tuck back; the pointer still opens the whole panel.
import { WORK_PEEK_MS, workPeekKey } from "./islandPanel.ts";

describe("work cards drop from the notch on each change (M26)", () => {
  test("the moment changes when a job starts, moves a step, or ends", () => {
    const a = run(started);
    const k0 = workPeekKey(islandJobs(initial()));
    const k1 = workPeekKey(islandJobs(a));
    expect(k0).toBe("");
    expect(k1).not.toBe("");
    const b = run([ev({ type: "drive.step", agent: "a", index: 2, total: 3, title: "Rename the function", status: "started" })], a);
    expect(workPeekKey(islandJobs(b))).not.toBe(k1);
  });
  test("the cost going up is not a new moment", () => {
    const a = run(started);
    const paid = run([ev({ type: "cost.update", agent: "a", usdEstimate: 0.04 })], a);
    expect(workPeekKey(islandJobs(paid))).toBe(workPeekKey(islandJobs(a)));
  });
  test("a moment is long enough to read and short enough not to be in the way", () => {
    expect(WORK_PEEK_MS).toBeGreaterThanOrEqual(2500);
    expect(WORK_PEEK_MS).toBeLessThanOrEqual(5000);
  });
  test("opened by itself, the panel shows only the cards; the pointer shows everything", () => {
    const view = read("./islandPanel.tsx");
    expect(view).toContain("brief");
    expect(read("./island.tsx")).toContain('useSetting("island.showWork") !== false');
  });
});
