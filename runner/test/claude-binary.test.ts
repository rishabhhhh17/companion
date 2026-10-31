// The installed Claude build is checked by the shell at each engine start (app/src-tauri/src/claude_install.rs cleared),
// which passes the version of the file it checked as COMPANION_CLAUDE_ID. The engine compares that version before each
// Claude start, so a file swapped while the engine runs is never started with the key.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileId, resolveClaudeBinary } from "../src/sdkEngine.ts";
import { readSettings } from "../src/engines.ts";

describe("the installed Claude build", () => {
  test("is used only while it is the very file the shell checked", () => {
    const d = mkdtempSync(join(tmpdir(), "claude-bin-"));
    try {
      const f = join(d, "claude");
      writeFileSync(f, "anthropic build");
      const id = fileId(f)!;
      // The same facts the shell reads: inode, size, and the modification and change times in nanoseconds.
      const s = statSync(f, { bigint: true });
      expect(id).toBe(`${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`);
      expect(resolveClaudeBinary(f, id)).toBe(f);
      // Written again in place (a different size), even with its old time put back: refused.
      const before = statSync(f);
      writeFileSync(f, "another program!");
      utimesSync(f, before.atime, before.mtime);
      expect(() => resolveClaudeBinary(f, id)).toThrow(/changed since/);
      // Written again in place with the same length and its old time put back: still refused (the change time moves).
      writeFileSync(f, "anthropic build"); const again = fileId(f)!;
      const t = statSync(f, { bigint: true });
      const ref = join(d, "ref"); writeFileSync(ref, "");
      expect(Bun.spawnSync(["/usr/bin/touch", "-r", f, ref]).exitCode).toBe(0);   // keeps the exact time, to the nanosecond
      Bun.sleepSync(20);
      writeFileSync(f, "someone's build");
      expect(Bun.spawnSync(["/usr/bin/touch", "-r", ref, f]).exitCode).toBe(0);
      expect(statSync(f, { bigint: true }).mtimeNs).toBe(t.mtimeNs);
      expect(statSync(f, { bigint: true }).size).toBe(t.size);
      expect(() => resolveClaudeBinary(f, again)).toThrow(/changed since/);
      // Replaced by another file: refused.
      writeFileSync(f, "anthropic build"); const fresh = fileId(f)!;
      writeFileSync(join(d, "x"), "anthropic build"); renameSync(join(d, "x"), f);
      expect(() => resolveClaudeBinary(f, fresh)).toThrow(/changed since/);
      // Gone: refused as before.
      rmSync(f);
      expect(() => resolveClaudeBinary(f, fresh)).toThrow();
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  test("a path with no checked version is used as before (a development run's own)", () => {
    const d = mkdtempSync(join(tmpdir(), "claude-bin-"));
    try {
      const f = join(d, "claude");
      writeFileSync(f, "x");
      expect(resolveClaudeBinary(f)).toBe(f);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  test("the checked version comes from the shell's own variable", () => {
    expect(readSettings({ COMPANION_CLAUDE_BIN: "/c", COMPANION_CLAUDE_ID: "1:2:3" }).claudeBinId).toBe("1:2:3");
    expect(readSettings({}).claudeBinId).toBeUndefined();
  });
});
