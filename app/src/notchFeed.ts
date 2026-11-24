// M113 (docs/milestones/M113-live-feed.md): the live feed in the notch, as words. The engine says feed.update (runner/src/
// livefeed.ts): at most 3 sessions of at most 4 lines, each a file the person's own AI tool edited (with the lines added and
// taken away) or a command it ran. Here they become blocks that fit the notch's room: a head (the tool and the project, and
// Working or Finished), then the newest rows. Pure; notchFeed.tsx draws it under the hover row and in the small chat.
import { parseEvent, PROTOCOL_VERSION, type FeedSession } from "../../protocol/index.ts";
import { attentionSummary, type AgentSession, type RankedSession } from "../../runner/src/attention.ts";
import type { Model } from "./model.ts";
import { S } from "./strings.ts";

export type { FeedSession };
/** The rows each block shows, by how many blocks there are, so the panel stays a glance inside the notch's room (island.rs
 *  PANEL_MAX): three for one session, two each for two, one each for three. */
export const FEED_ROWS = [3, 2, 1] as const;
/** The small chat keeps its thread in view: at most two blocks, two rows for one and one each for two. */
export const CHAT_ROWS = [2, 1] as const;

/** The sessions of a feed.update, only when the protocol allows them (names, counts and short commands); null otherwise. */
export function feedFrom(sessions: unknown): FeedSession[] | null {
  const r = parseEvent(JSON.stringify({ v: PROTOCOL_VERSION, id: "feed", type: "feed.update", sessions }));
  return r.ok ? ((r.msg as unknown as { sessions: FeedSession[] }).sessions) : null;
}

export type FeedRow = {
  key: string;
  /** edit: told by the tool's hook, with counts; seen: seen in the folder, no counts; run: a command. */
  kind: "edit" | "seen" | "run";
  /** The file's name (or the command), and the folder it is in, drawn quieter before it ("src/"). */
  name: string; dir: string;
  /** M113 review: the name as its stem and extension, so a long name is cut in its stem and keeps ".tsx" (fileParts). */
  stem: string; ext: string;
  added: number | null; removed: number | null;
  /** How many times in a row (2 or more shows "2×"). */
  times: number;
  /** What VoiceOver says, and the tooltip. */
  say: string;
};
export type FeedBlock = { key: string; head: string; state: "working" | "done"; stateWords: string; rows: FeedRow[] };

const nameOf = (project: string) => project.split("/").filter(Boolean).at(-1) ?? "";
/** M113 review: a file's name as its stem and its extension (".tsx"), so the notch cuts only the stem. A dot file (".env"),
 *  a name ending in a dot and a tail longer than 8 characters after the last dot have no extension. */
export function fileParts(name: string): { stem: string; ext: string } {
  const i = name.lastIndexOf(".");
  if (i <= 0 || i === name.length - 1 || name.length - i > 9) return { stem: name, ext: "" };
  return { stem: name.slice(0, i), ext: name.slice(i) };
}
const split = (path: string): { dir: string; name: string } => { const i = path.lastIndexOf("/"); return i < 0 ? { dir: "", name: path } : { dir: path.slice(0, i + 1), name: path.slice(i + 1) }; };

/** The blocks to draw, newest session first (the engine's order), each with as many rows as the room allows. */
export function feedBlocks(feed: readonly FeedSession[] | null | undefined, rows: readonly number[] = FEED_ROWS): FeedBlock[] {
  const live = (feed ?? []).filter((s) => s.items.length > 0).slice(0, rows.length);
  const room = live.length ? rows[live.length - 1]! : 0;
  return live.map((s) => {
    const project = nameOf(s.project);
    const head = s.via === "folder" || !s.tool ? S.m113.folderHead(project) : S.m113.head(S.doneSignal.tool[s.tool], project);
    // Each row's key counts from the oldest line, so a new line on top never moves the keys under it.
    const seen = new Map<string, number>();
    const keyed = [...s.items].reverse().map((it) => {
      const text = it.kind === "edit" ? it.path : it.command;
      const k = `${it.kind}:${text}`, occ = seen.get(k) ?? 0;
      seen.set(k, occ + 1);
      return { it, key: `${k}:${occ}` };
    }).reverse();
    const rows: FeedRow[] = keyed.slice(0, room).map(({ it, key }) => {
      if (it.kind === "run") return { key, kind: "run", name: it.command, dir: "", stem: it.command, ext: "", added: null, removed: null, times: it.n, say: S.m113.ranSay(it.command, it.n) };
      const { dir, name } = split(it.path);
      const { stem, ext } = fileParts(name);
      const added = it.added ?? null, removed = it.removed ?? null;
      if (s.via === "folder") return { key, kind: "seen", name, dir, stem, ext, added: null, removed: null, times: it.n, say: S.m113.seenSay(it.path, it.n) };
      return { key, kind: "edit", name, dir, stem, ext, added, removed, times: it.n, say: S.m113.editSay(it.path, added, removed, it.n) };
    });
    // M113 review: a folder block may be the person's own saves, so it never says Working; it says Seen (Finished once a
    // hook-less tool's done signal came).
    const stateWords = s.via === "folder" && s.state === "working" ? S.m113.state.seen : S.m113.state[s.state];
    return { key: s.key, head, state: s.state, stateWords, rows };
  });
}

/** M113 review: where a press on a line goes. review: the review card of this work (waiting, being reviewed, or in after the
 *  tool finished); later: the tool still works and only an older review (or none) is there, so the notch says when it comes
 *  instead of showing the old one; settling: the tool finished and its review is not in yet (the review's settle time);
 *  elsewhere: the line is from a project other than the one open; home: reviews are off, so Home opens and promises
 *  nothing. */
export type FeedPress = "review" | "later" | "settling" | "elsewhere" | "home";
export function feedPress(s: Pick<FeedSession, "project" | "state">, open: string, review: { project: string; stage: string } | null | undefined, reviewsOn: boolean): FeedPress {
  if (!open || s.project !== open) return "elsewhere";
  if (!reviewsOn) return "home";
  const card = review && review.project === open ? review : null;
  if (card && (card.stage === "ready" || card.stage === "reviewing")) return "review";
  if (s.state === "done") return card ? "review" : "settling";
  return "later";
}
/** M113 review: the notch's own short line for a press that has nothing to open yet (later, settling), said under the
 *  line pressed so the person stays in the notch; null for a press that opens Home. */
export function pressLine(go: FeedPress, tool: string): string | null {
  if (go === "later") return S.m113.laterHere(tool);
  if (go === "settling") return S.m113.settling(tool);
  return null;
}
/** The project's name as the feed says it (the last part of its folder). */
export const feedProjectName = (project: string): string => nameOf(project);

// M119 (docs/milestones/M119-multi-agent-board.md): the notch's attention line, from the engine's own attention summary
// (runner/src/attention.ts) over the agent's sessions: how many need the person, how many are working, or all quiet. The
// notch says this line and rings the top session; a press on the work goes to Home (main.rs island_go, home.ts feed).
export function attentionHeadline(sessions: readonly AgentSession[]): string {
  const s = attentionSummary(sessions);
  return S.m119.headline(s.attentionCount, s.workingCount);
}
/** M119: the top session that needs the person, for the notch's attention ring and the one press on its line; null when all
 *  agents are quiet. */
export function attentionTop(sessions: readonly AgentSession[]): RankedSession | null {
  return attentionSummary(sessions).top;
}
// M119: the sessions the notch's attention is about, from the model's own waiting states: an approval the person's AI tool
// waits on, a loop the agent is stuck in, or a task whose last step asked the person. One session per thing waiting on them.
export function attentionSessions(m: Model): AgentSession[] {
  const out: AgentSession[] = [];
  const push = (s: AgentSession): void => { const i = out.findIndex((x) => x.id === s.id); if (i >= 0) out[i] = s; else out.push(s); };
  const now = Date.now();
  const repo = (r?: string | null): string => r ?? m.folder ?? "";
  for (const a of m.approvals) push({ id: a.id, tool: a.agent, repo: repo(null), state: "needs_approval", summary: a.title, updatedAt: Date.parse(a.expiresAt) || now });
  if (m.stuck) push({ id: `stuck:${m.stuck.index}`, tool: m.stuck.agent ?? m.task?.agent ?? "claude", repo: repo(m.task?.project), state: "blocked", summary: m.stuck.title, updatedAt: now });
  if (m.task) for (const l of m.task.lines) if (l.outcome === "needs_approval" || l.outcome === "blocked") push({ id: `task:${m.task.agent}:${l.id}`, tool: m.task.agent, repo: repo(m.task.project), state: l.outcome, summary: l.words, updatedAt: now });
  return out;
}

// M121 (docs/milestones/M121-notch-overhaul.md): the notch's attention block, as the person reads it: the headline and the
// work it is about (the top session's own words), so the block is useful without opening Home. Null when all agents are quiet.
export type NotchAttention = { headline: string; top: RankedSession | null; what: string };
export function attentionBlock(sessions: readonly AgentSession[]): NotchAttention | null {
  const s = attentionSummary(sessions);
  if (!s.top) return null;
  return { headline: S.m119.headline(s.attentionCount, s.workingCount), top: s.top, what: s.top.summary };
}

/** M121 slice 2: where a press on the attention block goes. Opens Home for the top session's project. */
export type AttentionPress = { project: string; action: "home" } | null;
export function attentionPress(sessions: readonly AgentSession[]): AttentionPress {
  const s = attentionSummary(sessions);
  if (!s.top) return null;
  return { project: s.top.repo, action: "home" };
}

/** M121 slice 2: the short line the notch says under the attention block on press. Null because it opens Home. */
export function attentionPressLine(sessions: readonly AgentSession[]): string | null {
  const s = attentionSummary(sessions);
  if (!s.top) return null;
  return null; // goes to Home, no line in the notch
}
