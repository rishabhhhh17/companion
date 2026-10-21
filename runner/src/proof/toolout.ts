// What Go, Rust, Java, Kotlin and Swift tools print when a check fails, read for where and why. Each has its own shape: Go's
// "./main.go:9:2: undefined: x" and its panics, cargo's "error[E0308]" blocks with an arrow to the place (warnings come
// first and are not the problem), Maven's "[ERROR] File.java:[5,17]", javac's and Kotlin's lines, JVM stack frames that
// name only a file and a package, and Swift's compiler, XCTest and Swift Testing lines. The places are only candidates:
// locate.ts keeps the first one that is a real line in a file the person wrote. Nothing here reads a file.

export type ToolPlace = { path: string; line: number; column?: number; message?: string };
export type ToolReport = { places: ToolPlace[]; message: string | null };

const GO_LINE = /^([ \t]*)(?:vet: )?((?:\.{1,2}\/)?[\w.\/@+-]+\.(?:go|mod|work|sum)):(\d+)(?::(\d+))?:? (\S.*)$/;
const GO_FRAME = /^\t(\/\S+\.go):(\d+)(?: \+0x[0-9a-f]+)?$/;
const GO_PANIC = /^panic: (.+?)(?: \[recovered\])?$/;
const RUST_HEAD = /^(error|warning)(?:\[[A-Z]\d+\])?: (.+)$/;
const RUST_ARROW = /^\s*--> (\S+\.rs):(\d+):(\d+)\s*$/;
const RUST_PANIC_NEW = /^thread '.*?'(?: \(\d+\))? panicked at (\S+\.rs):(\d+):(\d+):?$/;
const RUST_PANIC_OLD = /^thread '.*?'(?: \(\d+\))? panicked at '(.*)', (\S+\.rs):(\d+):(\d+)$/;
const MAVEN = /^\[ERROR\] (.+?\.(?:java|kt|scala|groovy)):\[(\d+),(\d+)\] (.+)$/;
const JAVAC = /^(.+?\.java):(\d+): error: (.+)$/;
const KOTLIN_NEW = /^e: (?:file:\/\/)?(.+?\.kts?):(\d+):(\d+) (.+)$/;
const KOTLIN_OLD = /^e: (.+?\.kts?): \((\d+), (\d+)\): (.+)$/;
const SYMBOL = /^\s*(?:\[ERROR\]\s+)?symbol:\s+(\S.*?)\s*$/;
const FRAME = /\bat\s+(?:[\w.]+\/{1,2})?((?:[\w$]+\.)*[\w$]+)\.[\w$<>]+\(([\w$-]+\.(?:java|kt|scala|groovy)):(\d+)\)/;
const EXCEPTION = /^(?:Exception in thread "[^"]*" |Caused by: |\[ERROR\] )?((?:[a-z_][\w]*\.)+[A-Z][\w$]*(?:Error|Exception|Failure|Throwable))(?::\s*(.*))?$/;
const SWIFT_A = /^(.+?\.swift):(\d+):(?:(\d+):)? (?:fatal )?error: (.+)$/;
const SWIFT_B = /^error: (.+?\.swift):(\d+):(\d+) (\S.*)$/;
const SWIFT_ISSUE = /recorded an issue(?: with [^@]*?)? at (.+?\.swift):(\d+):(\d+): (.+)$/;
const SWIFT_FATAL = /Fatal error: (.+?): file (.+?\.swift), line (\d+)/;

const ASSERTION = /(?:AssertionFailedError|AssertionError|ComparisonFailure|MultipleFailuresError)$/;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** The "Name: words" of a Java or Kotlin exception line; an assertion failure is just its words. */
function exceptionWords(klass: string, words: string | undefined): string {
  const simple = klass.slice(klass.lastIndexOf(".") + 1);
  const w = clean(words ?? "");
  if (ASSERTION.test(simple)) return w || "assertion failed";
  return w ? `${simple}: ${w}` : simple;
}

/** XCTest's "-[shopTests.CartTests testTotal] : XCTAssertEqual failed: ..." (macOS) or "CartTests.testTotal : ..." (Linux). */
const xcTest = (s: string) => s.replace(/^-\[[^\]]*\]\s*:\s*/, "").replace(/^[\w.]+\s+:\s+(?=XCT)/, "");

export function readToolOutput(text: string): ToolReport | null {
  const lines = text.split("\n");
  const places: ToolPlace[] = [];
  let sawFail = false;                 // Go: "--- FAIL:" opens the lines that name a test's own check
  let lastPanic: string | null = null; // Go: the panic's words, for the first frame that follows
  let lastException: string | null = null; // JVM: the exception line above a stack frame
  let headed: { level: string; msg: string; done: boolean } | null = null;   // Rust: the error or warning block being read

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    // ---- Go
    if (/^\s*--- FAIL:/.test(l)) sawFail = true;
    const gf = GO_FRAME.exec(l);
    if (gf) { places.push({ path: gf[1], line: Number(gf[2]), ...(lastPanic ? { message: lastPanic } : {}) }); continue; }
    const g = GO_LINE.exec(l);
    if (g && (g[1] === "" || sawFail)) {
      places.push({ path: g[2], line: Number(g[3]), ...(g[4] ? { column: Number(g[4]) } : {}), message: clean(g[5]) });
      continue;
    }
    const gp = GO_PANIC.exec(l);
    if (gp && lastPanic === null) { lastPanic = clean(gp[1]); continue; }

    // ---- Rust
    const rh = RUST_HEAD.exec(l);
    if (rh) headed = { level: rh[1], msg: clean(rh[2]), done: false };
    const ra = RUST_ARROW.exec(l);
    if (ra) {
      if (headed && headed.level === "error" && !headed.done) {
        places.push({ path: ra[1], line: Number(ra[2]), column: Number(ra[3]), message: headed.msg });
        headed.done = true;
      }
      continue;
    }
    if (headed && l.trim() === "") headed = null;
    const rpo = RUST_PANIC_OLD.exec(l);
    if (rpo) { places.push({ path: rpo[2], line: Number(rpo[3]), column: Number(rpo[4]), message: clean(rpo[1]) }); continue; }
    const rpn = RUST_PANIC_NEW.exec(l);
    if (rpn) {
      // The words are on the lines under it, up to a blank line or a note. An assert_eq adds the two values.
      const body: string[] = [];
      for (let j = i + 1; j < lines.length && lines[j].trim() !== "" && !/^note:/.test(lines[j]); j++) body.push(lines[j]);
      const left = body.map((b) => /^\s*left: (.*)$/.exec(b)?.[1]).find((x) => x !== undefined);
      const right = body.map((b) => /^\s*right: (.*)$/.exec(b)?.[1]).find((x) => x !== undefined);
      const first = clean(body[0] ?? "");
      places.push({ path: rpn[1], line: Number(rpn[2]), column: Number(rpn[3]), ...(first ? { message: left !== undefined && right !== undefined ? `${first} (left: ${clean(left)}, right: ${clean(right)})` : first } : {}) });
      continue;
    }

    // ---- Java and Kotlin
    const mv = MAVEN.exec(l);
    if (mv) { places.push({ path: mv[1], line: Number(mv[2]), column: Number(mv[3]), message: withSymbol(clean(mv[4]), lines, i) }); continue; }
    const jc = JAVAC.exec(l);
    if (jc) { places.push({ path: jc[1], line: Number(jc[2]), message: withSymbol(clean(jc[3]), lines, i) }); continue; }
    const kn = KOTLIN_NEW.exec(l) ?? KOTLIN_OLD.exec(l);
    if (kn) { places.push({ path: kn[1], line: Number(kn[2]), column: Number(kn[3]), message: clean(kn[4]) }); continue; }
    const ex = EXCEPTION.exec(l.trim());
    if (ex) { lastException = exceptionWords(ex[1], ex[2]); continue; }
    const fr = FRAME.exec(l);
    if (fr) {
      const pkg = fr[1].includes(".") ? fr[1].slice(0, fr[1].lastIndexOf(".")).replace(/\./g, "/") : "";
      places.push({ path: pkg ? `${pkg}/${fr[2]}` : fr[2], line: Number(fr[3]), ...(lastException ? { message: lastException } : {}) });
      continue;
    }

    // ---- Swift
    const si = SWIFT_ISSUE.exec(l);
    if (si) { places.push({ path: si[1], line: Number(si[2]), column: Number(si[3]), message: clean(si[4]) }); continue; }
    const sb = SWIFT_B.exec(l);
    if (sb) { places.push({ path: sb[1], line: Number(sb[2]), column: Number(sb[3]), message: clean(sb[4]) }); continue; }
    const sa = SWIFT_A.exec(l);
    if (sa) { places.push({ path: sa[1], line: Number(sa[2]), ...(sa[3] ? { column: Number(sa[3]) } : {}), message: clean(xcTest(sa[4])) }); continue; }
    const sf = SWIFT_FATAL.exec(l);
    if (sf) { places.push({ path: sf[2], line: Number(sf[3]), message: clean(sf[1]) }); continue; }
  }

  // Words alone (an exception line, a panic line) are not enough to say this is one of these tools' output: a place is.
  if (!places.length) return null;
  return { places, message: places.find((p) => p.message)?.message ?? null };
}

// javac and Maven say what it could not find on the lines under the error.
function withSymbol(headline: string, lines: string[], at: number): string {
  for (let j = at + 1; j < Math.min(lines.length, at + 6); j++) {
    const m = SYMBOL.exec(lines[j]);
    if (m) return `${headline}: ${clean(m[1])}`;
    if (JAVAC.test(lines[j]) || MAVEN.test(lines[j])) break;
  }
  return headline;
}
