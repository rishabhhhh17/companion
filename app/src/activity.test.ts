// What the card says the agent is doing, in plain words: "Reading signup.js", "Running the tests". Never a raw command, and
// never a secret.
import { describe, expect, test } from "bun:test";
import { activityWords } from "./activity.ts";
import { activityNow, initial, reduce, type Model } from "./model.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const start = [ev({ type: "checkpoint.created", project: "/Users/me/site", agent: "a", checkpoint: "cp_0001", label: "Before: fix signup", files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];
const tool = (id: string, name: string, summary: string, outcome = "ran") => ev({ type: "agent.tool", agent: "a", tool: name, summary, toolUseId: id, undoable: true, outcome });
const secret = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";

describe("each tool in plain words", () => {
  test("files are named by their own name, not the whole path", () => {
    expect(activityWords("Read", "Read: /Users/me/site/src/signup.js")).toBe("Reading signup.js");
    expect(activityWords("Write", "Write: src/pages/Contact.jsx")).toBe("Writing Contact.jsx");
    expect(activityWords("Edit", "Edit: /Users/me/site/index.html")).toBe("Changing index.html");
    expect(activityWords("MultiEdit", "MultiEdit: app.css")).toBe("Changing app.css");
  });
  test("looking around", () => {
    expect(activityWords("Glob", "Glob")).toBe("Looking through the files");
    expect(activityWords("LS", "LS")).toBe("Looking through the files");
    expect(activityWords("Grep", "Grep")).toBe("Searching the project");
    expect(activityWords("WebSearch", "WebSearch")).toBe("Searching the web");
    expect(activityWords("WebFetch", "WebFetch")).toBe("Reading a web page");
  });
  test("an unknown tool still gets plain words", () => {
    expect(activityWords("mcp__thing__do", "mcp__thing__do")).toBe("Using a connected tool");
    expect(activityWords("Mystery", "Mystery")).toBe("Working");
  });
});

describe("commands in plain words", () => {
  const cmd = (c: string) => activityWords("Bash", `Running: ${c}`);
  test("running the tests", () => {
    for (const c of ["npm test", "npm run test", "bun test ./src", "cd app && pnpm test", "yarn test --watch=false", "npx vitest run", "pytest -q", "python3 -m pytest", "node --test", "go test ./...", "cargo test"]) expect(cmd(c), c).toBe("Running the tests");
  });
  test("installing, building, checking and starting", () => {
    expect(cmd("npm install resend")).toBe("Installing packages");
    expect(cmd("pip install flask")).toBe("Installing packages");
    expect(cmd("npm run build")).toBe("Building the project");
    expect(cmd("npx tsc --noEmit")).toBe("Checking the code");
    expect(cmd("npm run lint")).toBe("Checking the code");
    expect(cmd("npm run dev")).toBe("Starting the app");
  });
  test("looking at files and history", () => {
    expect(cmd("ls -la src")).toBe("Looking through the files");
    expect(cmd("cat package.json")).toBe("Reading the files");
    expect(cmd("git status")).toBe("Looking at the project history");
  });
  test("anything else is just a command, never the command itself", () => {
    const w = cmd(`curl -H "Authorization: Bearer ${secret}" https://api.example.com/x`);
    expect(w).toBe("Running a command");
    expect(w).not.toContain(secret);
    expect(cmd("export API_KEY=hunter2hunter2 && node x.js")).not.toContain("hunter2");
  });
  test("a summary without the usual start still works", () => expect(activityWords("Bash", "npm test")).toBe("Running the tests"));
});

describe("a file name never carries a secret onto the card", () => {
  test("a key in a path is hidden", () => {
    expect(activityWords("Read", `Read: /tmp/${secret}.txt`)).not.toContain(secret);
  });
});

describe("the card shows the latest one or two", () => {
  test("only the last two, newest last, in plain words", () => {
    const m = run([...start, tool("1", "Read", "Read: /Users/me/site/src/signup.js"), tool("2", "Grep", "Grep"), tool("3", "Bash", "Running: npm test")]);
    expect(activityNow(m).map((l) => l.words)).toEqual(["Searching the project", "Running the tests"]);
  });
  test("one line when only one thing has happened", () => {
    expect(activityNow(run([...start, tool("1", "Read", "Read: signup.js")])).map((l) => l.words)).toEqual(["Reading signup.js"]);
  });
  test("a step waiting for you is updated in place when it runs", () => {
    const m = run([...start, tool("1", "Bash", "Running: git push", "needs_approval"), tool("1", "Bash", "Running: git push", "ran")]);
    expect(activityNow(m)).toEqual([expect.objectContaining({ words: "Running a command", outcome: "ran" })]);
  });
  test("a blocked step keeps its outcome, so the card can say so", () => {
    expect(activityNow(run([...start, tool("1", "Write", "Write: ../x.txt", "blocked")]))[0]).toMatchObject({ words: "Writing x.txt", outcome: "blocked" });
  });
  test("nothing yet means nothing shown", () => expect(activityNow(run(start))).toEqual([]));
  test("a raw command with a secret is never in what is shown", () => {
    const m = run([...start, tool("1", "Bash", `Running: curl -H "Authorization: Bearer ${secret}" https://x.example`)]);
    expect(JSON.stringify(activityNow(m))).not.toContain(secret);
  });
});
