// M69 step 3 (tests first, rule 17): the pointed line's three line excerpt (the YC benchmark spec 3.3). The review card shows
// the line Squibby points at with the line before and after it, so "Squibby is pointing here" points at real code. Every
// line goes through the same masking: a key keeps only its known prefix and "…", never any of its secret part; a value a
// name calls secret is hidden; a private key's lines are hidden whole; a long line is clipped.
import { describe, expect, test } from "bun:test";
import { excerpt, maskLine, EXCERPT_MAX } from "../src/review/excerpt.ts";

const STRIPE = "sk_live_51HabcdefGHIJKLmnopQRSTuvwxYZ0123456789Xq";
const FILE = [
  "import Stripe from \"stripe\";",
  "export async function pay(cart) {",
  `  const key = "${STRIPE}";`,
  "  return stripe(key).charge(cart.total);",
  "}",
].join("\n");

describe("the excerpt: the line before, the pointed line, the line after", () => {
  test("three lines with their numbers, the pointed one in the middle", () => {
    const x = excerpt(FILE, 3)!;
    expect(x.map((l) => l.n)).toEqual([2, 3, 4]);
    expect(x[0].text).toBe("export async function pay(cart) {");
    expect(x[2].text).toBe("  return stripe(key).charge(cart.total);");
  });
  test("at the first and last line, only the lines that exist", () => {
    expect(excerpt(FILE, 1)!.map((l) => l.n)).toEqual([1, 2]);
    expect(excerpt(FILE, 5)!.map((l) => l.n)).toEqual([4, 5]);
  });
  test("a line past the end of the file, or no line, gives nothing (the card shows the file and line only)", () => {
    expect(excerpt(FILE, 9)).toBeUndefined();
    expect(excerpt(FILE, 0)).toBeUndefined();
    expect(excerpt("", 1)).toBeUndefined();
  });
  test("Windows line ends are read as line ends", () => {
    expect(excerpt("a\r\nb\r\nc", 2)!.map((l) => l.text)).toEqual(["a", "b", "c"]);
  });
});

describe("no secret reaches the page", () => {
  test("a Stripe key keeps its known prefix only", () => {
    const x = excerpt(FILE, 3)!;
    expect(x[1].text).toBe("  const key = \"sk_live_…\";");
    for (const l of x) expect(l.text).not.toContain("51Habcdef");
  });
  test("other key shapes: a known prefix and …, or … alone", () => {
    expect(maskLine("token = 'ghp_abcdefghijklmnopqrstuvwxyz0123'")).not.toContain("abcdefghij");
    expect(maskLine("const k = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ'")).toBe("const k = 'sk-…'");
    expect(maskLine("const id = 'AKIAABCDEFGHIJKLMNOP'")).toBe("const id = 'AKIA…'");
    expect(maskLine("url = 'postgres://me:hunter22@db.example.com/x'")).not.toContain("hunter22");
  });
  test("a value a name calls secret is hidden, the name stays", () => {
    const l = maskLine("  DB_PASSWORD=correcthorsebattery");
    expect(l).toContain("DB_PASSWORD");
    expect(l).not.toContain("correcthorse");
  });
  test("a private key is hidden whole, every line of it, beside readable code", () => {
    const pem = ["const a = 1;", "-----BEGIN PRIVATE KEY-----", "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7", "-----END PRIVATE KEY-----"].join("\n");
    const x = excerpt(pem, 3)!;
    expect(x[0].text).toBe("…");
    expect(x[1].text).toBe("…");
    expect(x.map((l) => l.text).join("\n")).not.toContain("MIIEvQ");
  });
  test("a long line is clipped, and the clip never shows the start of a key", () => {
    const long = `const s = "${"x".repeat(300)}";`;
    expect(Array.from(maskLine(long)).length).toBeLessThanOrEqual(EXCERPT_MAX + 1);
    expect(maskLine(`${"a".repeat(EXCERPT_MAX - 4)} sk_live_51HabcdefGHIJKLmnop`)).not.toContain("51H");
  });
  test("ordinary code is left as it is", () => {
    expect(maskLine("  return stripe(key).charge(cart.total);")).toBe("  return stripe(key).charge(cart.total);");
  });
});
