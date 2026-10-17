// Files into the ask box: a file dragged onto Home or pasted into the box is read on this Mac, through the same rules the
// engine checks again (runner/src/attach.ts). These tests cover the page's side: which files are read at all, the plain
// line for each one refused, the chips, and what goes with Start.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { ATTACH } from "../../runner/src/attach.ts";
import { addFiles, blocksDrop, carriesFiles, chipLabel, forRequest, pastedFiles, removeFile, type FileLike } from "./attachfiles.ts";
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
});

describe("the chips", () => {
  test("say what each one is, and one can be removed before sending", async () => {
    const { have } = await addFiles([], [file("notes.md", enc("x".repeat(2048))), file("shot.png", PNG)]);
    expect(chipLabel(have[0])).toBe("notes.md, 2 KB");
    expect(chipLabel(have[1])).toBe(`shot.png, ${S.attachPicture}`);
    expect(removeFile(have, 0).map((a) => a.name)).toEqual(["shot.png"]);
    expect(removeFile(have, 5).length).toBe(2);
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
    expect(card).toMatch(/startTask\(project, prompt, off, forRequest\(attached\)\)/);
  });
  test("words from hold to talk are not sent by themselves while files are added: Start is pressed for them", () => {
    expect(card).toMatch(/else if \(autoSend && attachedNow\.current\.length === 0 &&/);
  });
});
