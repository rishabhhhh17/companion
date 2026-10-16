// pytest's report, read for where a test failed. pytest prints each failure as a section under "FAILURES" (or
// "ERRORS" when a test file could not even be imported). In every traceback style (long, short, line) the deepest frame
// comes last, and the "E" lines say what went wrong. The places are only candidates: locate.ts keeps the first one that
// is a real line in a file the person wrote. Nothing here reads a file.

export type PytestPlace = { path: string; line: number };
export type PytestReport = {
  places: PytestPlace[];                     // deepest first
  tests: { path: string; name: string }[];   // the failing tests from the summary, for when no frame can be used
  message: string | null;
};

const HEADER = /^={3,} (?:FAILURES|ERRORS) ={3,}\s*$/;
const SECTION = /^_{3,} .+? _{3,}\s*$/;
const END = /^(?:={3,}|!{3,})/;
// "tests/test_cart.py:9: AssertionError", "app.py:6: in load_items", "/abs/tests/test_cart.py:9: assert 16 == 15"
const LOCATION = /^([^\s:<>"]+\.py):(\d+):(?: (.*))?$/;
const ELINE = /^E(?:\s+(.*))?$/;
const FILE_LINE = /File "([^"]+)", line (\d+)/;
const SUMMARY = /^(?:FAILED|ERROR) ([^\s:]+\.py)(?:::(\S+?))?(?: - (.+))?\s*$/gm;
const EXCEPTION = /^[A-Za-z_][\w.]*(?:Error|Exception|Exit|Interrupt|Warning|Failed)\b(?::|$)/;
const TYPE_ONLY = /^[A-Za-z_][\w.]*(?:Error|Exception|Exit|Interrupt|Warning|Failed)$/;

/** Is this pytest's report? Its section headers and summary are its own. */
export function isPytest(text: string): boolean {
  return text.split("\n").some((l) => HEADER.test(l)) || (/short test summary info/.test(text) && /^(?:FAILED|ERROR) \S+\.py/m.test(text));
}

export function readPytest(text: string): PytestReport | null {
  if (!isPytest(text)) return null;
  const lines = text.split("\n");
  const places: PytestPlace[] = [];
  let message: string | null = null;

  const start = lines.findIndex((l) => HEADER.test(l));
  if (start >= 0) {
    // The first failure's own section: up to the next failure's header, or the end of the report.
    const body: string[] = [];
    let sections = 0;
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i];
      if (END.test(l)) break;
      if (SECTION.test(l)) { if (++sections > 1) break; continue; }
      body.push(l);
    }
    const found: { path: string; line: number; rest: string }[] = [];
    const eLines: string[] = [];
    for (const l of body) {
      const loc = LOCATION.exec(l);
      if (loc) { found.push({ path: loc[1], line: Number(loc[2]), rest: (loc[3] ?? "").trim() }); continue; }
      const e = ELINE.exec(l);
      if (e) eLines.push((e[1] ?? "").trim());
    }
    // A syntax error names its own place inside the E lines: that is the deepest of all.
    const inError = eLines.map((l) => FILE_LINE.exec(l)).filter((m): m is RegExpExecArray => !!m).map((m) => ({ path: m[1], line: Number(m[2]) }));
    places.push(...inError.reverse(), ...[...found].reverse().map(({ path, line }) => ({ path, line })));

    const said = eLines.filter(Boolean);
    const exception = said.find((l) => EXCEPTION.test(l));
    const last = found.at(-1)?.rest ?? "";
    if (exception) message = exception;
    else if (said.length) message = TYPE_ONLY.test(last) ? `${last}: ${said[0]}` : said[0];
    else if (last && !/^in \S+$/.test(last) && !TYPE_ONLY.test(last)) message = last;   // --tb=line puts the words on the place's own line
    else if (TYPE_ONLY.test(last)) message = last;
  }

  const tests: { path: string; name: string }[] = [];
  for (const m of text.matchAll(SUMMARY)) {
    const name = (m[2] ?? "").split("::").at(-1)?.replace(/\[.*$/, "") ?? "";
    if (name) tests.push({ path: m[1], name });
    if (!message && m[3]) message = m[3].trim();
  }
  return { places, tests, message };
}
