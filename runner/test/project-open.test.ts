// Opening a project: what it is, installing its packages on request, and copying one from a link.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { cloneTarget } from "../src/proof/clone.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-po-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
function runner() {
  const events: Event[] = [];
  const r = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e) });
  const cmd = (c: Record<string, unknown>) => r.handle({ v: 1, id: "c" + Math.random(), ...c } as never);
  return { r, events, cmd };
}

describe("about this project", () => {
  test("a report with the plain sentence, names of missing settings only", async () => {
    const p = tmp("p");
    writeFileSync(join(p, "package.json"), JSON.stringify({ name: "x", scripts: { dev: "vite" }, dependencies: { react: "1" }, devDependencies: { vite: "1", "lovable-tagger": "1" } }));
    mkdirSync(join(p, "src")); writeFileSync(join(p, "src", "a.ts"), "import.meta.env.VITE_API_URL");
    const t = runner(); await t.cmd({ type: "project.inspect", project: p });
    expect(of(t.events, "project.report")[0]).toMatchObject({ project: p, origin: "lovable", about: "A Lovable project: Vite + React.", needsInstall: true, installCommand: "npm install", missing: ["VITE_API_URL"], missingCount: 1 });
  });
  test("a long list is cut to twelve names, with the full count", async () => {
    const p = tmp("p");
    writeFileSync(join(p, "index.js"), Array.from({ length: 20 }, (_, i) => `process.env.KEY_${i}`).join(";"));
    const t = runner(); await t.cmd({ type: "project.inspect", project: p });
    const r = of(t.events, "project.report")[0];
    expect(r.missing).toHaveLength(12); expect(r.missingCount).toBe(20);
  });
});

describe("installing packages, only when asked", () => {
  test("a real install of a local package, then a fresh report", async () => {
    const p = tmp("p");
    mkdirSync(join(p, "lib")); writeFileSync(join(p, "lib", "package.json"), JSON.stringify({ name: "lib", version: "1.0.0" }));
    writeFileSync(join(p, "package.json"), JSON.stringify({ name: "x", version: "1.0.0", dependencies: { lib: "file:./lib" } }));
    const t = runner(); await t.cmd({ type: "project.install", project: p });
    const stages = of(t.events, "project.install").map((x) => x.stage);
    expect(stages).toEqual(["installing", "done"]);
    expect(existsSync(join(p, "node_modules", "lib"))).toBe(true);
    expect(of(t.events, "project.report")[0].needsInstall).toBe(false);
  }, 120000);
  test("nothing to install without a package list", async () => {
    const t = runner(); await t.cmd({ type: "project.install", project: tmp("p") });
    expect(of(t.events, "project.install")[0]).toMatchObject({ stage: "failed" });
  });
  test("a Go, Rust, Java, Kotlin or Swift project has no packages for the Install button: its build fetches them, and the words say how to do it yourself", async () => {
    const p = tmp("p");
    writeFileSync(join(p, "go.mod"), "module x\n\nrequire github.com/google/uuid v1.6.0\n");
    const t = runner(); await t.cmd({ type: "project.install", project: p });
    const e = of(t.events, "project.install")[0];
    expect(e).toMatchObject({ stage: "failed" });
    expect(e.detail).toMatch(/Go projects fetch their packages when they are built/);
    expect(e.detail).toContain("go mod download");
    expect(e.detail).not.toMatch(/package\.json/);
  });
  test("Stop everything ends an install", async () => {
    const p = tmp("p");
    writeFileSync(join(p, "package.json"), JSON.stringify({ name: "x", version: "1.0.0", scripts: { preinstall: "sleep 30" } }));
    const t = runner();
    const going = t.cmd({ type: "project.install", project: p });
    await Bun.sleep(500);
    await t.cmd({ type: "agent.interruptAll", reason: "stop" });
    await going;
    expect(of(t.events, "project.install").at(-1).stage).toBe("cancelled");
  }, 60000);
});

describe("opening a project from a link", () => {
  test("only plain https links to a repository", () => {
    expect(cloneTarget("https://github.com/me/mug-shop")).toEqual({ url: "https://github.com/me/mug-shop.git", name: "mug-shop" });
    expect(cloneTarget(" https://gitlab.com/team/site.git/ ")).toEqual({ url: "https://gitlab.com/team/site.git", name: "site" });
    for (const bad of ["git@github.com:me/x.git", "http://github.com/me/x", "https://github.com/me", "https://evil.com/me/x", "https://github.com/me/x;rm -rf ~", "https://github.com/me/../x", "https://github.com/me/x/tree/main", "file:///etc"]) expect(cloneTarget(bad)).toBeNull();
  });
  test("never into a folder that is already there, and a bad link says how it should look", async () => {
    const parent = tmp("parent"); mkdirSync(join(parent, "mug-shop"));
    const t = runner();
    await t.cmd({ type: "project.clone", url: "https://github.com/me/mug-shop", parent });
    await t.cmd({ type: "project.clone", url: "not a link", parent });
    const r = of(t.events, "project.cloned");
    expect(r[0]).toMatchObject({ ok: false }); expect(r[0].detail).toContain("already a folder");
    expect(r[1].detail).toContain("https://github.com/name/project");
    expect(readdirSync(join(parent, "mug-shop"))).toEqual([]);
  });
});
