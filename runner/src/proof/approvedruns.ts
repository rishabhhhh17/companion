// What the person has said yes to running, per project: a fingerprint of everything a check would run that a task can change
// (package.json's scripts and packages, the lock files, .replit and .claude/launch.json). A check runs those on this Mac
// outside the sandbox Claude's own commands get, so whenever they differ from every version the person said yes to (or the
// project as it was before Companion first checked it), the check asks again or runs none of them (ladder.ts).
// Kept next to the project's snapshots, outside the project, so a task cannot write it.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type RunApprovals = { has(print: string): boolean; add(print: string): void; empty(): boolean };

/** The most versions remembered; the oldest is forgotten first. */
export const MAX_APPROVED = 50;

/** Remembered in a small file. A file that cannot be read counts as empty; one that cannot be written leaves the record as
 *  it was, so the next check asks again. */
export function fileApprovals(path: string): RunApprovals {
  const read = (): string[] => {
    try { const j = JSON.parse(readFileSync(path, "utf8")); return Array.isArray(j) ? j.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
  };
  return {
    has: (print) => read().includes(print),
    empty: () => read().length === 0,
    add: (print) => {
      const list = read().filter((x) => x !== print);
      list.push(print);
      try {
        mkdirSync(dirname(path), { recursive: true });
        const tmp = `${path}.${process.pid}.tmp`;
        writeFileSync(tmp, JSON.stringify(list.slice(-MAX_APPROVED)));
        renameSync(tmp, path);
      } catch { /* not remembered: the next check asks again */ }
    },
  };
}

export function memoryApprovals(start: string[] = []): RunApprovals {
  const list = [...start];
  return { has: (p) => list.includes(p), empty: () => list.length === 0, add: (p) => { if (!list.includes(p)) list.push(p); while (list.length > MAX_APPROVED) list.shift(); } };
}

/** The files a check runs from that a task can change. */
export const RUN_FILES = ["package.json", "bun.lock", "bun.lockb", "pnpm-lock.yaml", "yarn.lock", "package-lock.json", ".replit", ".claude/launch.json"] as const;

/** What package.json makes a check run: its scripts (with npm's install steps), its packages and what decides which
 *  versions are installed and from where. */
export function runsOf(text: string | undefined): string {
  if (text === undefined) return "";
  try {
    const p = JSON.parse(text);
    return JSON.stringify([p?.scripts ?? {}, p?.dependencies ?? {}, p?.devDependencies ?? {}, p?.optionalDependencies ?? {}, p?.peerDependencies ?? {}, p?.workspaces ?? null, p?.overrides ?? null, p?.resolutions ?? null, p?.pnpm ?? null, p?.packageManager ?? null]);
  } catch { return `unreadable:${text}`; }
}

/** The files a Go, Rust, Java, Kotlin, Swift or Xcode build runs code from, at any depth: build.rs, Cargo's config, go.mod, a
 *  Maven or Gradle build file, their wrapper scripts and settings, buildSrc, Package.swift, and an Xcode project (its run
 *  script phases live in project.pbxproj). A task that changes one is asked about exactly like a changed package.json. */
export const NATIVE_RUN_FILE = /(?:^|\/)(?:go\.(?:mod|sum|work)|Cargo\.(?:toml|lock)|build\.rs|rust-toolchain(?:\.toml)?|pom\.xml|mvnw|gradlew|gradle\.properties|(?:build|settings)\.gradle(?:\.kts)?|Package\.(?:swift|resolved)|project\.pbxproj|contents\.xcworkspacedata|maven-wrapper\.properties|gradle-wrapper\.properties|libs\.versions\.toml)$|(?:^|\/)\.cargo\/config(?:\.toml)?$|(?:^|\/)buildSrc\/|(?:^|\/)\.mvn\/(?:jvm|maven)\.config$/;
export const isRunFile = (p: string): boolean => (RUN_FILES as readonly string[]).includes(p);
export const isNativeRunFile = (p: string): boolean => NATIVE_RUN_FILE.test(p) && !p.split("/").some((part) => part === "node_modules" || part === ".git");
const NATIVE_MAX = 2_000_000;

/** The files a check would run from, as saved in a version: the usual ones (package.json, lock files, .replit, .claude/launch.json)
 *  and a native project's build files. Those can be big (an Xcode project), so they are read up to 2 MB. */
export async function readRunFiles(store: { readFiles(id: string, keep: (path: string) => boolean, maxBytes?: number): Promise<Record<string, string>> }, id: string): Promise<Record<string, string>> {
  return { ...(await store.readFiles(id, isRunFile)), ...(await store.readFiles(id, isNativeRunFile, NATIVE_MAX)) };
}

/** One fingerprint of everything in RUN_FILES that a check would run, and of a native project's build files. A project with
 *  none of those has the very same fingerprint as before they were looked at, so nobody is asked twice. */
export function runPrint(files: Record<string, string | undefined>): string {
  const h = createHash("sha256");
  for (const f of RUN_FILES) {
    const v = f === "package.json" ? runsOf(files[f]) : files[f];
    h.update(`${f}\0${v === undefined ? "\u0001none" : v}\0`);
  }
  for (const f of Object.keys(files).filter((k) => !(RUN_FILES as readonly string[]).includes(k) && isNativeRunFile(k)).sort()) h.update(`${f}\0${files[f] ?? "\u0001none"}\0`);
  return h.digest("hex");
}
