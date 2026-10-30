import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { proofChips } from "./proofChips.ts";
import { initial, type Model, type ProofLine } from "./model.ts";
import { S } from "./strings.ts";

const line = (rung: string, status: ProofLine["status"]): ProofLine => ({ rung, label: `the ${rung} step`, status, detail: "" });
const withProof = (steps: ProofLine[], changed = 1): Model => ({ ...initial(), task: { agent: "a", label: "x", lines: [], costUsd: 0, proof: { steps, tries: 1, verdict: "passed" } }, receipt: { checkpoint: "cp", changed: Array.from({ length: changed }, (_, i) => ({ file: `f${i}`, kind: "modified" })), commands: 0, notUndoable: [], usdEstimate: 0.03 } });

describe("proof you can see under a receipt", () => {
  test("one chip per check that ran, in order, green or red, in short plain words", () => {
    const c = proofChips(withProof([line("checks", "passed"), line("tests", "passed"), line("browser", "failed")]));
    expect(c.map((x) => [x.word, x.ok])).toEqual([[S.proofChip.checks, true], [S.proofChip.tests, true], [S.proofChip.browser, false]]);
  });
  test("a check that was skipped or never finished is never shown as proof", () => {
    expect(proofChips(withProof([line("tests", "skipped"), line("browser", "running")]))).toEqual([]);
  });
  test("nothing when nothing changed, or there is no receipt or proof", () => {
    expect(proofChips(withProof([line("tests", "passed")], 0))).toEqual([]);
    expect(proofChips(initial())).toEqual([]);
  });
  test("every rung the engine names has short words, with no machine words", () => {
    const ladder = readFileSync(new URL("../../runner/src/proof/ladder.ts", import.meta.url), "utf8");
    const at = ladder.indexOf("= {", ladder.indexOf("const LABELS"));
    const rungs = [...ladder.slice(at, ladder.indexOf("};", at)).matchAll(/(\w+):/g)].map((x) => x[1]);
    expect(rungs.length).toBeGreaterThanOrEqual(6);
    for (const r of rungs) { const w = (S.proofChip as Record<string, string>)[r]; expect(w, r).toBeTruthy(); expect(w.length).toBeLessThan(24); }
  });
  test("the receipt shows them, each with an icon as well as its colour", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("<ProofChips m={m} />");
    const view = readFileSync(new URL("./proofChipsView.tsx", import.meta.url), "utf8");
    expect(view).toContain('<Icon name={c.ok ? "tick" : "cross"}');
  });
});

describe("M45: chips are proof for the files as checked", () => {
  const checked = withProof([line("tests", "passed"), line("browser", "passed")]);
  test("no chips after Undo", () => {
    expect(proofChips(checked).length).toBe(2);
    expect(proofChips({ ...checked, receipt: { ...checked.receipt!, undone: true } })).toEqual([]);
  });
  test("no chips after Bring back", () => {
    expect(proofChips({ ...checked, receipt: { ...checked.receipt!, undone: true, back: true } })).toEqual([]);
  });
});
