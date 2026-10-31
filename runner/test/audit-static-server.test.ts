// The browser check's own server for a plain folder of files (server.ts serveStatic). Security audit lead 3
// (~/security-audit-skill/companion/run-1/NEEDS-VALIDATION.md): it served dotfiles (.env, .git/config) and the target of
// any link inside the folder, to any program on this Mac that asked, under any host name. Now it serves only files whose
// real place is inside the folder (or, for the earlier version's copy, the project its packages are borrowed from), never
// a dotfile or anything inside a dot folder, and only to requests for its own address. Temporary folders only.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/proof/server.ts";

const made: string[] = [];
const stops: (() => Promise<void>)[] = [];
afterEach(async () => { while (stops.length) await stops.pop()!(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
// Not put through realpath on purpose: on a Mac the temporary folder sits behind a link (/var -> /private/var).
const scratch = () => { const d = mkdtempSync(join(tmpdir(), "companion-static-")); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); } return root; };

/** One plain HTTP request with the Host header given, the way another program on this Mac (or a page that rebinds a
 *  name to 127.0.0.1) could send it. Gives back the status and the body. */
function raw(port: number, path: string, host = `127.0.0.1:${port}`): Promise<{ status: number; body: string }> {
  return new Promise((res, rej) => {
    const s = connect(port, "127.0.0.1");
    let got = "";
    s.on("data", (c) => { got += c.toString("utf8"); });
    s.on("end", () => { const status = Number(/^HTTP\/1\.\d (\d{3})/.exec(got)?.[1] ?? 0); res({ status, body: got.split("\r\n\r\n").slice(1).join("\r\n\r\n") }); });
    s.on("error", rej);
    s.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
  });
}

async function serve(dir: string, extra: { cwd?: string; borrowedFrom?: string } = {}) {
  const r = await startServer({ kind: "static", dir }, { cwd: extra.cwd ?? dir, timeoutMs: 5000, ...(extra.borrowedFrom ? { borrowedFrom: extra.borrowedFrom } : {}) });
  if (!r.ok) throw new Error(r.reason);
  stops.push(r.stop);
  return r;
}

describe("the static server for the browser check", () => {
  test("never serves a dotfile or anything in a dot folder", async () => {
    const proj = put(join(scratch(), "proj"), {
      "index.html": "<h1>ok</h1>", ".env": "DUMMY_SECRET=canary-env", ".git/config": "[remote] url = canary-git",
      ".claude/settings.json": "canary-claude", "assets/.hidden": "canary-hidden", "assets/app.js": "1",
    });
    symlinkSync(join(proj, ".env"), join(proj, "env-alias"));   // a plain name that is really the dotfile
    const r = await serve(proj);
    expect((await raw(r.port, "/")).body).toContain("<h1>ok</h1>");
    expect((await raw(r.port, "/assets/app.js")).status).toBe(200);
    for (const p of ["/.env", "/.git/config", "/.claude/settings.json", "/assets/.hidden", "/%2Eenv", "/assets/%2ehidden", "/.git/", "/assets/..%2F.env", "/env-alias"]) {
      const got = await raw(r.port, p);
      expect(got.status, p).toBe(404);
      expect(got.body, p).not.toContain("canary");
    }
  });

  test("never serves a link's target outside the folder, and still serves one that stays inside", async () => {
    const top = scratch();
    put(top, { "outside/canary.txt": "canary-outside", "outside/dir/inner.txt": "canary-dir" });
    const proj = put(join(top, "proj"), { "index.html": "<h1>ok</h1>", "real/inside.txt": "inside ok" });
    symlinkSync(join(top, "outside/canary.txt"), join(proj, "leak"));
    symlinkSync(join(top, "outside/dir"), join(proj, "leakdir"));
    symlinkSync(join(top, "outside"), join(proj, "linked"));   // a linked folder with an index.html beneath would be the same
    put(top, { "outside/index.html": "canary-index" });
    symlinkSync(join(proj, "real/inside.txt"), join(proj, "alias.txt"));
    const r = await serve(proj);
    for (const p of ["/leak", "/leakdir/inner.txt", "/linked/", "/linked/canary.txt"]) {
      const got = await raw(r.port, p);
      expect(got.status, p).toBe(404);
      expect(got.body, p).not.toContain("canary");
    }
    const ok = await raw(r.port, "/alias.txt");
    expect(ok.status).toBe(200);
    expect(ok.body).toBe("inside ok");
  });

  test("a folder named through a link (the Mac's temporary folder is one) is still served", async () => {
    const proj = put(join(scratch(), "proj"), { "index.html": "<h1>through a link</h1>" });
    expect(realpathSync(proj)).not.toBe(proj);   // the test means something only when the path has a link in it
    const r = await serve(proj);
    expect((await raw(r.port, "/")).body).toContain("through a link");
    expect((await (await fetch(r.url)).text())).toContain("through a link");
  });

  test("answers only requests for its own address, so a page that rebinds a name to this Mac gets nothing", async () => {
    const proj = put(join(scratch(), "proj"), { "index.html": "<h1>ok</h1>", "data.json": "canary-data" });
    const r = await serve(proj);
    for (const host of [`rebind.example:${r.port}`, "rebind.example", `127.0.0.1:${r.port + 1}`, ""]) {
      const got = await raw(r.port, "/data.json", host);
      expect(got.status, host).not.toBe(200);
      expect(got.body, host).not.toContain("canary");
    }
    expect((await raw(r.port, "/data.json", `localhost:${r.port}`)).status).toBe(200);
    expect((await raw(r.port, "/data.json")).body).toBe("canary-data");
  });

  test("the earlier version's copy still serves the packages it borrows from the project, and nothing else of it", async () => {
    const top = scratch();
    const project = put(join(top, "project"), { "node_modules/lib/dist/lib.js": "lib ok", ".env": "canary-project-env", "secret.txt": "x" });
    const copy = put(join(top, "copy"), { "index.html": "<script src=node_modules/lib/dist/lib.js></script>" });
    mkdirSync(join(copy, "node_modules"));
    symlinkSync(join(project, "node_modules/lib"), join(copy, "node_modules/lib"));
    symlinkSync(join(project, ".env"), join(copy, "env-link"));
    // Without naming the project, the borrowed package is a link out of the copy and is refused.
    const plain = await serve(copy);
    expect((await raw(plain.port, "/node_modules/lib/dist/lib.js")).status).toBe(404);
    const r = await serve(copy, { borrowedFrom: project });
    const lib = await raw(r.port, "/node_modules/lib/dist/lib.js");
    expect(lib.status).toBe(200);
    expect(lib.body).toBe("lib ok");
    // A dotfile of the project stays refused even through a link the copy holds.
    const env = await raw(r.port, "/env-link");
    expect(env.status).toBe(404);
    expect(env.body).not.toContain("canary");
    // And so does any other file of the project (review of 31 Oct 2026): only its installed packages are borrowed.
    put(project, { "src/secret-config.json": "not-a-package" });
    symlinkSync(join(project, "secret.txt"), join(copy, "secret-link.txt"));
    symlinkSync(join(project, "src/secret-config.json"), join(copy, "cfg.json"));
    for (const p of ["/secret-link.txt", "/cfg.json"]) {
      const got = await raw(r.port, p);
      expect(got.status, p).toBe(404);
      expect(got.body, p).not.toContain("not-a-package");
    }
  });
});
