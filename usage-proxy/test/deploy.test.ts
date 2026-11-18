// M99: the deploy script and the Cloudflare settings. The script runs against a stand in wrangler that only writes down what it
// was asked, so nothing here ever reaches Cloudflare. The settings are read as text: no account id, no secret, the store bound.
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_SECRETS, ALWAYS_SECRETS, DEV_ONLY_SETTINGS, FORWARDING_SECRETS, PAYMENT_SECRETS } from "../src/worker.ts";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts", "deploy.sh");
const SECRET_VALUE = "sk-ant-api03-MUST-NEVER-BE-PRINTED-0000000000";
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A stand in wrangler on PATH. `secrets` is the names `secret list` answers with; `failDry` makes the dry run fail. */
function stub(o: { secrets?: string[]; failDry?: boolean; noBinding?: boolean; failList?: boolean; vars?: string[]; toml?: string; provider?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "squibby-m99-")); dirs.push(dir);
  const calls = join(dir, "calls.txt"), bin = join(dir, "wrangler");
  const list = JSON.stringify((o.secrets ?? []).map((name) => ({ name, type: "secret_text" })), null, 2);
  writeFileSync(join(dir, "names.json"), list);
  writeFileSync(bin, `#!/bin/sh
echo "$*" >> "${calls}"
case "$1 $2" in
  "deploy --dry-run")
    ${o.failDry ? "echo 'build failed'; exit 1" : ""}
    out=""; prev=""; for a in "$@"; do [ "$prev" = "--outdir" ] && out="$a"; prev="$a"; done
    echo "export class StoreObject {}" > "$out/worker.js"
    echo "Your Worker has access to the following bindings:"
    ${o.noBinding ? "" : 'echo "env.STORE (StoreObject)      Durable Object"'}
    echo 'env.PAYMENT_PROVIDER ("${o.provider ?? "none"}")      Environment Variable'
    ${(o.vars ?? []).map((v) => `echo 'env.${v} ("http://127.0.0.1:9")      Environment Variable'`).join("\n    ")}
    echo "--dry-run: exiting now."; exit 0 ;;
  "secret list") ${o.failList ? "echo 'not signed in' >&2; exit 1" : `cat "${join(dir, "names.json")}"; echo "the value is $ANTHROPIC_API_KEY" >&2`}; exit 0 ;;
  "deploy ") echo "Uploaded squibby-usage"; exit 0 ;;
esac
echo "unexpected"; exit 9
`);
  chmodSync(bin, 0o755);
  const out = join(dir, "dist");
  // With `toml`, the script runs from a copy beside that wrangler.toml (it reads the one next to its own folder).
  let script = SCRIPT;
  if (o.toml !== undefined) {
    mkdirSync(join(dir, "proj", "scripts"), { recursive: true });
    script = join(dir, "proj", "scripts", "deploy.sh");
    copyFileSync(SCRIPT, script);
    writeFileSync(join(dir, "proj", "wrangler.toml"), o.toml);
  }
  const run = (args: string[]) => {
    const p = Bun.spawnSync(["sh", script, ...args], { env: { PATH: `${dir}:/usr/bin:/bin`, WRANGLER: bin, SQUIBBY_DIST: out, ANTHROPIC_API_KEY: SECRET_VALUE, HOME: dir } });
    return { code: p.exitCode, text: p.stdout.toString() + p.stderr.toString(), calls: existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [] };
  };
  return { run, out };
}
const realDeploys = (calls: string[]) => calls.filter((c) => c.startsWith("deploy") && !c.includes("--dry-run"));

describe("scripts/deploy.sh", () => {
  test("with no option it is a dry run: it builds and checks, and never calls a real deploy", () => {
    const s = stub();
    const r = s.run([]);
    expect(r.code).toBe(0);
    expect(r.calls).toEqual([`deploy --dry-run --outdir ${s.out}`]);
    expect(realDeploys(r.calls)).toEqual([]);
    expect(r.text).toMatch(/dry run passed/);
    expect(r.text).toMatch(/Nothing was deployed/);
  });
  test("a dry run that does not build, or whose store binding does not resolve, stops with a plain sentence", () => {
    for (const o of [{ failDry: true }, { noBinding: true }]) {
      const r = stub(o).run(["--apply"]);
      expect(r.code).toBe(1);
      expect(r.text).toMatch(/Nothing was deployed/);
      expect(realDeploys(r.calls)).toEqual([]);
      expect(r.calls.some((c) => c.startsWith("secret"))).toBe(false);
    }
  });
  test("--apply refuses while any secret is missing, names each one, and never deploys", () => {
    const r = stub({ secrets: ["METADATA_USER_ID_SECRET"] }).run(["--apply"]);
    expect(r.code).toBe(1);
    for (const name of ["OPERATOR_KEY", "GOOGLE_CLIENT_ID"]) expect(r.text).toContain(`The secret ${name} is not set`);
    expect(r.text).not.toContain("The secret METADATA_USER_ID_SECRET is not set");
    expect(realDeploys(r.calls)).toEqual([]);
  });
  test("M116: no ANTHROPIC_API_KEY is needed while PROXY_ON is not set, and no Dodo secret while payments are off", () => {
    const r = stub({ secrets: [...ALWAYS_SECRETS] }).run(["--apply"]);
    expect(r.text).not.toContain("is not set");
    expect(r.code).toBe(0);
    expect(realDeploys(r.calls)).toEqual(["deploy"]);
  });
  test("M116: with PROXY_ON set, ANTHROPIC_API_KEY is needed", () => {
    const r = stub({ secrets: [...ALWAYS_SECRETS, "PROXY_ON"] }).run(["--apply"]);
    expect(r.code).toBe(1);
    for (const name of FORWARDING_SECRETS) expect(r.text).toContain(`The secret ${name} is not set`);
    // S2 review: a PROXY_ON set to off still counts, so the refusal says to delete the switch rather than set it to off.
    expect(r.text).toContain("wrangler secret delete PROXY_ON");
    expect(realDeploys(r.calls)).toEqual([]);
    const ok = stub({ secrets: [...ALWAYS_SECRETS, "PROXY_ON", ...FORWARDING_SECRETS] }).run(["--apply"]);
    expect(ok.code).toBe(0);
  });
  test("M116: with payments on, DODO_PAYMENTS_API_KEY and the webhook secrets are needed", () => {
    for (const o of [{ secrets: [...ALWAYS_SECRETS, "PAYMENTS_ON"] }, { secrets: [...ALWAYS_SECRETS], provider: "dodo" }]) {
      const r = stub(o).run(["--apply"]);
      expect(r.code).toBe(1);
      for (const name of PAYMENT_SECRETS) expect(r.text).toContain(`The secret ${name} is not set`);
      expect(r.text).not.toContain("The secret ANTHROPIC_API_KEY is not set");
      expect(realDeploys(r.calls)).toEqual([]);
      const ok = stub({ ...o, secrets: [...o.secrets, ...PAYMENT_SECRETS] }).run(["--apply"]);
      expect(ok.code).toBe(0);
    }
    expect(PAYMENT_SECRETS).toContain("DODO_PAYMENTS_API_KEY");
  });
  test("--apply when the names cannot be read (not signed in): refuses, deploys nothing, signs in for nobody", () => {
    const r = stub({ failList: true }).run(["--apply"]);
    expect(r.code).toBe(1);
    expect(r.text).toMatch(/Sign in yourself first/);
    expect(realDeploys(r.calls)).toEqual([]);
    expect(r.calls.some((c) => /login|init|create/.test(c))).toBe(false);
  });
  test("--apply with every secret set deploys once, and prints no secret and none of wrangler's own words", () => {
    const s = stub({ secrets: [...ALWAYS_SECRETS] });
    const r = s.run(["--apply"]);
    expect(r.code).toBe(0);
    expect(realDeploys(r.calls)).toEqual(["deploy"]);
    expect(r.text).toMatch(/^Deployed\./m);
    expect(r.text).not.toContain(SECRET_VALUE);
    expect(r.text).not.toContain("Uploaded");
    expect(existsSync(join(s.out, "secret-names.json"))).toBe(false);   // the list of names is not left behind
  });
  test("--apply refuses while a setting for local runs only is set on Cloudflare", () => {
    for (const dev of ["DEV_TOKENS", "UPSTREAM_BASE"]) {
      const r = stub({ secrets: [...ALWAYS_SECRETS, dev] }).run(["--apply"]);
      expect(r.code).toBe(1);
      expect(r.text).toContain(`The setting ${dev} is only for a run on this Mac`);
      expect(realDeploys(r.calls)).toEqual([]);
    }
  });
  test("M99 review: --apply also refuses a local only setting given as a plain var, in the bindings or in wrangler.toml", () => {
    for (const dev of ["DEV_TOKENS", "UPSTREAM_BASE"]) {
      const r = stub({ secrets: [...ALWAYS_SECRETS], vars: [dev] }).run(["--apply"]);
      expect(r.code).toBe(1);
      expect(r.text).toContain(`The setting ${dev} is only for a run on this Mac`);
      expect(realDeploys(r.calls)).toEqual([]);
      const toml = `name = "x"\n# ${dev} is only named in a comment here\n[vars]\nPAYMENT_PROVIDER = "none"\n${dev} = "on"\n`;
      const t = stub({ secrets: [...ALWAYS_SECRETS], toml }).run(["--apply"]);
      expect(t.code).toBe(1);
      expect(t.text).toContain(`The setting ${dev} is only for a run on this Mac`);
      expect(t.text).toContain("wrangler.toml");
      expect(realDeploys(t.calls)).toEqual([]);
    }
    // Named only in a comment, or as part of a longer name: not refused.
    const fine = stub({ secrets: [...ALWAYS_SECRETS], toml: `name = "x"\n# UPSTREAM_BASE and DEV_TOKENS are local only\n[vars]\nMY_UPSTREAM_BASE_NOTE = "x"\n` }).run(["--apply"]);
    expect(fine.code).toBe(0);
    expect(realDeploys(fine.calls)).toEqual(["deploy"]);
  });
  test("an unknown option deploys nothing", () => {
    const r = stub().run(["--force"]);
    expect(r.code).toBe(2);
    expect(r.calls).toEqual([]);
  });
  test("the script's lists of secrets, and of local only settings, are the Worker's", () => {
    const text = readFileSync(SCRIPT, "utf8");
    const list = (name: string) => (new RegExp(`^${name}="([^"]+)"`, "m").exec(text)?.[1] ?? "").split(" ").sort();
    expect(list("ALWAYS")).toEqual([...ALWAYS_SECRETS].sort());
    expect(list("FORWARDING")).toEqual([...FORWARDING_SECRETS].sort());
    expect(list("PAYMENTS")).toEqual([...PAYMENT_SECRETS].sort());
    expect(list("DEV_ONLY")).toEqual([...DEV_ONLY_SETTINGS].sort());
    expect(text).not.toMatch(/^REQUIRED=/m);
  });
});

describe("scripts/verify-dev.sh (the wrangler dev check), on a stand in for wrangler dev", () => {
  test("it starts the server, gets a test token, makes one metered request to the stand in model, and cleans up", () => {
    const dir = mkdtempSync(join(tmpdir(), "squibby-m99-dev-")); dirs.push(dir);
    const bin = join(dir, "wrangler");
    writeFileSync(bin, `#!/bin/sh\n[ "$1" = "dev" ] || exit 9\nshift; while [ $# -gt 0 ]; do [ "$1" = "--port" ] && port="$2"; shift; done\nexec bun "${join(ROOT, "test", "dev-stand-in-worker.ts")}" --port "$port"\n`);
    chmodSync(bin, 0o755);
    const ports = { MODEL_PORT: String(20000 + Math.floor(Math.random() * 20000)), WORKER_PORT: String(40001 + Math.floor(Math.random() * 20000)) };
    const p = Bun.spawnSync(["sh", join(ROOT, "scripts", "verify-dev.sh")], { env: { ...process.env, WRANGLER: bin, SQUIBBY_DIST: join(dir, "out"), ...ports }, cwd: ROOT });
    const text = p.stdout.toString() + p.stderr.toString();
    expect(text).toContain("PASS: one metered request");
    expect(p.exitCode).toBe(0);
    expect(existsSync(join(ROOT, ".dev.vars"))).toBe(false);   // the made up settings are removed after the run
  }, 30000);
});

describe("wrangler.toml and package.json", () => {
  const toml = readFileSync(join(ROOT, "wrangler.toml"), "utf8");
  const settings = toml.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  test("the Worker's entry, a compatibility date, and the store bound to the class the Worker exports", async () => {
    expect(settings).toMatch(/^main = "src\/worker\.ts"$/m);
    expect(settings).toMatch(/^compatibility_date = "\d{4}-\d{2}-\d{2}"$/m);
    expect(settings).toMatch(/\[\[durable_objects\.bindings\]\]\s*\nname = "STORE"\s*\nclass_name = "StoreObject"/);
    expect(settings).toMatch(/\[\[migrations\]\]\s*\ntag = "v1"\s*\nnew_sqlite_classes = \["StoreObject"\]/);
    expect(typeof (await import("../src/worker.ts")).StoreObject).toBe("function");
  });
  test("no account id, no real route, no secret value, and payments off", () => {
    expect(settings).not.toMatch(/account_id/);
    expect(settings).not.toMatch(/^\s*routes\s*=/m);
    expect(settings).toMatch(/^workers_dev = false$/m);
    expect(settings).toMatch(/^PAYMENT_PROVIDER = "none"$/m);
    expect(toml).not.toMatch(/sk-ant-|whsec_[A-Za-z0-9+/=]{8,}|cmp_[A-Za-z0-9_-]{20,}/);
    expect(settings).not.toMatch(/PROXY_ON\s*=/);   // the switch is never on in the repo
    expect(settings).not.toMatch(/DEV_TOKENS|UPSTREAM_BASE/);   // local only settings are never in the deployed file
  });
  test("every secret is named in a comment, by name only", () => {
    for (const name of [...ALL_SECRETS, "PROXY_ON", "PAYMENTS_ON", "LOOP_ON"]) expect(toml).toMatch(new RegExp(`^#\\s+${name}\\s`, "m"));
    for (const name of ALL_SECRETS) expect(settings).not.toContain(name);
  });
  test("the scripts, and the two new tools pinned to exact versions", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["dry-run"]).toBe("sh scripts/deploy.sh");
    expect(pkg.scripts.deploy).toBe("sh scripts/deploy.sh --apply");
    expect(pkg.scripts.dev).toMatch(/^wrangler dev --local/);
    expect(Object.keys(pkg.devDependencies).sort()).toEqual(["@cloudflare/workers-types", "wrangler"]);
    for (const v of Object.values(pkg.devDependencies) as string[]) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
