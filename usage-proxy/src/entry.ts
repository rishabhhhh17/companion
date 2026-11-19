// The module Cloudflare runs (wrangler.toml `main`). M116 step 6, found on the first run under real workerd: the runtime
// refuses a main module that exports anything other than handlers and classes ("Incorrect type for map entry ..."), and
// src/worker.ts also exports its lists of secrets, its paths and other constants for the scripts and tests. So this module
// exports only the Worker's fetch handler and the Durable Object class the STORE binding names. test/deploy.test.ts holds it
// to that.
import worker from "./worker.ts";

export { StoreObject } from "./store-do.ts";
export default worker;
