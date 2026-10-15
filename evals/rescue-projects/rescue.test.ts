// Rescue projects, a free eval of the hero: fifteen small projects, each broken in a way beginners meet, with the true file
// and line known by construction. For each, the project's own check is run for real, and Companion's locator must turn
// its real output into that exact place. No model is involved: this measures the part that decides where the ring goes.
// Run: cd evals/rescue-projects && bun test
import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locateProblem } from "../../runner/src/proof/locate.ts";

const casesDir = join(import.meta.dir, "cases");
const have = (bin: string) => bin.startsWith("/") ? existsSync(bin) : Bun.spawnSync(["which", bin]).exitCode === 0;
// "$TSC" means the TypeScript checker that ships with the app's own tools (so the eval needs nothing installed globally).
const TSC = join(import.meta.dir, "../../app/node_modules/.bin/tsc");
const resolve = (cmd: string[]) => cmd.map((c) => (c === "$TSC" ? TSC : c));

describe("the hero finds the real failing place in fifteen kinds of broken project", () => {
  for (const name of readdirSync(casesDir).sort()) {
    const exp = JSON.parse(readFileSync(join(casesDir, name, "expected.json"), "utf8")) as { cmd: string[]; file: string; line: number; about: string };
    const cmd = resolve(exp.cmd);
    const skip = !have(cmd[0]);
    (skip ? test.skip : test)(name, () => {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), "companion-rescue-")));
      try {
        cpSync(join(casesDir, name), dir, { recursive: true });
        const r = Bun.spawnSync(cmd, { cwd: dir, env: { PATH: process.env.PATH ?? "", HOME: dir, NO_COLOR: "1" } });
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
    }, 30_000);   // each case starts a real program; a busy Mac can take several seconds
  }
});
