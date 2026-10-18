// The only place the web pages talk to the app. The pages never see keys, tokens or other
// apps' text; they call named commands and listen to named events (technical doc section 2).
type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
type Listen = (event: string, cb: (e: { payload: unknown }) => void) => Promise<() => void>;
// Outside a window (the page tests) there is no app: commands answer nothing and no event comes.
const T = typeof window === "undefined" ? undefined : (window as unknown as { __TAURI__?: { core: { invoke: Invoke }; event: { listen: Listen } } }).__TAURI__;

export const invoke: Invoke = (cmd, args) => (T ? T.core.invoke(cmd, args) : Promise.resolve(undefined));
export const listen: Listen = (event, cb) => (T ? T.event.listen(event, cb) : Promise.resolve(() => {}));
export type AppState = { clicks: number; front: string; card_key: boolean };
