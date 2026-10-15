#!/usr/bin/env python3
"""Writes app/ACKNOWLEDGEMENTS.txt: the licence notices for everything Companion is built from and ships.

MIT, Apache and BSD licences require their notice to travel with the program. This reads every Rust crate in
app/src-tauri/Cargo.lock and every production JavaScript package the app and the engine ship, finds each one's licence
text on this Mac, and groups identical texts. Run it again whenever a dependency changes (a test fails if it is stale):
    python3 scripts/make-acknowledgements.py
"""
import glob, hashlib, json, os, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = dict(os.environ, PATH=os.path.expanduser("~/Library/Python/3.9/bin") + ":" + os.environ.get("PATH", ""))
NAMES = ("LICENSE", "LICENCE", "COPYING", "NOTICE", "UNLICENSE")

def license_files(d):
    out = []
    for f in sorted(os.listdir(d)):
        if f.upper().split(".")[0].replace("-", "_").startswith(NAMES) and os.path.isfile(os.path.join(d, f)):
            out.append(os.path.join(d, f))
    return out

def read(p):
    try: return open(p, encoding="utf-8", errors="replace").read().strip()
    except OSError: return ""

entries = []   # (kind, name, version, spdx, text)
# --- Rust crates that are actually compiled for macOS
meta = json.loads(subprocess.check_output(["cargo", "metadata", "--format-version", "1", "--locked", "--filter-platform", "aarch64-apple-darwin"], cwd=os.path.join(ROOT, "app/src-tauri"), env=ENV, stderr=subprocess.DEVNULL))
used = {n["id"] for n in meta["resolve"]["nodes"]}
for p in meta["packages"]:
    if p["id"] not in used or p["source"] is None: continue
    d = os.path.dirname(p["manifest_path"])
    text = "\n\n".join(read(f) for f in license_files(d))
    entries.append(("Rust", p["name"], p["version"], p.get("license") or "see the crate", text))
# --- JavaScript packages shipped (production dependencies and what they pull in)
def js(dirname):
    base = os.path.join(ROOT, dirname, "node_modules")
    pk = json.load(open(os.path.join(ROOT, dirname, "package.json")))
    seen, todo = set(), list((pk.get("dependencies") or {}).keys())
    while todo:
        n = todo.pop()
        if n in seen: continue
        seen.add(n)
        pj = os.path.join(base, n, "package.json")
        if not os.path.exists(pj): continue
        j = json.load(open(pj))
        todo += list((j.get("dependencies") or {}).keys())
        todo += list((j.get("optionalDependencies") or {}).keys())
    for n in sorted(seen):
        d = os.path.join(base, n)
        if not os.path.exists(os.path.join(d, "package.json")): continue
        j = json.load(open(os.path.join(d, "package.json")))
        lic = j.get("license") if isinstance(j.get("license"), str) else json.dumps(j.get("license") or j.get("licenses") or "see the package")
        entries.append(("JavaScript", n, j.get("version", "?"), lic, "\n\n".join(read(f) for f in license_files(d))))
js("runner"); js("app")

MIT_TEXT = """MIT License

Copyright (c) the authors of {name}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE."""
# A crate that ships no licence file is under the licence it declares; where that offers MIT, the standard MIT text is used.
for i, (kind, name, ver, spdx, text) in enumerate(entries):
    if not text and "MIT" in spdx.upper().replace("-", " ").split("/")[0].split(" OR ")[0:3].__str__().upper() or (not text and " MIT" in " " + spdx):
        entries[i] = (kind, name, ver, spdx, MIT_TEXT.format(name=name))

groups = {}
for kind, name, ver, spdx, text in entries:
    key = hashlib.sha256((text or spdx).encode()).hexdigest()
    groups.setdefault(key, {"text": text, "spdx": spdx, "pkgs": []})["pkgs"].append(f"{name} {ver} ({kind})")

HEAD = f"""ACKNOWLEDGEMENTS

Companion is built from the open source software below, and ships a small number of programs from others. Each is used
under its own licence, reproduced here as those licences ask. Companion's own code is not covered by these notices.

SHIPPED WITH COMPANION
- Claude Code (Anthropic's program, run unmodified): (c) Anthropic PBC. All rights reserved. Used under Anthropic's
  Commercial Terms of Service and legal agreements: https://code.claude.com/docs/en/legal-and-compliance
- Bun (the JavaScript runtime that runs Companion's engine): MIT licence. https://bun.sh
- Whisper speech model "ggml-base" (downloaded on first use of hold to talk, runs on this Mac): MIT licence,
  OpenAI Whisper and whisper.cpp by Georgi Gerganov. https://github.com/ggerganov/whisper.cpp
- The idea of pointing through the Computer Use tool, and of looking at other displays, was prompted by Clicky
  (https://github.com/farzaa/clicky, MIT licence, Copyright (c) 2026 Farza). No Clicky code is included.

{len(entries)} LIBRARIES, GROUPED BY LICENCE TEXT ({len(groups)} groups)
"""
out = [HEAD]
for i, g in enumerate(sorted(groups.values(), key=lambda g: (-len(g["pkgs"]), g["spdx"], sorted(g["pkgs"])[0])), 1):
    out.append("=" * 100)
    out.append(f"Licence group {i}: {g['spdx']}")
    out.append("Used by: " + "; ".join(sorted(g["pkgs"])))
    out.append("-" * 100)
    out.append(g["text"] or f"(these packages declare the licence {g['spdx']} and ship no separate text in their download; the text is on each project's page, for a Rust crate at https://crates.io/crates/<name>)")
    out.append("")
path = os.path.join(ROOT, "app", "ACKNOWLEDGEMENTS.txt")
text = "\n".join(out)
if "--check" in sys.argv:
    # The suite runs this: a dependency was added or changed but the notices were not regenerated.
    if not os.path.exists(path) or open(path, encoding="utf-8").read() != text:
        sys.exit("app/ACKNOWLEDGEMENTS.txt is out of date: run  python3 scripts/make-acknowledgements.py  and commit it")
    print(f"acknowledgements up to date ({len(entries)} libraries)")
else:
    open(path, "w", encoding="utf-8").write(text)
    print(f"{len(entries)} libraries, {len(groups)} licence groups, {os.path.getsize(path)//1024} KB -> {path}")
