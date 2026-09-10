import SwiftUI

enum AppIconChoice: String, CaseIterable, Identifiable {
    case original, flat, glass, ceramic, metallic, layered, minimal
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var alternateName: String? { self == .original ? nil : "AppIcon-\(rawValue)" }
    var previewName: String { "IconPreview-\(rawValue)" }
}

struct AppIconPicker: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var selected = UIApplication.shared.alternateIconName
    @State private var changing = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(AppIconChoice.allCases) { choice in
                        Button { select(choice) } label: {
                            HStack(spacing: 16) {
                                Image(choice.previewName)
                                    .resizable()
                                    .frame(width: 60, height: 60)
                                    .clipShape(RoundedRectangle(cornerRadius: 13))
                                    .accessibilityHidden(true)
                                Text(choice.title).foregroundStyle(.primary)
                                Spacer()
                                if selected == choice.alternateName {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.tint)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        .accessibilityLabel(choice.title)
                        .accessibilityValue(selected == choice.alternateName ? "Selected" : "")
                        .disabled(changing || !UIApplication.shared.supportsAlternateIcons)
                    }
                } footer: {
                    Text(UIApplication.shared.supportsAlternateIcons
                         ? "Changes the icon on your Home Screen. iOS may show a confirmation. Choose Original to reset."
                         : "This installation does not support alternate icons.")
                }
                if changing { ProgressView("Changing icon…") }
                if let errorMessage { Text(errorMessage).foregroundStyle(.red).accessibilityLabel("Icon change failed: \(errorMessage)") }
            }
            .navigationTitle("App Icon")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.disabled(changing) } }
            .interactiveDismissDisabled(changing)
            .onChange(of: scenePhase) { phase in
                if phase == .active { selected = UIApplication.shared.alternateIconName }
            }
        }
    }

    private func select(_ choice: AppIconChoice) {
        guard !changing, UIApplication.shared.supportsAlternateIcons,
              selected != choice.alternateName else { return }
        changing = true
        errorMessage = nil
        UIApplication.shared.setAlternateIconName(choice.alternateName) { error in
            DispatchQueue.main.async {
                changing = false
                selected = UIApplication.shared.alternateIconName
                errorMessage = error?.localizedDescription
            }
        }
    }
}
