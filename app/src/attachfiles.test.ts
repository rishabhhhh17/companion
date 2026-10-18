// Files into the ask box: a file dragged onto Home or pasted into the box is read on this Mac, through the same rules the
// engine checks again (runner/src/attach.ts). These tests cover the page's side: which files are read at all, the plain
// line for each one refused, the chips, and what goes with Start.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { ATTACH, checkAttachments } from "../../runner/src/attach.ts";
import { addFiles, addedLine, blocksDrop, carriesFiles, chipLabel, forRequest, pastedFiles, removeFile, type FileLike } from "./attachfiles.ts";
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
    const pdf = file("plan.pdf", enc("%PDF"), "application/pdf");
    const r = await addFiles([], [big, pdf]);
    expect(r.have).toEqual([]);
    expect(r.notes).toEqual([S.attachRefused.too_big("server.log"), S.attachRefused.kind("plan.pdf")]);
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
    const names = ["notes.md", "notes", "a.pl", "b.ics", "c.rtf", "d.ndjson", "Procfile.dev", "App.tsx", "shot.png", "clipboard", "x.jpg", ".env", "id_rsa", "doc.pdf", " pad .md", `${"z".repeat(119)} q.md`];
    const types = ["", "text/plain", "text/calendar", "application/json", "image/png", "image/jpeg"];
    const bodies = [enc("hello"), grow(30_000), grow(99_900), grow(65_000), PNG, enc("const k = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123';"), new Uint8Array([0xff, 0xfe, 0])];
    for (let round = 0; round < 60; round++) {
      let have: Awaited<ReturnType<typeof addFiles>>["have"] = [];
      for (let drop = 0; drop < 3; drop++) {
        const files = Array.from({ length: 1 + rnd(4) }, () => file(names[rnd(names.length)], bodies[rnd(bodies.length)].slice(), types[rnd(types.length)]));
        have = (await addFiles(have, files)).have;
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
    expect(card).toContain("aria-label={S.attachRemove(a.name)}");
    expect(card).toMatch(/const added = forRequest\(attachedNow\.current\);/);
    expect(card).toMatch(/startTask\(project, prompt, off, added\)/);
  });
  test("words from hold to talk are not sent by themselves while files are added: Start is pressed for them", () => {
    expect(card).toMatch(/else if \(autoSend && attachedNow\.current\.length === 0 &&/);
  });
});
