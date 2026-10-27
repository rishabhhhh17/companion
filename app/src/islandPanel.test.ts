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
  test("a question waiting comes first, and says to open Home to answer", () => {
    const m = run([...started, ev({ type: "approval.request", approval: "ap1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "install", title: "Install a package", expiresAt: "2099-01-01T00:00:00Z" })]);
    const c = islandJobs(m);
    expect(c[0]).toMatchObject({ tone: "needsYou", title: "Install a package", sub: S.panel.needsYou });
  });
  test("never more than a glance", () => {
    let m = run(started);
    for (let i = 0; i < 6; i++) m = run([ev({ type: "approval.request", approval: `ap${i}`, agent: "a", checkpoint: "cp_1", toolUseId: `t${i}`, risk: "install", title: `Q${i}`, expiresAt: "2099-01-01T00:00:00Z" })], m);
    expect(islandJobs(m).length).toBe(MAX_JOBS);
  });
  test("the quick buttons ask Home for the two things Squibby is for, and the shell lets only those through", () => {
    expect(PANEL_DO).toEqual({ find: { do: "find" }, ship: { do: "shipCheck" } });
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
    expect(page).toMatch(/invoke\("island_alert", \{ on: out, panel: panelH, cheer: cheering \}\)/);
  });
});
