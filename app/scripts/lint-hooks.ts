// M59: the React hooks lint (the rules of hooks, as errors) over every page source file in app/src. A hook called
// conditionally, in a loop, after an early return or outside a component breaks a page as it draws (M76: a hook behind
// `reviewOn &&` stopped Home from drawing at all). Run by scripts/test-all.sh: bun run scripts/lint-hooks.ts
//
// ESLint (with eslint-plugin-react-hooks, a test only dev dependency) reads plain JavaScript, so each file's types are taken
// off first with Bun's own transpiler; the line said is found again in the source by the hook's name.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Linter } from "eslint";
import hooks from "eslint-plugin-react-hooks";

const RULES = { "react-hooks/rules-of-hooks": "error" } as const;
export type Finding = { file: string; line: number; message: string };

const tsx = new Bun.Transpiler({ loader: "tsx" }), ts = new Bun.Transpiler({ loader: "ts" });
const linter = new Linter({ configType: "flat" });
const config = [{ files: ["**/*.js"], languageOptions: { ecmaVersion: "latest" as const, sourceType: "module" as const }, plugins: { "react-hooks": hooks as never }, rules: RULES }];

/** The line in the source for a finding in the transpiled text: the same occurrence of the hook's name. */
function sourceLine(src: string, out: string, outLine: number, outCol: number, message: string): number {
  const hook = /React Hook "([A-Za-z0-9_.]+)"/.exec(message)?.[1]?.split(".").at(-1);
  if (!hook) return outLine;
  const at = out.split("\n").slice(0, outLine - 1).join("\n").length + outCol;
  const re = new RegExp(`\\b${hook}\\b`, "g");
  const nth = [...out.slice(0, at + hook.length).matchAll(re)].length;
  const m = [...src.matchAll(re)][nth - 1];
  return m?.index === undefined ? outLine : src.slice(0, m.index).split("\n").length;
}

/** The rules of hooks over one file's source (TypeScript or TSX). */
export function lintSource(src: string, file = "page.tsx"): Finding[] {
  const out = (file.endsWith(".tsx") ? tsx : ts).transformSync(src);
  return linter.verify(out, config, "page.js").map((r) => ({ file, line: r.fatal ? r.line : sourceLine(src, out, r.line, r.column, r.message), message: r.message }));
}

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return pageFiles(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const files = pageFiles(join(root, "src"));
  const found = files.flatMap((f) => lintSource(readFileSync(f, "utf8"), relative(root, f)));
  for (const x of found) console.log(`${x.file}:${x.line}: ${x.message}`);
  console.log(found.length ? `The rules of hooks: ${found.length} problem${found.length === 1 ? "" : "s"} in ${files.length} files.` : `The rules of hooks: no problems in ${files.length} files.`);
  process.exit(found.length ? 1 : 0);
}
