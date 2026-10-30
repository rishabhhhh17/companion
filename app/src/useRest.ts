// M46 (F28): rest. The shell says when the character should hold still (a call with Quiet during calls on, or Low Power
// Mode with Rest in Low Power Mode on, rest.rs) as "flowflow-rest", and a page that starts while it rests asks once
// (flowflow_rest). Only that one yes or no reaches the page: never which app is in front or anything about the power.
import { useEffect, useState } from "react";
import { invoke, listen } from "./tauri.ts";

/** The shell's rest, read carefully: only `true` is rest. */
export const restFrom = (v: unknown): boolean => v === true || (typeof v === "object" && v !== null && (v as { rest?: unknown }).rest === true);

export function useRest(): boolean {
  const [rest, setRest] = useState(false);
  useEffect(() => {
    void invoke("flowflow_rest").then((v) => setRest(restFrom(v)), () => {});
    const off = listen("flowflow-rest", (e) => setRest(restFrom(e.payload)));
    return () => { off.then((f) => f()); };
  }, []);
  return rest;
}
