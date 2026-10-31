// The plan on this Mac, as Home and Settings read it (the payments spec, section 9a). One store for the window: the shell's
// license_status once, then its plan-status event, which it sends only while payments are on. With payments off the shell
// answers { paymentsOn: false } without reading the Keychain or the network, and no event ever comes, so nothing here
// changes anything. No timer and no network here: Dodo is asked only by the shell.
import { useEffect, useState } from "react";
import { listen, proCommands } from "./tauri.ts";
import { OFF, statusFrom, type PlanStatus } from "./plan.ts";

let now: PlanStatus = OFF;
let started = false;
const subs = new Set<(s: PlanStatus) => void>();

/** Keeps a status the shell sent (an answer to a plan command, or the event) and tells every part of the window. */
export function notePlan(v: unknown): PlanStatus {
  now = statusFrom(v);
  for (const f of subs) f(now);
  return now;
}
export const planNow = (): PlanStatus => now;

function start(): void {
  if (started) return;
  started = true;
  void proCommands.status().then((v) => { if (v !== undefined) notePlan(v); }).catch(() => {});
  void listen("plan-status", (e) => notePlan(e.payload));
}

/** The plan now, drawn again whenever it changes. */
export function usePlan(): PlanStatus {
  const [s, set] = useState<PlanStatus>(now);
  useEffect(() => { start(); subs.add(set); set(now); return () => { subs.delete(set); }; }, []);
  return s;
}
