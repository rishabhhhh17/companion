#!/usr/bin/env python3
"""Tests for analyze.py: every check must pass a good log and fail a bad one.

Run: python3 -m unittest spikes/a-panel/scripts/test_analyze.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze as A  # noqa: E402

FRONT = {"name": "Terminal", "bid": "com.apple.Terminal", "pid": 100}
US = {"name": "Panel Spike", "bid": A.OUR_BID, "pid": 4242}


class Log:
    def __init__(self, mode="a"):
        self.t = 1000
        self.seq = 0
        self.events = []
        self.mode = mode

    def add(self, ev, dt=10, **kw):
        self.t += dt
        self.seq += 1
        e = {"v": 1, "run": "r1", "seq": self.seq, "t": self.t, "ms": self.t - 1000, "ev": ev,
             "mode": self.mode, "afm": True, "preset": 0, "build": "dev", "cfg_src": "default"}
        e.update(kw)
        self.events.append(e)
        return self

    def good_launch(self):
        self.add("launch", front_before=FRONT, pid=4242, exe="x", macos="27.0.1", cfg={})
        self.add("panel_created", label="dock", **{"class": "DockPanelA"}, cbk=True, bkoin=True, float=True, hod=False,
                 style_raw=128, nonactivating=True, style_ok=True, afm=True)
        self.add("preset_applied", label="dock", idx=0, level_req=3, level_name="floating", level_rb=3,
                 beh_name="A", beh_req=337, beh_rb=337, exception=False, visible=False)
        self.add("redock_done", reason="launch", ms=5, frame=[1252, 33, 260, 220], work=[0, 33, 1512, 949],
                 inside_work=True, cause="immediate")
        self.add("hotkey_registered", id="P", combo="x", action="next_preset", ok=True, err=None)
        self.add("policy_set", policy="accessory")
        self.add("launch_settled", dt=5000, at="+5s", front=FRONT, app_active=False, panel_visible=True,
                 panel_key=False, frame=[1252, 33, 260, 220])
        return self

    def status(self, cid, **kw):
        return A.analyze_run(self.events, **kw)[cid]["status"]


class TestChecks(unittest.TestCase):
    def test_good_launch_passes_everything_relevant(self):
        L = Log().good_launch()
        for cid in ["C1", "C2", "C8", "C9", "C12", "C13", "C14"]:
            self.assertEqual(L.status(cid), "PASS", cid)

    def test_c1_activation_fails(self):
        L = Log().good_launch().add("app_became_active", front=US)
        self.assertEqual(L.status("C1"), "FAIL")

    def test_c2_front_app_fails(self):
        L = Log().good_launch().add("front_app_changed", **{"from": "com.apple.Terminal"}, to=US, via="notify")
        self.assertEqual(L.status("C2"), "FAIL")

    def test_c3_key_on_request_passes_and_unrequested_fails(self):
        L = Log().good_launch().add("key_requested", label="dock", source="textbox").add(
            "became_key", dt=40, label="dock", front=FRONT, app_active=False, since_key_request_ms=40)
        self.assertEqual(L.status("C3"), "PASS")
        L2 = Log().good_launch().add("native_mousedown", label="dock", key_before=False, app_active=False).add(
            "became_key", dt=20, label="dock", front=FRONT, app_active=False, since_key_request_ms=None)
        self.assertEqual(L2.status("C3"), "FAIL")

    def test_c4_mode_b(self):
        L = Log("b").good_launch().add("card_opened", source="hotkey").add(
            "became_key", dt=30, label="card", front=FRONT, app_active=False, since_key_request_ms=30)
        self.assertEqual(L.status("C4"), "PASS")
        L2 = Log("b").good_launch().add("became_key", label="dock", front=FRONT, app_active=False, since_key_request_ms=None)
        self.assertEqual(L2.status("C4"), "FAIL")

    def test_c5_swallowed_click_and_count(self):
        L = Log().good_launch().add("mark", n=1)
        for _ in range(10):
            L.add("native_mousedown", label="dock", key_before=False, app_active=False)
            L.add("ui_event", dt=5, label="dock", kind="pointerdown", target="character", len=None)
            L.add("char_click", dt=5, n=1, js_ts=1.0)
        self.assertEqual(L.status("C5", expect_clicks=10), "PASS")
        self.assertEqual(L.status("C5", expect_clicks=9), "FAIL")
        L.add("native_mousedown", dt=1000, label="dock", key_before=False, app_active=False)
        self.assertEqual(L.status("C5"), "FAIL")

    def test_c6_esc(self):
        kw = dict(label="dock", reason="esc", len=5, is_key_after=False, app_key_window_after=False)
        L = Log().good_launch().add("key_release", still_key_after=False, fallback_used=False,
                                    key_after_fallback=False, app_active=False, **kw)
        self.assertEqual(L.status("C6"), "PASS")
        L2 = Log().good_launch().add("key_release", still_key_after=True, fallback_used=True,
                                     key_after_fallback=True, app_active=False, **kw)
        self.assertEqual(L2.status("C6"), "FAIL")
        # isKeyWindow cleared but the app is still active: typing can't go back.
        L3 = Log().good_launch().add("key_release", still_key_after=False, fallback_used=False,
                                     key_after_fallback=False, app_active=True, **kw)
        self.assertEqual(L3.status("C6"), "FAIL")
        L4 = Log("b").good_launch().add("card_close_check", key_after=False, app_key_window=True, app_active=False)
        self.assertEqual(L4.status("C6"), "FAIL")

    def test_c7_redock(self):
        L = Log().good_launch().add("monitors_changed", old="a|b", new=[], trigger="notification", pref_missing=True).add(
            "redock_done", dt=300, reason="display_change", ms=300, frame=[0, 0, 1, 1], work=[0, 0, 9, 9],
            inside_work=True, cause="did_move")
        self.assertEqual(L.status("C7"), "PASS")
        L2 = Log().good_launch().add("monitors_changed", old="a|b", new=[], trigger="notification", pref_missing=True).add(
            "redock_done", dt=2500, reason="display_change", ms=2500, frame=[0, 0, 1, 1], work=[0, 0, 9, 9],
            inside_work=True, cause="did_move")
        self.assertEqual(L2.status("C7"), "FAIL")

    def test_c8_outside_work_area(self):
        L = Log().good_launch().add("redock_done", reason="x", ms=1, frame=[0, 0, 1, 1], work=[5, 5, 1, 1],
                                    inside_work=False, cause="x")
        self.assertEqual(L.status("C8"), "FAIL")

    def test_c9_failed_hotkey(self):
        L = Log().good_launch().add("hotkey_registered", id="D", combo="x", action="toggle_dock", ok=False, err="taken")
        self.assertEqual(L.status("C9"), "FAIL")

    def test_c10_space_change_counts_only_after_our_activation(self):
        L = Log().good_launch().add("native_mousedown", label="dock", key_before=False, app_active=False).add(
            "space_changed", dt=200, front=FRONT)
        self.assertEqual(L.status("C10"), "PASS")
        L2 = Log().good_launch().add("native_mousedown", label="dock", key_before=False, app_active=False).add(
            "app_became_active", dt=50, front=US).add("space_changed", dt=300, front=FRONT)
        self.assertEqual(L2.status("C10"), "FAIL")

    def test_c12_js_gap(self):
        L = Log().good_launch().add("js_gap", label="dock", gap_ms=5000, n=3)
        self.assertEqual(L.status("C12"), "FAIL")

    def test_c13_privacy(self):
        L = Log().good_launch().add("ui_event", label="dock", kind="keydown", target="textbox", len=3, text="hello")
        self.assertEqual(L.status("C13"), "FAIL")
        L2 = Log().good_launch().add("error", where="x", msg=A.CANARY)
        self.assertEqual(L2.status("C13"), "FAIL")

    def test_c14_launch_steals_front(self):
        L = Log()
        L.add("launch", front_before=FRONT, pid=4242, exe="x", macos="27", cfg={})
        L.add("policy_set", policy="accessory")
        L.add("launch_settled", dt=5000, at="+5s", front=US, app_active=True, panel_visible=True, panel_key=True, frame=None)
        self.assertEqual(L.status("C14"), "FAIL")


class TestReviewFixes(unittest.TestCase):
    def test_c1_catches_app_active_before_the_notification(self):
        L = Log().good_launch().add("native_mousedown", label="dock", key_before=False, app_active=False).add(
            "became_key", dt=4, label="dock", front=FRONT, app_active=True, since_key_request_ms=None)
        r = A.analyze_run(L.events)["C1"]
        self.assertEqual(r["status"], "FAIL")
        self.assertIn("click on the dock", r["detail"])

    def test_c3_requested_but_app_active_fails(self):
        L = Log().good_launch().add("key_requested", label="dock", source="hotkey").add(
            "became_key", dt=30, label="dock", front=FRONT, app_active=True, since_key_request_ms=30)
        self.assertEqual(L.status("C3"), "FAIL")

    def test_c3_textbox_click_slightly_before_request_is_requested(self):
        L = Log().good_launch().add("native_mousedown", label="dock", key_before=False, app_active=False).add(
            "became_key", dt=4, label="dock", front=FRONT, app_active=False, since_key_request_ms=None).add(
            "key_requested", dt=5, label="dock", source="textbox")
        self.assertEqual(L.status("C3"), "PASS")

    def test_c4_card_clicked_again_is_fine(self):
        L = Log("b").good_launch().add("card_opened", source="hotkey").add(
            "key_requested", dt=5000, label="card", source="textbox").add(
            "became_key", dt=20, label="card", front=FRONT, app_active=False, since_key_request_ms=20)
        self.assertEqual(L.status("C4"), "PASS")

    def test_c5_needs_a_mark_and_checks_an_empty_last_segment(self):
        L = Log().good_launch()
        self.assertEqual(L.status("C5", expect_clicks=10), "FAIL")
        L.add("mark", n=1)
        self.assertEqual(L.status("C5", expect_clicks=10), "FAIL")

    def test_c5_one_pointerdown_cannot_cover_two_clicks(self):
        L = Log().good_launch().add("mark", n=1)
        L.add("native_mousedown", label="dock", key_before=False, app_active=False)
        L.add("native_mousedown", dt=50, label="dock", key_before=False, app_active=False)
        L.add("ui_event", dt=5, label="dock", kind="pointerdown", target="character", len=None)
        self.assertEqual(L.status("C5"), "FAIL")

    def test_c8_timeout_fails(self):
        L = Log().good_launch().add("redock_timeout", reason="x", target=[0, 0, 1, 1], frame=None)
        self.assertEqual(L.status("C8"), "FAIL")

    def test_c9_error_without_hotkeys_fails(self):
        L = Log().add("launch", front_before=FRONT, pid=4242, exe="x", macos="27", cfg={}).add(
            "error", where="setup", msg="to_panel failed")
        self.assertEqual(L.status("C9"), "FAIL")

    def test_c11_covered_panel_is_not_seen(self):
        L = Log().good_launch().add("space_sample", sample={"label": "dock", "visible": True, "on_active_space": True,
                                                             "occl_visible": False, "key": False, "level": 3,
                                                             "frame": None}, front=FRONT)
        self.assertIn("0 seen / 1 covered", A.analyze_run(L.events)["C11"]["detail"])

    def test_c12_gap_while_hidden_is_ignored(self):
        L = Log().good_launch().add("panel_hidden", label="dock", source="hotkey").add(
            "js_gap", dt=3000, label="dock", gap_ms=3500, n=5)
        self.assertEqual(L.status("C12"), "PASS")

    def test_c15_keyboard_never_returned(self):
        L = Log().good_launch().add("became_key", label="card", front=FRONT, app_active=False,
                                    since_key_request_ms=None).add("quit")
        self.assertEqual(L.status("C15"), "FAIL")

    def test_unknown_run_exits_2(self):
        import tempfile, json
        L = Log().good_launch()
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            for e in L.events:
                f.write(json.dumps(e) + "\n")
        self.assertEqual(A.main([f.name, "--run", "nope"]), 2)
        os.unlink(f.name)


class TestLaunchWithUserActivity(unittest.TestCase):
    def test_other_app_taking_front_is_not_our_failure(self):
        L = Log()
        L.add("launch", front_before=FRONT, pid=4242, exe="x", macos="27", cfg={})
        L.add("policy_set", policy="accessory")
        other = {"name": "Claude", "bid": "com.anthropic.claudefordesktop", "pid": 7}
        L.add("front_app_changed", dt=1000, **{"from": "com.apple.Terminal"}, to=other, via="notify")
        L.add("launch_settled", dt=4000, at="+5s", front=other, app_active=False, panel_visible=True, panel_key=False, frame=None)
        r = A.analyze_run(L.events)["C14"]
        self.assertEqual(r["status"], "PASS")
        self.assertIn("by another app", r["detail"])


if __name__ == "__main__":
    unittest.main()
