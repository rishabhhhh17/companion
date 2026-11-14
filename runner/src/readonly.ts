// The read only rule for the person's own tools (F21): Companion reads deployments, build logs and CI runs through `vercel`
// and `gh`, and (M87) production value names and Stripe webhook health through `vercel` and `stripe`, and never writes
// anything with them. This is the check in code, not in a prompt: every command goes through
// refuseWrite first, and only a short list of reading commands passes. Anything else (a deploy, a promote, a rollback,
// an environment variable added or removed, a re-run, a workflow started, a pull request or issue created, an API call
// that is not a plain read) is refused with a plain line, and so is anything a shell could treat as more than one command.

/** The words of a command, single quotes honoured (the way shq writes them), or null when it is more than a plain command. */
import { PRODUCT } from "./names.ts";
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

// M87 (Why is live broken?): the two Stripe reads, through the person's own `stripe` login, and only these. `stripe get` is
// a plain GET; its -d values are only a page size and the delivery filter, so nothing else can be asked for.
const STRIPE_READS = new Set(["/v1/webhook_endpoints", "/v1/events"]);
const STRIPE_DATA = /^(limit=\d{1,3}|delivery_success=false)$/;

/** The plain reason this command may not run, or null when it only reads. */
export function refuseWrite(command: string): string | null {
  const w = words(command);
  if (!w || w.length === 0) return `${PRODUCT} only runs plain reading commands on your tools.`;
  const [tool, a = "", b = ""] = w;
  const named = (): string => { const hit = w.slice(1, 4).find((x) => WRITE_WORDS.has(x.toLowerCase())); return hit ? `${PRODUCT} never runs "${hit}" on your tools. It only reads.` : `${PRODUCT} only reads from your tools, and that is not a reading command.`; };
  if (w.some((x) => /^(--prod|--prebuilt|--force|--yes|-y|--web|-w|--method|-X|--field|-f|-F|--input|--raw-field|--delete|--token|-t|--api-key|--decrypt)$/i.test(x) || /^--(method|token|api-key)=/i.test(x))) return named();
  if (tool === "vercel") {
    // M87: the names of the production environment values, exactly this and nothing more (never add, rm or pull). The
    // tool shows values as "Encrypted", and only the first word of each row (the name) is ever kept (ship/livecheck.ts).
    if (a.toLowerCase() === "env") return (b === "ls" || b === "list") && w.length === 4 && w[3] === "production" ? null : `${PRODUCT} never changes or downloads your environment values. It only reads their names.`;
    return VERCEL_READS.has(a.toLowerCase()) ? null : named();
  }
  if (tool === "gh") return GH_READS.has(`${a.toLowerCase()} ${b.toLowerCase()}`) ? null : named();
  if (tool === "stripe") {
    if (a !== "get" || !STRIPE_READS.has(b)) return `${PRODUCT} only reads your Stripe webhook addresses and events. It never changes anything in Stripe.`;
    for (let i = 3; i < w.length; i++) {
      if (w[i] === "--live") continue;
      if (w[i] === "-d" && STRIPE_DATA.test(w[i + 1] ?? "")) { i++; continue; }
      return `${PRODUCT} only reads your Stripe webhook addresses and events. It never changes anything in Stripe.`;
    }
    return null;
  }
  return `${PRODUCT} only reads from the Vercel, GitHub and Stripe tools.`;
}
