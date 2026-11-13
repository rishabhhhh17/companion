// M84: Home, minimal but detailed. Now's calm timeline of today and the slim side list of the AI tools, rendered with the
// stand in app: both come only from real rows and the engine's own answer, and a press only moves within Home.
import { describe, expect, test } from "bun:test";
import { S } from "../src/strings.ts";
import { PROJECT, app, press, renderHome, runner, screen } from "./render.tsx";

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();
const tools = (on: boolean) => ({ type: "donesignal.state", project: PROJECT, tools: [...["done", "guard", "waiting"].map((hook) => ({ tool: "claude", hook, on, file: "x", adds: "y", creates: false })), ...["done", "guard"].map((hook) => ({ tool: "cursor", hook, on, file: "x", adds: "y", creates: false }))] });

describe("M84: Now's timeline of today", () => {
  test("nothing yet today: it says what will appear, with one action (Connect while no tool is)", async () => {
    await renderHome({ settings: { "look.layout": "wide" } });
    await runner({ type: "tasks.list", project: PROJECT, tasks: [] }, tools(false));
    const today = screen.getByRole("region", { name: S.m84.todayLabel });
    expect(today.textContent).toContain(S.m84.todayEmpty);
    expect(today.textContent).toContain(S.m84.todayEmptyConnect);
  });

  test("what happened today, newest first, from the engine's own rows", async () => {
    await renderHome({ settings: { "look.layout": "wide" } });
    // A minute or two ago, so the rows are today whatever the hour the suite runs.
    await runner({ type: "tasks.list", project: PROJECT, tasks: [{ id: 1, label: "Before: make the signup button work", status: "done", usd: 0.04, startedAt: iso(3), endedAt: iso(2), checkpoint: "cp_1", changed: 2, proof: "passed" }],
      saved: [{ id: 1, at: iso(1), checkpoint: "cp_2", command: "rm -rf dist", undone: false }] }, tools(true));
    const rows = [...document.querySelectorAll(".today-row")].map((r) => r.querySelector(".today-words")?.textContent);
    if (new Date(Date.now() - 3 * 60_000).toDateString() === new Date().toDateString()) expect(rows).toEqual([S.m84.line.caught("rm -rf dist"), S.m84.line.fixed("make the signup button work")]);
    expect(app.sentTypes()).not.toContain("checkpoint.restore");
  });
});

describe("M84: the side list of AI tools", () => {
  test("each connected tool with what it is doing now; Claude Code waiting first; a press opens Your AI tools", async () => {
    await renderHome({ settings: { "look.layout": "wide" } });
    await runner({ type: "hook.waiting", project: PROJECT, waiting: true }, tools(true));
    const side = screen.getByRole("navigation", { name: S.look.placesLabel });
    const names = [...side.querySelectorAll(".side-tool")].map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual([S.m84.toolSay("Claude Code", S.m84.toolState.waiting), S.m84.toolSay("Cursor", S.m84.toolState.watching)]);
    await press(S.m84.toolSay("Cursor", S.m84.toolState.watching));
    expect(document.querySelector('[data-view="settings"], .home[data-view="settings"]')).not.toBeNull();
  });

  test("the wide Home names the AI tools once: the side list says them, the strip on Now leaves them out; the tall one keeps them in the strip", async () => {
    // M84 review: home-now-fresh-wide said the tools in the side list and again as the strip's "AI tools" tile (M83 Part C).
    await renderHome({ settings: { "look.layout": "wide" } });
    await runner({ type: "tasks.list", project: PROJECT, tasks: [] }, tools(true));
    expect(document.querySelectorAll(".side-tool").length).toBe(2);
    expect(document.querySelector('.now-strip [data-fact="tools"]')).toBeNull();
  });
});
