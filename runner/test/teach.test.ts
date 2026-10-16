// Teaching from the change itself: the real diff of a task, cut into places that changed, for Explain (why), "Show me
// what changed" (ring the first changed line) and "your turn" (the same change made in two places). Plain code, no model.
import { describe, expect, test } from "bun:test";
import { changeTarget, diffForExplain, hunksOf, repeatedChange, revertHunk, taskHunks, teachable, turnChange } from "../src/teach.ts";

const lines = (...l: string[]) => l.join("\n") + "\n";

describe("cutting a change into the places that changed", () => {
  test("one changed line gives one place, with its line number before and after", () => {
    const h = hunksOf("src/App.tsx", lines("a", "b", "c", "d"), lines("a", "b", "C", "d"));
    expect(h).toEqual([{ file: "src/App.tsx", beforeAt: 3, before: ["c"], afterAt: 3, after: ["C"], context: ["a", "b"] }]);
  });
  test("two changes far apart are two places, and the second one's line counts what came before it", () => {
    const before = lines("one", "two", "three", "four", "five", "six", "seven");
    const after = lines("one", "TWO", "three", "new", "four", "five", "six", "SEVEN");
    const h = hunksOf("f.js", before, after);
    expect(h.map((x) => [x.beforeAt, x.before, x.afterAt, x.after])).toEqual([[2, ["two"], 2, ["TWO"]], [4, [], 4, ["new"]], [7, ["seven"], 8, ["SEVEN"]]]);
  });
  test("a new file is one place starting at line 1, a deleted file one place with nothing after", () => {
    expect(hunksOf("new.js", "", lines("x", "y"))[0]).toMatchObject({ afterAt: 1, after: ["x", "y"], before: [] });
    expect(hunksOf("old.js", lines("x"), "")[0]).toMatchObject({ beforeAt: 1, before: ["x"], after: [] });
  });
  test("nothing changed gives no places, and windows line endings are kept as they are", () => {
    expect(hunksOf("f", lines("a"), lines("a"))).toEqual([]);
    const h = hunksOf("f", "a\r\nb\r\n", "a\r\nB\r\n");
    expect(h[0].after).toEqual(["B\r"]);
  });
  test("for any two texts, making every change to the old one gives the new one", () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let round = 0; round < 400; round++) {
      const a = Array.from({ length: rnd(12) }, () => "abcde"[rnd(5)]), b = Array.from({ length: rnd(12) }, () => "abcde"[rnd(5)]);
      const rows = [...a];
      for (const h of hunksOf("f", lines(...a).slice(0, a.length ? undefined : 0), lines(...b).slice(0, b.length ? undefined : 0)).reverse()) {
        expect(rows.slice(h.beforeAt - 1, h.beforeAt - 1 + h.before.length)).toEqual(h.before);
        rows.splice(h.beforeAt - 1, h.before.length, ...h.after);
      }
      expect(rows).toEqual(b);
    }
  });
  test("a very large change still comes back, as one place", () => {
    const a = Array.from({ length: 3000 }, (_, i) => `old ${i}`).join("\n");
    const b = Array.from({ length: 3000 }, (_, i) => `new ${i}`).join("\n");
    const t0 = Date.now();
    const h = hunksOf("big.txt", a, b);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(h.length).toBe(1);
    expect(h[0].before.length).toBe(3000);
  });
});

describe("which files can be taught from", () => {
  test("settings and key files, Companion's, Claude's and git's own folders, installed packages and lock files are never used", () => {
    for (const f of [".env", ".env.local", "config/.env.production", "id_rsa", "certs/server.pem", "secrets.json", ".git/config", ".companion/project.md", ".claude/settings.json", "node_modules/x/index.js", "dist/app.js", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "app.min.js"])
      expect(teachable(f), f).toBe(false);
    for (const f of ["src/App.tsx", "package.json", "README.md", "api/users.py", "styles/site.css"]) expect(teachable(f), f).toBe(true);
  });
  test("a task's places skip those files, binary files and files too big to read", () => {
    const changed = [{ file: ".env", kind: "modified" }, { file: "logo.png", kind: "modified" }, { file: "huge.js", kind: "modified" }, { file: "src/a.js", kind: "modified" }];
    const before = { ".env": "KEY=1\n", "logo.png": "\u0000PNG", "src/a.js": "x\n" };
    const after = { ".env": "KEY=2\n", "logo.png": "\u0000PNG2", "src/a.js": "y\n" };
    expect(taskHunks(changed, before, after).map((h) => h.file)).toEqual(["src/a.js"]);
  });
});

describe("the change as Explain sees it", () => {
  test("it shows what was removed and added, where, and never a secret", () => {
    const h = taskHunks([{ file: "src/pay.js", kind: "modified" }], { "src/pay.js": lines("const total = price;", "send(total);") }, { "src/pay.js": lines("const total = price * qty;", "const key = \"sk_live_abcdefghijklmnop1234\";", "send(total);") });
    const d = diffForExplain(h);
    expect(d).toContain("src/pay.js");
    expect(d).toContain("- const total = price;");
    expect(d).toContain("+ const total = price * qty;");
    expect(d).not.toContain("sk_live_abcdef");
  });
  test("a private key written over several lines is hidden whole", () => {
    const key = ["-----BEGIN RSA PRIVATE KEY-----", "MIIEowIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyzABCDEF", "QWERTYUIOPASDFGHJKLZXCVBNM0987654321qwertyuiopasdfgh", "-----END RSA PRIVATE KEY-----"];
    const d = diffForExplain(taskHunks([{ file: "src/key.js", kind: "added" }], {}, { "src/key.js": lines("const k = `", ...key, "`;") }));
    expect(d).not.toContain("MIIEowIBAAKCAQEA");
    expect(d).not.toContain("QWERTYUIOP");
  });
  test("it is cut to a size limit and says so", () => {
    const big = Array.from({ length: 2000 }, (_, i) => `line number ${i} with some words`).join("\n");
    const d = diffForExplain(taskHunks([{ file: "a.txt", kind: "added" }], {}, { "a.txt": big }), 3000);
    expect(d.length).toBeLessThanOrEqual(3100);
    expect(d).toMatch(/cut/i);
  });
  test("very long lines are shortened", () => {
    const d = diffForExplain(taskHunks([{ file: "a.js", kind: "added" }], {}, { "a.js": "x".repeat(5000) }));
    expect(d.length).toBeLessThan(600);
  });
});

describe("Show me what changed: the line to ring", () => {
  test("the first line that was added or changed, in the file as it is now", () => {
    const h = taskHunks([{ file: "src/b.js", kind: "modified" }, { file: "src/a.js", kind: "modified" }], { "src/a.js": lines("a", "b", "c"), "src/b.js": lines("x") }, { "src/a.js": lines("a", "B   changed", "c"), "src/b.js": lines("X") });
    expect(changeTarget(h)).toEqual({ file: "src/a.js", line: 2, lineText: "B changed" });
  });
  test("a blank added line is passed over for the next one with words", () => {
    const h = hunksOf("a.js", lines("a", "z"), lines("a", "", "  return total;", "z"));
    expect(changeTarget(h)).toEqual({ file: "a.js", line: 3, lineText: "return total;" });
  });
  test("lines only taken away: the line now in their place", () => {
    const h = hunksOf("a.js", lines("keep", "drop me", "after"), lines("keep", "after"));
    expect(changeTarget(h)).toEqual({ file: "a.js", line: 2, lineText: "after" });
  });
  test("a whole file deleted has nothing to ring, and a secret on the line is hidden", () => {
    expect(changeTarget(hunksOf("a.js", lines("x"), ""))).toBeNull();
    expect(changeTarget([])).toBeNull();
    expect(changeTarget(hunksOf("a.js", "", lines("const password = \"hunter2hunter2\";")))!.lineText).not.toContain("hunter2");
  });
});

describe("your turn: the same change made in two places", () => {
  const two = taskHunks(
    [{ file: "src/a.js", kind: "modified" }, { file: "src/b.js", kind: "modified" }],
    { "src/a.js": lines("import x", "const n = user.name;", "end"), "src/b.js": lines("function t() {", "  return title(user.name);", "}") },
    { "src/a.js": lines("import x", "const n = user?.name;", "end"), "src/b.js": lines("function t() {", "  return title(user?.name);", "}") },
  );
  test("the same small change in two files is found, in order", () => {
    const r = repeatedChange(two)!;
    expect(r.first.file).toBe("src/a.js"); expect(r.second.file).toBe("src/b.js");
    expect(r.second.afterAt).toBe(2);
    expect(r.was).toBe("user"); expect(r.now).toBe("user?");
  });
  test("the same line changed the same way twice in one file counts too", () => {
    const h = hunksOf("api.js", lines("a", "fetch(\"/api/user\")", "b", "c", "d", "fetch(\"/api/user\")", "e"), lines("a", "fetch(\"/api/users\")", "b", "c", "d", "fetch(\"/api/users\")", "e"));
    const r = repeatedChange(h)!;
    expect([r.first.afterAt, r.second.afterAt]).toEqual([2, 6]);
    expect(r.now).toBe("users");
  });
  test("different changes, one change, spacing only changes and big changes are not offered", () => {
    expect(repeatedChange(hunksOf("a.js", lines("x = 1", "k", "y = 2"), lines("x = 5", "k", "y = 9 + z")))).toBeNull();
    expect(repeatedChange(hunksOf("a.js", lines("x = 1"), lines("x = 2")))).toBeNull();
    expect(repeatedChange(hunksOf("a.js", lines("a", "  x = 1", "b", "  x = 1"), lines("a", "x = 1", "b", "x = 1")))).toBeNull();
    const big = (s: string) => lines("p", `${s}1`, `${s}2`, `${s}3`, `${s}4`, "q");
    expect(repeatedChange([...hunksOf("a.js", big("old"), big("new")), ...hunksOf("b.js", big("old"), big("new"))])).toBeNull();
  });
  test("added or removed lines alone are not a change to copy", () => {
    expect(repeatedChange(hunksOf("a.js", lines("a", "b", "c"), lines("a", "log()", "b", "log()", "c")))).toBeNull();
  });
});

describe("putting one place back the way it was", () => {
  const before = lines("a", "const n = user.name;", "z");
  const after = lines("a", "const n = user?.name;", "z");
  const h = hunksOf("a.js", before, after)[0];
  test("only that place goes back; the rest of the file is untouched", () => {
    expect(revertHunk(after, h)).toBe(before);
    const two = hunksOf("b.js", lines("x = user.name", "k", "y = user.name"), lines("x = user?.name", "k", "y = user?.name"));
    expect(revertHunk(lines("x = user?.name", "k", "y = user?.name"), two[1])).toBe(lines("x = user?.name", "k", "y = user.name"));
  });
  test("a file that changed there since is left alone", () => {
    expect(revertHunk(lines("a", "const n = user!.name;", "z"), h)).toBeNull();
    expect(revertHunk(lines("a"), h)).toBeNull();
  });
  test("windows line endings stay windows line endings", () => {
    const w = hunksOf("a.js", "a\r\nold\r\nz\r\n", "a\r\nnew\r\nz\r\n")[0];
    expect(revertHunk("a\r\nnew\r\nz\r\n", w)).toBe("a\r\nold\r\nz\r\n");
  });
});

describe("your turn: what the person did at their place", () => {
  // The file as it was given to the person: the place put back as it was before the fix.
  const given = lines("a", "const n = user.name;", "z");
  const h = hunksOf("a.js", given, lines("a", "const n = user?.name;", "z"))[0];
  test("the same change counts whatever the spacing, and also when lines were added above it", () => {
    expect(turnChange(given, lines("a", "const n   =   user?.name;", "z"), h)).toBe("same");
    expect(turnChange(given, lines("new line", "a", "const n = user?.name;", "z"), h)).toBe("same");
  });
  test("an untouched place is said as untouched: no edit, spacing only, or only lines elsewhere", () => {
    expect(turnChange(given, given, h)).toBe("unchanged");
    expect(turnChange(given, lines("a", "const   n = user.name;  ", "z"), h)).toBe("unchanged");
    expect(turnChange(given, lines("// note", "a", "const n = user.name;", "z", "more"), h)).toBe("unchanged");
  });
  test("a different change, or the file gone, is a change of another kind", () => {
    expect(turnChange(given, lines("a", "const n = user && user.name;", "z"), h)).toBe("other");
    expect(turnChange(given, lines("a", "z"), h)).toBe("other");
    expect(turnChange(given, null, h)).toBe("other");
  });
  test("two places close together in one file: the place already fixed never counts as the person's change", () => {
    const fixed = lines("<div>", "<p>{user?.name}</p>", "<hr/>", "<p>{user?.name}</p>", "</div>");
    const r = repeatedChange(hunksOf("page.jsx", lines("<div>", "<p>{user.name}</p>", "<hr/>", "<p>{user.name}</p>", "</div>"), fixed))!;
    const start = revertHunk(fixed, r.second)!;
    expect(start).toBe(lines("<div>", "<p>{user?.name}</p>", "<hr/>", "<p>{user.name}</p>", "</div>"));
    expect(turnChange(start, start, r.second)).toBe("unchanged");
    expect(turnChange(start, fixed, r.second)).toBe("same");
    // Changing only the first place again is not a change to theirs.
    expect(turnChange(start, lines("<div>", "<p>{user.name}</p>", "<hr/>", "<p>{user.name}</p>", "</div>"), r.second)).toBe("unchanged");
    expect(turnChange(start, lines("<div>", "<p>{user?.name}</p>", "<hr/>", "<p>{user && user.name}</p>", "</div>"), r.second)).toBe("other");
  });
});
