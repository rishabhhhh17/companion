// The ship report: every safety gate with its status, and one clear answer to "may this go on the internet?".
// A gate that could not run is never a pass. A blocked gate can only be fixed, never confirmed away.
import { fingerprint, scanProject, type Finding } from "./scan.ts";
import { rlsGate, type GateResult } from "./rls.ts";

export type { GateResult } from "./rls.ts";
export type ProofRecord = { verdict: string; unchangedSince: boolean };
export type GateEntry = GateResult & { fingerprints?: string[] };
export type GateReport = { gates: GateEntry[]; canShip: boolean; blockedBy: string[]; needsYou: string[]; confirmed: string[]; allowedCount: number };

const CHECKED = { id: "checked", label: "The work was checked" };

export function proofGate(p: ProofRecord | undefined): GateResult {
  if (!p) return { ...CHECKED, status: "blocked", detail: "This version has not been checked yet. Run the checks first.", overridable: false };
  if (!p.unchangedSince) return { ...CHECKED, status: "blocked", detail: "The project has changed since it was last checked. Check it again before shipping.", overridable: false };
  switch (p.verdict) {
    case "passed": return { ...CHECKED, status: "passed", detail: "The checks passed on this exact version." };
    case "failed": return { ...CHECKED, status: "blocked", detail: "The last check of this version failed. Fix what it found first.", overridable: false };
    case "passed_with_gaps": return { ...CHECKED, status: "could_not_check", detail: "Some checks were skipped (for example the browser check), so this version is not fully checked. Run them again once they can run.", overridable: false };
    case "nothing_to_check": return { ...CHECKED, status: "could_not_check", detail: "There was nothing I could check automatically in this project. If you have looked at it yourself, you can confirm that.", overridable: true };
    default: return { ...CHECKED, status: "blocked", detail: "The last check did not finish. Run it again.", overridable: false };
  }
}

function secretsGate(project: string, allow: Set<string> | undefined, scan: typeof scanProject): { gate: GateEntry; allowed: number } {
  const ID = "secrets", LABEL = "No secrets would be published";
  const all = scan(project);
  const left = allow?.size ? all.findings.filter((f) => !allow.has(fingerprint(f))) : all.findings;
  const allowed = all.findings.length - left.length;
  if (left.length === 0 && all.unreadablePublic) {
    return { allowed, gate: { id: ID, label: LABEL, status: "could_not_check", overridable: true,
      detail: `${all.unreadablePublic} file${all.unreadablePublic === 1 ? "" : "s"} that would be published ${all.unreadablePublic === 1 ? "was" : "were"} too large or could not be read, so I could not look for keys in ${all.unreadablePublic === 1 ? "it" : "them"}. If you know they hold none, you can confirm that yourself.` } };
  }
  if (left.length === 0) {
    const note = all.skipped ? ` ${all.skipped} large or binary file${all.skipped === 1 ? " was" : "s were"} not looked at.` : "";
    return { allowed, gate: { id: ID, label: LABEL, status: "passed", detail: `Looked through ${all.scanned} file${all.scanned === 1 ? "" : "s"} and found no keys or passwords.${note}` } };
  }
  const shown = left.slice(0, 3).map((f: Finding) => f.message);
  const more = left.length > 3 ? ` And ${left.length - 3} more.` : "";
  const anyPublic = left.some((f) => f.public);
  return { allowed, gate: { id: ID, label: LABEL, status: "blocked", overridable: false, findings: left.map((f) => f.message), fingerprints: left.map(fingerprint),
    detail: `${shown.join(" ")}${more}${anyPublic ? "" : ""} ${left[0].advice}` } };
}

export async function runGates(o: {
  project: string; proof?: ProofRecord; confirmed?: string[]; allowSecrets?: Set<string>;
  rlsQuery?: () => Promise<{ table: string; rls: boolean | null }[]>; overrideScan?: typeof scanProject;
}): Promise<GateReport> {
  const gates: GateEntry[] = [proofGate(o.proof)];
  let allowedCount = 0;
  try { const s = secretsGate(o.project, o.allowSecrets, o.overrideScan ?? scanProject); gates.push(s.gate); allowedCount = s.allowed; }
  catch (e) { gates.push({ id: "secrets", label: "No secrets would be published", status: "could_not_check", overridable: false, detail: `I could not look for secrets (${(e as Error).message}), so I cannot say this is safe.` }); }
  try { gates.push(await rlsGate({ project: o.project, query: o.rlsQuery })); }
  catch (e) { gates.push({ id: "database_access", label: "Database access is protected", status: "could_not_check", overridable: false, detail: `I could not check database access (${(e as Error).message}).` }); }

  // You may confirm a gate that could not run (and says it may be confirmed). Nothing else.
  const confirmed: string[] = [];
  for (const g of gates) {
    if (g.status === "could_not_check" && g.overridable && o.confirmed?.includes(g.id)) { g.status = "passed"; g.detail = `${g.detail} You confirmed this yourself.`; confirmed.push(g.id); }
  }
  return {
    gates, confirmed, allowedCount,
    canShip: gates.every((g) => g.status === "passed" || g.status === "not_applicable"),
    blockedBy: gates.filter((g) => g.status === "blocked").map((g) => g.id),
    needsYou: gates.filter((g) => g.status === "could_not_check").map((g) => g.id),
  };
}
