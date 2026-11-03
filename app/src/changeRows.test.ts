// M65: the review and change cards' file rows in the Instrument look (changeRows.ts, changesCard.tsx, reviewCard.tsx, and
// the rules at the end of ui/look.css), and that Friendly keeps today's rows.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { changeRow, keyFiles, splitPath } from "./changeRows.ts";
import { LOOK_CSS, STYLE_CSS, TOKENS_CSS } from "./ui/cssFiles.ts";
import { S } from "./strings.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("a changed file's row", () => {
  test("the name, its folder, and the short tag for how it changed", () => {
    expect(changeRow({ file: "src/utils/date.ts", kind: "deleted" })).toEqual({ file: "src/utils/date.ts", name: "date.ts", dir: "src/utils/", kind: "deleted", tag: "Removed", stop: false, added: 0, removed: 0 });
    expect(changeRow({ file: "a.ts", kind: "added" }).tag).toBe("Added");
    expect(changeRow({ file: "a.ts", kind: "modified" }).tag).toBe("Changed");
    expect(splitPath("README.md")).toEqual({ dir: "", name: "README.md" });
  });
  test("an unknown kind reads Changed, never a stray word, and never Key in code by its name alone", () => {
    expect(changeRow({ file: "a.ts", kind: "renamed" }).tag).toBe("Changed");
    expect(changeRow({ file: "a.ts", kind: "key" })).toMatchObject({ tag: "Changed", stop: false });
    expect(changeRow({ file: "a.ts", kind: "toString" }).tag).toBe("Changed");
  });
  test("a key found in the file wins the tag, in red (stop), whatever the kind", () => {
    expect(changeRow({ file: "src/pay.ts", kind: "modified" }, ["src/pay.ts"])).toMatchObject({ tag: "Key in code", stop: true });
    expect(changeRow({ file: "src/new.ts", kind: "added" }, ["src/pay.ts"])).toMatchObject({ tag: "Added", stop: false });
    expect(S.ui.fileTag.key).toBe("Key in code");
  });
  test("added and taken away lines only when known: a whole number above 0, else none", () => {
    expect(changeRow({ file: "a.ts", kind: "modified", added: 12, removed: 3 })).toMatchObject({ added: 12, removed: 3 });
    for (const bad of [-1, 1.5, Number.NaN, undefined]) expect(changeRow({ file: "a.ts", kind: "modified", added: bad as number }).added).toBe(0);
  });
});

describe("the files a key was found in", () => {
  test("from the instant key check, and from a review's key reasons with a file, once each", () => {
    expect(keyFiles({ keys: [{ file: "src/pay.ts", line: 12 }, { file: "src/pay.ts", line: 40 }], result: null })).toEqual(["src/pay.ts"]);
    const result = { reasons: [{ kind: "secret_in_code", say: "A key", file: "src/pay.ts", line: 12 }, { kind: "secret_in_code", say: "A key, no place" }, { kind: "big_change", say: "Big", file: "src/cart.ts" }] };
    expect(keyFiles({ result } as never)).toEqual(["src/pay.ts"]);
    expect(keyFiles({ result: null })).toEqual([]);
  });
});

describe("the cards draw it", () => {
  test("the review card passes the key files to its file list, and each row carries its tag and stop mark", () => {
    expect(read("./reviewCard.tsx")).toContain("<ChangesCard changed={r.files} keys={keyFiles(r)} />");
    const src = read("./changesCard.tsx");
    expect(src).toContain('className="ui-tag changes-tag" data-tone={row.stop ? "stop" : undefined}');
    expect(src).toContain("data-key={row.stop || undefined}");
  });
});

describe("Friendly keeps today's rows; Instrument gets rows, tags, a quiet inset and rectangles", () => {
  const css = LOOK_CSS();
  const block = css.slice(css.indexOf("M65, the review and change cards"), css.indexOf("end M65 review and change cards"));
  const tokens = TOKENS_CSS();
  const instrument = tokens.slice(tokens.indexOf(':root[data-style="instrument"] {'), tokens.indexOf("\n}\n", tokens.indexOf(':root[data-style="instrument"] {')));
  const rvRead = [...new Set([...block.matchAll(/var\((--rv-[\w-]+)/g)].map((m) => m[1]))];
  test("every --rv- token the rules read is set by Instrument only, and each read has today's value as its fallback", () => {
    expect(rvRead.length).toBeGreaterThan(30);
    for (const t of rvRead) {
      expect(instrument, t).toContain(`${t}:`);
      expect([...tokens.matchAll(new RegExp(`${t}:`, "g"))].length, `${t} is set once`).toBe(1);
    }
    for (const m of block.matchAll(/var\((--rv-[\w-]+)(,?)/g)) expect(m[2], `${m[1]} has a fallback`).toBe(",");
  });
  test("the new tag and counts are hidden without Instrument, and the old mark and word shown", () => {
    expect(block).toContain(".changes .changes-tag { display: var(--rv-new, none);");
    expect(block).toContain(".changes .changes-diff { display: var(--rv-new, none);");
    expect(block).toContain(".changes .changes-mark, .changes .changes-kind { display: var(--rv-old, inline); }");
    expect(instrument).toContain("--rv-old: none; --rv-new: inline-flex;");
  });
  test("the fallbacks are today's values (style.css and look.css as they were)", () => {
    for (const [now, was] of [
      ["var(--rv-cols, 1em minmax(0, 1fr) auto)", ".changes li { display: grid; grid-template-columns: 1em minmax(0, 1fr) auto;"],
      ["var(--rv-row-pad, 3px var(--space-3))", "padding: 3px var(--space-3); min-width: 0; }"],
      ["var(--rv-box-bg, var(--surface-1))", ".changes { margin: var(--space-2) 0; border-radius: var(--r-control); background: var(--surface-1);"],
      ["var(--rv-head-pad, var(--space-2) var(--space-3))", ".changes-head { padding: var(--space-2) var(--space-3);"],
      ["var(--rv-why-bg, var(--surface-1))", "border-radius: var(--r-control); background: var(--surface-1); border: 1px solid var(--line); font-size: var(--t-small); line-height: 1.45;"],
      ["var(--rv-tag-bg, color-mix(in srgb, var(--fg) 8%, transparent))", "border-radius: var(--r-stamp); background: color-mix(in srgb, var(--fg) 8%, transparent);"],
      ["var(--rv-hist-pad, var(--space-2) 0)", "align-items: start; padding: var(--space-2) 0; border-top"],
    ]) { expect(block, now).toContain(now); expect(STYLE_CSS() + css, was).toContain(was); }
  });
  test("no rule here styles a part, writes a colour, or reads a look attribute", () => {
    expect(block).not.toMatch(/(#[0-9a-f]{3,8}\b|rgba?\()/i);
    expect(block).not.toMatch(/\[data-(style|theme|character)/);
    for (const line of block.split("\n").filter((l) => l.includes("{"))) expect(line.slice(0, line.indexOf("{")), line).not.toMatch(/\.(btn|ui-[\w-]+)\b(?![\w-])/);
  });
  test("Instrument: 36 high file and History rows, the reason block a quiet inset, Memory as hairline rows", () => {
    expect(instrument).toContain("--rv-row-h: var(--h-row)");
    expect(instrument).toContain("--rv-hist-h: var(--h-row)");
    expect(instrument).toContain("--rv-why-bg: var(--inset)");
    expect(instrument).toContain("--rv-note-r: 0; --rv-note-bg: transparent;");
    expect(instrument).toContain("--rv-tag-r: var(--r-key)");
  });
});
