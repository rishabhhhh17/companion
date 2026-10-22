// The product's names (AGENTS.md rule 21, F24): one file, protocol/names.json, read by the pages, the engine and the shell.
// These tests fail if a reader stops reading it, if the Rust and TypeScript sides disagree about which names exist, if a
// static file that cannot read it (HTML titles, tauri.conf.json, Info.plist, build scripts) drifts from it, or if the old
// product name is still in a sentence a person reads (outside a short allow list of internal places, each with its reason).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import names from "../../protocol/names.json";
import { CHARACTER, fillNames, NAMES, PRODUCT, PRODUCT_S } from "../src/names.ts";
import { loadLessons } from "../src/walk.ts";

const ROOT = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const OLD = "Companion";

function* walk(dir: string, skip: (name: string) => boolean = () => false): Generator<string> {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "target" || e.name === "dist" || e.name === ".git" || skip(e.name)) continue;
    const rel = join(dir, e.name);
    if (e.isDirectory()) yield* walk(rel, skip); else yield rel;
  }
}

describe("protocol/names.json is the one source", () => {
  test("it holds exactly the names every reader expects, and the forms follow the names", () => {
    expect(Object.keys(names).sort()).toEqual(["about", "character", "characterPossessive", "earlierPracticeCopyBases", "newFolderParent", "practiceCopyBase", "product", "productPossessive", "version"]);
    expect(names.productPossessive).toBe(`${names.product}'s`);
    expect(names.characterPossessive).toBe(`${names.character}'s`);
    expect(names.practiceCopyBase.startsWith(names.product) && names.newFolderParent.startsWith(names.product)).toBe(true);
    expect(names.earlierPracticeCopyBases).not.toContain(names.practiceCopyBase);
    for (const v of [names.product, names.character, names.practiceCopyBase, names.newFolderParent]) expect(v).toMatch(/^[^\n/]+$/);
  });

  test("the engine's accessors give the file's values", () => {
    expect(PRODUCT).toBe(names.product); expect(PRODUCT_S).toBe(names.productPossessive); expect(CHARACTER).toBe(names.character); expect(NAMES).toBe(names);
    expect(fillNames("In {product}, ask {character}; {product_s} card and {character_s} look. {other}")).toBe(`In ${names.product}, ask ${names.character}; ${names.productPossessive} card and ${names.characterPossessive} look. {other}`);
  });

  test("the pages, the engine, the proxy and the shell all read that file and no copy of it", () => {
    expect(read("app/src/strings.ts")).toContain('from "../../protocol/names.json"');
    expect(read("runner/src/names.ts")).toContain('from "../../protocol/names.json"');
    expect(read("usage-proxy/src/names.ts")).toContain('from "../../protocol/names.json"');
    expect(read("app/src-tauri/src/names.rs")).toContain('include_str!("../../../protocol/names.json")');
    expect(read("app/src-tauri/build.rs")).toContain('"../../protocol/names.json"');
    // The engine is staged into the app without the repo around it: the file must travel with it, or launch would fail.
    expect(read("app/scripts/stage-engine.sh")).toContain("protocol/names.json");
  });

  test("the Rust side has a field for every name in the file, and no other (the shell fails to start on an unknown one)", () => {
    const rs = read("app/src-tauri/src/names.rs");
    const body = /pub struct Names \{([\s\S]*?)\n\}/.exec(rs)![1];
    const fields = [...body.matchAll(/(?:#\[serde\(rename = "([A-Za-z]+)"\)\]\s*)?pub (\w+):/g)].map((m) => m[1] ?? m[2]);
    expect(fields.sort()).toEqual(Object.keys(names).sort());
    expect(rs).toContain("deny_unknown_fields");
  });

  test("the Rust build hands every name to the compiler, and each one is used by the shell's own agreement test", () => {
    const build = read("app/src-tauri/build.rs");
    for (const key of Object.keys(names).filter((k) => !["version", "about", "earlierPracticeCopyBases"].includes(k))) expect(build, key).toContain(`"${key}"`);
    const rs = read("app/src-tauri/src/names.rs");
    for (const v of ["NAMES_PRODUCT", "NAMES_PRODUCT_S", "NAMES_CHARACTER", "NAMES_CHARACTER_S", "NAMES_PRACTICE_COPY_BASE", "NAMES_NEW_FOLDER_PARENT"]) { expect(build, v).toContain(v); expect(rs, v).toContain(v); }
  });
});

describe("files that cannot read the file are checked against it", () => {
  test("the bundle is named after the product", () => {
    expect(JSON.parse(read("app/src-tauri/tauri.conf.json")).productName).toBe(names.product);
    // What stays the same on purpose: the identifier is the app's identity to macOS (permissions, Keychain, data folder).
    expect(JSON.parse(read("app/src-tauri/tauri.conf.json")).identifier).toBe("dev.companion.app");
  });
  test("the microphone sentence macOS shows names the product", () => {
    expect(/<key>NSMicrophoneUsageDescription<\/key>\s*<string>([^<]*)<\/string>/.exec(read("app/src-tauri/Info.plist"))![1].startsWith(`${names.product} listens only`)).toBe(true);
  });
  test("each page's title names the product", () => {
    for (const f of readdirSync(join(ROOT, "app")).filter((n) => n.endsWith(".html"))) expect(/<title>([^<]*)<\/title>/.exec(read(`app/${f}`))![1], f).toMatch(new RegExp(`^${names.product}( pointer)?$`));
  });
  test("every script that opens or packs the built app uses the product's bundle name", () => {
    const scripts = [...walk("app/scripts"), ...walk("scripts")].filter((f) => /\.(sh|py)$/.test(f));
    const using = scripts.filter((f) => /\.app\b/.test(read(f)) && !f.endsWith("stop.sh"));   // stop.sh also stops a copy that still has the earlier bundle name
    expect(using.length).toBeGreaterThan(4);
    for (const f of using) { const t = read(f); expect(t, f).not.toContain(`${OLD}.app`); expect(t, f).not.toMatch(/Companion-\$\{?VERSION|Companion-<version>|Companion\.zip|Companion\.app\.tar/); }
    expect(read("app/scripts/build-app.sh")).toContain(`${names.product}.app`);
  });
  test("the lesson files hold {product}, never a name, and the engine fills it when it loads them", () => {
    for (const f of readdirSync(join(ROOT, "lessons")).filter((n) => n.endsWith(".json"))) expect(read(`lessons/${f}`), f).not.toMatch(/\bCompanion\b/);
    const { lessons, problems } = loadLessons([join(ROOT, "lessons")]);
    expect(problems).toEqual([]);
    const text = JSON.stringify(lessons);
    expect(text).toContain(names.product); expect(text).not.toMatch(/\{product|\{character/); expect(text).not.toMatch(/\bCompanion\b/);
  });
  test("the practice projects and the practice catalog do not name the product", () => {
    for (const f of walk("app/sample")) expect(read(f), f).not.toMatch(/\bCompanion\b/);
  });
});

// ---- the old name in sentences a person reads ----

/** The source with its comments removed, as lines (strings and code stay). TypeScript goes through Bun's own transpiler. */
function codeLinesTs(file: string): string[] {
  const t = new Bun.Transpiler({ loader: file.endsWith("x") ? "tsx" : "ts", trimUnusedImports: false });
  return t.transformSync(read(file)).split("\n");
}

/** Rust source with comments removed (strings, raw strings and characters are skipped over properly). */
export function stripRustComments(src: string): string {
  let out = "", i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { let depth = 1; i += 2; while (i < n && depth > 0) { if (src[i] === "/" && src[i + 1] === "*") { depth++; i += 2; } else if (src[i] === "*" && src[i + 1] === "/") { depth--; i += 2; } else { if (src[i] === "\n") out += "\n"; i++; } } continue; }
    const raw = /^b?r(#*)"/.exec(src.slice(i, i + 12));
    if (raw && (i === 0 || !/[A-Za-z0-9_]/.test(src[i - 1]))) { const close = '"' + raw[1]; const e = src.indexOf(close, i + raw[0].length); out += src.slice(i, e + close.length); i = e + close.length; continue; }
    if (c === '"') { let j = i + 1; while (j < n && src[j] !== '"') { if (src[j] === "\\") j++; j++; } out += src.slice(i, j + 1); i = j + 1; continue; }
    if (c === "'") { const m = /^'(\\.[^']*|[^\\'])'/.exec(src.slice(i, i + 12)); if (m) { out += m[0]; i += m[0].length; continue; } }
    out += c; i++;
  }
  return out;
}

/** The few places the old product name is meant to stay. Every entry says why; a new entry needs a real reason. */
const ALLOWED: { file: RegExp; line: RegExp; why: string }[] = [
  { file: /^(runner\/src\/(sandbox|engines|proof\/browser)\.ts|runner\/test\/sandbox\.test\.ts|app\/src-tauri\/src\/(main|wipe)\.rs)$/, line: /Application Support\/Companion|"Application Support", "Companion"/, why: "the data folder's name: renaming it would lose the person's saved data (a separate decision with a migration, F24)" },
  { file: /^runner\/src\/(sandbox|engines)\.ts$/, line: /Companion-test-claude|COMPANION_DATA/, why: "the data folder's name, and a dev test folder, as above" },
  { file: /^app\/src-tauri\/src\/wipe\.rs$/, line: /companion:begin \(kept up to date by Companion/, why: "a block written under the earlier name, which Delete everything must still find and remove" },
  { file: /^runner\/test\/(sandbox|memory-agentsmd)\.test\.ts$/, line: /companion:begin \(kept up to date by Companion|Project notes \(from Companion\)|not\.toContain\("Companion"\)/, why: "a block written under the earlier name must still be found and updated, and the update must not keep the old name" },
  { file: /^runner\/test\/safety-hardening\.test\.ts$/, line: /\.Companion\/rules\.txt/, why: "the project's .companion folder is an identifier; its name in another letter case must be guarded too" },
  { file: /^app\/src-tauri\/src\/practice\.rs$/, line: /# Companion added these rules/, why: "a practice copy made under the earlier name must still be recognised as ours" },
  { file: /^runner\/test\/names\.test\.ts$/, line: /./, why: "this file is the check" },
];

function leftovers(files: string[], lines: (f: string) => string[]): string[] {
  const found: string[] = [];
  for (const f of files) {
    lines(f).forEach((l, i) => {
      if (!/\bCompanion\b/.test(l)) return;
      if (ALLOWED.some((a) => a.file.test(f) && a.line.test(l))) return;
      found.push(`${f}:${i + 1}: ${l.trim().slice(0, 160)}`);
    });
  }
  return found;
}

describe("the old product name is not in anything a person reads", () => {
  const ts = (dir: string) => [...walk(dir)].filter((f) => /\.tsx?$/.test(f));
  test("pages (code, strings and their tests)", () => { expect(leftovers(ts("app/src"), codeLinesTs)).toEqual([]); });
  test("engine (code, prompts and its tests)", () => { expect(leftovers([...ts("runner/src"), ...ts("runner/test")], codeLinesTs)).toEqual([]); });
  test("usage proxy", () => { expect(leftovers([...ts("usage-proxy/src"), ...ts("usage-proxy/test")], codeLinesTs)).toEqual([]); });
  test("shell (every string in the Rust source, tests included)", () => {
    const rs = [...walk("app/src-tauri/src")].filter((f) => f.endsWith(".rs"));
    expect(leftovers(rs, (f) => stripRustComments(read(f)).split("\n"))).toEqual([]);
  });
  test("the stripper really removes comments and keeps strings", () => {
    const s = stripRustComments('let a = "x // not a comment"; // Companion\n/* Companion /* nested */ Companion */ let b = r#"keep Companion"#; let c = \'"\'; /// Companion');
    expect(s).toContain('"x // not a comment"'); expect(s).toContain('r#"keep Companion"#'); expect(s.match(/Companion/g)!.length).toBe(1);
  });
});
