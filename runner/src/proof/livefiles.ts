// The files a check reads to decide what it may run (package.json, the lock files, .replit, .claude/launch.json), read from
// the project folder as it is now. A watch (F21) checks a project that nothing changed, so it needs no saved copy of the
// project: this stands in for a checkpoint of it, and writes nothing anywhere. A link is never followed.
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RUN_FILES } from "./approvedruns.ts";

export type FileReader = { readFiles(id: string, keep: (path: string) => boolean, maxBytes?: number): Promise<Record<string, string>> };

export function liveFiles(project: string): FileReader {
  return {
    async readFiles(_id, keep, maxBytes = 200_000) {
      const out: Record<string, string> = {};
      for (const f of RUN_FILES) {
        if (!keep(f)) continue;
        try {
          const abs = join(project, f);
          const st = lstatSync(abs);
          if (!st.isFile() || st.size > maxBytes) continue;
          out[f] = readFileSync(abs, "utf8");
        } catch { /* not there */ }
      }
      return out;
    },
  };
}
