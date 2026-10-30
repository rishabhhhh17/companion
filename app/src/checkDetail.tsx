// A check's result as a person reads it (M15 wave 2): one plain sentence, the file and line when it is known, and the
// check's own output behind "Details" (a native disclosure, so the keyboard and VoiceOver open it like any button).
import { S } from "./strings.ts";
import type { CheckParts } from "./checkParts.ts";

// The words themselves are decided in checkParts.ts (pure, so model.ts reads them too); this only draws them.
export { checkParts, type CheckParts } from "./checkParts.ts";

export function CheckDetail({ parts }: { parts: CheckParts }) {
  if (!parts.summary && !parts.raw) return null;
  return (
    <span className="check-detail">
      {parts.summary && <span className="muted"> {parts.summary}</span>}
      {parts.place && <span className="muted"> {parts.place}</span>}
      {parts.raw && (
        <details className="raw">
          <summary>{S.checkDetails}</summary>
          <pre className="diff">{parts.raw}</pre>
        </details>
      )}
    </span>
  );
}
