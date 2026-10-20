import { S } from "./strings.ts";
import { SWITCHED, groupView, useGroups, type SwitchedId } from "./groups.ts";
import { useSetting } from "./settingsStore.ts";

// Settings, Groups of tools: under the four switches (they are ordinary rows), what each group may do on this Mac in one
// sentence, the permissions it may ask for, and, if Home's invitations are on, the tools not tried yet. Only words and the
// switches' state: nothing here counts, scores or ranks anything (rule 16).
export function GroupsPanel() {
  useGroups();
  useSetting("groups.tried"); useSetting("groups.showUntried");
  return (
    <div className="groups">
      <div className="line muted">{S.groups.help}</div>
      {SWITCHED.map((g) => {
        const v = groupView(g.id as SwitchedId);
        const name = S.groups.names[v.id];
        return (
          <section key={v.id} aria-label={name} className="group">
            <div className="line"><b>{name}</b>: {v.on ? S.groups.isOn : S.groups.isOff}</div>
            <div className="line muted">{S.groups.lines[v.id]}</div>
            <div className="line muted">{v.permissions.length ? S.groups.permissionsLine(v.permissions.map((p) => S.groups.permissionNames[p]).join(", ")) : S.groups.permissionsNone}</div>
            {!v.on && <div className="line">{S.groups.offNote}</div>}
            {v.on && v.untried.length > 0 && <div className="line muted">{S.groups.notTried(v.untried.map((t) => S.groups.tools[t as keyof typeof S.groups.tools].name).join(", "))}</div>}
          </section>
        );
      })}
      <div className="line muted">{S.groups.core}</div>
    </div>
  );
}
