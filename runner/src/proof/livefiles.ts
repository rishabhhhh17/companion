// The files a check reads to decide what it may run (package.json, the lock files, .replit, .claude/launch.json, and a Go,
// Rust, Java, Kotlin, Swift or Xcode project's build files), read from the project folder as it is now. A watch (F21) checks
// a project that nothing changed, so it needs no saved copy of the project: this stands in for a checkpoint of it, and writes
// nothing anywhere. A link is never followed. It reads the same files, by the same rule (approvedruns.ts), as a saved version.
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { blobId, isNativeBinaryRunFile, isNativeRunFile, NATIVE_SKIP_DIRS, RUN_FILES } from "./approvedruns.ts";

export type FileReader = {
  readFiles(id: string, keep: (path: string) => boolean, maxBytes?: number): Promise<Record<string, string>>;
  fileIds(id: string, keep: (path: string) => boolean): Promise<Record<string, string>>;
};

// A saved version holds at most this many of these files; so does a walk of the folder.
const MAX_FILES = 2000;
// A safety stop for a folder of millions of entries; far above any project's own folders (the skipped ones are not entered).
const MAX_SEEN = 200_000;

/** The project's files that look like a native build file, at any depth, leaving out the folders a saved version leaves out
 *  and the ones that are never the project's own (approvedruns.ts NATIVE_SKIP_DIRS). */
function nativeFiles(project: string, want: (rel: string) => boolean): string[] {
  const out: string[] = [];
  let seen = 0;
  const walk = (rel: string) => {
    let entries;
    try { entries = readdirSync(rel ? join(project, rel) : project, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (++seen > MAX_SEEN || out.length >= MAX_FILES) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!NATIVE_SKIP_DIRS.has(e.name)) walk(r); }
      else if (e.isFile() && want(r)) out.push(r);
    }
  };
  walk("");
  return out;
}

export function liveFiles(project: string): FileReader {
  const read = (rel: string, keep: (p: string) => boolean, max: number, out: Record<string, string>) => {
    if (!keep(rel)) return;
    try {
      const abs = join(project, rel);
      const st = lstatSync(abs);
      if (!st.isFile() || st.size > max) return;
      out[rel] = readFileSync(abs, "utf8");
    } catch { /* not there */ }
  };
  return {
    async readFiles(_id, keep, maxBytes = 200_000) {
      const out: Record<string, string> = {};
      for (const f of RUN_FILES) read(f, keep, maxBytes, out);
      for (const f of nativeFiles(project, isNativeRunFile)) read(f, keep, maxBytes, out);
      return out;
    },
    async fileIds(_id, keep) {
      const out: Record<string, string> = {};
      for (const f of nativeFiles(project, isNativeBinaryRunFile)) {
        if (!keep(f)) continue;
        try { const abs = join(project, f); if (lstatSync(abs).isFile()) out[f] = blobId(readFileSync(abs)); } catch { /* not there */ }
      }
      return out;
    },
  };
}
