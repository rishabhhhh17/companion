// Files into the ask box: a file dragged onto Home or pasted into the box is read on this Mac, through the same rules the
// engine checks again (runner/src/attach.ts). These tests cover the page's side: which files are read at all, the plain
// line for each one refused, the chips, and what goes with Start.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { ATTACH, CLIPPED_NOTE, DOC_LIMIT_KEY, checkAttachments, toBase64 } from "../../runner/src/attach.ts";
import { addFiles, addedLine, blocksDrop, carriesFiles, chipLabel, forRequest, mergeAdded, pastedFiles, removeFile, shellReader, type DocRead, type FileLike } from "./attachfiles.ts";
import { startTask } from "./commands.ts";
import { S } from "./strings.ts";

const enc = (t: string) => new TextEncoder().encode(t);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123";
// A file as the page gets it from a drop or a paste. read: whether its bytes were asked for.
const file = (name: string, bytes: Uint8Array, type = "", size = bytes.length) => {
  const f = { name, size, type, read: false, arrayBuffer: async () => { f.read = true; return bytes.slice().buffer; } };
  return f;
};
const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");

describe("adding files to the ask box", () => {
  test("a text file becomes a chip; its secrets are hidden and the person is told", async () => {
    const r = await addFiles([], [file("notes.md", enc(`Use the brand blue.\nkey ${KEY}`))]);
    expect(r.have.length).toBe(1);
    expect(r.have[0]).toMatchObject({ kind: "text", name: "notes.md", hidden: true });
    expect(JSON.stringify(r.have)).not.toContain(KEY);
    expect(r.notes).toEqual([S.attachHidden("notes.md")]);
  });
  test("a picture becomes a chip, kept as it is", async () => {
    const r = await addFiles([], [file("button.png", PNG, "image/png")]);
    expect(r.have[0]).toMatchObject({ kind: "image", name: "button.png", mediaType: "image/png" });
    expect(r.notes).toEqual([]);
  });
  test("settings and key files are refused with a plain line, and their bytes are never read", async () => {
    for (const n of [".env", ".env.local", "id_rsa", "server.pem", "credentials.json"]) {
      const f = file(n, enc("SECRET=1"), "text/plain");
      const r = await addFiles([], [f]);
      expect(r.have, n).toEqual([]);
      expect(r.notes, n).toEqual([S.attachRefused.secret(n)]);
      expect(f.read, n).toBe(false);
    }
  });
  test("a file too big, or of a kind that cannot go, is refused before it is read", async () => {
    const big = file("server.log", enc("x"), "text/plain", ATTACH.maxTextBytes + 1);
    const pdf = file("plan.pages", enc("PK"), "application/x-iwork-pages-sffpages");
    const r = await addFiles([], [big, pdf]);
    expect(r.have).toEqual([]);
    expect(r.notes).toEqual([S.attachRefused.too_big("server.log"), S.attachRefused.kind("plan.pages")]);
    expect(big.read || pdf.read).toBe(false);
  });
  test("several at once: the good ones are added, each refused one gets its own line", async () => {
    const r = await addFiles([], [file("a.ts", enc("export const a = 1;")), file(".env", enc("A=1")), file("b.png", enc("not a picture"), "image/png")]);
    expect(r.have.map((a) => a.name)).toEqual(["a.ts"]);
    expect(r.notes).toEqual([S.attachRefused.secret(".env"), S.attachRefused.kind("b.png")]);
  });
  test("a file that cannot be read says so", async () => {
    const f: FileLike = { name: "a.md", size: 3, type: "", arrayBuffer: async () => { throw new Error("gone"); } };
    expect((await addFiles([], [f])).notes).toEqual([S.attachUnreadable("a.md")]);
  });
  test("the caps hold across drops: at most five, at most two pictures", async () => {
    let have = (await addFiles([], ["1", "2", "3", "4", "5"].map((n) => file(`${n}.md`, enc(n))))).have;
    const r = await addFiles(have, [file("6.md", enc("6"))]);
    expect(r.have.length).toBe(5);
    expect(r.notes).toEqual([S.attachRefused.too_many("6.md")]);
    have = (await addFiles([], [file("a.png", PNG), file("b.png", PNG.slice())])).have;
    expect((await addFiles(have, [file("c.png", PNG)])).notes).toEqual([S.attachRefused.too_many_pictures("c.png")]);
  });
  test("the words name the same caps the rules use", () => {
    expect(S.attachRefused.too_big("x")).toContain(`${ATTACH.maxTextBytes / 1000} KB`);
    expect(S.attachRefused.too_big("x")).toContain(`a document up to ${ATTACH.maxDocBytes / 1_000_000} MB`);
    expect(S.attachRefused.too_big("x")).toContain(`${ATTACH.maxImageBytes / 1_000_000} MB`);
    expect(S.attachRefused.too_much("x")).toContain(`${ATTACH.maxTextTotal / 1000} KB`);
    expect(S.attachRefused.too_many("x")).toContain(`up to ${ATTACH.maxFiles} files`);
    expect(S.attachRefused.too_many_pictures("x")).toContain(`up to ${ATTACH.maxImages} pictures`);
  });
  test("every refusal has a plain line that names the file", () => {
    for (const [k, f] of Object.entries(S.attachRefused)) {
      const line = (f as (n: string) => string)("notes.md");
      expect(line, k).toContain("notes.md");
      expect(/[–—]/.test(line), k).toBe(false);
    }
  });
});

describe("documents: a PDF, a Word file or an Excel sheet", () => {
  // The shell reads a document's text with the Mac's own tools (docread.rs); here a stand in plays it, so these tests never
  // run a tool. calls: what the stand in was given.
  const reader = (answers: Record<string, DocRead | (() => never)>) => {
    const calls: { name: string; bytes: number }[] = [];
    const read = async (name: string, bytes: Uint8Array) => { calls.push({ name, bytes: bytes.length }); const a = answers[name]; if (typeof a === "function") a(); return (a as DocRead) ?? { error: "unreadable" }; };
    return { calls, read };
  };
  test("its text, read by the shell, is added as text under the document's name; its secrets hidden and said so", async () => {
    const r0 = reader({ "Invoice.pdf": { text: `Invoice total 42 dollars.\nkey ${KEY}`, cut: false } });
    const f = file("Invoice.pdf", enc("%PDF-1.4 ..."), "application/pdf", 2_000_000);
    const r = await addFiles([], [f], { readDocument: r0.read, docLimitBytes: 50_000 });
    expect(r0.calls).toEqual([{ name: "Invoice.pdf", bytes: 12 }]);
    expect(r.have[0]).toMatchObject({ kind: "text", name: "Invoice.pdf", hidden: true, clipped: false });
    expect(JSON.stringify(r.have)).not.toContain(KEY);
    expect(r.notes).toEqual([S.attachHidden("Invoice.pdf")]);
    expect(forRequest(r.have).files[0].text).toContain("Invoice total 42 dollars.");
  });
  test("a long one is clipped to the limit in Settings, and the person is told only the start goes", async () => {
    const r0 = reader({ "report.docx": { text: "A line of the report.\n".repeat(10_000) } });
    const r = await addFiles([], [file("report.docx", enc("PK"))], { readDocument: r0.read, docLimitBytes: 20_000 });
    const a = r.have[0];
    expect(a.kind === "text" && a.clipped).toBe(true);
    expect(a.kind === "text" && a.text.endsWith(CLIPPED_NOTE)).toBe(true);
    expect(new TextEncoder().encode(a.kind === "text" ? a.text : "").length).toBeLessThanOrEqual(20_000);
    expect(r.notes).toEqual([S.attachClipped("report.docx", 20)]);
    expect(chipLabel(a)).toMatch(/^report\.docx, \d+ KB of text, shortened$/);
  });
  test("settings and key files, documents too big and kinds the Mac cannot read are refused before anything is read", async () => {
    const r0 = reader({});
    const files = [file("credentials.xlsx", enc("PK")), file("secrets.pdf", enc("%PDF")), file("huge.pdf", enc("%PDF"), "", ATTACH.maxDocBytes + 1), file("old.xls", enc("x"))];
    const r = await addFiles([], files, { readDocument: r0.read });
    expect(r.have).toEqual([]);
    expect(r.notes).toEqual([S.attachRefused.secret("credentials.xlsx"), S.attachRefused.secret("secrets.pdf"), S.attachRefused.too_big("huge.pdf"), S.attachRefused.kind("old.xls")]);
    expect(r0.calls).toEqual([]);
    expect(files.some((f) => f.read)).toBe(false);
  });
  test("each reason the shell gives has its own plain line", async () => {
    const r0 = reader({ "locked.pdf": { error: "locked" }, "scan.pdf": { error: "noText" }, "broken.docx": { error: "unreadable" }, "big.xlsx": { error: "tooBig" }, "odd.rtf": { error: "kind" }, "boom.odt": () => { throw new Error("gone"); }, "blank.doc": { text: "  \n " } });
    const names = ["locked.pdf", "scan.pdf", "broken.docx", "big.xlsx", "odd.rtf", "boom.odt", "blank.doc"];
    const r = await addFiles([], names.map((n) => file(n, enc("x"))), { readDocument: r0.read });
    expect(r.have).toEqual([]);
    expect(r.notes).toEqual([S.attachRefused.locked("locked.pdf"), S.attachRefused.no_text("scan.pdf"), S.attachUnreadable("broken.docx"), S.attachRefused.too_big("big.xlsx"), S.attachRefused.kind("odd.rtf"), S.attachUnreadable("boom.odt"), S.attachRefused.no_text("blank.doc")]);
  });
  test("with no shell to read it, a document is not read and says so", async () => {
    const f = file("plan.pdf", enc("%PDF"));
    const r = await addFiles([], [f]);
    expect(r).toEqual({ have: [], notes: [S.attachUnreadable("plan.pdf")] });
    expect(f.read).toBe(false);
  });
  test("the shell is asked with the file's bytes in base64, and only an answer of the right shape is taken", async () => {
    const asked: [string, Record<string, unknown>][] = [];
    const answer = (a: unknown) => shellReader(async (cmd, args) => { asked.push([cmd, args]); return a; });
    const bytes = enc("%PDF-1.4");
    expect(await answer({ text: "hi", cut: true })("a.pdf", bytes)).toEqual({ text: "hi", cut: true });
    expect(asked[0]).toEqual(["read_document", { name: "a.pdf", data: toBase64(bytes) }]);
    expect(await answer({ text: "hi" })("a.pdf", bytes)).toEqual({ text: "hi", cut: false });
    for (const w of ["locked", "noText", "unreadable", "tooBig", "kind"] as const) expect(await answer({ error: w })("a.pdf", bytes)).toEqual({ error: w });
    for (const odd of [null, "text", { text: 5 }, { error: "other" }, { error: 1 }, []]) expect(await answer(odd)("a.pdf", bytes), JSON.stringify(odd)).toEqual({ error: "unreadable" });
    expect(await shellReader(async () => { throw new Error("no shell"); })("a.pdf", bytes)).toEqual({ error: "unreadable" });
  });
  test("Home reads documents through the shell, clipped to the limit the person chose in Settings", () => {
    const add = card.slice(card.indexOf("const addDropped = "), card.indexOf("\n", card.indexOf("const addDropped = ")));
    expect(add).toContain("addFiles(before, list, { readDocument: shellReader(invoke), docLimitBytes: docLimitBytes(setting(DOC_LIMIT_KEY)) })");
    expect(DOC_LIMIT_KEY).toBe("attach.docLimit");
  });
  test("a document dropped twice is added once; it still counts as one of the five", async () => {
    const r0 = reader({ "a.pdf": { text: "one" } });
    const once = await addFiles([], [file("a.pdf", enc("%PDF"))], { readDocument: r0.read });
    const twice = await addFiles(once.have, [file("a.pdf", enc("%PDF"))], { readDocument: r0.read });
    expect(twice.have.length).toBe(1);
    expect(twice.notes).toEqual([S.attachRefused.already("a.pdf")]);
    expect(mergeAdded([], once.have, [])).toHaveLength(1);
  });
});

describe("the box and the engine use one rule", () => {
  // The engine checks what Start sends again, and refuses the whole request if anything is off. So nothing the box adds may
  // fail that check: if it could, the person would see a chip, press Start, and be told no.
  const passes = (have: Awaited<ReturnType<typeof addFiles>>["have"]) => { const r = checkAttachments(forRequest(have)); return "error" in r ? r.error : "passed"; };
  const line = "password=abc12\n";
  const grow = (n: number) => enc(line.repeat(Math.floor(n / line.length)));
  const cases: [string, Uint8Array, string][] = [
    // Text by its type alone, which the engine never sees.
    ["script.pl", enc("print 1;"), "text/x-perl-script"], ["invite.ics", enc("BEGIN:VCALENDAR"), "text/calendar"], ["notes.rtf", enc("{\\rtf1 hi}"), "text/rtf"],
    ["data.ndjson", enc("{}\n{}"), "application/json"], ["Procfile.dev", enc("web: bun dev"), "text/plain"], ["notes", enc("hello"), "text/plain"],
    // Text that grows when its secrets are hidden.
    ["config.log", grow(99_900), "text/plain"], ["a.env.md", grow(50_000), ""],
    // Names the engine cleans again.
    [`${"a".repeat(ATTACH.maxName - 1)} b.md`, enc("x"), ""], [`  ${"é".repeat(ATTACH.maxName)}.ts`, enc("const a = 1"), ""], ["dir/sub/\u202enotes.md", enc("x"), ""],
    // Pictures known by their bytes, whatever they are called or said to be.
    ["clipboard", PNG, "image/png"], ["photo.heic", PNG, "image/png"], ["shot.png", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]), ""], ["notes.md", PNG, "image/png"],
  ];
  test("each file the box adds, on its own, passes the engine's check", async () => {
    for (const [name, bytes, type] of cases) {
      const { have } = await addFiles([], [file(name, bytes, type)]);
      expect(passes(have), `${name} ${type}`).toBe("passed");
    }
  });
  test("and so do the files it adds together, up to every cap", async () => {
    const r = await addFiles([], [file("a.log", grow(65_000)), file("b.log", grow(65_000)), file("c.log", grow(65_000)), file("one.png", PNG), file("two.png", PNG.slice()), file("three.png", PNG)]);
    expect(r.have.length).toBeGreaterThan(1);
    expect(passes(r.have)).toBe("passed");
  });
  test("whatever mix of names, types and sizes is dropped", async () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    const names = ["notes.md", "notes", "a.pl", "b.ics", "c.rtf", "d.ndjson", "Procfile.dev", "App.tsx", "shot.png", "clipboard", "x.jpg", ".env", "id_rsa", "doc.pdf", "sheet.xlsx", "Letter.docx", "credentials.xlsx", " pad .md", `${"z".repeat(119)} q.md`];
    const types = ["", "text/plain", "text/calendar", "application/json", "image/png", "image/jpeg"];
    const bodies = [enc("hello"), grow(30_000), grow(99_900), grow(65_000), PNG, enc("const k = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123';"), new Uint8Array([0xff, 0xfe, 0])];
    for (let round = 0; round < 60; round++) {
      let have: Awaited<ReturnType<typeof addFiles>>["have"] = [];
      for (let drop = 0; drop < 3; drop++) {
        const files = Array.from({ length: 1 + rnd(4) }, () => file(names[rnd(names.length)], bodies[rnd(bodies.length)].slice(), types[rnd(types.length)]));
        // Documents read by a stand in for the shell: long, short, with secrets, empty or refused.
        const readDocument = async (_: string, b: Uint8Array): Promise<DocRead> => [{ text: "word ".repeat(30_000) }, { text: "Sheet: A\na,b", cut: true }, { text: `key ${KEY}` }, { text: " " }, { error: "locked" as const }][b.length % 5];
        have = (await addFiles(have, files, { readDocument, docLimitBytes: [20_000, 50_000, 100_000][rnd(3)] })).have;
      }
      expect(passes(have), `round ${round}: ${have.map((a) => a.name).join(", ")}`).toBe("passed");
    }
  });
});

describe("what a paste carries", () => {
  test("the files in it, or else the file items (a picture copied from a screenshot), or nothing for plain text", () => {
    const a = file("a.md", enc("a")), b = file("image.png", PNG, "image/png");
    expect(pastedFiles({ files: [a], items: [] })).toEqual([a]);
    expect(pastedFiles({ files: [], items: [{ kind: "string", getAsFile: () => null }, { kind: "file", getAsFile: () => b }] })).toEqual([b]);
    expect(pastedFiles({ files: [], items: [{ kind: "string", getAsFile: () => null }] })).toEqual([]);
    expect(pastedFiles({ files: [], items: [{ kind: "file", getAsFile: () => null }] })).toEqual([]);
    expect(pastedFiles(null)).toEqual([]);
  });
  test("text copied from an app that also puts a picture of it on the clipboard (Word, Excel, Keynote) pastes as text", () => {
    const pic = file("image.png", PNG, "image/png");
    const copied = (text: string, files: FileLike[], items: { kind: string; getAsFile(): FileLike | null }[] = []) => ({ files, items, getData: (t: string) => (t === "text/plain" ? text : "") });
    expect(pastedFiles(copied("Q3 sales by region", [pic]))).toEqual([]);
    expect(pastedFiles(copied("Q3 sales by region", [], [{ kind: "file", getAsFile: () => pic }]))).toEqual([]);
    // A text or code file copied in Finder, whose name comes as text too, is still added.
    const md = file("notes.md", enc("a"), "text/markdown");
    expect(pastedFiles(copied("notes.md", [md, pic]))).toEqual([md]);
    // Only spaces is not text: a copied screenshot still comes as a picture.
    expect(pastedFiles(copied("  \n", [], [{ kind: "file", getAsFile: () => pic }]))).toEqual([pic]);
  });
  test("a picture copied in Finder, whose own name is the copied text, is still added", () => {
    const shot = file("Screenshot 2026-10-18.png", PNG, "image/png"), md = file("notes.md", enc("a"), "text/markdown");
    const copied = (text: string, files: FileLike[]) => ({ files, items: [], getData: (t: string) => (t === "text/plain" ? text : "") });
    expect(pastedFiles(copied("Screenshot 2026-10-18.png", [shot]))).toEqual([shot]);
    // Several files copied together: one name per line (Finder may use a carriage return), or a whole path.
    expect(pastedFiles(copied("notes.md\rScreenshot 2026-10-18.png", [md, shot]))).toEqual([md, shot]);
    expect(pastedFiles(copied("/Users/sam/Desktop/Screenshot 2026-10-18.png\n", [shot]))).toEqual([shot]);
    // Words that only hold the picture's name somewhere inside them are still words.
    expect(pastedFiles(copied("See Screenshot 2026-10-18.png for the error", [shot]))).toEqual([]);
  });
});

describe("the chips", () => {
  test("say what each one is, and one can be removed before sending", async () => {
    const { have } = await addFiles([], [file("notes.md", enc("x".repeat(2048))), file("shot.png", PNG)]);
    expect(chipLabel(have[0])).toBe("notes.md, 2 KB");
    expect(chipLabel(have[1])).toBe(`shot.png, ${S.attachPicture}`);
    expect(removeFile(have, 0).map((a) => a.name)).toEqual(["shot.png"]);
    expect(removeFile(have, 5).length).toBe(2);
  });
  test("what was just added is said in one line for VoiceOver, and nothing when nothing was", async () => {
    const { have } = await addFiles([], [file("notes.md", enc("x")), file("shot.png", PNG)]);
    expect(addedLine(have)).toBe(S.attachAdded("notes.md, shot.png"));
    expect(addedLine(have)).toBe("Added notes.md, shot.png.");
    expect(addedLine([])).toBe("");
    // Only the new ones: a second paste says only what it added, and a refused file is said by its own line, not here.
    const more = await addFiles(have, [file("app.js", enc("x")), file(".env", enc("A=1"))]);
    expect(addedLine(more.have.slice(have.length))).toBe(S.attachAdded("app.js"));
    expect(S.attachRemoved("notes.md")).toBe("Removed notes.md.");
  });
});

describe("what goes with Start", () => {
  test("only names, text and pictures: valid protocol the engine checks again", async () => {
    const { have } = await addFiles([], [file("notes.md", enc("Use blue.")), file("shot.png", PNG)]);
    const a = forRequest(have);
    expect(a.files).toEqual([{ name: "notes.md", text: "Use blue." }]);
    expect(a.images.length).toBe(1);
    expect(Object.keys(a.images[0]).sort()).toEqual(["base64", "mediaType", "name"]);
    const c = startTask("/p", "Make it match", false, a) as Record<string, unknown>;
    expect(parseCommand(serialize(c as never)).ok).toBe(true);
    expect(c.files).toEqual(a.files);
    // Nothing added: the command is exactly as before.
    expect("files" in (startTask("/p", "x") as object) || "images" in (startTask("/p", "x") as object)).toBe(false);
    expect("files" in (startTask("/p", "x", false, forRequest([])) as object)).toBe(false);
  });
});

describe("Home takes files only from a drop or a paste the person makes", () => {
  test("a drop anywhere on Home, and a paste into the ask box, go through addFiles", () => {
    expect(card).toMatch(/onDrop=\{[^\n]*addDropped\(/);
    expect(card).toMatch(/onPaste=\{[^\n]*pastedFiles\(e\.clipboardData\)[^\n]*addDropped\(/);
    expect(card).toMatch(/const addDropped = [^\n]*addFiles\(/);
  });
  test("a file dropped anywhere else in the window is never opened in place of Home", () => {
    expect(card).toMatch(/addEventListener\("dragover", [a-zA-Z]+\)/);
    expect(card).toMatch(/addEventListener\("drop", [a-zA-Z]+\)/);
    expect(card).toMatch(/const stopOpen = \(e: DragEvent\) => \{ if \(blocksDrop\(e\.dataTransfer\?\.types, e\.target\)\) e\.preventDefault\(\); \}/);
    // Home's own drop takes files only, so words dragged into the ask box still land there.
    const drop = card.slice(card.indexOf("onDrop={"), card.indexOf("\n", card.indexOf("onDrop={")));
    expect(drop).toMatch(/if \(!carriesFiles\(e\.dataTransfer\?\.types\)\) return; e\.preventDefault\(\)/);
  });
  test("words dragged from another app into the ask box land there; anything dropped anywhere else is stopped", () => {
    const box = { tagName: "TEXTAREA" }, line = { tagName: "DIV" };
    // A file, wherever it is dropped: Home takes it, never the page.
    expect(blocksDrop(["Files"], box)).toBe(true);
    expect(blocksDrop(["text/uri-list", "Files"], line)).toBe(true);
    // Words or a link onto the ask box: the box takes them as typing.
    expect(blocksDrop(["text/plain"], box)).toBe(false);
    expect(blocksDrop(["text/uri-list", "text/plain"], { tagName: "INPUT" })).toBe(false);
    // Anything onto the rest of Home is stopped, so a dropped link can never open a web page in Home's place.
    expect(blocksDrop(["text/uri-list", "text/plain"], line)).toBe(true);
    expect(blocksDrop(["text/plain"], null)).toBe(true);
    expect(blocksDrop(undefined, box)).toBe(false);
    expect(carriesFiles(["text/plain", "Files"])).toBe(true);
    expect(carriesFiles(["text/plain"])).toBe(false);
    expect(carriesFiles(undefined)).toBe(false);
  });
  test("the window lets the page see the dropped file (Tauri's own drop handler is off for Home only)", () => {
    const mk = shell.slice(shell.indexOf("let mk = |label: &str"), shell.indexOf("let dock_w = mk("));
    expect(mk).toContain('if label == "card" { b.disable_drag_drop_handler() } else { b }');
  });
  test("each chip has a Remove button that names the file, and Start sends what is added", () => {
    expect(card).toContain("label={S.attachRemove(a.name)}");   // the Button part names it (aria-label)
    expect(card).toMatch(/const added = forRequest\(attachedNow\.current\);/);
    expect(card).toMatch(/startTask\(project, prompt, off, added\)/);
  });
  test("words from hold to talk are not sent by themselves while files are added: Start is pressed for them", () => {
    expect(card).toMatch(/else if \(autoSend && attachedNow\.current\.length === 0 &&/);
  });
});

// Found in the M11 audit (A66): reading dropped files takes a moment, and the result was the list as it was before the drop
// plus the new files. Files sent with Start in the meantime came back as chips (and went with the next request), a chip
// removed meanwhile came back, and files dropped before a folder change showed in the new folder.
describe("files that finish reading after the box changed", () => {
  test("only the files this drop added join what the box holds now", async () => {
    const before = (await addFiles([], [file("a.md", enc("one"))])).have;
    const r = await addFiles(before, [file("b.md", enc("two")), file("c.md", enc("three"))]);
    // Start sent a.md meanwhile, so the box is empty: b.md and c.md wait for the next Start, a.md does not come back.
    expect(mergeAdded(before, r.have, []).map((a) => a.name)).toEqual(["b.md", "c.md"]);
    // A chip removed meanwhile stays removed.
    expect(mergeAdded(before, r.have, []).some((a) => a.name === "a.md")).toBe(false);
    // Another drop that finished first keeps its files, and nothing is added twice.
    const other = (await addFiles([], [file("d.md", enc("four")), file("b.md", enc("two"))])).have;
    expect(mergeAdded(before, r.have, other).map((a) => a.name)).toEqual(["d.md", "b.md", "c.md"]);
  });
  test("the caps still hold when two drops finish together", async () => {
    const many = (await addFiles([], Array.from({ length: ATTACH.maxFiles }, (_, i) => file(`f${i}.md`, enc(`text ${i}`))))).have;
    const r = await addFiles([], [file("late.md", enc("late"))]);
    expect(mergeAdded([], r.have, many)).toHaveLength(ATTACH.maxFiles);
  });
  test("Home merges a drop into the box as it is when the reading ends, and drops it after a folder change", () => {
    expect(card).toContain("const gen = dropGen.current;");
    expect(card).toContain("if (gen !== dropGen.current) return; const fresh = r.have.slice(before.length); const next = mergeAdded(before, r.have, attachedNow.current);");
    expect(card).toMatch(/useEffect\(\(\) => \{ dropGen\.current \+= 1; clearAttached\(\); sent\.current = null; \}, \[project\]\);/);
  });
});
