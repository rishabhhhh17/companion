// M117 step 4: abuse protection. Sign up, contact and waitlist forms are found; each bot check makes them checked; hosted
// forms are their service's job; Clerk and Auth0 give the guidance line, never a pass; Supabase Auth passes only with its
// captcha on in config.toml. A sign in route that checks passwords with no limit is auth_open.
import { describe, expect, test } from "bun:test";
import { moneyToldLine } from "../../protocol/index.ts";
import { moneyCheck } from "../src/money/check.ts";
import { formsIn } from "../src/money/bots.ts";

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "app", dependencies: deps });
const form = (extra = "", action = "/api/waitlist") => `export default function Join() {\n  ${extra}\n  return (\n    <form action="${action}" method="post">\n      <input type="email" name="email" />\n      <button>Join</button>\n    </form>\n  );\n}\n`;
const abuse = (files: Record<string, string>) => moneyCheck(files).findings.filter((f) => f.kind === "form_open" || f.kind === "auth_open");

describe("forms that count", () => {
  test("sign up, contact and waitlist forms are found, by name or by where they post", () => {
    const f = formsIn({
      "app/signup/page.tsx": `export default () => <form onSubmit={go}><input type="password" /></form>;\n`,
      "app/contact/page.tsx": `export default () => <form><textarea name="message" /></form>;\n`,
      "components/Hero.tsx": form(),
      "components/Search.tsx": `export default () => <form><input name="q" /></form>;\n`,
    });
    expect(f.map((x) => [x.file, x.form, x.posts])).toEqual([
      ["app/contact/page.tsx", "contact", undefined], ["app/signup/page.tsx", "signup", undefined], ["components/Hero.tsx", "waitlist", "/api/waitlist"],
    ]);
  });
  test("a waitlist form with no bot check is form_open; its route that sends email is named", () => {
    const r = abuse({ "package.json": pkg({ next: "15" }), "app/page.tsx": form(), "app/api/waitlist/route.ts": `import { Resend } from "resend";\nexport async function POST() {}\n` });
    expect(r).toContainEqual({ kind: "form_open", file: "app/page.tsx", line: 4, form: "waitlist", path: "/api/waitlist", services: ["resend"] });
  });
});

describe("a bot check, a hosted form or a sign in service is never flagged", () => {
  const checks: [string, string][] = [
    ["Turnstile", `import { Turnstile } from "@marsidev/react-turnstile";`], ["hCaptcha", `import HCaptcha from "@hcaptcha/react-hcaptcha";`],
    ["reCAPTCHA", `import ReCAPTCHA from "react-google-recaptcha";`], ["Vercel BotID", `import { checkBotId } from "botid/server";`],
    ["Arcjet", `import arcjet, { protectSignup } from "@arcjet/next";`], ["Friendly Captcha", `import { WidgetInstance } from "friendly-challenge";`],
  ];
  for (const [name, imp] of checks) test(name, () => expect(abuse({ "package.json": pkg({ next: "15" }), "app/page.tsx": `${imp}\n${form()}` })).toEqual([]));
  test("a bot check on the route it posts to counts", () => {
    expect(abuse({ "package.json": pkg({ next: "15" }), "app/page.tsx": form(), "app/api/waitlist/route.ts": `export async function POST(req) {\n  await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST" });\n}\n` })).toEqual([]);
  });
  test("a bot check in a component the page imports counts", () => {
    expect(abuse({ "package.json": pkg({ next: "15" }), "app/page.tsx": `import { Guard } from "@/components/Guard";\n${form()}`, "components/Guard.tsx": `import { Turnstile } from "@marsidev/react-turnstile";\nexport const Guard = () => <Turnstile siteKey="x" />;\n` })).toEqual([]);
  });
  test("a limit on a waitlist form's route counts (it stops a flood)", () => {
    expect(abuse({ "package.json": pkg({ next: "15" }), "app/page.tsx": form(), "app/api/waitlist/route.ts": `import { Ratelimit } from "@upstash/ratelimit";\nconst rl = new Ratelimit({});\nexport async function POST() { await rl.limit("x"); }\n` })).toEqual([]);
  });
  test("Formspree and Netlify Forms are hosted", () => {
    expect(abuse({ "app/page.tsx": form("", "https://formspree.io/f/abc") })).toEqual([]);
    expect(abuse({ "index.html": `<form name="contact" method="POST" data-netlify="true"><input type="email" name="email"></form>\n` })).toEqual([]);
  });
  test("Clerk and Auth0: guidance to check their own protection is on, never a pass and never a finding", () => {
    const r = moneyCheck({ "package.json": pkg({ next: "15", "@clerk/nextjs": "6" }), "app/sign-up/[[...sign-up]]/page.tsx": `import { SignUp } from "@clerk/nextjs";\nexport default () => <SignUp />;\n` });
    expect(r.findings.filter((f) => f.kind === "form_open")).toEqual([]);
    expect(r.guides).toEqual([{ auth: "clerk", file: "app/sign-up/[[...sign-up]]/page.tsx" }]);
    expect(moneyCheck({ "lib/auth.ts": `import { Auth0Client } from "@auth0/nextjs-auth0/server";\n` }).guides).toEqual([{ auth: "auth0", file: "lib/auth.ts" }]);
  });
  test("Supabase Auth: guidance unless [auth.captcha] is on in supabase/config.toml", () => {
    const files = { "app/signup/page.tsx": `import { supabase } from "@/lib/supabase";\nexport default () => <form onSubmit={() => supabase.auth.signUp({ email, password })}><input type="email" /></form>;\n` };
    expect(moneyCheck(files).guides).toEqual([{ auth: "supabase_auth", file: "app/signup/page.tsx" }]);
    expect(moneyCheck(files).findings.filter((f) => f.kind === "form_open")).toEqual([]);
    expect(moneyCheck({ ...files, "supabase/config.toml": `[auth.captcha]\nenabled = true\nprovider = "turnstile"\n` }).guides).toBeUndefined();
    expect(moneyCheck({ ...files, "supabase/config.toml": `[auth.captcha]\nenabled = false\n` }).guides).toEqual([{ auth: "supabase_auth", file: "app/signup/page.tsx" }]);
  });
});

describe("sign in routes", () => {
  const login = `import bcrypt from "bcryptjs";\nimport { db } from "@/lib/db";\n\nexport async function POST(req: Request) {\n  const ok = await bcrypt.compare(password, user.hash);\n}\n`;
  test("a sign in route that checks a password with no limit is auth_open", () => {
    expect(abuse({ "package.json": pkg({ next: "15" }), "app/api/login/route.ts": login })).toEqual([{ kind: "auth_open", file: "app/api/login/route.ts", line: 4, framework: "next_app", method: "POST", path: "/api/login" }]);
  });
  test("with a limit, it is not", () => {
    expect(abuse({ "package.json": pkg({ next: "15" }), "app/api/login/route.ts": `import { Ratelimit } from "@upstash/ratelimit";\nconst rl = new Ratelimit({});\n${login.replace("const ok", 'await rl.limit("ip");\n  const ok')}` })).toEqual([]);
  });
  test("an OAuth callback that handles no password is not a sign in route to limit", () => {
    expect(abuse({ "package.json": pkg({ next: "15" }), "app/api/auth/callback/route.ts": `export async function GET(req) { return exchangeCode(req); }\nexport async function POST(req) { return exchangeCode(req); }\n` })).toEqual([]);
  });
  test("a route that hands sign in to Supabase is Supabase's job", () => {
    expect(abuse({ "package.json": pkg({ next: "15" }), "app/api/login/route.ts": `export async function POST(req) {\n  const { email, password } = await req.json();\n  return supabase.auth.signInWithPassword({ email, password });\n}\n` })).toEqual([]);
  });
  test("a told form is still shown, marked told", () => {
    const r = moneyCheck({ "app/page.tsx": form() }, { told: [moneyToldLine("form_open", "app/page.tsx")!] });
    expect(r.findings.find((f) => f.kind === "form_open")?.told).toBe(true);
  });
});
