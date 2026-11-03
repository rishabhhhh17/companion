// The merge gate (scripts/test-all.sh) runs every free suite AGENTS.md says it runs. Found in the M11 audit (A83): the table
// said "All of the below", but the free Prompt help eval was never run, so a broken scorer still passed the gate.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../../scripts/test-all.sh", import.meta.url), "utf8");
const agents = readFileSync(new URL("../../AGENTS.md", import.meta.url), "utf8");
const runnerPkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };

describe("the merge gate runs the free suites", () => {
  test("every suite AGENTS.md calls part of test-all.sh is in it", () => {
    for (const run of ["(cd runner && bun run typecheck && bun test --timeout 30000)", "(cd evals/rescue-projects && bun test --timeout 30000)", "(cd evals/prompt-help && bun test --timeout 30000)", "(cd app/src-tauri && cargo test)", "(cd app && bun run typecheck && bun test --timeout 30000 ./src)"]) expect(script, run).toContain(run);
    expect(agents).toContain("| Prompt help eval | `cd evals/prompt-help && bun test` (free, no model, no network; part of `test-all.sh`)");
  });
  test("it stops at the first failure", () => {
    expect(script).toMatch(/^set -e$/m);
  });
  // Must fix 5: under load a case past Bun's 5 s default failed at random, and a test that timed out kept running into the
  // next one. Bun ignores a timeout set in bunfig.toml, so the flag on each run is the only way to set it for a whole suite.
  test("every bun test in the gate, and the runner's own test script, has the same 30 second limit", () => {
    const runs = [...script.matchAll(/bun test([^;)&|]*)/g)].map((m) => m[0]);
    expect(runs.length).toBeGreaterThanOrEqual(7);
    for (const r of runs) expect(r, r).toMatch(/^bun test --timeout 30000\b/);
    expect(runnerPkg.scripts.test).toBe("bun test --timeout 30000");
  });
  // Must fix 19: rule 8 never bends, so the lint that checks no permission is asked at launch is part of the gate.
  test("the permission lint runs in the gate", () => {
    expect(script).toContain("sh app/scripts/lint-permissions.sh");
  });
  // Must fix 6: a release needs proof that the gate passed on the very commit it ships, on a tree with nothing uncommitted.
  test("a gate that passes on a clean tree leaves a note of the commit for release.sh, and only then", () => {
    const end = script.slice(script.lastIndexOf("python3 scripts/make-acknowledgements.py --check"));
    expect(end).toContain("scripts/tested-mark.sh write");
    expect(script.indexOf("scripts/tested-mark.sh clear")).toBeGreaterThan(-1);
    expect(script.indexOf("scripts/tested-mark.sh clear")).toBeLessThan(script.indexOf("== runner"));
  });
  // The note itself must be ignored by git, or writing it would leave the tree "uncommitted" and the release check could
  // never pass. Must fix 36: node_modules is ignored with no slash, so a link named node_modules is ignored too.
  test("git ignores the tested note and every node_modules, links included", () => {
    const ignore = readFileSync(new URL("../../.gitignore", import.meta.url), "utf8").split("\n").map((l) => l.trim());
    expect(ignore).toContain(".tested-head");
    expect(ignore).toContain("node_modules");
    expect(ignore).not.toContain("node_modules/");
  });
});
