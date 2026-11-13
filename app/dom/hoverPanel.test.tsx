// M59: the hover panel on the notch (islandPanel.tsx), rendered and clicked through: each quick action opens Home at its
// own place through the shell (island_go), never starts work by itself, and a running job's row has Stop.
import { describe, expect, test } from "bun:test";
import { IslandPanel } from "../src/islandPanel.tsx";
import { islandJobs } from "../src/islandPanel.ts";
import { initial, reduce, type Model } from "../src/model.ts";
import { S } from "../src/strings.ts";
import { PROJECT, app, buttons, ev, press, renderPage, runner, screen, settle } from "./render.tsx";
import { COPY_BASE } from "../src/practice.ts";
import { TOOLS_WAIT_MS } from "../src/notchPeek.ts";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);
const atRest = () => run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }]);
const goes = () => app.invoked("island_go").map((c) => c.args);

describe("the hover panel's quick actions", () => {
  test("at rest with a project: Ask and Check my project, each opening Home at its own place", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown />);
    const quick = screen.getByRole("navigation", { name: "Quick actions" });
    expect(quick).toBeTruthy();
    expect(buttons()).toContain("Ask");
    expect(buttons()).toContain("Check my project");
    await press("Ask");
    await press("Check my project");
    expect(goes()).toEqual([{ then: { place: "ask" } }, { then: { do: "find" } }]);
    // Opening Home is all a press does. M84 changed this on purpose: the panel's one message to the engine is its own read
    // only ask for the AI tools (donesignal.show), once, as it first opens; the presses send nothing.
    expect(app.sentTypes()).toEqual(["donesignal.show"]);
  });

  test("changes waiting: Review changes opens Home on the review", async () => {
    const m = run([{ type: "review.batch", project: PROJECT, batch: "rv_4f2a9c01de", files: [{ file: "src/a.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false }], atRest());
    await renderPage(<IslandPanel m={m} line="" shown />);
    await press("Review changes");
    expect(goes()).toEqual([{ then: { do: "review" } }]);
  });

  test("Settings and Open grow Home at Settings and at Now", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown />);
    await press("Settings");
    await press(S.notch.open);
    expect(goes()).toEqual([{ then: { place: "settings" } }, {}]);
  });

  test("a running job shows its row with Stop, which sends one interrupt, and no quick actions", async () => {
    const m = run([{ type: "agent.state", agent: "builder-1", state: "working" }, { type: "checkpoint.created", project: PROJECT, agent: "builder-1", checkpoint: "cp_0042", label: "Before: make the button blue", files: 12, skipped: [] }], atRest());
    await renderPage(<IslandPanel m={m} line="" shown />);
    expect(screen.queryByRole("navigation", { name: "Quick actions" })).toBeNull();
    await press(/^Stop/);
    // M84: the read only ask for the AI tools on first open, then the one interrupt Stop sends.
    expect(app.sent()).toEqual([expect.objectContaining({ type: "donesignal.show", project: PROJECT }), expect.objectContaining({ type: "agent.interrupt", agent: "builder-1" })]);
  });

  test("a hidden panel takes no keyboard: every button is out of the tab order", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown={false} />);
    for (const b of document.querySelectorAll(".island-panel button")) expect(b.getAttribute("tabindex")).toBe("-1");
  });

  // M84 replaced the M83 facts row (the founder, 13 Nov: its empty slot read as a blank gap) with one small card per AI tool.
  test("M84: the panel asks for the AI tools itself on first open, once, and shows one card per tool; each press only opens Home", async () => {
    const waiting = run([{ type: "hook.waiting", project: PROJECT, waiting: true, message: "Claude needs your permission" }], atRest());
    const r = await renderPage(<IslandPanel m={waiting} line="" shown />);
    // Before the engine answers, the row says it is checking: never an empty row.
    expect(screen.getByRole("navigation", { name: S.m84.toolsLabel }).textContent).toContain(S.m84.looking);
    expect(app.sent()).toEqual([expect.objectContaining({ type: "donesignal.show", project: PROJECT })]);
    await runner({ type: "donesignal.state", project: PROJECT, tools: [...["done", "guard", "waiting"].map((hook) => ({ tool: "claude", hook, on: true, file: "x", adds: "y", creates: false })), ...["done", "guard"].map((hook) => ({ tool: "cursor", hook, on: true, file: "x", adds: "y", creates: false }))] });
    expect(buttons()).toContain(S.m84.toolSay("Claude Code", S.m84.toolState.waiting));
    expect(buttons()).toContain(S.m84.toolSay("Cursor", S.m84.toolState.watching));
    await press(S.m84.toolSay("Claude Code", S.m84.toolState.waiting));
    await press(S.m84.toolSay("Cursor", S.m84.toolState.watching));
    expect(goes()).toEqual([{}, { then: { set: "fixing.tools" } }]);
    // Hidden and shown again: no second ask.
    r.rerender(<IslandPanel m={waiting} line="" shown={false} />);
    r.rerender(<IslandPanel m={waiting} line="" shown />);
    expect(app.sentTypes()).toEqual(["donesignal.show"]);
  });

  test("M84: no tool connected: the one Connect action opens Your AI tools; hidden, the panel asks nothing", async () => {
    const r = await renderPage(<IslandPanel m={atRest()} line="" shown={false} />);
    expect(app.sent()).toEqual([]);
    r.rerender(<IslandPanel m={atRest()} line="" shown />);
    await runner({ type: "donesignal.state", project: PROJECT, tools: ["done", "guard"].map((hook) => ({ tool: "claude", hook, on: false, file: "x", adds: "y", creates: true })) });
    await press(new RegExp(S.m84.connect));
    expect(goes()).toEqual([{ then: { set: "fixing.tools" } }]);
  });

  test("M84: a real project never checked, no practice done: every row says something (the practice offer, the key), no empty row", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown />);
    const panel = document.querySelector(".island-panel")!;
    expect(panel.getAttribute("data-rows")).toBe("4");
    expect(panel.querySelector(".ip-facts")).toBeNull();
    expect(panel.querySelector('.ip-card[data-next="practice"]')?.textContent).toContain(S.m84.next.practice);
    await press(new RegExp(S.m84.next.practice));
    expect(goes()).toEqual([{ then: { place: "learn" } }]);
    for (const row of panel.children) expect((row.textContent ?? "").trim().length + row.querySelectorAll("button, svg, img").length, row.className).toBeGreaterThan(0);
  });

  test("M84: the founder's case, a practice copy never checked: the card says check it once, never try a practice", async () => {
    // M84 review: the founder's project was "Squibby practice signup page"; the panel told them to try a practice project.
    const copy = `/Users/me/${COPY_BASE} signup page`;
    const m = run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: copy }]);
    await renderPage(<IslandPanel m={m} line="" shown />);
    const panel = document.querySelector(".island-panel")!;
    expect(panel.querySelector('.ip-card[data-next="practice"]')).toBeNull();
    expect(panel.querySelector('.ip-card[data-next="unchecked"]')?.textContent).toContain(S.m84.next.unchecked);
    await press(new RegExp(S.m84.next.unchecked));
    expect(goes()).toEqual([{ then: { do: "find" } }]);
  });

  test("M84: the engine refuses the tools ask: shown again, the panel asks again", async () => {
    const r = await renderPage(<IslandPanel m={atRest()} line="" shown />);
    expect(app.sentTypes()).toEqual(["donesignal.show"]);
    await runner({ type: "protocol.error", reason: "Something went wrong", failed: "donesignal.show" });
    r.rerender(<IslandPanel m={atRest()} line="" shown={false} />);
    r.rerender(<IslandPanel m={atRest()} line="" shown />);
    await settle();
    expect(app.sentTypes()).toEqual(["donesignal.show", "donesignal.show"]);
  });

  test("M84: the engine restarts before it answers: once it is back, the panel asks again", async () => {
    const r = await renderPage(<IslandPanel m={atRest()} line="" shown />);
    r.rerender(<IslandPanel m={{ ...atRest(), runnerUp: false }} line="" shown />);
    r.rerender(<IslandPanel m={atRest()} line="" shown />);
    await settle();
    expect(app.sentTypes()).toEqual(["donesignal.show", "donesignal.show"]);
  });

  test("M84: no answer at all: after a short wait the tools row says it could not check, with Open, never 'One moment' forever", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown />);
    const nav = () => screen.getByRole("navigation", { name: S.m84.toolsLabel });
    expect(nav().textContent).toContain(S.m84.looking);
    await settle(TOOLS_WAIT_MS + 100);
    expect(nav().textContent).not.toContain(S.m84.lookingLine);
    expect(nav().textContent).toContain(S.m84.unknown);
    await press(new RegExp(S.m84.unknown));
    expect(goes()).toEqual([{ then: { set: "fixing.tools" } }]);
    // A late answer still lands.
    await runner({ type: "donesignal.state", project: PROJECT, tools: ["done", "guard"].map((hook) => ({ tool: "cursor", hook, on: true, file: "x", adds: "y", creates: false })) });
    expect(buttons()).toContain(S.m84.toolSay("Cursor", S.m84.toolState.watching));
  });

  test("M84: with three quick actions the key hint is never bare keycaps: it is left out", async () => {
    // M84 review: hover-4, 6, 7 and 9 showed four keycaps with no words beside three actions.
    const m = run([{ type: "review.batch", project: PROJECT, batch: "rv_4f2a9c01de", files: [{ file: "src/a.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false }], atRest());
    await renderPage(<IslandPanel m={m} line="" shown />);
    expect(document.querySelectorAll(".ip-quick .ip-act").length).toBe(3);
    // Beside three actions the hint is left out; wherever it shows, it has its words.
    expect(document.querySelector(".ip-foot .ip-key")).toBeNull();
    await renderPage(<IslandPanel m={atRest()} line="" shown />);
    const key = document.querySelector(".ip-foot .ip-key")!;
    expect(key.textContent).toContain(S.m84.keyBefore);
    expect(key.textContent).toContain(S.m84.keyAfter);
    expect(read("../src/ui/notch.css")).not.toMatch(/\.ip-key\[data-tight\] > span:not\(\.ui-keys\) \{ display: none; \}/);
  });

  test("M84: the latest review is a small card with its proof result; Undo only opens Home on its confirm step", async () => {
    const done = run([
      { type: "checkpoint.created", project: PROJECT, agent: "a", checkpoint: "cp_9", label: "Before: make the signup button work", files: 3, skipped: [] }, { type: "agent.state", agent: "a", state: "working" },
      { type: "receipt", agent: "a", checkpoint: "cp_9", changed: [{ file: "join.js", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.05, ended: "done" }, { type: "agent.state", agent: "a", state: "idle" },
      { type: "tasks.list", project: PROJECT, tasks: [{ id: 1, label: "Before: make the signup button work", status: "done", usd: 0.05, startedAt: new Date(Date.now() - 600_000).toISOString(), endedAt: new Date(Date.now() - 300_000).toISOString(), checkpoint: "cp_9", changed: 1, proof: "passed" }] },
    ], atRest());
    // Its fresh result card was kept (Keep folds it back), so the panel is back to its quick rows.
    const kept = islandJobs(done).find((j) => j.key.startsWith("done:"))?.key ?? null;
    await renderPage(<IslandPanel m={done} line="" shown kept={kept} />);
    const card = screen.getByRole("group", { name: new RegExp(S.m84.reviewLabel) });
    expect(card.textContent).toContain(S.m84.proof.passed);
    await press(S.m84.undoSay("make the signup button work"));
    expect(goes()).toEqual([{ then: { do: "undo" } }]);
    // Nothing was undone from the notch: no undo command reached the engine.
    expect(app.sentTypes().filter((t) => t !== "donesignal.show")).toEqual([]);
  });
});
