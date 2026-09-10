import WebKit
import SwiftUI
import UniformTypeIdentifiers

/// Manages all communication between the WKWebView (JavaScript) and the native Swift layer.
///
/// JS → Swift: JS calls `window.webkit.messageHandlers.specdown.postMessage({ action, data })`
/// Swift → JS: Swift calls `webView.evaluateJavaScript("window.setTheme('dark')")`
@MainActor
final class WebBridge: NSObject, ObservableObject, WKScriptMessageHandler {
    private static let bundledSamplesSubdirectory = "dist/samples"
    private static let defaultPrintJobName = "Specdown Document"

    private struct PendingFile {
        let name: String
        let content: String
    }

    weak var webView: WKWebView?

    @Published private(set) var currentDocumentName = "Specdown Document"
    @Published private(set) var recentFiles: [String]
    @Published private(set) var hasLoadedDocument = false
    @Published var showsAppIconPicker = false

    private var pageLoaded = false
    private var pendingTheme: String?
    private var pendingLayoutMode: String?
    private var pendingFile: PendingFile?

    private let defaults = UserDefaults.standard
    private enum Keys {
        static let preferences = "specdown.preferences"
        static let recentFiles = "specdown.recentFiles"
    }

    override init() {
        recentFiles = UserDefaults.standard.stringArray(forKey: Keys.recentFiles) ?? []
        super.init()
    }

    // MARK: - JS → Swift

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard
            let body = message.body as? [String: Any],
            let action = body["action"] as? String
        else {
            print("[Bridge] Unexpected message format: \(message.body)")
            return
        }

        let data = body["data"] as? [String: Any]

        switch action {
        case "showAppIconPicker":
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.request.url?.scheme == BundleSchemeHandler.scheme,
                  message.frameInfo.request.url?.host == BundleSchemeHandler.host else { return }
            showsAppIconPicker = true

        case "openFilePicker":
            presentDocumentPicker()

        case "openBundledSample":
            if let name = data?["name"] as? String {
                loadBundledSample(named: name)
            } else {
                print("[Bridge] Missing bundled sample name")
            }

        case "savePreferences":
            if let prefs = data {
                defaults.set(prefs, forKey: Keys.preferences)
            }

        case "printDocument":
            let html = data?["html"] as? String
            let title = data?["title"] as? String
            presentPrintController(markupText: html, title: title)

        case "fileLoaded":
            if let name = data?["name"] as? String {
                trackRecentFile(name: name)
            }

        default:
            print("[Bridge] Unknown action: \(action)")
        }
    }

    // MARK: - Swift → JS

    /// Called by WKNavigationDelegate once the page has finished loading.
    /// Flushes any theme that was requested before the page was ready.
    func pageDidLoad() {
        pageLoaded = true
        if let theme = pendingTheme {
            pendingTheme = nil
            applyTheme(theme)
        }
        if let layoutMode = pendingLayoutMode {
            pendingLayoutMode = nil
            applyLayoutMode(layoutMode)
        }
        if let file = pendingFile {
            pendingFile = nil
            loadFile(name: file.name, content: file.content)
        }
    }

    func pageWillLoad() {
        pageLoaded = false
    }

    func applyTheme(_ colorScheme: ColorScheme) {
        applyTheme(colorScheme == .dark ? "dark" : "light")
    }

    func applyTheme(_ theme: String) {
        guard pageLoaded else {
            pendingTheme = theme
            return
        }
        evaluateJavaScript(function: "window.setTheme", arguments: [theme], context: "setTheme")
    }

    func applyLayoutMode(_ layoutMode: String) {
        guard pageLoaded else {
            pendingLayoutMode = layoutMode
            return
        }
        evaluateJavaScript(function: "window.setIOSLayoutMode", arguments: [layoutMode], context: "setIOSLayoutMode")
    }

    /// Deliver a file's content to the web layer.
    func loadFile(name: String, content: String) {
        currentDocumentName = name
        hasLoadedDocument = true
        guard pageLoaded else {
            pendingFile = PendingFile(name: name, content: content)
            return
        }
        evaluateJavaScript(function: "window.loadFileContent", arguments: [content, name], context: "loadFileContent")
        trackRecentFile(name: name)
    }

    func openDocumentPickerFromSidebar() {
        presentDocumentPicker()
    }

    /// Read a markdown file URL (security-scoped) and hand its content to the
    /// web layer. Shared by the document picker and by external opens — Files
    /// "Open in place", the share sheet, and "Open With… Specdown" — routed here
    /// via SwiftUI's `.onOpenURL`.
    func openDocument(at url: URL) {
        let granted = url.startAccessingSecurityScopedResource()
        defer {
            if granted {
                url.stopAccessingSecurityScopedResource()
            }
        }

        do {
            let data = try Data(contentsOf: url)
            guard let content = String(data: data, encoding: .utf8) else {
                print("[Bridge] Unsupported file encoding for \(url.lastPathComponent)")
                return
            }
            loadFile(name: url.lastPathComponent, content: content)
        } catch {
            print("[Bridge] Failed to read file: \(error)")
        }
    }

    func openBundledSampleFromSidebar(named fileName: String) {
        loadBundledSample(named: fileName)
    }

    private func evaluateJavaScript(function: String, arguments: [Any], context: String) {
        guard let webView else {
            print("[Bridge] Missing WKWebView for \(context)")
            return
        }

        do {
            let serializedArguments = try arguments
                .map(serializeJavaScriptArgument)
                .joined(separator: ", ")
            webView.evaluateJavaScript("\(function)(\(serializedArguments))") { _, error in
                if let error = error {
                    print("[Bridge] \(context) error: \(error)")
                }
            }
        } catch {
            print("[Bridge] Failed to serialize JS arguments for \(context): \(error)")
        }
    }

    private func serializeJavaScriptArgument(_ value: Any) throws -> String {
        let json = try JSONSerialization.data(withJSONObject: [value], options: [])
        guard let encoded = String(data: json, encoding: .utf8) else {
            throw NSError(domain: "WebBridge", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Unable to encode JavaScript argument as UTF-8."
            ])
        }
        return String(encoded.dropFirst().dropLast())
    }

    // MARK: - Native integrations

    private func presentDocumentPicker() {
        let types: [UTType] = [.plainText, .utf8PlainText, .sourceCode, .json, .xml]
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: types)
        picker.delegate = self
        picker.allowsMultipleSelection = false

        guard let presenter = topViewController() else {
            print("[Bridge] Could not find presenter for document picker")
            return
        }
        presenter.present(picker, animated: true)
    }

    private func loadBundledSample(named fileName: String) {
        guard let url = bundledSampleURL(named: fileName) else {
            print("[Bridge] Bundled sample not found: \(fileName)")
            return
        }

        do {
            let data = try Data(contentsOf: url)
            guard let content = String(data: data, encoding: .utf8) else {
                print("[Bridge] Unsupported bundled sample encoding for \(fileName)")
                return
            }
            loadFile(name: fileName, content: content)
        } catch {
            print("[Bridge] Failed to read bundled sample \(fileName): \(error)")
        }
    }

    private func presentPrintController(markupText: String?, title: String?) {
        guard let presenter = topViewController() else {
            print("[Bridge] Could not find presenter for print controller")
            return
        }

        let printInfo = UIPrintInfo(dictionary: nil)
        printInfo.outputType = .general
        printInfo.jobName = (title?.isEmpty == false ? title : nil) ?? currentDocumentName

        let controller = UIPrintInteractionController.shared
        controller.printInfo = printInfo
        controller.showsNumberOfCopies = true
        if let markupText, !markupText.isEmpty {
            let formatter = UIMarkupTextPrintFormatter(markupText: markupText)
            formatter.perPageContentInsets = UIEdgeInsets(top: 24, left: 24, bottom: 28, right: 24)
            controller.printFormatter = formatter
        } else if let webView {
            let formatter = webView.viewPrintFormatter()
            formatter.perPageContentInsets = UIEdgeInsets(top: 24, left: 24, bottom: 28, right: 24)
            controller.printFormatter = formatter
        } else {
            print("[Bridge] Missing printable content for printDocument")
            return
        }
        // Present from the top view controller's view so the print sheet anchors
        // correctly on iPad (where `present(animated:)` alone is a no-op — it needs
        // an anchor for the popover). On iPhone the anchor is ignored and it shows
        // full-screen as before. This also uses `presenter`, which was otherwise
        // unused.
        let anchorView = presenter.view ?? webView ?? UIView()
        let anchorRect = CGRect(x: anchorView.bounds.midX, y: anchorView.bounds.midY, width: 0, height: 0)
        controller.present(from: anchorRect, in: anchorView, animated: true) { _, completed, error in
            if let error {
                print("[Bridge] Print controller error: \(error)")
                return
            }
            if !completed {
                print("[Bridge] Print controller cancelled")
            }
        }
    }

    private func bundledSampleURL(named fileName: String) -> URL? {
        let path = (fileName as NSString).deletingPathExtension
        let ext = (fileName as NSString).pathExtension
        guard !path.isEmpty, !ext.isEmpty else {
            return nil
        }
        return Bundle.main.url(
            forResource: path,
            withExtension: ext,
            subdirectory: Self.bundledSamplesSubdirectory
        )
    }

    private func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
        let keyWindow = scenes
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        var top = keyWindow?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }

    private func trackRecentFile(name: String) {
        var recent = defaults.stringArray(forKey: Keys.recentFiles) ?? []
        recent.removeAll { $0 == name }
        recent.insert(name, at: 0)
        let trimmedRecent = Array(recent.prefix(10))
        defaults.set(trimmedRecent, forKey: Keys.recentFiles)
        recentFiles = trimmedRecent
    }
}

extension WebBridge: UIDocumentPickerDelegate {
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        openDocument(at: url)
    }
}
