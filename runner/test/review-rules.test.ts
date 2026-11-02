// M52, the review of every change (F30): the rating rules are plain code with no model, so they are tested here on their own.
// What a change touches, and safe, worth a look or stop.
import { describe, expect, test } from "bun:test";
import { importersOf, needsStrongModel, rate, secretsInCode, touchesOf, TOUCHES, type FileChange, type RateInput } from "../src/review/rate.ts";
import { redact } from "../src/redact.ts";

const ch = (file: string, kind: FileChange["kind"] = "modified"): FileChange => ({ file, kind });
const base = (over: Partial<RateInput> = {}): RateInput => ({ changes: [ch("src/App.tsx")], touches: [], secrets: [], stillUsed: [], secretFiles: [], checks: "not_run", count: 1, capped: false, ...over });

describe("what a change touches", () => {
  test("sign in, payments, data, settings, dependencies, by the files' names", () => {
    expect(touchesOf([ch("src/auth/login.tsx")], [])).toContain("sign_in");
    expect(touchesOf([ch("app/api/stripe/webhook/route.ts")], [])).toContain("payments");
    expect(touchesOf([ch("pages/checkout.tsx")], [])).toContain("payments");
    expect(touchesOf([ch("supabase/migrations/001_init.sql", "added")], [])).toContain("data");
    expect(touchesOf([ch("prisma/schema.prisma")], [])).toContain("data");
    expect(touchesOf([ch("next.config.mjs")], [])).toContain("settings");
    expect(touchesOf([ch(".github/workflows/ci.yml")], [])).toContain("settings");
    expect(touchesOf([ch("package-lock.json")], [])).toContain("dependencies");
    expect(touchesOf([ch("requirements.txt")], [])).toContain("dependencies");
  });
  test("by the lines that changed, when the file name says nothing", () => {
    expect(touchesOf([ch("src/lib/api.ts")], [{ file: "src/lib/api.ts", added: ["const { data } = await supabase.auth.signInWithPassword({ email, password })"], removed: [] }])).toContain("sign_in");
    expect(touchesOf([ch("src/lib/pay.ts")], [{ file: "src/lib/pay.ts", added: ["const session = await stripe.checkout.sessions.create({"], removed: [] }])).toContain("payments");
    expect(touchesOf([ch("src/lib/save.ts")], [{ file: "src/lib/save.ts", added: ["await supabase.from('notes').insert(row)"], removed: [] }])).toContain("data");
    expect(touchesOf([ch("package.json")], [{ file: "package.json", added: ['    "zod": "^4.6.6",'], removed: [] }])).toContain("dependencies");
  });
  test("package.json with only its scripts changed is settings, not new packages", () => {
    const t = touchesOf([ch("package.json")], [{ file: "package.json", added: ['    "dev": "next dev -p 4000",'], removed: ['    "dev": "next dev",'] }]);
    expect(t).toContain("settings");
    expect(t).not.toContain("dependencies");
  });
  test("a settings or key file is secrets, and only its name is used", () => {
    expect(touchesOf([ch(".env.local")], [])).toEqual(["secrets"]);
    expect(touchesOf([], [], [".env"])).toEqual(["secrets"]);
  });
  test("the look only: styles, pictures and fonts, and nothing else", () => {
    expect(touchesOf([ch("src/index.css"), ch("public/logo.svg", "added"), ch("tailwind.config.ts")], [])).toEqual(["look_only"]);
    expect(touchesOf([ch("src/index.css"), ch("src/App.tsx")], [])).toEqual([]);
    expect(touchesOf([ch("src/index.css"), ch("src/auth.ts")], [])).toEqual(["sign_in"]);
  });
  test("every touch has its place in the list, in the list's order, and none twice", () => {
    const t = touchesOf([ch("src/auth.ts"), ch("src/stripe.ts"), ch("db/schema.sql"), ch("vite.config.ts"), ch("yarn.lock"), ch(".env")], []);
    expect(t).toEqual(TOUCHES.filter((x) => t.includes(x)));
    expect(new Set(t).size).toBe(t.length);
    expect(t).not.toContain("look_only");
  });
});

describe("a key or secret written into code", () => {
  test("a key shaped value, or a secret name given a quoted value, is found with its file and line", () => {
    const got = secretsInCode([
      { file: "src/api.ts", line: 4, text: 'const client = new Stripe("sk_live_51Habcdefghijklmnop")' },
      { file: "src/db.ts", line: 9, text: 'const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.abcdefghijklmnop"' },
      { file: "src/mail.ts", line: 2, text: "const apiKey = 'q8f7d6s5a4z3x2c1v0b9'" },
      { file: "src/x.ts", line: 3, text: "postgres://admin:hunter22@db.example.com:5432/app" },
    ]);
    expect(got).toEqual([{ file: "src/api.ts", line: 4 }, { file: "src/db.ts", line: 9 }, { file: "src/mail.ts", line: 2 }, { file: "src/x.ts", line: 3 }]);
  });
  test("reading a secret from settings, a form field, or a placeholder is not a secret in code", () => {
    expect(secretsInCode([
      { file: "src/a.ts", line: 1, text: "const apiKey = process.env.STRIPE_SECRET_KEY" },
      { file: "src/a.ts", line: 2, text: "const password = form.password;" },
      { file: "src/a.ts", line: 3, text: 'const token = "your-api-key-here"' },
      { file: "src/a.ts", line: 4, text: 'apiKey: "xxxxxxxxxxxxxxxx",' },
      { file: "src/a.ts", line: 5, text: "const secret = `${prefix}-${id}`" },
      { file: "src/a.ts", line: 6, text: '<input type="password" name="password" />' },
    ])).toEqual([]);
  });
  // The review's rule and the redaction must agree: a line the review itself calls a key in code must never reach a model
  // in clear (review round 1: `authKey` was a secret to the rule and plain text to redact()).
  test("every line the rule calls a key in code is hidden by redact(), whatever the name's form", () => {
    const VALUE = "Zq81xLmP0aa9";
    const names = ["authKey", "AUTHKEY", "authkey", "auth_key", "AUTH-KEY", "apiKey", "APIKEY", "api_key", "accessKey", "access_key", "privateKey", "private_key", "serviceRole", "service_role",
      "clientSecret", "client_secret", "secret", "SECRET", "token", "Token", "password", "passwd", "pwd", "myAuthKey", "stripeApiKey", "config.authKey", "$token", "x.y.password"];
    const forms = (n: string) => [`const ${n} = "${VALUE}"`, `${n}: '${VALUE}',`, `"${n}": "${VALUE}"`, `let ${n}=\`${VALUE}\`;`, `${n} = "${VALUE}"`];
    for (const n of names) for (const text of forms(n)) {
      const hit = secretsInCode([{ file: "src/api.ts", line: 1, text }]);
      expect(hit, text).toEqual([{ file: "src/api.ts", line: 1 }]);
      expect(redact(text), text).not.toContain(VALUE);
    }
  });
});

describe("a removed file other files still use", () => {
  test("found through a relative import, with or without the ending, an index file, require and the @ shortcut", () => {
    const files = {
      "src/App.tsx": 'import React from "react";\nimport { fmt } from "./utils/date";\n',
      "src/pages/Home.tsx": "import Card from '../components/Card'\n",
      "src/old.js": "const x = require('./lib/legacy.js')\n",
      "src/b.ts": 'import { thing } from "@/components/Card";\n',
      "src/c.ts": 'export * from "./utils/date.ts"\n',
    };
    const got = importersOf(["src/utils/date.ts", "src/components/Card/index.tsx", "src/lib/legacy.js"], files);
    expect(got).toEqual([
      { file: "src/components/Card/index.tsx", by: "src/b.ts", line: 1 },
      { file: "src/components/Card/index.tsx", by: "src/pages/Home.tsx", line: 1 },
      { file: "src/lib/legacy.js", by: "src/old.js", line: 1 },
      { file: "src/utils/date.ts", by: "src/App.tsx", line: 2 },
      { file: "src/utils/date.ts", by: "src/c.ts", line: 1 },
    ]);
  });
  test("a style sheet and a Python module are found too", () => {
    expect(importersOf(["src/theme.css"], { "src/index.css": '@import "./theme.css";\n' })).toEqual([{ file: "src/theme.css", by: "src/index.css", line: 1 }]);
    expect(importersOf(["app/helpers.py"], { "app/main.py": "from app.helpers import slugify\n", "app/views.py": "from .helpers import x\n" })).toEqual([
      { file: "app/helpers.py", by: "app/main.py", line: 1 }, { file: "app/helpers.py", by: "app/views.py", line: 1 },
    ]);
  });
  test("packages, files that still exist, and the removed files themselves never count", () => {
    expect(importersOf(["src/utils/date.ts"], { "src/App.tsx": 'import x from "date-fns"\nimport y from "./utils/dates"\n', "src/utils/date.ts": 'import z from "./date"\n' })).toEqual([]);
    expect(importersOf([], { "src/App.tsx": 'import y from "./gone"\n' })).toEqual([]);
  });
});

describe("the rating", () => {
  test("an ordinary change, or the look only, is safe", () => {
    expect(rate(base()).rating).toBe("safe");
    expect(rate(base({ touches: ["look_only"] })).rating).toBe("safe");
    expect(rate(base({ checks: "passed" })).rating).toBe("safe");
  });
  test("sign in, payments, data, settings, secrets files, packages, removed files or a big batch are worth a look", () => {
    for (const t of ["sign_in", "payments", "data", "settings", "dependencies"] as const) expect(rate(base({ touches: [t] })).rating, t).toBe("worth_a_look");
    expect(rate(base({ secretFiles: [".env"], touches: ["secrets"] })).rating).toBe("worth_a_look");
    expect(rate(base({ changes: [ch("src/old.ts", "deleted")] })).rating).toBe("worth_a_look");
    expect(rate(base({ count: 400, capped: true })).rating).toBe("worth_a_look");
    expect(rate(base({ concern: true })).rating).toBe("worth_a_look");
  });
  test("stop: a key in the code, a removed file still used, checks that fail, payments or sign in with failing checks", () => {
    const k = rate(base({ secrets: [{ file: "src/api.ts", line: 4 }], touches: ["secrets"] }));
    expect(k.rating).toBe("stop");
    expect(k.reasons[0]).toMatchObject({ kind: "secret_in_code", file: "src/api.ts", line: 4 });
    const gone = rate(base({ stillUsed: [{ file: "src/a.ts", by: "src/b.ts", line: 2 }], changes: [ch("src/a.ts", "deleted")] }));
    expect(gone.rating).toBe("stop");
    // The place named is the line that still uses it, in the file that is still there (the removed file has no lines now).
    expect(gone.reasons[0]).toMatchObject({ kind: "removed_still_used", file: "src/b.ts", line: 2 });
    expect(gone.reasons[0].say).toContain("src/a.ts");
    expect(rate(base({ checks: "failed" })).rating).toBe("stop");
    const pay = rate(base({ touches: ["payments"], checks: "failed" }));
    expect(pay.rating).toBe("stop");
    expect(pay.reasons.map((r) => r.kind)).toContain("risky_with_failing_checks");
  });
  test("a model's worry can only raise safe to worth a look, never lower a rating", () => {
    expect(rate(base({ concern: true, checks: "failed" })).rating).toBe("stop");
    expect(rate(base({ concern: false, touches: ["payments"] })).rating).toBe("worth_a_look");
  });
  test("checks that could not run say nothing either way", () => {
    expect(rate(base({ checks: "unknown" })).rating).toBe("safe");
  });
  test("every reason is plain words: no secret value, no long dash, no shouting, the most serious first", () => {
    const r = rate(base({ secrets: [{ file: "src/api.ts", line: 4 }], stillUsed: [{ file: "src/a.ts", by: "src/b.ts", line: 2 }], checks: "failed", checksNote: "Build did not pass: sk_live_51Habcdefghijklmnop", touches: ["payments", "secrets"], secretFiles: [".env"], changes: [ch("src/a.ts", "deleted"), ch("src/api.ts")], count: 2 }));
    expect(r.reasons[0].kind).toBe("secret_in_code");
    for (const x of r.reasons) {
      expect(x.say, x.kind).not.toMatch(/[–—]/);
      expect(x.say, x.kind).not.toMatch(/\b[A-Z]{4,}\b/);
      expect(x.say, x.kind).not.toContain("sk_live_51Habcdefghijklmnop");
      expect(x.say.length, x.kind).toBeGreaterThan(10);
    }
  });
});

describe("which model writes the words (T10)", () => {
  test("the cheap lane usually; the stronger one only for stop, sign in or payments", () => {
    expect(needsStrongModel("safe", [])).toBe(false);
    expect(needsStrongModel("worth_a_look", ["data", "dependencies"])).toBe(false);
    expect(needsStrongModel("stop", [])).toBe(true);
    expect(needsStrongModel("worth_a_look", ["sign_in"])).toBe(true);
    expect(needsStrongModel("safe", ["payments"])).toBe(true);
  });
});
