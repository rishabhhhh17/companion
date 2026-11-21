// M108 review: the real Mac check (scripts/m108-check-start.sh, runner/scripts/m108-start-check.ts) must not be able to pass
// by a tool reading the folder. The practice word lives only in Squibby's data folder, which is a separate folder outside the
// practice folder, so no file inside the practice folder holds it. Temporary folders only; no model and no AI tool is run.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const made: string[] = [];
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "m108p-"))); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const SCRIPT = join(import.meta.dir, "..", "scripts", "m108-start-check.ts");
const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: 20_000 });
const filesUnder = (d: string): string[] => readdirSync(d, { recursive: true, encoding: "utf8" }).map((f) => join(d, f)).filter((f) => statSync(f).isFile());

describe("the practice check keeps the word out of the folder", () => {
  for (const tool of ["codex", "gemini", "antigravity"] as const) {
    test(`${tool}: no file in the practice folder holds the word, and show prints it from the data folder`, () => {
      const dir = tmp(), data = tmp();
      const r = run("setup", tool, dir, data);
      expect(r.status).toBe(0);
      for (const f of filesUnder(dir)) expect(readFileSync(f, "utf8"), f).not.toContain("PLUM-7");
      expect(readdirSync(dir).some((n) => n.includes("squibby"))).toBe(false);
      const s = run("show", dir, data);
      expect(s.status).toBe(0);
      expect(s.stdout).toContain("PLUM-7");
    });
  }
  test("a folder that is not new and empty is refused and left as it was (never a real project)", async () => {
    const dir = tmp(), data = tmp();
    await Bun.write(join(dir, "mine.txt"), "my own file\n");
    expect(run("setup", "codex", dir, data).status).not.toBe(0);
    expect(readdirSync(dir)).toEqual(["mine.txt"]);
  });
  test("a data folder inside the practice folder is refused", () => {
    const dir = tmp();
    const r = run("setup", "gemini", dir, join(dir, "data"));
    expect(r.status).not.toBe(0);
    expect(filesUnder(dir).some((f) => readFileSync(f, "utf8").includes("PLUM-7"))).toBe(false);
  });
});
