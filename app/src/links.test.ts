import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { webLink } from "./links.ts";
import { initial, reduce, type Model } from "./model.ts";

describe("which links get an Open button", () => {
  test("a plain web address, shown by the real name of its site", () => {
    expect(webLink("https://mug-shop.vercel.app")).toEqual({ url: "https://mug-shop.vercel.app/", host: "mug-shop.vercel.app" });
    expect(webLink("https://Docs.Stripe.com/payments?lang=en#cards")).toEqual({ url: "https://docs.stripe.com/payments?lang=en#cards", host: "docs.stripe.com" });
    expect(webLink("http://localhost:3000/signup")?.host).toBe("localhost");
    // A look alike name from another alphabet shows as its punycode name, the same name the Mac side opens.
    expect(webLink("https://g\u0456thub.com/x")).toEqual({ url: "https://xn--gthub-n2e.com/x", host: "xn--gthub-n2e.com" });
  });
  test("anything else gets no button (the same refusals as the Mac side, share.rs web_link)", () => {
    for (const bad of [
      "", "example.com", "www.example.com", "ftp://example.com/file", "file:///etc/passwd", "javascript:alert(1)",
      "data:text/html,<script>1</script>", "mailto:a@b.c", "x-apple.systempreferences:com.apple.preference.security",
      "vscode://file/etc/passwd", "-a Terminal", "--args https://x.com", "HTTPS://EXAMPLE.COM", "https:example.com",
      "https:/example.com", "https://", "https:// example.com", "https://exa mple.com", "https://example.com/a b",
      "https://example.com\n", "\nhttps://example.com", " https://example.com", "https://example.com\t", "https://a.com\u0000",
      "https://user:pass@example.com", "https://paypal.com@evil.example", "https://user@example.com",
      "https://example.com/\u202emoc.live", "https://\u200bexample.com", "https://example.com/\ufeff",
      `https://example.com/${"a".repeat(2100)}`,
    ]) expect(webLink(bad), JSON.stringify(bad)).toBeNull();
    expect(webLink(undefined)).toBeNull();
    expect(webLink(42 as unknown as string)).toBeNull();
  });
});

describe("a link opens only when the person presses its button", () => {
  test("Home asks the Mac side to open a link in exactly two places, each a button's click", () => {
    const dir = new URL(".", import.meta.url).pathname;
    const pages = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
    const uses = pages.flatMap((f) => readFileSync(join(dir, f), "utf8").split("\n").filter((l) => l.includes('"open_link"')).map((l) => ({ f, l })));
    expect(uses.map((u) => u.f).sort()).toEqual(["card.tsx", "onboarding.tsx"]);
    for (const u of uses) expect(u.l).toMatch(/onClick=\{\(\) => [^}]*invoke\("open_link"/);
    // The first run's Get a key opens Anthropic's own page, a fixed address, never one from a reply.
    expect(uses.find((u) => u.f === "onboarding.tsx")!.l).toContain('invoke("open_link", { url: KEY_PAGE })');
  });
});

describe("a lesson step's page", () => {
  const run = (events: Record<string, unknown>[]) => events.reduce<Model>((x, e) => reduce(x, e as never), initial());
  const step = (over: Record<string, unknown> = {}) => ({ type: "walk.step", walk: "w1", project: "no-project", lesson: "cursor-install", title: "Install Cursor", index: 0, total: 6, variant: "main", say: "Go to cursor.com/download.", find: "the download button", ask: true, ...over });
  const started = { type: "ui.walkRequested", walk: "w1" };
  test("a step that names its page keeps it, so Learn can offer Open", () => {
    expect(run([started, step({ link: "https://cursor.com/download" })]).walk?.link).toBe("https://cursor.com/download");
  });
  test("no page, or anything that is not a plain web address, gives no button", () => {
    expect(run([started, step()]).walk?.link).toBeUndefined();
    for (const link of ["javascript:alert(1)", "file:///etc/passwd", "https://u:p@x.com", 5]) expect(run([started, step({ link })]).walk?.link).toBeUndefined();
  });
  test("Learn shows the Open button for the step's page", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("{m.walk.link && <div className=\"row\"><OpenButton url={m.walk.link} onNote={setLessonNote} /></div>}");
  });
});
