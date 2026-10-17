import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compareVersions, releases, whatsNew, type Release } from "./whatsnew.ts";

const appVersion = (): string => JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8")).version;
const list: Release[] = [
  { version: "0.3.0", lines: ["Three."] },
  { version: "0.2.0", lines: ["Two."] },
  { version: "0.1.0", lines: ["One."] },
];
const versions = (r: Release[]) => r.map((x) => x.version);

describe("what changed after an update", () => {
  test("the version this app is built as says what changed in it (bump the version, write its lines)", () => {
    const now = releases().find((r) => r.version === appVersion());
    expect(now, `no lines for ${appVersion()} in strings.ts whatsNew`).toBeDefined();
    expect(now!.lines.length).toBeGreaterThan(0);
    expect(now!.lines.length).toBeLessThanOrEqual(6);
  });
  test("every line is short, plain and a whole sentence", () => {
    for (const r of releases()) {
      expect(compareVersions(r.version, "0.0.0"), r.version).toBeGreaterThan(0);
      for (const l of r.lines) {
        expect(l.length, l).toBeLessThanOrEqual(160);
        expect(/[–—]/.test(l), l).toBe(false);
        expect(/[.!?]$/.test(l), l).toBe(true);
      }
    }
  });
  test("versions compare by their numbers, not as text", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.1.0", "0.1.1")).toBeLessThan(0);
    expect(Number.isNaN(compareVersions("nonsense", "0.1.0"))).toBe(true);
  });
  test("a first install shows nothing, and remembers the version", () => {
    expect(whatsNew(null, "0.2.0", list)).toEqual({ show: [], remember: "0.2.0" });
    expect(whatsNew("", "0.2.0", list)).toEqual({ show: [], remember: "0.2.0" });
  });
  test("the same version as last time shows nothing again", () => {
    expect(whatsNew("0.2.0", "0.2.0", list)).toEqual({ show: [], remember: null });
  });
  test("after an update: what changed since the version seen last, newest first", () => {
    expect(versions(whatsNew("0.1.0", "0.2.0", list).show)).toEqual(["0.2.0"]);
    expect(versions(whatsNew("0.1.0", "0.3.0", list).show)).toEqual(["0.3.0", "0.2.0"]);
    expect(whatsNew("0.1.0", "0.3.0", list).remember).toBe("0.3.0");
    expect(versions(whatsNew("0.0.5", "0.1.0", list).show)).toEqual(["0.1.0"]);
  });
  test("going back to an older version, a version with no lines, or a damaged note shows nothing", () => {
    expect(whatsNew("0.3.0", "0.2.0", list)).toEqual({ show: [], remember: "0.2.0" });
    expect(whatsNew("0.3.0", "0.4.0", list)).toEqual({ show: [], remember: "0.4.0" });
    expect(whatsNew("garbage", "0.2.0", list)).toEqual({ show: [], remember: "0.2.0" });
    expect(whatsNew("0.1.0", "", list)).toEqual({ show: [], remember: null });
  });
  test("a long gap shows at most three versions", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ version: `0.${i + 1}.0`, lines: [`V${i + 1}.`] })).reverse();
    expect(versions(whatsNew("0.0.1", "0.8.0", many).show)).toEqual(["0.8.0", "0.7.0", "0.6.0"]);
  });
});
