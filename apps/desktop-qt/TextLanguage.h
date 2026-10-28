#pragma once
#include <QString>
#include <QVariantMap>
// Quick translate's own language pair: text already in the primary language goes to the
// secondary one, everything else to the primary. Mirrors QuickTranslatePreferences (Swift);
// detection here reads the script, since Qt has no language recognizer.
namespace TextLanguage {
// The language of `text` when its script tells (Vietnamese letters, kana, Hangul, Han,
// Cyrillic, Arabic, Thai, Devanagari); "" when only Latin letters without a sure signal.
inline QString detect(const QString &text) {
    static const QString vietnamese = QStringLiteral("ăâđêôơưĂÂĐÊÔƠƯạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ");
    int kana = 0, hangul = 0, han = 0, cyrillic = 0, arabic = 0, thai = 0, devanagari = 0, viet = 0, latin = 0;
    for (const auto c : text.left(2000)) {
        const auto u = c.unicode();
        if ((u >= 0x3040 && u <= 0x30ff)) ++kana; else if (u >= 0xac00 && u <= 0xd7af) ++hangul; else if (u >= 0x4e00 && u <= 0x9fff) ++han;
        else if (u >= 0x0400 && u <= 0x04ff) ++cyrillic; else if (u >= 0x0600 && u <= 0x06ff) ++arabic; else if (u >= 0x0e00 && u <= 0x0e7f) ++thai; else if (u >= 0x0900 && u <= 0x097f) ++devanagari;
        else if (vietnamese.contains(c)) ++viet; else if (c.isLetter() && u < 0x0250) ++latin;
    }
    if (kana) return "ja";
    if (hangul) return "ko";
    if (han) return "zh";
    const QList<QPair<int, QString>> scripts{{cyrillic, "ru"}, {arabic, "ar"}, {thai, "th"}, {devanagari, "hi"}};
    for (const auto &[count, code] : scripts) if (count * 2 > latin) return code;
    if (viet && viet * 20 >= latin) return "vi";
    return {};
}
inline QString family(const QString &code) { return code.section('-', 0, 0); }
// `quick` holds {primary, secondary}; `detected` may be "" (unknown).
inline QString target(const QVariantMap &quick, const QString &detected) {
    const auto primary = quick.value("primary").toString(), secondary = quick.value("secondary").toString();
    return !secondary.isEmpty() && !detected.isEmpty() && family(detected) == family(primary) ? secondary : primary;
}
}
