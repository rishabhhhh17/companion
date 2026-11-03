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
    expect(c.map((x) => [x.word, x.ok])).toEqual([[S.proofChip.checks, true], [S.proofChip.tests, true], [S.proofChipFailed.browser, false]]);
  });
  test("a failed check says it failed in words, never its passed words (the icon is hidden from VoiceOver)", () => {
    const rungs = Object.keys(S.proofChip);
    const c = proofChips(withProof(rungs.map((r) => line(r, "failed"))));
    expect(c.length).toBe(rungs.length);
    for (const x of c) {
      expect(x.ok).toBe(false);
      expect(x.word, x.rung).toBe(S.proofChipFailed[x.rung]);
      // Never its passed words, and always a word that says it went wrong.
      expect(x.word, x.rung).not.toBe(S.proofChip[x.rung]);
      if (x.rung !== "review") expect(x.word.toLowerCase(), x.rung).not.toContain(S.proofChip[x.rung].toLowerCase());
      expect(x.word, x.rung).toMatch(/fail|broken|not|problem/i);
    }
    expect(S.proofChipFailed.tests).toBe("Tests fail");
    expect(S.proofChipFailed.browser).toBe("Broken in a browser");
    // A rung with no words of its own still never reads as a pass when it failed.
    const odd = proofChips(withProof([line("newrung", "failed")]));
    expect(odd[0].word).toBe(S.ui.failedStep("the newrung step"));
  });
  test("the island panel draws the same chips, so it says the same words", () => {
    const island = readFileSync(new URL("./islandPanel.tsx", import.meta.url), "utf8");
    expect(island).toContain("<ProofChips m={m} />");
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
    for (const r of rungs) {
      const w = (S.proofChip as Record<string, string>)[r]; expect(w, r).toBeTruthy(); expect(w.length).toBeLessThan(24);
      const f = (S.proofChipFailed as Record<string, string>)[r]; expect(f, r).toBeTruthy(); expect(f.length).toBeLessThan(32);
    }
  });
  test("the receipt shows them, each with an icon as well as its colour", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("<ProofChips m={m} />");
    const view = readFileSync(new URL("./proofChipsView.tsx", import.meta.url), "utf8");
    // Each is the Proof chip part: a tick for a pass, a cross for a fail (ui/parts.tsx CHIP_ICON), in their colours.
    expect(view).toContain('<ProofChip kind={c.ok ? "pass" : "fail"} label={c.word} />');
    const parts = readFileSync(new URL("./ui/parts.tsx", import.meta.url), "utf8");
    expect(parts).toContain('const CHIP_ICON: Partial<Record<ChipKind, IconName>> = { pass: "tick", fail: "cross"');
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
