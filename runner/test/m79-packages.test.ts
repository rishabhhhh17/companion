// M79 (risky packages, T18): the packages a change added, read from the project's own package lists; the OSV.dev look up
// with only names and versions sent, a day's cache, and "not checked" (never "safe") when OSV does not answer; the finding
// in the fixed shape's words, Must fix for critical and Should fix for high. A stand in network only: no test reaches OSV.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REVIEW_REASONS } from "../../protocol/index.ts";
import { changedPackages, isManifest, MAX_PACKAGES, packagesIn, type Pkg } from "../src/review/packages.ts";
import { CACHE_MS, compareVersions, cvss3Score, fixedFor, MAX_DETAILS, OsvClient, PACKAGE_NOTES, packageReasons, severityOf } from "../src/review/osv.ts";
import { STOP_KINDS, applyStrictness } from "../src/review/look.ts";
import { rate } from "../src/review/rate.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "companion-test-m79p-")); made.push(d); return d; };
const pj = (deps: Record<string, string>, dev: Record<string, string> = {}) => JSON.stringify({ name: "shop", dependencies: deps, devDependencies: dev }, null, 2);
const lock = (pk: Record<string, string>) => JSON.stringify({ name: "shop", lockfileVersion: 3, packages: { "": { name: "shop" }, ...Object.fromEntries(Object.entries(pk).map(([n, v]) => [`node_modules/${n}`, { version: v }])) } });

describe("which packages a change added", () => {
  test("the package lists named, and nothing inside node_modules", () => {
    for (const f of ["package.json", "web/package-lock.json", "npm-shrinkwrap.json", "requirements.txt", "requirements-dev.txt", "pyproject.toml", "poetry.lock", "uv.lock", "go.mod", "Cargo.toml", "Cargo.lock"]) expect(isManifest(f), f).toBe(true);
    for (const f of ["node_modules/x/package.json", "src/app.ts", "yarn.lock", "README.md", "vendor/a/go.mod"]) expect(isManifest(f), f).toBe(false);
  });
  test("package.json: exact versions are read; a range is resolved by the lock file next to it, else said as not checked", () => {
    const before = { "package.json": pj({ react: "^19.0.0" }), "package-lock.json": lock({ react: "19.0.0" }) };
    const after = { "package.json": pj({ react: "^19.0.0", lodash: "^4.17.20", "left-pad": "1.3.0" }, { "@scope/tool": "~2.0.0" }), "package-lock.json": lock({ react: "19.0.0", lodash: "4.17.20", "left-pad": "1.3.0" }) };
    const c = changedPackages(before, after);
    expect(c.pkgs.map((p) => [p.ecosystem, p.name, p.version, p.file])).toEqual([["npm", "left-pad", "1.3.0", "package.json"], ["npm", "lodash", "4.17.20", "package.json"]]);
    // The line in the list a person reads, for Open in my editor.
    expect(c.pkgs.find((p) => p.name === "lodash")!.line).toBe(5);
    expect(c.unresolved).toEqual(["@scope/tool"]);
    expect(c.more).toBe(0);
  });
  test("a version that only moved in the lock file counts; one that did not move does not", () => {
    const c = changedPackages({ "package-lock.json": lock({ a: "1.0.0", b: "2.0.0" }) }, { "package-lock.json": lock({ a: "1.0.1", b: "2.0.0", "@x/y": "3.1.0" }) });
    expect(c.pkgs.map((p) => `${p.name}@${p.version}`)).toEqual(["@x/y@3.1.0", "a@1.0.1"]);
  });
  test("requirements.txt and pyproject.toml: only pinned versions; Poetry's bare version is exact", () => {
    expect(packagesIn("requirements.txt", "# web\nflask==2.0.1\nrequests>=2\nDjango[argon2]==4.2.0 ; python_version > '3'\n-r other.txt\n").exact.map((p) => `${p.name}@${p.version}:${p.line}`)).toEqual(["flask@2.0.1:2", "Django@4.2.0:4"]);
    expect(packagesIn("requirements.txt", "requests>=2\n").ranges.map((r) => r.name)).toEqual(["requests"]);
    const py = '[project]\ndependencies = ["fastapi==0.100.0", "pydantic>=2"]\n[tool.poetry.dependencies]\npython = "^3.11"\nrich = "13.7.0"\nhttpx = "^0.27"\n';
    const r = packagesIn("pyproject.toml", py);
    expect(r.exact.map((p) => `${p.ecosystem}:${p.name}@${p.version}`)).toEqual(["PyPI:fastapi@0.100.0", "PyPI:rich@13.7.0"]);
    expect(r.ranges.map((x) => x.name)).toEqual(["httpx"]);
  });
  test("lock files in TOML: Cargo.lock keeps only registry crates; uv.lock leaves the project itself out", () => {
    const cargo = '[[package]]\nname = "mine"\nversion = "0.1.0"\n\n[[package]]\nname = "serde"\nversion = "1.0.100"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n';
    expect(packagesIn("Cargo.lock", cargo).exact.map((p) => `${p.ecosystem}:${p.name}@${p.version}`)).toEqual(["crates.io:serde@1.0.100"]);
    const uv = '[[package]]\nname = "app"\nversion = "0.1.0"\nsource = { editable = "." }\n\n[[package]]\nname = "jinja2"\nversion = "3.1.2"\nsource = { registry = "https://pypi.org/simple" }\n';
    expect(packagesIn("uv.lock", uv).exact.map((p) => `${p.name}@${p.version}`)).toEqual(["jinja2@3.1.2"]);
  });
  test("go.mod (OSV writes Go versions without the v) and Cargo.toml (only = is exact)", () => {
    const go = "module x\n\ngo 1.22\n\nrequire github.com/gin-gonic/gin v1.9.0\nrequire (\n\tgolang.org/x/net v0.17.0 // indirect\n)\n";
    expect(packagesIn("go.mod", go).exact.map((p) => `${p.ecosystem}:${p.name}@${p.version}`)).toEqual(["Go:github.com/gin-gonic/gin@1.9.0", "Go:golang.org/x/net@0.17.0"]);
    const toml = '[package]\nname = "x"\nversion = "0.1.0"\n[dependencies]\nserde = "1.0"\ntokio = { version = "=1.28.0", features = ["full"] }\n';
    const r = packagesIn("Cargo.toml", toml);
    expect(r.exact.map((p) => `${p.name}@${p.version}`)).toEqual(["tokio@1.28.0"]);
    expect(r.ranges.map((x) => x.name)).toEqual(["serde"]);
    // Cargo.lock in the same folder resolves serde.
    const c = changedPackages({}, { "Cargo.toml": toml, "Cargo.lock": '[[package]]\nname = "serde"\nversion = "1.0.100"\nsource = "registry+https://x"\n' });
    expect(c.pkgs.map((p) => `${p.name}@${p.version}:${p.file}`)).toEqual(["serde@1.0.100:Cargo.toml", "tokio@1.28.0:Cargo.toml"]);
  });
  test("a file that does not read is simply not checked; a huge new lock file is capped", () => {
    expect(packagesIn("package.json", "{ not json").exact).toEqual([]);
    const many = Object.fromEntries(Array.from({ length: MAX_PACKAGES + 5 }, (_, i) => [`p${i}`, "1.0.0"]));
    const c = changedPackages({}, { "package-lock.json": lock(many) });
    expect(c.pkgs.length).toBe(MAX_PACKAGES);
    expect(c.more).toBe(5);
  });
});

describe("severity and the fixed version", () => {
  test("CVSS 3 base scores match FIRST's calculator", () => {
    expect(cvss3Score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBe(9.8);
    expect(cvss3Score("CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:N/A:N")).toBe(6.5);
    expect(cvss3Score("CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H")).toBe(9.9);
    expect(cvss3Score("CVSS:3.0/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBe(8.1);
    expect(cvss3Score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N")).toBe(0);
    expect(cvss3Score("CVSS:4.0/AV:N")).toBeNull();
  });
  test("the database's own word first, then the CVSS 3 score; unrated or moderate is not raised", () => {
    expect(severityOf({ database_specific: { severity: "CRITICAL" } })).toBe("critical");
    expect(severityOf({ database_specific: { severity: "HIGH" } })).toBe("high");
    expect(severityOf({ database_specific: { severity: "MODERATE" }, severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }] })).toBe("other");
    expect(severityOf({ affected: [{ ecosystem_specific: { severity: "HIGH" } }] })).toBe("high");
    expect(severityOf({ severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }] })).toBe("critical");
    expect(severityOf({ severity: [{ type: "CVSS_V3", score: "CVSS:3.0/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H" }] })).toBe("high");
    expect(severityOf({})).toBe("other");
  });
  test("the lowest fixed version above the one in use, for this package only", () => {
    expect(compareVersions("4.17.21", "4.17.3")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0-beta")).toBe(1);
    const rec = { affected: [
      { package: { ecosystem: "npm", name: "lodash" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "4.17.21" }] }, { type: "SEMVER", events: [{ introduced: "3.0.0" }, { fixed: "3.10.2" }] }] },
      { package: { ecosystem: "npm", name: "other" }, ranges: [{ type: "SEMVER", events: [{ fixed: "4.17.19" }] }] },
    ] };
    const p: Pkg = { ecosystem: "npm", name: "lodash", version: "4.17.20", file: "package.json" };
    expect(fixedFor(rec, p)).toBe("4.17.21");
    expect(fixedFor(rec, { ...p, version: "3.9.0" })).toBe("3.10.2");
    expect(fixedFor(rec, { ...p, version: "5.0.0" })).toBeNull();
  });
});

/** OSV, played back. Every request is kept, so a test can read exactly what would have left the Mac. */
function osv(o: { batch?: (body: any) => unknown; vulns?: Record<string, unknown>; down?: boolean; status?: number } = {}) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", ...(init?.body ? { body: String(init.body) } : {}) });
    if (o.down) throw new TypeError("fetch failed");
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
    if (String(url).endsWith("/v1/querybatch")) return o.status ? new Response("busy", { status: o.status }) : json(o.batch ? o.batch(JSON.parse(String(init!.body))) : { results: [] });
    const id = decodeURIComponent(String(url).split("/v1/vulns/")[1] ?? "");
    return o.vulns?.[id] ? json(o.vulns[id]) : json({ code: 5, message: "not found" }, 404);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const LODASH: Pkg = { ecosystem: "npm", name: "lodash", version: "4.17.20", file: "package.json", line: 5 };
const FLASK: Pkg = { ecosystem: "PyPI", name: "flask", version: "2.0.1", file: "requirements.txt", line: 2 };
const VULNS = {
  "GHSA-35jh-r3h4-6jhm": { id: "GHSA-35jh-r3h4-6jhm", database_specific: { severity: "HIGH" }, affected: [{ package: { ecosystem: "npm", name: "lodash" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "4.17.21" }] }] }] },
  "GHSA-crit-0001": { id: "GHSA-crit-0001", database_specific: { severity: "CRITICAL" }, affected: [{ package: { ecosystem: "PyPI", name: "Flask" }, ranges: [{ type: "ECOSYSTEM", events: [{ introduced: "0" }, { fixed: "2.2.5" }] }] }] },
  "GHSA-low-0001": { id: "GHSA-low-0001", database_specific: { severity: "LOW" }, affected: [] },
};
const answer = (body: any) => ({ results: body.queries.map((q: any) => (q.package.name === "lodash" ? { vulns: [{ id: "GHSA-35jh-r3h4-6jhm", modified: "x" }, { id: "GHSA-low-0001", modified: "x" }] } : q.package.name === "flask" ? { vulns: [{ id: "GHSA-crit-0001", modified: "x" }] } : {})) });

describe("the OSV.dev look up", () => {
  test("only each package's ecosystem, name and version are sent, in one batch, then each record named is read", async () => {
    const d = tmp(), net = osv({ batch: answer, vulns: VULNS });
    const c = new OsvClient({ cacheFile: join(d, "osv.json"), fetch: net.f });
    const l = await c.check([LODASH, FLASK, { ecosystem: "npm", name: "react", version: "19.0.0", file: "package.json" }]);
    const post = net.calls[0];
    expect(post).toMatchObject({ url: "https://api.osv.dev/v1/querybatch", method: "POST" });
    expect(JSON.parse(post.body!)).toEqual({ queries: [
      { package: { name: "lodash", ecosystem: "npm" }, version: "4.17.20" },
      { package: { name: "flask", ecosystem: "PyPI" }, version: "2.0.1" },
      { package: { name: "react", ecosystem: "npm" }, version: "19.0.0" },
    ] });
    // No file name, no line, nothing else of the project.
    expect(post.body).not.toContain("package.json"); expect(post.body).not.toContain("requirements");
    expect(net.calls.slice(1).map((x) => [x.method, x.url])).toEqual([["GET", "https://api.osv.dev/v1/vulns/GHSA-35jh-r3h4-6jhm"], ["GET", "https://api.osv.dev/v1/vulns/GHSA-low-0001"], ["GET", "https://api.osv.dev/v1/vulns/GHSA-crit-0001"]]);
    expect(l).toMatchObject({ checked: 3, notChecked: 0 });
    // The low one is not raised.
    expect(l.problems.map((p) => [p.pkg.name, p.id, p.severity, p.fixed])).toEqual([["lodash", "GHSA-35jh-r3h4-6jhm", "high", "4.17.21"], ["flask", "GHSA-crit-0001", "critical", "2.2.5"]]);
  });
  test("the finding's words, Must fix for critical and Should fix for high, critical first", async () => {
    const d = tmp(), net = osv({ batch: answer, vulns: VULNS });
    const r = packageReasons(await new OsvClient({ cacheFile: join(d, "osv.json"), fetch: net.f }).check([LODASH, FLASK]));
    expect(r).toEqual([
      { kind: "package_critical", file: "requirements.txt", line: 2, say: "flask 2.0.1: This package has a known serious problem: GHSA-crit-0001, fixed in 2.2.5." },
      { kind: "package_high", file: "package.json", line: 5, say: "lodash 4.17.20: This package has a known serious problem: GHSA-35jh-r3h4-6jhm, fixed in 4.17.21." },
    ]);
    for (const k of ["package_critical", "package_high"]) expect((REVIEW_REASONS as readonly string[]).includes(k)).toBe(true);
    expect(STOP_KINDS.has("package_critical")).toBe(true);
    expect(STOP_KINDS.has("package_high")).toBe(false);
    // In the rating: critical is Fix this first, high is worth a look; Quiet never hides either.
    const base = { changes: [], touches: [], secrets: [], stillUsed: [], secretFiles: [], checks: "not_run" as const, count: 1, capped: false };
    expect(rate({ ...base, found: [r[0]] }).rating).toBe("stop");
    expect(rate({ ...base, found: [r[1]] }).rating).toBe("worth_a_look");
    expect(applyStrictness(rate({ ...base, found: [r[1]] }), "quiet", new Set()).reasons.map((x) => x.kind)).toEqual(["package_high"]);
  });
  test("answers are kept for a day: the same packages are not asked again, then they are", async () => {
    const d = tmp(), net = osv({ batch: answer, vulns: VULNS });
    let now = Date.parse("2026-11-11T10:00:00Z");
    const c = new OsvClient({ cacheFile: join(d, "osv.json"), fetch: net.f, now: () => now });
    await c.check([LODASH]);
    const first = net.calls.length;
    now += CACHE_MS - 60_000;
    const again = await c.check([LODASH]);
    expect(net.calls.length).toBe(first);
    expect(again.problems.map((p) => p.id)).toEqual(["GHSA-35jh-r3h4-6jhm"]);
    // The cache holds names, versions and ids only, in Squibby's own folder, readable by this account only.
    const kept = readFileSync(join(d, "osv.json"), "utf8");
    expect(kept).not.toContain("package.json");
    now += 2 * 60_000;
    await c.check([LODASH]);
    expect(net.calls.length).toBeGreaterThan(first);
  });
  test("offline, a busy OSV or an answer that is not OSV's: not checked, never safe, and nothing kept", async () => {
    for (const net of [osv({ down: true }), osv({ status: 503 }), osv({ batch: () => ({ results: "nope" }) }), osv({ batch: () => ({ results: [] }) })]) {
      const d = tmp();
      const l = await new OsvClient({ cacheFile: join(d, "osv.json"), fetch: net.f }).check([LODASH, FLASK]);
      expect(l).toEqual({ problems: [], checked: 0, notChecked: 2 });
      expect(existsSync(join(d, "osv.json"))).toBe(false);
    }
    expect(PACKAGE_NOTES.offline).toContain("not known to be safe");
    expect(PACKAGE_NOTES.some(2)).toContain("not known to be safe");
  });
  test("a record that cannot be read leaves that package not fully checked; at most MAX_DETAILS records a review", async () => {
    const d = tmp();
    const ids = Array.from({ length: MAX_DETAILS + 3 }, (_, i) => `GHSA-m-${i}`);
    const net = osv({ batch: (b) => ({ results: b.queries.map(() => ({ vulns: ids.map((id) => ({ id })) })) }), vulns: Object.fromEntries(ids.map((id) => [id, { id, database_specific: { severity: "HIGH" }, affected: [] }])) });
    const l = await new OsvClient({ cacheFile: join(d, "osv.json"), fetch: net.f }).check([LODASH]);
    expect(net.calls.length).toBe(1 + MAX_DETAILS);
    expect(l.notChecked).toBe(1);
    expect(l.problems.length).toBe(MAX_DETAILS);
    const missing = osv({ batch: answer, vulns: {} });
    const m = await new OsvClient({ cacheFile: join(tmp(), "osv.json"), fetch: missing.f }).check([LODASH]);
    expect(m).toMatchObject({ problems: [], notChecked: 1 });
  });
  test("an aborted review stops the look up", async () => {
    const ctl = new AbortController(); ctl.abort();
    const net = { f: (async (_u: string, init?: RequestInit) => { if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError"); return new Response("{}"); }) as unknown as typeof fetch };
    const l = await new OsvClient({ cacheFile: join(tmp(), "osv.json"), fetch: net.f }).check([LODASH], ctl.signal);
    expect(l.checked).toBe(0);
  });
});
