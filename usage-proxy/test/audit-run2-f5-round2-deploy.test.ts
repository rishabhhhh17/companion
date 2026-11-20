// Re-attack round 2 on audit run 2, finding 5 (deploy check, close variation of break 2).
// The Worker reads PAYMENT_PROVIDER with JS trim(), which also strips U+FEFF (zero width no break space) and U+2028.
// scripts/deploy.sh looks for payments with grep [[:space:]], which does not match those. The dry run's bindings come from the
// REAL wrangler 4.156.0 here (run with bun); only `secret list` and the real deploy are a stand in. Nothing leaves this Mac.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALWAYS_SECRETS, FORWARDING_SECRETS } from "../src/worker.ts";
import { paymentProviderFromSetting } from "../src/payments.ts";
import { wranglerTable } from "./wrangler-vars-stub.ts";

const ROOT = join(import.meta.dir, "..");
const WRANGLER_JS = process.env.SQUIBBY_WRANGLER_JS ?? join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function deploy(provider: string) {
  const dir = mkdtempSync(join(tmpdir(), "squibby-f5r2-")); dirs.push(dir);
  const proj = join(dir, "proj"), calls = join(dir, "calls.txt"), bin = join(dir, "wrangler");
  // PROXY_ON and the Anthropic key are set; PAYMENTS_ON is not, so only PAYMENT_PROVIDER says payments are on.
  const secrets = [...ALWAYS_SECRETS, "PROXY_ON", ...FORWARDING_SECRETS, "DODO_PAYMENTS_API_KEY", "DODO_WEBHOOK_SECRET", "DODO_PRODUCTS"];
  writeFileSync(join(dir, "names.json"), JSON.stringify(secrets.map((name) => ({ name, type: "secret_text" })), null, 2));
  writeFileSync(bin, `#!/bin/sh
echo "$*" >> "${calls}"
case "$1 $2" in
  "deploy --dry-run") WRANGLER_SEND_METRICS=false exec "${process.execPath}" --bun "${WRANGLER_JS}" "$@" ;;
  "secret list") cat "${join(dir, "names.json")}"; exit 0 ;;
  "deploy ") echo "Uploaded"; exit 0 ;;
esac
exit 9
`);
  chmodSync(bin, 0o755);
  mkdirSync(join(proj, "scripts"), { recursive: true });
  copyFileSync(join(ROOT, "scripts", "deploy.sh"), join(proj, "scripts", "deploy.sh"));
  // The real Worker source, so the real wrangler builds the real bundle.
  Bun.spawnSync(["cp", "-R", join(ROOT, "src"), join(proj, "src")]);
  Bun.spawnSync(["cp", "-R", join(ROOT, "node_modules"), join(proj, "node_modules")]);
  for (const up of ["protocol", "runner", "app"]) Bun.spawnSync(["cp", "-R", join(ROOT, "..", up), join(dir, up)]);
  const toml = readFileSync(join(ROOT, "wrangler.toml"), "utf8").replace('PAYMENT_PROVIDER = "none"', `PAYMENT_PROVIDER = "${provider}"`);
  writeFileSync(join(proj, "wrangler.toml"), toml);
  const p = Bun.spawnSync(["sh", join(proj, "scripts", "deploy.sh"), "--apply"], { env: { PATH: `${dir}:/usr/bin:/bin`, WRANGLER: bin, SQUIBBY_DIST: join(dir, "dist"), HOME: dir } });
  const c = existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [];
  const log = existsSync(join(dir, "dist", "dry-run.log")) ? readFileSync(join(dir, "dist", "dry-run.log"), "utf8") : "";
  return { code: p.exitCode, text: p.stdout.toString() + p.stderr.toString(), deploys: c.filter((x) => x.startsWith("deploy") && !x.includes("--dry-run")), log };
}

describe("re-attack round 2: deploy.sh misses a PAYMENT_PROVIDER the Worker reads as dodo", () => {
  // The real wrangler is needed here (bun install). Without it these two are skipped; the stand in cases below still run.
  if (!existsSync(WRANGLER_JS)) return;
  for (const [name, ch] of [["U+FEFF", "﻿"], ["U+2028", " "]] as const) {
    test(`PAYMENT_PROVIDER "${name}dodo" with PROXY_ON on Dodo's test address is refused`, () => {
      const value = `${ch}dodo`;
      // Before the fix the Worker read this as dodo. Now it reads it as none (only ASCII spaces are trimmed), and deploy.sh
      // still refuses it: a value it cannot read plainly counts as payments on.
      expect(paymentProviderFromSetting(value)).toBe("none");
      const r = deploy(name === "U+2028" ? "\\u2028dodo" : value);
      expect(r.log).toContain("env.PAYMENT_PROVIDER");          // the real wrangler built it and listed the binding
      expect(r.code).toBe(1);
      // Refused for test mode, or (close out round 1) earlier, because the bindings table has a row it cannot read plainly.
        expect(r.text).toMatch(/test mode|bindings could not be read plainly/);
      expect(r.deploys).toEqual([]);
    }, 120_000);
  }
});

// The same check with a stand in dry run that prints the binding the way the real wrangler 4.156.0 does (the value raw), so it
// runs without node_modules. Every character JS trim() strips, and a value split over two lines, is covered.
function stubDeploy(printed: string) {
  const dir = mkdtempSync(join(tmpdir(), "squibby-f5r2s-")); dirs.push(dir);
  const calls = join(dir, "calls.txt"), bin = join(dir, "wrangler"), binding = join(dir, "binding.txt");
  // Close out round 1: the whole table, padded by JS string length as the real wrangler pads it (newlines counted).
  writeFileSync(binding, wranglerTable([["env.STORE (StoreObject)", "Durable Object"], [`env.PAYMENT_PROVIDER ("${printed}")`, "Environment Variable"]]));
  const secrets = [...ALWAYS_SECRETS, "PROXY_ON", ...FORWARDING_SECRETS, "DODO_PAYMENTS_API_KEY", "DODO_WEBHOOK_SECRET", "DODO_PRODUCTS"];
  writeFileSync(join(dir, "names.json"), JSON.stringify(secrets.map((name) => ({ name, type: "secret_text" })), null, 2));
  writeFileSync(bin, `#!/bin/sh
echo "$*" >> "${calls}"
case "$1 $2" in
  "deploy --dry-run")
    out=""; prev=""; for a in "$@"; do [ "$prev" = "--outdir" ] && out="$a"; prev="$a"; done
    echo "export class StoreObject {}" > "$out/entry.js"
    cat "${binding}"
    exit 0 ;;
  "secret list") cat "${join(dir, "names.json")}"; exit 0 ;;
  "deploy ") echo "Uploaded"; exit 0 ;;
esac
exit 9
`);
  chmodSync(bin, 0o755);
  mkdirSync(join(dir, "proj", "scripts"), { recursive: true });
  const script = join(dir, "proj", "scripts", "deploy.sh");
  copyFileSync(join(ROOT, "scripts", "deploy.sh"), script);
  writeFileSync(join(dir, "proj", "wrangler.toml"), `name = "x"\nmain = "src/entry.ts"\n[vars]\nPAYMENT_PROVIDER = "none"\n`);
  const p = Bun.spawnSync(["sh", script, "--apply"], { env: { PATH: `${dir}:/usr/bin:/bin`, WRANGLER: bin, SQUIBBY_DIST: join(dir, "dist"), HOME: dir } });
  const c = existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [];
  return { code: p.exitCode, text: p.stdout.toString() + p.stderr.toString(), deploys: c.filter((x) => x.startsWith("deploy") && !x.includes("--dry-run")) };
}

// Every character String.prototype.trim() strips (WhiteSpace and LineTerminator in ECMAScript).
const JS_TRIMMED = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff];

describe("re-attack round 2: deploy.sh and the Worker agree on what counts as dodo", () => {
  test("every character JS trim() strips is in the list above", () => {
    for (let c = 0; c <= 0xffff; c++) {
      const ch = String.fromCharCode(c);
      if (ch.trim() === "" && !(c >= 0xd800 && c <= 0xdfff)) expect(JS_TRIMMED).toContain(c);
    }
  });
  for (const c of JS_TRIMMED) {
    for (const where of ["before", "after"] as const) {
      const ch = String.fromCharCode(c), name = `U+${c.toString(16).toUpperCase().padStart(4, "0")}`;
      test(`PAYMENT_PROVIDER with ${name} ${where} dodo, PROXY_ON on Dodo's test address, is refused`, () => {
        const value = where === "before" ? `${ch}dodo` : `dodo${ch}`;
        const r = stubDeploy(value);
        expect(r.code).toBe(1);
        // Refused for test mode, or (close out round 1) earlier, because the bindings table has a row it cannot read plainly.
        expect(r.text).toMatch(/test mode|bindings could not be read plainly/);
        expect(r.deploys).toEqual([]);
        // And the Worker reads dodo only when the character is an ASCII space, tab or line end (which deploy.sh refuses too).
        expect(paymentProviderFromSetting(value)).toBe(c <= 0x20 ? "dodo" : "none");
      });
    }
  }
  test("a value the Worker reads as dodo is always one deploy.sh refuses: spaces, case, and a line break inside the value", () => {
    for (const v of ["dodo", "Dodo", " DODO ", "\tdodo", "\ndodo", "dodo\r\n"]) {
      expect(paymentProviderFromSetting(v)).toBe("dodo");
      const r = stubDeploy(v);
      expect(r.code).toBe(1);
      expect(r.deploys).toEqual([]);
    }
  });
  test("a value with any character that is not plain ASCII counts as payments on, even when it does not spell dodo", () => {
    for (const v of ["d\u200Bodo", "\u0434odo", "none\u00A0", "stripe\uFEFF"]) {
      const r = stubDeploy(v);
      expect(r.code).toBe(1);
      expect(r.deploys).toEqual([]);
    }
  });
  test("none, stripe and a plain unknown word with PROXY_ON still deploy", () => {
    for (const v of ["none", " none ", "NONE", "stripe", "dodox"]) {
      const r = stubDeploy(v);
      expect(r.code).toBe(0);
      expect(r.deploys).toEqual(["deploy"]);
    }
  });
});
