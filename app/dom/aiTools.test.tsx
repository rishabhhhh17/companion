// M82, Part 1: the Your AI tools screen, rendered and clicked through. The shell is asked once, when the screen opens; only
// the tools found are offered; Connect opens one card with every file and line, and only its yes sends the adds; Disconnect
// removes them; a file that is not plain JSON offers nothing. Also reached from the first run, after Pick a project.
import { describe, expect, test } from "bun:test";
import { AiToolsScreen } from "../src/aiToolsScreen.tsx";
import { PROJECT, app, hasButton, press, renderHome, renderPage, runner, screen } from "./render.tsx";

const CURSOR = "com.todesktop.230313mzl4w4u92";
const row = (tool: string, hook: string, on: boolean, extra: Record<string, unknown> = {}) => ({ tool, hook, on, file: tool === "claude" ? ".claude/settings.local.json" : `.${tool}/hooks.json`, adds: `{ "${tool}-${hook}": true }`, creates: !on, ...extra });
const allOff = (over: Record<string, boolean> = {}, extra: Record<string, Record<string, unknown>> = {}) => [
  ...["done", "guard", "waiting", "start"].map((h) => row("claude", h, !!over[`claude:${h}`], extra[`claude:${h}`])),
  ...["codex", "cursor", "copilot", "antigravity", "gemini", "windsurf"].flatMap((t) => ["done", "guard"].map((h) => row(t, h, !!over[`${t}:${h}`], extra[`${t}:${h}`]))),
];
const adds = () => app.sent().filter((c) => c.type === "donesignal.add");
const removes = () => app.sent().filter((c) => c.type === "donesignal.remove");

async function open(found: Record<string, string[]> = { apps: [CURSOR], programs: ["claude"], folders: [] }) {
  await renderPage(<AiToolsScreen project={PROJECT} />, { answers: { ai_tools_find: found } });
  await runner({ type: "donesignal.state", project: PROJECT, tools: allOff() });
}

describe("Your AI tools", () => {
  test("it looks once as it opens, and offers only the tools on this Mac; the rest are folded under Not on this Mac", async () => {
    await open();
    expect(app.invoked("ai_tools_find").length).toBe(1);
    expect(app.sentTypes()).toEqual(["donesignal.show"]);
    expect(hasButton("Connect Claude Code")).toBe(true);
    expect(hasButton("Connect Cursor")).toBe(true);
    for (const t of ["Codex", "VS Code (Copilot)", "Antigravity", "Gemini CLI", "Windsurf"]) expect(hasButton(`Connect ${t}`)).toBe(false);
    await press(/Not on this Mac/);
    for (const t of ["Codex", "VS Code (Copilot)", "Antigravity", "Gemini CLI", "Windsurf"]) expect(screen.getByText(t)).toBeTruthy();
  });

  test("Connect shows one card with every file and line, and only its yes adds the tool's hooks, in order", async () => {
    await open();
    await press("Connect Cursor");
    expect(screen.getByText("Connect Cursor?")).toBeTruthy();
    expect(screen.getByText('{ "cursor-done": true }')).toBeTruthy();
    expect(screen.getByText('{ "cursor-guard": true }')).toBeTruthy();
    expect(adds()).toEqual([]);
    await press("Not now");
    expect(adds()).toEqual([]);
    await press("Connect Claude Code");
    expect(screen.getByText('{ "claude-waiting": true }')).toBeTruthy();
    expect(screen.queryByText('{ "claude-start": true }')).toBeNull();
    await press("Connect");
    expect(adds().map((c) => [c.tool, c.hook ?? "done", c.confirm, c.project])).toEqual([["claude", "done", true, PROJECT], ["claude", "guard", true, PROJECT], ["claude", "waiting", true, PROJECT]]);
  });

  test("a connected tool says so and offers a quiet Disconnect, which removes its hooks", async () => {
    await open();
    await runner({ type: "donesignal.state", project: PROJECT, tools: allOff({ "cursor:done": true, "cursor:guard": true }) });
    expect(screen.getAllByText(/^Connected\./).length).toBe(1);
    expect(hasButton("Connect Cursor")).toBe(false);
    await press("Disconnect Cursor");
    expect(removes().map((c) => [c.tool, c.hook ?? "done"])).toEqual([["cursor", "done"], ["cursor", "guard"]]);
    expect(adds()).toEqual([]);
  });

  test("a file that is not plain JSON offers neither Connect nor Disconnect, and says why", async () => {
    await open();
    const problem = ".cursor/hooks.json is not in a form Squibby can change safely, so nothing was written. Nothing in it was changed.";
    await runner({ type: "donesignal.state", project: PROJECT, tools: allOff({ "cursor:guard": true }, { "cursor:done": { problem } }) });
    expect(screen.getByText(problem)).toBeTruthy();
    expect(hasButton("Connect Cursor")).toBe(false);
    expect(hasButton("Disconnect Cursor")).toBe(false);
  });

  test("nothing found says so", async () => {
    await open({ apps: [], programs: [], folders: [] });
    expect(screen.getByText("No AI tools were found on this Mac.")).toBeTruthy();
  });
  test("a shell that cannot answer says so, and offers nothing", async () => {
    app.refuse("ai_tools_find", "not_card");
    await renderPage(<AiToolsScreen project={PROJECT} />);
    expect(screen.getByText(/could not look for AI tools just now/)).toBeTruthy();
    expect(hasButton("Connect Claude Code")).toBe(false);
  });
});

describe("from the first run, after Pick a project", () => {
  test("the fold opens the same screen, which only then looks for the tools", async () => {
    await renderHome({ onboarded: false, answers: { ai_tools_find: { apps: [CURSOR], programs: [], folders: [] } } });
    await press("Continue");
    expect(app.invoked("ai_tools_find").length).toBe(0);
    await press("Connect your AI tools (optional)");
    expect(app.invoked("ai_tools_find").length).toBe(1);
    await runner({ type: "donesignal.state", project: PROJECT, tools: allOff() });
    expect(hasButton("Connect Cursor")).toBe(true);
    // Nothing is checked or written by opening it.
    expect(app.sentTypes().filter((t) => t === "problem.find" || t === "donesignal.add")).toEqual([]);
  });
});
