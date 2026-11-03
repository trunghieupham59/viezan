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
    /// A non-default chat mode is on: "+" reads selected so the row shows it without a chip.
    var selected = false
    var glassChat = false
    @Environment(\.shellLayer) private var shellLayer
    @State private var busy = false
    @State private var error: String?
    @State private var pendingText = ""
    var body: some View {
        if compact {
            HStack(spacing: metric("tight")) {
                if !statusOnly {
                    // "+" opens the shell's tools panel anchored here (attachments, chat mode, reasoning, voice).
                    ShellToolbarButton(label: store.text("attachImage"), symbol: "plus", identifier: "tools-toggle", quiet: glassChat, soft: selected, expanded: shellLayer == .tools, enabled: !busy,
                                       frameAction: { frame in NotificationCenter.default.post(name: .viezanOpenTools, object: NSValue(rect: frame)) }) {}
                        .frame(width: metric("control"), height: metric("control"))
                        .modifier(ControlGlass(active: glassChat, selected: selected || shellLayer == .tools, enabled: !busy))
                }
                if busy { ProgressView().controlSize(.small).accessibilityLabel(store.text("running")) }
                if !pendingText.isEmpty { Button(store.text("insertTranscript")) { store.setDraft(store.session.id, store.session.draft + (store.session.draft.isEmpty ? "" : "\n") + pendingText); pendingText = "" } }
            }.onReceive(headerRequests) { _ in if acceptsHeaderRequest && !busy { pick(ocr: false) } }
                // Attachment errors are whole-action feedback: a toast, not a warning icon parked in the row.
                .onChange(of: error) { _, value in if let value { ToastCenter.shared.show(store.text(value), key: "attach", error: true); error = nil } }
                .onReceive(NotificationCenter.default.publisher(for: .viezanComposerAction)) { note in
                    guard !statusOnly, !busy, let action = note.object as? String else { return }
                    if action == "attach" { pick(ocr: false) } else if action == "capture" { capture() } else if action == "ocr" { pick(ocr: true) }
                }
        } else { full }
    }
    private var headerRequests: NotificationCenter.Publisher { NotificationCenter.default.publisher(for: .viezanAttachImage) }
    private var full: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Menu { imageActions } label: { Label(store.text("attachImage"), systemImage: "plus") }
                .menuStyle(.button).buttonStyle(.vznQuiet).fixedSize().help(store.text("attachImage")).tint(.primary)
            if busy { ProgressView().controlSize(.small).accessibilityLabel(store.text("running")) }
            ForEach(store.session.images ?? []) { image in
                HStack {
                    Text(image.name).lineLimit(1).help(image.name)
                    Button(store.text("removeAttachment"), systemImage: "xmark") { store.removeImage(image.id, sessionID: store.session.id) }
                }
            }
            if !pendingText.isEmpty { Button(store.text("insertTranscript")) { store.setDraft(store.session.id, store.session.draft + (store.session.draft.isEmpty ? "" : "\n") + pendingText); pendingText = "" } }
            if let error { Text(store.text(error)).font(.vzn("captionScale")).foregroundStyle(.secondary) }
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

// Pasted or dropped images: one background ingest per item, the store decides the limit.
enum ImageIntake {
    @MainActor static func attach(urls: [URL], data: [Data], to sessionID: String, store: WorkbenchStore) {
        guard let target = store.session(sessionID), [.chat, .translate].contains(target.feature) else { return }
        let room = (target.feature == .translate ? 1 : 4) - (target.images?.count ?? 0)
        guard room > 0 else { ToastCenter.shared.show(store.text("attachFailed"), key: "attach", error: true); return }
        Task {
            var attached = 0, failed = false
            for url in urls.prefix(room) {
                if let image = try? await Task.detached { try Attachments.ingest(url) }.value { store.addImage(image, sessionID: sessionID); attached += 1 } else { failed = true }
            }
            for bytes in data.prefix(max(0, room - attached)) {
                if let image = try? await Task.detached { try Attachments.ingest(bytes, name: "pasted-image.png") }.value { store.addImage(image, sessionID: sessionID) } else { failed = true }
            }
            if failed { ToastCenter.shared.show(store.text("attachFailed"), key: "attach", error: true) }
        }
    }
    /// Reads dropped items (Finder files or image data) off their providers.
    @MainActor static func receive(_ providers: [NSItemProvider], completion: @escaping @MainActor ([URL], [Data]) -> Void) -> Bool {
        let relevant = providers.filter { $0.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) || $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }
        guard !relevant.isEmpty else { return false }
        Task {
            var urls: [URL] = [], data: [Data] = []
            for provider in relevant {
                if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                    if let item = try? await provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) {
                        if let bytes = item as? Data, let url = URL(dataRepresentation: bytes, relativeTo: nil) { urls.append(url) }
                        else if let url = item as? URL { urls.append(url) }
                    }
                } else if let type = [UTType.png, .jpeg, .tiff, .image].first(where: { provider.hasItemConformingToTypeIdentifier($0.identifier) }) {
                    let bytes: Data? = await withCheckedContinuation { continuation in
                        _ = provider.loadDataRepresentation(forTypeIdentifier: type.identifier) { data, _ in continuation.resume(returning: data) }
                    }
                    if let bytes { data.append(bytes) }
                }
            }
            await completion(urls, data)
        }
        return true
    }
}

// Highlights the composer while an image hovers and attaches what is dropped.
struct ImageDropTarget: ViewModifier {
    let store: WorkbenchStore
    let sessionID: String
    var radius: CGFloat
    @State private var targeted = false
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content
            .overlay {
                if targeted {
                    ZStack {
                        RoundedRectangle(cornerRadius: radius).fill(contentColor("action-soft", scheme))
                        RoundedRectangle(cornerRadius: radius).strokeBorder(contentColor("action", scheme), lineWidth: metric("hairline") * 2)
                        Label(store.text("dropImageHint"), systemImage: "photo.badge.plus").font(.vzn("labelScale", .medium)).foregroundStyle(contentColor("action-text", scheme))
                    }.allowsHitTesting(false)
                }
            }
            .onDrop(of: [.fileURL, .image], isTargeted: $targeted) { providers in
                ImageIntake.receive(providers) { urls, data in ImageIntake.attach(urls: urls, data: data, to: sessionID, store: store) }
            }
    }
}

// Pending composer images as removable chips above the editor.
extension Notification.Name {
    static let viezanAttachImage = Notification.Name("viezan.attachImage")
    static let viezanInterpretHistory = Notification.Name("viezan.interpretHistory")
    // Object: the settings section id to open (e.g. "localModels").
    static let viezanOpenSettings = Notification.Name("viezan.openSettings")
    // Object: a route id ("translate", "interpret", …) to show in the main window.
    static let viezanOpenRoute = Notification.Name("viezan.openRoute")
    /// Object: the model control's frame in window coordinates (NSValue); the shell shows the model panel there.
    static let viezanOpenModels = Notification.Name("viezan.openModels")
    /// The shell shows the session instructions layer at the "+" anchor.
    static let viezanOpenInstructions = Notification.Name("viezan.openInstructions")
    /// Object: the "+" control's frame (NSValue); the shell shows the composer tools panel there.
    static let viezanOpenTools = Notification.Name("viezan.openTools")
    /// Object: "attach" | "capture" | "ocr", chosen in the tools panel for the mounted composer.
    static let viezanComposerAction = Notification.Name("viezan.composerAction")
}

struct AttachmentChips: View {
    @Environment(\.colorScheme) private var scheme
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
                    }.font(.vzn("smallScale")).padding(.horizontal, metric("small")).padding(.vertical, metric("tight"))
                        .background(contentColor("surface-muted", scheme), in: Capsule())
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
            else { Label(attachment.name, systemImage: "photo").font(.vzn("captionScale")) }
        }.task(id: attachment.id) {
            let attachment = attachment
            if let bytes = try? await Task.detached(operation: { try Attachments.data(attachment) }).value { image = NSImage(data: bytes) }
        }
    }
}
