// M118 (docs/milestones/M118-blast-radius.md): whole-codebase blast-radius check.
// Tests first (TDD): temporary fixture folders only, no model calls, no network.
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blastRadiusReasons, checkBlastRadius, diffExports, formatBlastFindings } from "../src/blastradius.ts";

function makeTempProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "m118-blast-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return dir;
}

describe("M118 diffExports", () => {
  test("detects required parameter count increase on exported functions", () => {
    const before = `export function applyDiscount(cart: Cart) { return cart.total; }`;
    const after = `export function applyDiscount(cart: Cart, plan: Plan) { return cart.total; }`;
    const changes = diffExports(before, after);
    expect(changes).toEqual([{ kind: "arity", name: "applyDiscount", oldMin: 1, newMin: 2 }]);
  });

  test("does not flag when the newly added parameter is optional or has a default", () => {
    const before = `export function applyDiscount(cart: Cart) { return cart.total; }`;
    const afterOpt = `export function applyDiscount(cart: Cart, plan?: Plan) { return cart.total; }`;
    const afterDef = `export function applyDiscount(cart: Cart, plan: Plan = "free") { return cart.total; }`;
    expect(diffExports(before, afterOpt)).toEqual([]);
    expect(diffExports(before, afterDef)).toEqual([]);
  });

  test("detects removed exported functions and const arrow exports", () => {
    const before = `export const formatPrice = (n: number) => String(n);\nexport function oldHelper(a: string) { return a; }`;
    const after = `export const formatPrice = (n: number, currency: string) => String(n) + currency;`;
    const changes = diffExports(before, after);
    expect(changes).toContainEqual({ kind: "arity", name: "formatPrice", oldMin: 1, newMin: 2 });
    expect(changes).toContainEqual({ kind: "removed", name: "oldHelper" });
  });
});

describe("M118 checkBlastRadius across the whole codebase", () => {
  test("catches callers in other files passing too few arguments (applyDiscount case)", () => {
    const dir = makeTempProject({
      "billing/cart.ts": `export function applyDiscount(cart: any, plan: any) { return cart.total; }\n`,
      "api/refunds.ts": `import { applyDiscount } from "../billing/cart.ts";\nexport function refund(c: any) {\n  return applyDiscount(c);\n}\n`,
      "jobs/renewals.ts": `import { applyDiscount } from "../billing/cart.ts";\nconst total = applyDiscount(order.cart);\n`,
      "checkout/ok.ts": `import { applyDiscount } from "../billing/cart.ts";\nconst total = applyDiscount(order.cart, user.plan);\n`,
    });
    try {
      const before = `export function applyDiscount(cart: any) { return cart.total; }\n`;
      const after = `export function applyDiscount(cart: any, plan: any) { return cart.total; }\n`;
      const findings = checkBlastRadius(dir, [{ file: "billing/cart.ts", before, after }]);
      expect(findings.length).toBe(1);
      expect(findings[0].symbol).toBe("applyDiscount");
      expect(findings[0].callers.map((c) => c.file).sort()).toEqual(["api/refunds.ts", "jobs/renewals.ts"]);
      const lines = formatBlastFindings(findings);
      expect(lines[0]).toContain("applyDiscount");
      expect(lines[0]).toContain("api/refunds.ts");
      expect(lines[0]).toContain("jobs/renewals.ts");
      expect(lines[0]).not.toContain("—");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("catches imports of a removed export and ignores node_modules and symlinks", () => {
    const dir = makeTempProject({
      "lib/auth.ts": `export function verifySession(tok: string) { return !!tok; }\n`,
      "routes/login.ts": `import { checkPassword } from "../lib/auth.ts";\ncheckPassword("x");\n`,
      "node_modules/pkg/index.ts": `import { checkPassword } from "../../lib/auth.ts";\ncheckPassword("x");\n`,
    });
    const outside = mkdtempSync(join(tmpdir(), "m118-out-"));
    writeFileSync(join(outside, "leak.ts"), `import { checkPassword } from "./x";\ncheckPassword("x");\n`);
    symlinkSync(join(outside, "leak.ts"), join(dir, "routes/link.ts"));
    try {
      const before = `export function checkPassword(p: string) { return p.length > 0; }\nexport function verifySession(tok: string) { return !!tok; }\n`;
      const after = `export function verifySession(tok: string) { return !!tok; }\n`;
      const findings = checkBlastRadius(dir, [{ file: "lib/auth.ts", before, after }]);
      expect(findings.length).toBe(1);
      expect(findings[0].kind).toBe("removed");
      expect(findings[0].callers.map((c) => c.file)).toEqual(["routes/login.ts"]);
      const reasons = blastRadiusReasons(dir, [{ file: "lib/auth.ts", before, after }]);
      expect(reasons.length).toBe(1);
      expect(reasons[0].kind).toBe("removed_still_used");
      expect(reasons[0].file).toBe("routes/login.ts");
      expect(reasons[0].line).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
