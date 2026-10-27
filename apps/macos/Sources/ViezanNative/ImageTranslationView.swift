import SwiftUI
import UniformTypeIdentifiers
import ViezanDomain

struct ImageTranslationView: View {
    @Bindable var store: WorkbenchStore
    let image: ImageAttachment
    let output: String
    let complete: Bool
    var resultImage: ImageAttachment? = nil
    @State private var preview: NSImage?
    @State private var rendered: Data?
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            if let preview { Image(nsImage: preview).resizable().scaledToFit().accessibilityLabel(store.text(complete ? "result" : "source")) }
            if !complete, !output.isEmpty { Text(ImageTranslation.text(output)).textSelection(.enabled) }
            if complete, let regions = ImageTranslation.parse(output) {
                if regions.isEmpty { Text(store.text("imageNoText")).foregroundStyle(.secondary) }
                ForEach(Array(regions.enumerated()), id: \.offset) { _, region in
                    VStack(alignment: .leading) {
                        Text(region.originalText).foregroundStyle(.secondary)
                        Text(region.translatedText)
                    }.textSelection(.enabled)
                }
            }
            if complete { Button(store.text("exportImage"), systemImage: "square.and.arrow.down") { export() }.disabled(rendered == nil) }
            if let error { Text(store.text(error)).foregroundStyle(.secondary) }
        }
        .task(id: image.id + (resultImage?.id ?? "") + (complete ? output : "")) {
            rendered = nil; preview = nil; error = nil
            do {
                let data: Data
                if complete, let resultImage { data = try Attachments.data(resultImage) }
                else { data = complete ? try ImageTranslation.render(image, output: output) : try Attachments.data(image) }
                try Task.checkCancellation(); preview = NSImage(data: data)
                if complete { rendered = data }
            } catch is CancellationError { } catch { self.error = "imageError" }
        }
    }
    private func export() {
        guard let rendered else { return }
        let panel = NSSavePanel(); let type = resultImage.flatMap { UTType(mimeType: $0.mime) } ?? .png
        panel.allowedContentTypes = [type]; panel.nameFieldStringValue = "translation." + (type.preferredFilenameExtension ?? "png")
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            do { try rendered.write(to: url, options: .atomic) } catch { self.error = "exportError" }
        }
    }
}
