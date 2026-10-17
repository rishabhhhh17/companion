// RETIRED on 17 Oct 2026. This ran one tiny real task through the runner on the old plan route test login, as soon as it
// was started: no dry run, no --spend, no system/init check and no spending stop. Its job is done by smoke-real.ts
// (main-engine-sonnet55, follow-up, off-the-record) through the real run harness (realrun-harness.ts), on the API key
// route. It starts nothing; the old version is in the git history.
console.error("real-run.ts is retired: it started real Claude with no dry run and no spending stop. Use instead: bun run scripts/smoke-real.ts (a dry run; add --spend to spend).");
process.exit(2);
