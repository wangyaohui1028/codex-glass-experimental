import AppKit
import WebKit

// Independent, offline material fixture. This executable never contacts Codex.
final class PreviewDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var allowedRoot: URL?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        let menu = NSMenu()
        let item = NSMenuItem()
        let applicationMenu = NSMenu()
        applicationMenu.addItem(withTitle: "Quit Codex Glass Preview", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.submenu = applicationMenu
        menu.addItem(item)
        app.mainMenu = menu

        guard let resourceURL = Bundle.main.resourceURL else {
            fail("Missing application resources.")
            return
        }
        let siteRoot = resourceURL.appendingPathComponent("site", isDirectory: true).standardizedFileURL
        let page = siteRoot.appendingPathComponent("demo/index.html")
        guard FileManager.default.fileExists(atPath: page.path) else {
            fail("Missing offline preview fixture. Re-run demo/build-native.sh.")
            return
        }
        allowedRoot = siteRoot

        let frame = NSRect(x: 0, y: 0, width: 1160, height: 875)
        let window = NSWindow(contentRect: frame, styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Codex Glass — Independent Native Material Preview"
        window.minSize = NSSize(width: 510, height: 660)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.titlebarAppearsTransparent = true
        window.appearance = NSAppearance(named: .darkAqua)
        window.isReleasedWhenClosed = false

        let material = NSVisualEffectView(frame: frame)
        material.autoresizingMask = [.width, .height]
        material.material = .underWindowBackground
        material.blendingMode = .behindWindow
        material.state = .active
        window.contentView = material

        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(source: "window.__codexGlassNativePreview = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.add(self, name: "glassPreview")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: material.bounds, configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        // This KVC key belongs only to our preview's WKWebView. It is not a
        // public API and may require adaptation in future WebKit versions.
        webView.setValue(false, forKey: "drawsBackground")
        if #available(macOS 12.0, *) { webView.underPageBackgroundColor = .clear }
        material.addSubview(webView)
        self.window = window
        self.webView = webView
        webView.loadFileURL(page, allowingReadAccessTo: siteRoot)
        window.center()
        window.makeKeyAndOrderFront(nil)
        app.activate(ignoringOtherApps: true)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "glassPreview", message.frameInfo.isMainFrame,
              let body = message.body as? [String: String],
              let theme = body["theme"], ["light", "dark"].contains(theme) else { return }
        window?.appearance = NSAppearance(named: theme == "light" ? .aqua : .darkAqua)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, url.isFileURL, let root = allowedRoot else {
            decisionHandler(.cancel)
            return
        }
        let resolved = url.resolvingSymlinksInPath().standardizedFileURL.path
        let prefix = root.resolvingSymlinksInPath().standardizedFileURL.path + "/"
        decisionHandler(resolved.hasPrefix(prefix) ? .allow : .cancel)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    private func fail(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Codex Glass Preview could not start"
        alert.informativeText = message
        alert.runModal()
        NSApplication.shared.terminate(nil)
    }
}

let app = NSApplication.shared
let delegate = PreviewDelegate()
app.delegate = delegate
app.run()
