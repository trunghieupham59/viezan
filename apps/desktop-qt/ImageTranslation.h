#pragma once
#include <QVariantMap>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QBuffer>
#include <QImageReader>
#include <QPainter>
#include <QTextDocument>
#include <QAbstractTextDocumentLayout>
#include <QPalette>
#include <QTextOption>
#include <cmath>
#include "Attachments.h"
namespace ImageTranslation {
inline bool isImageRequest(const QVariantMap &request) {
    if (request.value("feature") != "translate") return false;
    QVariantList images;
    for (const auto &value : request.value("messages").toList()) if (value.toMap().value("role") == "user") images = value.toMap().value("images").toList();
    return !images.isEmpty();
}
inline bool parse(const QString &output, QJsonArray &regions) {
    if (output.toUtf8().size() > 2097152) return false;
    const auto start = output.indexOf('{'), end = output.lastIndexOf('}'); if (start < 0 || end < start) return false;
    QJsonParseError error; const auto root = QJsonDocument::fromJson(output.mid(start, end-start+1).toUtf8(), &error).object();
    if (error.error != QJsonParseError::NoError || !root.value("regions").isArray()) return false;
    regions = root.value("regions").toArray(); if (regions.size() > 200) return false;
    for (const auto &value : regions) {
        if (!value.isObject()) return false; const auto r = value.toObject();
        for (const auto &key : {"x", "y", "width", "height", "fontSize"}) if (!r.value(key).isDouble() || !std::isfinite(r.value(key).toDouble())) return false;
        const auto x=r.value("x").toDouble(), y=r.value("y").toDouble(), w=r.value("width").toDouble(), h=r.value("height").toDouble(), f=r.value("fontSize").toDouble();
        if (x<0 || y<0 || w<=0 || h<=0 || x+w>1.001 || y+h>1.001 || f<=0 || f>1) return false;
        for (const auto &key : {"originalText", "translatedText"}) if (!r.value(key).isString() || r.value(key).toString().toUtf8().size()>8192) return false;
        for (const auto &key : {"bgColor", "textColor"}) if (!QRegularExpression("^#[0-9a-fA-F]{6}$").match(r.value(key).toString()).hasMatch()) return false;
    }
    return true;
}
inline bool valid(const QString &output) { QJsonArray regions; return parse(output, regions); }
inline QString text(const QString &output) { QJsonArray regions; if (!parse(output, regions)) return output; QStringList lines; for (const auto &value : regions) lines.append(value.toObject().value("translatedText").toString()); return lines.join('\n'); }
inline QByteArray render(const QVariantMap &attachment, const QString &output) {
    QJsonArray regions; if (!parse(output, regions)) return {};
    auto bytes = Attachments::data(attachment); QBuffer source(&bytes); source.open(QIODevice::ReadOnly);
    QImageReader reader(&source); reader.setAutoTransform(true); const auto size=reader.size();
    if (!size.isValid() || qint64(size.width())*size.height()>40000000) return {};
    auto image=reader.read().convertToFormat(QImage::Format_ARGB32_Premultiplied); if (image.isNull()) return {};
    QPainter painter(&image); painter.setRenderHint(QPainter::TextAntialiasing);
    for (const auto &value : regions) {
        const auto r=value.toObject(); const QRectF rect(r.value("x").toDouble()*image.width(), r.value("y").toDouble()*image.height(), r.value("width").toDouble()*image.width(), r.value("height").toDouble()*image.height());
        // Document colors originate in the image, independent of UI theme tokens.
        painter.fillRect(rect, QColor(r.value("bgColor").toString()));
        QTextDocument document; document.setDocumentMargin(0); QTextOption option; option.setWrapMode(QTextOption::WrapAtWordBoundaryOrAnywhere); document.setDefaultTextOption(option);
        document.setPlainText(r.value("translatedText").toString()); document.setTextWidth(rect.width());
        auto font= painter.font(); double pixels=qMax(1.0, qMin(r.value("fontSize").toDouble()*image.height(), rect.height()));
        for (int attempt=0; attempt<40; ++attempt) { font.setPixelSize(qMax(1, qRound(pixels))); document.setDefaultFont(font); if (document.size().height()<=rect.height() || pixels<=1) break; pixels=qMax(1.0,pixels*0.9); }
        painter.save(); painter.setClipRect(rect); painter.translate(rect.topLeft());
        QAbstractTextDocumentLayout::PaintContext context; context.palette.setColor(QPalette::Text,QColor(r.value("textColor").toString())); document.documentLayout()->draw(&painter, context); painter.restore();
    }
    painter.end(); QByteArray png; QBuffer result(&png); result.open(QIODevice::WriteOnly);
    if (!image.save(&result,"PNG") || png.size()>40000000) return {}; return png;
}
}
