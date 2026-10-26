// Peeking (27 Oct 2026, the founder: "our guys can always be outside of the screen, it might take a sneak peek"). The shell
// moves the character's window past the edge of the screen and back (src-tauri/src/peek.rs) and tells this page the pose
// (resting mostly past the edge, peeking about half way, or fully in) and the edge it lives on, so the character can lean
// toward the screen while it peeks (style.css). The page never moves the window and asks the shell for nothing.
import { useEffect, useState } from "react";
import { listen } from "./tauri.ts";

export const PEEK_POSES = ["hidden", "peek", "in"] as const;
export type PeekPose = (typeof PEEK_POSES)[number];
const EDGES = ["left", "right", "top", "bottom"] as const;
export type Peek = { pose: PeekPose; edge: (typeof EDGES)[number] };

/** What the shell sent, read safely: anything unknown is fully in, on the right edge. */
export function peekFrom(v: unknown): Peek {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const pose = (PEEK_POSES as readonly unknown[]).includes(o.pose) ? (o.pose as PeekPose) : "in";
  const edge = (EDGES as readonly unknown[]).includes(o.edge) ? (o.edge as Peek["edge"]) : "right";
  return { pose, edge };
}

/** The pose the shell said last (fully in until it says otherwise). */
export function usePeek(): Peek {
  const [p, setP] = useState<Peek>({ pose: "in", edge: "right" });
  useEffect(() => {
    const off = listen("peek", (e) => setP(peekFrom(e.payload)));
    return () => { off.then((f) => f()); };
  }, []);
  return p;
}
