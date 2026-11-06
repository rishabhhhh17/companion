// M72 (make it work), the engineer's findings 3 to 6 and the rows in the low list: the keyboard comes back to a real button,
// every row and repeated action says its verb and its subject, Start over is offered for a practice under way, History
// flashes the task Now opened, a row with an action keeps its fact, and the link row says whether it is open.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ListRow } from "./ui/parts.tsx";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const row = (p: Record<string, unknown>) => renderToStaticMarkup(createElement("ul", null, createElement(ListRow, { colour: "pink", title: "Uses pnpm", line: "From you", ...p } as never)));

describe("ListRow", () => {
  test("finding 3: the id goes on the row's own button (focus can come back to it); rowId names the row", () => {
    const html = row({ id: "edit-1", rowId: "history-1", onOpen: () => {}, openLabel: "Edit: Uses pnpm" });
    expect(html).toMatch(/<li class="ui-mrow" id="history-1"/);
    expect(html).toMatch(/<button type="button" class="ui-mrow-main" id="edit-1"/);
    // A row with nothing to open keeps the id on the row, as before.
    expect(row({ id: "plain" })).toMatch(/<li class="ui-mrow" id="plain"/);
  });
  test("finding 4: the open button is named by its verb and subject, and the line still describes it", () => {
    const html = row({ onOpen: () => {}, openLabel: "Edit: Uses pnpm" });
    expect(html).toContain('aria-label="Edit: Uses pnpm"');
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    expect(html).not.toContain('title="Edit: Uses pnpm"');
  });
  test("finding 4: a repeated action carries its subject for VoiceOver", () => {
    const html = row({ action: { label: "Forget", ariaLabel: "Forget: Uses pnpm", onClick: () => {} } });
    expect(html).toContain('aria-label="Forget: Uses pnpm"');
  });
  test("low: a row with an action keeps its fact, before the action", () => {
    const html = row({ fact: "2 h ago", action: { label: "Undo", onClick: () => {} } });
    expect(html).toContain("2 h ago");
    expect(html.indexOf("2 h ago")).toBeLessThan(html.indexOf(">Undo<"));
  });
  test("low: expanded says whether what the row opens is open; flash flashes the row once", () => {
    expect(row({ onOpen: () => {}, openLabel: "x", expanded: false })).toContain('aria-expanded="false"');
    expect(row({ onOpen: () => {}, openLabel: "x", expanded: true })).toContain('aria-expanded="true"');
    expect(row({ flash: true })).toContain("data-flash");
    expect(row({ flash: false })).not.toContain("data-flash");
  });
});

describe("the callers", () => {
  const card = read("./card.tsx"), learn = read("./practicePanel.tsx"), first = read("./onboarding.tsx");
  test("Memory: Forget says which note; the row's Edit button gets the keyboard back (its id is on the button)", () => {
    expect(card).toContain("ariaLabel: `${S.memoryForget}: ${l.text}`");
    expect(card).toContain("id={editId(l.id)}");
  });
  test("History: the row keeps its own id for scrolling, flashes when Now opened it (finding 6), and Undo says which task", () => {
    expect(card).toContain("rowId={`history-${h.id}`}");
    expect(card).toContain("flash={focus === h.id}");
    expect(card).toContain("ariaLabel: `${S.historyUndo}: ${task}`");
    expect(card).not.toContain('data-flash={focus === h.id || undefined}');
  });
  test("Now: each row's open button says what it opens", () => {
    expect(card).toContain("openLabel={`${r.act === \"look\" ? S.homeNow.look : S.homeNow.open}: ${r.title}`}");
  });
  test("Learn (finding 5): a practice under way with a copy offers Start over, asked first; Remove says which practice", () => {
    expect(learn).toContain('state === "inProgress" && r.there');
    expect(learn).toContain("ariaLabel: `${S.practiceRemove}: ${r.title}`");
  });
  test("first run: the link row says whether its box is open (aria-expanded)", () => {
    expect(first).toContain("expanded={linkOpen}");
  });
});

describe("History (the walkthrough, item 9, and one list per screen)", () => {
  const card = read("./card.tsx"), marks = read("./savePointsRow.tsx");
  test("the opened row's Star and Name it, and the Undo question, sit right under their row in the list", () => {
    expect(card).toContain('{picked?.id === h.id && h.checkpoint && project && !u && <li className="ui-mrow hist-extra-row"');
    expect(card).toContain('{asking?.id === h.id && h.checkpoint && <li className="ui-mrow hist-extra-row">{undoAsk(h)}</li>}');
    expect(card).toContain("expanded={h.checkpoint && project ? sel === h.id : undefined}");
  });
  test("Star and Name it are real buttons; Star shows a filled star and its words once starred (never a filled button)", () => {
    expect(marks).toContain('label={`${star ? S.fix.unstar : S.fix.star}${subject ? `: ${subject}` : ""}`}');
    expect(marks).toContain('<Icon name={star ? "starFilled" : "star"} size={14} />');
    expect(marks).not.toContain('kind="quiet" onClick={() => onMark({ star: !star })}');
  });
  test("reviews are rows of the one list, not a second list", () => {
    expect((card.match(/<ListGroup label=\{S\.history\./g) ?? []).length).toBe(0);
  });
});

describe("item 10: Forget confirms with a short line and an Undo for a few seconds", () => {
  const card = read("./card.tsx");
  test("the note leaves the list at once, the line says it was forgotten, and Undo keeps it (nothing is sent until the time is up)", () => {
    expect(card).toContain("<Toast text={S.memoryForgotten(pending.text)} action={S.memoryUndo} onAction={() => setPending(null)} onDone={commitForget} ms={FORGET_MS} />");
    expect(card).toContain("lines.filter((l) => l.id !== pending?.id)");
    expect(card).toContain("onClick: () => forgetSoon(l)");
  });
  test("a second Forget, or leaving the page, sends the one waiting first, so nothing is lost or kept by accident", () => {
    expect(card).toContain("useEffect(() => () => { if (waiting.current) void send(forgetLine(project, scope, waiting.current.id)); }, []);");
  });
});
