// The folders made for "make me something", listed in Settings (M14): the page side. The shell's own checks (what is listed,
// what is refused, the Trash) are tested in app/src-tauri/src/made.rs against temporary folders and a Trash double; here
// are the rows it sends (the same shared fixture), the words, the question asked first, and that the page can only ever ask
// the shell by a folder's name.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXED_GROUPS } from "./settingsRows.ts";
import { canOpen, canTrash, madeFrom, marks, sizeWords, trashAsk, whenWords, type MadeFolder } from "./made.ts";
import { NAMES, PRODUCT, PRODUCT_S, S } from "./strings.ts";

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
const CASES = read("../../protocol/fixtures/made-list.jsonl").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { name: string; row: MadeFolder });
const row = (o: Partial<MadeFolder> = {}): MadeFolder => ({ name: "Website", madeMs: 1, bytes: 1, rough: false, open: false, working: false, git: false, ...o });
const list = (folders: unknown[], o: Record<string, unknown> = {}) => ({ where: `~/${NAMES.newFolderParent}`, busy: false, folders, more: 0, ...o });

describe("the rows the shell sends, shared with its tests", () => {
  test("every shared row is read as it is", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(5);
    for (const c of CASES) expect(madeFrom(list([c.row]))?.folders, c.name).toEqual([c.row]);
  });
  test("an answer that is not a list is not read, so the page says it could not read it", () => {
    for (const bad of [undefined, null, 5, "x", [], {}, list([{}]), list([row({ name: "" })]), list([{ ...row(), bytes: -1 }]), list([{ ...row(), git: "yes" }]), list([{ ...row(), madeMs: "today" }]), list([row()], { busy: "no" }), list([row()], { more: -1 }), { ...list([row()]), where: 5 }]) expect(madeFrom(bad), JSON.stringify(bad)).toBeNull();
    expect(madeFrom(list([]))).toEqual({ where: `~/${NAMES.newFolderParent}`, busy: false, folders: [], more: 0 });
  });
});

describe("a rough size in plain words", () => {
  test("empty, under a megabyte, megabytes, gigabytes, and a count that stopped early or never ran", () => {
    expect(sizeWords(0, false)).toBe("Empty");
    expect(sizeWords(999_999, false)).toBe("Under 1 MB");
    expect(sizeWords(1_000_000, false)).toBe("About 1 MB");
    expect(sizeWords(12_582_912, false)).toBe("About 13 MB");
    expect(sizeWords(999_000_000, false)).toBe("About 999 MB");
    expect(sizeWords(1_500_000_000, false)).toBe("About 1.5 GB");
    expect(sizeWords(734_003_200, true)).toBe("At least about 734 MB");
    expect(sizeWords(0, true)).toBe("Size not counted");   // audit round 3: a short count that stopped early is not "at least about 1 MB"
    expect(sizeWords(null, true)).toBe("Size not counted");
    expect(sizeWords(null, false)).toBe("Size not counted");
  });
});

describe("when it was made, in plain words", () => {
  const now = new Date(2026, 9, 22, 15, 0).getTime();
  const at = (d: number, h = 9) => new Date(2026, 9, d, h, 0).getTime();
  test("today, yesterday, a few days ago, then the date", () => {
    expect(whenWords(at(22, 8), now)).toBe("Made today");
    expect(whenWords(at(21, 23), now)).toBe("Made yesterday");
    expect(whenWords(at(19), now)).toBe("Made 3 days ago");
    expect(whenWords(at(16), now)).toBe("Made 6 days ago");
    expect(whenWords(at(15), now)).toBe("Made 15 Oct 2026");
    expect(whenWords(new Date(2025, 11, 31, 12).getTime(), now)).toBe("Made 31 Dec 2025");
    expect(whenWords(null, now)).toBe("Date unknown");
    expect(whenWords(at(23), now)).toBe("Made today");   // a clock a little ahead is never "in the future"
  });
});

describe("the marks and what the buttons allow", () => {
  test("open now, working or waiting, git history: in that order, none for a plain folder", () => {
    expect(marks(row())).toEqual([]);
    expect(marks(row({ open: true, working: true, git: true }))).toEqual(["Open now", "Something works or waits here", "Has git history"]);
    expect(marks(row({ git: true }))).toEqual(["Has git history"]);
  });
  test("nothing is opened or moved while something works or waits, and the open project is never moved", () => {
    expect([canOpen(row(), false), canTrash(row(), false)]).toEqual([true, true]);
    expect([canOpen(row(), true), canTrash(row(), true)]).toEqual([false, false]);
    expect([canOpen(row({ open: true }), false), canTrash(row({ open: true }), false)]).toEqual([false, false]);
  });
});

describe("the question asked before a folder goes to the Trash", () => {
  test("it names the folder, says it can be put back, and a folder with git history gets the longer question", () => {
    const plain = trashAsk(row({ name: "Website for my bakery" }));
    expect(plain.question).toContain('"Website for my bakery"');
    expect(plain.question).toContain("put it back from the Trash");
    expect(plain.question).toContain("Delete everything");
    expect(plain.git).toBe(false);
    expect(plain.question).not.toContain("git");
    const git = trashAsk(row({ name: "Page for my band", git: true }));
    expect(git.git).toBe(true);
    expect(git.question).toContain('"Page for my band"');
    expect(git.question).toContain("git history");
    expect(git.question).toContain("put it all back from the Trash");
    expect(git.yes).toContain("git history");
    expect(plain.yes).toBe("Move it to the Trash");
  });
});

describe("the words", () => {
  const all = (): string[] => {
    const m = S.made as Record<string, unknown>;
    const out: string[] = [S.fixedGroups.made.title, ...S.fixedGroups.made.also];
    for (const v of Object.values(m)) out.push(typeof v === "function" ? (v as (...a: never[]) => string)(...([`~/${NAMES.newFolderParent}`, 3, "Website"].slice(0, (v as { length: number }).length) as never[])) : String(v));
    out.push(S.made.size("5 MB", true), S.made.done("Website"), S.made.more(1), S.made.more(2), S.made.sureGit("x"));
    return out;
  };
  test("plain words: no em dash, no doubled space, no code words, and the product's name only from the shared names file", () => {
    for (const t of all()) {
      expect(/[–—]/.test(t), t).toBe(false);
      expect(t.includes("  ") || t !== t.trim(), t).toBe(false);
      expect(/\b(undefined|null|NaN|JSON|symlink)\b/.test(t), t).toBe(false);
    }
    expect(S.fixedGroups.made.title).toBe(`What ${PRODUCT} made`);
    expect(S.made.sure("x")).toContain(`${PRODUCT_S} own folder`);
  });
  test("it can be found by searching Settings", () => {
    expect(FIXED_GROUPS).toContain("made");
    expect(S.fixedGroups.made.also).toEqual(expect.arrayContaining(["new folder", "trash"]));
  });
});

describe("the page asks the shell by a folder's name only", () => {
  const panel = read("./madePanel.tsx"), settings = read("./settingsPage.tsx"), main = read("../src-tauri/src/main.rs");
  test("it is in Settings with the setting that says where new folders go, and waits while anything works", () => {
    expect(settings).toContain('{fixedShown("made") && <Group title={S.fixedGroups.made.title}><MadePanel busy={practiceBusy} project={project} /></Group>}');
    expect(settings.indexOf('fixedShown("made")')).toBeGreaterThan(settings.indexOf('fixedShown("practice")'));
    expect(settings.indexOf('fixedShown("made")')).toBeLessThan(settings.indexOf('fixedShown("kept")'));
  });
  test("the four commands are sent with a name (and the page's own busy and git answer), never a path or a parent folder", () => {
    for (const [cmd, args] of [["list_made", "{ busy }"], ["open_made", "{ name: f.name, busy }"], ["reveal_made", "{ name: f.name }"], ["trash_made", "{ name: f.name, git: trashAsk(f).git, busy }"]]) {
      expect(panel, cmd).toContain(`invoke("${cmd}", ${args})`);
      expect(main, cmd).toMatch(new RegExp(`generate_handler!\\[[^\\]]*\\b${cmd}\\b`));
    }
    expect(panel).not.toMatch(/\bpath\b|\bparent\b/i);
    for (const call of panel.match(/invoke\("[a-z_]+", \{[^}]*\}\)/g) ?? []) expect(call).not.toMatch(/path|parent|folder/i);
  });
  test("Move to the Trash is only ever sent from the Yes of the question, which is a ConfirmStep with a safe choice and a way back", () => {
    const trashCalls = panel.split('invoke("trash_made"').length - 1;
    expect(trashCalls).toBe(1);
    expect(panel).toContain("act.trash(f)");
    const step = panel.slice(panel.indexOf("<ConfirmStep"), panel.indexOf("</ConfirmStep>"));
    expect(step).toContain("back={trashId}");
    expect(step).toContain("onCancel={() => setAsk(false)}");
    expect(step).toContain("data-cancel");
    expect(step).toContain("act.trash(f)");
    expect(panel).toContain("id={trashId}");
    // The only other place a press can start it is the button that opens the question.
    expect(panel).toContain("onClick={() => setAsk(true)}");
    expect(panel.match(/act\.trash\(/g)?.length).toBe(1);
  });
  test("every control names its folder for VoiceOver, and a list the shell could not give is said plainly", () => {
    for (const w of ["S.made.open", "S.made.show", "S.made.trash"]) expect(panel).toContain("aria-label={`${" + w + "}: ${f.name}`}");
    expect(panel).toContain('role="group" aria-label={f.name}');
    expect(panel).toContain("S.made.unreadable");
    expect(panel).toContain("S.made.empty");
  });
  test("the four commands belong to the projects tool, which can never be switched off", () => {
    const g = JSON.parse(read("../../protocol/groups.json")) as { tools: { id: string; group: string; commands: string[] }[] };
    const t = g.tools.find((x) => x.id === "projects")!;
    expect(t.group).toBe("core");
    for (const c of ["list_made", "open_made", "reveal_made", "trash_made"]) expect(t.commands).toContain(c);
  });
});
