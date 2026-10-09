import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askSignals, projectFacts } from "../src/memory/learn.ts";
import { screenLine } from "../src/memory/filter.ts";

const made: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "learn-")); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

describe("what the project folder tells us", () => {
  test("the stack, how to run and test it, and where it deploys", () => {
    const d = tmp();
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "shop", scripts: { dev: "vite", build: "vite build", test: "vitest" }, dependencies: { react: "1", "@supabase/supabase-js": "1" }, devDependencies: { vite: "1", tailwindcss: "1" } }));
    writeFileSync(join(d, "pnpm-lock.yaml"), ""); writeFileSync(join(d, "vercel.json"), "{}");
    const facts = projectFacts(d).map((f) => f.text);
    expect(facts).toContain("Built with React, Vite, Supabase, Tailwind");
    expect(facts).toContain("Start it with: pnpm run dev");
    expect(facts).toContain("Check it with: pnpm run test");
    expect(facts).toContain("Deploys to Vercel");
    for (const f of projectFacts(d)) expect(f.source).toMatch(/package\.json|vercel\.json/);
  });
  test("a plain website folder is described as one", () => {
    const d = tmp(); writeFileSync(join(d, "index.html"), "<h1>hi</h1>");
    expect(projectFacts(d).map((f) => f.text)).toContain("A plain website (index.html)");
  });
  test("an empty or unreadable folder gives nothing and does not throw", () => {
    expect(projectFacts(tmp())).toEqual([]);
    expect(projectFacts("/nowhere/at/all")).toEqual([]);
    const d = tmp(); writeFileSync(join(d, "package.json"), "{ not json");
    expect(projectFacts(d)).toEqual([]);
  });
  test("every fact passes the memory filter, and values from .env files are never read", () => {
    const d = tmp(); writeFileSync(join(d, ".env"), "STRIPE_KEY=sk_live_abcdefghijklmnop1234"); mkdirSync(join(d, "supabase"));
    writeFileSync(join(d, "package.json"), JSON.stringify({ scripts: { dev: "vite" }, dependencies: { stripe: "1" } }));
    for (const f of projectFacts(d)) { expect(screenLine(f.text).ok).toBe(true); expect(f.text).not.toContain("sk_live"); }
  });
});

describe("what a person says while asking", () => {
  test("a stated preference about answers becomes a profile line, with what they said as the source", () => {
    const s = askSignals("please make the answers shorter and use simpler words");
    expect(s.map((x) => x.text)).toEqual(expect.arrayContaining(["Prefers short answers", "Prefers plain words, no jargon"]));
    expect(s.every((x) => x.scope === "profile" && x.source.length > 0)).toBe(true);
  });
  test("a never touch correction becomes a project line", () => {
    expect(askSignals("never touch the auth folder again")).toEqual([{ scope: "project", text: "Never touch the auth folder", source: 'you said "never touch the auth folder"' }]);
  });
  test("a preferred tool becomes a project line", () => {
    expect(askSignals("use Tailwind for this").map((x) => x.text)).toContain("Prefers Tailwind");
  });
  test("ordinary requests teach nothing", () => {
    expect(askSignals("add a contact page with a form")).toEqual([]);
    expect(askSignals("")).toEqual([]);
  });
  test("a request that mentions private things teaches nothing from those parts", () => {
    for (const s of askSignals("I'm stressed and my wife says keep it shorter")) expect(screenLine(s.text).ok).toBe(true);
  });
});
