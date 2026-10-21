// FREE, NO MODEL: the transfer projects for the "did they learn?" study (docs/launch/did-they-learn-test.md). Each
// practice in app/sample/practices.json names a transfer folder (app/sample/transfer/<id>): the same kind of mistake in
// a different file with different words. Its project/ folder is what the participant gets; FIX.md and fix.json beside it
// are for the observer only. This makes a participant's copy (the project only, never the answers) and decides whether
// a copy was fixed, the same way every time:
//   bun run scripts/transfer-check.ts list
//   bun run scripts/transfer-check.ts copy <practice id> <new folder>      e.g. copy signup ~/Desktop/Contact page
//   bun run scripts/transfer-check.ts check <practice id> <folder>
// The check never runs in the person's folder and never changes it. It copies the folder to a temporary one, puts back
// the files the person was not meant to change (fix.json protect: the test and package.json, so editing or deleting the
// test cannot make it pass, and the code that reads a setting), then runs the project's own check there: node --test, or
// for the open table Companion's own database access check (ship/rls.ts, the files only) with the rule that says what
// fixed means (ship/opentables.ts), plus two things a table must still have: it is still made, and a rule names its
// owner. Nothing reaches the network.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { analyzeMigrations, cleanSql, rlsGate } from "../src/ship/rls.ts";
import { noTableOpen } from "../src/ship/opentables.ts";

export const SAMPLES = join(import.meta.dir, "../../app/sample");

export type TransferCheck = { kind: "tests" } | { kind: "gate"; table: string; owner: string };
// One change that fixes the project: old is text that must be in the file exactly once, or null for a new file.
export type TransferChange = { file: string; old: string | null; new: string };
// fails: words the check says about the project as shipped (the plain failure the participant sees).
export type TransferFix = { practice: string; check: TransferCheck; fails: string; protect: string[]; changes: TransferChange[] };
export type Verdict = { fixed: boolean; says: string; changedProtected: string[] };

type CatalogEntry = { id: string; transfer?: string };
const catalog = (): CatalogEntry[] => (JSON.parse(readFileSync(join(SAMPLES, "practices.json"), "utf8")) as { practices: CatalogEntry[] }).practices;

/** The practice ids that have a transfer project, in catalog order. */
export function transferIds(): string[] { return catalog().filter((e) => e.transfer).map((e) => e.id); }
/** The transfer folder of a practice (holds project/, FIX.md and fix.json). */
export function transferDir(id: string): string {
  const e = catalog().find((x) => x.id === id);
  if (!e?.transfer) throw new Error(`There is no transfer project for ${JSON.stringify(id)}. Try one of: ${transferIds().join(", ")}.`);
  return join(SAMPLES, e.transfer);
}
export const projectOf = (id: string) => join(transferDir(id), "project");
export function fixOf(id: string): TransferFix { return JSON.parse(readFileSync(join(transferDir(id), "fix.json"), "utf8")) as TransferFix; }

/** Puts the known good fix in place in a folder (a copy, never the shipped project). */
export function applyFix(folder: string, changes: TransferChange[]): void {
  for (const c of changes) {
    const p = join(folder, c.file);
    if (c.old === null) {
      if (existsSync(p)) throw new Error(`${c.file} is already there`);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, c.new);
      continue;
    }
    const text = readFileSync(p, "utf8");
    if (text.split(c.old).length !== 2) throw new Error(`${c.file} should have ${JSON.stringify(c.old)} exactly once`);
    writeFileSync(p, text.replace(c.old, c.new));
  }
}

/** A participant's copy: the project only, in a new folder. Never over anything, never FIX.md or fix.json. */
export function makeCopy(id: string, dest: string): string {
  const to = resolve(dest);
  if (existsSync(to)) throw new Error(`Something is already at ${to}. Pick a new folder name.`);
  cpSync(projectOf(id), to, { recursive: true });
  return to;
}

// node --test prints each failure as TAP; the plain words are the assertion's message or the error that stopped the code.
function plainFailure(out: string): string {
  const lines = out.split("\n");
  const said = lines.map((l) => /^\s*error: '(.*)'\s*$/.exec(l)?.[1]).filter((x): x is string => !!x && x !== "test failed");
  const thrown = lines.map((l) => /^#\s*(?:\w*Error|Error \[\w+\]): (.*)$/.exec(l)?.[0]?.replace(/^#\s*/, "")).filter((x): x is string => !!x);
  return [...new Set([...said, ...thrown])].slice(0, 2).join(" ") || lines.filter((l) => l.trim()).slice(-3).join(" ");
}

function migrations(folder: string): Record<string, string> {
  const out: Record<string, string> = {}, dir = join(folder, "supabase", "migrations");
  try { for (const f of readdirSync(dir)) if (f.endsWith(".sql")) out[f] = readFileSync(join(dir, f), "utf8"); } catch { /* none */ }
  return out;
}
const bare = (name: string) => name.split(".").map((p) => p.trim().replace(/^"|"$/g, "").toLowerCase());
// The rules (policies) made for a public table, each as its text after "on <table>", comments and quoted text taken out.
function rulesFor(files: Record<string, string>, table: string): string[] {
  const out: string[] = [];
  for (const sql of Object.values(files)) {
    for (const m of cleanSql(sql).text.matchAll(/create\s+policy\s+(?:"[^"]+"|\w+)\s+on\s+((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?)([^;]*)/gi)) {
      const parts = bare(m[1]);
      const [schema, name] = parts.length === 2 ? parts : ["public", parts[0]];
      if (schema === "public" && name === table) out.push(m[2]);
    }
  }
  return out;
}

async function gateVerdict(folder: string, c: Extract<TransferCheck, { kind: "gate" }>): Promise<{ fixed: boolean; says: string }> {
  const files = migrations(folder);
  if (!analyzeMigrations(files).tables.includes(c.table)) return { fixed: false, says: `The ${c.table} table is not made any more. The fix keeps the table and protects it.` };
  const g = await rlsGate({ project: folder });
  if (!noTableOpen(g)) return { fixed: false, says: g.detail };
  const owner = new RegExp(String.raw`\b${c.owner}\b`, "i");
  if (!rulesFor(files, c.table).some((r) => /auth\s*\.\s*uid\s*\(\s*\)/i.test(r) && owner.test(r))) {
    return { fixed: false, says: `Row level security is on for ${c.table}, but no rule lets people see their own rows, so the app would show everyone nothing. Add a rule that compares auth.uid() with ${c.owner}.` };
  }
  return { fixed: true, says: `No table is open: ${c.table} has row level security and a rule that checks ${c.owner}.` };
}

/** Was this copy fixed? Checked in a temporary copy with the protected files put back; the folder is never changed. */
export async function checkTransfer(id: string, folder: string): Promise<Verdict> {
  const fix = fixOf(id), pristine = projectOf(id);
  if (!existsSync(folder)) throw new Error(`There is no folder at ${folder}.`);
  const work = realpathSync(mkdtempSync(join(tmpdir(), "companion-transfer-")));
  try {
    cpSync(folder, work, { recursive: true, filter: (src) => !/(^|\/)(node_modules|\.git)(\/|$)/.test(src.slice(folder.length)) });
    const changedProtected: string[] = [];
    for (const f of fix.protect) {
      const was = readFileSync(join(pristine, f));
      const now = existsSync(join(work, f)) ? readFileSync(join(work, f)) : null;
      if (!now || !now.equals(was)) { changedProtected.push(f); mkdirSync(dirname(join(work, f)), { recursive: true }); writeFileSync(join(work, f), was); }
    }
    if (fix.check.kind === "gate") return { ...(await gateVerdict(work, fix.check)), changedProtected };
    const r = spawnSync("node", ["--test"], { cwd: work, encoding: "utf8", timeout: 60_000, env: { PATH: process.env.PATH ?? "", HOME: work, NO_COLOR: "1" } });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const fixed = r.status === 0 && /^# pass [1-9]/m.test(out) && /^# fail 0$/m.test(out);
    return { fixed, says: fixed ? "The project's own check passes." : plainFailure(out), changedProtected };
  } finally { rmSync(work, { recursive: true, force: true }); }
}

if (import.meta.main) {
  const [cmd, id, where] = process.argv.slice(2);
  const usage = "Use: list | copy <practice id> <new folder> | check <practice id> <folder>";
  try {
    if (cmd === "list") { for (const t of transferIds()) console.log(`${t}  ${projectOf(t)}`); process.exit(0); }
    if (!id || !where || (cmd !== "copy" && cmd !== "check")) { console.error(usage); process.exit(2); }
    if (cmd === "copy") { console.log(`Made ${makeCopy(id, where)} (the project only, without FIX.md and fix.json).`); process.exit(0); }
    const v = await checkTransfer(id, resolve(where));
    console.log(v.fixed ? `Fixed. ${v.says}` : `Not fixed. ${v.says}`);
    if (v.changedProtected.length) console.log(`Changed files the fix should not touch (the check used the original ones): ${v.changedProtected.join(", ")}`);
    process.exit(v.fixed ? 0 : 1);
  } catch (e) { console.error((e as Error).message); process.exit(2); }
}
