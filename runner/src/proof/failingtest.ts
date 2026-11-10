// M77b (the 10 Nov real run, bug 3): a failed check in plain words. The review said "Running the tests did not pass: The
// tests did not pass. failureType: 'testCodeFailure' exitCode: 1 ... 1..3 # tests 3 # suites", which is the test runner's
// own output. The plain line says which check failed, the first failing test's name, and its file and line when they are
// known. The output itself is kept apart, for behind Details. Pure: no files are read here.
import { label, redact } from "../redact.ts";
import type { Problem } from "../../../protocol/index.ts";

const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;
const NAME_MAX = 80;
// The first failing test, by the shape of each runner's report. Node's TAP report prints a test inside a group before the
// group, so the first "not ok" is the deepest one.
const SHAPES: RegExp[] = [
  /^\s*not ok \d+ - (.+?)\s*(?:#.*)?$/m,                       // TAP: Node's test runner (18 and 20), tape, node-tap
  /^\s*✖ (.+?)(?: \(\d+(?:\.\d+)?m?s\))?\s*$/m,                 // Node's spec report (from Node 20)
  /^\s*● (.+?)\s*$/m,                                          // Jest
  /^\s*(?:FAIL|×|✗)\s+\S+\s+>\s+(.+?)(?:\s+\d+m?s)?\s*$/m,      // Vitest: "FAIL  test/x.test.ts > group > name"
  /^\s*\(fail\) (.+?)(?: \[\d+(?:\.\d+)?m?s\])?\s*$/m,          // Bun
  /^FAILED \S+?::(\S+)/m,                                      // pytest's short summary
  /^\s*--- FAIL: (\S+)/m,                                      // Go
];
const NOT_A_NAME = /^(?:test suite failed to run|tests? failed)$/i;

/** The name of the first test that failed in a test runner's output, or null when it cannot be told. A test file that
 *  could not even load is named by its path inside the project ("file" true). */
export function firstFailingTest(output: string, project?: string | readonly string[]): { name: string; file: boolean } | null {
  const text = String(output ?? "").replace(ANSI, "").replace(/\r/g, "");
  for (const shape of SHAPES) {
    const m = shape.exec(text);
    if (!m) continue;
    let name = m[1].trim().replace(/^['"]|['"]$/g, "").replace(/\s+›\s+/g, " > ");
    if (!name || NOT_A_NAME.test(name)) continue;
    const isPath = /^(?:\/|\.{0,2}\/|[\w@.-]+\/)?[^\s]*\.(?:[cm]?[jt]sx?|py|rb|go)$/.test(name);
    if (isPath) {
      const root = (Array.isArray(project) ? project : project ? [project] : []).map((d) => d.replace(/\/+$/, "") + "/").find((d) => name.startsWith(d));
      if (root) name = name.slice(root.length);
      else if (name.startsWith("/")) name = name.split("/").slice(-2).join("/");
    }
    return { name: label(redact(name), NAME_MAX), file: isPath };
  }
  return null;
}

/** One failed step in plain words: which check failed, the first failing test, and where. summary: the step's own plain
 *  sentence ("The tests did not pass."). */
export function plainFailLine(s: { label: string; summary?: string; problem?: Problem; test?: string; testIsFile?: boolean }): string {
  const head = s.summary?.trim() || `${s.label} did not pass.`;
  const at = s.problem?.kind === "line" ? `${s.problem.file}, line ${s.problem.line}` : "";
  if (s.test) {
    if (s.testIsFile) return `${head} The test file ${s.test} could not run${at ? `, because of a problem in ${at}` : ""}.`;
    return `${head} The first test that failed is "${s.test}"${at ? `, at ${at}` : ""}.`;
  }
  return at ? `${head} The problem is at ${at}.` : head;
}
