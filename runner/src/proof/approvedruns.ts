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

/** Folders whose build files are never the person's own: downloaded or generated code, which a version leaves out or which a
 *  tool puts back. One list, used by the saved version reader and by the watch, so both print the same files. */
export const NATIVE_SKIP_DIRS: ReadonlySet<string> = new Set(["node_modules", ".git", "vendor", "Pods", "Carthage", "DerivedData", "build", "target", ".gradle", ".build", "dist", ".next", ".turbo", ".cache", "venv", ".venv", "__pycache__", "coverage"]);

/** The files a Go, Rust, Java, Kotlin, Swift or Xcode build runs code from, at any depth: build.rs, Cargo's config, go.mod, a
 *  Maven or Gradle build file, every other Gradle script (script plugins and init scripts are applied by the build), their
 *  wrapper scripts and settings, Maven's extensions and downloader, buildSrc, Package.swift and SwiftPM plugins, and an Xcode
 *  project (its run script phases live in project.pbxproj, its build pre and post actions in the schemes, its settings in
 *  .xcconfig files). A task that changes one is asked about exactly like a changed package.json. */
export const NATIVE_RUN_FILE = /(?:^|\/)(?:go\.(?:mod|sum|work)|Cargo\.(?:toml|lock)|build\.rs|rust-toolchain(?:\.toml)?|pom\.xml|mvnw|gradlew|gradle\.properties|Package\.(?:swift|resolved)|Package@swift-[\w.]+\.swift|project\.pbxproj|contents\.xcworkspacedata|maven-wrapper\.properties|gradle-wrapper\.properties|libs\.versions\.toml|extensions\.xml|MavenWrapperDownloader\.java)$|\.gradle(?:\.kts)?$|\.xc(?:scheme|config)$|(?:^|\/)\.cargo\/config(?:\.toml)?$|(?:^|\/)buildSrc\/|(?:^|\/)Plugins\/|(?:^|\/)\.mvn\/(?:jvm|maven)\.config$/;
/** Binary files a build runs code from: the wrapper jars. They are fingerprinted by their bytes, never read as text. */
export const NATIVE_BINARY_RUN_FILE = /(?:^|\/)(?:gradle-wrapper|maven-wrapper)\.jar$/;
export const isRunFile = (p: string): boolean => (RUN_FILES as readonly string[]).includes(p);
const inSkipped = (p: string) => p.split("/").slice(0, -1).some((part) => NATIVE_SKIP_DIRS.has(part));
export const isNativeRunFile = (p: string): boolean => NATIVE_RUN_FILE.test(p) && !inSkipped(p);
export const isNativeBinaryRunFile = (p: string): boolean => NATIVE_BINARY_RUN_FILE.test(p) && !inSkipped(p);
const NATIVE_MAX = 2_000_000;

type RunFileStore = { readFiles(id: string, keep: (path: string) => boolean, maxBytes?: number): Promise<Record<string, string>>; fileIds?(id: string, keep: (path: string) => boolean): Promise<Record<string, string>> };
/** What stands for a binary file in a fingerprint: a saved version's id of its content (git's blob id), which the watch works
 *  out the same way from the bytes. */
export const BINARY_MARK = "blob:";
/** The git id of some content: what a saved version calls a file, so a live folder and a saved version print alike. */
export const blobId = (bytes: Uint8Array): string => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

/** The files a check would run from, as saved in a version: the usual ones (package.json, lock files, .replit, .claude/launch.json)
 *  and a native project's build files. Those can be big (an Xcode project), so they are read up to 2 MB. The wrapper jars are
 *  stood for by the id of their content. */
export async function readRunFiles(store: RunFileStore, id: string): Promise<Record<string, string>> {
  const out = { ...(await store.readFiles(id, isRunFile)), ...(await store.readFiles(id, isNativeRunFile, NATIVE_MAX)) };
  if (store.fileIds) for (const [path, oid] of Object.entries(await store.fileIds(id, isNativeBinaryRunFile))) out[path] = `${BINARY_MARK}${oid}`;
  return out;
}

/** One fingerprint of everything in RUN_FILES that a check would run, and of a native project's build files. A project with
 *  none of those has the very same fingerprint as before they were looked at, so nobody is asked twice. */
export function runPrint(files: Record<string, string | undefined>): string {
  const h = createHash("sha256");
  for (const f of RUN_FILES) {
    const v = f === "package.json" ? runsOf(files[f]) : files[f];
    h.update(`${f}\0${v === undefined ? "\u0001none" : v}\0`);
  }
  for (const f of Object.keys(files).filter((k) => !(RUN_FILES as readonly string[]).includes(k) && (isNativeRunFile(k) || isNativeBinaryRunFile(k))).sort()) h.update(`${f}\0${files[f] ?? "\u0001none"}\0`);
  return h.digest("hex");
}
