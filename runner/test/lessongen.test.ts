// Lessons made from the person's own project: for exactly the setting names its code reads that are not set, where to get
// each value, how to put it in the settings file without pasting it into Companion, and a check per name that proves it.
// Plus the same names added in the project's Vercel settings. They are data like every other lesson.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { lessonsFromProject, settingsFile, settingsLesson, SETTINGS_LESSON, vercelLesson, VERCEL_LESSON, whereToGet } from "../src/lessongen.ts";
import { MAX_STEPS, parseLesson, projectChecker, type Lesson } from "../src/walk.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
function project(files: Record<string, string>): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-gen-"))); made.push(d);
  for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); }
  return d;
}
const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "x", private: true, scripts: { dev: "vite" }, dependencies: deps });
const VITE = pkg({ react: "^18", vite: "^5", "@supabase/supabase-js": "^2" });
const never = () => undefined;
const envSteps = (l: Lesson) => l.steps.filter((s) => s.check.kind === "env_name").map((s) => (s.check as { name: string }).name);
const words = (l: Lesson) => l.steps.map((s) => `${s.say} ${s.find} ${s.instead?.say ?? ""}`).join("\n");
const byId = (ls: Lesson[], id: string) => ls.find((l) => l.id === id);

describe("the settings lesson", () => {
  test("it covers exactly the names the code reads that are not set, the page's own first, each proven by its own check", () => {
    const p = project({
      "package.json": VITE,
      "src/db.ts": "createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)",
      "server/mail.ts": "new Resend(process.env.RESEND_API_KEY)",
      ".env.local": "VITE_SUPABASE_URL=https://abc.supabase.co\n",
    });
    const l = byId(lessonsFromProject(p, never), SETTINGS_LESSON)!;
    expect(envSteps(l)).toEqual(["VITE_SUPABASE_ANON_KEY", "RESEND_API_KEY"]);
    expect(l.steps[0].check).toEqual({ kind: "file_exists", path: ".env.local" });
    expect(l.steps.at(-1)!.check).toEqual({ kind: "ask" });   // restarting the project is the person's to confirm
    expect(l).toMatchObject({ status: "draft", needsProject: true });
  });
  test("each step proves itself from the project: it passes once the name is in the settings file, never by reading the value", async () => {
    const p = project({ "package.json": VITE, "src/db.ts": "import.meta.env.VITE_SUPABASE_URL" });
    const l = byId(lessonsFromProject(p, never), SETTINGS_LESSON)!;
    const c = projectChecker(p);
    expect(await c(l.steps[0].check)).toBe(false);
    expect(await c(l.steps[1].check)).toBe(false);
    writeFileSync(join(p, ".env.local"), "VITE_SUPABASE_URL=https://abc.supabase.co\n");
    expect(await c(l.steps[0].check)).toBe(true);
    expect(await c(l.steps[1].check)).toBe(true);
  });
  test("each name says where its value comes from, from a small table of well known names", () => {
    expect(whereToGet("SUPABASE_URL")?.from).toMatch(/Supabase/);
    expect(whereToGet("NEXT_PUBLIC_SUPABASE_URL")?.from).toMatch(/Project URL/);
    expect(whereToGet("VITE_SUPABASE_ANON_KEY")?.from).toMatch(/anon/);
    expect(whereToGet("VITE_SUPABASE_PUBLISHABLE_KEY")?.from).toMatch(/Supabase/);
    expect(whereToGet("STRIPE_SECRET_KEY")?.from).toMatch(/Stripe/);
    expect(whereToGet("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")?.from).toMatch(/Publishable/);
    expect(whereToGet("STRIPE_WEBHOOK_SECRET")?.from).toMatch(/Webhooks/);
    expect(whereToGet("OPENAI_API_KEY")?.from).toMatch(/OpenAI/);
    expect(whereToGet("RESEND_API_KEY")?.from).toMatch(/Resend/);
    expect(whereToGet("DATABASE_URL")?.from).toMatch(/database/i);
    expect(whereToGet("REMOVEBG_KEY")).toBeNull();
  });
  test("a name nobody knows says so plainly and points to the project's README", () => {
    const p = project({ "package.json": VITE, "src/a.ts": "process.env.REMOVEBG_KEY" });
    const step = byId(lessonsFromProject(p, never), SETTINGS_LESSON)!.steps[1];
    expect(step.say).toMatch(/does not know/);
    expect(step.say).toMatch(/README/);
  });
  test("it never asks for a value, never holds one, and says keys go only in the file", () => {
    const p = project({
      "package.json": VITE,
      "src/a.ts": "import.meta.env.VITE_SUPABASE_URL; process.env.OPENAI_API_KEY",
      ".env": "VITE_SUPABASE_URL=sk-live-THE-SECRET-VALUE\n",
      ".env.example": "OPENAI_API_KEY=sk-example-VALUE-IN-EXAMPLE\n",
    });
    const all = lessonsFromProject(p, never);
    const text = JSON.stringify(all);
    expect(text).not.toContain("THE-SECRET-VALUE");
    expect(text).not.toContain("VALUE-IN-EXAMPLE");
    const l = byId(all, SETTINGS_LESSON)!;
    expect(l.steps[0].say).toMatch(/never in Companion or a chat/);
    for (const s of all.flatMap((x) => x.steps)) expect(`${s.say} ${s.instead?.say ?? ""}`).not.toMatch(/(paste|type|send) (it|the value|your key)[^.]* (in|into|to) (Companion|the chat|a chat)/i);
  });
  test("the settings file follows what the project is built with", () => {
    expect(settingsFile("Next.js")).toBe(".env.local");
    expect(settingsFile("Vite + React")).toBe(".env.local");
    expect(settingsFile("Not sure yet")).toBe(".env.local");
    expect(settingsFile("Node server")).toBe(".env");
    expect(settingsFile("Python (Flask)")).toBe(".env");
    const py = project({ "requirements.txt": "flask\n", "app.py": "os.environ.get('OPENAI_API_KEY')" });
    const l = byId(lessonsFromProject(py, never), SETTINGS_LESSON)!;
    expect(l.steps[0].check).toEqual({ kind: "file_exists", path: ".env" });
    expect(l.steps[1].say).toContain(".env");
    expect(l.steps[1].say).not.toContain(".env.local");
  });
  test("a setting the page can read that looks like a secret gets a plain warning, which the person answers, never a check to set it", () => {
    const p = project({ "package.json": VITE, "src/pay.ts": "import.meta.env.VITE_STRIPE_SECRET_KEY; import.meta.env.VITE_SUPABASE_URL" });
    const l = byId(lessonsFromProject(p, never), SETTINGS_LESSON)!;
    const step = l.steps.find((s) => s.say.includes("VITE_STRIPE_SECRET_KEY"))!;
    expect(step.say).toMatch(/anyone who opens/i);
    expect(step.say).toMatch(/only if they say it is safe/);
    // Proving it would mean doing what the warning says not to do yet, so the person says when they have asked.
    expect(step.check).toEqual({ kind: "ask" });
    expect(envSteps(l)).toEqual(["VITE_SUPABASE_URL"]);
  });
  test("with nothing missing there is no settings lesson; with nothing needed, no lessons at all", () => {
    const set = project({ "package.json": VITE, "src/a.ts": "import.meta.env.VITE_SUPABASE_URL", ".env.local": "VITE_SUPABASE_URL=x\n" });
    expect(byId(lessonsFromProject(set, never), SETTINGS_LESSON)).toBeUndefined();
    expect(byId(lessonsFromProject(set, never), VERCEL_LESSON)).toBeDefined();
    expect(lessonsFromProject(project({ "package.json": VITE, "src/a.ts": "const x = 1" }), never)).toEqual([]);
  });
  test("a folder that is gone or unreadable makes no lessons and does not throw", () => {
    expect(lessonsFromProject(join(tmpdir(), "companion-gen-not-there-" + Date.now()), never)).toEqual([]);
  });
});

describe("the Vercel lesson", () => {
  test("every name the project needs, set here or not, is added in the project's Vercel settings and confirmed by the person, then a redeploy", () => {
    const p = project({ "package.json": VITE, "src/db.ts": "import.meta.env.VITE_SUPABASE_URL; import.meta.env.VITE_SUPABASE_ANON_KEY", ".env.local": "VITE_SUPABASE_URL=x\n" });
    const l = byId(lessonsFromProject(p, never), VERCEL_LESSON)!;
    expect(l.app).toBe("Vercel");
    for (const s of l.steps) expect(s.check).toEqual({ kind: "ask" });
    const named = (n: string) => l.steps.filter((s) => s.say.includes(n));
    expect(named("VITE_SUPABASE_URL")).toHaveLength(1);
    expect(named("VITE_SUPABASE_ANON_KEY")).toHaveLength(1);
    expect(named("VITE_SUPABASE_URL")[0].say).toMatch(/\.env\.local/);   // set on this Mac: the value is already in the file
    expect(named("VITE_SUPABASE_ANON_KEY")[0].say).toMatch(/Supabase/);  // not set anywhere yet: where to get it
    expect(l.steps.at(-1)!.say).toMatch(/Redeploy/);
    expect(l.needsProject).toBe(true);
  });
});

describe("they are lessons like the others", () => {
  test("every one passes the same checks as a lesson file, even for long and odd names", () => {
    const long = "A".repeat(64);
    const names = ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", long, `NEXT_PUBLIC_${"B".repeat(52)}`, "X1"];
    const n = { stack: "Next.js", start: "npm run dev", needed: names, missing: names };
    for (const l of [settingsLesson(n)!, vercelLesson(n)!]) {
      const r = parseLesson(JSON.parse(JSON.stringify(l)));
      expect(r.ok, r.ok ? "" : r.error).toBe(true);
      expect(new Set(l.steps.map((s) => s.id)).size).toBe(l.steps.length);
    }
  });
  test("a start command a lesson cannot hold as plain words does not lose the lesson: the restart step says it without it", () => {
    // From the project's own files (here .replit), so it can hold anything. Before, the whole lesson vanished and About this
    // project's button then said every setting was already set.
    const p = project({ "requirements.txt": "flask\n", "main.py": "import os\nkey = os.environ['OPENAI_API_KEY']\n", ".replit": 'run = "python main.py > log.txt"\n' });
    const l = byId(lessonsFromProject(p, never), SETTINGS_LESSON);
    expect(l).toBeDefined();
    expect(envSteps(l!)).toEqual(["OPENAI_API_KEY"]);
    expect(l!.steps.at(-1)!.say).toMatch(/start it again/);
    expect(l!.steps.at(-1)!.say).not.toContain(">");
    for (const start of ["npm run dev < input", "bun dev\tnow", "node a.js\u0007"]) {
      expect(settingsLesson({ stack: "Next.js", start, needed: ["OPENAI_API_KEY"], missing: ["OPENAI_API_KEY"] }), start).not.toBeNull();
    }
    expect(settingsLesson({ stack: "Next.js", start: "npm run dev", needed: ["OPENAI_API_KEY"], missing: ["OPENAI_API_KEY"] })!.steps.at(-1)!.say).toContain("npm run dev");
  });
  test("names a setting check cannot hold are left out, not allowed to spoil the lesson", () => {
    const p = project({ "package.json": VITE, "src/a.ts": "import.meta.env.VITE_API_URL", ".env.example": "lower_case=1\nX=2\nVITE_API_URL=\n" });
    const l = byId(lessonsFromProject(p, never), SETTINGS_LESSON)!;
    expect(envSteps(l)).toEqual(["VITE_API_URL"]);
  });
  test("at most 15 steps: the first names are covered and the goal says how many are left", () => {
    const names = Array.from({ length: 20 }, (_, i) => `SERVICE_${String.fromCharCode(65 + i)}_KEY`);
    const n = { stack: "Vite + React", start: null, needed: names, missing: names };
    const s = settingsLesson(n)!, v = vercelLesson(n)!;
    expect(s.steps.length).toBe(MAX_STEPS); expect(v.steps.length).toBe(MAX_STEPS);
    expect(envSteps(s)).toEqual(names.slice(0, 13));
    expect(s.goal).toMatch(/13 of the 20/);
    expect(v.goal).toMatch(/12 of the 20/);
  });
  test("a paused lesson keeps its list of names, so its place still fits; a name the code no longer reads starts it afresh", () => {
    const p = project({ "package.json": VITE, "src/a.ts": "import.meta.env.VITE_ONE; import.meta.env.VITE_TWO" });
    const first = byId(lessonsFromProject(p, never), SETTINGS_LESSON)!;
    const shape = first.steps.map((s) => s.id).join(",");
    writeFileSync(join(p, ".env.local"), "VITE_ONE=x\n");   // done while away
    const again = byId(lessonsFromProject(p, (id) => (id === SETTINGS_LESSON ? shape : undefined)), SETTINGS_LESSON)!;
    expect(again.steps.map((s) => s.id).join(",")).toBe(shape);
    expect(byId(lessonsFromProject(p, never), SETTINGS_LESSON)!.steps.map((s) => s.id).join(",")).not.toBe(shape);   // a fresh one has only what is left
    writeFileSync(join(p, "src/a.ts"), "import.meta.env.VITE_TWO; import.meta.env.VITE_THREE");
    const changed = byId(lessonsFromProject(p, (id) => (id === SETTINGS_LESSON ? shape : undefined)), SETTINGS_LESSON)!;
    expect(envSteps(changed)).toEqual(["VITE_THREE", "VITE_TWO"]);
  });
});
