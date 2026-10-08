// Opening a local database must never stop Companion. A damaged file is moved aside and a fresh one started; a busy file
// is waited for; a folder that cannot be written falls back to memory and says so.
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

function open(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.run("PRAGMA busy_timeout = 5000");                 // wait a few seconds when another program has the file, instead of failing at once
  if (path !== ":memory:") db.run("PRAGMA journal_mode = WAL");
  db.query("SELECT count(*) FROM sqlite_master").get();  // fails now, not later, if the file is not a database
  return db;
}

export function openDatabase(path: string, onProblem: (message: string) => void = () => {}): Database {
  try { return open(path); }
  catch (first) {
    if (existsSync(path)) {
      try {
        renameSync(path, `${path}.damaged-${Date.now()}`);
        const db = open(path);
        onProblem("Your saved task history was damaged, so a new one was started. The old file was kept next to it.");
        return db;
      } catch { /* fall through to memory */ }
    }
    void first;
    onProblem("Your task history could not be saved on this Mac, so it will be lost when Companion closes.");
    return open(":memory:");
  }
}
