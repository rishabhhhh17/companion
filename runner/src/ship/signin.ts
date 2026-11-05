// M58 (UI 13): signing in to Vercel without Terminal. The person presses Sign in to Vercel (the ship.signIn command); the
// engine runs their own `vercel login` as a visible step (deploy.ts VercelCli.signIn), says the page Vercel's tool opened
// (always https on vercel.com) so the page can open it in their browser, and says when it is done. Only on that press:
// never at launch, never on a timer, and going online again after it is the person's next press. The Vercel tool keeps
// the login in its own place: Squibby never reads, stores or passes it, and nothing the tool prints is passed on but the
// page's address. When the step cannot run here, a short lesson (lessons/vercel-sign-in.json) shows it step by step.
import type { Deployer } from "./deploy.ts";

/** Every line the sign in says, plain and fixed: no tool output, no account name, never "Open Terminal". */
export const SIGN_IN = {
  noCli: "Putting a site online needs the Vercel tool, and it is not installed on this Mac. Install it with: npm install -g vercel",
  noPage: "Vercel's sign in page did not open from here. The steps below show how to sign in another way.",
  notHere: "Signing in to Vercel is not set up on this Mac yet. The steps below show how to sign in another way.",
  notFinished: "Vercel did not finish the sign in, so you are not signed in yet. Try again.",
  tooLong: "Vercel's sign in took too long, so it was stopped. Try again.",
  stopped: "Stopped. You are not signed in yet.",
  failed: "Something went wrong while signing in to Vercel. Try again.",
} as const;

type Emit = (e: Record<string, unknown>) => void;

/** One sign in, from the press to its end. Already signed in: done at once, and no login runs. */
export async function signInStep(d: Deployer, project: string, emit: Emit, signal?: AbortSignal): Promise<void> {
  const say = (stage: "opened" | "done" | "failed", extra: Record<string, unknown> = {}) => emit({ type: "ship.signIn", project, stage, ...extra });
  if (d.signedIn()) { say("done"); return; }
  if (!d.signIn) { say("failed", { reason: SIGN_IN.notHere, lesson: true }); return; }
  let opened = false;
  const r = await d.signIn(project, { signal, onPage: (url) => { if (opened) return; opened = true; say("opened", { url }); } });
  if (r.ok) { say("done"); return; }
  say("failed", { reason: r.reason, ...(r.cannotStart ? { lesson: true } : {}) });
}
