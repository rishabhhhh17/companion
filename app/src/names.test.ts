import { describe, expect, test } from "bun:test";
import { S } from "./strings.ts";

// M28: one name for each thing a person meets. Search words (`also`) may keep the old names so a search still finds the
// setting; nothing a person reads may use them.
const RETIRED: [RegExp, string][] = [
  [/\bthe island\b/i, "the notch"],
  [/\bthe card\b/i, "Home"],
  [/\bask box\b/i, "Home"],
];
function sentences(o: unknown, path: string, out: [string, string][]): void {
  if (typeof o === "string") out.push([path, o]);
  else if (typeof o === "function") { try { const v = (o as (...a: unknown[]) => unknown)("X", "Y", "Z"); if (typeof v === "string") out.push([`${path}()`, v]); } catch { /* needs other arguments */ } }
  else if (Array.isArray(o)) { if (!path.endsWith(".also")) o.forEach((x, i) => sentences(x, `${path}.${i}`, out)); }
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) sentences(v, `${path}.${k}`, out);
}

describe("one name for each thing (M28)", () => {
  test("nothing a person reads uses a retired name", () => {
    const all: [string, string][] = [];
    sentences(S, "S", all);
    for (const [p, s] of all) for (const [re, use] of RETIRED) expect(re.test(s), `${p} says ${re} (say ${use}): ${s.slice(0, 120)}`).toBe(false);
  });
});
