// The founder's usage report (M116 step 5), printed on his own Mac.
// Usage: bun scripts/usage-report.ts [--month YYYY-MM] [--email <address>] [--server https://api.getsquibby.com]
//
// It asks the server's operator route for `usage` (src/operator-usage.ts): each account's requests, tokens and dollars for the
// month, totals by plan and by model, and today's count against Cloudflare's free daily limits. It changes nothing.
//
// The operator key is read from the founder's own Keychain, in code, with macOS's `security` tool: never typed, never pasted
// into a chat, never read from an environment setting, never printed. Save it once (the same value as the OPERATOR_KEY secret
// on Cloudflare) with Keychain Access, or with: security add-generic-password -s squibby-operator -a operator-key -w
// (that asks for the value without echoing it). The key goes only in the Authorization header, and only to an https server.
//
// The server answers one page of accounts a call (src/operator-usage.ts, USAGE_PAGE), so this asks for each page in turn
// (--after the cursor the last one gave) and prints one report from all of them.
import { OPERATOR_PATH } from "../src/worker.ts";
import { MAX_USAGE_PAGES, usageLines, type UsagePage } from "../src/operator-usage.ts";

export const KEYCHAIN_SERVICE = "squibby-operator";
export const KEYCHAIN_ACCOUNT = "operator-key";
export const DEFAULT_SERVER = "https://api.getsquibby.com";
const SECURITY = "/usr/bin/security";
const MIN_KEY_CHARS = 32;

export type Exec = (cmd: string, args: string[]) => Promise<{ code: number; stdout: string }>;
export type Deps = { exec: Exec; fetch: typeof fetch; print: (line: string) => void };

/** The server address, or null: https only, or http on this Mac for a local run (wrangler dev). */
export function serverAddress(given: string): string | null {
  let u: URL;
  try { u = new URL(given); } catch { return null; }
  const here = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && here)) return null;
  if (u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) return null;
  return u.origin;
}

/** The operator key from the Keychain item, or null when there is none. */
export async function readOperatorKey(exec: Exec): Promise<string | null> {
  const r = await exec(SECURITY, ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"]).catch(() => ({ code: 1, stdout: "" }));
  const key = r.code === 0 ? r.stdout.trim() : "";
  return key ? key : null;
}

/** Runs the report. The answer is the exit code: 0 printed, 1 could not, 2 a wrong option. */
export async function usageReport(argv: string[], d: Deps): Promise<number> {
  let server = DEFAULT_SERVER;
  const pass: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--server") { if (!v) { d.print("Give an address after --server."); return 2; } server = v; i++; }
    else if (a === "--month" || a === "--email") { if (!v) { d.print(`Give a value after ${a}.`); return 2; } pass.push(a, v); i++; }
    else { d.print("Usage: bun scripts/usage-report.ts [--month YYYY-MM] [--email <address>] [--server <https address>]"); return 2; }
  }
  const base = serverAddress(server);
  if (!base) { d.print("The server address must start with https:// (or be this Mac, for a local run). Nothing was sent."); return 2; }

  const key = await readOperatorKey(d.exec);
  if (!key) {
    d.print(`No operator key was found in your Keychain (item ${KEYCHAIN_SERVICE}, account ${KEYCHAIN_ACCOUNT}). Save it there once, with the same value as the OPERATOR_KEY secret on Cloudflare. Nothing was sent.`);
    return 1;
  }
  if (key.length < MIN_KEY_CHARS) { d.print(`The operator key in your Keychain is shorter than ${MIN_KEY_CHARS} characters, so it cannot be the server's. Nothing was sent.`); return 1; }

  const hide = (l: string) => l.split(key).join("(the operator key)");
  const pages: UsagePage[] = [];
  let after: number | null = null;
  for (let n = 0; n < MAX_USAGE_PAGES; n++) {
    let res: Response;
    try {
      res = await d.fetch(`${base}${OPERATOR_PATH}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ argv: ["usage", ...pass, ...(after !== null ? ["--after", String(after)] : [])] }), redirect: "error" });
    } catch {
      d.print("The server could not be reached. Nothing was changed. Try again in a moment.");
      return 1;
    }
    if (res.status === 401) { d.print("The server refused the operator key in your Keychain. Check it matches the OPERATOR_KEY secret on Cloudflare."); return 1; }
    if (res.status === 404) { d.print("The server does not serve the operator route (it has no OPERATOR_KEY set)."); return 1; }
    let body: { code?: unknown; lines?: unknown; data?: unknown } = {};
    try { body = (await res.json()) as typeof body; } catch { body = {}; }
    const lines = Array.isArray(body.lines) ? body.lines.filter((l): l is string => typeof l === "string") : [];
    const page = readPage(body.data);
    // A refusal, or a server with no pages: its own lines, as they came.
    if (!res.ok || body.code !== 0 || !page) {
      if (lines.length === 0) { d.print(`The server answered ${res.status} with no report.`); return 1; }
      for (const l of lines) d.print(hide(l));
      return res.ok && body.code === 0 ? 0 : 1;
    }
    pages.push(page);
    if (page.next === null) break;
    if (after !== null && page.next <= after) { d.print("The server gave a page cursor that goes back. The report stopped there."); return 1; }
    after = page.next;
  }
  const email = pass.includes("--email");
  if (email && pages.every((p) => p.owners.length === 0)) { d.print("No account has that email."); return 1; }
  for (const l of usageLines(pages, email)) d.print(hide(l));
  return 0;
}

/** One page from the server's answer, or null when it has none (an older server). Only the shape is checked: it is printed. */
function readPage(x: unknown): UsagePage | null {
  const p = x as Partial<UsagePage> | null;
  if (!p || typeof p !== "object" || !Array.isArray(p.owners) || typeof p.month !== "string" || typeof p.today !== "string") return null;
  if (p.next !== null && typeof p.next !== "number") return null;
  return { month: p.month, today: p.today, owners: p.owners, next: p.next, ...(Array.isArray(p.refunds) ? { refunds: p.refunds } : {}) };
}

if (import.meta.main) {
  const exec: Exec = async (cmd, args) => {
    const p = Bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "ignore" });
    const stdout = await new Response(p.stdout).text();
    return { code: await p.exited, stdout };
  };
  process.exit(await usageReport(process.argv.slice(2), { exec, fetch, print: (l) => console.log(l) }));
}
