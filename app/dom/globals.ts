// M59: the pages' DOM test harness. A real DOM (happy-dom) on the global object, so the pages render and are clicked
// through with Testing Library under bun test, and the one stand in for the app (window.__TAURI__): every command a page
// sends is recorded and answered from a table, and every event the app would send can be fired at the page.
// It is loaded by setup.ts (bun test --preload) before any test file, so its globals exist before a page module or
// Testing Library is loaded (tauri.ts reads window.__TAURI__ once, when it loads). The DOM tests run in their own bun test
// run (`bun run test`), never with the plain page tests in src/, which expect no window at all.
import { GlobalWindow } from "happy-dom";

// Bun's own versions of these stay: timers, networking and text coding behave as in every other test.
const KEEP = new Set(["undefined", "NaN", "Infinity", "global", "globalThis", "constructor", "console", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "queueMicrotask", "fetch", "Request", "Response", "Headers", "URL", "URLSearchParams", "performance", "crypto", "TextEncoder", "TextDecoder", "AbortController", "AbortSignal", "structuredClone", "WebSocket", "process", "Bun"]);

const win = new GlobalWindow({ url: "http://localhost/card.html", width: 1280, height: 860 });
const g = globalThis as unknown as Record<string, unknown>;
const seen = new Set<string>();
for (let o: object | null = win; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
  for (const key of Object.getOwnPropertyNames(o)) {
    if (seen.has(key) || KEEP.has(key)) continue;
    seen.add(key);
    const d = Object.getOwnPropertyDescriptor(o, key)!;
    if (o !== win && typeof d.value === "function") { const f = d.value as (...a: unknown[]) => unknown; Object.defineProperty(g, key, { value: f.bind(win), configurable: true, writable: true }); continue; }
    if (o !== win && (d.get || d.set)) { Object.defineProperty(g, key, { get: d.get ? () => d.get!.call(win) : undefined, set: d.set ? (v) => d.set!.call(win, v) : undefined, configurable: true }); continue; }
    if (d.value === win) { Object.defineProperty(g, key, { value: globalThis, configurable: true, writable: true }); continue; }
    Object.defineProperty(g, key, { ...d, configurable: true });
  }
}
g.window = globalThis;
g.self = globalThis;
g.IS_REACT_ACT_ENVIRONMENT = true;
// happy-dom draws nothing: a frame is a short timer, so code that waits for one still runs.
g.requestAnimationFrame = (f: (t: number) => void) => setTimeout(() => f(performance.now()), 16) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
g.matchMedia = (q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false });

// React's note that an update was not wrapped in act is about how a test waits, not about the page: the helpers in
// render.tsx wait inside act, and timers the page sets for itself (a toast, a glow) may still land after. Everything else
// React or the page says still shows.
const consoleError = console.error.bind(console);
console.error = (...a: unknown[]) => { if (typeof a[0] === "string" && a[0].includes("not wrapped in act")) return; consoleError(...a); };

type Listener = (e: { payload: unknown }) => void;
type Answer = (args: Record<string, unknown> | undefined) => unknown;
export type Call = { cmd: string; args: Record<string, unknown> | undefined };

/** The stand in app: the same shape the real shell gives the pages (core.invoke, event.listen). */
export const app = {
  calls: [] as Call[],
  listeners: new Map<string, Set<Listener>>(),
  answers: new Map<string, Answer>(),
  /** Answers a command with a value (or a function of its arguments). A command with no answer resolves to undefined,
   *  as tauri.ts does outside the app. */
  answer(cmd: string, a: unknown) { this.answers.set(cmd, typeof a === "function" ? (a as Answer) : () => a); },
  /** Makes a command fail with this error, as the shell refuses one. */
  refuse(cmd: string, error: unknown) { this.answers.set(cmd, () => { throw error; }); },
  /** The runner commands the page sent (send_command), in order. */
  sent(): { type: string; [k: string]: unknown }[] { return this.calls.filter((c) => c.cmd === "send_command").map((c) => c.args?.cmd as { type: string }); },
  sentTypes(): string[] { return this.sent().map((c) => c?.type); },
  invoked(cmd: string): Call[] { return this.calls.filter((c) => c.cmd === cmd); },
  listening(event: string): number { return this.listeners.get(event)?.size ?? 0; },
  /** Fires an app event at every page listener (wrap it in act, or use emit from render.tsx). */
  fire(event: string, payload: unknown) { for (const cb of [...(this.listeners.get(event) ?? [])]) cb({ payload }); },
  reset() { this.calls = []; this.listeners = new Map(); this.answers = new Map(); },
};

g.__TAURI__ = {
  core: {
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
      app.calls.push({ cmd, args });
      const a = app.answers.get(cmd);
      return a ? a(args) : undefined;
    },
  },
  event: {
    listen: async (event: string, cb: Listener) => {
      const set = app.listeners.get(event) ?? new Set<Listener>();
      set.add(cb);
      app.listeners.set(event, set);
      return () => { set.delete(cb); };
    },
  },
};

