// Tidying up after Claude Code. With the project as its working directory it makes a hidden .claude folder there (its write
// tracking lives at .claude/.cc-writes), and sometimes leaves it empty. Squibby's own code never makes one. The folder is
// removed after a task or a plan only when it did not exist before it began and is empty now: a person's own .claude folder,
// and any file in it, is never touched. rmdir cannot remove a folder that has anything in it, so it cannot lose a file.
import { lstatSync, readdirSync, rmdirSync } from "node:fs";
import { join } from "node:path";

const isFolder = (path: string): boolean => { try { return lstatSync(path).isDirectory(); } catch { return false; } };

/** Is there a real .claude folder in the project right now (a link or a file of that name does not count)? */
export const claudeFolderExists = (project: string): boolean => isFolder(join(project, ".claude"));

/** Removes the project's .claude folder when it was not there before (`existedBefore` false) and is empty. True when removed. */
export function removeEmptyClaudeFolder(project: string, existedBefore: boolean): boolean {
  if (existedBefore) return false;
  const dir = join(project, ".claude");
  try {
    if (!isFolder(dir) || readdirSync(dir).length > 0) return false;
    rmdirSync(dir);
    return true;
  } catch { return false; }
}
