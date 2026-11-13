// M85 (research feature 3): commands that touch something a copy on this Mac cannot bring back. A live database dropped or
// emptied, infrastructure destroyed, a site deployed to production, history rewritten on another computer, a delete sent to
// a server, a broadly scoped cloud token used. The research's cases: A12 ("Deleted entire database on minor update", CC
// #27448), A13 (lost database data because Claude did not ask, CC #13729), A21 (a production setup deleted, HN 47287420) and
// the PocketOS database lost through an API token (AIID 1469).
// For the person's own AI tool the guard hook answers "ask" with this reason, so their tool asks them first (guard.ts). For
// Squibby's own runs the approval card says it, and never offers Always allow for it (safety.ts already asks for all of these).
// Plain rules on the command's words, no model and no file access: nothing here reads a key or an .env file. Only words
// the command itself carries are looked at; a token is named by its setting's name, never its value.
import { basename } from "node:path";
import { destructiveSql, fromUrl, remoteHost } from "./dbsafety.ts";
import { commandsWithFolder } from "./safety.ts";
import { parseShell } from "./shell.ts";

/** Every reason ends with this: why Squibby asks instead of only saving a copy. */
export const LIVE_TAIL = "A saved copy on this Mac can't bring it back.";
/** The settings whose names mean a key with wide reach: a whole cloud account, a database's admin key, a live payments key. */
export const BROAD_TOKENS = [
  "AWS_SECRET_ACCESS_KEY", "AWS_ACCESS_KEY_ID", "AWS_SESSION_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS", "CLOUDSDK_AUTH_ACCESS_TOKEN",
  "AZURE_CLIENT_SECRET", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY", "CF_API_TOKEN", "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN", "VERCEL_TOKEN", "FLY_API_TOKEN", "NETLIFY_AUTH_TOKEN", "HEROKU_API_KEY", "DIGITALOCEAN_ACCESS_TOKEN",
  "DIGITALOCEAN_TOKEN", "RAILWAY_TOKEN", "RENDER_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_API_KEY", "FIREBASE_TOKEN",
  "NEON_API_KEY", "PLANETSCALE_SERVICE_TOKEN", "TURSO_API_TOKEN", "GITHUB_TOKEN", "GH_TOKEN",
] as const;
const TOKEN_RE = new RegExp(`(?:^|[^A-Za-z0-9_])(?:\\$\\{?(${BROAD_TOKENS.join("|")})\\b|(${BROAD_TOKENS.join("|")})=)`);
/** A live payments key or an admin key written out in the command (only its kind is named, never the text). */
const LIVE_KEY = /\b(?:sk_live_|rk_live_)[A-Za-z0-9]{6,}|\bservice_role\b/;

const sentence = (s: string) => `${s} ${LIVE_TAIL}`;
const hostOf = (url: string): string | null => { try { return new URL(url).hostname; } catch { return null; } };
const nonLocalUrl = (u: string) => { const h = hostOf(u); return !!h && remoteHost(h); };

/** Why one command line touches a live system, in plain words, or null. project: where it runs (for cd). */
export function liveCommand(command: string, project: string): string | null {
  let parts: { words: string[]; cwd: string }[];
  try { parts = commandsWithFolder(command, project); } catch { parts = []; }
  for (const { words } of parts) {
    const why = liveWords(words);
    if (why) return sentence(why);
  }
  // A broad token is "used" when the line sets it or reads it, wherever on the line.
  const raw = (() => { try { return parseShell(command).flat().join(" "); } catch { return command; } })();
  const t = TOKEN_RE.exec(raw) ?? TOKEN_RE.exec(command);
  if (t) return sentence(`This uses ${t[1] ?? t[2]}, a key that can change a whole account, not just this project.`);
  if (LIVE_KEY.test(command)) return sentence("This uses a live key that can change a whole account, not just this project.");
  return null;
}

const DB_PROGRAMS = new Set(["psql", "mysql", "mariadb"]);

function liveWords(words: string[]): string | null {
  const name0 = basename(words[0] ?? "");
  // npx, bunx, pnpx, npm exec and pnpm dlx run another program: that one is judged.
  if (["npx", "bunx", "pnpx"].includes(name0) || (["npm", "pnpm", "yarn", "bun"].includes(name0) && ["exec", "dlx", "x"].includes(words[1] ?? ""))) {
    const rest = (["npx", "bunx", "pnpx"].includes(name0) ? words.slice(1) : words.slice(2)).filter((a, i, all) => !(a.startsWith("-") && all.slice(0, i).every((x) => x.startsWith("-"))));
    return rest.length ? liveWords(rest) : null;
  }
  const name = name0.replace(/(.)@[^/@]*$/, "$1");
  const args = words.slice(1);
  const pos = args.filter((a) => !a.startsWith("-"));
  const has = (...f: string[]) => args.some((a) => f.some((x) => a === x || a.startsWith(`${x}=`)));
  const valueOf = (...f: string[]) => { for (let i = 0; i < args.length; i++) for (const x of f) { if (args[i] === x) return args[i + 1]; if (args[i].startsWith(`${x}=`)) return args[i].slice(x.length + 1); } return undefined; };

  if (DB_PROGRAMS.has(name)) {
    const sql = valueOf("-c", "--command", "-e", "--execute") ?? args.find((a) => /^-[ce].+/.test(a))?.slice(2);
    if (sql === undefined) return null;
    const bad = destructiveSql(sql);
    if (!bad) return null;
    const host = valueOf("-h", "--host") ?? args.find((a) => /^-h.+/.test(a))?.slice(2);
    const url = pos.map((p) => fromUrl(p)).find((u) => u);
    const where = host ?? url?.host;
    if (where && remoteHost(where)) return `This deletes data in a database on another computer (${where}): ${bad}.`;
    if (!where && pos.some((p) => /^\$\{?[A-Za-z_]/.test(p))) return `This deletes data in the database a setting points to, which may be your live database: ${bad}.`;
    return null;
  }
  if (name === "supabase") {
    const sub = pos[0], sub2 = pos[1];
    const url = valueOf("--db-url");
    const remote = has("--linked") || (url !== undefined && (fromUrl(url) ? remoteHost(fromUrl(url)!.host) : true));
    if (sub === "db" && sub2 === "reset" && remote) return "This resets your live Supabase database: all its data is deleted.";
    if (sub === "db" && sub2 === "push" && !has("--local") && !(url && fromUrl(url) && !remoteHost(fromUrl(url)!.host))) return "This changes the tables of your live Supabase database.";
    return null;
  }
  if (name === "prisma") {
    const sub = pos[0], sub2 = pos[1];
    // M85 review: prisma db push with --force-reset or --accept-data-loss wipes or drops data in the database DATABASE_URL
    // points to.
    if (sub === "db" && sub2 === "push") {
      if (has("--force-reset")) return "This deletes all the data in the database DATABASE_URL points to, which may be your live database.";
      if (has("--accept-data-loss")) return "This changes the tables of the database DATABASE_URL points to and deletes data that does not fit, which may be your live database.";
      return null;
    }
    if (sub !== "migrate" || (sub2 !== "reset" && sub2 !== "deploy")) return null;
    // Only a database named on the line counts: Squibby never reads .env to find out.
    const url = valueOf("--url");
    if (url && fromUrl(url) && !remoteHost(fromUrl(url)!.host)) return null;
    return sub2 === "reset" ? "This deletes all the data in the database DATABASE_URL points to, which may be your live database." : "This changes the tables of the database DATABASE_URL points to, which is usually your live database.";
  }
  // M85 review: drizzle-kit push and migrate change a database's tables directly (Squibby never reads the config to learn where).
  if (name === "drizzle-kit" && (pos[0] === "push" || pos[0] === "migrate")) return `This changes the tables of the database your drizzle config or DATABASE_URL points to, which may be your live database (drizzle-kit ${pos[0]}).`;
  // M85 review: deleting a GitHub repository, or any DELETE through the GitHub API.
  if (name === "gh") {
    if (pos[0] === "repo" && pos[1] === "delete") return "This deletes a repository on GitHub, with all its history, issues and settings.";
    if (pos[0] === "api" && ((valueOf("-X", "--method") ?? args.find((a) => /^-X[A-Za-z]+$/.test(a))?.slice(2) ?? "").toUpperCase() === "DELETE")) return "This sends a DELETE to GitHub, which deletes something there (gh api -X DELETE).";
    return null;
  }
  if (name === "terraform" || name === "tofu" || name === "terragrunt") {
    const sub = pos[0];
    if (sub === "destroy" || (sub === "apply" && has("-destroy", "--destroy"))) return `This destroys real cloud resources with ${name} destroy.`;
    if (sub === "apply") return `This changes real cloud resources with ${name} apply.`;
    return null;
  }
  if (name === "kubectl" || name === "oc") {
    if (pos[0] === "delete") return `This deletes things running in a Kubernetes cluster (${name} delete).`;
    if (pos[0] === "drain") return `This empties a server in a Kubernetes cluster (${name} drain).`;
    return null;
  }
  if (name === "helm" && ["uninstall", "delete"].includes(pos[0] ?? "")) return "This removes an app from a Kubernetes cluster (helm uninstall).";
  if (name === "vercel") {
    if (has("--prod", "--production") || pos[0] === "promote") return "This puts a new version of your site live (vercel --prod).";
    if (["rm", "remove"].includes(pos[0] ?? "")) return "This deletes a deployment of your site on Vercel.";
    return null;
  }
  if (name === "netlify" && pos[0] === "deploy" && has("--prod", "-p")) return "This puts a new version of your site live (netlify deploy --prod).";
  if (name === "fly" || name === "flyctl") {
    if (pos[0] === "deploy") return `This puts a new version of your app live (${name} deploy).`;
    if ((pos[0] === "apps" && ["destroy", "delete"].includes(pos[1] ?? "")) || pos[0] === "destroy") return "This deletes an app on Fly.io.";
    return null;
  }
  if (name === "railway" && ["up", "down", "delete"].includes(pos[0] ?? "")) return `This changes your live app on Railway (railway ${pos[0]}).`;
  if (name === "heroku" && /^(apps:destroy|pg:reset|releases:rollback|ps:scale)$/.test(pos[0] ?? "")) return `This changes your live Heroku app (heroku ${pos[0]}).`;
  if (name === "firebase" && pos[0] === "deploy") return "This puts a new version live on Firebase.";
  if (name === "wrangler" && (pos[0] === "deploy" || pos[0] === "publish" || (pos[0] === "d1" && pos[1] === "execute" && has("--remote")) || pos[0] === "delete")) return `This changes your live Cloudflare project (wrangler ${pos[0]}).`;
  if (name === "git") {
    let i = 0;
    while (i < args.length && args[i].startsWith("-")) { if (["-C", "-c", "--git-dir", "--work-tree"].includes(args[i])) i++; i++; }
    const sub = args[i], rest = args.slice(i + 1), flags = rest.filter((a) => a.startsWith("-")), refs = rest.filter((a) => !a.startsWith("-"));
    if (sub !== "push") return null;
    if (flags.some((f) => f === "-f" || f === "--force" || f.startsWith("--force-with-lease") || f === "--mirror")) return "This rewrites the history of your project on another computer, such as GitHub (a force push).";
    if (flags.some((f) => f === "-d" || f === "--delete") || refs.slice(1).some((r) => r.startsWith(":"))) return "This deletes a branch on another computer, such as GitHub.";
    if (refs.slice(1).some((r) => r.startsWith("+"))) return "This rewrites the history of your project on another computer, such as GitHub (a forced branch push).";
    return null;
  }
  if (name === "curl" || name === "http" || name === "https" || name === "xh" || name === "wget") {
    const method = (valueOf("-X", "--request", "--method") ?? args.find((a) => /^-X[A-Za-z]+$/.test(a))?.slice(2) ?? (name !== "curl" && name !== "wget" ? pos[0] : undefined) ?? "").toUpperCase();
    const url = args.find((a) => /^https?:\/\//i.test(a)) ?? pos.find((p) => /^[\w.-]+\.[a-z]{2,}(?:[:/]|$)/i.test(p));
    if ((method === "DELETE" || method === "PUT") && url && nonLocalUrl(/^https?:/i.test(url) ? url : `https://${url}`)) return `This sends a ${method} to ${hostOf(/^https?:/i.test(url) ? url : `https://${url}`)}, which changes or deletes data there.`;
    return null;
  }
  if (["node", "bun", "deno"].includes(name)) {
    const code = valueOf("-e", "--eval", "-p", "--print");
    if (code && /\bfetch\s*\(/.test(code) && /method\s*:\s*["'`](DELETE|PUT)["'`]/i.test(code)) {
      const url = /["'`](https?:\/\/[^"'`\s]+)["'`]/.exec(code)?.[1];
      if (url && nonLocalUrl(url)) return `This sends a ${/method\s*:\s*["'`](DELETE|PUT)/i.exec(code)![1].toUpperCase()} to ${hostOf(url)}, which changes or deletes data there.`;
    }
    return null;
  }
  if (name === "aws") {
    const svc = pos[0] ?? "", op = pos[1] ?? "";
    if (svc === "s3" && (op === "rb" || (op === "rm" && has("--recursive")) || (op === "sync" && has("--delete")))) return `This deletes files in your cloud storage (aws s3 ${op}).`;
    if (/^(delete|terminate|remove|purge|deregister|destroy)-/.test(op) || op === "rm") return `This deletes something in your cloud account (aws ${svc} ${op}).`;
    return null;
  }
  if ((name === "gcloud" || name === "az" || name === "doctl") && args.some((a) => a === "delete" || a === "destroy")) return `This deletes something in your cloud account (${name} ... delete).`;
  if (name === "gsutil" && ((pos[0] === "rm" && has("-r", "-rf", "-a")) || pos[0] === "rb")) return "This deletes files in your cloud storage (gsutil rm).";
  return null;
}
