// M79 (risky packages, T18), end to end inside the review: a change that adds a package with a known serious problem is a
// Must fix or a Should fix with the package list's file and line; nothing is looked up with packages.check off, when the
// review may send only its checks, or when no package list changed; OSV not answering is said as not checked. Temporary
// fixture folders and a stand in look up only: nothing reaches OSV and no model runs.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, PROTOCOL_VERSION, type Command } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { ReviewService } from "../src/review/service.ts";
import type { WatchFn } from "../src/review/batcher.ts";
import { PACKAGE_NOTES, type Lookup, type PackageLookup } from "../src/review/osv.ts";
import type { Pkg } from "../src/review/packages.ts";

const made: string[] = [];
const services: ReviewService[] = [];
afterEach(() => { while (services.length) services.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = (l: string) => { const d = mkdtempSync(join(tmpdir(), `companion-test-m79r-${l}-`)); made.push(d); return d; };
const write = (dir: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } };
const PJ = (deps: Record<string, string>) => JSON.stringify({ name: "shop", dependencies: deps }, null, 2) + "\n";

function setup(o: { values?: Record<string, unknown>; lookup?: (pkgs: Pkg[]) => Lookup | Promise<Lookup>; noLookup?: boolean } = {}) {
  const project = tmp("proj"), shadow = tmp("shadow");
  write(project, { "src/App.tsx": "export const a = 1;\n", "package.json": PJ({ react: "19.0.0" }) });
  const store = new CheckpointStore(join(shadow, "p.git"), project);
  const events: Record<string, any>[] = [];
  let send: ((rel: string) => void) | null = null;
  const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
  const asked: Pkg[][] = [];
  const packages: PackageLookup = { check: async (pkgs) => { asked.push(pkgs); return o.lookup ? o.lookup(pkgs) : { problems: [], checked: pkgs.length, notChecked: 0 }; } };
  const values: Record<string, unknown> = { "review.mode": "ask", "flow.on": true, ...(o.values ?? {}) };
  const svc = new ReviewService({
    emit: (e) => events.push(e), setting: (k) => values[k], store: () => store, cheap: null, strong: null,
    spend: { room: () => 10, book: () => {} }, watch, graceMs: 20, quietMs: () => 30, ...(o.noLookup ? {} : { packages }),
  });
  services.push(svc);
  const until = async (pred: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
  const of = (t: string) => events.filter((e) => e.type === t);
  const change = (files: Record<string, string>) => { write(project, files); for (const r of Object.keys(files)) send?.(r); };
  const review = async (files: Record<string, string>) => {
    svc.setProject(project); await svc.ready();
    change(files);
    await until(() => of("review.batch").length === 1);
    await svc.handle({ v: PROTOCOL_VERSION, id: "c", type: "review.now", project, batch: of("review.batch")[0].batch } as Command as never);
    await until(() => of("review.result").length === 1);
    const r = of("review.result")[0];
    const p = parseEvent(JSON.stringify({ v: 1, id: "x", ...r }));
    expect(p.ok, p.ok ? "" : p.error).toBe(true);
    return r;
  };
  return { project, review, asked, values };
}
const problem = (p: Pkg, severity: "critical" | "high", id: string, fixed: string | null) => ({ pkg: p, id, severity, fixed });

describe("risky packages in a review", () => {
  test("a critical problem is Fix this first, with the package list's file and line; only the new package is asked", async () => {
    const t = setup({ lookup: (pkgs) => ({ problems: pkgs.filter((p) => p.name === "lodash").map((p) => problem(p, "critical", "GHSA-aaaa-bbbb-cccc", "4.17.21")), checked: pkgs.length, notChecked: 0 }) });
    const r = await t.review({ "package.json": PJ({ react: "19.0.0", lodash: "4.17.20" }) });
    expect(t.asked.map((a) => a.map((p) => `${p.ecosystem}:${p.name}@${p.version}`))).toEqual([["npm:lodash@4.17.20"]]);
    expect(r.rating).toBe("stop");
    const reason = r.reasons.find((x: any) => x.kind === "package_critical");
    expect(reason).toMatchObject({ kind: "package_critical", file: "package.json", line: 5, say: "lodash 4.17.20: This package has a known serious problem: GHSA-aaaa-bbbb-cccc, fixed in 4.17.21." });
    // The send back text carries the finding, so the person's AI tool can move to the fixed version.
    expect(r.sendBack).toContain("GHSA-aaaa-bbbb-cccc");
  });
  test("a high problem is worth a look (Should fix on the page)", async () => {
    const t = setup({ lookup: (pkgs) => ({ problems: pkgs.map((p) => problem(p, "high", "GHSA-hhhh", null)), checked: pkgs.length, notChecked: 0 }) });
    const r = await t.review({ "package.json": PJ({ react: "19.0.0", axios: "1.0.0" }) });
    expect(r.rating).toBe("worth_a_look");
    expect(r.reasons.map((x: any) => x.kind)).toContain("package_high");
    expect(r.reasons.find((x: any) => x.kind === "package_high").say).toBe("axios 1.0.0: This package has a known serious problem: GHSA-hhhh, with no fixed version listed yet.");
  });
  test("OSV not answering is said as not checked, and the review is never called safe because of the packages", async () => {
    const t = setup({ lookup: (pkgs) => ({ problems: [], checked: 0, notChecked: pkgs.length }) });
    const r = await t.review({ "package.json": PJ({ react: "19.0.0", lodash: "4.17.20" }) });
    expect(r.notes).toContain(PACKAGE_NOTES.offline);
    expect(r.reasons.some((x: any) => String(x.kind).startsWith("package_"))).toBe(false);
  });
  test("a look up that throws is said as not checked too", async () => {
    const t = setup({ lookup: () => { throw new Error("down"); } });
    const r = await t.review({ "package.json": PJ({ react: "19.0.0", lodash: "4.17.20" }) });
    expect(r.notes).toContain(PACKAGE_NOTES.offline);
  });
  test("packages.check off: nothing is looked up and nothing is said", async () => {
    const t = setup({ values: { "packages.check": false } });
    const r = await t.review({ "package.json": PJ({ react: "19.0.0", lodash: "4.17.20" }) });
    expect(t.asked).toEqual([]);
    expect((r.notes ?? []).join(" ")).not.toContain("package");
  });
  test("Checks only: nothing leaves the Mac, and the note says why the packages were not checked", async () => {
    const t = setup({ values: { "review.send": "checksOnly" } });
    const r = await t.review({ "package.json": PJ({ react: "19.0.0", lodash: "4.17.20" }) });
    expect(t.asked).toEqual([]);
    expect(r.notes).toContain(PACKAGE_NOTES.checksOnly);
  });
  test("no package list changed: nothing is looked up; a range with no lock file is said as not checked", async () => {
    const t = setup();
    await t.review({ "src/App.tsx": "export const a = 2;\n" });
    expect(t.asked).toEqual([]);
    const u = setup();
    const r = await u.review({ "package.json": PJ({ react: "19.0.0", lodash: "^4.17.0" }) });
    expect(u.asked).toEqual([]);
    expect(r.notes).toContain(PACKAGE_NOTES.unresolved(1));
  });
});
