// Draw it for me: the model answers with a small diagram as data (never as free drawing). It is checked hard before
// anything is shown: few boxes, short words, no secrets, the broken place always marked, and nothing taken from the screen.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { diagramContext, diagramRequest, isEnvFile, parseDiagram, routesSummary, MAX_NODES } from "../src/diagram.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
function project(files: Record<string, string>): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-dg-"))); made.push(d);
  for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); }
  return d;
}
const ok = { nodes: [{ id: "page", label: "Signup page" }, { id: "api", label: "/api/register" }, { id: "db", label: "Database" }], edges: [{ from: "page", to: "api", label: "sends the form" }, { from: "api", to: "db" }], broken: { edge: ["page", "api"], reason: "The page calls /api/signup, which does not exist" }, caption: "The button points at a page that was renamed." };

describe("reading the diagram", () => {
  test("a good answer, in a code block or among words", () => {
    expect(parseDiagram("```json\n" + JSON.stringify(ok) + "\n```")).toMatchObject({ nodes: [{ id: "page" }, { id: "api" }, { id: "db" }], broken: { edge: ["page", "api"] }, caption: ok.caption });
    expect(parseDiagram("Here: " + JSON.stringify(ok) + " done")?.nodes).toHaveLength(3);
  });
  test("at most six boxes and eight arrows", () => {
    const many = { ...ok, nodes: Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, label: `Part ${i}` })), edges: Array.from({ length: 12 }, (_, i) => ({ from: `n${i % 8}`, to: `n${(i % 8) + 1}` })), broken: { node: "n1", reason: "x" } };
    const d = parseDiagram(JSON.stringify(many))!;
    expect(d.nodes).toHaveLength(MAX_NODES);
    expect(d.edges.length).toBeLessThanOrEqual(8);
    expect(d.edges.every((e) => d.nodes.some((n) => n.id === e.from) && d.nodes.some((n) => n.id === e.to))).toBe(true);
  });
  test("the broken place is always marked, and must be a real box or arrow", () => {
    expect(parseDiagram(JSON.stringify({ ...ok, broken: undefined }))).toBeNull();
    expect(parseDiagram(JSON.stringify({ ...ok, broken: { node: "ghost", reason: "x" } }))).toBeNull();
    expect(parseDiagram(JSON.stringify({ ...ok, broken: { edge: ["db", "page"], reason: "x" } }))).toBeNull();   // no such arrow
    expect(parseDiagram(JSON.stringify({ ...ok, broken: { node: "db", reason: "The table is empty" } }))?.broken).toEqual({ node: "db", reason: "The table is empty" });
  });
  test("fewer than two boxes, no arrows, or duplicate ids are not a diagram", () => {
    expect(parseDiagram(JSON.stringify({ ...ok, nodes: [ok.nodes[0]], edges: [] }))).toBeNull();
    expect(parseDiagram(JSON.stringify({ ...ok, edges: [] }))).toBeNull();
    expect(parseDiagram(JSON.stringify({ ...ok, nodes: [ok.nodes[0], ok.nodes[0], ok.nodes[2]], edges: [{ from: "page", to: "db" }], broken: { node: "db", reason: "r" } }))?.nodes.map((n) => n.id)).toEqual(["page", "db"]);
  });
  test("words are short and plain, secrets are covered, markup is text", () => {
    const d = parseDiagram(JSON.stringify({ ...ok, nodes: [{ id: "page", label: "<b>Page</b> with sk-ant-api03-" + "a".repeat(40) + " and a very long name that keeps going and going and going" }, ok.nodes[1], ok.nodes[2]], caption: "x ".repeat(200) }))!;
    expect(d.nodes[0].label).not.toContain("sk-ant");
    expect(d.nodes[0].label.length).toBeLessThanOrEqual(40);
    expect(d.caption.length).toBeLessThanOrEqual(160);
  });
  test("garbage is nothing", () => { for (const t of ["", "no json here", "{", "[]", '{"nodes":"x"}']) expect(parseDiagram(t)).toBeNull(); });
});

describe("what the model is told", () => {
  test("the question, the failing place and the lines around it, never a .env file", () => {
    const p = project({ "src/App.tsx": Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n"), ".env": "SECRET=hunter2hunter2", "package.json": '{"dependencies":{"react":"18"}}' });
    const c = diagramContext(p, { question: "why did this break?", problem: { kind: "line", file: "src/App.tsx", line: 30, message: "x is not defined" } });
    expect(c).toContain("why did this break?"); expect(c).toContain("src/App.tsx, line 30"); expect(c).toContain("x is not defined");
    expect(c).toContain("line 30"); expect(c).toContain("line 22"); expect(c).not.toContain("line 12\n");
    expect(c).not.toContain("hunter2");
  });
  test("a file outside the project, or a .env, is never read", () => {
    const p = project({ ".env": "SECRET=hunter2hunter2" });
    for (const file of ["../../../etc/hosts", "/etc/hosts", ".env"]) expect(diagramContext(p, { question: "why?", problem: { kind: "line", file, line: 1, message: "m" } })).not.toMatch(/hunter2|localhost/);
  });
  test("the request is plain and asks for data only", () => {
    const r = diagramRequest("some context");
    expect(r.system).toMatch(/ONLY JSON/); expect(r.system).toMatch(/six/i); expect(r.text).toBe("some context");
  });
});

describe("what routes and calls the model is shown", () => {
  test("server routes, file routes and the addresses pages call, with where each is", () => {
    const p = project({
      "server/routes.js": "const app = require('express')();\napp.post('/api/register', (req, res) => {});\nrouter.get(\"/health\", h);\n",
      "app/api/users/route.ts": "export async function GET() {}\nexport async function POST() {}\n",
      "pages/api/ping.ts": "export default function handler() {}\n",
      "src/Signup.jsx": "const res = await fetch('/api/signup', { method: 'POST' });\naxios.get(`/api/me`);\nsupabase.from('profiles').select();\n",
      "node_modules/x/index.js": "app.get('/should/not/appear', f)",
    });
    const r = routesSummary(p);
    expect(r).toContain("POST /api/register (server/routes.js:2)");
    expect(r).toContain("GET /health (server/routes.js:3)");
    expect(r).toMatch(/GET \/api\/users \(app\/api\/users\/route\.ts\)/); expect(r).toMatch(/POST \/api\/users \(app\/api\/users\/route\.ts\)/);
    expect(r).toContain("/api/ping (pages/api/ping.ts)");
    expect(r).toContain("the page calls /api/signup (src/Signup.jsx:1)");
    expect(r).toContain("the page calls /api/me (src/Signup.jsx:2)");
    expect(r).toContain("database table profiles (src/Signup.jsx:3)");
    expect(r).not.toContain("should/not/appear");
  });
  test("it is short, and nothing is made up when there is nothing", () => {
    expect(routesSummary(project({ "README.md": "hi" }))).toBe("");
    const many = project(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`s${i}.js`, `app.get('/r${i}', f)`])));
    expect(routesSummary(many).split("\n").length).toBeLessThanOrEqual(30);
  });
  test("the context carries them, so the model sees the mismatch", () => {
    const p = project({ "server/routes.js": "app.post('/api/register', f)", "src/Signup.jsx": "fetch('/api/signup')" });
    const c = diagramContext(p, { question: "why?", problem: { kind: "line", file: "src/Signup.jsx", line: 1, message: "404" } });
    expect(c).toContain("POST /api/register"); expect(c).toContain("the page calls /api/signup");
  });
});

describe("diagram hardening (review)", () => {
  const base = { edges: [{ from: "page", to: "api/users" }], caption: "c" };
  test("a less-than sign in a reason cannot reach the screen shell, which refuses it", () => {
    const d = parseDiagram(JSON.stringify({ ...base, nodes: [{ id: "page", label: "Page" }, { id: "api/users", label: "API" }], broken: { node: "page", reason: "count < 0 and a > b" } }));
    expect(d?.broken.reason).not.toMatch(/[<>]/);
  });
  test("ids are cleaned the same way everywhere, so a slash in the broken id still matches", () => {
    const d = parseDiagram(JSON.stringify({ ...base, nodes: [{ id: "page", label: "Page" }, { id: "api/users", label: "API" }], broken: { node: "api/users", reason: "r" } }));
    expect(d?.broken).toEqual({ node: "apiusers", reason: "r" });
  });
  test("a broken edge named backwards is turned the right way round", () => {
    const d = parseDiagram(JSON.stringify({ nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b" }], broken: { edge: ["b", "a"], reason: "r" }, caption: "c" }));
    expect(d?.broken).toEqual({ edge: ["a", "b"], reason: "r" });
  });
  test("more settings and key files are never sent", () => {
    for (const f of [".envrc", "prod.env", ".npmrc", ".netrc", "credentials.json", "secrets.yaml", ".pgpass", "cert.p12", "a.pfx", "id_ed25519", "terraform.tfstate", "src/.env.local"]) expect(isEnvFile(f)).toBe(true);
    for (const f of ["src/app.ts", "environment.ts", "README.md", "server.js"]) expect(isEnvFile(f)).toBe(false);
  });
  test("a link in a route is cleaned like everything else the model sees", () => {
    const d = mkdtempSync(join(tmpdir(), "companion-rs-"));
    writeFileSync(join(d, "a.js"), `fetch("/hook/sk-ant-api03-${"x".repeat(40)}")\n`);
    expect(routesSummary(d)).not.toContain("x".repeat(30));
    rmSync(d, { recursive: true, force: true });
  });
  test("a virtual environment folder is not walked", () => {
    const d = mkdtempSync(join(tmpdir(), "companion-rs-"));
    mkdirSync(join(d, "venv")); writeFileSync(join(d, "venv", "x.py"), `fetch("/from-venv")\n`);
    writeFileSync(join(d, "a.js"), `fetch("/real")\n`);
    expect(routesSummary(d)).toContain("/real");
    expect(routesSummary(d)).not.toContain("from-venv");
    rmSync(d, { recursive: true, force: true });
  });
});
