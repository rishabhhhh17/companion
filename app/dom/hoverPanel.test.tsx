// M59: the hover panel on the notch (islandPanel.tsx), rendered and clicked through: each action opens Home at its own place
// through the shell (island_go), never starts work by itself, and a running job has Stop.
// M93 (changed on purpose, the founder, 14 Nov 2026: "it's too much for just a notch. It just needs to be like 'Hey
// Rishabh' and some CTA"): the panel is a greeting, at most one short line, ONE action and a quiet Open Home. The M84 rows
// (the AI tools, the latest review, the next useful thing, the key hint) left it for Home; the tests that held them now
// hold that they are gone, that the panel sends nothing on opening, and where each one is in Home.
// M96 (changed on purpose, the founder, 15 Nov 2026: "just see how HeyClicky does it", and "yeah" to the mock): one row, the
// face and a lowercase hello as one button that opens the small chat (island_chat), and one pill with the action's own
// words; no line row and no Open Home. Each test below holds the M96 equivalent of what it held.
import { describe, expect, test } from "bun:test";
import { IslandPanel } from "../src/islandPanel.tsx";
import { islandJobs } from "../src/islandPanel.ts";
import { initial, reduce, type Model } from "../src/model.ts";
import { S } from "../src/strings.ts";
import { PROJECT, act, app, ev, press, renderPage, screen, settle } from "./render.tsx";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { COPY_BASE } from "../src/practice.ts";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);
const atRest = () => run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }]);
const goes = () => app.invoked("island_go").map((c) => c.args);
const panelButtons = () => [...document.querySelectorAll(".island-panel button")].map((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim());
const hello = (greet = "hey there") => S.m96.openChat(greet);
const rowSays = () => document.querySelector(".nb-row")?.getAttribute("aria-label") ?? "";
const waits = (words: string) => `${words}. ${S.m96.waits}`;

describe("the hover panel's one action", () => {
  test("at rest with a project never checked: hey there, no line, Check my project, and the hello opens the small chat", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown />);
    expect(screen.getByRole("group", { name: "hey there." })).toBeTruthy();
    expect(document.querySelector(".ip-line")).toBeNull();
    // Feel round 3 (19 Nov 2026), changed on purpose: the founder's HeyClicky reference (18 Nov 2026) puts a small round Open Home beside the pill.
    expect(panelButtons()).toEqual([hello(), S.m96.act.check, S.m93.openHome]);
    await press(S.m96.act.check);
    await press(hello());
    expect(goes()).toEqual([{ then: { do: "find" } }]);
    expect(app.invoked("island_chat").length).toBe(1);
    // Opening Home is all a press does. M93 (changed on purpose): the panel sends nothing at all, not even M84's read only
    // ask for the AI tools (Home's side list asks for them).
    expect(app.sentTypes()).toEqual([]);
  });

  test("changes waiting: the line says how many, and Review changes opens Home on the review", async () => {
    const m = run([{ type: "review.batch", project: PROJECT, batch: "rv_4f2a9c01de", files: [{ file: "src/a.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false }], atRest());
    await renderPage(<IslandPanel m={m} line="" shown />);
    expect(rowSays()).toContain(S.m93.line.changes(1));
    expect(document.querySelector(".nb-pill")?.textContent).toBe(S.m96.changes(1));
    expect(document.querySelector(".nb-pill .nb-dot")).toBeTruthy();
    await press(waits(S.m96.changes(1)));
    expect(goes()).toEqual([{ then: { do: "review" } }]);
  });

  test("the greeting uses the first word of the typed name; Settings and Open left the head (Open Home is the quiet second action)", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown />, { settings: { "you.name": "Rishabh Kapadia" } });
    // The settings are read once per page: read them again with this answer.
    await act(async () => { _resetForTests(); startSettings(); });
    await settle();
    expect(document.querySelector(".nb-greet")?.textContent).toBe("hey rishabh");
    expect(panelButtons()).not.toContain("Settings");
    // Feel round 3 (19 Nov 2026), changed on purpose: the founder's HeyClicky reference (18 Nov 2026) puts a small round Open Home beside the pill, as a round icon button after the pill, never in the head.
    expect(panelButtons().at(-1)).toBe(S.m93.openHome);
    expect(document.querySelector(".nb-hi")?.textContent ?? "").not.toContain(S.m93.openHome);
    await press(hello("hey rishabh"));
    expect(goes()).toEqual([]);
    expect(app.invoked("island_chat").length).toBe(1);
  });

  test("a running job: its name is the line, Stop is the one action and sends one interrupt", async () => {
    const m = run([{ type: "agent.state", agent: "builder-1", state: "working" }, { type: "checkpoint.created", project: PROJECT, agent: "builder-1", checkpoint: "cp_0042", label: "Before: make the button blue", files: 12, skipped: [] }], atRest());
    await renderPage(<IslandPanel m={m} line="" shown />);
    expect(rowSays()).toMatch(/make the button blue/i);
    expect(document.querySelectorAll(".nb-pill").length).toBe(1);
    await press(/^Stop/);
    expect(app.sent()).toEqual([expect.objectContaining({ type: "agent.interrupt", agent: "builder-1" })]);
    expect(goes()).toEqual([]);
  });

  test("a hidden panel takes no keyboard: every button is out of the tab order", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown={false} />);
    for (const b of document.querySelectorAll(".island-panel button")) expect(b.getAttribute("tabindex")).toBe("-1");
  });

  // M84 put one small card per AI tool in the panel; M93 moved them to Home's side list (m84Home.test.tsx).
  test("M84, changed by M93: Claude Code waiting on you is the line, and the one action opens Home on Now; no tool cards, no ask", async () => {
    const waiting = run([{ type: "hook.waiting", project: PROJECT, waiting: true, message: "Claude needs your permission" }], atRest());
    const r = await renderPage(<IslandPanel m={waiting} line="" shown />);
    expect(rowSays()).toContain(S.m93.line.claude);
    expect(screen.queryByRole("navigation", { name: S.m84.toolsLabel })).toBeNull();
    await press(waits(S.m96.act.claude));
    expect(goes()).toEqual([{}]);
    r.rerender(<IslandPanel m={waiting} line="" shown={false} />);
    r.rerender(<IslandPanel m={waiting} line="" shown />);
    expect(app.sentTypes()).toEqual([]);
  });

  test("M84, changed by M93: no Connect your AI tools in the panel (Home's side list and Now keep it); hidden, the panel asks nothing", async () => {
    const r = await renderPage(<IslandPanel m={atRest()} line="" shown={false} />);
    expect(app.sent()).toEqual([]);
    r.rerender(<IslandPanel m={atRest()} line="" shown />);
    expect(panelButtons()).not.toContain(S.m84.connect);
    expect(app.sent()).toEqual([]);
    expect(read("../src/card.tsx")).toContain("<AiToolsNowRow");
  });

  test("M84, changed by M93 and M96: a real project never checked: one row with something in it, no practice card (Learn keeps it)", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown />);
    const panel = document.querySelector(".island-panel")!;
    expect(panel.children.length).toBe(1);
    expect(panel.querySelector(".ip-card")).toBeNull();
    expect(panelButtons()).not.toContain(S.m84.next.practice);
    for (const row of panel.children) expect((row.textContent ?? "").trim().length, row.className).toBeGreaterThan(0);
  });

  test("M84, changed by M93: the founder's case, a practice copy never checked: the one action is Check my project", async () => {
    const copy = `/Users/me/${COPY_BASE} signup page`;
    const m = run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: copy }]);
    await renderPage(<IslandPanel m={m} line="" shown />);
    expect(panelButtons()).not.toContain(S.m84.next.practice);
    await press(S.m96.act.check);
    expect(goes()).toEqual([{ then: { do: "find" } }]);
  });

  test("M84, changed by M93: an engine error never makes the panel ask anything", async () => {
    const r = await renderPage(<IslandPanel m={atRest()} line="" shown />);
    r.rerender(<IslandPanel m={atRest()} line="" shown={false} />);
    r.rerender(<IslandPanel m={atRest()} line="" shown />);
    await settle();
    expect(app.sentTypes()).toEqual([]);
  });

  test("M84, changed by M93: the engine stopped says so, with its one action; back again, nothing is asked", async () => {
    const r = await renderPage(<IslandPanel m={{ ...atRest(), runnerUp: false }} line="" shown />);
    expect(rowSays()).toContain(S.m93.line.off);
    await press(S.m96.act.seeWhy);
    expect(goes()).toEqual([{}]);
    r.rerender(<IslandPanel m={atRest()} line="" shown />);
    await settle();
    expect(app.sentTypes()).toEqual([]);
  });

  test("M84, changed by M93: nothing waits on an answer, so nothing says 'One moment'", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown />);
    await settle(3100);
    expect(document.querySelector(".island-panel")!.textContent).not.toContain(S.m84.looking);
    expect(document.querySelector(".island-panel")!.textContent).not.toContain(S.m84.unknown);
  });

  test("M84, changed by M93: no key hint in the panel at all, never bare keycaps (the key is at the foot of Home's ask box)", async () => {
    const m = run([{ type: "review.batch", project: PROJECT, batch: "rv_4f2a9c01de", files: [{ file: "src/a.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false }], atRest());
    await renderPage(<IslandPanel m={m} line="" shown />);
    expect(document.querySelectorAll(".nb-pill").length).toBe(1);
    expect(document.querySelector(".ip-key")).toBeNull();
    expect(read("../src/ui/notch.css")).not.toMatch(/\.ip-key\[data-tight\] > span:not\(\.ui-keys\) \{ display: none; \}/);
    expect(read("../src/card.tsx")).toContain("barKeyChord(keys)");
  });

  test("M84, changed by M93: after a kept result the panel shows no review card; Undo stays in Home, nothing is undone from the notch", async () => {
    const done = run([
      { type: "checkpoint.created", project: PROJECT, agent: "a", checkpoint: "cp_9", label: "Before: make the signup button work", files: 3, skipped: [] }, { type: "agent.state", agent: "a", state: "working" },
      { type: "receipt", agent: "a", checkpoint: "cp_9", changed: [{ file: "join.js", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.05, ended: "done" }, { type: "agent.state", agent: "a", state: "idle" },
      { type: "tasks.list", project: PROJECT, tasks: [{ id: 1, label: "Before: make the signup button work", status: "done", usd: 0.05, startedAt: new Date(Date.now() - 600_000).toISOString(), endedAt: new Date(Date.now() - 300_000).toISOString(), checkpoint: "cp_9", changed: 1, proof: "passed" }] },
    ], atRest());
    const kept = islandJobs(done).find((j) => j.key.startsWith("done:"))?.key ?? null;
    await renderPage(<IslandPanel m={done} line="" shown kept={kept} />);
    expect(screen.queryByRole("group", { name: new RegExp(S.m84.reviewLabel) })).toBeNull();
    // M96 (changed on purpose): with nothing waiting and the last fix undoable, the pill offers Undo last change, which
    // only asks Home's own Undo question (arrival.rs "undo").
    // Feel round 3 (19 Nov 2026), changed on purpose: the founder's HeyClicky reference (18 Nov 2026) puts a small round Open Home beside the pill.
    expect(panelButtons()).toEqual([hello(), S.m96.act.undo, S.m93.openHome]);
    await press(S.m96.act.undo);
    expect(goes()).toEqual([{ then: { do: "undo" } }]);
    expect(app.sentTypes()).toEqual([]);
  });
});
