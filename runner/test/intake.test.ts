// About this project: exports from Lovable, Bolt and Replit, modelled on real public exports read on 12 Oct 2026.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { aboutLine, envNames, inspectProject, replitRun } from "../src/proof/intake.ts";
import { detectProject, installed } from "../src/proof/detect.ts";
import { shq } from "../src/proof/exec.ts";
import { symlinkSync } from "node:fs";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
function project(files: Record<string, string>): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-intake-"))); made.push(d);
  for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); }
  return d;
}
const pkg = (o: Record<string, unknown>) => JSON.stringify({ name: "x", private: true, ...o });
const LOVABLE = pkg({ scripts: { dev: "vite", build: "vite build", lint: "eslint ." }, dependencies: { react: "^18", "@supabase/supabase-js": "^2" }, devDependencies: { vite: "^5", "lovable-tagger": "^1", tailwindcss: "^3" } });

describe("where it came from and what it is", () => {
  test("a Lovable export: Vite + React with Supabase, packages not installed yet", () => {
    const r = inspectProject(project({ "package.json": LOVABLE, "package-lock.json": "{}", "bun.lockb": "x", "src/main.tsx": "x" }));
    expect(aboutLine(r)).toBe("A Lovable project: Vite + React, with Supabase and Tailwind.");
    expect(r.needsInstall).toBe(true);
  });
  test("a Lovable export with both lock files uses npm, not the stale Bun one", () => {
    expect(detectProject(project({ "package.json": LOVABLE, "package-lock.json": "{}", "bun.lockb": "x" })).packageManager).toBe("npm");
  });
  test("a Bolt export is known by its .bolt folder", () => {
    const r = inspectProject(project({ "package.json": pkg({ scripts: { dev: "vite" }, dependencies: { react: "^18" }, devDependencies: { vite: "^5" } }), ".bolt/config.json": '{"template":"bolt-vite-react-ts"}' }));
    expect(r.origin).toBe("bolt"); expect(r.stack).toBe("Vite + React"); expect(r.start).toBe("npm run dev");
  });
  test("a Bolt workspace: what it is built with is read from the app one folder down", () => {
    const r = inspectProject(project({ "package.json": pkg({ workspaces: ["packages/*"], scripts: { dev: "npm run dev --workspace=packages/web" } }), "packages/web/package.json": pkg({ dependencies: { react: "^18", firebase: "^10" }, devDependencies: { vite: "^5" } }), ".bolt/prompt": "x" }));
    expect(aboutLine(r)).toBe("A Bolt project: Vite + React, with Firebase.");
    expect(r.needsInstall).toBe(true);
    expect(r.notes.join(" ")).toContain("workspace");
  });
  test("a Replit export: the run line in .replit starts it when package.json has no start", () => {
    const d = project({ ".replit": 'run = ["bash", "main.sh"]\nlanguage = "bash"\n\n[env]\nDB_PASS="password"\n\n[deployment]\nrun = ["sh", "-c", "other"]\n', "main.sh": "echo hi" });
    const r = inspectProject(d);
    expect(r.origin).toBe("replit"); expect(r.start).toBe("bash main.sh");
    expect(detectProject(d).start).toEqual({ kind: "server", command: "bash main.sh" });
    expect(r.notes.join(" ")).toContain(".replit file");
    expect(JSON.stringify(r)).not.toContain("password");   // never a value
  });
  test("a renamed package.json is called out plainly", () => {
    const r = inspectProject(project({ "package.json.bak": LOVABLE, "index.html": "<h1>x</h1>" }));
    expect(r.notes[0]).toContain("only package.json.bak");
  });
  test("Python projects are named honestly", () => {
    expect(inspectProject(project({ "requirements.txt": "streamlit==1.3\n", "app.py": "import streamlit" })).stack).toBe("Python (Streamlit)");
    expect(inspectProject(project({ "requirements.txt": "flask\n", "main.py": "x" })).notes.join(" ")).toContain("cannot install its packages");
  });
});

describe("settings it needs", () => {
  test("names from the code and the example file, minus what the person's .env sets; the page's own first", () => {
    const r = inspectProject(project({
      "package.json": LOVABLE,
      "src/api.ts": "const a = import.meta.env.VITE_API_URL; const b = process.env.SMTP_PASS; const c = import.meta.env.MODE;",
      ".env.example": "VITE_GIPHY_KEY=\nVITE_API_URL=\n", ".env": "VITE_GIPHY_KEY=abc123\n",
    }));
    expect(r.env.missing).toEqual(["VITE_API_URL", "SMTP_PASS"]);
    expect(r.env.example).toBe(".env.example");
    expect(JSON.stringify(r)).not.toContain("abc123");
  });
  test("settings the Mac or Replit provides are never reported missing", () => {
    const r = inspectProject(project({ "index.js": "process.env.HTTPS_PROXY; process.env.REPL_OWNER; process.env.NODE_ENV; process.env.PORT; process.env.REMOVEBG_KEY" }));
    expect(r.env.missing).toEqual(["REMOVEBG_KEY"]);
  });
  test("node_modules is never read", () => {
    const r = inspectProject(project({ "package.json": LOVABLE, "node_modules/x/index.js": "process.env.SECRET_FROM_A_PACKAGE" }));
    expect(r.env.needed).not.toContain("SECRET_FROM_A_PACKAGE");
    expect(r.needsInstall).toBe(false);
  });
  test("reading .env names", () => expect(envNames("# c\nA=1\nexport B = 2\n  C=\nnot a line\n")).toEqual(["A", "B", "C"]));
});

describe("the .replit run line", () => {
  test("a list keeps its words together, comments are dropped, lists may span lines", () => {
    expect(replitRun('run = ["sh","-c","npm run dev"]')).toBe("sh -c 'npm run dev'");
    expect(replitRun('run = "npm run dev" # start it')).toBe("npm run dev");
    expect(replitRun('run = [\n  "yarn",\n  "start"\n]')).toBe("yarn start");
  });
  test("strings, lists, quotes, and never the deployment one", () => {
    expect(replitRun('run = "npm run start"')).toBe("npm run start");
    expect(replitRun("run = [\"yarn\", \"start\"]")).toBe("yarn start");
    expect(replitRun('language = "x"\n[deployment]\nrun = ["sh"]')).toBeNull();
  });
});

describe("a package manager the Mac does not have", () => {
  test("is checked on the tool path", () => {
    expect(installed("npm", ["/nope", "/also-nope"])).toBe(false);
  });
});

describe("review fixes", () => {
  test("a lock file for a manager the Mac does not have falls back to npm", () => {
    const fake = "pnpm" as const;   // tested through the real tool path: pick a lock whose tool is surely missing
    const d = project({ "package.json": pkg({}), "pnpm-lock.yaml": "x" });
    const pm = detectProject(d).packageManager;
    expect(pm === fake ? installed(fake) : pm === "npm").toBe(true);
  });
  test("a link inside the project leading outside is never walked for setting names", () => {
    const outside = project({ "secret.js": "process.env.OUTSIDE_SECRET_NAME" });
    const d = project({ "index.js": "process.env.INSIDE" });
    symlinkSync(outside, join(d, "src"));
    expect(inspectProject(d).env.needed).toEqual(["INSIDE"]);
  });
  test("a workspace listed under other folder names is read too", () => {
    const r = inspectProject(project({ "package.json": pkg({ workspaces: ["frontend", "services/*"] }), "frontend/package.json": pkg({ dependencies: { next: "14" } }), "services/api/package.json": pkg({ dependencies: { stripe: "1" } }) }));
    expect(r.stack).toBe("Next.js"); expect(r.extras).toContain("Stripe");
  });
  test("a folder name with shell characters stays a plain name", async () => {
    const weird = "a `echo pwned` $(echo pwned) ${HOME} 'q' b";
    const p = Bun.spawnSync(["sh", "-c", `printf %s ${shq(weird)}`]);
    expect(p.stdout.toString()).toBe(weird);
  });
});
