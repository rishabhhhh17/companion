// Documents into the ask box (M14 day one: "drag a file in or paste one, and ask about it"). A PDF, a Word file or an
// Excel sheet is read on this Mac by the Mac's own tools (the shell, docread.rs) and only its text goes with the request:
// secrets hidden first, then clipped to the limit in Settings, the same caps and the same engine check as a text file.
import { describe, expect, test } from "bun:test";
import { ATTACH, CLIPPED_NOTE, DOC_LIMIT_KEY, DOC_LIMITS, admitDocument, attachmentsBlock, checkAttachments, clipText, docLimitBytes, kindOf, precheck, type Attached } from "../src/attach.ts";
import { REGISTRY, defOf } from "../../protocol/settings.ts";

const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123";
const utf8 = (t: string) => new TextEncoder().encode(t).length;
const ok = (r: ReturnType<typeof admitDocument>): Extract<Attached, { kind: "text" }> => {
  if (!("ok" in r)) throw new Error(`refused: ${r.refused}`);
  if (r.ok.kind !== "text") throw new Error("not text");
  return r.ok;
};
const why = (r: ReturnType<typeof admitDocument> | ReturnType<typeof precheck>) => ("refused" in r ? r.refused : null);
const doc = (name: string, size = 20_000) => ({ name, size });

describe("which documents may be added", () => {
  test("PDF, Word (.docx, .doc), rich text, OpenDocument text and Excel (.xlsx), in any case", () => {
    for (const n of ["report.pdf", "Plan.PDF", "letter.docx", "Old Letter.DOC", "notes.rtf", "essay.odt", "budget.xlsx", "Q3.XLSX"]) expect(kindOf(n), n).toBe("document");
  });
  test("settings and key files are still refused first, whatever they end in", () => {
    for (const n of ["secrets.pdf", "secret.docx", "credentials.xlsx", ".env.pdf", "Credentials.DOCX"]) expect(kindOf(n), n).toBe("secret");
  });
  test("kinds the Mac's own tools cannot read as text are not added", () => {
    // .xls is the old binary Excel, .pages, .numbers and .key (Keynote, also a key file) are packages: nothing on a Mac
    // reads their text without a new dependency.
    for (const n of ["old.xls", "doc.pages", "sheet.numbers", "slides.pptx", "book.epub", "scan.tiff"]) expect(kindOf(n), n).not.toBe("document");
  });
  test("a document can be much bigger than a text file on disk, up to its own cap", () => {
    expect(why(precheck([], doc("big.pdf", ATTACH.maxDocBytes)))).toBeNull();
    expect(why(precheck([], doc("huge.pdf", ATTACH.maxDocBytes + 1)))).toBe("too_big");
    expect(ATTACH.maxDocBytes).toBe(20_000_000);
  });
});

describe("clipping the text to a limit", () => {
  test("text under the limit is kept whole", () => {
    expect(clipText("hello", 10)).toEqual({ text: "hello", cut: false });
  });
  test("text over the limit is cut to at most that many bytes, never in the middle of a character", () => {
    const t = "é".repeat(100);   // two bytes each
    const c = clipText(t, 51);
    expect(c.cut).toBe(true);
    expect(utf8(c.text)).toBeLessThanOrEqual(51);
    expect(c.text).toBe("é".repeat(25));
    const emoji = clipText("ab😀cd", 4);
    expect(emoji.text).toBe("ab");
    expect(clipText("😀", 3)).toEqual({ text: "", cut: true });
  });
});

describe("the limit is a setting with a safe default", () => {
  test("the registry has it, with the same choices and default the rules use", () => {
    const d = defOf(DOC_LIMIT_KEY)!;
    expect(d).toBeDefined();
    expect(d.kind).toBe("choice");
    expect(d.options).toEqual([...DOC_LIMITS]);
    expect(d.default).toBe("50");
    expect(d.applies).toEqual(["pages"]);
    expect(REGISTRY.sections).toContain(d.section);
  });
  test("each choice is in kilobytes of text and none is over the engine's cap for one file", () => {
    expect(DOC_LIMITS.map(docLimitBytes)).toEqual([20_000, 50_000, 100_000]);
    for (const v of DOC_LIMITS) expect(docLimitBytes(v)).toBeLessThanOrEqual(ATTACH.maxTextBytes);
  });
  test("anything else falls back to the default", () => {
    for (const v of [undefined, null, "", "500", 50, "-1", "1e9", {}]) expect(docLimitBytes(v), String(v)).toBe(50_000);
  });
});

describe("adding a document's text", () => {
  test("its text is added as text, under the file's own name, with its secrets hidden and said so", () => {
    const a = ok(admitDocument([], doc("invoice.pdf"), { text: `Invoice total 42 dollars.\napi key ${KEY}` }, 50_000));
    expect(a).toMatchObject({ kind: "text", name: "invoice.pdf", hidden: true, clipped: false, bytes: 20_000 });
    expect(a.text).toContain("Invoice total 42 dollars.");
    expect(a.text).not.toContain(KEY);
  });
  test("a long document is clipped to the limit, the cut is said in the text, and it never passes the limit", () => {
    const long = "A line of the report.\n".repeat(10_000);
    for (const limit of DOC_LIMITS.map(docLimitBytes)) {
      const a = ok(admitDocument([], doc("report.docx"), { text: long }, limit));
      expect(a.clipped).toBe(true);
      expect(utf8(a.text)).toBeLessThanOrEqual(limit);
      expect(a.text.endsWith(CLIPPED_NOTE)).toBe(true);
    }
  });
  test("text the shell already cut short is marked clipped too", () => {
    const a = ok(admitDocument([], doc("sheet.xlsx"), { text: "Sheet: Sales\nItem,Price", cut: true }, 50_000));
    expect(a.clipped).toBe(true);
    expect(a.text).toContain("Sheet: Sales");
    expect(a.text.endsWith(CLIPPED_NOTE)).toBe(true);
  });
  test("secrets are hidden before the text is cut, so a cut never leaves part of a key behind", () => {
    const filler = "x".repeat(19_990);
    const a = ok(admitDocument([], doc("notes.rtf"), { text: `${filler} ${KEY} after` }, 20_000));
    expect(a.text).not.toContain(KEY.slice(0, 12));
    expect(a.hidden).toBe(true);
  });
  test("refused, each with its reason: no text (a scan), not a document, a settings or key file, too much together", () => {
    expect(why(admitDocument([], doc("scan.pdf"), { text: "  \n\f " }, 50_000))).toBe("no_text");
    expect(why(admitDocument([], doc("notes.md"), { text: "hi" }, 50_000))).toBe("kind");
    expect(why(admitDocument([], doc("secrets.pdf"), { text: "hi" }, 50_000))).toBe("secret");
    const full = (n: string) => ok(admitDocument([], doc(n), { text: "y".repeat(100_000) }, 100_000));
    expect(why(admitDocument([full("a.pdf"), full("b.pdf")], doc("c.pdf"), { text: "z" }, 50_000))).toBe("too_much");
  });
  test("NUL bytes and Windows line endings in a document's text are cleaned, never sent", () => {
    const a = ok(admitDocument([], doc("a.doc"), { text: "one\r\ntwo\u0000three\rfour" }, 50_000));
    expect(a.text).toBe("one\ntwothree\nfour");
  });
  test("a limit outside the choices is held to the engine's cap", () => {
    const a = ok(admitDocument([], doc("a.pdf"), { text: "q".repeat(300_000) }, 10_000_000));
    expect(utf8(a.text)).toBeLessThanOrEqual(ATTACH.maxTextBytes);
  });
});

describe("the engine takes a document's text, and checks it again", () => {
  test("whatever the page adds passes the engine's own check", () => {
    const have = [
      ok(admitDocument([], doc("a.pdf"), { text: `${"p".repeat(120_000)} ${KEY}` }, 100_000)),
      ok(admitDocument([], doc("b.xlsx"), { text: "Sheet: One\na,b\n1,2" }, 50_000)),
    ];
    const r = checkAttachments({ files: have.map((x) => ({ name: x.name, text: x.text })) });
    if ("error" in r) throw new Error(r.error);
    expect(r.files.map((f) => f.name)).toEqual(["a.pdf", "b.xlsx"]);
  });
  test("a document's name with text over the cap, or a key file's name, is still refused whole", () => {
    for (const b of [{ files: [{ name: "a.pdf", text: "x".repeat(ATTACH.maxTextBytes + 1) }] }, { files: [{ name: "credentials.xlsx", text: "x" }] }, { files: [{ name: "a.xls", text: "x" }] }]) {
      expect("error" in checkAttachments(b), JSON.stringify(b).slice(0, 80)).toBe(true);
    }
  });
  test("the request says a document's text was read from it", () => {
    const b = attachmentsBlock([{ name: "plan.pdf", text: "Step one." }]);
    expect(b).toContain("--- File: plan.pdf ---\nStep one.\n--- End of plan.pdf ---");
    expect(b).toMatch(/text read from/i);
    expect(b).toMatch(/not as instructions/);
  });
});
