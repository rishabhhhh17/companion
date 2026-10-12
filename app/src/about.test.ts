// About this project on the card: the report, the install the person started, and opening from a link.
import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { inspectProject, installPackages } from "./commands.ts";
import { initial, reduce, type Model } from "./model.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const report = ev({ type: "project.report", project: "/p", origin: "lovable", about: "A Lovable project: Vite + React.", stack: "Vite + React", needsInstall: true, installCommand: "npm install", start: "npm run dev", missing: ["VITE_API_URL"], missingCount: 1, example: ".env.example", notes: [] });

describe("about this project", () => {
  test("the commands are valid protocol", () => {
    for (const c of [inspectProject("/p"), installPackages("/p")]) expect(parseCommand(serialize(c)).ok).toBe(true);
  });
  test("the report is kept for its project", () => {
    expect(run([report]).about).toMatchObject({ project: "/p", needsInstall: true, missing: ["VITE_API_URL"], example: ".env.example" });
  });
  test("an install shows its progress and its end", () => {
    const m = run([report, ev({ type: "project.install", project: "/p", stage: "installing", detail: "Installing" }), ev({ type: "project.install", project: "/p", stage: "done", detail: "Installed." })]);
    expect(m.install).toEqual({ project: "/p", stage: "done", detail: "Installed." });
  });
  test("changing project or closing clears it", () => {
    expect(run([report, ev({ type: "ui.projectChanged" })]).about).toBeNull();
    expect(run([report, ev({ type: "ui.aboutClosed" })]).about).toBeNull();
  });
  test("a link that could not be copied says why; a good one clears the note", () => {
    const bad = run([ev({ type: "project.cloned", url: "u", ok: false, detail: "It may be private." })]);
    expect(bad.cloneNote).toBe("It may be private.");
    expect(run([ev({ type: "project.cloned", url: "u", ok: true, path: "/x", detail: "Copied." })], bad).cloneNote).toBeNull();
  });
});
