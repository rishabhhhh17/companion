// "Your Mac check": the tools Companion's checks and shipping lean on, found and judged in plain words.
// Reading versions only; nothing is installed or changed here.
import { runCommand } from "./proof/exec.ts";
import { browserInstalled } from "./proof/browser.ts";

// missing: the tool is not on this Mac at all (an old version is not missing). The practice projects wait for Node only
// when it is missing, since their checks (node --test) run on an older Node too.
export type Item = { id: string; label: string; ok: boolean; detail: string; fix?: string; missing?: true };

export function parseVersion(text: string): number[] | null {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}
export const atLeast = (v: number[] | null, min: number[]): boolean => !!v && (v[0] > min[0] || (v[0] === min[0] && (v[1] > min[1] || (v[1] === min[1] && v[2] >= (min[2] ?? 0)))));

type Run = (cmd: string) => Promise<{ code: number | null; stdout: string; stderr: string }>;
const defaultRun: Run = (cmd) => runCommand(cmd, { cwd: process.env.HOME ?? "/", timeoutMs: 8000 });

export async function doctor(run: Run = defaultRun, hasBrowser: () => boolean = browserInstalled): Promise<Item[]> {
  const ver = async (cmd: string) => { const r = await run(cmd).catch(() => ({ code: 127, stdout: "", stderr: "" })); return r.code === 0 ? parseVersion(r.stdout + r.stderr) : null; };
  // On a Mac without Apple's developer tools, /usr/bin/git is only a stand in that opens Apple's install window when it is
  // run. The check must not open a window by itself, so that git is run only when the tools are there. [verify] on a fresh Mac.
  const gitVersion = async () => {
    const where = await run("command -v git").catch(() => ({ code: 127, stdout: "", stderr: "" }));
    const path = where.code === 0 ? where.stdout.trim().split("\n")[0] : "";
    if (!path) return null;
    if (path === "/usr/bin/git") { const tools = await run("xcode-select -p").catch(() => ({ code: 1, stdout: "", stderr: "" })); if (tools.code !== 0) return null; }
    return ver("git --version");
  };
  const [node, git, vercel] = await Promise.all([ver("node --version"), gitVersion(), ver("vercel --version")]);
  const items: Item[] = [];
  items.push(node
    ? atLeast(node, [20, 0]) ? { id: "node", label: "Node", ok: true, detail: `Version ${node.join(".")} is fine.` } : { id: "node", label: "Node", ok: false, detail: `Version ${node.join(".")} is too old for installing packages while Companion is working (it needs 20 or newer).`, fix: "Install the current version from nodejs.org." }
    : { id: "node", label: "Node", ok: false, detail: "Node is not installed. Many web projects need it to build and check.", fix: "Install it from nodejs.org.", missing: true });
  // Every task, check, Undo and Which task broke it keeps its undo points with Git, so it is needed, not optional.
  items.push(git ? { id: "git", label: "Git", ok: true, detail: `Version ${git.join(".")}.` } : { id: "git", label: "Git", ok: false, detail: "Companion needs Git to keep undo points, so no task or check can start without it.", fix: "Open Terminal and run: xcode-select --install", missing: true });
  // Nothing downloads it on its own: the person presses the button the card shows after a check that had to skip the page.
  items.push(hasBrowser() ? { id: "browser", label: "Page checker", ok: true, detail: "The hidden browser used to check pages is installed." } : { id: "browser", label: "Page checker", ok: false, detail: "The hidden browser that opens your pages during a check is not on this Mac yet, so checks skip that step.", fix: "After a check that skipped the page, press Get the browser check on the result. It downloads once (about 200 MB) and only when you press it." });
  items.push(vercel ? { id: "vercel", label: "Vercel tool", ok: true, detail: `Version ${vercel.join(".")}. Needed only to put a site online.` } : { id: "vercel", label: "Vercel tool", ok: false, detail: "The Vercel tool is not installed. You only need it to put a site online.", fix: "Install it with: npm install -g vercel" });
  return items;
}
