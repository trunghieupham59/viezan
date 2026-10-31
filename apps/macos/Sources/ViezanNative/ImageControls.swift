import SwiftUI
import UniformTypeIdentifiers
import ViezanDomain

struct ImageControls: View {
    @Bindable var store: WorkbenchStore
    // Compact: icon menu in a composer row; attachments render as chips elsewhere.
    var compact = false
    // The translation source owns the header's "Add image" request.
    var acceptsHeaderRequest = false
    // Header owns the visible control; this instance keeps status and the request.
    var statusOnly = false
    var extraMenu: AnyView? = nil
    @State private var busy = false
    @State private var error: String?
    @State private var pendingText = ""
    var body: some View {
        if compact {
            HStack(spacing: metric("tight")) {
                if !statusOnly {
                    Menu { imageActions; if let extraMenu { Divider(); extraMenu } } label: { Image(systemName: "plus").imageScale(.large) }
                        .menuStyle(.button).buttonStyle(.vznQuiet).menuIndicator(.hidden).fixedSize()
                        .help(store.text("attachImage")).accessibilityLabel(store.text("attachImage"))
                }
                if busy { ProgressView().controlSize(.small).accessibilityLabel(store.text("running")) }
                if !pendingText.isEmpty { Button(store.text("insertTranscript")) { store.setDraft(store.session.id, store.session.draft + (store.session.draft.isEmpty ? "" : "\n") + pendingText); pendingText = "" } }
                if let error { Image(systemName: "exclamationmark.triangle").foregroundStyle(.secondary).help(store.text(error)).accessibilityLabel(store.text(error)) }
            }.onReceive(headerRequests) { _ in if acceptsHeaderRequest && !busy { pick(ocr: false) } }
        } else { full }
    }
    private var headerRequests: NotificationCenter.Publisher { NotificationCenter.default.publisher(for: .viezanAttachImage) }
    private var full: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Menu { imageActions } label: { Label(store.text("attachImage"), systemImage: "plus") }
                .menuStyle(.borderlessButton).fixedSize().help(store.text("attachImage")).tint(.primary)
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
        // Without Screen Recording access screencapture silently returns only the wallpaper.
        guard CGPreflightScreenCaptureAccess() else { _ = CGRequestScreenCaptureAccess(); error = "capturePermission"; return }
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
                    if ocr && result.1.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { error = "ocrNoText" }
                    else if ocr {
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

// Pending composer images as removable chips above the editor.
extension Notification.Name {
    static let viezanAttachImage = Notification.Name("viezan.attachImage")
    static let viezanInterpretHistory = Notification.Name("viezan.interpretHistory")
    // Object: the settings section id to open (e.g. "localModels").
    static let viezanOpenSettings = Notification.Name("viezan.openSettings")
}

struct AttachmentChips: View {
    @Bindable var store: WorkbenchStore
    var body: some View {
        if let images = store.session.images, !images.isEmpty {
            NativeFlow(spacing: metric("small")) {
                ForEach(images) { image in
                    HStack(spacing: metric("tight")) {
                        Image(systemName: "photo").accessibilityHidden(true)
                        Text(image.name).lineLimit(1).truncationMode(.middle).frame(maxWidth: metric("sidebar"))
                        Button { store.removeImage(image.id, sessionID: store.session.id) } label: { Image(systemName: "xmark") }
                            .buttonStyle(.vznQuiet).accessibilityLabel(store.text("removeAttachment") + " " + image.name).help(store.text("removeAttachment"))
                    }.font(.callout).padding(.horizontal, metric("small")).padding(.vertical, metric("tight"))
                        .background(Color(nsColor: .controlBackgroundColor), in: Capsule())
                }
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
