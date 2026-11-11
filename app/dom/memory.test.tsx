// M59: Memory, rendered and clicked through: Forget takes a note off at once with an Undo that sends nothing, a second
// Forget sends the one waiting, and Export asks the engine for the notes and hands them to the shell to save.
import { describe, expect, test } from "bun:test";
import { PROJECT, app, press, renderHome, runner, screen, settle } from "./render.tsx";

const A = { id: "m_1a2b3c4d", text: "Uses React and Vite", source: "package.json", date: "2026-10-09" };
const Bn = { id: "m_5e6f7a8b", text: "Deploys to Vercel", source: "vercel.json", date: "2026-10-10" };
const state = { type: "memory.state", project: PROJECT, paused: false, projectLines: [A, Bn], profileLines: [], problems: [] };
const forgets = () => app.sent().filter((c) => c.type === "memory.forget");

async function openMemory() {
  await renderHome();
  await press("Memory");
  await runner(state);
  expect(screen.getAllByText(A.text).length).toBeGreaterThan(0);
}

describe("Memory", () => {
  test("Forget takes the note off at once and Undo puts it back, with nothing sent", async () => {
    await openMemory();
    await press(`Forget: ${A.text}`);
    expect(screen.queryAllByText(A.text).length).toBe(0);
    expect(screen.getByText(`Forgotten: ${A.text}`)).toBeTruthy();
    await press("Undo");
    expect(screen.getAllByText(A.text).length).toBeGreaterThan(0);
    expect(forgets()).toEqual([]);
  });

  test("a second Forget sends the one waiting, for its own line and scope", async () => {
    await openMemory();
    await press(`Forget: ${A.text}`);
    expect(forgets()).toEqual([]);
    await press(`Forget: ${Bn.text}`);
    expect(forgets()).toEqual([expect.objectContaining({ project: PROJECT, scope: "project", line: A.id })]);
  });

  test("leaving the page sends a Forget still waiting, so it is never lost", async () => {
    await openMemory();
    await press(`Forget: ${A.text}`);
    await press("Now");
    expect(forgets()).toEqual([expect.objectContaining({ line: A.id })]);
  });

  test("Export asks the engine for the notes, then the shell saves them, and the page says where", async () => {
    await openMemory();
    app.answer("save_notes", "~/Downloads/shop notes.md");
    await press("Export");
    expect(app.sent().filter((c) => c.type === "memory.export")).toEqual([expect.objectContaining({ project: PROJECT })]);
    expect(app.invoked("save_notes")).toEqual([]);
    await runner({ type: "memory.exported", project: PROJECT, text: "# Everything kept about this project" });
    await settle();
    const saved = app.invoked("save_notes");
    expect(saved.length).toBe(1);
    expect(saved[0].args?.text).toBe("# Everything kept about this project");
    expect(screen.getAllByRole("status").some((s) => (s.textContent ?? "").includes("shop notes.md"))).toBe(true);
  });

  test("an export for another project is never saved", async () => {
    await openMemory();
    await press("Export");
    await runner({ type: "memory.exported", project: "/Users/me/other", text: "# Other" });
    expect(app.invoked("save_notes")).toEqual([]);
  });
});
