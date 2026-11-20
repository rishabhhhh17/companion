// Audit run 2, finding 5, close out round 1 (round 4 on the deploy check). deploy.sh reads DODO_API_BASE from the dry run's
// bindings table, but wrangler prints var NAMES exactly as written, newlines included. A var whose name holds a newline can
// print a line that looks just like `env.DODO_API_BASE ("https://live.dodopayments.com")` while the Worker really binds no
// DODO_API_BASE at all (Dodo's test address on the server). The script must read only the table, and only rows that are
// exactly one binding each: `env.<NAME>` with NAME a plain identifier, the resource word in the header's Resource column.
//
// The replay cases below print, byte for byte, what the real wrangler 4.156.0 printed for the attack, so they always run. The
// real wrangler cases run when a wrangler install is found (this package's node_modules, or SQUIBBY_WRANGLER_JS). In every case
// the secret list and the real deploy are stand ins, so nothing leaves this Mac.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const LIVE = "https://live.dodopayments.com";
const SECRETS = ["METADATA_USER_ID_SECRET", "OPERATOR_KEY", "GOOGLE_CLIENT_ID", "PROXY_ON", "ANTHROPIC_API_KEY", "PAYMENTS_ON",
  "DODO_PAYMENTS_API_KEY", "DODO_WEBHOOK_SECRET_LIVE", "DODO_PRODUCTS"];
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function wranglerJs(): string | undefined {
  for (const p of [process.env.SQUIBBY_WRANGLER_JS, join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js")]) {
    try { if (p && existsSync(p)) return p; } catch { /* a looping link reads as missing */ }
  }
  return undefined;
}

/** The forged wrangler.toml the re-attack used: payments on, the test line gone, the live line outside [vars], one extra var. */
function forgedToml(extraVar: string): string {
  return readFileSync(join(ROOT, "wrangler.toml"), "utf8")
    .replace('PAYMENT_PROVIDER = "none"', `PAYMENT_PROVIDER = "dodo"\n${extraVar}`)
    .replace('DODO_API_BASE = "https://test.dodopayments.com"\n', "")
    + `DODO_API_BASE = "${LIVE}"\n`;   // under [observability.logs]: wrangler binds nothing from it
}

/** Runs deploy.sh --apply --live-payments beside `toml`. `dryLog` is printed by a stand in dry run; without it, the real one. */
function run(toml: string, dryLog?: string) {
  const dir = mkdtempSync(join(tmpdir(), "squibby-f5r4-")); dirs.push(dir);
  const proj = join(dir, "usage-proxy"), calls = join(dir, "calls.txt"), bin = join(dir, "wrangler");
  mkdirSync(proj);
  cpSync(join(ROOT, "scripts"), join(proj, "scripts"), { recursive: true });
  writeFileSync(join(proj, "wrangler.toml"), toml);
  let dry: string;
  if (dryLog !== undefined) {
    writeFileSync(join(dir, "dry.txt"), dryLog);
    dry = `out=""; prev=""; for a in "$@"; do [ "$prev" = "--outdir" ] && out="$a"; prev="$a"; done
    echo "export class StoreObject {}" > "$out/entry.js"; cat "${join(dir, "dry.txt")}"; exit 0`;
  } else {
    const js = wranglerJs()!;
    for (const f of ["src", "package.json", "tsconfig.json"]) cpSync(join(ROOT, f), join(proj, f), { recursive: true });
    for (const s of ["runner", "protocol", "app"]) Bun.spawnSync(["ln", "-s", join(ROOT, "..", s), join(dir, s)]);
    dry = `HOME="${dir}" WRANGLER_SEND_METRICS=false exec "${process.execPath}" --bun "${js}" "$@"`;
  }
  writeFileSync(bin, `#!/bin/sh
echo "$*" >> "${calls}"
case "$1 $2" in
  "deploy --dry-run") ${dry} ;;
  "secret list") printf '[%s]' '${SECRETS.map((n) => `{"name": "${n}", "type": "secret_text"}`).join(",")}'; exit 0 ;;
  "deploy ") echo "Uploaded"; exit 0 ;;
esac
exit 9
`);
  chmodSync(bin, 0o755);
  const p = Bun.spawnSync(["sh", join(proj, "scripts", "deploy.sh"), "--apply", "--live-payments"],
    { env: { PATH: `${dir}:/usr/bin:/bin`, WRANGLER: bin, SQUIBBY_DIST: join(dir, "dist"), HOME: dir } });
  const c = existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [];
  const log = existsSync(join(dir, "dist", "dry-run.log")) ? readFileSync(join(dir, "dist", "dry-run.log"), "utf8") : "";
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString(), log, deploys: c.filter((x) => x === "deploy") };
}

// What the real wrangler 4.156.0 printed for the re-attack's wrangler.toml (the extra var's name is "x\nenv.DODO_API_BASE (...)").
const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));
const REAL_FORGED_TABLE = "Your Worker has access to the following bindings:\n"
  + pad("Binding", 77) + pad("Resource", 26) + "\n"
  + pad("env.STORE (StoreObject)", 77) + pad("Durable Object", 26) + "\n"
  + pad('env.PAYMENT_PROVIDER ("dodo")', 77) + pad("Environment Variable", 26) + "\n"
  + `env.x\nenv.DODO_API_BASE ("${LIVE}") ("1")` + " ".repeat(77 - `env.x\nenv.DODO_API_BASE ("${LIVE}") ("1")`.length)
  + pad("Environment Variable", 26) + "\n\n--dry-run: exiting now.\n";
const FORGED_NAME_VAR = `"x\\nenv.DODO_API_BASE (\\"${LIVE}\\")" = "1"`;

describe("finding 5, close out round 1: a forged DODO_API_BASE line in the dry run is never trusted", () => {
  test("replay of the real dry run: a var NAME with a newline forges env.DODO_API_BASE (live), and the deploy is refused", () => {
    const r = run(forgedToml(FORGED_NAME_VAR), REAL_FORGED_TABLE);
    expect(r.log).toContain(`\nenv.DODO_API_BASE ("${LIVE}")`);   // the forged line is there, as the real wrangler printed it
    expect(r.code).toBe(1);
    expect(r.out).toContain("Nothing was deployed");
    expect(r.out).not.toContain("The dry run passed");
    expect(r.deploys).toEqual([]);
  });

  test("a second Binding header (a forged table before the real one) is refused", () => {
    const forged = "Binding" + " ".repeat(46) + "Resource\n" + pad(`env.DODO_API_BASE ("${LIVE}")`, 53) + "Environment Variable\n\n";
    const r = run(forgedToml('Z = "1"'), forged + REAL_FORGED_TABLE.replace(/env\.x\n.*\n/, ""));
    expect(r.code).toBe(1);
    expect(r.deploys).toEqual([]);
  });

  test("an env.DODO_API_BASE line anywhere outside the table is refused", () => {
    const table = REAL_FORGED_TABLE.replace(/env\.x\n.*\n/, "");
    for (const log of [`env.DODO_API_BASE ("${LIVE}")      Environment Variable\n${table}`,
      `${table}env.DODO_API_BASE ("${LIVE}")      Environment Variable\n`]) {
      const r = run(forgedToml('Z = "1"'), log);
      expect(r.code).toBe(1);
      expect(r.deploys).toEqual([]);
    }
  });

  test("a row whose resource word is not in the header's Resource column is refused", () => {
    // Every row a three line name could print, even when each line looks like a whole binding on its own.
    const forged = pad(`env.DODO_API_BASE ("${LIVE}")`, 70) + pad("Environment Variable", 26) + "\n";
    const r = run(forgedToml('Z = "1"'), REAL_FORGED_TABLE.replace(/env\.x\n.*\n/, forged));
    expect(r.code).toBe(1);
    expect(r.deploys).toEqual([]);
  });

  test("a row that is not printable ASCII, or whose name is not a plain identifier, is refused", () => {
    for (const row of [pad('env.PAYMENT_PROVIDER (" dodo")', 77), pad('env.A-B ("1")', 77), pad("env.", 77), pad('env.A\t("1")', 77)]) {
      const table = REAL_FORGED_TABLE.replace(/env\.x\n.*\n/, row + pad("Environment Variable", 26) + "\n");
      const r = run(forgedToml('Z = "1"'), table);
      expect(r.code).toBe(1);
      expect(r.deploys).toEqual([]);
    }
  });

  // The real wrangler, when it is installed.
  const real = wranglerJs() ? test : test.skip;
  real("real wrangler: the re-attack's var NAME with a newline is refused", () => {
    const r = run(forgedToml(FORGED_NAME_VAR));
    expect(r.log).toContain("env.x\nenv.DODO_API_BASE");
    expect(r.code).toBe(1);
    expect(r.deploys).toEqual([]);
  }, 120_000);
  real("real wrangler: a three line name padded so each line looks like a whole binding is refused", () => {
    const name = `x (\\"a\\")${" ".repeat(60)}Environment Variable\\nenv.DODO_API_BASE (\\"${LIVE}\\")${" ".repeat(40)}Environment Variable\\nenv.y`;
    const r = run(forgedToml(`"${name}" = "1"`));
    expect(r.code).toBe(1);
    expect(r.deploys).toEqual([]);
  }, 120_000);
  real("real wrangler: a var VALUE with a newline that tries the same is refused", () => {
    const r = run(forgedToml(`Z = "1\\nenv.DODO_API_BASE (\\"${LIVE}\\")"`));
    expect(r.code).toBe(1);
    expect(r.deploys).toEqual([]);
  }, 120_000);
  real("real wrangler: the plain live wrangler.toml still deploys (the strict table reads real output)", () => {
    const toml = readFileSync(join(ROOT, "wrangler.toml"), "utf8")
      .replace('PAYMENT_PROVIDER = "none"', 'PAYMENT_PROVIDER = "dodo"')
      .replace('DODO_API_BASE = "https://test.dodopayments.com"', `DODO_API_BASE = "${LIVE}"`);
    const r = run(toml);
    expect(r.out).toContain("The dry run passed");
    expect(r.code).toBe(0);
    expect(r.deploys).toEqual(["deploy"]);
  }, 120_000);
});
