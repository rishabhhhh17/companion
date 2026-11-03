// The only place the web pages talk to the app. The pages never see keys, tokens or other
// apps' text; they call named commands and listen to named events (technical doc section 2).
type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
type Listen = (event: string, cb: (e: { payload: unknown }) => void) => Promise<() => void>;
// Outside a window (the page tests) there is no app: commands answer nothing and no event comes.
const T = typeof window === "undefined" ? undefined : (window as unknown as { __TAURI__?: { core: { invoke: Invoke }; event: { listen: Listen } } }).__TAURI__;

export const invoke: Invoke = (cmd, args) => (T ? T.core.invoke(cmd, args) : Promise.resolve(undefined));
export const listen: Listen = (event, cb) => (T ? T.event.listen(event, cb) : Promise.resolve(() => {}));
// The pages' state (main.rs tick). M55: it no longer names the app in front; only Home hears of it, as a kind (front-kind).
export type AppState = { clicks: number; card_key: boolean };

// Pro (the payments spec, T17): the shell's plan commands (license.rs, trial.rs). Every one but status works only from Home;
// each refuses with a short reason word (plan.ts planProblem says it). The key goes to the shell once, from the field the
// person pasted it in, and comes back only as its last 4 characters. Checkout and billing open in the person's own browser.
export const proCommands = {
  status: () => invoke("license_status"),
  activate: (key: string) => invoke("license_activate", { key }),
  checkNow: () => invoke("license_check_now"),
  deactivate: () => invoke("license_deactivate"),
  openCheckout: (term: "yearly" | "monthly") => invoke("plan_open_checkout", { term }),
  openPortal: () => invoke("plan_open_portal"),
  startTrial: () => invoke("trial_start"),
};
