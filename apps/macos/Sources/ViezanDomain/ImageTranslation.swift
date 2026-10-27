import AppKit
import Foundation

public struct ImageTextRegion: Decodable, Sendable {
    public let x: Double, y: Double, width: Double, height: Double, fontSize: Double
    public let originalText: String, translatedText: String, bgColor: String, textColor: String
    var valid: Bool {
        [x, y, width, height, fontSize].allSatisfy(\.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0 &&
        x + width <= 1.001 && y + height <= 1.001 && fontSize > 0 && fontSize <= 1 &&
        originalText.utf8.count <= 8192 && translatedText.utf8.count <= 8192 &&
        [bgColor, textColor].allSatisfy { $0.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil }
    }
}
public enum ImageTranslation {
    public static func isImageRequest(_ request: Request) -> Bool {
        request.feature == .translate && !(request.messages?.last(where: { $0.role == "user" })?.images ?? []).isEmpty
    }
    public static func parse(_ text: String) -> [ImageTextRegion]? {
        guard text.utf8.count <= 2_097_152, let start = text.firstIndex(of: "{"), let end = text.lastIndex(of: "}"), start <= end else { return nil }
        struct Result: Decodable { let regions: [ImageTextRegion] }
        guard let value = try? JSONDecoder().decode(Result.self, from: Data(text[start...end].utf8)), value.regions.count <= 200, value.regions.allSatisfy(\.valid) else { return nil }
        return value.regions
    }
    public static func text(_ output: String) -> String { parse(output)?.map(\.translatedText).joined(separator: "\n") ?? output }
    // Colors and region geometry describe the source document, not application chrome.
    @MainActor public static func render(_ attachment: ImageAttachment, output: String) throws -> Data {
        guard let regions = parse(output), let source = NSImage(data: try Attachments.data(attachment)),
              let cg = source.cgImage(forProposedRect: nil, context: nil, hints: nil), cg.width > 0, cg.height > 0,
              Double(cg.width) * Double(cg.height) <= 40_000_000,
              let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: cg.width, pixelsHigh: cg.height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
              let context = NSGraphicsContext(bitmapImageRep: bitmap) else { throw ProviderFailure.invalidResponse }
        NSGraphicsContext.saveGraphicsState(); defer { NSGraphicsContext.restoreGraphicsState() }
        NSGraphicsContext.current = context
        let size = NSSize(width: CGFloat(cg.width), height: CGFloat(cg.height))
        source.draw(in: NSRect(origin: .zero, size: size))
        func color(_ hex: String) -> NSColor {
            let value = UInt32(hex.dropFirst(), radix: 16) ?? 0
            return NSColor(srgbRed: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: 1)
        }
        for region in regions {
            let rect = NSRect(x: region.x * size.width, y: (1 - region.y - region.height) * size.height, width: region.width * size.width, height: region.height * size.height)
            color(region.bgColor).setFill(); rect.fill()
            let paragraph = NSMutableParagraphStyle(); paragraph.lineBreakMode = .byWordWrapping
            var fontSize = max(1, min(region.fontSize * size.height, rect.height))
            var attributes: [NSAttributedString.Key: Any] = [.foregroundColor: color(region.textColor), .paragraphStyle: paragraph]
            let text = region.translatedText as NSString
            for _ in 0..<40 {
                attributes[.font] = NSFont.systemFont(ofSize: fontSize)
                if text.boundingRect(with: NSSize(width: rect.width, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attributes).height <= rect.height || fontSize <= 1 { break }
                fontSize = max(1, fontSize * 0.9)
            }
            NSGraphicsContext.saveGraphicsState(); NSBezierPath(rect: rect).addClip()
            text.draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attributes)
            NSGraphicsContext.restoreGraphicsState()
        }
        guard let png = bitmap.representation(using: .png, properties: [:]), png.count <= 40_000_000 else { throw ProviderFailure.oversizedResponse }
        return png
    }
}
