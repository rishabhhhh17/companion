// The files a check reads to decide what it may run (package.json, the lock files, .replit, .claude/launch.json, and a Go,
// Rust, Java, Kotlin, Swift or Xcode project's build files), read from the project folder as it is now. A watch (F21) checks
// a project that nothing changed, so it needs no saved copy of the project: this stands in for a checkpoint of it, and writes
// nothing anywhere. A link is never followed.
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isNativeRunFile, RUN_FILES } from "./approvedruns.ts";

export type FileReader = { readFiles(id: string, keep: (path: string) => boolean, maxBytes?: number): Promise<Record<string, string>> };

// Folders a saved version leaves out, and ones that are never the project's own build files.
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo", ".cache", "target", "venv", ".venv", "__pycache__", "coverage", ".gradle", ".build", "Pods", "DerivedData", "vendor"]);

/** The project's files that look like a native build file, a few folders deep (bounded). */
function nativeFiles(project: string): string[] {
  const out: string[] = [];
  let seen = 0;
  const walk = (rel: string, depth: number) => {
    let names: string[];
    try { names = readdirSync(rel ? join(project, rel) : project); } catch { return; }
    for (const n of names.sort()) {
      if (++seen > 5000 || out.length >= 2000) return;
      const r = rel ? `${rel}/${n}` : n;
      let st; try { st = lstatSync(join(project, r)); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { if (depth < 6 && !SKIP.has(n)) walk(r, depth + 1); }
      else if (st.isFile() && isNativeRunFile(r)) out.push(r);
    }
  };
  walk("", 0);
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
      for (const f of nativeFiles(project)) read(f, keep, maxBytes, out);
      return out;
    },
  };
}
