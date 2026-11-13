// M59: the hover panel on the notch (islandPanel.tsx), rendered and clicked through: each quick action opens Home at its
// own place through the shell (island_go), never starts work by itself, and a running job's row has Stop.
import { describe, expect, test } from "bun:test";
import { IslandPanel } from "../src/islandPanel.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { S } from "../src/strings.ts";
import { PROJECT, app, buttons, ev, press, renderPage, runner, screen } from "./render.tsx";

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
    // Opening Home is all a press does: nothing is sent to the engine from the panel.
    expect(app.sent()).toEqual([]);
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
    expect(app.sent()).toEqual([expect.objectContaining({ type: "agent.interrupt", agent: "builder-1" })]);
  });

  test("a hidden panel takes no keyboard: every button is out of the tab order", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown={false} />);
    for (const b of document.querySelectorAll(".island-panel button")) expect(b.getAttribute("tabindex")).toBe("-1");
  });

  test("M83: the facts row says the AI tools Home heard about and the changes waiting, and each press only opens Home", async () => {
    const asked = run([{ type: "review.batch", project: PROJECT, batch: "rv_4f2a9c01de", files: [{ file: "src/a.ts", kind: "modified" }, { file: "src/b.ts", kind: "modified" }], count: 2, capped: false, secretFiles: [], auto: false }, { type: "approval.request", agent: "builder-1", id: "ap_1", tool: "Bash", input: { command: "npm install" }, risk: "install", title: "Install packages" }], atRest());
    await renderPage(<IslandPanel m={asked} line="" shown />);
    const row = screen.getByRole("navigation", { name: S.notch.facts.label });
    expect(row).toBeTruthy();
    // The panel never asks the engine for the tools; it hears Home's answer.
    expect(app.sent()).toEqual([]);
    await runner({ type: "donesignal.state", project: PROJECT, tools: [{ tool: "claude", hook: "done", on: true, file: "x", adds: "y", creates: false }, { tool: "claude", hook: "guard", on: true, file: "x", adds: "y", creates: false }, { tool: "claude", hook: "waiting", on: true, file: "x", adds: "y", creates: false }] });
    expect(buttons()).toContain(S.notch.facts.opens("2 files changed"));
    expect(buttons()).toContain(S.notch.facts.opens("Claude Code connected"));
    await press(S.notch.facts.opens("2 files changed"));
    await press(S.notch.facts.opens("Claude Code connected"));
    expect(goes()).toEqual([{ then: { do: "review" } }, { then: { set: "fixing.tools" } }]);
    expect(app.sent()).toEqual([]);
  });
});
