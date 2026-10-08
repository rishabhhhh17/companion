// The environment for everything Companion's runner starts itself (proof checks, installs, dev servers, the browser).
// It is a short allow-list, so no key, token or account setting can reach a project's scripts, whatever it is called.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

const KEEP = [
  /^PATH$/, /^HOME$/, /^USER$/, /^LOGNAME$/, /^SHELL$/, /^LANG$/, /^LANGUAGE$/, /^LC_/, /^TERM$/, /^TMPDIR$/, /^TZ$/, /^COLORTERM$/, /^__CF_USER_TEXT_ENCODING$/,
  /^(HTTPS?|NO|ALL)_PROXY$/i, /^SSL_CERT_(FILE|DIR)$/, /^NODE_EXTRA_CA_CERTS$/, /^REQUESTS_CA_BUNDLE$/, /^CURL_CA_BUNDLE$/,
  /^XDG_(CACHE|CONFIG|DATA|STATE)_HOME$/, /^(VOLTA|PNPM|BUN|CARGO|RUSTUP|GOPATH|GOROOT|JAVA|ANDROID|NVM)_(HOME|INSTALL|DIR)$/, /^JAVA_HOME$/, /^GOPATH$/,
];

// The usual homes of node, bun, pnpm and friends. An app opened from Finder does not get the terminal's PATH, so without
// these a person's own tools would simply not be found.
export function toolPath(home: string, existing: string, exists: (dir: string) => boolean = existsSync): string {
  const dirs = existing.split(":").filter(Boolean);
  const extra = [`${home}/.bun/bin`, `${home}/.volta/bin`, `${home}/.cargo/bin`, `${home}/.deno/bin`, `${home}/.local/bin`, "/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/local/sbin"];
  try {
    const nvm = `${home}/.nvm/versions/node`;
    if (exists(nvm)) { const v = readdirSync(nvm).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]; if (v) extra.push(`${nvm}/${v}/bin`); }
  } catch { /* no nvm */ }
  const out = [...dirs];
  for (const d of extra) if (!out.includes(d) && exists(d)) out.push(d);
  return out.join(":");
}

export function minimalEnv(parent: Record<string, string | undefined> = process.env, home: string = parent.HOME || homedir()): Record<string, string> {
  const e: Record<string, string> = {};
  for (const [k, v] of Object.entries(parent)) if (v !== undefined && KEEP.some((re) => re.test(k))) e[k] = v;
  e.HOME ||= home;
  e.PATH = toolPath(home, parent.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin");
  return e;
}
