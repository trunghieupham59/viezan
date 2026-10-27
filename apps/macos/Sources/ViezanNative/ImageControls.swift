import SwiftUI
import UniformTypeIdentifiers
import ViezanDomain

struct ImageControls: View {
    @Bindable var store: WorkbenchStore
    @State private var busy = false
    @State private var error: String?
    @State private var pendingText = ""
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Menu { imageActions } label: { Label(store.text("attachImage"), systemImage: "plus") }
                .menuStyle(.borderlessButton).fixedSize().help(store.text("attachImage"))
            if busy { ProgressView().controlSize(.small).accessibilityLabel(store.text("running")) }
            ForEach(store.session.images ?? []) { image in
                HStack {
                    Text(image.name).lineLimit(1).help(image.name)
                    Button(store.text("removeAttachment"), systemImage: "xmark") { store.removeImage(image.id, sessionID: store.session.id) }
                }
            }
            if !pendingText.isEmpty { Button(store.text("insertTranscript")) { store.setDraft(store.session.id, store.session.draft + (store.session.draft.isEmpty ? "" : "\n") + pendingText); pendingText = "" } }
            if let error { Text(store.text(error)).font(.caption).foregroundStyle(.secondary) }
        }
    }
    @ViewBuilder private var imageActions: some View {
                Button(store.text("attachImage"), systemImage: "photo") { pick(ocr: false) }
                    .disabled(busy || ![.chat, .translate].contains(store.session.feature) || (store.session.images?.count ?? 0) >= (store.session.feature == .translate ? 1 : 4))
                Button(store.text("captureImage"), systemImage: "camera.viewfinder") { capture() }.disabled(busy || ![.chat, .translate].contains(store.session.feature) || (store.session.images?.count ?? 0) >= (store.session.feature == .translate ? 1 : 4))
                Button(store.text("extractImageText"), systemImage: "text.viewfinder") { pick(ocr: true) }.disabled(busy)

    }
    private func capture() {
        let owner = store.session.id; busy = true; error = nil
        Task {
            do { let image = try await Task.detached { try Attachments.captureScreen() }.value; store.addImage(image, sessionID: owner) }
            catch is CancellationError { }
            catch { self.error = "captureError" }
            busy = false
        }
    }
    private func pick(ocr: Bool) {
        let owner = store.session.id, revision = store.session.revision
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.png, .jpeg, .gif, .webP]; panel.allowsMultipleSelection = false
        busy = true
        panel.begin { result in
            guard result == .OK, let url = panel.url else { busy = false; return }
            busy = true; error = nil
            Task {
                do {
                    let result = try await Task.detached {
                        let image = try Attachments.ingest(url)
                        return (image, ocr ? try Attachments.recognize(image) : "")
                    }.value
                    if ocr {
                        if let session = store.session(owner), session.revision == revision {
                            store.setDraft(owner, session.draft.isEmpty ? result.1 : session.draft + "\n" + result.1)
                        } else { pendingText = result.1; error = "draftChanged" }
                    } else { store.addImage(result.0, sessionID: owner) }
                } catch { self.error = "imageError" }
                busy = false
            }
        }
    }
}

struct AttachmentPreview: View {
    let attachment: ImageAttachment
    @State private var image: NSImage?
    var body: some View {
        Group {
            if let image { Image(nsImage: image).resizable().scaledToFit().frame(maxHeight: metric("editor") * 2).accessibilityLabel(attachment.name) }
            else { Label(attachment.name, systemImage: "photo").font(.caption) }
        }.task(id: attachment.id) {
            let attachment = attachment
            if let bytes = try? await Task.detached(operation: { try Attachments.data(attachment) }).value { image = NSImage(data: bytes) }
        }
    }
}
