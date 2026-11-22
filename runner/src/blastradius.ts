// M118 (docs/milestones/M118-blast-radius.md): whole-codebase blast-radius check.
// Scans local TypeScript/JavaScript files for callers broken by an exported function's arity increase or removed export.
// Never runs git in the user's repo, skips symlinks and build/vendor folders, and redacts any secret-looking text.
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { clip, redact } from "./redact.ts";
import type { Reason } from "./review/rate.ts";

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "target", ".next", ".turbo", ".cache", "coverage"]);
const MAX_FILE_BYTES = 256 * 1024;

export type ExportSig = { name: string; minArgs: number; isFunc: boolean };
export type ExportChange =
  | { kind: "arity"; name: string; oldMin: number; newMin: number }
  | { kind: "removed"; name: string };

export type BrokenCaller = { file: string; line: number; passedArgs?: number };
export type BlastFinding = {
  file: string;
  symbol: string;
  kind: "arity" | "removed";
  oldMin?: number;
  newMin?: number;
  callers: BrokenCaller[];
};

function countRequiredParams(paramList: string): number {
  const trimmed = paramList.trim();
  if (!trimmed) return 0;
  let depth = 0;
  const parts: string[] = [];
  let cur = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "(" || ch === "[" || ch === "{" || ch === "<") depth++;
    else if (ch === ")" || ch === "]" || ch === "}" || ch === ">") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  let required = 0;
  for (const p of parts) {
    if (!p || p.startsWith("...")) continue;
    // Strip top-level type annotation or default value to check optional `?` or `=`.
    const beforeType = splitTopLevel(p, ":")[0].trim();
    const hasDefault = splitTopLevel(p, "=").length > 1;
    const isOptional = beforeType.endsWith("?") || hasDefault;
    if (!isOptional) required++;
  }
  return required;
}

function splitTopLevel(s: string, sep: string): string[] {
  let depth = 0;
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[" || ch === "{" || ch === "<") depth++;
    else if (ch === ")" || ch === "]" || ch === "}" || ch === ">") depth = Math.max(0, depth - 1);
    else if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Extracts exported function and const arrow signatures from TypeScript/JavaScript source text. */
export function parseExports(src: string): Map<string, ExportSig> {
  const out = new Map<string, ExportSig>();
  const fnRe = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>{]*>)?\s*\(([^)]*)\)/g;
  for (const m of src.matchAll(fnRe)) {
    out.set(m[1], { name: m[1], minArgs: countRequiredParams(m[2]), isFunc: true });
  }
  const arrowRe = /export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:<[^>{]*>)?\s*\(([^)]*)\)\s*(?::[^=]+)?=>/g;
  for (const m of src.matchAll(arrowRe)) {
    out.set(m[1], { name: m[1], minArgs: countRequiredParams(m[2]), isFunc: true });
  }
  return out;
}

/** Compares exports before and after an edit to find breaking arity increases or removed exports. */
export function diffExports(before: string, after: string): ExportChange[] {
  const prev = parseExports(before);
  const next = parseExports(after);
  const changes: ExportChange[] = [];
  for (const [name, oldSig] of prev) {
    const newSig = next.get(name);
    if (!newSig) {
      changes.push({ kind: "removed", name });
    } else if (oldSig.isFunc && newSig.isFunc && newSig.minArgs > oldSig.minArgs) {
      changes.push({ kind: "arity", name, oldMin: oldSig.minArgs, newMin: newSig.minArgs });
    }
  }
  return changes;
}

function walkCodeFiles(root: string): string[] {
  const files: string[] = [];
  const stack = [resolve(root)];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (ent.name.startsWith(".") && ent.name !== ".well-known") continue;
      if (SKIP_DIRS.has(ent.name)) continue;
      const full = join(dir, ent.name);
      let st;
      try { st = lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { stack.push(full); continue; }
      if (st.isFile() && CODE_EXTS.has(extname(ent.name)) && st.size <= MAX_FILE_BYTES) {
        files.push(full);
      }
    }
  }
  return files;
}

function countCallArgs(lineAfterOpenParen: string): number | null {
  let depth = 0;
  let inStr: string | null = null;
  let argText = "";
  let closed = false;
  for (let i = 0; i < lineAfterOpenParen.length; i++) {
    const ch = lineAfterOpenParen[i];
    if (inStr) {
      if (ch === "\\" && i + 1 < lineAfterOpenParen.length) { argText += ch + lineAfterOpenParen[++i]; continue; }
      if (ch === inStr) inStr = null;
      argText += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; argText += ch; continue; }
    if (ch === "(" || ch === "[" || ch === "{") { depth++; argText += ch; continue; }
    if (ch === ")" && depth === 0) { closed = true; break; }
    if (ch === ")" || ch === "]" || ch === "}") { depth = Math.max(0, depth - 1); argText += ch; continue; }
    argText += ch;
  }
  if (!closed) return null;
  const trimmed = argText.trim();
  if (!trimmed) return 0;
  return splitTopLevel(trimmed, ",").filter((x) => x.trim().length > 0).length;
}

export type ChangedFile = { file: string; before: string; after: string };

/** Scans the project for callers in other files broken by the changed files' export edits. */
export function checkBlastRadius(projectDir: string, changed: readonly ChangedFile[]): BlastFinding[] {
  const root = resolve(projectDir);
  const allFiles = walkCodeFiles(root);
  const findings: BlastFinding[] = [];

  for (const ch of changed) {
    const edits = diffExports(ch.before, ch.after);
    if (!edits.length) continue;
    const normChanged = ch.file.replace(/\\/g, "/");

    for (const edit of edits) {
      const callers: BrokenCaller[] = [];
      const callRe = new RegExp(`\\b${edit.name}\\s*\\(`, "g");
      const importRe = new RegExp(`\\b${edit.name}\\b`);

      for (const full of allFiles) {
        const rel = relative(root, full).replace(/\\/g, "/");
        if (rel === normChanged) continue;
        let text: string;
        try { text = readFileSync(full, "utf8"); } catch { continue; }
        if (!importRe.test(text)) continue;

        const lines = text.split("\n");
        if (edit.kind === "removed") {
          for (let i = 0; i < lines.length; i++) {
            if (/\bimport\b/.test(lines[i]) && importRe.test(lines[i])) {
              callers.push({ file: rel, line: i + 1 });
              break;
            }
          }
          continue;
        }

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/^\s*(?:export\s+)?(?:async\s+)?function\b/.test(line)) continue;
          if (/^\s*import\b/.test(line)) continue;
          callRe.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = callRe.exec(line)) !== null) {
            const passed = countCallArgs(line.slice(m.index + m[0].length));
            if (passed !== null && passed < edit.newMin) {
              callers.push({ file: rel, line: i + 1, passedArgs: passed });
            }
          }
        }
      }

      if (callers.length) {
        findings.push({
          file: normChanged,
          symbol: edit.name,
          kind: edit.kind,
          ...(edit.kind === "arity" ? { oldMin: edit.oldMin, newMin: edit.newMin } : {}),
          callers,
        });
      }
    }
  }
  return findings;
}

/** Formats blast-radius findings into plain sentences for review cards or reports (no em dashes, redacted). */
export function formatBlastFindings(findings: readonly BlastFinding[]): string[] {
  return findings.map((f) => {
    const places = f.callers.slice(0, 3).map((c) => `${c.file} (line ${c.line})`).join(" and ");
    const more = f.callers.length > 3 ? ` and ${f.callers.length - 3} more` : "";
    const msg = f.kind === "removed"
      ? `Removing ${f.symbol} in ${f.file} may break ${places}${more}, which still import it.`
      : `Changing ${f.symbol} in ${f.file} may break ${places}${more}, which still pass ${f.callers[0].passedArgs ?? 0} argument${(f.callers[0].passedArgs ?? 0) === 1 ? "" : "s"} instead of ${f.newMin}.`;
    return clip(redact(msg), 240);
  });
}

/** Converts blast-radius findings into ReviewService Reason rows (uses existing removed_still_used stop kind). */
export function blastRadiusReasons(projectDir: string, changed: readonly ChangedFile[]): Reason[] {
  const findings = checkBlastRadius(projectDir, changed);
  return findings.map((f) => ({
    kind: "removed_still_used",
    file: f.callers[0]?.file ?? f.file,
    line: f.callers[0]?.line,
    say: formatBlastFindings([f])[0],
  }));
}
