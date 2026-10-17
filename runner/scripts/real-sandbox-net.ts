// RETIRED on 17 Oct 2026. Its network check (package downloads from the allowed registry) is now the sandbox-network case
// of real-sandbox.ts, which goes through the real run harness on the API key route. It starts nothing; the old version is
// in the git history.
console.error("real-sandbox-net.ts is retired. Use instead: bun run scripts/real-sandbox.ts sandbox-network (a dry run; add --spend to spend).");
process.exit(2);
