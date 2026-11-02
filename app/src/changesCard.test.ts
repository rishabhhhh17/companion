import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { splitPath } from "./changesCard.tsx";
import { S } from "./strings.ts";

describe("what a fix changed, as one card (M39)", () => {
  test("a path splits into its folder and its name", () => {
    expect(splitPath("public/js/signup.js")).toEqual({ dir: "public/js/", name: "signup.js" });
    expect(splitPath("README.md")).toEqual({ dir: "", name: "README.md" });
  });
  test("the header counts the files in plain words", () => {
    expect(S.changedFiles(1)).toBe("Changed 1 file");
    expect(S.changedFiles(3)).toBe("Changed 3 files");
  });
  test("each kind has a mark and its word for screen readers, never colour alone", () => {
    const src = readFileSync(new URL("./changesCard.tsx", import.meta.url), "utf8");
    expect(src).toContain('const MARK: Record<string, string> = { added: "+", modified: "●", deleted: "−" };');
    expect(src).toContain('<span className="sr">');
    expect(readFileSync(new URL("./card.tsx", import.meta.url), "utf8")).toContain("<ChangesCard changed={m.receipt.changed} undone={undone} />");
  });
});
