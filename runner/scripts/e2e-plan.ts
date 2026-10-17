// RETIRED on 17 Oct 2026. This gave the runner program one real task over its pipe on the old plan route test login, as
// soon as it was started: no dry run, no --spend, no system/init check and no spending stop. Its job is done by
// real-verify.ts (the runner started as the app starts it, on the API key route) through the real run harness
// (realrun-harness.ts). It starts nothing; the old version is in the git history.
console.error("e2e-plan.ts is retired: it started real Claude with no dry run and no spending stop. Use instead: bun run scripts/real-verify.ts (a dry run; add --spend to spend).");
process.exit(2);
