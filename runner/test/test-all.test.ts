// The merge gate (scripts/test-all.sh) runs every free suite AGENTS.md says it runs. Found in the M11 audit (A83): the table
// said "All of the below", but the free Prompt help eval was never run, so a broken scorer still passed the gate.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../../scripts/test-all.sh", import.meta.url), "utf8");
const agents = readFileSync(new URL("../../AGENTS.md", import.meta.url), "utf8");

describe("the merge gate runs the free suites", () => {
  test("every suite AGENTS.md calls part of test-all.sh is in it", () => {
    for (const run of ["(cd runner && bun run typecheck && bun test)", "(cd evals/rescue-projects && bun test)", "(cd evals/prompt-help && bun test)", "(cd app/src-tauri && cargo test)", "(cd app && bun run typecheck && bun test ./src)"]) expect(script, run).toContain(run);
    expect(agents).toContain("| Prompt help eval | `cd evals/prompt-help && bun test` (free, no model, no network; part of `test-all.sh`)");
  });
  test("it stops at the first failure", () => {
    expect(script).toMatch(/^set -e$/m);
  });
});
