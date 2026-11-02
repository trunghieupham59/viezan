import Foundation

/// Titles imported from the retired renderer sometimes arrived as UTF-8 bytes read through
/// Mac Roman ("Gi·∫£i th√≠ch" for "Giải thích"). The damage is reversible: re-encode the text as
/// Mac Roman and read it back as UTF-8. Only strings that carry the telltale sequences are
/// touched, and only when the round trip yields valid UTF-8 with fewer odd characters.
public enum TextRepair {
    static let telltales = ["√", "·∫", "‚Ä", "¬", "√†", "·ªõ", "·ªô", "·∫°", "·ªá", "Ã"]
    static let oddities: Set<Character> = ["√", "·", "∫", "‚", "Ä", "¬", "Ã", "©", "®", "¢", "£", "¶", "°", "±", "≠", "∞", "∂", "∑", "∏", "π", "∫", "∆", "ƒ", "Ω", "œ", "ø", "¿", "ª", "º", "¡"]

    public static func looksDamaged(_ text: String) -> Bool { telltales.contains { text.contains($0) } }

    public static func repaired(_ text: String) -> String {
        guard looksDamaged(text), let bytes = text.data(using: .macOSRoman), let decoded = String(data: bytes, encoding: .utf8) else { return text }
        let before = text.filter { oddities.contains($0) }.count, after = decoded.filter { oddities.contains($0) }.count
        return after < before ? decoded : text
    }
}
