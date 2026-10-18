// Files into the ask box (wave 4 item 4): which files may go with a request, how they are read and cleaned, and the same
// rules checked again by the engine before anything is sent. The page and the engine use these one set of rules.
import { describe, expect, test } from "bun:test";
import { ATTACH, admit, attachmentsBlock, baseName, checkAttachments, kindOf, pictureType, precheck, textFrom, toBase64, type Attached } from "../src/attach.ts";
import { isEnvFile } from "../src/diagram.ts";
import { isEnvFile as fromRules } from "../src/secretfiles.ts";

const enc = (t: string) => new TextEncoder().encode(t);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123";
const ok = (r: ReturnType<typeof admit>): Attached => { if (!("ok" in r)) throw new Error(`refused: ${r.refused}`); return r.ok; };
const why = (r: ReturnType<typeof admit> | ReturnType<typeof precheck>) => ("refused" in r ? r.refused : null);

describe("which files may be added", () => {
  test("text and code files by their name", () => {
    for (const n of ["notes.md", "App.tsx", "index.js", "main.py", "schema.prisma", "styles.css", "data.json", "config.yaml", "error.log", "README", "Dockerfile", "Makefile", ".gitignore", "query.sql", "script.pl", "events.jsonl", "data.ndjson"]) expect(kindOf(n), n).toBe("text");
  });
  test("a text file is known by its name alone, the one thing the engine is given, never by the type the Mac gives it", () => {
    // The page knows a file's type, the engine does not: a rule that let the type decide would let the page add a file the
    // engine then refuses, and the whole request with it.
    for (const [n, t] of [["something.weird", "text/plain"], ["notes", "text/plain"], ["Procfile.dev", "text/plain"], ["invite.ics", "text/calendar"], ["notes.rtf", "text/rtf"], ["blob", "application/json"]]) {
      expect(kindOf(n, t), `${n} ${t}`).toBe("kind");
      expect(kindOf(n), n).toBe("kind");
    }
  });
  test("PNG and JPEG pictures, by name or type", () => {
    for (const n of ["shot.png", "Photo.JPG", "screen.jpeg"]) expect(kindOf(n), n).toBe("image");
    expect(kindOf("clipboard", "image/png")).toBe("image");
  });
  test("settings and key files are never added, in any spelling, whatever else their name says", () => {
    for (const n of [".env", ".env.local", ".ENV.production", ".env.example", "prod.env", "id_rsa", "id_ed25519", "server.pem", "cert.key", "store.p12", ".npmrc", ".netrc", ".pgpass", "credentials", "credentials.json", "secrets.yaml", "secret.txt", "main.tfvars", "terraform.tfstate"]) {
      expect(kindOf(n), n).toBe("secret");
      expect(kindOf(n, "text/plain"), n).toBe("secret");
    }
  });
  test("anything else is not added (other pictures, documents, programs)", () => {
    for (const n of ["clip.gif", "photo.heic", "doc.pdf", "sheet.xlsx", "app.dmg", "a.zip", "song.mp3", "Untitled"]) expect(kindOf(n), n).toBe("kind");
  });
  test("the engine's settings and key file rule is the same one the files use", () => {
    for (const n of [".env", "x/.env.local", "id_rsa", "a/b/secrets.json", "notes.md"]) expect(fromRules(n)).toBe(isEnvFile(n));
  });
  test("a name is only ever the file's own name: no folders, no hidden characters, not too long", () => {
    expect(baseName("/Users/me/project/src/App.tsx")).toBe("App.tsx");
    expect(baseName("..\\..\\x.md")).toBe("x.md");
    expect(baseName("a\u202egnp.exe")).toBe("agnp.exe");
    expect(baseName("  notes.md  ")).toBe("notes.md");
    expect(Array.from(baseName(`${"é".repeat(300)}.md`)).length).toBeLessThanOrEqual(ATTACH.maxName);
    expect(baseName("")).toBe("");
  });
  test("a name cleaned once stays the same when the engine cleans it again", () => {
    // A long name cut where a space falls must not end in that space: the engine refuses a name its own cleaning changes.
    for (const n of [`${"a".repeat(ATTACH.maxName - 1)} b.md`, `${"é".repeat(ATTACH.maxName - 1)}\u200b b.md`, "  x.md", "a\u202e .md", "dir/ notes.md "]) {
      const once = baseName(n);
      expect(baseName(once), JSON.stringify(n)).toBe(once);
    }
  });
});

describe("reading a file", () => {
  test("text is read as UTF-8, with a leading byte order mark dropped", () => {
    expect(textFrom(enc("hello\nworld"))).toBe("hello\nworld");
    expect(textFrom(new Uint8Array([0xef, 0xbb, 0xbf, ...enc("hi")]))).toBe("hi");
  });
  test("bytes that are not text are refused, never guessed", () => {
    expect(textFrom(new Uint8Array([0xff, 0xfe, 0x00, 0x41]))).toBeNull();
    expect(textFrom(enc("a\u0000b"))).toBeNull();
    expect(textFrom(PNG)).toBeNull();
  });
  test("a picture is known by its first bytes, not by its name", () => {
    expect(pictureType(PNG)).toBe("image/png");
    expect(pictureType(JPEG)).toBe("image/jpeg");
    expect(pictureType(enc("<svg></svg>"))).toBeNull();
    expect(pictureType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
  test("base64 is the standard kind, for any length", () => {
    for (const n of [0, 1, 2, 3, 100, 70_000]) {
      const b = new Uint8Array(n).map((_, i) => (i * 37) % 256);
      expect(toBase64(b)).toBe(Buffer.from(b).toString("base64"));
    }
  });
});

describe("adding a file to the request", () => {
  test("a text file: its secrets hidden, and said so on its chip", () => {
    const a = ok(admit([], { name: "notes.md", size: 40 }, enc(`the key is ${KEY}\npassword=hunter2hunter2`)));
    expect(a.kind).toBe("text");
    if (a.kind !== "text") return;
    expect(a.text).not.toContain(KEY);
    expect(a.text).not.toContain("hunter2hunter2");
    expect(a.hidden).toBe(true);
    const plain = ok(admit([], { name: "a.ts", size: 9 }, enc("const a=1"))) as Extract<Attached, { kind: "text" }>;
    expect(plain.hidden).toBe(false);
    expect(plain.text).toBe("const a=1");
  });
  test("a picture: checked by its bytes, kept as it is", () => {
    const p = ok(admit([], { name: "shot.png", size: PNG.length, type: "image/png" }, PNG));
    expect(p).toMatchObject({ kind: "image", name: "shot.png", mediaType: "image/png", base64: toBase64(PNG) });
    // A file named like a picture that is not one is refused.
    expect(why(admit([], { name: "shot.png", size: 5 }, enc("hello")))).toBe("kind");
  });
  test("refused, each with its reason: settings and key files, other kinds, not text, empty", () => {
    expect(why(admit([], { name: ".env", size: 10 }, enc("A=1")))).toBe("secret");
    expect(why(admit([], { name: "doc.pdf", size: 10 }, enc("%PDF")))).toBe("kind");
    expect(why(admit([], { name: "data.json", size: 4 }, new Uint8Array([0xff, 0xfe, 0, 0])))).toBe("not_text");
    expect(why(admit([], { name: "empty.txt", size: 3 }, enc(" \n ")))).toBe("empty");
  });
  test("caps: a file too big, too much text together, too many files, too many pictures, the same file twice", () => {
    expect(why(precheck([], { name: "big.log", size: ATTACH.maxTextBytes + 1 }))).toBe("too_big");
    expect(why(precheck([], { name: "big.png", size: ATTACH.maxImageBytes + 1 }))).toBe("too_big");
    expect(why(admit([], { name: "liar.md", size: 1 }, new Uint8Array(ATTACH.maxTextBytes + 1).fill(65)))).toBe("too_big");
    const half = (n: string) => ok(admit([], { name: n, size: ATTACH.maxTextBytes }, new Uint8Array(ATTACH.maxTextBytes).fill(65)));
    expect(why(admit([half("a.md"), half("b.md")], { name: "c.md", size: 10 }, enc("0123456789")))).toBe("too_much");
    const small = (n: string) => ok(admit([], { name: n, size: 1 }, enc("x")));
    const five = ["1.md", "2.md", "3.md", "4.md", "5.md"].map(small);
    expect(why(precheck(five, { name: "6.md", size: 1 }))).toBe("too_many");
    const pics = ["a.png", "b.png"].map((n) => ok(admit([], { name: n, size: PNG.length }, PNG)));
    expect(why(precheck(pics, { name: "c.png", size: PNG.length }))).toBe("too_many_pictures");
    expect(why(precheck([small("x.md")], { name: "x.md", size: 1 }))).toBe("already");
  });
});

describe("the caps count the text that goes, after its secrets are hidden", () => {
  // Hiding a short secret makes the text longer ("password=abc12" becomes "password=[secret]"). The engine counts the text
  // it is given, so the page must count that too, or it would add a file the engine then refuses.
  const line = "password=abc12\n";
  const grows = enc(line.repeat(Math.floor(99_900 / line.length)));
  test("a file under the cap that grows past it when its secrets are hidden is refused as too big", () => {
    expect(grows.length).toBeLessThanOrEqual(ATTACH.maxTextBytes);
    expect(why(admit([], { name: "config.log", size: grows.length }, grows))).toBe("too_big");
  });
  test("files that together grow past the total cap are refused as too much", () => {
    // Three of these are under the total cap as they are on disk, and over it once their secrets are hidden.
    const part = enc(line.repeat(Math.floor(65_000 / line.length)));
    expect(part.length * 3).toBeLessThanOrEqual(ATTACH.maxTextTotal);
    const a = ok(admit([], { name: "a.log", size: part.length }, part));
    const b = ok(admit([a], { name: "b.log", size: part.length }, part));
    expect(why(admit([a, b], { name: "c.log", size: part.length }, part))).toBe("too_much");
  });
  test("whatever is added passes the engine's own check", () => {
    const part = enc(line.repeat(Math.floor(65_000 / line.length)));
    const have: Attached[] = [];
    for (const n of ["a.log", "b.log", "c.log", "d.log"]) { const r = admit(have, { name: n, size: part.length }, part); if ("ok" in r) have.push(r.ok); }
    expect(have.length).toBeGreaterThan(0);
    const r = checkAttachments({ files: have.flatMap((x) => (x.kind === "text" ? [{ name: x.name, text: x.text }] : [])) });
    expect("error" in r ? r.error : "passed").toBe("passed");
  });
});

describe("the request the engine is given", () => {
  test("each file's text after the request, named, and said to be information, not instructions", () => {
    const b = attachmentsBlock([{ name: "notes.md", text: "Use blue." }, { name: "App.tsx", text: "export default 1" }]);
    expect(b).toContain("--- File: notes.md ---\nUse blue.\n--- End of notes.md ---");
    expect(b).toContain("--- File: App.tsx ---");
    expect(b).toMatch(/not as instructions/);
    expect(attachmentsBlock([])).toBe("");
  });
});

describe("the engine checks the same rules again", () => {
  test("nothing added is fine", () => expect(checkAttachments({})).toEqual({ files: [], images: [] }));
  test("good files and pictures pass, and text is cleaned again", () => {
    const r = checkAttachments({ files: [{ name: "notes.md", text: `key ${KEY}` }], images: [{ name: "shot.png", mediaType: "image/png", base64: toBase64(PNG) }] });
    if ("error" in r) throw new Error(r.error);
    expect(r.files[0].text).not.toContain(KEY);
    expect(r.images[0]).toEqual({ name: "shot.png", mediaType: "image/png", base64: toBase64(PNG) });
  });
  test("anything off is refused whole, in plain words, so nothing is started", () => {
    const bad: Record<string, unknown>[] = [
      { files: "notes" }, { files: [{ name: ".env", text: "A=1" }] }, { files: [{ name: "src/../../x.md", text: "x" }] },
      { files: [{ name: "doc.pdf", text: "x" }] }, { files: [{ name: "a.md", text: "x".repeat(ATTACH.maxTextBytes + 1) }] },
      { files: [{ name: "a.md", text: "a\u0000b" }] }, { files: [{ name: "a.md" }] },
      { files: Array.from({ length: ATTACH.maxFiles + 1 }, (_, i) => ({ name: `${i}.md`, text: "x" })) },
      { images: [{ name: "a.png", mediaType: "image/gif", base64: toBase64(PNG) }] },
      { images: [{ name: "a.png", mediaType: "image/png", base64: "not base64!" }] },
      { images: [{ name: "a.png", mediaType: "image/png", base64: toBase64(enc("hello there")) }] },
      { images: [{ name: "a.png", mediaType: "image/jpeg", base64: toBase64(PNG) }] },
      { images: [{ name: ".env", mediaType: "image/png", base64: toBase64(PNG) }] },
      { images: Array.from({ length: ATTACH.maxImages + 1 }, (_, i) => ({ name: `${i}.png`, mediaType: "image/png", base64: toBase64(PNG) })) },
      { images: [{ name: "a.png", mediaType: "image/png", base64: "A".repeat(Math.ceil((ATTACH.maxImageBytes + 10) / 3) * 4) }] },
    ];
    for (const b of bad) {
      const r = checkAttachments(b);
      expect("error" in r, JSON.stringify(b).slice(0, 120)).toBe(true);
      if ("error" in r) expect(r.error).toMatch(/nothing was started/i);
    }
  });
});
