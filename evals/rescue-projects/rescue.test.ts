// Rescue projects, a free eval of the hero: ten small projects, each broken in a way beginners meet, with the true file
// and line known by construction. For each, the project's own check is run for real, and Companion's locator must turn
// its real output into that exact place. No model is involved: this measures the part that decides where the ring goes.
// Run: cd evals/rescue-projects && bun test
import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locateProblem } from "../../runner/src/proof/locate.ts";

const casesDir = join(import.meta.dir, "cases");
const have = (bin: string) => Bun.spawnSync(["which", bin]).exitCode === 0;

describe("the hero finds the real failing place in ten kinds of broken project", () => {
  for (const name of readdirSync(casesDir).sort()) {
    const exp = JSON.parse(readFileSync(join(casesDir, name, "expected.json"), "utf8")) as { cmd: string[]; file: string; line: number; about: string };
    const skip = !have(exp.cmd[0]);
    (skip ? test.skip : test)(name, () => {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), "companion-rescue-")));
      try {
        cpSync(join(casesDir, name), dir, { recursive: true });
        const r = Bun.spawnSync(exp.cmd, { cwd: dir, env: { PATH: process.env.PATH ?? "", HOME: dir, NO_COLOR: "1" } });
        const output = r.stdout.toString() + "\n" + r.stderr.toString();
        expect(r.exitCode, "the project is broken on purpose, so its check must fail").not.toBe(0);
        const p = locateProblem(output, dir, "checks");
        expect(p, `no place found in:\n${output.slice(0, 600)}`).not.toBeNull();
        expect(p!.kind).toBe("line");
        if (p!.kind === "line") {
          expect(p!.file).toBe(exp.file);
          expect(p!.line).toBe(exp.line);
          expect(p!.lineText.length).toBeGreaterThan(0);
          expect(p!.message.toLowerCase()).toContain(exp.about.toLowerCase());
        }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
  }
});
