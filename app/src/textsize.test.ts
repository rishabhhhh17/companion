// Text size in Home (AGENTS.md, the bar 13): a Settings choice with a safe default, kept on this Mac, put on the page as one
// root size. What the stylesheet does with it is checked in a11y.test.ts (part 4).
import { describe, expect, test } from "bun:test";
import { S } from "./strings.ts";
import { TEXT_SIZES, TEXT_SIZE_DEFAULT, applyTextSize, setTextSize, textSize, textSizeFrom } from "./textsize.ts";

function withStorage(storage: unknown, f: () => void) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  try { f(); } finally { if (had) Object.defineProperty(globalThis, "localStorage", had); else delete (globalThis as { localStorage?: unknown }).localStorage; }
}
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };

describe("the text size choice", () => {
  test("four sizes, smallest first; Standard, the size Home always had, is the default", () => {
    expect([...TEXT_SIZES]).toEqual(["standard", "large", "larger", "largest"]);
    expect(TEXT_SIZE_DEFAULT).toBe("standard");
  });
  test("anything that is not one of them reads as Standard", () => {
    for (const s of TEXT_SIZES) expect(textSizeFrom(s)).toBe(s);
    for (const v of [null, undefined, "", "huge", "Large", 3, {}]) expect(textSizeFrom(v), String(v)).toBe("standard");
  });
  test("kept in this Mac's page storage, and read back", () => {
    const st = memory();
    withStorage(st, () => {
      expect(textSize(), "nothing saved yet").toBe("standard");
      setTextSize("larger");
      expect(textSize()).toBe("larger");
      expect([...st.m.keys()]).toEqual(["companion.textSize"]);
      st.m.set("companion.textSize", "enormous");
      expect(textSize(), "a damaged value").toBe("standard");
    });
  });
  test("with no page storage it stays Standard and nothing breaks", () => {
    const broken = { getItem: () => { throw new Error("no storage"); }, setItem: () => { throw new Error("no storage"); } };
    withStorage(broken, () => {
      expect(textSize()).toBe("standard");
      expect(() => setTextSize("largest")).not.toThrow();
    });
    withStorage(undefined, () => expect(textSize()).toBe("standard"));
  });
  test("put on the page as one mark on the root, which style.css sizes everything from", () => {
    const root = { dataset: {} as Record<string, string | undefined> };
    applyTextSize("largest", root);
    expect(root.dataset.text).toBe("largest");
    applyTextSize("standard", root);
    expect(root.dataset.text).toBe("standard");
  });
  test("each size has a plain word, and the row a name and a line saying what it changes", () => {
    for (const s of TEXT_SIZES) expect(S.textSizes[s], s).toMatch(/^[A-Z][a-z]+$/);
    expect(S.textSizeTitle).toBe("Text size");
    expect(S.textSizeHelp).toMatch(/Home/);
    expect(S.textSizeHelp).not.toMatch(/—/);
  });
});
