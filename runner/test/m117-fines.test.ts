// M117 step 6: the fines basics. No accounts: the privacy and delete rules are not needed. A privacy page is found in each
// framework's page folder, by a footer link and by a hosted policy. Each tracker is found; consent tools, Consent Mode and a
// coded opt out make it consented; cookieless tools are listed, never flagged. Each way to delete an account is found.
import { describe, expect, test } from "bun:test";
import { moneyCheck } from "../src/money/check.ts";

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "app", dependencies: deps });
const kinds = (files: Record<string, string>) => moneyCheck(files).findings.map((f) => f.kind).filter((k) => k === "no_privacy_page" || k === "no_delete_account" || k === "tracker_no_consent");
const withClerk = (extra: Record<string, string>) => ({ "package.json": pkg({ next: "15", "@clerk/nextjs": "6" }), "app/layout.tsx": `import { ClerkProvider } from "@clerk/nextjs";\n`, ...extra });

describe("accounts or emails", () => {
  test("no accounts and no email collection: the privacy and delete rules are not needed", () => {
    const r = moneyCheck({ "package.json": pkg({ next: "15" }), "app/page.tsx": `export default () => <h1>Hi</h1>;\n` });
    expect(r.accounts).toBe(false);
    expect(r.emails).toBeUndefined();
    expect(kinds({ "package.json": pkg({ next: "15" }), "app/page.tsx": `export default () => <h1>Hi</h1>;\n` })).toEqual([]);
  });
  test("accounts with no privacy page and no delete: both said", () => {
    expect(kinds(withClerk({}))).toEqual(["no_privacy_page", "no_delete_account"]);
  });
  test("an email form with no accounts needs a privacy page, not a delete way", () => {
    expect(kinds({ "app/page.tsx": `export default () => <form action="/api/waitlist"><input type="email" name="email" /></form>;\n` })).toEqual(["no_privacy_page"]);
  });
  test("each auth package counts as accounts", () => {
    for (const d of ["next-auth", "@auth/core", "@supabase/ssr", "better-auth", "lucia", "passport", "@kinde-oss/kinde-auth-nextjs", "@auth0/nextjs-auth0"]) expect(moneyCheck({ "package.json": pkg({ [d]: "1" }) }).accounts, d).toBe(true);
    expect(moneyCheck({ "lib/auth.ts": `import { getAuth } from "firebase/auth";\n` }).accounts).toBe(true);
    expect(moneyCheck({ "requirements.txt": "flask-login\n" }).accounts).toBe(true);
  });
});

describe("a privacy policy page", () => {
  const pages = ["app/privacy/page.tsx", "src/app/(legal)/privacy-policy/page.tsx", "pages/privacy.tsx", "src/routes/privacy/+page.svelte", "app/routes/privacy.tsx", "public/privacy.html", "content/legal/privacy.md", "app/datenschutz/page.tsx"];
  for (const p of pages) test(p, () => expect(kinds(withClerk({ [p]: "<h1>Privacy</h1>\n" }))).not.toContain("no_privacy_page"));
  test("a footer link, or a hosted policy", () => {
    expect(kinds(withClerk({ "components/Footer.tsx": `export default () => <a href="/legal/privacy">Privacy</a>;\n` }))).not.toContain("no_privacy_page");
    expect(kinds(withClerk({ "components/Footer.tsx": `export default () => <a href="https://app.termly.io/policy-viewer/policy.html?policyUUID=x">Policy</a>;\n` }))).not.toContain("no_privacy_page");
  });
  test("a privacy page that asks people to email to be deleted is a known way to delete, not a finding", () => {
    const r = moneyCheck(withClerk({ "app/privacy/page.tsx": `<p>To delete your data, email us at hello@example.com.</p>\n` }));
    expect(r.deleteByEmail).toBe(true);
    expect(r.findings.map((f) => f.kind)).not.toContain("no_delete_account");
  });
});

describe("trackers and consent", () => {
  const trackers: [string, string, string][] = [
    ["google_analytics", "app/layout.tsx", `<Script src="https://www.googletagmanager.com/gtag/js?id=G-1" />`],
    ["google_analytics", "app/layout.tsx", `import { GoogleAnalytics } from "@next/third-parties/google";`],
    ["meta_pixel", "app/layout.tsx", `fbq("init", "123");`],
    ["posthog", "lib/ph.ts", `import posthog from "posthog-js";`],
    ["mixpanel", "lib/mp.ts", `import mixpanel from "mixpanel-browser";`],
    ["hotjar", "lib/hj.ts", `import Hotjar from "@hotjar/browser";`],
    ["segment", "lib/seg.ts", `import { AnalyticsBrowser } from "@segment/analytics-next";`],
    ["amplitude", "lib/amp.ts", `import * as amplitude from "@amplitude/analytics-browser";`],
    ["clarity", "index.html", `<script src="https://www.clarity.ms/tag/abc"></script>`],
    ["tiktok", "index.html", `<script>ttq.load("X")</script>`],
    ["chat_widget", "index.html", `<script src="https://widget.intercom.io/widget/x"></script>`],
  ];
  for (const [id, file, line] of trackers) test(`${id} in ${file}`, () => {
    const r = moneyCheck({ [file]: `${line}\n` });
    expect(r.findings).toContainEqual({ kind: "tracker_no_consent", file, line: 1, trackers: [id as never] });
  });
  const consents: [string, Record<string, string>][] = [
    ["vanilla-cookieconsent in package.json", { "package.json": pkg({ "vanilla-cookieconsent": "3" }) }],
    ["react-cookie-consent", { "components/Banner.tsx": `import CookieConsent from "react-cookie-consent";\n` }],
    ["Cookiebot", { "app/layout.tsx": `<Script src="https://consent.cookiebot.com/uc.js" />\n` }],
    ["Google Consent Mode", { "app/layout.tsx": `gtag("consent", "default", { analytics_storage: "denied" });\n` }],
    ["PostHog opt out by default", { "lib/ph.ts": `posthog.init(key, { opt_out_capturing_by_default: true });\n` }],
    ["a coded consent check in the tracker's own file", { "components/Analytics.tsx": `export default () => (analyticsConsent && <GoogleAnalytics gaId="G-1" />);\n`, "app/layout.tsx": `if (cookieConsent === "yes") load();\n` }],
  ];
  for (const [name, files] of consents) test(`consent: ${name}`, () => {
    expect(kinds({ "app/layout.tsx": `fbq("init", "1");\n`, ...files, ...(files["app/layout.tsx"] ? { "app/layout.tsx": `fbq("init", "1");\n${files["app/layout.tsx"]}` } : {}) })).not.toContain("tracker_no_consent");
  });
  test("cookieless tools are listed, never flagged", () => {
    const r = moneyCheck({ "package.json": pkg({ "@vercel/analytics": "1" }), "app/layout.tsx": `import { Analytics } from "@vercel/analytics/react";\n<Script data-domain="x" src="https://plausible.io/js/script.js" />\n` });
    expect(r.findings).toEqual([]);
    expect(r.cookieless?.sort()).toEqual(["plausible", "vercel_analytics"]);
  });
  test("PostHog kept in memory only sets no cookies", () => {
    expect(kinds({ "lib/ph.ts": `import posthog from "posthog-js";\nposthog.init(key, { persistence: "memory" });\n` })).toEqual([]);
  });
  test("two trackers in one file are one line naming both", () => {
    expect(moneyCheck({ "app/layout.tsx": `gtag("config", "G-1");\nfbq("init", "1");\n` }).findings).toEqual([{ kind: "tracker_no_consent", file: "app/layout.tsx", line: 1, trackers: ["google_analytics", "meta_pixel"] }]);
  });
  test("a tracker only in a comment is not a tracker", () => {
    expect(kinds({ "app/layout.tsx": `// fbq("init", "1");\n` })).toEqual([]);
  });
});

describe("a way to delete an account", () => {
  const ways: [string, Record<string, string>][] = [
    ["Clerk UserProfile", { "app/account/page.tsx": `import { UserProfile } from "@clerk/nextjs";\nexport default () => <UserProfile />;\n` }],
    ["Supabase admin deleteUser", { "app/api/me/route.ts": `await supabase.auth.admin.deleteUser(id);\n` }],
    ["Firebase deleteUser", { "lib/account.ts": `import { deleteUser } from "firebase/auth";\nawait deleteUser(user);\n` }],
    ["a route named so", { "app/api/delete-account/route.ts": `export async function POST() {}\n` }],
    ["a database delete of the user's row", { "lib/account.ts": `await prisma.user.delete({ where: { id } });\n` }],
    ["SQL", { "lib/account.ts": `await sql\`DELETE FROM users WHERE id = \${id}\`;\n` }],
  ];
  for (const [name, files] of ways) test(name, () => expect(kinds(withClerk({ "app/privacy/page.tsx": "x", ...files }))).toEqual([]));
  test("none found says could not find (the kind is no_delete_account, never a claim there is none)", () => {
    expect(kinds(withClerk({ "app/privacy/page.tsx": "x" }))).toEqual(["no_delete_account"]);
  });
});
