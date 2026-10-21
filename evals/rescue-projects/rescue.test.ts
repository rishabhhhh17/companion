// Rescue projects, a free eval of the hero: fifteen small projects, each broken in a way beginners meet, with the true file
// and line known by construction. For each, the project's own check is run for real, and Companion's locator must turn
// its real output into that exact place. No model is involved: this measures the part that decides where the ring goes.
// The practice stuck moments that ship with the app (app/sample) are cases too, so the projects people practise on are
// held to the same bar; their expected failing checks live in the practice catalog (app/sample/practices.json), outside
// the projects.
// Go, Rust, Java, Swift and Xcode projects have cases of their own (native-cases), run by their own tools: cargo, swift,
// go, javac and java, xcodebuild. Each skips cleanly when its tool is not on the Mac (a probe command decides, so the
// stand in java and xcodebuild that macOS keeps in /usr/bin without a JDK or Xcode behind them are not mistaken for the
// real ones). Nothing is installed and nothing reaches the network (cargo runs with --offline, and the cases have no packages).
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

// probe: a command that must succeed for the case to run. env: more settings for the tool; $REAL_HOME is the Mac's own home
// folder (Rust keeps its toolchains there; the project's own home is a temporary one so nothing else is shared), and
// $XCODE_DEVELOPER_DIR is an Xcode in /Applications (left out when there is none), for a Mac whose selected developer
// folder is only the command line tools.
type Expected = { cmd: string[]; file: string; line: number; about: string; probe?: string[]; env?: Record<string, string> };
const xcodeDir = (): string => { try { return readdirSync("/Applications").filter((n) => /^Xcode.*\.app$/.test(n)).sort().map((n) => `/Applications/${n}/Contents/Developer`).find((d) => existsSync(join(d, "usr/bin/xcodebuild"))) ?? ""; } catch { return ""; } };
const extraEnv = (exp: Expected): Record<string, string> => Object.fromEntries(Object.entries(exp.env ?? {}).map(([k, v]) => [k, v.replaceAll("$REAL_HOME", process.env.HOME ?? "").replaceAll("$XCODE_DEVELOPER_DIR", xcodeDir())]).filter(([, v]) => v !== ""));
// A copy of the project in a fresh folder, its own check run for real, and the place the locator finds in its output.
function runCase(src: string, exp: Expected) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "companion-rescue-")));
  try {
    cpSync(src, dir, { recursive: true });
    const r = Bun.spawnSync(resolve(exp.cmd), { cwd: dir, env: { PATH: process.env.PATH ?? "", HOME: dir, NO_COLOR: "1", ...extraEnv(exp) } });
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

const nativeDir = join(import.meta.dir, "native-cases");
// Can this Mac run the case's tool? The probe is the tool's own version command.
const usable = (exp: Expected) => have(resolve(exp.cmd)[0]) && (!exp.probe || Bun.spawnSync(exp.probe, { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...extraEnv(exp) } }).exitCode === 0);

describe("the hero finds the real failing place in fifteen kinds of broken project", () => {
  for (const name of readdirSync(casesDir).sort()) {
    const exp = JSON.parse(readFileSync(join(casesDir, name, "expected.json"), "utf8")) as Expected;
    const skip = !have(resolve(exp.cmd)[0]);
    (skip ? test.skip : test)(name, () => runCase(join(casesDir, name), exp), 30_000);   // each case starts a real program; a busy Mac can take several seconds
  }
});

describe("and in Go, Rust, Java, Swift and Xcode projects, with their own tools", () => {
  const names = readdirSync(nativeDir).sort();
  test("there is a case for each of these, and each has its project", () => {
    expect(names.length).toBeGreaterThanOrEqual(8);
    for (const lang of ["go", "rust", "java", "swift", "xcode"]) expect(names.some((n) => n.startsWith(lang + "-")), lang).toBe(true);
    for (const n of names) expect(existsSync(join(nativeDir, n, "expected.json")), n).toBe(true);
  });
  for (const name of names) {
    const exp = JSON.parse(readFileSync(join(nativeDir, name, "expected.json"), "utf8")) as Expected;
    (usable(exp) ? test : test.skip)(name, () => runCase(join(nativeDir, name), exp), 120_000);   // a first Swift or Xcode build takes a while
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
