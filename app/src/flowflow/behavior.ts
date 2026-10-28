// Flowflow's moods. A small state machine whose every change comes from something that really happened in the app (a state
// the app reported, a pointer, a touch) and never from chance. Each state is a "look": a handful of numbers the body and the
// renderer read. The current look slides toward the state's look, so a change is never a snap, and any change can interrupt
// any other.
import type { CharacterState } from "../model.ts";

export const BEHAVIOR_STATES = ["idle", "curious", "following", "working", "success", "error", "sleeping", "interacting"] as const;
export type BehaviorState = (typeof BEHAVIOR_STATES)[number];

export type Look = {
  /** 0 closed, 1 usual, a little over 1 wide. */
  eyeOpen: number;
  /** How much the eyes follow a target (0 stares ahead). */
  gazeGain: number;
  breathAmp: number; breathRate: number;
  /** A slow float, in world units. */
  floatAmp: number;
  /** 0 clear, 1 cloudy and darker (an error). */
  cloud: number;
  /** 0 usual, 1 brightened (a success). */
  glow: number;
  wobbleGain: number;
  /** A little extra size, as a fraction. */
  expand: number;
  rippleGain: number;
  /** How readily tiny droplets leave the body (0 to 1). */
  droplets: number;
};
export const LOOK_KEYS = ["eyeOpen", "gazeGain", "breathAmp", "breathRate", "floatAmp", "cloud", "glow", "wobbleGain", "expand", "rippleGain", "droplets"] as const;

export const LOOKS: Readonly<Record<BehaviorState, Look>> = {
  idle:        { eyeOpen: 1,    gazeGain: 0.6, breathAmp: 0.035, breathRate: 0.32, floatAmp: 0.035, cloud: 0,    glow: 0,   wobbleGain: 1,   expand: 0,    rippleGain: 0.6, droplets: 0.2 },
  curious:     { eyeOpen: 1.12, gazeGain: 1,   breathAmp: 0.03,  breathRate: 0.50, floatAmp: 0.02, cloud: 0,    glow: 0.1, wobbleGain: 1,   expand: 0.03, rippleGain: 0.8, droplets: 0.3 },
  following:   { eyeOpen: 1,    gazeGain: 1,   breathAmp: 0.02,  breathRate: 0.40, floatAmp: 0.01, cloud: 0,    glow: 0,   wobbleGain: 1.1, expand: 0,    rippleGain: 0.7, droplets: 0.6 },
  working:     { eyeOpen: 0.82, gazeGain: 0.3, breathAmp: 0.015, breathRate: 0.90, floatAmp: 0,    cloud: 0.05, glow: 0.05, wobbleGain: 0.6, expand: 0,    rippleGain: 0.4, droplets: 0 },
  success:     { eyeOpen: 1.05, gazeGain: 0.5, breathAmp: 0.035, breathRate: 0.50, floatAmp: 0.03, cloud: 0,    glow: 1,   wobbleGain: 1,   expand: 0.07, rippleGain: 1.2, droplets: 0.8 },
  error:       { eyeOpen: 0.8,  gazeGain: 0.3, breathAmp: 0.01,  breathRate: 0.25, floatAmp: 0,    cloud: 0.8,  glow: 0,   wobbleGain: 0.7, expand: -0.02, rippleGain: 0.5, droplets: 0 },
  sleeping:    { eyeOpen: 0,    gazeGain: 0,   breathAmp: 0.035, breathRate: 0.12, floatAmp: 0.01, cloud: 0,    glow: 0,   wobbleGain: 0.3, expand: 0,    rippleGain: 0.2, droplets: 0 },
  interacting: { eyeOpen: 1,    gazeGain: 1,   breathAmp: 0.03,  breathRate: 0.60, floatAmp: 0,    cloud: 0,    glow: 0.15, wobbleGain: 1.4, expand: 0,    rippleGain: 1.3, droplets: 0.5 },
};

/** How long a look takes to slide in (seconds): quick to cheer, slow to fall asleep. */
const TAU: Readonly<Record<BehaviorState, number>> = { idle: 0.3, curious: 0.18, following: 0.2, working: 0.3, success: 0.12, error: 0.35, sleeping: 0.8, interacting: 0.08 };
/** How long a flash lasts before the base state returns (seconds). */
export const FLASH_SECONDS = { success: 2.4, interacting: 0.9 } as const;

/** What the app's own state means for Flowflow. "done" is a flash of success that settles; every other state holds. */
export function fromApp(s: CharacterState): { base: BehaviorState; flash?: "success" } {
  switch (s) {
    case "off": return { base: "sleeping" };
    case "idle": return { base: "idle" };
    case "listening": return { base: "curious" };
    case "needsYou": return { base: "curious" };
    case "thinking": case "working": case "checking": return { base: "working" };
    case "done": return { base: "idle", flash: "success" };
    case "error": return { base: "error" };
  }
}

export class Behavior {
  /** What is being shown right now (a flash, or else the base). */
  private app: BehaviorState = "idle";
  private follow = false;
  private flashState: BehaviorState | null = null;
  private flashLeft = 0;
  private entered: BehaviorState | null = null;
  private lastApp: CharacterState | null = null;
  readonly look: Look = { ...LOOKS.idle };

  /** The state in force: a running flash, else the app's state (or following, when idle and the pointer is moving). */
  get state(): BehaviorState { return this.flashState ?? this.base; }
  get base(): BehaviorState { return this.app === "idle" && this.follow ? "following" : this.app; }

  /** Tell it the app's state. Only a real change counts: the same state again does nothing, and success is never invented. */
  applyApp(next: CharacterState): void {
    if (next === this.lastApp) return;
    this.lastApp = next;
    const m = fromApp(next);
    const before = this.state;
    this.app = m.base;
    if (m.flash) this.startFlash(m.flash); else if (this.flashState === "success") { this.flashState = null; this.flashLeft = 0; }
    if (this.state !== before) this.entered = this.state;
  }
  /** Pointer movement near it. Only an idle Flowflow follows; it never abandons work or an alert to chase a cursor. */
  setFollowing(on: boolean): void { const before = this.state; this.follow = on; if (this.state !== before) this.entered = this.state; }
  /** A touch: it squishes. Interrupts anything but sleep, which a touch wakes and then returns to. */
  touch(): void { this.startFlash("interacting"); this.entered = "interacting"; }
  /** Say what state was just entered, once (the controller turns it into a ripple or a bounce). */
  takeEntered(): BehaviorState | null { const e = this.entered; this.entered = null; return e; }

  private startFlash(s: "success" | "interacting"): void { this.flashState = s; this.flashLeft = FLASH_SECONDS[s]; }

  update(dt: number): void {
    if (!(dt > 0)) return;
    if (this.flashState) { this.flashLeft -= dt; if (this.flashLeft <= 0) { this.flashState = null; this.entered = null; } }
    const target = LOOKS[this.state], a = 1 - Math.exp(-dt / TAU[this.state]);
    for (const k of LOOK_KEYS) this.look[k] += (target[k] - this.look[k]) * a;
  }

  /** Jump straight to a state's look (a first frame, or reduced motion: no sliding). */
  snap(): void { Object.assign(this.look, LOOKS[this.state]); }
}
