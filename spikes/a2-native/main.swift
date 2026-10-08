// Spike (a2): a non activating panel drawn with AppKit only (no web view).
// Question: does a click on it bring the app to the front on macOS 27?
import AppKit
import WebKit

let useWeb = ProcessInfo.processInfo.environment["NATIVE_WEBVIEW"] == "1"

let dataDir = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/dev.companion.spike.native")
let logURL = dataDir.appendingPathComponent("events.jsonl")
let runID = "\(Int(Date().timeIntervalSince1970 * 1000))-\(getpid())"
let t0 = Date()
var seq = 0

func front() -> String { NSWorkspace.shared.frontmostApplication?.localizedName ?? "?" }

func log(_ ev: String, _ extra: [String: Any] = [:]) {
    seq += 1
    var d: [String: Any] = ["run": runID, "seq": seq, "ev": ev,
                            "ms": Int(Date().timeIntervalSince(t0) * 1000),
                            "t": Int(Date().timeIntervalSince1970 * 1000),
                            "front": front(), "app_active": NSApp.isActive]
    for (k, v) in extra { d[k] = v }
    guard let data = try? JSONSerialization.data(withJSONObject: d),
          var line = String(data: data, encoding: .utf8) else { return }
    line += "\n"
    if let h = try? FileHandle(forWritingTo: logURL) {
        h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); try? h.close()
    } else {
        try? line.write(to: logURL, atomically: false, encoding: .utf8)
    }
}

final class Panel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class Circle: NSView {
    var clicks = 0
    var onClick: (() -> Void)?
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func draw(_ r: NSRect) {
        NSColor.systemOrange.setFill()
        NSBezierPath(ovalIn: bounds.insetBy(dx: 4, dy: 4)).fill()
    }
    override func mouseDown(with e: NSEvent) {
        clicks += 1
        log("click", ["n": clicks, "panel_key": window?.isKeyWindow ?? false])
        let n = clicks
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { log("click_after_150ms", ["n": n]) }
        onClick?()
    }
}

final class WebClicks: NSObject, WKScriptMessageHandler {
    var clicks = 0
    var onClick: (() -> Void)?
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        clicks += 1
        log("click", ["n": clicks, "via": "webview"])
        let n = clicks
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { log("click_after_150ms", ["n": n]) }
        onClick?()
    }
}

final class App: NSObject, NSApplicationDelegate {
    var web: WKWebView?
    let webClicks = WebClicks()
    var panel: Panel!
    let label = NSTextField(labelWithString: "")
    let circle = Circle()
    var lastFront = ""

    func applicationDidFinishLaunching(_ n: Notification) {
        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
        log("launch", ["webview": useWeb, "macos": ProcessInfo.processInfo.operatingSystemVersionString])
        let vf = NSScreen.main!.visibleFrame
        let w: CGFloat = 220, h: CGFloat = 200
        panel = Panel(contentRect: NSRect(x: vf.maxX - w, y: vf.midY - h / 2, width: w, height: h),
                      styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.backgroundColor = .white
        let v = NSView(frame: NSRect(x: 0, y: 0, width: w, height: h))
        label.frame = NSRect(x: 12, y: h - 92, width: w - 24, height: 80)
        label.font = .systemFont(ofSize: 14)
        label.textColor = .black
        label.maximumNumberOfLines = 4
        circle.frame = NSRect(x: (w - 80) / 2, y: 14, width: 80, height: 80)
        circle.onClick = { [weak self] in self?.refresh() }
        if useWeb {
            let cfg = WKWebViewConfiguration()
            cfg.userContentController.add(webClicks, name: "click")
            let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h), configuration: cfg)
            webClicks.onClick = { [weak self] in self?.refresh() }
            wv.loadHTMLString("""
            <html><body style="margin:0;background:#fff;font:14px -apple-system;color:#000">
            <div id="t" style="padding:12px;white-space:pre-line">Native Spike WITH web view</div>
            <div id="c" style="position:absolute;left:70px;bottom:18px;width:80px;height:80px;border-radius:40px;background:#ff9a2e"></div>
            <script>document.getElementById('c').addEventListener('pointerdown',()=>webkit.messageHandlers.click.postMessage(1));</script>
            </body></html>
            """, baseURL: nil)
            web = wv
            panel.contentView = wv
        } else {
            v.addSubview(label); v.addSubview(circle)
            panel.contentView = v
        }
        panel.orderFrontRegardless()
        log("panel_shown", ["style_nonactivating": panel.styleMask.contains(.nonactivatingPanel)])
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { _ in
            log("front_app_changed")
        }
        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in log("app_became_active") }
        NotificationCenter.default.addObserver(forName: NSApplication.didResignActiveNotification, object: nil, queue: .main) { _ in log("app_resigned_active") }
        Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { [weak self] _ in self?.refresh() }
        refresh()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { log("launch_settled") }
    }

    func refresh() {
        if let wv = web {
            let txt = "Native Spike WITH web view\\nClicks on the circle: \(webClicks.clicks)\\nFront app: \(front())"
            wv.evaluateJavaScript("document.getElementById('t').innerText = \"\(txt)\"")
            return
        }
        label.stringValue = "Native Spike (no web view)\nClicks on the circle: \(circle.clicks)\nFront app: \(front())"
    }
}

let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
