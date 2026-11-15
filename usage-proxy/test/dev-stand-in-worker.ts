// For test/deploy.test.ts only: stands in for `wrangler dev` by serving the real Worker (src/worker.ts) with Bun on a fake of
// the Durable Object API, reading .dev.vars as wrangler would. It proves scripts/verify-dev.sh's own steps; the real workerd
// run stays a [verify] item.
import { readFileSync } from "node:fs";
import { handle, type Env } from "../src/worker.ts";
import { FakeNamespace } from "./fake-do.ts";

const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
const vars = Object.fromEntries(readFileSync(".dev.vars", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const env = { ...vars, STORE: new FakeNamespace() } as Env;
Bun.serve({ hostname: "127.0.0.1", port, fetch: (req) => handle(req, env, { waitUntil: () => {} }) });
