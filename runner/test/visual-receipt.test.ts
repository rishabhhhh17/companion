// The visual receipt on real small projects: the earlier version is copied out of the snapshot store into a private
// folder, both versions are opened in the hidden browser, and the change is circled. The project is never touched.
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { browserCheck, browserInstalled } from "../src/proof/browser.ts";
import { borrowPackages, borrowVenv, captureBefore, sweepWork } from "../src/proof/before.ts";
import { drawReceipt } from "../src/proof/picture.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-vr-${l}-`))); made.push(d); return d; };
const PAGE = (extra = "", color = "#222") => `<!doctype html><body style="font:16px sans-serif;margin:20px;color:${color}"><h1>My shop</h1><p>Hand made mugs.</p>${extra}</body>`;
const has = browserInstalled();

describe("copying the earlier version out", () => {
  test("the files and the private .env copy as they were, into an empty folder outside the project", async () => {
    const p = tmp("p"), shadow = tmp("s"), out = tmp("o");
    writeFileSync(join(p, "index.html"), "v1"); writeFileSync(join(p, ".env"), "KEY=1");
    const store = new CheckpointStore(shadow, p);
    const a = await store.snapshot("a");
    writeFileSync(join(p, "index.html"), "v2"); writeFileSync(join(p, ".env"), "KEY=2"); writeFileSync(join(p, "new.txt"), "x");
    await store.exportTo(a.id, out);
    expect(readFileSync(join(out, "index.html"), "utf8")).toBe("v1");
    expect(readFileSync(join(out, ".env"), "utf8")).toBe("KEY=1");
    expect(existsSync(join(out, "new.txt"))).toBe(false);
    expect(readFileSync(join(p, "index.html"), "utf8")).toBe("v2");   // the project is untouched
  });
  test("never into the project, and never into a folder that has things in it", async () => {
    const p = tmp("p"), shadow = tmp("s"), full = tmp("f");
    writeFileSync(join(p, "index.html"), "v1"); writeFileSync(join(full, "keep.txt"), "mine");
    const store = new CheckpointStore(shadow, p);
    const a = await store.snapshot("a");
    mkdirSync(join(p, "inside"));
    await expect(store.exportTo(a.id, join(p, "inside"))).rejects.toThrow("outside the project");
    await expect(store.exportTo(a.id, full)).rejects.toThrow("empty folder");
    expect(readFileSync(join(full, "keep.txt"), "utf8")).toBe("mine");
  });
});

describe("borrowing packages and cleaning up", () => {
  test("each package is linked inside a real folder, so caches land in the copy, never in the project", () => {
    const p = tmp("p"), copy = tmp("c");
    mkdirSync(join(p, "node_modules", "react"), { recursive: true }); writeFileSync(join(p, "node_modules", "react", "index.js"), "x");
    mkdirSync(join(p, "node_modules", ".vite"), { recursive: true });
    borrowPackages(join(p, "node_modules"), join(copy, "node_modules"));
    expect(readFileSync(join(copy, "node_modules", "react", "index.js"), "utf8")).toBe("x");
    expect(existsSync(join(copy, "node_modules", ".vite"))).toBe(false);
    mkdirSync(join(copy, "node_modules", ".vite", "deps"), { recursive: true }); writeFileSync(join(copy, "node_modules", ".vite", "deps", "x.js"), "cache");
    expect(readdirSync(join(p, "node_modules", ".vite"))).toEqual([]);
    rmSync(join(copy, "node_modules"), { recursive: true, force: true });
    expect(readFileSync(join(p, "node_modules", "react", "index.js"), "utf8")).toBe("x");   // removing the copy never follows the links
  });
  test("a Python project's virtual environment is borrowed by one link; removing the copy leaves the project's own alone", () => {
    const p = tmp("p"), copy = tmp("c");
    mkdirSync(join(p, ".venv", "bin"), { recursive: true }); writeFileSync(join(p, ".venv", "bin", "python"), "#!/bin/sh\n"); writeFileSync(join(p, ".venv", "pyvenv.cfg"), "home = /x\n");
    borrowVenv(p, copy);
    expect(readFileSync(join(copy, ".venv", "pyvenv.cfg"), "utf8")).toBe("home = /x\n");
    rmSync(copy, { recursive: true, force: true });
    expect(readFileSync(join(p, ".venv", "pyvenv.cfg"), "utf8")).toBe("home = /x\n");
  });
  test("an earlier Python version that cannot start only because a package is missing is 'not pictured', never 'crashed'", async () => {
    const p = tmp("p"), shadow = tmp("s"), work = tmp("w");
    writeFileSync(join(p, "requirements.txt"), "flask\n");
    writeFileSync(join(p, "main.py"), "from flask import Flask\napp = Flask(__name__)\n");
    mkdirSync(join(p, ".venv", "bin"), { recursive: true }); writeFileSync(join(p, ".venv", "pyvenv.cfg"), "home = /x\n");
    writeFileSync(join(p, ".venv", "bin", "python"), `#!${process.execPath}\nconsole.error(".venv/bin/python: No module named flask"); process.exit(1);\n`); chmodSync(join(p, ".venv", "bin", "python"), 0o755);
    const store = new CheckpointStore(shadow, p);
    const before = await store.snapshot("before");
    expect(await captureBefore({ store, beforeId: before.id, project: p, workDir: work, startMs: 10000 })).toEqual({ none: "not_pictured" });
    expect(readdirSync(work)).toEqual([]);
    expect(existsSync(join(p, ".venv", "bin", "python"))).toBe(true);
  }, 30000);
  test("leftovers from a run that was cut off are swept, and nothing else", () => {
    const w = tmp("w");
    mkdirSync(join(w, "before-abc")); writeFileSync(join(w, "before-abc", ".env"), "KEY=1"); writeFileSync(join(w, "other.txt"), "keep");
    sweepWork(w);
    expect(readdirSync(w)).toEqual(["other.txt"]);
  });
});

describe.skipIf(!has)("the before and after pictures", () => {
  test("a new button is found and circled; the private folder is gone afterwards", async () => {
    const p = tmp("p"), shadow = tmp("s"), work = tmp("w");
    writeFileSync(join(p, "index.html"), PAGE());
    const store = new CheckpointStore(shadow, p);
    const before = await store.snapshot("before");
    writeFileSync(join(p, "index.html"), PAGE(`<button style="font-size:20px">Add to cart</button>`));
    const b = await captureBefore({ store, beforeId: before.id, project: p, workDir: work });
    expect("shot" in b).toBe(true);
    expect(readdirSync(work)).toEqual([]);
    const after = await browserCheck(`file://${join(p, "index.html")}`, { shot: true, clickButtons: false });
    const pic = await drawReceipt("shot" in b ? b.shot : null, after.shot!);
    expect(pic.how).toBe("page");
    expect(pic.regions).toHaveLength(1);
    expect(pic.regions[0].y).toBeGreaterThan(80);
    expect(Buffer.from(pic.jpeg, "base64").subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  }, 60000);
  test("same words, new colour: the pictures are compared instead", async () => {
    const p = tmp("p"), shadow = tmp("s"), work = tmp("w");
    writeFileSync(join(p, "index.html"), PAGE());
    const store = new CheckpointStore(shadow, p);
    const before = await store.snapshot("before");
    writeFileSync(join(p, "index.html"), PAGE("", "#e00000"));
    const b = await captureBefore({ store, beforeId: before.id, project: p, workDir: work });
    const after = await browserCheck(`file://${join(p, "index.html")}`, { shot: true, clickButtons: false });
    const pic = await drawReceipt("shot" in b ? b.shot : null, after.shot!);
    expect(pic.how).toBe("pixels");
    expect(pic.regions.length).toBeGreaterThan(0);
    expect(pic.regions[0].y).toBeLessThan(150);
  }, 60000);
  test("a project that had no page before: everything is new", async () => {
    const p = tmp("p"), shadow = tmp("s"), work = tmp("w");
    writeFileSync(join(p, "notes.txt"), "plans");
    const store = new CheckpointStore(shadow, p);
    const before = await store.snapshot("before");
    expect(await captureBefore({ store, beforeId: before.id, project: p, workDir: work })).toEqual({ none: "no_page" });
  }, 60000);
  test("nothing changed: nothing is circled and the picture is the page as it is", async () => {
    const p = tmp("p"), shadow = tmp("s"), work = tmp("w");
    writeFileSync(join(p, "index.html"), PAGE());
    const store = new CheckpointStore(shadow, p);
    const before = await store.snapshot("before");
    const b = await captureBefore({ store, beforeId: before.id, project: p, workDir: work });
    const after = await browserCheck(`file://${join(p, "index.html")}`, { shot: true, clickButtons: false });
    const pic = await drawReceipt("shot" in b ? b.shot : null, after.shot!);
    expect(pic.regions).toEqual([]); expect(pic.how).toBe("none");
  }, 60000);
  test("a server that crashes on start is told apart from one that was only slow", async () => {
    const p = tmp("p"), shadow = tmp("s"), work = tmp("w");
    writeFileSync(join(p, "package.json"), JSON.stringify({ name: "x", scripts: { dev: "bun server.js" } })); writeFileSync(join(p, "server.js"), "throw new Error('boom')");
    const store = new CheckpointStore(shadow, p);
    const before = await store.snapshot("before");
    expect(await captureBefore({ store, beforeId: before.id, project: p, workDir: work })).toEqual({ none: "crashed" });
    writeFileSync(join(p, "server.js"), "setInterval(() => {}, 1000)");
    const slow = await store.snapshot("slow");
    expect(await captureBefore({ store, beforeId: slow.id, project: p, workDir: work, startMs: 1500 })).toEqual({ none: "not_pictured" });
    expect(readdirSync(work)).toEqual([]);
  }, 60000);
  test("Stop closes the hidden browser at once", async () => {
    const p = tmp("p"); writeFileSync(join(p, "index.html"), "<h1>x</h1><script>while(true){}</script>");
    const ac = new AbortController();
    const t0 = Date.now();
    setTimeout(() => ac.abort(), 300);
    const r = await browserCheck(`file://${join(p, "index.html")}`, { shot: true, clickButtons: false, timeoutMs: 20000, signal: ac.signal });
    expect(r.skipped).toBe("Stopped.");
    expect(Date.now() - t0).toBeLessThan(5000);
  }, 60000);
  test("Stop: nothing is started and the private folder is gone", async () => {
    const p = tmp("p"), shadow = tmp("s"), work = tmp("w");
    writeFileSync(join(p, "index.html"), PAGE());
    const store = new CheckpointStore(shadow, p);
    const before = await store.snapshot("before");
    const ac = new AbortController(); ac.abort();
    expect(await captureBefore({ store, beforeId: before.id, project: p, workDir: work, signal: ac.signal })).toEqual({ none: "cancelled" });
    expect(readdirSync(work)).toEqual([]);
  }, 60000);
});
