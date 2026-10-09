// A small drive that lives in memory only. Claude Code keeps a copy of every picture it is sent in its temporary folder;
// pointing that folder here means a screenshot of someone's screen is never written to their SSD. Ejecting it erases it.
const NAME = "CompanionShots";
const MOUNT = `/Volumes/${NAME}`;
const SECTORS = 65536;   // 32 MB

async function sh(cmd: string[]): Promise<{ code: number; out: string }> {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code: await p.exited, out: out.trim() };
}

// Only a real mounted drive counts: a plain folder with the same name must never be trusted or wiped.
async function isMounted(): Promise<boolean> { return (await sh(["mount"])).out.split("\n").some((l) => l.includes(` on ${MOUNT} (`)); }

let mounted: string | null = null;
let device: string | null = null;
let pending: Promise<string> | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;

export const RAMDISK_MOUNT = MOUNT;

/// The folder to use. Made on first use; reused after. Fails (never falls back to the real disk) if it cannot be made.
export function ensure(): Promise<string> {
  if (mounted) { rearm(); return Promise.resolve(mounted); }
  pending ??= (async () => {
    // A leftover from a crashed run is reused, not duplicated.
    if (await isMounted()) { mounted = MOUNT; rearm(); return MOUNT; }
    const a = await sh(["hdiutil", "attach", "-nomount", `ram://${SECTORS}`]);
    const dev = a.out.split(/\s+/)[0];
    if (a.code !== 0 || !dev.startsWith("/dev/")) throw new Error("Could not make the in-memory drive for the screenshot.");
    const e = await sh(["diskutil", "erasevolume", "HFS+", NAME, dev]);
    if (e.code !== 0) { await sh(["hdiutil", "detach", dev, "-force"]); throw new Error("Could not prepare the in-memory drive for the screenshot."); }
    device = dev; mounted = MOUNT; rearm();
    return MOUNT;
  })().finally(() => { pending = null; });
  return pending;
}

function rearm() { clearTimeout(idle); idle = setTimeout(() => void release(), 120_000); }

/// Erases and removes the drive. Called when idle for two minutes and when the engine closes.
export async function release(): Promise<void> {
  clearTimeout(idle);
  const target = device ?? (mounted ? MOUNT : null);
  mounted = null; device = null;
  if (target) await sh(["hdiutil", "detach", target.startsWith("/dev/") ? target : MOUNT, "-force"]);
}

/// Wipes what is on it now (after each answer), keeping the drive for the next question.
export async function wipe(): Promise<void> {
  if (!mounted || !(await isMounted())) return;
  const r = await sh(["find", mounted, "-mindepth", "1", "-maxdepth", "1", "-exec", "rm", "-rf", "{}", "+"]);
  void r;
}
