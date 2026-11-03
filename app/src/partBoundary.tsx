// Must fix 4 (review of 4 Nov): one error while drawing must never blank the whole window. A part of a page (a Home place,
// the Settings body, the first run) sits in this boundary: if it throws while drawing, that part shows one plain line and
// Reload this part, and the rest of the window (the top bar, the Settings sidebar, Close) keeps working. What went wrong is
// kept for a report (main.rs note_failure: short, keys hidden, the home folder written as ~), never shown.
import { Component, Fragment, createElement, type ReactNode } from "react";
import { redact } from "../../runner/src/redact.ts";
import { S } from "./strings.ts";
import { invoke } from "./tauri.ts";

/** The words kept for a report: the error's own message and where in the page it was drawing, keys hidden, 400 at most. */
export function failureDetail(error: unknown, componentStack?: string | null): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const where = (componentStack ?? "").split("\n").map((l) => l.trim().replace(/^at\s+/, "").split(" ")[0]).filter(Boolean).slice(0, 6).join(" < ");
  return redact(where ? `${message} (in ${where})` : message).replace(/\s+/g, " ").slice(0, 400);
}

/** A page that is all one part (the character, the notch) has no room to read a line: `auto` draws it again by itself, up
 *  to AUTO_TRIES times a little apart, and only then shows the line and Reload this part. */
const AUTO_TRIES = 3;
const AUTO_WAIT_MS = 1500;
type Props = { part: string; resetKey?: unknown; auto?: boolean; children?: ReactNode };
type State = { failed: boolean; tries: number };

export class PartBoundary extends Component<Props, State> {
  state: State = { failed: false, tries: 0 };
  static getDerivedStateFromError(): Partial<State> { return { failed: true }; }
  private timer: ReturnType<typeof setTimeout> | undefined;
  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    void invoke("note_failure", { kind: `draw${this.props.part}`, detail: failureDetail(error, info?.componentStack) }).catch(() => {});
    if (this.props.auto && this.state.tries < AUTO_TRIES) { clearTimeout(this.timer); this.timer = setTimeout(this.reload, AUTO_WAIT_MS); }
  }
  componentWillUnmount() { clearTimeout(this.timer); }
  /** Another place was picked (resetKey): it is drawn afresh, not left on the failure line. */
  componentDidUpdate(prev: Props) { if (this.state.failed && !Object.is(prev.resetKey, this.props.resetKey)) this.setState({ failed: false }); }
  /** Reload this part: drawn again from the start (a new key, so nothing of the failed drawing is kept). */
  reload = () => this.setState((s) => ({ failed: false, tries: s.tries + 1 }));
  render() {
    if (!this.state.failed) return createElement(Fragment, { key: this.state.tries }, this.props.children);
    if (this.props.auto && this.state.tries < AUTO_TRIES) return null;
    return (
      <section className="panel part-failed" role="alert">
        <div className="line">{S.partFailed}</div>
        <div className="row"><button className="btn" type="button" onClick={this.reload}>{S.partReload}</button></div>
      </section>
    );
  }
}
