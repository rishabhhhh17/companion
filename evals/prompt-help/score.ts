// Scores one rewrite against what a good rewrite must keep and mention. Plain checks, no model involved,
// so the same scorer can judge fixtures offline or a real run.
export type Case = { id: string; target: string; rough: string; keep?: string[]; mention?: string[][]; maxGrowth?: number };
export type Score = { pass: boolean; problems: string[] };

export function score(c: Case, output: string): Score {
  const problems: string[] = [];
  const text = output.trim();
  if (!text) problems.push("Nothing came back.");
  for (const k of c.keep ?? []) if (!output.includes(k)) problems.push(`This had to stay exactly as written but did not: ${k.split("\n")[0].slice(0, 60)}`);
  const lower = output.toLowerCase();
  for (const group of c.mention ?? []) if (!group.some((w) => lower.includes(w.toLowerCase()))) problems.push(`It should mention one of: ${group.join(", ")}`);
  const growth = c.maxGrowth ?? 8;
  if (c.rough.length > 0 && text.length > Math.max(c.rough.length * growth, 400)) problems.push("It is much longer than it needs to be.");
  if (/^\s*(sure|certainly|here(?:'s| is)|of course)\b/i.test(text)) problems.push("It starts with chatter instead of the prompt.");
  if (/\[\[KEEP_\d+\]\]/.test(output)) problems.push("A marker was left in the text.");
  return { pass: problems.length === 0, problems };
}

export function summarize(cases: Case[], outputs: Record<string, string>) {
  const rows = cases.map((c) => ({ id: c.id, ...score(c, outputs[c.id] ?? "") }));
  const passed = rows.filter((r) => r.pass).length;
  return { rows, passed, total: rows.length, rate: rows.length ? passed / rows.length : 0 };
}
