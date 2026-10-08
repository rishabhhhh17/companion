// Spike (d): read and paste text in other apps. Throwaway code.
// Rules: touches another app's text only when the user presses a hotkey, with an
// indicator lit first. Logs lengths and a short hash, never the text itself.
import AppKit
import ApplicationServices
import Carbon
import CryptoKit

let dataDir = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/dev.companion.spike.paste")
let logURL = dataDir.appendingPathComponent("events.jsonl")
let runID = "\(Int(Date().timeIntervalSince1970 * 1000))-\(getpid())"
let t0 = Date()
var seq = 0

func ms(_ d: Date) -> Int { Int(Date().timeIntervalSince(d) * 1000) }
func sha(_ s: String) -> String { SHA256.hash(data: Data(s.utf8)).prefix(6).map { String(format: "%02x", $0) }.joined() }
func frontApp() -> NSRunningApplication? { NSWorkspace.shared.frontmostApplication }

func log(_ ev: String, _ extra: [String: Any] = [:]) {
    seq += 1
    var d: [String: Any] = ["run": runID, "seq": seq, "ev": ev, "ms": ms(t0), "t": Int(Date().timeIntervalSince1970 * 1000)]
    for (k, v) in extra { d[k] = v }
    guard let data = try? JSONSerialization.data(withJSONObject: d), var line = String(data: data, encoding: .utf8) else { return }
    line += "\n"
    if let h = try? FileHandle(forWritingTo: logURL) { h.seekToEndOfFile(); h.write(Data(line.utf8)); try? h.close() }
    else { try? line.write(to: logURL, atomically: false, encoding: .utf8) }
}

// The fixed "improved prompt": a link, a code span, an emoji and a Hindi word.
let improved = "Improved prompt: see https://example.com/docs and run `npm test` first. Done \u{1F680} \u{0928}\u{092E}\u{0938}\u{094D}\u{0924}\u{0947}"

let terminals: Set<String> = ["com.apple.Terminal", "com.googlecode.iterm2", "dev.warp.Warp-Stable", "com.mitchellh.ghostty"]

// MARK: indicator panel (non activating)
final class Indicator {
    let panel: NSPanel
    let label = NSTextField(labelWithString: "")
    init() {
        panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 360, height: 44), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.level = .floating
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.backgroundColor = .white
        label.frame = NSRect(x: 12, y: 12, width: 336, height: 20)
        label.textColor = .black
        label.font = .systemFont(ofSize: 14)
        panel.contentView?.addSubview(label)
        if let vf = NSScreen.main?.visibleFrame { panel.setFrameOrigin(NSPoint(x: vf.midX - 180, y: vf.maxY - 80)) }
    }
    func show(_ text: String) { label.stringValue = text; panel.orderFrontRegardless() }
    func hide() { panel.orderOut(nil) }
}

// MARK: accessibility helpers
func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
    var v: CFTypeRef?
    return AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success ? (v as AnyObject?) : nil
}
func str(_ el: AXUIElement, _ name: String) -> String? { attr(el, name) as? String }

func focusedElement(_ app: AXUIElement) -> AXUIElement? {
    guard let f = attr(app, kAXFocusedUIElementAttribute as String) else { return nil }
    return (f as! AXUIElement)
}

struct ReadResult {
    var text: String?
    var rung: String
    var secure = false
    var role = ""
    var hadSelection = false
    var element: AXUIElement?
}

func readField(_ el: AXUIElement) -> (String?, Bool, Bool) {
    // selected text first, otherwise the whole value
    if let s = str(el, kAXSelectedTextAttribute as String), !s.isEmpty { return (s, true, false) }
    if let v = str(el, kAXValueAttribute as String), !v.isEmpty { return (v, false, false) }
    return (nil, false, false)
}

func isSecure(_ el: AXUIElement) -> Bool {
    let sub = str(el, kAXSubroleAttribute as String) ?? ""
    let role = str(el, kAXRoleAttribute as String) ?? ""
    return sub == "AXSecureTextField" || role == "AXSecureTextField"
}

func pressEditCopy(_ app: AXUIElement) -> Bool {
    guard let bar = attr(app, kAXMenuBarAttribute as String) else { return false }
    let items = (attr(bar as! AXUIElement, kAXChildrenAttribute as String) as? [AXUIElement]) ?? []
    for top in items where str(top, kAXTitleAttribute as String) == "Edit" {
        let sub = (attr(top, kAXChildrenAttribute as String) as? [AXUIElement])?.first
        let entries = (sub.flatMap { attr($0, kAXChildrenAttribute as String) as? [AXUIElement] }) ?? []
        for e in entries where str(e, kAXTitleAttribute as String) == "Copy" {
            return AXUIElementPerformAction(e, kAXPressAction as CFString) == .success
        }
    }
    return false
}

func readLadder(_ run: NSRunningApplication) -> ReadResult {
    let app = AXUIElementCreateApplication(run.processIdentifier)
    func attempt(_ rung: String) -> ReadResult? {
        guard let el = focusedElement(app) else { return nil }
        let role = str(el, kAXRoleAttribute as String) ?? ""
        if isSecure(el) { return ReadResult(text: nil, rung: rung, secure: true, role: role, element: el) }
        let (t, sel, _) = readField(el)
        if let t = t { return ReadResult(text: t, rung: rung, role: role, hadSelection: sel, element: el) }
        return nil
    }
    if let r = attempt("1_plain") { return r }
    // 2: reading the app's role wakes the basic tree in Chromium based apps; retry
    _ = str(app, kAXRoleAttribute as String)
    for i in 0..<3 { Thread.sleep(forTimeInterval: 0.4); if let r = attempt("2_role_retry_\(i + 1)") { return r } }
    // 3: Electron switch
    AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
    for i in 0..<3 { Thread.sleep(forTimeInterval: 0.7); if let r = attempt("3_manual_accessibility_\(i + 1)") { return r } }
    // 4: Chrome switch
    AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
    for i in 0..<3 { Thread.sleep(forTimeInterval: 0.7); if let r = attempt("4_enhanced_ui_\(i + 1)") { return r } }
    // 5: the app's own Edit > Copy
    let pb = NSPasteboard.general
    let before = pb.changeCount
    if pressEditCopy(app) {
        Thread.sleep(forTimeInterval: 0.3)
        if pb.changeCount != before, let s = pb.string(forType: .string), !s.isEmpty {
            return ReadResult(text: s, rung: "5_edit_copy", role: "", hadSelection: true, element: focusedElement(app))
        }
    }
    return ReadResult(text: nil, rung: "none", element: nil)
}

// MARK: pasteboard save and restore
struct Saved { var items: [[(NSPasteboard.PasteboardType, Data)]]; var count: Int }
func savePasteboard() -> Saved {
    let pb = NSPasteboard.general
    var out: [[(NSPasteboard.PasteboardType, Data)]] = []
    for item in pb.pasteboardItems ?? [] {
        var one: [(NSPasteboard.PasteboardType, Data)] = []
        for t in item.types { if let d = item.data(forType: t) { one.append((t, d)) } }
        out.append(one)
    }
    return Saved(items: out, count: pb.changeCount)
}
func restorePasteboard(_ s: Saved) {
    let pb = NSPasteboard.general
    pb.clearContents()
    var objs: [NSPasteboardItem] = []
    for one in s.items { let it = NSPasteboardItem(); for (t, d) in one { it.setData(d, forType: t) }; objs.append(it) }
    pb.writeObjects(objs)
}
func writeTransient(_ text: String) {
    let pb = NSPasteboard.general
    pb.clearContents()
    let it = NSPasteboardItem()
    it.setString(text, forType: .string)
    it.setData(Data(), forType: NSPasteboard.PasteboardType("org.nspasteboard.TransientType"))
    it.setData(Data(), forType: NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType"))
    pb.writeObjects([it])
}

func sendKey(_ key: CGKeyCode, flags: CGEventFlags) {
    let src = CGEventSource(stateID: .hidSystemState)
    for down in [true, false] {
        let e = CGEvent(keyboardEventSource: src, virtualKey: key, keyDown: down)
        e?.flags = flags
        e?.post(tap: .cghidEventTap)
    }
}
func waitForModifiersReleased() {
    let deadline = Date().addingTimeInterval(2)
    let mask: CGEventFlags = [.maskControl, .maskAlternate, .maskCommand, .maskShift]
    while Date() < deadline {
        let f = CGEventSource.flagsState(.combinedSessionState)
        if f.intersection(mask).isEmpty { return }
        Thread.sleep(forTimeInterval: 0.05)
    }
}

// MARK: the app
final class Spike: NSObject, NSApplicationDelegate {
    let indicator = Indicator()
    var pending: (pid: pid_t, bid: String, element: AXUIElement?, hadSelection: Bool, terminal: Bool)?
    var hotKeyRefs: [EventHotKeyRef?] = []
    var escRef: EventHotKeyRef?

    func applicationDidFinishLaunching(_ n: Notification) {
        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
        log("launch", ["macos": ProcessInfo.processInfo.operatingSystemVersionString, "front": frontApp()?.bundleIdentifier ?? "?"])
        installHotkeys()
    }

    func register(_ code: UInt32, mods: UInt32, id: UInt32) -> EventHotKeyRef? {
        var ref: EventHotKeyRef?
        let hid = EventHotKeyID(signature: OSType(0x50535044), id: id)
        let st = RegisterEventHotKey(code, mods, hid, GetApplicationEventTarget(), 0, &ref)
        log("hotkey_registered", ["id": Int(id), "ok": st == noErr])
        return st == noErr ? ref : nil
    }

    func installHotkeys() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, ev, _ in
            var hid = EventHotKeyID()
            GetEventParameter(ev, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &hid)
            DispatchQueue.main.async { (NSApp.delegate as! Spike).hotkey(Int(hid.id)) }
            return noErr
        }, 1, &spec, nil, nil)
        let m = UInt32(controlKey | optionKey | cmdKey)
        hotKeyRefs.append(register(UInt32(kVK_ANSI_R), mods: m, id: 1))   // read
        hotKeyRefs.append(register(UInt32(kVK_ANSI_A), mods: m, id: 2))   // accept
    }

    func hotkey(_ id: Int) {
        switch id {
        case 1: doRead()
        case 2: doAccept()
        case 3: cancel("esc")
        default: break
        }
    }

    func armEsc(_ on: Bool) {
        if on, escRef == nil { escRef = register(UInt32(kVK_Escape), mods: 0, id: 3) }
        if !on, let r = escRef { UnregisterEventHotKey(r); escRef = nil }
    }

    func doRead() {
        let t = Date()
        guard let front = frontApp() else { return }
        let bid = front.bundleIdentifier ?? "?"
        // Accessibility is asked the first time a read is used, never at launch.
        let trusted = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
        log("read_hotkey", ["app": bid, "trusted": trusted])
        guard trusted else { indicator.show("Allow Accessibility for Paste Spike, then press again"); DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.indicator.hide() }; return }
        indicator.show("Reading your text...")
        let isTerm = terminals.contains(bid)
        var r: ReadResult
        if isTerm {
            // Terminals: selection only, never send a key
            let app = AXUIElementCreateApplication(front.processIdentifier)
            let el = focusedElement(app)
            let s = el.flatMap { str($0, kAXSelectedTextAttribute as String) }
            r = ReadResult(text: (s?.isEmpty == false) ? s : nil, rung: "terminal_selection", role: "terminal", hadSelection: true, element: el)
        } else {
            r = readLadder(front)
        }
        let dt = ms(t)
        log("read_result", ["app": bid, "rung": r.rung, "ms": dt, "len": r.text?.count ?? -1, "hash": r.text.map(sha) ?? "", "secure": r.secure, "role": r.role, "selection": r.hadSelection, "empty": r.text == nil])
        if r.secure { indicator.show("Password field: not read"); DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.indicator.hide() }; return }
        guard r.text != nil else { indicator.show("Nothing read. See the log."); DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.indicator.hide() }; return }
        pending = (front.processIdentifier, bid, r.element, r.hadSelection, isTerm)
        armEsc(true)
        indicator.show(isTerm ? "Read. Accept copies it, then press Cmd+V. Esc cancels" : "Read. Accept pastes it. Esc cancels")
    }

    func doAccept() {
        guard let p = pending else { log("accept_without_read"); return }
        let t = Date()
        armEsc(false)
        indicator.hide()
        pending = nil
        let pb = NSPasteboard.general
        let saved = savePasteboard()
        let front = frontApp()
        var sameTarget = front?.processIdentifier == p.pid
        if sameTarget, let el = p.element {
            let app = AXUIElementCreateApplication(p.pid)
            if let now = focusedElement(app) { sameTarget = CFEqual(now, el) } else { sameTarget = false }
        }
        if p.terminal || !sameTarget {
            writeTransient(improved)
            indicator.show(p.terminal ? "Copied. Press Cmd+V" : "Copied instead. You switched apps")
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.indicator.hide() }
            log("accept", ["app": p.bid, "same_target": sameTarget, "pasted": false, "reason": p.terminal ? "terminal" : "moved", "ms": ms(t)])
            return
        }
        waitForModifiersReleased()
        writeTransient(improved)
        let ours = pb.changeCount
        if !p.hadSelection { sendKey(CGKeyCode(kVK_ANSI_A), flags: .maskCommand); Thread.sleep(forTimeInterval: 0.1) }
        sendKey(CGKeyCode(kVK_ANSI_V), flags: .maskCommand)
        Thread.sleep(forTimeInterval: 0.5)
        // read back
        var readback = ""
        if let el = focusedElement(AXUIElementCreateApplication(p.pid)) { readback = str(el, kAXValueAttribute as String) ?? "" }
        let ok = readback.contains(improved) || readback == improved
        var restored = false
        if pb.changeCount == ours { restorePasteboard(saved); restored = true }
        log("accept", ["app": p.bid, "same_target": true, "pasted": true, "readback_ok": ok, "readback_len": readback.count, "readback_hash": sha(readback),
                       "clipboard_restored": restored, "front_after": frontApp()?.bundleIdentifier ?? "?", "ms": ms(t)])
    }

    func cancel(_ why: String) {
        armEsc(false); indicator.hide(); pending = nil
        log("cancel", ["why": why])
    }
}

let app = NSApplication.shared
let delegate = Spike()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
