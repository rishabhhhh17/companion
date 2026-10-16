// "It works on my Mac but the deploy failed": a failed Vercel build log becomes one place in the person's project (a
// file and line, confirmed in this folder), or the name of the missing setting, or at least the sentence that matters.
//
// The logs in fixtures/buildlogs are what `vercel inspect <url> --logs` prints (the CLI's first line, then
// "<ISO time>  <text>" per build line, then "status ● Error", as read from the Vercel CLI 53.4.0 package). Where the build
// tool's own words come from:
// - Real, captured on this Mac on 16 Oct 2026: next-type-error (Next.js 14.2.35), next-module-case (Next.js 14.2.35, a
//   missing import, then written in small letters to stand for a file named with a capital, which only Linux rejects),
//   next-prerender-env (Next.js 14.2.35, paths changed to Vercel's /vercel/path0), vite8-unresolved (Vite 8.3.3 with
//   Rolldown, the import's name changed), tsc-error (TypeScript 7.0.2).
// - Written by hand in the tools' known formats: vite5-rollup-import (Vite 5 with Rollup), prisma-env (Prisma 5),
//   output-dir (Vercel's missing output folder), next-eslint (Next.js 14 ESLint), no-clue.
// The Vercel lines around them (Running build in, Cloning, Running "npm run build", Command ... exited with 1) are written
// by hand in Vercel's format. None of these came from a real Vercel deployment; that needs the founder's account.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildLogLines, readBuildLog } from "../src/ship/buildlog.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
function project(files: Record<string, string>): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-blog-")));
  made.push(d);
  for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); }
  return d;
}
// Kept as .txt: the repo ignores *.log files, so a .log fixture would never be committed.
const log = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "buildlogs", `${name}.txt`), "utf8");

const PAGE = 'type Product = { name: string; price: number };\n\nconst products: Product[] = [{ name: "Mug", price: 12 }];\n\nexport default function Home() {\n  const total: number = products.map((p) => p.price).join(", ");\n  return (\n    <main>\n      <h1>Shop</h1>\n      <p>{total}</p>\n    </main>\n  );\n}\n';

describe("reading the log", () => {
  test("the CLI's times and colours are taken off, the words are kept", () => {
    const lines = buildLogLines(log("next-type-error"));
    expect(lines).toContain("./app/page.tsx:6:9");
    expect(lines).toContain("Type error: Type 'string' is not assignable to type 'number'.");
    expect(lines.some((l) => l.includes("\u001b["))).toBe(false);
    expect(lines.some((l) => /^\d{4}-\d{2}-\d{2}T/.test(l))).toBe(false);
  });
});

describe("a file and a line, confirmed in this folder", () => {
  test("Next.js type error: the line Vercel's build stopped at, with its words", () => {
    const p = project({ "app/page.tsx": PAGE });
    expect(readBuildLog(log("next-type-error"), p)).toEqual({ problem: { kind: "line", file: "app/page.tsx", line: 6, column: 9, lineText: 'const total: number = products.map((p) => p.price).join(", ");', message: "Type error: Type 'string' is not assignable to type 'number'.", from: "deploy" } });
  });
  test("when that line reads differently in this folder, nothing is ringed: it says so instead of pointing at the wrong line", () => {
    const p = project({ "app/page.tsx": PAGE.replace("const total: number", "const total: string") });
    const r = readBuildLog(log("next-type-error"), p)!;
    expect(r.problem.kind).toBe("message");
    expect(r.problem.message).toMatch(/app\/page\.tsx, line 6/);
    expect(r.problem.message).toMatch(/different in this folder/);
  });
  test("TypeScript's own checker (tsc -b before vite build)", () => {
    const p = project({ "src/cart.ts": 'export type Item = { name: string; price: number };\n\nexport function total(items: Item[]): number {\n  return items.reduce((sum, i) => sum + i.price, 0);\n}\n\nexport const label: string = total([{ name: "Mug", price: 12 }]);\n' });
    expect(readBuildLog(log("tsc-error"), p)?.problem).toMatchObject({ kind: "line", file: "src/cart.ts", line: 7, column: 14, message: "Type 'number' is not assignable to type 'string'." });
  });
  test("Next.js lint: the error, not the warning above it", () => {
    const p = project({ "components/Nav.tsx": Array.from({ length: 14 }, (_, i) => (i === 11 ? "  const [open, setOpen] = useState(false);" : `// line ${i + 1}`)).join("\n") });
    const r = readBuildLog(log("next-eslint"), p)!;
    expect(r.problem).toMatchObject({ kind: "line", file: "components/Nav.tsx", line: 12, column: 7 });
    expect(r.problem.message).toMatch(/^React Hook "useState" is called conditionally/);
  });
});

describe("an import that only fails on Vercel", () => {
  test("Next.js: a file named with a capital, asked for in small letters (fine on a Mac, not on Vercel)", () => {
    const p = project({ "app/page.tsx": 'import Header from "./components/header";\n\nexport default function Home() {\n  return <Header />;\n}\n', "app/components/Header.tsx": "export default function Header() { return null; }\n" });
    const r = readBuildLog(log("next-module-case"), p)!;
    expect(r.problem).toMatchObject({ kind: "line", file: "app/page.tsx", line: 1, lineText: 'import Header from "./components/header";', from: "deploy" });
    expect(r.problem.message).toContain("Header.tsx");
    expect(r.problem.message).toMatch(/capital letters/);
  });
  test("Vite 5 (Rollup), with Vercel's /vercel/path0 paths", () => {
    const p = project({ "src/App.tsx": 'import { useState } from "react";\n\nimport Navbar from "./components/navbar";\n', "src/components/Navbar.tsx": "export default function Navbar() { return null; }\n" });
    const r = readBuildLog(log("vite5-rollup-import"), p)!;
    expect(r.problem).toMatchObject({ kind: "line", file: "src/App.tsx", line: 3 });
    expect(r.problem.message).toContain("Navbar.tsx");
  });
  test("Vite 8 (Rolldown): a file that is not there at all", () => {
    const p = project({ "src/main.ts": 'import { header } from "./components/Navbar";\n\ndocument.getElementById("root")!.textContent = header;\n', "src/components/Header.ts": 'export const header = "Shop";\n' });
    const r = readBuildLog(log("vite8-unresolved"), p)!;
    expect(r.problem).toMatchObject({ kind: "line", file: "src/main.ts", line: 1 });
    expect(r.problem.message).toBe('Vercel could not find "./components/Navbar". There is no file by that name in this project.');
  });
});

describe("a missing setting, by name and never by value", () => {
  test("Supabase's address: the line that reads it is ringed, and the person learns their Mac has it in .env.local", () => {
    const p = project({ "lib/supabase.ts": 'const url = process.env.NEXT_PUBLIC_SUPABASE_URL;\n\nexport function getClient() {\n  if (!url) throw new Error("supabaseUrl is required.");\n  return { url };\n}\n', "app/page.tsx": "x\n", ".env.local": "NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiJ9.secret\n" });
    const r = readBuildLog(log("next-prerender-env"), p)!;
    expect(r.setting).toBe("NEXT_PUBLIC_SUPABASE_URL");
    expect(r.problem).toMatchObject({ kind: "line", file: "lib/supabase.ts", line: 1, from: "deploy" });
    expect(r.problem.message).toBe("NEXT_PUBLIC_SUPABASE_URL is not set on Vercel. Your Mac has it in .env.local, which Vercel never sees. Add it in your Vercel project under Settings, Environment Variables.");
    expect(JSON.stringify(r)).not.toMatch(/abcdefgh|eyJ/);
  });
  test("with no copy on the Mac either, it only says it is not set on Vercel", () => {
    const p = project({ "lib/supabase.ts": "const url = process.env.NEXT_PUBLIC_SUPABASE_URL;\n" });
    expect(readBuildLog(log("next-prerender-env"), p)?.problem.message).toBe("NEXT_PUBLIC_SUPABASE_URL is not set on Vercel. Add it in your Vercel project under Settings, Environment Variables.");
  });
  test("Prisma names the setting itself, and the schema line that reads it is ringed", () => {
    const p = project({ "prisma/schema.prisma": 'generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n' });
    const r = readBuildLog(log("prisma-env"), p)!;
    expect(r.setting).toBe("DATABASE_URL");
    expect(r.problem).toMatchObject({ kind: "line", file: "prisma/schema.prisma", line: 7 });
  });
  test("a Vercel project setting (Output Directory) is named, with where to change it", () => {
    const r = readBuildLog(log("output-dir"), project({ "index.html": "x" }))!;
    expect(r.setting).toBe("Output Directory");
    expect(r.problem.kind).toBe("message");
    expect(r.problem.message).toContain("dist");
    expect(r.problem.message).toContain("Output Directory");
  });
});

describe("when the log does not say where", () => {
  test("the last line ('exited with 1') is never passed off as the cause", () => {
    const r = readBuildLog(log("no-clue"), project({ "index.html": "x" }))!;
    expect(r.problem).toEqual({ kind: "message", message: 'Vercel\'s build stopped (Command "npm run build" exited with 1), but the log does not say where.', from: "deploy" });
  });
  test("files the person did not write are never ringed, and secrets in the log are hidden", () => {
    const p = project({ "node_modules/pay/index.js": "a\nb\nc\n" });
    const text = "2026-10-10T10:00:01.000Z  /vercel/path0/node_modules/pay/index.js:2:1\n2026-10-10T10:00:01.000Z  Error: Invalid API key sk_live_51Habcdefghijklmnopqrstuv\n2026-10-10T10:00:02.000Z  Error: Command \"npm run build\" exited with 1\n";
    const r = readBuildLog(text, p)!;
    expect(r.problem.kind).toBe("message");
    expect(r.problem.message).not.toContain("sk_live_51Habcdef");
    expect(r.problem.message).toMatch(/Invalid API key/);
  });
  test("an empty log gives nothing", () => {
    expect(readBuildLog("Vercel CLI 53.4.0\nstatus\t● Error\n", project({ "a.txt": "" }))).toBeNull();
  });
});

// Shorter shapes, written by hand in each tool's format (none captured here): one line of the build each.
describe("other tools' words", () => {
  const at = (...rows: string[]) => rows.map((r, i) => `2026-10-10T10:00:${String(i).padStart(2, "0")}.000Z  ${r}`).join("\n") + "\n";
  const APP = { "src/App.tsx": "import { useState } from 'react';\n\nexport default function App() {\n  return <h1>Hi</h1>\n}\n" };
  test("Turbopack (Next.js 15 and 16): the place after 'Turbopack build failed'", () => {
    const p = project({ "app/page.tsx": "import x from './y';\nexport default function P() {\n  return <p>{x}</p>;\n}\n" });
    expect(readBuildLog(at("> Build error occurred", "Error: Turbopack build failed with 1 errors:", "./app/page.tsx:3:3", "Parsing ecmascript source code failed", "> 3 |   return <p>{x}</p>;"), p)?.problem).toMatchObject({ kind: "line", file: "app/page.tsx", line: 3, message: "Parsing ecmascript source code failed" });
  });
  test("esbuild inside Vite 4 and 5", () => {
    expect(readBuildLog(at("[vite:esbuild] Transform failed with 1 error:", "/vercel/path0/src/App.tsx:4:20: ERROR: Expected \";\" but found \"}\""), project(APP))?.problem).toMatchObject({ kind: "line", file: "src/App.tsx", line: 4, column: 20, message: 'Expected ";" but found "}"' });
  });
  test("Rollup naming a place in brackets", () => {
    expect(readBuildLog(at('src/App.tsx (1:9): "useStat" is not exported by "node_modules/react/index.js", imported by "src/App.tsx".'), project(APP))?.problem).toMatchObject({ kind: "line", file: "src/App.tsx", line: 1, column: 9 });
  });
  test("a setting named in the tool's own words (OpenAI's client)", () => {
    const p = project({ "lib/ai.ts": "import OpenAI from 'openai';\nexport const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });\n" });
    const r = readBuildLog(at("Error: The OPENAI_API_KEY environment variable is missing or empty; either provide it, or instantiate the OpenAI client with an apiKey option, like new OpenAI({ apiKey: 'My API Key' })."), p)!;
    expect(r.setting).toBe("OPENAI_API_KEY");
    expect(r.problem).toMatchObject({ kind: "line", file: "lib/ai.ts", line: 2 });
  });
  test("Vercel's Root Directory, a missing build script, and a build tool that is not installed", () => {
    expect(readBuildLog(at('Error: No Next.js version detected. Make sure your package.json has "next" in either "dependencies" or "devDependencies". Also check your Root Directory setting matches the directory of your package.json file.'), project(APP))).toMatchObject({ setting: "Root Directory" });
    expect(readBuildLog(at('npm error Missing script: "build"'), project(APP))?.problem.message).toBe('package.json has no "build" script, so Vercel had nothing to run.');
    expect(readBuildLog(at("sh: line 1: vite: command not found", 'Error: Command "vite build" exited with 127'), project(APP))?.problem.message).toBe("The build could not run vite: it is not installed on Vercel. Check that vite is in package.json.");
  });
  test("a package that is not in package.json", () => {
    const p = project({ ...APP, "package.json": JSON.stringify({ dependencies: { react: "18.3.1" } }), "src/main.tsx": "import confetti from 'canvas-confetti';\n" });
    const r = readBuildLog(at('[vite]: Rollup failed to resolve import "canvas-confetti" from "/vercel/path0/src/main.tsx".'), p)!;
    expect(r.problem).toMatchObject({ kind: "line", file: "src/main.tsx", line: 1 });
    expect(r.problem.message).toBe('Vercel could not find the package "canvas-confetti". It is not in package.json, so Vercel did not install it. Add it to package.json.');
  });
  test("a file that is here but was never pushed (Vercel builds from GitHub)", () => {
    const p = project({ "src/App.tsx": "import Nav from './Nav';\n", "src/Nav.tsx": "export default 1;\n" });
    expect(readBuildLog(at('[vite]: Rollup failed to resolve import "./Nav" from "/vercel/path0/src/App.tsx".'), p)?.problem.message).toMatch(/is in this folder.*pushed/);
  });
});

// TypeScript runs before the bundler in many projects (tsc -b && vite build, Next.js's type check), so a file named with a
// capital letter often shows up first as TypeScript's "Cannot find module". Written by hand in tsc's and Next.js's formats.
describe("TypeScript's 'Cannot find module'", () => {
  const at = (...rows: string[]) => rows.map((r, i) => `2026-10-10T10:00:${String(i).padStart(2, "0")}.000Z  ${r}`).join("\n") + "\n";
  test("tsc: a file named with a capital is explained, and the import line is ringed", () => {
    const p = project({ "src/App.tsx": 'import { useState } from "react";\nimport Navbar from "./components/navbar";\n', "src/components/Navbar.tsx": "export default function Navbar() { return null; }\n" });
    const r = readBuildLog(at("src/App.tsx(2,20): error TS2307: Cannot find module './components/navbar' or its corresponding type declarations.", 'Error: Command "npm run build" exited with 2'), p)!;
    expect(r.problem).toMatchObject({ kind: "line", file: "src/App.tsx", line: 2, column: 20, lineText: 'import Navbar from "./components/navbar";', from: "deploy" });
    expect(r.problem.message).toContain("Navbar.tsx");
    expect(r.problem.message).toMatch(/capital letters/);
  });
  test("Next.js's type check, through the @/ alias in tsconfig.json", () => {
    const p = project({ "tsconfig.json": '{\n  // made by create-next-app\n  "compilerOptions": { "paths": { "@/*": ["./src/*"] } }\n}\n', "src/app/page.tsx": 'import Header from "@/components/header";\n\nexport default function Home() {\n  return <Header />;\n}\n', "src/components/Header.tsx": "export default function Header() { return null; }\n" });
    const r = readBuildLog(at("Failed to compile.", "", "./src/app/page.tsx:1:20", "Type error: Cannot find module '@/components/header' or its corresponding type declarations.", "", "> 1 | import Header from \"@/components/header\";"), p)!;
    expect(r.problem).toMatchObject({ kind: "line", file: "src/app/page.tsx", line: 1, column: 20 });
    expect(r.problem.message).toContain("Header.tsx");
  });
  test("a module that is missing for another reason keeps TypeScript's own words (a stylesheet with no type declarations)", () => {
    const p = project({ "src/Button.tsx": 'import styles from "./Button.module.css";\n', "src/Button.module.css": ".b { color: red; }\n" });
    const r = readBuildLog(at("src/Button.tsx(1,20): error TS2307: Cannot find module './Button.module.css' or its corresponding type declarations."), p)!;
    expect(r.problem).toMatchObject({ kind: "line", file: "src/Button.tsx", line: 1, message: "Cannot find module './Button.module.css' or its corresponding type declarations." });
  });
  test("a package keeps TypeScript's own words too (its types may be what is missing)", () => {
    const p = project({ "package.json": JSON.stringify({ dependencies: { "canvas-confetti": "1.9.3" } }), "src/main.ts": 'import confetti from "canvas-confetti";\n' });
    expect(readBuildLog(at("src/main.ts(1,22): error TS2307: Cannot find module 'canvas-confetti' or its corresponding type declarations."), p)?.problem).toMatchObject({ kind: "line", file: "src/main.ts", line: 1, message: "Cannot find module 'canvas-confetti' or its corresponding type declarations." });
  });
});

describe("Supabase's settings", () => {
  const at = (...rows: string[]) => rows.map((r, i) => `2026-10-10T10:00:${String(i).padStart(2, "0")}.000Z  ${r}`).join("\n") + "\n";
  test("its server client (@supabase/ssr) needs two settings: both are named, never their values, and the line that reads them is ringed", () => {
    const p = project({ "lib/supabase/server.ts": 'import { createServerClient } from "@supabase/ssr";\n\nexport function client() {\n  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: {} as never });\n}\n', ".env.local": "NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiJ9.secret\n" });
    const r = readBuildLog(at("Error: Your project's URL and Key are required to create a Supabase client!", "", "Check your Supabase project's API settings to find these values", "", "https://supabase.com/dashboard/project/_/settings/api", "    at /vercel/path0/.next/server/app/page.js:1:2360", 'Error: Command "npm run build" exited with 1'), p)!;
    expect(r.setting).toBe("NEXT_PUBLIC_SUPABASE_URL");
    expect(r.problem).toMatchObject({ kind: "line", file: "lib/supabase/server.ts", line: 4, from: "deploy" });
    expect(r.problem.message).toBe("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set on Vercel. Your Mac has them in .env.local, which Vercel never sees. Add them in your Vercel project under Settings, Environment Variables.");
    expect(JSON.stringify(r)).not.toMatch(/abcdefgh|eyJ/);
  });
  test("its service role key ('supabaseKey is required') is named too", () => {
    const p = project({ "lib/admin.ts": 'import { createClient } from "@supabase/supabase-js";\nexport const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);\n' });
    const r = readBuildLog(at("Error: supabaseKey is required."), p)!;
    expect(r.setting).toBe("SUPABASE_SERVICE_ROLE_KEY");
    expect(r.problem).toMatchObject({ kind: "line", file: "lib/admin.ts", line: 2 });
  });
});
