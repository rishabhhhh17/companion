// M59: History, rendered and clicked through: a task's row opens Star and Name it (each one checkpoint.mark for its own
// save), and Undo these changes asks first before it restores that save.
import { describe, expect, test } from "bun:test";
import { PROJECT, app, hasButton, press, renderHome, runner, screen, type } from "./render.tsx";

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const tasks = { type: "tasks.list", project: PROJECT, tasks: [
  { id: 3, label: "Add a contact form", status: "done", usd: 0.04, startedAt: iso(120_000), endedAt: iso(60_000), checkpoint: "cp_0001", changed: 2, proof: "passed" },
] };
const marks = () => app.sent().filter((c) => c.type === "checkpoint.mark");

async function openHistory() {
  await renderHome();
  await press("History");
  await runner(tasks);
  expect(screen.getAllByText("Add a contact form").length).toBeGreaterThan(0);
}

describe("History", () => {
  test("a row opens Star and Name it; Star marks this save, pressed once", async () => {
    await openHistory();
    await press("Star, Name it: Add a contact form");
    await press("Star: Add a contact form");
    expect(marks()).toEqual([expect.objectContaining({ project: PROJECT, checkpoint: "cp_0001", star: true })]);
  });

  test("Name it takes a name and saves it with Save name; Cancel sends nothing", async () => {
    await openHistory();
    await press("Star, Name it: Add a contact form");
    await press("Name it: Add a contact form");
    await press("Cancel");
    expect(marks()).toEqual([]);
    await press("Name it: Add a contact form");
    await type(screen.getByRole("textbox", { name: "A name for this save" }), "Form works");
    await press("Save name");
    expect(marks()).toEqual([expect.objectContaining({ checkpoint: "cp_0001", name: "Form works" })]);
  });

  test("Undo these changes asks first, then restores this row's save", async () => {
    await openHistory();
    await press("Undo these changes: Add a contact form");
    expect(hasButton("Yes, undo it")).toBe(true);
    expect(app.sentTypes()).not.toContain("checkpoint.restore");
    await press("Keep the changes");
    expect(app.sentTypes()).not.toContain("checkpoint.restore");
    await press("Undo these changes: Add a contact form");
    await press("Yes, undo it");
    expect(app.sent().filter((c) => c.type === "checkpoint.restore")).toEqual([expect.objectContaining({ project: PROJECT, checkpoint: "cp_0001" })]);
  });
});
