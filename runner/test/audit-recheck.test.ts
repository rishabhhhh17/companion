// A second look at the audit fixes of 20 Oct 2026 (review of the fixes): the database access check with a live database,
// here documents read as shell text, the version bump's last flag, git's own environment variables, and readers that name
// their files in a list.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate } from "../src/safety.ts";
import { inputTargets, redirectTargets } from "../src/shell.ts";
import { rlsGate } from "../src/ship/rls.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const dir = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-arc-${l}-`))); made.push(d); return d; };
const bash = (p: string, command: string) => evaluate({ tool: "Bash", input: { command } }, { project: p });

describe("the database access check with the live database read (A34, second look)", () => {
  const supa = (sql: string) => { const d = dir("supa"); mkdirSync(join(d, "supabase", "migrations"), { recursive: true }); writeFileSync(join(d, "supabase", "config.toml"), "x"); writeFileSync(join(d, "supabase", "migrations", "1.sql"), sql); return d; };
  const notes = "create table public.notes (id int, user_id uuid);\nalter table public.notes enable row level security;\n";
  const posts = "create table public.posts (id int);\nalter table public.posts enable row level security;\n";
  const signedIn = "create policy \"read\" on public.notes for select to authenticated using (true);\n";
  const anyone = "create policy \"anyone\" on public.posts for select to anon using (true);\n";
  test("a live table with row level security off blocks, even when a rule for signed in people also says true", async () => {
    const g = await rlsGate({ project: supa(notes + signedIn), query: async () => [{ table: "notes", rls: true }, { table: "dash_secrets", rls: false }] });
    expect(g).toMatchObject({ status: "blocked", overridable: false, findings: ["dash_secrets"] });
  });
  test("a live table with row level security off blocks when a rule for anyone says true", async () => {
    const g = await rlsGate({ project: supa(posts + anyone), query: async () => [{ table: "posts", rls: true }, { table: "dash_secrets", rls: false }] });
    expect(g).toMatchObject({ status: "blocked", overridable: false });
  });
  test("both kinds of open rule are named together, with or without the live database", async () => {
    const d = supa(notes + posts + signedIn + anyone);
    for (const g of [await rlsGate({ project: d }), await rlsGate({ project: d, query: async () => [{ table: "notes", rls: true }, { table: "posts", rls: true }] })]) {
      expect(g.status).toBe("could_not_check");
      expect(g.overridable).toBe(true);
      expect([...(g.findings ?? [])].sort()).toEqual(["notes", "posts"]);
      expect(g.detail).toMatch(/notes/);
      expect(g.detail).toMatch(/posts/);
      expect(g.detail).toMatch(/every signed in account/i);
    }
  });
  test("a live pass never passes a table with a rule for anyone that says true", async () => {
    const g = await rlsGate({ project: supa(posts + anyone), query: async () => [{ table: "posts", rls: true }] });
    expect(g).toMatchObject({ status: "could_not_check", findings: ["posts"], overridable: true });
  });
  test("protected tables with careful rules still pass with the live database", async () => {
    const g = await rlsGate({ project: supa(notes + "create policy \"own\" on public.notes for select to authenticated using ((select auth.uid()) = user_id);\n"), query: async () => [{ table: "notes", rls: true }] });
    expect(g.status).toBe("passed");
  });
});

describe("a here document's text is not read as shell (A14, second look)", () => {
  const MUST_RUN = [
    "cat > index.html <<'EOF'\n<html><body><div></div></body></html>\nEOF",
    "cat > src/App.jsx <<EOF\nexport default function App() { return <h1>Hi</h1>; }\nEOF",
    "cat > a.js <<-EOF\n\tif (a </2) x();\n\tEOF",
    "python3 - <<EOF\nprint(1 < 2)\nprint('</p>')\nEOF",
    "cat <<\"END\" > page.html\n<p>1 > 0</p>\n<a href=\"/x\">x</a>\nEND\ncat page.html",
  ];
  for (const c of MUST_RUN) test(`allowed: ${JSON.stringify(c)}`, () => { expect(bash(dir("p"), c).decision, c).toBe("allow"); });
  test("the text of a here document names no file read or written", () => {
    expect(inputTargets("cat > index.html <<'EOF'\n<div></div>\nEOF")).toEqual([]);
    expect(redirectTargets("cat <<EOF > a.txt\n<p>1 > /etc/x</p>\nEOF")).toEqual(["a.txt"]);
  });
  test("what comes after the here document is still read", () => {
    expect(inputTargets("cat <<EOF\nhi\nEOF\nwc -l < ~/Documents/notes.txt")).toEqual(["~/Documents/notes.txt"]);
    expect(redirectTargets("cat <<EOF\nhi\nEOF\necho x > /etc/hosts")).toEqual(["/etc/hosts"]);
    expect(bash(dir("p"), "cat <<EOF > a.txt\nhi\nEOF\ntr a-z A-Z < ~/Documents/notes.txt > out.txt").decision).toBe("ask");
  });
  test("<< inside arithmetic shifts bits and hides nothing after it", () => {
    for (const c of [": $((1<<EOF))\necho x > ~/.zshrc\nEOF", "(( x = 1 << EOF ))\necho x > /etc/hosts\nEOF", ": $[1<<EOF]\necho x > ~/.zshrc\nEOF"]) {
      expect(redirectTargets(c).length, c).toBe(1);
      expect(bash(dir("p"), c).decision, c).not.toBe("allow");
    }
  });
  test("a here document marker inside quotes is not one", () => {
    expect(inputTargets("echo '<<EOF'\nsort < /etc/hosts")).toEqual(["/etc/hosts"]);
  });
});

describe("a version bump reads its flags the way npm does: the last one wins (A16, second look)", () => {
  for (const c of ["npm version patch --no-git-tag-version --git-tag-version", "npm version patch --no-git-tag-version --git-tag-version=true", "pnpm version patch --no-git-tag-version --git-tag-version", "npm version patch --git-tag-version=false --git-tag-version"]) {
    test(`${c} asks, as a change to git`, () => { const v = bash(dir("p"), c); expect(v.decision).toBe("ask"); expect(v.risk).toBe("git"); });
  }
  for (const c of ["npm version patch --git-tag-version --no-git-tag-version", "npm version patch --git-tag-version=true --git-tag-version=false"]) {
    test(`${c} changes no git`, () => { expect(bash(dir("p"), c).decision).toBe("allow"); });
  }
});

describe("git pointed at another folder through its own environment variables (A15, second look)", () => {
  const setup = () => { const root = dir("two"); const p = join(root, "mine"), other = join(root, "other"); mkdirSync(p); mkdirSync(other); return { p, other }; };
  test("GIT_DIR, GIT_WORK_TREE and the like outside the project ask", () => {
    const { p, other } = setup();
    for (const c of ["GIT_DIR=../other/.git git show HEAD:.env", `GIT_DIR=${other}/.git git log -p`, "GIT_WORK_TREE=../other GIT_DIR=../other/.git git diff", "env GIT_DIR=../other/.git git log -p", "GIT_COMMON_DIR=../other/.git git log", "GIT_INDEX_FILE=../other/.git/index git diff --cached", "GIT_OBJECT_DIRECTORY=../other/.git/objects git log", "export GIT_DIR=../other/.git; git log -p", "sh -c 'GIT_DIR=../other/.git git log -p'", "GIT_DIR=$HOME/x/.git git log"]) {
      expect(bash(p, c).decision, c).toBe("ask");
    }
  });
  test("git told by its environment to run a program asks", () => {
    const { p } = setup();
    for (const c of ["GIT_EXTERNAL_DIFF=./x.sh git diff", "GIT_SSH_COMMAND='sh x' git fetch", "GIT_CONFIG_GLOBAL=./evil git status", "GIT_PAGER=sh git -p log"]) expect(bash(p, c).decision, c).toBe("ask");
  });
  test("the same variables inside the project are still allowed", () => {
    const { p } = setup();
    mkdirSync(join(p, "sub"));
    for (const c of ["GIT_DIR=.git git log --oneline", "GIT_WORK_TREE=. git status", "GIT_TERMINAL_PROMPT=0 git status"]) expect(bash(p, c).decision, c).toBe("allow");
  });
});

describe("readers that name their files in a list, and other copy like readers (A14, second look)", () => {
  const MUST_ASK = [
    "tar -cf out.tar -T /abs/list.txt", "tar -cf out.tar --files-from /abs/list.txt", "tar -cf out.tar --files-from=list.txt", "tar -cf out.tar -T list.txt",
    "echo /abs/other/secret.txt | zip out.zip -@", "zip -r out.zip . -i@/abs/list.txt", "bsdtar -cf out.tar @/abs/archive.tar", "tar -cf out.tar @../other/a.tar",
    "split -b 1k ../other/secret.txt part", "iconv -f utf8 -t utf8 ../other/secret.txt", "openssl base64 -in ../other/secret.txt", "openssl enc -base64 -in ~/Documents/x -out x.b64",
  ];
  for (const c of MUST_ASK) test(c, () => { const v = bash(dir("p"), c); expect(v.decision, c).toBe("ask"); expect(v.risk).toBe("outside_project"); });
  const MUST_RUN = ["tar -cf out.tar src", "tar -xf a.tar -T names.txt", "zip -r out.zip . -i@list.txt", "split -b 1k big.txt part", "iconv -f latin1 -t utf8 a.txt", "openssl base64 -in a.txt -out a.b64"];
  for (const c of MUST_RUN) test(`inside the project it still runs: ${c}`, () => { expect(bash(dir("p"), c).decision, c).toBe("allow"); });
});
