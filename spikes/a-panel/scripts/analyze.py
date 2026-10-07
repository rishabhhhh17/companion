#!/usr/bin/env python3
"""Turn Panel Spike's event log into pass or fail per check.

Usage:
  analyze.py [LOG] [--run latest|all|RUN_ID] [--expect-clicks N] [--json]

LOG defaults to ~/Library/Application Support/dev.companion.spike.panel/events.jsonl.
Python 3.9 compatible (the system Python on this Mac). No installs.

Each check says PASS, FAIL or SKIP (no relevant events in the log). The log cannot
see letters landing in Terminal, the menu bar, or what is visible on screen; those
need eyes and recordings (TESTING.md).
"""
import argparse
import json
import os
import sys
from collections import OrderedDict

DEFAULT_LOG = os.path.expanduser("~/Library/Application Support/dev.companion.spike.panel/events.jsonl")
OUR_BID = "dev.companion.spike.panel"
CANARY = "PANELSPIKECANARY"

# Keys any line may carry. Anything else is a privacy lint failure (C13).
COMMON_KEYS = {"v", "run", "seq", "t", "ms", "ev", "mode", "afm", "preset", "build", "cfg_src"}
EVENT_KEYS = {
    "launch": {"front_before", "pid", "exe", "macos", "cfg"},
    "policy_set": {"policy"},
    "launch_settled": {"at", "front", "app_active", "panel_visible", "panel_key", "frame"},
    "panel_created": {"label", "class", "cbk", "bkoin", "float", "hod", "style_raw", "nonactivating", "style_ok", "afm"},
    "panel_shown": {"label", "source"},
    "panel_hidden": {"label", "source"},
    "became_key": {"label", "front", "app_active", "since_key_request_ms"},
    "resigned_key": {"label", "front", "app_active"},
    "app_became_active": {"front"},
    "app_resigned_active": {"front"},
    "front_app_changed": {"from", "to", "via"},
    "space_changed": {"front"},
    "space_sample": {"sample", "front"},
    "occlusion_changed": {"label", "visible"},
    "native_mousedown": {"label", "key_before", "app_active"},
    "ui_event": {"label", "kind", "target", "len"},
    "char_click": {"n", "js_ts"},
    "key_requested": {"label", "source"},
    "key_request_refused": {"label", "source", "why"},
    "key_release": {"label", "reason", "len", "still_key_after", "is_key_after", "app_key_window_after",
                    "fallback_used", "key_after_fallback", "app_active"},
    "card_close_check": {"key_after", "app_key_window", "app_active"},
    "webview_built": {"label", "app_active", "front"},
    "card_opened": {"source"},
    "card_closed": {"reason", "len"},
    "hotkey_registered": {"id", "combo", "action", "ok", "err"},
    "hotkey": {"id", "action"},
    "mark": {"n"},
    "preset_applied": {"label", "idx", "level_req", "level_name", "level_rb", "beh_name", "beh_req", "beh_rb", "exception", "visible"},
    "monitors_changed": {"old", "new", "trigger", "pref_missing"},
    "redock_start": {"reason", "how", "target_screen", "target", "work", "old"},
    "redock_done": {"reason", "ms", "frame", "work", "inside_work", "cause"},
    "redock_timeout": {"reason", "target", "frame"},
    "dock_pref_set": {"screen_id"},
    "compact": {"on"},
    "frame": {"label", "frame", "cause"},
    "js_gap": {"label", "gap_ms", "n"},
    "reopen": set(),
    "quit": set(),
    "error": {"where", "msg"},
}
TEXT_LIKE_KEYS = {"text", "value", "typed", "content", "input", "chars"}


def load(path):
    events = []
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except ValueError:
                events.append({"ev": "_unparseable", "line_no": i + 1, "run": "?", "t": 0})
    return events


def by_run(events):
    runs = OrderedDict()
    for e in events:
        runs.setdefault(e.get("run", "?"), []).append(e)
    for r in runs.values():
        r.sort(key=lambda e: (e.get("t", 0), e.get("seq", 0)))
    return runs


def our_pid(run):
    for e in run:
        if e.get("ev") == "launch":
            return e.get("pid")
    return None


def is_us(app, pid):
    if not isinstance(app, dict):
        return False
    return app.get("bid") == OUR_BID or (pid is not None and app.get("pid") == pid)


def segments(run):
    """Split a run at `mark` events. Segment 0 is before the first mark."""
    segs = [[]]
    for e in run:
        if e.get("ev") == "mark":
            segs.append([])
        segs[-1].append(e)
    return segs


def result(status, detail=""):
    return {"status": status, "detail": detail}


def activations(run):
    """Every sign that Panel Spike was the active app: the notification (which can
    lag by over a second), any event logged with app_active true, or the front
    app becoming us. Returns events, earliest first."""
    pid = our_pid(run)
    out = []
    for e in run:
        if e.get("ev") == "app_became_active":
            out.append(e)
        elif e.get("app_active") is True:
            out.append(e)
        elif e.get("ev") == "front_app_changed" and is_us(e.get("to"), pid):
            out.append(e)
    return out


def _cause(run, first):
    for e in run:
        if e.get("ev") in ("webview_built", "reopen") and 0 <= first["t"] - e["t"] <= 400:
            return " (right after %s)" % ("a webview was built" if e["ev"] == "webview_built" else "the app was reopened")
    clicks = [e for e in run if e.get("ev") == "native_mousedown" and 0 <= first["t"] - e["t"] <= 100]
    if clicks:
        return " (right after a click on the %s)" % clicks[-1].get("label")
    return ""


def c1_no_activation(run):
    hits = activations(run)
    if hits:
        first = hits[0]
        return result("FAIL", "Panel Spike was the active app (%d signal(s)), first at +%sms via %s%s"
                      % (len(hits), first.get("ms"), first.get("ev"), _cause(run, first)))
    return result("PASS", "never became the active app")


def c2_never_front(run):
    pid = our_pid(run)
    bad = [e for e in run if e.get("ev") == "front_app_changed" and is_us(e.get("to"), pid)]
    bad += [e for e in run if e.get("ev") == "launch_settled" and is_us(e.get("front"), pid)]
    if bad:
        return result("FAIL", "Panel Spike was the front app %d time(s)" % len(bad))
    if not any(e.get("ev") in ("front_app_changed", "launch_settled") for e in run):
        return result("SKIP", "no front app samples")
    return result("PASS", "never the front app")


def c3_mode_a_key_only_on_request(run):
    if not run or run[0].get("mode") != "a":
        return result("SKIP", "not mode A")
    keys = [e for e in run if e.get("ev") == "became_key" and e.get("label") == "dock"]
    reqs = [e for e in run if e.get("ev") == "key_requested" and e.get("label") == "dock"]
    clicks = [e for e in run if e.get("ev") == "native_mousedown" and e.get("label") == "dock"]
    bad = []
    for k in keys:
        requested = any(0 <= k["t"] - r["t"] <= 1500 for r in reqs)
        # A click on the text box makes the panel key a few ms before the page's
        # request arrives: count that as requested.
        if not requested:
            requested = any(0 <= r["t"] - k["t"] <= 80 and r.get("source") == "textbox" for r in reqs)
        near = [c for c in clicks if abs(k["t"] - c["t"]) <= 300]
        if not requested:
            bad.append("at +%sms without a request%s" % (k.get("ms"), " (a click made it key)" if near else ""))
        elif k.get("app_active") is True:
            bad.append("at +%sms the app was active when the panel took the keyboard" % k.get("ms"))
    if bad:
        return result("FAIL", "dock: " + "; ".join(bad[:5]))
    if not keys:
        return result("PASS", "dock never became key")
    return result("PASS", "dock became key %d time(s), each right after a request" % len(keys))


def c4_mode_b_dock_never_key(run):
    if not run or run[0].get("mode") != "b":
        return result("SKIP", "not mode B")
    dock_keys = [e for e in run if e.get("ev") == "became_key" and e.get("label") == "dock"]
    card_keys = [e for e in run if e.get("ev") == "became_key" and e.get("label") == "card"]
    opens = [e for e in run if e.get("ev") == "card_opened"]
    opens += [e for e in run if e.get("ev") == "key_requested" and e.get("label") == "card"]
    bad_card = [k for k in card_keys if not any(-80 <= k["t"] - o["t"] <= 1500 for o in opens)]
    active = [k for k in card_keys if k.get("app_active") is True]
    if dock_keys:
        return result("FAIL", "the never key dock became key %d time(s)" % len(dock_keys))
    if bad_card:
        return result("FAIL", "the card became key without being opened or clicked %d time(s)" % len(bad_card))
    if active:
        return result("FAIL", "the app was active when the card took the keyboard %d time(s)" % len(active))
    return result("PASS", "dock never key; card key only after opening (%d)" % len(card_keys))


def _unmatched(natives, downs, window=300):
    """Match each native click to at most one page pointerdown, nearest first."""
    free = list(downs)
    missing = []
    for n in natives:
        best = None
        for d in free:
            gap = abs(d["t"] - n["t"])
            if gap <= window and (best is None or gap < abs(best["t"] - n["t"])):
                best = d
        if best is None:
            missing.append(n)
        else:
            free.remove(best)
    return missing


def c5_no_swallowed_clicks(run, expect_clicks=None):
    out = []
    any_clicks = False
    segs = segments(run)
    if expect_clicks is not None and len(segs) == 1:
        return result("FAIL", "no test segment: press Ctrl+Option+Cmd+R before the clicks")
    for i, seg in enumerate(segs):
        natives = [e for e in seg if e.get("ev") == "native_mousedown" and e.get("label") == "dock"]
        downs = [e for e in seg if e.get("ev") == "ui_event" and e.get("kind") == "pointerdown" and e.get("label") == "dock"]
        clicks = [e for e in seg if e.get("ev") == "char_click"]
        last = i == len(segs) - 1
        if not natives and not clicks and not (expect_clicks is not None and last and i > 0):
            continue
        any_clicks = any_clicks or bool(natives or clicks)
        swallowed = _unmatched(natives, downs)
        line = "segment %d: %d native clicks, %d swallowed, %d character clicks" % (i, len(natives), len(swallowed), len(clicks))
        ok = not swallowed
        if expect_clicks is not None and i > 0:
            ok = ok and len(clicks) == expect_clicks
            line += " (expected %d)" % expect_clicks
        out.append((ok, line))
    if not out:
        return result("SKIP", "no clicks")
    status = "PASS" if all(ok for ok, _ in out) else "FAIL"
    return result(status, "; ".join(l for _, l in out))


def c6_esc_hands_back(run):
    rel = [e for e in run if e.get("ev") == "key_release"]
    closes = [e for e in run if e.get("ev") == "card_close_check"]
    if not rel and not closes:
        return result("SKIP", "no Esc used")
    still = [r for r in rel if r.get("key_after_fallback")]
    active = [r for r in rel if r.get("app_active") is True] + [c for c in closes if c.get("app_active") is True]
    card_still = [c for c in closes if c.get("key_after") or c.get("app_key_window")]
    fallback = sum(1 for r in rel if r.get("fallback_used"))
    detail = "%d Esc releases (hide and show fallback needed %d), %d card closes" % (len(rel), fallback, len(closes))
    problems = []
    if still:
        problems.append("panel still had the keyboard after Esc %d time(s)" % len(still))
    if card_still:
        problems.append("card still had the keyboard after closing %d time(s)" % len(card_still))
    if active:
        problems.append("Panel Spike was the active app at Esc %d time(s), so typing could not go back" % len(active))
    if problems:
        return result("FAIL", detail + "; " + "; ".join(problems))
    return result("PASS", detail)


def c15_keyboard_returned(run):
    keys = [e for e in run if e.get("ev") in ("became_key", "resigned_key")]
    if not keys:
        return result("SKIP", "no panel ever took the keyboard")
    held = []
    for label in sorted(set(e.get("label") for e in keys)):
        mine = [e for e in keys if e.get("label") == label]
        if mine[-1].get("ev") == "became_key":
            held.append(label)
    if not held:
        return result("PASS", "every panel that took the keyboard gave it back")
    ended = any(e.get("ev") == "quit" for e in run)
    return result("FAIL" if ended else "INFO", "still holding the keyboard at the end: %s%s"
                  % (", ".join(held), "" if ended else " (run may still be going)"))


def c7_redock_fast(run):
    changes = [e for e in run if e.get("ev") == "monitors_changed" and e.get("old")]
    if not changes:
        return result("SKIP", "no display changes")
    dones = [e for e in run if e.get("ev") == "redock_done" and e.get("reason") == "display_change"]
    bad = []
    for c in changes:
        d = [x for x in dones if 0 <= x["t"] - c["t"] <= 2000]
        if not d:
            bad.append("no redock within 2 s at +%sms" % c.get("ms"))
        elif not d[0].get("inside_work", False):
            bad.append("redocked outside the work area at +%sms" % d[0].get("ms"))
    if bad:
        return result("FAIL", "; ".join(bad))
    return result("PASS", "%d display change(s), each redocked within 2 s" % len(changes))


def _inside(f, w, e=1.0):
    return (f[0] >= w[0] - e and f[1] >= w[1] - e and f[0] + f[2] <= w[0] + w[2] + e and f[1] + f[3] <= w[1] + w[3] + e)


def c8_inside_work_area(run):
    dones = [e for e in run if e.get("ev") == "redock_done"]
    timeouts = [e for e in run if e.get("ev") == "redock_timeout"]
    if not dones and not timeouts:
        return result("SKIP", "no docking")
    problems = []
    bad = [d for d in dones if not d.get("inside_work", False)]
    if bad:
        problems.append("%d dock position(s) outside the work area" % len(bad))
    if timeouts:
        problems.append("%d redock(s) never arrived" % len(timeouts))
    starts = [e for e in run if e.get("ev") == "redock_start" and e.get("work")]
    frames = [e for e in run if e.get("ev") == "frame" and e.get("label") == "dock" and e.get("frame")]
    if starts and frames and frames[-1]["t"] > starts[-1]["t"]:
        if not _inside(frames[-1]["frame"], starts[-1]["work"]):
            problems.append("the dock ended outside the latest work area")
    if problems:
        return result("FAIL", "; ".join(problems))
    return result("PASS", "%d dock position(s), all inside the work area" % len(dones))


def c9_setup_sane(run):
    problems = []
    hk = [e for e in run if e.get("ev") == "hotkey_registered"]
    problems += ["hotkey %s failed: %s" % (h.get("id"), h.get("err")) for h in hk if not h.get("ok")]
    for p in (e for e in run if e.get("ev") == "preset_applied"):
        if p.get("exception"):
            problems.append("preset %s raised an exception" % p.get("idx"))
        if p.get("level_rb") != p.get("level_req") or p.get("beh_rb") != p.get("beh_req"):
            problems.append("preset %s read back differently" % p.get("idx"))
    for c in (e for e in run if e.get("ev") == "panel_created"):
        if not c.get("nonactivating"):
            problems.append("panel %s is not non activating" % c.get("label"))
    if any(e.get("ev") == "error" for e in run):
        problems.append("error events present")
    if not hk and not problems:
        return result("SKIP", "no setup events")
    return result("FAIL" if problems else "PASS", "; ".join(problems) if problems else "%d hotkeys registered; presets and style read back" % len(hk))


def c10_click_never_switches_space(run):
    clicks = [e for e in run if e.get("ev") == "native_mousedown" and e.get("label") in ("dock", "card")]
    if not clicks:
        return result("SKIP", "no clicks on the panels")
    acts = activations(run)
    spaces = [e for e in run if e.get("ev") == "space_changed"]
    # A Space change is Panel Spike's doing only if it follows Panel Spike activating.
    bad = [s for s in spaces if any(0 <= s["t"] - a["t"] <= 2500 for a in acts)]
    if bad:
        return result("FAIL", "a Space change followed Panel Spike activating %d time(s)" % len(bad))
    return result("PASS", "no Space change caused by %d click(s)" % len(clicks))


def c11_space_table(run):
    samples = [e for e in run if e.get("ev") == "space_sample" and (e.get("sample") or {}).get("label") == "dock"]
    if not samples:
        return result("SKIP", "no Space changes")
    table = OrderedDict()
    for s in samples:
        k = s.get("preset")
        sm = s.get("sample") or {}
        # isVisible and isOnActiveSpace stay true under a covering full screen app;
        # only the occlusion state says whether any of the panel can be seen.
        ok = bool(sm.get("visible")) and bool(sm.get("on_active_space")) and bool(sm.get("occl_visible"))
        t = table.setdefault(k, [0, 0])
        t[0 if ok else 1] += 1
    detail = ", ".join("preset %s: %d seen / %d covered or missing" % (k, v[0], v[1]) for k, v in table.items())
    return result("INFO", detail)


def c12_no_js_gaps(run):
    hidden = [e["t"] for e in run if e.get("ev") == "panel_hidden"]
    gaps = [e for e in run if e.get("ev") == "js_gap"
            and not any(e["t"] - e.get("gap_ms", 0) <= h <= e["t"] for h in hidden)]
    if gaps:
        return result("FAIL", "%d JS pause(s) over 2 s, longest %d ms" % (len(gaps), max(g.get("gap_ms", 0) for g in gaps)))
    return result("PASS", "no JS pauses over 2 s")


def c13_privacy(run):
    problems = []
    for e in run:
        name = e.get("ev")
        allowed = COMMON_KEYS | EVENT_KEYS.get(name, set())
        if name not in EVENT_KEYS:
            problems.append("unknown event %s" % name)
            continue
        extra = set(e.keys()) - allowed
        if extra:
            problems.append("%s has unexpected keys %s" % (name, sorted(extra)))
        flat = json.dumps(e)
        if CANARY.lower() in flat.lower():
            problems.append("%s contains the typed canary" % name)
        if any(k in TEXT_LIKE_KEYS for k in e.keys()):
            problems.append("%s has a text like key" % name)
    if problems:
        return result("FAIL", "; ".join(sorted(set(problems))[:6]))
    return result("PASS", "only allowed keys; no typed text")


def c14_quiet_launch(run):
    launch = next((e for e in run if e.get("ev") == "launch"), None)
    if not launch:
        return result("SKIP", "no launch")
    before = (launch.get("front_before") or {}).get("bid")
    settled = [e for e in run if e.get("ev") == "launch_settled" and e.get("at") == "+5s"]
    early = [e for e in run if e.get("ev") == "app_became_active" and e.get("ms", 0) <= 5000]
    policy = any(e.get("ev") == "policy_set" for e in run)
    problems = []
    if early:
        problems.append("became active during launch")
    if not policy:
        problems.append("accessory policy not set")
    if not settled:
        return result("SKIP" if not problems else "FAIL", "; ".join(problems) or "no +5s sample yet")
    after_app = settled[-1].get("front") or {}
    after = after_app.get("bid")
    note = ""
    if is_us(after_app, our_pid(run)):
        problems.append("Panel Spike was the front app at +5s")
    elif after != before:
        # Something else (usually the person at the Mac) changed apps. Not our doing,
        # but it means this launch proves less: report it.
        changes = [e for e in run if e.get("ev") == "front_app_changed" and e.get("ms", 0) <= 6000]
        who = ", ".join(sorted(set(str((e.get("to") or {}).get("bid")) for e in changes))) or after
        note = " (front changed to %s by another app, not Panel Spike)" % who
    if settled[-1].get("panel_visible") is not True:
        problems.append("panel not visible at +5s")
    if settled[-1].get("panel_key"):
        problems.append("panel was key at +5s")
    if settled[-1].get("app_active") is True:
        problems.append("Panel Spike was the active app at +5s")
    if problems:
        return result("FAIL", "; ".join(problems))
    if note:
        return result("PASS", "Panel Spike never took the front; panel visible, not key" + note)
    return result("PASS", "front app stayed %s; panel visible, not key" % before)


CHECKS = [
    ("C1", "Never became the active app", c1_no_activation),
    ("C2", "Never the front app", c2_never_front),
    ("C3", "Mode A: dock key only on request", c3_mode_a_key_only_on_request),
    ("C4", "Mode B: dock never key", c4_mode_b_dock_never_key),
    ("C5", "No swallowed clicks", c5_no_swallowed_clicks),
    ("C6", "Esc hands typing back", c6_esc_hands_back),
    ("C7", "Redock within 2 s", c7_redock_fast),
    ("C8", "Docked inside the work area", c8_inside_work_area),
    ("C9", "Setup sane (hotkeys, presets, style)", c9_setup_sane),
    ("C10", "A click never switches Space", c10_click_never_switches_space),
    ("C11", "Visible after Space changes (evidence)", c11_space_table),
    ("C12", "No JS pauses", c12_no_js_gaps),
    ("C13", "Privacy: no typed text in the log", c13_privacy),
    ("C14", "Quiet launch", c14_quiet_launch),
    ("C15", "Keyboard always handed back", c15_keyboard_returned),
]


def analyze_run(run, expect_clicks=None):
    out = OrderedDict()
    for cid, title, fn in CHECKS:
        r = fn(run, expect_clicks) if fn is c5_no_swallowed_clicks else fn(run)
        out[cid] = dict(r, title=title)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("log", nargs="?", default=DEFAULT_LOG)
    ap.add_argument("--run", default="latest")
    ap.add_argument("--expect-clicks", type=int, default=None)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    if not os.path.exists(a.log):
        print("No log at %s" % a.log)
        return 2
    runs = by_run(load(a.log))
    if not runs:
        print("Log is empty")
        return 2
    ids = list(runs.keys())
    pick = ids if a.run == "all" else [ids[-1]] if a.run == "latest" else [a.run]
    missing = [r for r in pick if r not in runs]
    if missing:
        print("No such run: %s. Runs in the log: %s" % (", ".join(missing), ", ".join(ids[-5:])))
        return 2
    report = OrderedDict()
    failed = False
    for rid in pick:
        run = runs.get(rid, [])
        res = analyze_run(run, a.expect_clicks)
        head = run[0] if run else {}
        report[rid] = {"mode": head.get("mode"), "afm": head.get("afm"), "build": head.get("build"), "checks": res}
        failed = failed or any(v["status"] == "FAIL" for v in res.values())
    if a.json:
        print(json.dumps(report, indent=1))
    else:
        for rid, r in report.items():
            print("Run %s  mode %s  AFM %s  %s build" % (rid, r["mode"], r["afm"], r["build"]))
            for cid, v in r["checks"].items():
                print("  %-4s %-5s %-40s %s" % (cid, v["status"], v["title"], v["detail"]))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
