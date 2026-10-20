// The friends' privacy note (docs/alpha/PRIVACY.md) says it is written from what the code does today, feature by feature.
// Found in the M11 audit (A74, A75): it left out Prompt help, the error explainer, Explain, Draw it for me, web pages a task
// opens, Open from a link, the speech model download and package installs during a check, and said nothing leaves the Mac
// for Point at the problem, though it reads the last Vercel deploy. Each flow now has its line; this test keeps them there.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { S } from "./strings.ts";

const note = readFileSync(new URL("../../docs/alpha/PRIVACY.md", import.meta.url), "utf8");
const rows = note.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| When") && !l.startsWith("|---"));
const row = (start: string) => rows.find((r) => r.startsWith(`| ${start}`)) ?? "";

describe("the privacy note names every flow that reads or sends something", () => {
  test("Point at the problem says it asks Vercel for the last deploy, and how to turn that off", () => {
    const f = row("You press **F**");
    expect(f).toContain("Vercel");
    expect(f).toContain(S.set["rescue.readDeployLog"].label);
    expect(f).not.toMatch(/\| Nothing leaves your Mac for this step\. \|$/);
    expect(row("You ask for a task, a fix or a plan")).toContain("Vercel");
  });
  test("Prompt help and the error explainer: what is read, through what, and what goes with it", () => {
    const r = row("You press **R**");
    for (const w of ["Accessibility", "project", "house rules", "remembers", S.set["ph.useProjectInfo"].label, "Claude"]) expect(r, w).toContain(w);
    const e = row("You press **E**");
    for (const w of ["selected", "Accessibility", "Claude"]) expect(e, w).toContain(w);
  });
  test("Explain, Draw it for me, the web, a link, the speech model and package installs each have their line", () => {
    for (const [start, words] of [
      ["A task finishes (Explain", ["changed", "Claude", S.set["explain.mode"].label]],
      ["You press **Draw it**", ["code", "Claude"]],
      ["A task or Research uses the web", ["web", S.set["work.webSearch"].label]],
      ["You open a project **from a link**", ["git", "GitHub"]],
      ["You hold the talk keys for the first time", ["huggingface.co", "Download"]],
      ["A check finds the project's packages missing", ["registry", S.set["check.install"].label]],
    ] as [string, string[]][]) {
      const r = row(start);
      expect(r, start).not.toBe("");
      for (const w of words) expect(r, `${start}: ${w}`).toContain(w);
    }
  });
  test("the setting practice's lesson is said to be words only", () => {
    expect(row("You start a **practice project**")).toContain("never looks at your screen");
  });
});
