// The read only rule for the person's own tools (F21): Companion reads deployments, build logs and CI runs through `vercel`
// and `gh`, and never writes anything with them. This is the check in code, not in a prompt: every command goes through
// refuseWrite first, and only a short list of reading commands passes. Anything else (a deploy, a promote, a rollback,
// an environment variable added or removed, a re-run, a workflow started, a pull request or issue created, an API call
// that is not a plain read) is refused with a plain line, and so is anything a shell could treat as more than one command.

/** The words of a command, single quotes honoured (the way shq writes them), or null when it is more than a plain command. */
export function words(command: string): string[] | null {
  const out: string[] = [];
  let cur = "", has = false, quoted = false;
  for (const ch of command) {
    if (quoted) { if (ch === "'") quoted = false; else cur += ch; continue; }
    if (ch === "'") { quoted = true; has = true; continue; }
    if (/\s/.test(ch)) { if (ch === "\n" || ch === "\r") return null; if (has) { out.push(cur); cur = ""; has = false; } continue; }
    if (";|&<>`$()\\{}*?~!#\"".includes(ch)) return null;
    cur += ch; has = true;
  }
  if (quoted) return null;
  if (has) out.push(cur);
  return out;
}

const VERCEL_READS = new Set(["list", "ls", "inspect"]);
const GH_READS = new Set(["run list", "run view", "repo view"]);
// Words that mean "change something", used to say why, in plain words. The list of reading commands above is what lets a
// command through; this only names what was asked for.
const WRITE_WORDS = new Set(["deploy", "promote", "rollback", "redeploy", "remove", "rm", "delete", "env", "alias", "domains", "dns", "certs", "secrets", "secret", "variable", "link", "pull", "push", "login", "logout", "rerun", "cancel", "workflow", "create", "edit", "merge", "close", "reopen", "comment", "review", "fork", "clone", "api", "release", "publish", "add", "set", "import", "transfer", "archive", "rename", "sync"]);

/** The plain reason this command may not run, or null when it only reads. */
export function refuseWrite(command: string): string | null {
  const w = words(command);
  if (!w || w.length === 0) return "Companion only runs plain reading commands on your tools.";
  const [tool, a = "", b = ""] = w;
  const named = (): string => { const hit = w.slice(1, 4).find((x) => WRITE_WORDS.has(x.toLowerCase())); return hit ? `Companion never runs "${hit}" on your tools. It only reads.` : "Companion only reads from your tools, and that is not a reading command."; };
  if (w.some((x) => /^(--prod|--prebuilt|--force|--yes|-y|--web|-w|--method|-X|--field|-f|-F|--input|--raw-field|--delete|--token|-t)$/i.test(x) || /^--(method|token)=/i.test(x))) return named();
  if (tool === "vercel") return VERCEL_READS.has(a.toLowerCase()) ? null : named();
  if (tool === "gh") return GH_READS.has(`${a.toLowerCase()} ${b.toLowerCase()}`) ? null : named();
  return "Companion only reads from the Vercel and GitHub tools.";
}
