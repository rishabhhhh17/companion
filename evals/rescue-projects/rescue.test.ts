// Rescue projects, a free eval of the hero: fifteen small projects, each broken in a way beginners meet, with the true file
// and line known by construction. For each, the project's own check is run for real, and Companion's locator must turn
// its real output into that exact place. No model is involved: this measures the part that decides where the ring goes.
// The practice stuck moments that ship with the app (app/sample) are cases too, so the projects people practise on are
// held to the same bar; their expected failing checks live in the practice catalog (app/sample/practices.json), outside
// the projects.
// Run: cd evals/rescue-projects && bun test
import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locateProblem } from "../../runner/src/proof/locate.ts";
import { rlsGate } from "../../runner/src/ship/rls.ts";

const casesDir = join(import.meta.dir, "cases");
const have = (bin: string) => bin.startsWith("/") ? existsSync(bin) : Bun.spawnSync(["which", bin]).exitCode === 0;
// "$TSC" means the TypeScript checker that ships with the app's own tools (so the eval needs nothing installed globally).
const TSC = join(import.meta.dir, "../../app/node_modules/.bin/tsc");
const resolve = (cmd: string[]) => cmd.map((c) => (c === "$TSC" ? TSC : c));

type Expected = { cmd: string[]; file: string; line: number; about: string };
// A copy of the project in a fresh folder, its own check run for real, and the place the locator finds in its output.
function runCase(src: string, exp: Expected) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "companion-rescue-")));
  try {
    cpSync(src, dir, { recursive: true });
    const r = Bun.spawnSync(resolve(exp.cmd), { cwd: dir, env: { PATH: process.env.PATH ?? "", HOME: dir, NO_COLOR: "1" } });
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
}

describe("the hero finds the real failing place in fifteen kinds of broken project", () => {
  for (const name of readdirSync(casesDir).sort()) {
    const exp = JSON.parse(readFileSync(join(casesDir, name, "expected.json"), "utf8")) as Expected;
    const skip = !have(resolve(exp.cmd)[0]);
    (skip ? test.skip : test)(name, () => runCase(join(casesDir, name), exp), 30_000);   // each case starts a real program; a busy Mac can take several seconds
  }
});

// The practice stuck moments: the same bar, plus the open table, which no program shows; Companion's own database access
// check (a ship gate, reading the migration files) must find it, at the line that makes the table.
const samples = join(import.meta.dir, "../../app/sample");
type GateExpected = { gate: "database_access"; findings: string[]; file: string; line: number };
const catalog = JSON.parse(readFileSync(join(samples, "practices.json"), "utf8")) as { practices: { folder: string; expect: Expected | GateExpected }[] };
const practice: Record<string, Expected | GateExpected> = Object.fromEntries(catalog.practices.map((p) => [p.folder, p.expect]));
describe("the practice stuck moments fail where they are meant to", () => {
  test("every practice project that ships has an entry in the catalog, and every entry has its folder", () => {
    const shipped = readdirSync(samples).filter((n) => statSync(join(samples, n)).isDirectory()).sort();
    expect(shipped).toEqual(Object.keys(practice).sort());
  });
  for (const [name, exp] of Object.entries(practice)) {
    if ("gate" in exp) {
      test(name, async () => {
        const dir = realpathSync(mkdtempSync(join(tmpdir(), "companion-rescue-")));
        try {
          cpSync(join(samples, name), dir, { recursive: true });
          const g = await rlsGate({ project: dir });
          expect(g.id).toBe(exp.gate);
          expect(g.status).toBe("blocked");
          expect(g.findings).toEqual(exp.findings);
          expect(g.places?.[0]).toMatchObject({ file: exp.file, line: exp.line });
        } finally { rmSync(dir, { recursive: true, force: true }); }
      });
      continue;
    }
    const skip = !have(resolve(exp.cmd)[0]);
    (skip ? test.skip : test)(name, () => runCase(join(samples, name), exp), 30_000);
  }
});
