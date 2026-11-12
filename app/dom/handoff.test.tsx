// M82, Part 2: hand Squibby the job, clicked through on Home. Have my AI do it writes a clear prompt (through the shell,
// for the project open in Home), shows it to change, then: Claude Code runs it through agent.start; another tool gets it by
// Put it in (the shell's paste, on the press only) or Copy, and the card waits for it to finish until the review starts.
// A missing chat box copies and offers Show me where to paste; Stop everything ends the wait. Nothing else reaches the engine.
import { describe, expect, test } from "bun:test";
import { PROJECT, act, app, fireEvent, hasButton, press, renderHome, runner, screen, settle, type } from "./render.tsx";

const CURSOR = "com.todesktop.230313mzl4w4u92";
const PROMPT = "Make the site header blue. Keep the logo as it is.";
const tasks = () => app.sent().filter((c) => c.type === "agent.start" || c.type === "agent.send" || c.type === "review.fix");
const prompts = () => app.invoked("handoff_prompt").map((c) => c.args as { tool: string; text: string; req: string });

async function handOff(o: { last?: string; found?: Record<string, string[]>; put?: unknown } = {}) {
  await renderHome({ answers: { ai_tools_find: o.found ?? { apps: [CURSOR], programs: ["claude"], folders: [] }, handoff_put_in: o.put ?? "typed" } });
  if (o.last) localStorage.setItem(`companion.handoffTool:${PROJECT}`, o.last);
  await type(screen.getAllByRole("textbox")[0]!, "make the header blue");
  await press("Have my AI do it");
  expect(screen.getByText("Writing a clear prompt")).toBeTruthy();
  const req = prompts()[0]!.req;
  await runner({ type: "assist.prompt.done", req, text: PROMPT, diff: [["=", "Make "], ["+", "the site "], ["=", "header blue"]], usdEstimate: 0, handback: "paste" });
  return req;
}

describe("Have my AI do it", () => {
  test("Claude Code: the clear prompt is shown to change, and Run it starts the usual task with it", async () => {
    await handOff();
    expect(prompts()).toEqual([expect.objectContaining({ tool: "claude", text: "make the header blue" })]);
    expect(screen.getByText("Ready for Claude Code")).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "The prompt" }) as HTMLTextAreaElement;
    expect(box.value).toBe(PROMPT);
    expect(tasks()).toEqual([]);
    await act(async () => { fireEvent.change(box, { target: { value: "Make the header dark blue." } }); await new Promise((r) => setTimeout(r, 20)); });
    await press("Run it");
    expect(tasks().map((c) => [c.type, c.project, c.prompt])).toEqual([["agent.start", PROJECT, "Make the header dark blue."]]);
    expect(app.invoked("handoff_put_in")).toEqual([]);
  });

  test("another tool: Put it in on the press, then waiting for it, then the review; never a task for the engine", async () => {
    await handOff({ last: "cursor" });
    expect(prompts()[0]!.tool).toBe("cursor");
    expect(screen.getByText("Ready for Cursor")).toBeTruthy();
    expect(app.invoked("handoff_put_in")).toEqual([]);
    await press("Put it in Cursor");
    expect(app.invoked("handoff_put_in").map((c) => c.args)).toEqual([expect.objectContaining({ tool: "cursor", text: PROMPT })]);
    await settle(40);
    expect(screen.getByText("Waiting for Cursor to finish")).toBeTruthy();
    expect(screen.getByText(/press Return there to send it/)).toBeTruthy();
    // Not connected here: it says it waits for the files to be quiet.
    await runner({ type: "donesignal.state", project: PROJECT, tools: [{ tool: "cursor", hook: "done", on: false, file: ".cursor/hooks.json", adds: "{}", creates: true }] });
    expect(screen.getByText(/is not connected here/)).toBeTruthy();
    await runner({ type: "donesignal.state", project: PROJECT, tools: [{ tool: "cursor", hook: "done", on: true, file: ".cursor/hooks.json", adds: "{}", creates: false }] });
    expect(screen.getByText(/the moment Cursor says it is done/)).toBeTruthy();
    await runner({ type: "review.batch", project: PROJECT, batch: "b1", files: [], count: 1, capped: false, secretFiles: [], auto: true });
    expect(screen.getByText(/Cursor finished/)).toBeTruthy();
    expect(tasks()).toEqual([]);
  });

  test("a chat box that cannot be found: the prompt is copied, it says so, and Show me where to paste is offered", async () => {
    await handOff({ last: "cursor", put: "noBox" });
    await press("Put it in Cursor");
    await settle(40);
    expect(screen.getByText(/could not find Cursor's chat box, so the prompt is copied/)).toBeTruthy();
    await press("Show me where to paste");
    expect(app.invoked("point_paste").length).toBe(1);
    expect(tasks()).toEqual([]);
  });

  test("Copy copies the prompt and waits for the tool; a tool with no app on this Mac offers Copy only", async () => {
    await handOff({ last: "gemini", found: { apps: [], programs: ["gemini"], folders: [] } });
    expect(screen.getByText("Ready for Gemini CLI")).toBeTruthy();
    expect(hasButton("Put it in Gemini CLI")).toBe(false);
    await press("Copy");
    expect(app.invoked("copy_text").map((c) => c.args)).toEqual([{ text: PROMPT }]);
    expect(screen.getByText("Waiting for Gemini CLI to finish")).toBeTruthy();
    expect(tasks()).toEqual([]);
  });

  test("Stop everything ends the wait", async () => {
    await handOff({ last: "cursor" });
    await press("Copy");
    expect(screen.getByText("Waiting for Cursor to finish")).toBeTruthy();
    await runner({ type: "app.stop_everything" });
    expect(screen.getByText("Stopped waiting. Nothing else was done.")).toBeTruthy();
    await runner({ type: "review.batch", project: PROJECT, batch: "b1", files: [], count: 1, capped: false, secretFiles: [], auto: true });
    expect(screen.queryByText(/Cursor finished/)).toBeNull();
  });

  test("no clearer prompt: the person's own words, said so", async () => {
    await renderHome({ answers: { ai_tools_find: { apps: [], programs: [], folders: [] } } });
    app.refuse("handoff_prompt", "That is switched off in Settings.");
    await type(screen.getAllByRole("textbox")[0]!, "make the header blue");
    await press("Have my AI do it");
    await settle(40);
    expect((screen.getByRole("textbox", { name: "The prompt" }) as HTMLTextAreaElement).value).toBe("make the header blue");
    expect(screen.getByText(/These are your own words/)).toBeTruthy();
  });
});
