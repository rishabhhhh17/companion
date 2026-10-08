// Rescue: read a stuck project, say what is wrong in plain words, and propose a short finish plan.
export type Diagnosis = { summary: string; works: string[]; broken: string; steps: string[] };
export const MAX_RESCUE_STEPS = 7;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map(clean).filter(Boolean) : []);

// Reads Claude's answer. Anything missing means no diagnosis: nothing is guessed.
export function parseDiagnosis(text: string): Diagnosis | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: any;
  try { j = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  const summary = typeof j?.summary === "string" ? clean(j.summary) : "";
  const broken = typeof j?.broken === "string" ? clean(j.broken) : "";
  const steps = strings(j?.steps).slice(0, MAX_RESCUE_STEPS);
  if (!summary || !broken || steps.length === 0) return null;
  return { summary, works: strings(j?.works), broken, steps };
}

export type Evidence = { label: string; status: string; detail: string };

export const rescuePrompt = (evidence: Evidence[]) => {
  const found = evidence.length
    ? evidence.map((e) => `- ${e.label}: ${e.status}${e.detail ? `. ${e.detail}` : ""}`).join("\n")
    : "- Companion's checks found nothing to run on this project.";
  return `A person is stuck with this project and is not an engineer. Companion ran its own checks on it exactly as it is:

${found}

Look at the project (read only, change nothing) and reply with ONLY a JSON object:
{"summary": "what this project is, in one sentence",
 "works": ["short things that already work"],
 "broken": "the root cause of what is wrong, in at most two sentences of plain words",
 "steps": ["3 to 7 small steps to finish it, in plain words, the first one being what to fix first"]}`;
};
