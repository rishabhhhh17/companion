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

/** What each step of an off the record Rescue plan is told, since it has no conversation to carry on: what Rescue found. */
export const rescueGoal = (d: Diagnosis): string => Array.from(`get this project working again. ${d.summary} What is wrong: ${d.broken}`).slice(0, 600).join("");

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
 "steps": ["1 to 7 small steps, in plain words, the first one being what to fix first"]}

Steps: only what is broken or missing for this project to work, as few as it takes (one is fine). Each step changes the project. Never a step that only opens or checks the page or the code: Companion checks after every step by itself. No optional extras, no polish, nothing the person did not ask for. If a step needs something only the person has (their photos, text, accounts or keys), make it the last step and say what they need to bring.`;
};
