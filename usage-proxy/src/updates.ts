// The update feed (M116 step 5). The app's updater (Tauri 2, https://v2.tauri.app/plugin/updater/) asks
//   GET /v1/update/{target}/{arch}/{current_version}
// with no token, and gets 204 (no update) or a small JSON with version, notes, pub_date, url and signature. The newest release
// for each platform is set by the operator (`release set`, below) and pulled at once with `release stop`. The bundle itself lives
// on GitHub Releases in the public releases repo (RELEASES_REPO), so the url must be a file there. The server is never the last
// check: the app installs only what is signed with the founder's updater key (requireSignedVersion), so even a leaked operator
// key cannot ship anything.
//
// An update check writes nothing and ties no account to anything. The one log line is the version asked from and the platform,
// so the founder can count the versions in use.
import type { SafeEvent } from "./proxy.ts";
import type { Release, Store } from "./store.ts";
import type { OperatorResult } from "./operator.ts";

export const UPDATE_PATH_PREFIX = "/v1/update/";
/** The setting naming the public releases repo, as owner/name. */
export const RELEASES_REPO_SETTING = "RELEASES_REPO";
const TARGETS = ["darwin", "windows", "linux"];
const ARCHS = ["aarch64", "x86_64"];
export const PLATFORMS = TARGETS.flatMap((t) => ARCHS.map((a) => `${t}-${a}`));
const VERSION = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(?:-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+){0,4}))?$/;
const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const SIGNATURE = /^[A-Za-z0-9+/]{40,4000}={0,2}$/;
const MAX_NOTES = 1500;

export const isVersion = (v: unknown): v is string => typeof v === "string" && VERSION.test(v);

/** Above 0 when `a` is newer than `b`. Major, minor and patch compare as numbers; a pre release comes before its release. */
export function compareVersions(a: string, b: string): number {
  const pa = VERSION.exec(a), pb = VERSION.exec(b);
  if (!pa || !pb) throw new Error("Not a version.");
  for (let i = 1; i <= 3; i++) { const d = Number(pa[i]) - Number(pb[i]); if (d !== 0) return d; }
  if (pa[4] === pb[4]) return 0;
  if (pa[4] === undefined) return 1;
  if (pb[4] === undefined) return -1;
  const xa = pa[4].split("."), xb = pb[4].split(".");
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    const x = xa[i], y = xb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    const d = nx && ny ? Number(x) - Number(y) : nx ? -1 : ny ? 1 : x < y ? -1 : x > y ? 1 : 0;
    if (d !== 0) return d;
  }
  return 0;
}

/** The url must be a release file in the public releases repo: https://github.com/<repo>/releases/download/<tag>/<file>. */
export function releaseUrlOk(url: unknown, repo: string): boolean {
  if (typeof url !== "string" || url.length > 500) return false;
  const m = /^https:\/\/github\.com\/([^/?#]+\/[^/?#]+)\/releases\/download\/([A-Za-z0-9._+-]{1,100})\/([A-Za-z0-9._+-]{1,200})$/.exec(url);
  if (!m || m[1] !== repo) return false;
  const [, , tag, file] = m;
  return !tag.includes("..") && !file.includes("..") && /\.(tar\.gz|zip)$/.test(file);
}

const noUpdate = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
const unreadable = () => new Response(JSON.stringify({ error: "That update request could not be read." }), { status: 400, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** GET /v1/update/{target}/{arch}/{current_version}. Answers null for any other request. */
export function createUpdateRoute(d: { store: Store; log: (e: SafeEvent) => void }): (req: Request, url: URL) => Promise<Response | null> {
  return async (req, url) => {
    if (req.method !== "GET" || !url.pathname.startsWith(UPDATE_PATH_PREFIX)) return null;
    const parts = url.pathname.slice(UPDATE_PATH_PREFIX.length).split("/");
    if (parts.length !== 3) return unreadable();
    const [target, arch, current] = parts;
    if (!TARGETS.includes(target) || !ARCHS.includes(arch) || !isVersion(current)) return unreadable();
    const platform = `${target}-${arch}`;
    d.log({ kind: "update_check", version: current, reason: platform });
    const r = await d.store.release(platform);
    if (!r || r.stopped || !isVersion(r.version) || compareVersions(r.version, current) <= 0) return noUpdate();
    return new Response(JSON.stringify({ version: r.version, notes: r.notes, pub_date: r.pubDate, url: r.url, signature: r.signature }),
      { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  };
}

// ---- the operator's release commands ----------------------------------------------------------------------------------------------
const RELEASE_USAGE = [
  "Usage:",
  "  release show",
  "  release set --platform <darwin-aarch64 | darwin-x86_64 | ...> --version <1.2.3> --url <the GitHub Releases file> --signature <the .sig text> [--notes <text>] [--apply]",
  "  release stop --platform <platform> [--apply]",
  "  Without --apply nothing is changed (a dry run). The url must be a file in the public releases repo (RELEASES_REPO).",
];

/** `release show | set | stop`. Reached through POST /v1/operator. */
export async function runRelease(argv: string[], env: Record<string, string | undefined>, store: Store, now: () => number): Promise<OperatorResult> {
  const bad = (why: string): OperatorResult => ({ code: 2, lines: [why, ...RELEASE_USAGE] });
  const [cmd, ...rest] = argv;
  const opts: Record<string, string> = {};
  let apply = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--apply") { apply = true; continue; }
    if (!["--platform", "--version", "--url", "--signature", "--notes"].includes(a)) return bad("That option is not known.");
    const v = rest[++i];
    if (v === undefined) return bad(`A value is needed after ${a}.`);
    opts[a] = v;
  }

  if (cmd === "show") {
    const all = await store.releases();
    if (all.length === 0) return { code: 0, lines: ["No release is set. Every update check answers no update."] };
    return { code: 0, lines: all.sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, r]) => `${p}: ${r.version}, ${r.stopped ? "stopped" : "served"} (set ${r.pubDate}).`) };
  }
  const platform = opts["--platform"];
  if (cmd !== "set" && cmd !== "stop") return bad("Say release show, release set or release stop.");
  if (!platform || !PLATFORMS.includes(platform)) return bad(`The platform must be one of ${PLATFORMS.join(", ")}.`);

  if (cmd === "stop") {
    const r = await store.release(platform);
    if (!r || r.stopped) return { code: 0, lines: [`No release is served for ${platform}. Nothing was changed.`] };
    if (!apply) return { code: 0, lines: [`Dry run: would stop ${r.version} for ${platform}, so every update check answers no update. Run again with --apply to do it.`] };
    await store.stopRelease(platform);
    return { code: 0, lines: [`Stopped ${r.version} for ${platform}. Update checks now answer no update. Nothing already installed is changed.`] };
  }

  const repo = env[RELEASES_REPO_SETTING]?.trim() ?? "";
  if (!REPO.test(repo)) return { code: 1, lines: [`The setting ${RELEASES_REPO_SETTING} is not set (owner/name of the public releases repo). Nothing was changed.`] };
  const version = opts["--version"], url = opts["--url"], signature = (opts["--signature"] ?? "").trim(), notes = opts["--notes"] ?? "";
  if (!isVersion(version)) return bad("The version must look like 1.2.3 (or 1.2.3-beta.1).");
  if (!releaseUrlOk(url, repo)) return bad(`The url must be a .tar.gz or .zip file in the public releases repo: https://github.com/${repo}/releases/download/<tag>/<file>.`);
  if (!SIGNATURE.test(signature)) return bad("The signature must be the text of the .sig file the build made (base64).");
  if (notes.length > MAX_NOTES || /[<>]/.test(notes)) return bad(`The notes must be plain text, at most ${MAX_NOTES} characters.`);
  const release: Release = { version, notes, url, signature, pubDate: new Date(now()).toISOString() };
  if (!apply) return { code: 0, lines: [`Dry run: would serve ${version} for ${platform} from ${url}. Run again with --apply to do it.`] };
  await store.setRelease(platform, release);
  return { code: 0, lines: [`Serving ${version} for ${platform}. Apps on an older version will offer it at their next daily check.`] };
}
