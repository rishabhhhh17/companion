// Flowflow's moods. A small state machine whose every change comes from something that really happened in the app (a state
// the app reported, a pointer, a touch) and never from chance. Each state is a "look": a handful of numbers the body and the
// renderer read. The current look slides toward the state's look, so a change is never a snap, and any change can interrupt
// any other.
import type { CharacterState } from "../model.ts";

export const BEHAVIOR_STATES = ["idle", "curious", "following", "working", "success", "error", "sleeping", "interacting", "needsYou"] as const;
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
  /** M46: 0 its own water, 1 an amber core (it needs you). */
  amber: number;
  /** M60: the eyes are soft closed arcs: 1 the usual gentle arc, more a happier one, 0 a flat line, below 0 turned down. */
  eyeArc: number;
  /** M60: 0 closed arcs, 1 open soft round eyes (listening, needs you). */
  eyeDot: number;
};
export const LOOK_KEYS = ["eyeOpen", "gazeGain", "breathAmp", "breathRate", "floatAmp", "cloud", "glow", "wobbleGain", "expand", "rippleGain", "droplets", "amber", "eyeArc", "eyeDot"] as const;

export const LOOKS: Readonly<Record<BehaviorState, Look>> = {
  idle:        { eyeOpen: 1,    gazeGain: 0.6, breathAmp: 0.035, breathRate: 0.32, floatAmp: 0.035, cloud: 0,    glow: 0,   wobbleGain: 1,   expand: 0,    rippleGain: 0.6, droplets: 0.2, amber: 0, eyeArc: 1,    eyeDot: 0 },
  curious:     { eyeOpen: 1.12, gazeGain: 1,   breathAmp: 0.03,  breathRate: 0.50, floatAmp: 0.02, cloud: 0,    glow: 0.1, wobbleGain: 1,   expand: 0.03, rippleGain: 0.8, droplets: 0.3, amber: 0, eyeArc: 0.4,  eyeDot: 1 },
  following:   { eyeOpen: 1,    gazeGain: 1,   breathAmp: 0.02,  breathRate: 0.40, floatAmp: 0.01, cloud: 0,    glow: 0,   wobbleGain: 1.1, expand: 0,    rippleGain: 0.7, droplets: 0.6, amber: 0, eyeArc: 1,    eyeDot: 0 },
  working:     { eyeOpen: 0.82, gazeGain: 0.3, breathAmp: 0.015, breathRate: 0.90, floatAmp: 0,    cloud: 0.05, glow: 0.05, wobbleGain: 0.6, expand: 0,    rippleGain: 0.4, droplets: 0, amber: 0, eyeArc: 0,    eyeDot: 0 },
  success:     { eyeOpen: 1.05, gazeGain: 0.5, breathAmp: 0.035, breathRate: 0.50, floatAmp: 0.03, cloud: 0,    glow: 1,   wobbleGain: 1,   expand: 0.07, rippleGain: 1.2, droplets: 0.8, amber: 0, eyeArc: 1.5,  eyeDot: 0 },
  error:       { eyeOpen: 0.8,  gazeGain: 0.3, breathAmp: 0.01,  breathRate: 0.25, floatAmp: 0,    cloud: 0.8,  glow: 0,   wobbleGain: 0.7, expand: -0.02, rippleGain: 0.5, droplets: 0, amber: 0, eyeArc: -0.75, eyeDot: 0 },
  sleeping:    { eyeOpen: 0,    gazeGain: 0,   breathAmp: 0.035, breathRate: 0.12, floatAmp: 0.01, cloud: 0,    glow: 0,   wobbleGain: 0.3, expand: 0,    rippleGain: 0.2, droplets: 0, amber: 0, eyeArc: 0,    eyeDot: 0 },
  interacting: { eyeOpen: 1,    gazeGain: 1,   breathAmp: 0.03,  breathRate: 0.60, floatAmp: 0,    cloud: 0,    glow: 0.15, wobbleGain: 1.4, expand: 0,    rippleGain: 1.3, droplets: 0.5, amber: 0, eyeArc: 1.2,  eyeDot: 0 },
  // M46: it needs you. An amber core, the eyes straight out toward you, never following anything; it pulses three times
  // (Behavior.pulse), then holds steady.
  needsYou:    { eyeOpen: 1.05, gazeGain: 0,   breathAmp: 0.02,  breathRate: 0.40, floatAmp: 0.01, cloud: 0,    glow: 0.1, wobbleGain: 0.8, expand: 0.02, rippleGain: 0.6, droplets: 0, amber: 1, eyeArc: 0.4,  eyeDot: 1 },
};

/** How long a look takes to slide in (seconds): quick to cheer, slow to fall asleep. */
const TAU: Readonly<Record<BehaviorState, number>> = { idle: 0.3, curious: 0.18, following: 0.2, working: 0.3, success: 0.12, error: 0.35, sleeping: 0.8, interacting: 0.08, needsYou: 0.2 };
/** How long a flash lasts before the base state returns (seconds). */
export const FLASH_SECONDS = { success: 2.4, interacting: 0.9 } as const;
/** M46: needs you pulses this many times, each this long (seconds), then holds steady (the notch's amber does the same). */
export const NEEDS_PULSES = 3;
export const PULSE_SECONDS = 1.2;

/** What the app's own state means for Flowflow. "done" is a flash of success that settles; every other state holds. */
export function fromApp(s: CharacterState): { base: BehaviorState; flash?: "success" } {
  switch (s) {
    case "off": return { base: "sleeping" };
    case "idle": return { base: "idle" };
    case "listening": return { base: "curious" };
    case "needsYou": return { base: "needsYou" };
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
  /** How long it has needed you (seconds): the pulses run for the first NEEDS_PULSES of PULSE_SECONDS. */
  private needT = 0;
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
    if (m.base === "needsYou") this.needT = 0;
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

  /** M46: needs you's pulse now, 0 to 1 (each rises and falls once), and 0 once the three are done or in any other state. */
  get pulse(): number {
    if (this.state !== "needsYou" || this.needT >= NEEDS_PULSES * PULSE_SECONDS) return 0;
    return 0.5 - 0.5 * Math.cos((2 * Math.PI * this.needT) / PULSE_SECONDS);
  }
  /** True unless needs you is still pulsing: the frame loop may park only then. */
  get pulsesDone(): boolean { return this.state !== "needsYou" || this.needT >= NEEDS_PULSES * PULSE_SECONDS; }

  update(dt: number): void {
    if (!(dt > 0)) return;
    if (this.app === "needsYou") this.needT += dt;
    if (this.flashState) { this.flashLeft -= dt; if (this.flashLeft <= 0) { this.flashState = null; this.entered = null; } }
    const target = LOOKS[this.state], a = 1 - Math.exp(-dt / TAU[this.state]);
    for (const k of LOOK_KEYS) this.look[k] += (target[k] - this.look[k]) * a;
  }

  /** Jump straight to a state's look (a first frame, or reduced motion: no sliding). */
  snap(): void { Object.assign(this.look, LOOKS[this.state]); }
}
