// M118 (docs/milestones/M118-blast-radius.md): whole-codebase blast-radius check.
// Tests first (TDD): temporary fixture folders only, no model calls, no network.
// The 24 Nov review: a caller counts only when its import or require names the changed module's path; calls after a
// "." , method definitions, declare function, .d.ts files and comments are not callers; test only callers are left out;
// every file is read once; the walk yields, stops on the abort signal and has a cap on files and time; and the finding is
// a worth a look kind (callers_may_break), never a stop.
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REVIEW_REASONS } from "../../protocol/index.ts";
import { blastRadiusReasons, checkBlastRadius, diffExports, formatBlastFindings } from "../src/blastradius.ts";
import { STOP_KINDS } from "../src/review/look.ts";
import { rate } from "../src/review/rate.ts";

function makeTempProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "m118-blast-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return dir;
}
async function withProject<T>(files: Record<string, string>, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = makeTempProject(files);
  try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const ONE = `export function applyDiscount(cart: any) { return cart.total; }\n`;
const TWO = `export function applyDiscount(cart: any, plan: any) { return cart.total; }\n`;
const cart = (extra: Record<string, string>) => ({ "billing/cart.ts": TWO, ...extra });
const arity = [{ file: "billing/cart.ts", before: ONE, after: TWO }];
const callerFiles = async (dir: string, changed = arity) => (await checkBlastRadius(dir, changed)).flatMap((f) => f.callers.map((c) => c.file)).sort();

describe("M118 diffExports", () => {
  test("detects required parameter count increase on exported functions", () => {
    expect(diffExports(ONE, TWO)).toEqual([{ kind: "arity", name: "applyDiscount", oldMin: 1, newMin: 2 }]);
  });

  test("does not flag when the newly added parameter is optional or has a default", () => {
    expect(diffExports(ONE, `export function applyDiscount(cart: Cart, plan?: Plan) { return cart.total; }`)).toEqual([]);
    expect(diffExports(ONE, `export function applyDiscount(cart: Cart, plan: Plan = "free") { return cart.total; }`)).toEqual([]);
  });

  test("detects removed exported functions and const arrow exports", () => {
    const changes = diffExports(`export const formatPrice = (n: number) => String(n);\nexport function oldHelper(a: string) { return a; }`, `export const formatPrice = (n: number, currency: string) => String(n) + currency;`);
    expect(changes).toContainEqual({ kind: "arity", name: "formatPrice", oldMin: 1, newMin: 2 });
    expect(changes).toContainEqual({ kind: "removed", name: "oldHelper" });
  });

  test("a function still exported another way is not removed: export { f }, export { g as f }, export const f = function, export { f } from", () => {
    const before = `export function f(a: string) { return a; }\n`;
    expect(diffExports(before, `function f(a: string) { return a; }\nexport { f };\n`)).toEqual([]);
    expect(diffExports(before, `function g(a: string) { return a; }\nexport { g as f };\n`)).toEqual([]);
    expect(diffExports(before, `export const f = function (a: string) { return a; };\n`)).toEqual([]);
    expect(diffExports(before, `export { f } from "./other";\n`)).toEqual([]);
    expect(diffExports(before, `export * from "./other";\n`)).toEqual([]);
  });

  test("an export list keeps the arity check: export { f } over a function that now needs more", () => {
    expect(diffExports(`function f(a: string) { return a; }\nexport { f };\n`, `function f(a: string, b: string) { return a + b; }\nexport { f };\n`)).toEqual([{ kind: "arity", name: "f", oldMin: 1, newMin: 2 }]);
  });

  test("an export only in a comment is not an export", () => {
    expect(diffExports(`// export function f(a: string) {}\nexport function g() {}\n`, `export function g() {}\n`)).toEqual([]);
  });
});

describe("M118 true positives", () => {
  test("catches callers in other files passing too few arguments (applyDiscount case)", async () => {
    await withProject(cart({
      "api/refunds.ts": `import { applyDiscount } from "../billing/cart.ts";\nexport function refund(c: any) {\n  return applyDiscount(c);\n}\n`,
      "jobs/renewals.ts": `import { applyDiscount } from "../billing/cart";\nconst total = applyDiscount(order.cart);\n`,
      "checkout/ok.ts": `import { applyDiscount } from "../billing/cart.ts";\nconst total = applyDiscount(order.cart, user.plan);\n`,
    }), async (dir) => {
      const findings = await checkBlastRadius(dir, arity);
      expect(findings.length).toBe(1);
      expect(findings[0].symbol).toBe("applyDiscount");
      expect(findings[0].callers.map((c) => c.file).sort()).toEqual(["api/refunds.ts", "jobs/renewals.ts"]);
      expect(findings[0].callers.find((c) => c.file === "api/refunds.ts")!.line).toBe(3);
      const lines = formatBlastFindings(findings);
      expect(lines[0]).toContain("applyDiscount");
      expect(lines[0]).toContain("api/refunds.ts");
      expect(lines[0]).not.toContain("—");
    });
  });

  test("an import through an index file, a .js extension for a .ts file, an alias, require and a namespace", async () => {
    await withProject({
      "billing/index.ts": TWO,
      "a.ts": `import { applyDiscount } from "./billing";\napplyDiscount(1);\n`,
      "b.ts": `import { applyDiscount as ad } from "./billing/index.js";\nad(1);\n`,
      "c.js": `const { applyDiscount } = require("./billing");\napplyDiscount(1);\n`,
      "d.ts": `import * as billing from "./billing";\nbilling.applyDiscount(1);\n`,
    }, async (dir) => {
      expect(await callerFiles(dir, [{ file: "billing/index.ts", before: ONE, after: TWO }])).toEqual(["a.ts", "b.ts", "c.js", "d.ts"]);
    });
  });

  test("a call spread over several lines is counted", async () => {
    await withProject(cart({ "a.ts": `import { applyDiscount } from "./billing/cart";\nconst t = applyDiscount(\n  order.cart,\n);\n` }), async (dir) => {
      expect(await callerFiles(dir)).toEqual(["a.ts"]);
    });
  });

  test("a dynamic import counts", async () => {
    await withProject(cart({ "a.ts": `export async function go() {\n  const { applyDiscount } = await import("./billing/cart");\n  return applyDiscount(1);\n}\n` }), async (dir) => {
      expect(await callerFiles(dir)).toEqual(["a.ts"]);
    });
  });

  test("a removed export still imported is found, node_modules and symlinks are skipped", async () => {
    const dir = makeTempProject({
      "lib/auth.ts": `export function verifySession(tok: string) { return !!tok; }\n`,
      "routes/login.ts": `import { checkPassword } from "../lib/auth.ts";\ncheckPassword("x");\n`,
      "node_modules/pkg/index.ts": `import { checkPassword } from "../../lib/auth.ts";\ncheckPassword("x");\n`,
    });
    const outside = mkdtempSync(join(tmpdir(), "m118-out-"));
    writeFileSync(join(outside, "leak.ts"), `import { checkPassword } from "../lib/auth";\ncheckPassword("x");\n`);
    symlinkSync(join(outside, "leak.ts"), join(dir, "routes/link.ts"));
    try {
      const changed = [{ file: "lib/auth.ts", before: `export function checkPassword(p: string) { return p.length > 0; }\nexport function verifySession(tok: string) { return !!tok; }\n`, after: `export function verifySession(tok: string) { return !!tok; }\n` }];
      const findings = await checkBlastRadius(dir, changed);
      expect(findings.length).toBe(1);
      expect(findings[0].kind).toBe("removed");
      expect(findings[0].callers.map((c) => c.file)).toEqual(["routes/login.ts"]);
      const reasons = await blastRadiusReasons(dir, changed);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toMatchObject({ kind: "callers_may_break", file: "routes/login.ts", line: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("M118 false positives the review found", () => {
  test("the same name from a package or another module is not a caller", async () => {
    await withProject(cart({
      "a.ts": `import { applyDiscount } from "discounts";\napplyDiscount(1);\n`,
      "b.ts": `import { applyDiscount } from "./other/cart";\napplyDiscount(1);\n`,
      "packages/web/billing/cart.ts": `export function applyDiscount(a: any) { return a; }\n`,
      "packages/web/use.ts": `import { applyDiscount } from "./billing/cart";\napplyDiscount(1);\n`,
    }), async (dir) => {
      expect(await callerFiles(dir)).toEqual([]);
    });
  });

  test("import { format } from date-fns is not a caller of a removed format", async () => {
    await withProject({ "lib/text.ts": `export function other() {}\n`, "a.ts": `import { format } from "date-fns";\nformat(new Date());\n` }, async (dir) => {
      expect(await callerFiles(dir, [{ file: "lib/text.ts", before: `export function format(d: Date) { return ""; }\nexport function other() {}\n`, after: `export function other() {}\n` }])).toEqual([]);
    });
  });

  test("member calls, Map .get(, method definitions, declare function and .d.ts files are not callers", async () => {
    await withProject(cart({
      "a.ts": `import { applyDiscount } from "./billing/cart";\nobj.applyDiscount(1);\nmap.applyDiscount?.(1);\n`,
      "b.ts": `import { applyDiscount } from "./billing/cart";\nclass X {\n  applyDiscount(c: any) { return c; }\n  async applyDiscount2() {}\n}\n`,
      "c.ts": `import { applyDiscount } from "./billing/cart";\ndeclare function applyDiscount(x: any): void;\n`,
      "types.d.ts": `import { applyDiscount } from "./billing/cart";\napplyDiscount(1);\n`,
    }), async (dir) => {
      expect(await callerFiles(dir)).toEqual([]);
    });
  });

  test("calls in comments are not callers", async () => {
    await withProject(cart({ "a.ts": `import { applyDiscount } from "./billing/cart";\n// applyDiscount(c);\n/* applyDiscount(c)\n applyDiscount(c) */\nconst s = "applyDiscount(c)";\n` }), async (dir) => {
      expect(await callerFiles(dir)).toEqual([]);
    });
  });

  test("a file that does not import the changed name is not a caller", async () => {
    await withProject(cart({ "a.ts": `import { other } from "./billing/cart";\nfunction applyDiscount(x: any) {}\napplyDiscount(1);\n` }), async (dir) => {
      expect(await callerFiles(dir)).toEqual([]);
    });
  });

  test("a function moved and re-exported is not removed", async () => {
    await withProject({ "lib/a.ts": `export { helper } from "./b";\n`, "lib/b.ts": `export function helper(x: any) { return x; }\n`, "use.ts": `import { helper } from "./lib/a";\nhelper(1);\n` }, async (dir) => {
      expect(await callerFiles(dir, [{ file: "lib/a.ts", before: `export function helper(x: any) { return x; }\n`, after: `export { helper } from "./b";\n` }])).toEqual([]);
    });
  });

  test("callers that are only tests are left out; a test beside a real caller is labelled", async () => {
    await withProject(cart({ "billing/cart.test.ts": `import { applyDiscount } from "./cart";\napplyDiscount(1);\n` }), async (dir) => {
      expect(await checkBlastRadius(dir, arity)).toEqual([]);
    });
    await withProject(cart({ "billing/cart.test.ts": `import { applyDiscount } from "./cart";\napplyDiscount(1);\n`, "a.ts": `import { applyDiscount } from "./billing/cart";\napplyDiscount(1);\n` }), async (dir) => {
      const f = await checkBlastRadius(dir, arity);
      expect(f[0].callers.map((c) => [c.file, !!c.test])).toEqual([["a.ts", false], ["billing/cart.test.ts", true]]);
    });
  });
});

describe("M118 cost, stop and kind", () => {
  test("stops at the abort signal and returns nothing", async () => {
    await withProject(cart({ "a.ts": `import { applyDiscount } from "./billing/cart";\napplyDiscount(1);\n` }), async (dir) => {
      const ac = new AbortController(); ac.abort();
      expect(await checkBlastRadius(dir, arity, { signal: ac.signal })).toEqual([]);
    });
  });

  test("reads no more than maxFiles files, and no walk at all when no export changed", async () => {
    const files: Record<string, string> = { "billing/cart.ts": TWO };
    for (let i = 0; i < 30; i++) files[`f${String(i).padStart(2, "0")}.ts`] = `import { applyDiscount } from "./billing/cart";\napplyDiscount(1);\n`;
    await withProject(files, async (dir) => {
      const all = await checkBlastRadius(dir, arity);
      expect(all[0].callers.length).toBe(30);
      const capped = await checkBlastRadius(dir, arity, { maxFiles: 5 });
      expect(capped[0].callers.length).toBeLessThanOrEqual(5);
      expect(await checkBlastRadius(dir, [{ file: "billing/cart.ts", before: TWO, after: TWO }])).toEqual([]);
    });
  });

  test("stops when out of time", async () => {
    await withProject(cart({ "a.ts": `import { applyDiscount } from "./billing/cart";\napplyDiscount(1);\n` }), async (dir) => {
      let t = 0;
      expect(await checkBlastRadius(dir, arity, { maxMs: 10, now: () => (t += 100) })).toEqual([]);
    });
  });

  test("the reason kind is callers_may_break: in the protocol, never a stop, and rated worth a look", async () => {
    expect((REVIEW_REASONS as readonly string[]).includes("callers_may_break")).toBe(true);
    expect(STOP_KINDS.has("callers_may_break")).toBe(false);
    await withProject(cart({ "a.ts": `import { applyDiscount } from "./billing/cart";\napplyDiscount(1);\n` }), async (dir) => {
      const found = await blastRadiusReasons(dir, arity);
      expect(found.map((r) => r.kind)).toEqual(["callers_may_break"]);
      const r = rate({ changes: [{ file: "billing/cart.ts", kind: "modified" }], touches: [], secrets: [], stillUsed: [], secretFiles: [], checks: "passed", count: 1, capped: false, found });
      expect(r.rating).toBe("worth_a_look");
    });
  });
});
