import SwiftUI

struct ContentView: View {
    @StateObject private var bridge = WebBridge()
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var usesPadShell: Bool {
        UIDevice.current.userInterfaceIdiom == .pad && horizontalSizeClass == .regular
    }

    var body: some View {
        Group {
            if usesPadShell {
                NavigationSplitView {
                    ipadSidebar
                } detail: {
                    viewerSurface
                        .navigationTitle(bridge.hasLoadedDocument ? bridge.currentDocumentName : "Specdown")
                        .navigationBarTitleDisplayMode(.inline)
                }
                .navigationSplitViewStyle(.balanced)
            } else {
                viewerSurface
            }
        }
            .sheet(isPresented: $bridge.showsAppIconPicker) { AppIconPicker() }
            .onAppear {
                bridge.applyTheme(colorScheme)
                bridge.applyLayoutMode(usesPadShell ? "pad" : "phone")
            }
            .onChange(of: colorScheme) { newScheme in
                bridge.applyTheme(newScheme)
            }
            .onChange(of: horizontalSizeClass) { _ in
                bridge.applyLayoutMode(usesPadShell ? "pad" : "phone")
            }
            // Markdown files opened from outside the app — Files "Open in place",
            // the share sheet, or "Open With… Specdown" — arrive here.
            .onOpenURL { url in
                bridge.openDocument(at: url)
            }
    }

    private var viewerSurface: some View {
        Group {
            if usesPadShell {
                WebView(bridge: bridge)
            } else {
                WebView(bridge: bridge)
                    .ignoresSafeArea()
            }
        }
    }

    private var ipadSidebar: some View {
        List {
            Section("Open") {
                Button {
                    bridge.openDocumentPickerFromSidebar()
                } label: {
                    Label("Open Markdown File", systemImage: "doc.badge.plus")
                }
            }

            Section("Appearance") {
                Button { bridge.showsAppIconPicker = true } label: {
                    Label("App Icon", systemImage: "app.badge")
                }
            }

            Section("Samples") {
                Button {
                    bridge.openBundledSampleFromSidebar(named: "sample.md")
                } label: {
                    Label("Open Sample", systemImage: "doc.text")
                }

                Button {
                    bridge.openBundledSampleFromSidebar(named: "diagram-showcase.md")
                } label: {
                    Label("Open Diagram Showcase", systemImage: "chart.xyaxis.line")
                }
            }

            Section("Recent") {
                if bridge.recentFiles.isEmpty {
                    Text("No recent files yet")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(bridge.recentFiles, id: \.self) { name in
                        Label(name, systemImage: "clock.arrow.circlepath")
                            .foregroundStyle(.primary)
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("Specdown")
    }
}
