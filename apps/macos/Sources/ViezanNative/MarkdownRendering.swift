import AppKit

@MainActor enum MarkdownRendering {
    static func render(_ source: String, font: NSFont) -> NSAttributedString {
        let result = NSMutableAttributedString(string: "")
        var fenced = false
        for (index, line) in source.components(separatedBy: "\n").enumerated() {
            if index > 0 { result.append(NSAttributedString(string: "\n", attributes: [.font: font])) }
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("```") { fenced.toggle(); continue }
            if fenced || line.trimmingCharacters(in: .whitespaces).hasPrefix("|") { result.append(NSAttributedString(string: line, attributes: [.font: NSFont.monospacedSystemFont(ofSize: font.pointSize, weight: .regular), .foregroundColor: NSColor.textColor])); continue }
            var content = line, reading = font
            let heading = line.prefix(while: { $0 == "#" }).count
            if (1...6).contains(heading), line.dropFirst(heading).first == " " { content = String(line.dropFirst(heading + 1)); reading = NSFont.preferredFont(forTextStyle: heading == 1 ? .title1 : heading == 2 ? .title2 : .title3) }
            if content.hasPrefix("- ") || content.hasPrefix("* ") || content.hasPrefix("+ ") { content = "• " + content.dropFirst(2) }
            result.append(inline(content, font: reading))
        }
        return result
    }
    private static func inline(_ source: String, font: NSFont) -> NSAttributedString {
        var options = AttributedString.MarkdownParsingOptions()
        options.interpretedSyntax = .inlineOnlyPreservingWhitespace
        guard let parsed = try? NSAttributedString(markdown: Data(source.utf8), options: options, baseURL: nil) else { return NSAttributedString(string: source, attributes: [.font: font, .foregroundColor: NSColor.textColor]) }
        let result = NSMutableAttributedString(attributedString: parsed)
        let all = NSRange(location: 0, length: result.length)
        result.addAttributes([.font: font, .foregroundColor: NSColor.textColor], range: all)
        parsed.enumerateAttribute(.inlinePresentationIntent, in: all) { value, range, _ in
            guard let number = value as? NSNumber else { return }
            let intent = InlinePresentationIntent(rawValue: number.uintValue)
            var styled = font
            if intent.contains(.code) { styled = NSFont.monospacedSystemFont(ofSize: font.pointSize, weight: .regular) }
            if intent.contains(.stronglyEmphasized) { styled = NSFontManager.shared.convert(styled, toHaveTrait: .boldFontMask) }
            if intent.contains(.emphasized) { styled = NSFontManager.shared.convert(styled, toHaveTrait: .italicFontMask) }
            result.addAttribute(.font, value: styled, range: range)
            if intent.contains(.strikethrough) { result.addAttribute(.strikethroughStyle, value: NSUnderlineStyle.single.rawValue, range: range) }
        }
        // Inline parsing never fetches linked images or executes HTML. Only
        // explicit user activation can open a permitted external URL.
        result.removeAttribute(.attachment, range: all)
        result.enumerateAttribute(.link, in: all) { value, range, _ in
            let url = (value as? URL) ?? (value as? String).flatMap(URL.init(string:))
            if !["https", "http", "mailto"].contains(url?.scheme?.lowercased() ?? "") { result.removeAttribute(.link, range: range) }
        }
        return result
    }
}
