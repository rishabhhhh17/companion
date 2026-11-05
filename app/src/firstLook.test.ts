import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { BEATS, BEAT_MS, BEAT_STATE, RECORDING, TOTAL_MS, beatAt, shown } from "./firstLook.ts";
import { S } from "./strings.ts";

const SAMPLE = join(import.meta.dir, "..", "sample", RECORDING.folder);
const read = (f: string) => readFileSync(join(SAMPLE, f), "utf8");

describe("the recorded first run", () => {
  test("plays the five steps in order, a few seconds each, and stays on the last", () => {
    expect([...BEATS]).toEqual(["broken", "found", "fixed", "proven", "undo"]);
    expect(beatAt(0)).toBe("broken");
    expect(beatAt(BEAT_MS - 1)).toBe("broken");
    expect(beatAt(BEAT_MS)).toBe("found");
    expect(beatAt(TOTAL_MS * 3)).toBe("undo");
    expect(beatAt(-5)).toBe("broken");
    expect(TOTAL_MS).toBeLessThanOrEqual(16_000);   // the whole promise in about fifteen seconds
    expect(shown("proven", "found") && !shown("found", "proven")).toBe(true);
    // Flowflow acts it out, and the splash comes exactly when the check passes.
    expect(BEAT_STATE.proven).toBe("done");
    expect(BEATS.every((b) => typeof BEAT_STATE[b] === "string")).toBe(true);
  });

  test("everything it shows is the real practice: the file, the line, the messages, the check", () => {
    const lines = read(RECORDING.file).split("\n");
    expect(lines[RECORDING.line - 1]).toContain(`fetch(${RECORDING.before}`);
    expect(RECORDING.codeBefore.replace(" ...)", "")).toBe(`fetch(${RECORDING.before},`);
    expect(RECORDING.codeAfter.replace(" ...)", "")).toBe(`fetch(${RECORDING.after},`);
    expect(read(RECORDING.server)).toContain(`req.url === ${RECORDING.after}`);
    expect(read(RECORDING.server)).not.toContain(`req.url === ${RECORDING.before}`);
    expect(read(RECORDING.file)).toContain(RECORDING.brokenMsg);
    expect(read(RECORDING.file)).toContain(RECORDING.fixedMsg);
    expect(read("test/signup.test.js")).toContain(`test("${RECORDING.check}"`);
    expect(read("index.html")).toContain(`<title>${RECORDING.pageTitle}</title>`);
  });

  test("the fix it shows really makes the project's own check pass (and the check really fails before)", () => {
    const node = spawnSync("node", ["--version"]);
    if (node.status !== 0) return;   // no Node on this machine: the file checks above still hold
    const dir = mkdtempSync(join(tmpdir(), "firstlook-"));
    try {
      cpSync(SAMPLE, dir, { recursive: true });
      const check = () => spawnSync("node", ["--test"], { cwd: dir, encoding: "utf8", timeout: 30_000 }).status;
      expect(check()).not.toBe(0);
      const f = join(dir, RECORDING.file);
      writeFileSync(f, readFileSync(f, "utf8").replace(`fetch(${RECORDING.before}`, `fetch(${RECORDING.after}`));
      expect(check()).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);

  test("it says plainly that it is a recording and changed nothing", () => {
    expect(S.firstLook.recorded).toMatch(/recorded/i);
    expect(S.firstLook.recorded).toMatch(/nothing on your Mac/i);
    for (const b of BEATS) expect(S.firstLook.beats[b].length).toBeGreaterThan(0);
    expect(S.firstLook.beats.found).toContain(`${RECORDING.file}, line ${RECORDING.line}`);
    expect(JSON.stringify(S.firstLook)).not.toContain("—");
  });
});

describe("the tour can be watched again", () => {
  test("Learn offers it on a press, whatever groups are on, and it plays nothing until pressed", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    // M71: the tour is the quiet button of Learn's featured practice card (practicePanel.tsx), or a row once all are done.
    expect(card).toContain('onTour={home.tab === "learn" && !tour ? () => setTour(true) : undefined}');
    expect(readFileSync(new URL("./practicePanel.tsx", import.meta.url), "utf8")).toContain("{onTour && <Button kind=\"secondary\" onClick={onTour}>{S.firstLook.watch}</Button>}");
    expect(card).toContain("const [tour, setTour] = useState(false);");
    expect(card).toContain("<FirstLook onGo={() => setTour(false)} />");
  });
});

describe("M45: the Undo promise matches Undo", () => {
  test("the Undo promise matches Undo", () => {
    expect(S.firstLook.beats.undo).not.toMatch(/exactly/i);
    expect(S.firstLook.more.undo).not.toMatch(/exactly/i);
    expect(S.firstLook.beats.undo).toBe("Not happy? Undo puts back the files it changed.");
    expect(S.firstLook.more.undo).toMatch(/files you changed yourself/);
    expect(S.firstLook.more.undo).toMatch(/sent online/);
  });
  test("Undo's own warning promises the Undo of the Undo only because Bring the fix back exists", () => {
    expect(S.undoReplaces).toContain("so you can undo the Undo");
    expect(S.bringBack).toBe("Bring the fix back");
  });
});
