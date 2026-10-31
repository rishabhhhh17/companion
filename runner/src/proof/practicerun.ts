// The practice projects without Node (M49). A practice copy (app/sample) needs no packages, and its checks are Node's own
// test runner ("node --test") and a server ("node server.js"). On a Mac with no Node at all, those run on the engine's own
// Bun instead: the Bun that runs this engine (the one inside the app, Contents/Resources/engine/bin/bun). Proven on this
// Mac in spikes/practice-bun (RESULTS.md): in the safety box for checks, with no internet, Bun's test runner runs the
// practices' node:test files, fails at the place the practice catalog expects and passes after the small fix, and Bun runs
// their servers. Never for the person's own projects: only a copy Companion made of a practice, and only while Node is not
// on this Mac at all. With Node there, everything runs exactly as before.
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { minimalEnv } from "../env.ts";
import { isPracticeFolder } from "../plan.ts";
import { shq } from "./exec.ts";
import type { Detected } from "./detect.ts";

/** How a project's checks run: "node" is the usual way (Node and npm, or whatever the project uses); "bun" is the engine's
 *  own Bun, for a practice copy on a Mac without Node; "none" is a practice copy that has neither, which waits for Node. */
export type PracticeRuntime = "node" | "bun" | "none";

/** The one rule: the person's own projects always go the usual way; a practice copy goes the usual way when Node is here,
 *  on the engine's own Bun when it is not, and waits for Node when there is no Bun to use either. */
export function practiceRuntime(o: { practice: boolean; node: boolean; bun: string | null }): PracticeRuntime {
  if (!o.practice || o.node) return "node";
  return o.bun ? "bun" : "none";
}

/** The Bun that runs this engine, when it is Bun (the app's own, or the developer's), else null. */
export function engineBun(execPath: string = process.execPath, isBun: boolean = typeof process.versions.bun === "string"): string | null {
  if (!isBun || !/^bun(?:-[\w.-]+)?$/.test(basename(execPath))) return null;
  return existsSync(execPath) ? execPath : null;
}

/** Is node on the tool path Companion runs commands with (the same one the Mac check reads)? Tests set
 *  COMPANION_TEST_ASSUME_TOOLS (test/setup.ts): Node is then always taken to be here, so nothing else changes in them. */
export function nodeHere(path?: string[]): boolean {
  if (!path && process.env.COMPANION_TEST_ASSUME_TOOLS === "1") return true;
  return (path ?? (minimalEnv().PATH ?? "").split(":")).some((d) => d && existsSync(join(d, "node")));
}

const DEP_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "bundledDependencies", "bundleDependencies"];
/** A copy Companion made of one of its practices: the folder is named the way Companion names its copies, its package.json
 *  is a practice's (practice-<id>), and it needs no packages. identity: the folder whose name counts (a check on an earlier
 *  version runs in a private copy of the practice). Anything else is the person's own project. */
export function isPracticeProject(dir: string, identity: string = dir): boolean {
  if (!isPracticeFolder(identity)) return false;
  let pkg: Record<string, unknown>;
  try { pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); } catch { return false; }
  if (!pkg || typeof pkg !== "object" || typeof pkg.name !== "string" || !/^practice-[a-z][a-z-]{0,39}$/.test(pkg.name)) return false;
  return DEP_FIELDS.every((f) => { const v = pkg[f]; return v === undefined || (typeof v === "object" && v !== null && Object.keys(v).length === 0) || (Array.isArray(v) && v.length === 0); });
}

// Bun the way the practice's own Node commands behave: no bunfig.toml of the project's (it could load code before the tests,
// which Node never does), no .env files loaded on their own (Node does not either; a practice reads its own), and never an
// install while it runs (Bun would otherwise fetch a package it cannot find).
const AS_NODE = "--config=/dev/null --no-install --no-env-file";
/** The tests command for Bun: "node --test" exactly, the practice's own script, and nothing else. */
export const bunTests = (bun: string): string => `${shq(bun)} test ${AS_NODE}`;
/** The server command for Bun: "node <file>.js" exactly, a plain file inside the project, and nothing else. */
export const bunServer = (bun: string, file: string): string => `${shq(bun)} ${AS_NODE} ${shq(file)}`;
/** Whether a command is one of the two above: a practice's check running on the engine's own Bun. */
export const onEngineBun = (command: string | undefined): boolean => !!command && /^'[^']*\/bun(?:-[\w.-]+)?' (?:test )?--config=\/dev\/null --no-install --no-env-file(?: |$)/.test(command);
const NODE_TEST = /^node --test$/;
const NODE_FILE = /^node ((?:\.\/)?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:c|m)?js)$/;

/** A practice copy's checks on the engine's own Bun, when Node is not on this Mac (practiceRuntime). Only the practice's
 *  own two script shapes are translated: its tests ("node --test") and its server ("node server.js"). Any other script is
 *  left as it is, so it fails the way it would without Node, never run some other way. With Node here, or for any other
 *  project, the project is read exactly as before. */
export function withPracticeBun(det: Detected, dir: string, o: { identity?: string; node?: boolean; bun?: string | null } = {}): { det: Detected; runtime: PracticeRuntime } {
  const practice = det.kind === "node" && isPracticeProject(dir, o.identity ?? dir);
  const bun = o.bun === undefined ? engineBun() : o.bun;
  const runtime = practiceRuntime({ practice, node: o.node ?? nodeHere(), bun });
  if (runtime !== "bun" || !bun) return { det, runtime };
  let scripts: Record<string, unknown> = {};
  try { const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); if (p && typeof p.scripts === "object" && p.scripts) scripts = p.scripts; } catch { /* no scripts */ }
  const text = (name: string) => (typeof scripts[name] === "string" ? (scripts[name] as string).trim() : "");
  const pm = det.packageManager;
  const tests = det.tests && det.tests.command === `${pm} run test` && NODE_TEST.test(text("test")) ? { command: bunTests(bun) } : det.tests;
  let start = det.start;
  if (start?.kind === "server" && (start.from === "dev" || start.from === "start") && start.command === `${pm} run ${start.from}`) {
    const m = NODE_FILE.exec(text(start.from));
    if (m) start = { kind: "server", command: bunServer(bun, m[1]), from: start.from };
  }
  return { det: { ...det, tests, start }, runtime };
}
