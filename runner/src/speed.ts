// M110 (docs/milestones/M110-daily-feel.md): speed budgets for a daily Mac app.
// Pure budget definitions, evaluation and plain report formatting; scripts/m110-speed.sh measures the real numbers on this Mac.

export type SpeedSample = {
  launchToNotchMs: number;
  hoverToSmallMs: number;
  clickToOpenMs: number;
  askKeyToTypingMs: number;
  doneToNotchMs: number;
  idleCpuPct: number;
  idleRssMb: number;
};

export type SpeedKey = keyof SpeedSample;

export const SPEED_BUDGETS: Readonly<Record<SpeedKey, number>> = {
  launchToNotchMs: 500,
  hoverToSmallMs: 100,
  clickToOpenMs: 200,
  askKeyToTypingMs: 100,
  doneToNotchMs: 500,
  idleCpuPct: 5,
  idleRssMb: 180,
};

const META: ReadonlyArray<{ key: SpeedKey; label: string; unit: string }> = [
  { key: "launchToNotchMs", label: "Launch to notch ready", unit: "ms" },
  { key: "hoverToSmallMs", label: "Hover to small notch shown", unit: "ms" },
  { key: "clickToOpenMs", label: "Click to notch opened", unit: "ms" },
  { key: "askKeyToTypingMs", label: "Ask box key to typing", unit: "ms" },
  { key: "doneToNotchMs", label: "Tool saying done to notch lighting", unit: "ms" },
  { key: "idleCpuPct", label: "Idle processor (nothing happening)", unit: "%" },
  { key: "idleRssMb", label: "Idle memory (nothing happening)", unit: "MB" },
];

export type SpeedRow = {
  key: SpeedKey;
  label: string;
  unit: string;
  value: number;
  budget: number;
  ok: boolean;
};

export type SpeedResult = {
  ok: boolean;
  rows: SpeedRow[];
  over: SpeedRow[];
};

/** Evaluates a measured sample against SPEED_BUDGETS. Any non-finite or negative value fails. */
export function evaluateSpeed(sample: SpeedSample, budgets: Readonly<Record<SpeedKey, number>> = SPEED_BUDGETS): SpeedResult {
  const rows: SpeedRow[] = META.map((m) => {
    const value = sample[m.key];
    const budget = budgets[m.key];
    const ok = Number.isFinite(value) && value >= 0 && value <= budget;
    return { ...m, value, budget, ok };
  });
  const over = rows.filter((r) => !r.ok);
  return { ok: over.length === 0, rows, over };
}

const fmtVal = (v: number, unit: string): string => {
  if (!Number.isFinite(v)) return `invalid ${unit}`;
  const n = unit === "%" ? v.toFixed(1) : String(Math.round(v));
  return `${n} ${unit}`;
};

/** Formats a plain, readable table of measured numbers against budgets. */
export function formatSpeedReport(result: SpeedResult): string {
  const lines = [
    "M110 speed budgets:",
    ...result.rows.map((r) => `  [${r.ok ? "PASS" : "FAIL"}] ${r.label}: ${fmtVal(r.value, r.unit)} (budget <= ${r.budget} ${r.unit})`),
    result.ok ? "All 7 speed budgets passed." : `Over budget: ${result.over.map((r) => r.label).join(", ")}.`,
  ];
  return lines.join("\n");
}
