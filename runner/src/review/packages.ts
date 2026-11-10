// M79 (risky packages, T18): which packages a change added or moved to a new version, read on this Mac from the project's
// own package lists in the two snapshots of a review batch. Only names and exact versions come out of here; nothing of a
// file's text goes anywhere else. A version that is only a range (^1.2.0) with no lock file to say what it resolved to is
// not guessed: it is said as not checked.
import { dirname, posix } from "node:path";

/** OSV's own names for the ecosystems (https://ossf.github.io/osv-schema/, "ecosystem"). */
export type Ecosystem = "npm" | "PyPI" | "Go" | "crates.io";
export type Pkg = { ecosystem: Ecosystem; name: string; version: string; file: string; line?: number };
export const pkgKey = (p: Pick<Pkg, "ecosystem" | "name" | "version">): string => `${p.ecosystem}|${p.ecosystem === "PyPI" ? p.name.toLowerCase() : p.name}|${p.version}`;

const NAMES = ["package.json", "package-lock.json", "npm-shrinkwrap.json", "pyproject.toml", "poetry.lock", "uv.lock", "go.mod", "Cargo.toml", "Cargo.lock"];
/** A package list this check reads: the files the founder named, never anything inside node_modules or vendor folders. */
export function isManifest(path: string): boolean {
  if (/(^|\/)(node_modules|vendor|\.venv|venv|target)\//.test(path)) return false;
  const base = posix.basename(path);
  return NAMES.includes(base) || /^requirements[\w.-]*\.txt$/.test(base);
}
const LOCKS = new Set(["package-lock.json", "npm-shrinkwrap.json", "poetry.lock", "uv.lock", "Cargo.lock"]);
const isLock = (path: string) => LOCKS.has(posix.basename(path));

/** The most packages one review looks up. A whole new lock file can name thousands; past this they are said as not checked. */
export const MAX_PACKAGES = 300;

const NAME_OK = /^[A-Za-z0-9@][A-Za-z0-9@/._+-]{0,213}$/;
const EXACT = /^\d+(\.\d+){0,3}([-+][0-9A-Za-z.+-]+)?$/;
const lineOf = (text: string, needle: string): number | undefined => { const i = text.split("\n").findIndex((l) => l.includes(needle)); return i >= 0 ? i + 1 : undefined; };
const put = (out: Pkg[], p: Pkg) => { if (NAME_OK.test(p.name) && p.version && p.version.length <= 100) out.push(p); };

/** One file's packages: exact versions, and the names whose version is only a range (resolved later by a lock file). */
export type Read = { exact: Pkg[]; ranges: { ecosystem: Ecosystem; name: string; file: string; line?: number }[] };
export function packagesIn(file: string, text: string): Read {
  const base = posix.basename(file);
  const out: Read = { exact: [], ranges: [] };
  try {
    if (base === "package.json") readPackageJson(file, text, out);
    else if (base === "package-lock.json" || base === "npm-shrinkwrap.json") readNpmLock(file, text, out);
    else if (base.startsWith("requirements")) readRequirements(file, text, out);
    else if (base === "pyproject.toml") readPyproject(file, text, out);
    else if (base === "poetry.lock" || base === "uv.lock") readTomlLock(file, text, "PyPI", out);
    else if (base === "Cargo.lock") readTomlLock(file, text, "crates.io", out);
    else if (base === "Cargo.toml") readCargoToml(file, text, out);
    else if (base === "go.mod") readGoMod(file, text, out);
  } catch { /* a file that does not read is simply not checked */ }
  return out;
}

function readPackageJson(file: string, text: string, out: Read) {
  const j = JSON.parse(text) as Record<string, unknown>;
  for (const k of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const deps = j[k];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
    for (const [name, v] of Object.entries(deps as Record<string, unknown>)) {
      if (typeof v !== "string") continue;
      const line = lineOf(text, `"${name}"`);
      const exact = v.trim().replace(/^=/, "").replace(/^v/, "");
      if (EXACT.test(exact)) put(out.exact, { ecosystem: "npm", name, version: exact, file, line });
      else if (!/^(file|link|workspace|git|github|http|https|npm):|\//.test(v.trim())) out.ranges.push({ ecosystem: "npm", name, file, line });
    }
  }
}
function readNpmLock(file: string, text: string, out: Read) {
  const j = JSON.parse(text) as Record<string, any>;
  if (j.packages && typeof j.packages === "object") {
    for (const [path, v] of Object.entries(j.packages as Record<string, any>)) {
      if (!path || !v || typeof v !== "object" || v.link || typeof v.version !== "string") continue;
      const i = path.lastIndexOf("node_modules/");
      if (i < 0) continue;
      put(out.exact, { ecosystem: "npm", name: path.slice(i + "node_modules/".length), version: v.version, file });
    }
    return;
  }
  const walk = (deps: unknown, depth: number) => {
    if (!deps || typeof deps !== "object" || depth > 20) return;
    for (const [name, v] of Object.entries(deps as Record<string, any>)) {
      if (v && typeof v.version === "string" && EXACT.test(v.version)) put(out.exact, { ecosystem: "npm", name, version: v.version, file });
      walk(v?.dependencies, depth + 1);
    }
  };
  walk(j.dependencies, 0);
}
const PY_PIN = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*===?\s*([0-9][^\s;,#"'\\]*)/;
const PY_NAME = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/;
function readRequirements(file: string, text: string, out: Read) {
  text.split("\n").forEach((raw, i) => {
    const l = raw.replace(/#.*/, "").trim();
    if (!l || l.startsWith("-")) return;
    const m = PY_PIN.exec(l);
    if (m) put(out.exact, { ecosystem: "PyPI", name: m[1], version: m[3], file, line: i + 1 });
    else { const n = PY_NAME.exec(l); if (n) out.ranges.push({ ecosystem: "PyPI", name: n[1], file, line: i + 1 }); }
  });
}
function readPyproject(file: string, text: string, out: Read) {
  let section = "";
  text.split("\n").forEach((raw, i) => {
    const l = raw.replace(/\s+#.*$/, "");
    const s = /^\s*\[+([^\]]+)\]+\s*$/.exec(l);
    if (s) { section = s[1].trim(); return; }
    // PEP 621 lists: "name==1.2.3" strings anywhere in the file's dependency lists.
    for (const q of l.matchAll(/["']([^"']+)["']/g)) {
      const m = PY_PIN.exec(q[1]);
      if (m && !/^python$/i.test(m[1])) put(out.exact, { ecosystem: "PyPI", name: m[1], version: m[3], file, line: i + 1 });
    }
    // Poetry: name = "1.2.3" (a bare version is exact in Poetry), or name = { version = "1.2.3" }.
    if (/^tool\.poetry\.(group\.[^.]+\.)?(dev-)?dependencies$/.test(section)) {
      const p = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*(?:\{[^}]*version\s*=\s*)?["']([^"']+)["']/.exec(l);
      if (p && !/^python$/i.test(p[1])) {
        const v = p[2].trim().replace(/^==?/, "");
        if (EXACT.test(v)) put(out.exact, { ecosystem: "PyPI", name: p[1], version: v, file, line: i + 1 });
        else out.ranges.push({ ecosystem: "PyPI", name: p[1], file, line: i + 1 });
      }
    }
  });
}
/** Cargo.lock, poetry.lock and uv.lock: [[package]] blocks with name and version. The project's own crates or packages
 *  (no registry source) are left out. */
function readTomlLock(file: string, text: string, ecosystem: Ecosystem, out: Read) {
  for (const block of text.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const body = block.split(/^\[/m)[0];
    const name = /^name\s*=\s*"([^"]+)"/m.exec(body)?.[1], version = /^version\s*=\s*"([^"]+)"/m.exec(body)?.[1];
    if (!name || !version) continue;
    const source = /^source\s*=\s*(.+)$/m.exec(body)?.[1] ?? "";
    if (ecosystem === "crates.io" && !/registry\+/.test(source)) continue;
    if (/editable|virtual|path\s*=|directory/.test(source)) continue;
    put(out.exact, { ecosystem, name, version, file });
  }
}
function readCargoToml(file: string, text: string, out: Read) {
  let section = "";
  text.split("\n").forEach((raw, i) => {
    const l = raw.replace(/\s+#.*$/, "");
    const s = /^\s*\[+([^\]]+)\]+\s*$/.exec(l);
    if (s) { section = s[1].trim(); return; }
    if (!/(^|\.)(dev-|build-)?dependencies$/.test(section)) return;
    const m = /^\s*([A-Za-z0-9_-]+)\s*=\s*(?:\{[^}]*version\s*=\s*)?"([^"]+)"/.exec(l);
    if (!m) { const n = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(l); if (n) out.ranges.push({ ecosystem: "crates.io", name: n[1], file, line: i + 1 }); return; }
    const v = m[2].trim();
    if (v.startsWith("=") && EXACT.test(v.slice(1).trim())) put(out.exact, { ecosystem: "crates.io", name: m[1], version: v.slice(1).trim(), file, line: i + 1 });
    else out.ranges.push({ ecosystem: "crates.io", name: m[1], file, line: i + 1 });
  });
}
function readGoMod(file: string, text: string, out: Read) {
  let inBlock = false;
  text.split("\n").forEach((raw, i) => {
    const l = raw.replace(/\/\/.*$/, "").trim();
    if (/^require\s*\($/.test(l)) { inBlock = true; return; }
    if (inBlock && l === ")") { inBlock = false; return; }
    const m = inBlock ? /^(\S+)\s+(v\S+)$/.exec(l) : /^require\s+(\S+)\s+(v\S+)$/.exec(l);
    // OSV writes Go versions without the leading v.
    if (m) put(out.exact, { ecosystem: "Go", name: m[1], version: m[2].slice(1).replace(/\+incompatible$/, ""), file, line: i + 1 });
  });
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Every package one snapshot's package lists hold: exact ones, and ranges resolved by a lock file in the same folder. */
function snapshotOf(files: Record<string, string>): { all: Map<string, Pkg>; unresolved: Map<string, Read["ranges"][number]> } {
  const reads = Object.entries(files).filter(([f]) => isManifest(f)).map(([f, t]) => ({ f, r: packagesIn(f, t) }));
  const all = new Map<string, Pkg>();
  // A lock file's versions are what is installed; the list's own exact versions come after, so its line is kept for them.
  for (const { f, r } of reads) if (isLock(f)) for (const p of r.exact) all.set(pkgKey(p), p);
  for (const { f, r } of reads) if (!isLock(f)) for (const p of r.exact) all.set(pkgKey(p), p);
  const lockedNames = new Map<string, Pkg[]>();
  for (const { f, r } of reads) if (isLock(f)) for (const p of r.exact) { const k = `${dirname(f)}|${p.ecosystem}|${p.name.toLowerCase()}`; lockedNames.set(k, [...(lockedNames.get(k) ?? []), p]); }
  const unresolved = new Map<string, Read["ranges"][number]>();
  for (const { f, r } of reads) for (const x of r.ranges) {
    const locked = lockedNames.get(`${dirname(f)}|${x.ecosystem}|${x.name.toLowerCase()}`);
    if (locked?.length) for (const p of locked) all.set(pkgKey(p), { ...p, file: x.file, ...(x.line ? { line: x.line } : {}) });
    else unresolved.set(`${x.ecosystem}|${x.name}`, x);
  }
  return { all, unresolved };
}

/** The packages a change added or moved to a new version (in the after snapshot, not in the before one), at most
 *  MAX_PACKAGES, and how many more there were; plus the newly named packages whose exact version is not known. */
export function changedPackages(before: Record<string, string>, after: Record<string, string>): { pkgs: Pkg[]; more: number; unresolved: string[] } {
  const b = snapshotOf(before), a = snapshotOf(after);
  const fresh = [...a.all.entries()].filter(([k]) => !b.all.has(k)).map(([, p]) => p).sort((x, y) => cmp(x.file, y.file) || cmp(x.name, y.name));
  const unresolved = [...a.unresolved.entries()].filter(([k]) => !b.unresolved.has(k)).map(([, x]) => x.name).sort();
  return { pkgs: fresh.slice(0, MAX_PACKAGES), more: Math.max(0, fresh.length - MAX_PACKAGES), unresolved };
}
