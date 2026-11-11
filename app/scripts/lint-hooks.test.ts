// M59: the rules of hooks lint catches what broke Home in M76 (a hook behind a condition), says the source line, and passes
// a page that keeps its hooks in order.
import { describe, expect, test } from "bun:test";
import { lintSource } from "./lint-hooks.ts";

describe("the rules of hooks lint", () => {
  test("a hook behind a condition is an error, on its own source line", () => {
    const src = 'import { useState } from "react";\ntype P = { on: boolean };\nexport function Card({ on }: P) {\n  const a = on && useState<number>(0);\n  return <div>{String(a)}</div>;\n}\n';
    const f = lintSource(src, "card.tsx");
    expect(f.length).toBe(1);
    expect(f[0]!.message).toContain("called conditionally");
    expect(f[0]!.line).toBe(4);
  });
  test("a hook in a plain function, a loop or after an early return is an error too", () => {
    expect(lintSource('import { useState } from "react";\nfunction pick() { return useState(0); }\n', "a.ts").length).toBe(1);
    expect(lintSource('import { useEffect } from "react";\nexport function List({ n }: { n: number }) {\n  for (let i = 0; i < n; i++) useEffect(() => {});\n  return null;\n}\n', "b.tsx").length).toBe(1);
    expect(lintSource('import { useRef } from "react";\nexport function Box({ x }: { x?: string }) {\n  if (!x) return null;\n  const r = useRef(null);\n  return <i ref={r} />;\n}\n', "c.tsx").length).toBe(1);
  });
  test("a component and a custom hook that keep their hooks in order pass, and so does a function named use that is not called as one", () => {
    const ok = 'import { useState } from "react";\nexport function useCount() { const [n] = useState(0); return n; }\nexport function Card() {\n  const n = useCount();\n  const openFolder = (p: string) => p;\n  return <b onClick={() => openFolder("x")}>{n}</b>;\n}\n';
    expect(lintSource(ok, "ok.tsx")).toEqual([]);
  });
});
