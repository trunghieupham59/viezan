#include "EdgeSpeech.h"
#include <QDateTime>
#include <QUrlQuery>
#include <QUuid>
#include <QCryptographicHash>
#include <QRegularExpression>
#include <QLocale>
#include <QMap>
namespace {
const QByteArray publicClient = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
QString identifier() { return QUuid::createUuid().toString(QUuid::WithoutBraces).remove('-'); }
const QMap<QString, QString> voices{{"vi","vi-VN-HoaiMyNeural"},{"en","en-US-JennyNeural"},{"zh","zh-CN-XiaoxiaoNeural"},{"zh-TW","zh-TW-HsiaoChenNeural"},{"ja","ja-JP-NanamiNeural"},{"ko","ko-KR-SunHiNeural"},{"fr","fr-FR-DeniseNeural"},{"de","de-DE-KatjaNeural"},{"es","es-ES-ElviraNeural"},{"pt","pt-PT-RaquelNeural"},{"ru","ru-RU-SvetlanaNeural"},{"ar","ar-SA-ZariyahNeural"},{"th","th-TH-PremwadeeNeural"},{"id","id-ID-GadisNeural"},{"it","it-IT-ElsaNeural"},{"nl","nl-NL-ColetteNeural"},{"pl","pl-PL-ZofiaNeural"},{"tr","tr-TR-EmelNeural"},{"hi","hi-IN-SwaraNeural"}};
}
EdgeSpeech::EdgeSpeech(QObject *parent) : QObject(parent), m_socket("chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold") {
    m_timeout.setSingleShot(true); m_socket.setMaxAllowedIncomingMessageSize(1048576);
    connect(&m_timeout, &QTimer::timeout, this, &EdgeSpeech::fail);
    connect(&m_socket, &QWebSocket::errorOccurred, this, [this](QAbstractSocket::SocketError) { fail(); });
    connect(&m_socket, &QWebSocket::disconnected, this, [this] { if (!m_done) fail(); });
    connect(&m_socket, &QWebSocket::connected, this, [this] {
        if (m_done) return;
        const auto stamp = QLocale::c().toString(QDateTime::currentDateTimeUtc(), "ddd, dd MMM yyyy HH:mm:ss 'GMT'");
        const QString config = R"({"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-16khz-32kbitrate-mono-mp3"}}}})";
        m_socket.sendTextMessage("X-Timestamp:" + stamp + "\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n" + config);
        auto escaped = m_text; escaped.replace('&', "&amp;"); escaped.replace('<', "&lt;"); escaped.replace('>', "&gt;"); escaped.replace('"', "&quot;");
        const auto language = m_voice.section('-', 0, 1);
        const auto ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" + language + "'><voice name='" + m_voice + "'><prosody pitch='+0Hz' rate='+20%' volume='+0%'>" + escaped + "</prosody></voice></speak>";
        m_socket.sendTextMessage("X-RequestId:" + identifier() + "\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:" + stamp + "Z\r\nPath:ssml\r\n\r\n" + ssml);
    });
    connect(&m_socket, &QWebSocket::binaryMessageReceived, this, [this](const QByteArray &data) {
        if (m_done) return; if (data.size() < 2) { fail(); return; }
        const auto length = int(quint8(data[0])) * 256 + int(quint8(data[1])); if (data.size() < length + 2) { fail(); return; }
        if (!data.mid(2, length).contains("Path:audio")) return;
        if (m_audio.size() + data.size() - length - 2 > 16777216) { fail(); return; }; m_audio += data.mid(length + 2);
    });
    connect(&m_socket, &QWebSocket::textMessageReceived, this, [this](const QString &message) {
        if (m_done || !message.contains("Path:turn.end")) return;
        if (m_audio.isEmpty()) { fail(); return; }
        m_done = true; m_timeout.stop(); m_socket.close(); emit finished(m_audio);
    });
}
void EdgeSpeech::cancel() { m_done = true; m_timeout.stop(); m_socket.abort(); m_audio.clear(); }
void EdgeSpeech::fail() { if (m_done) return; cancel(); emit failed(); }
void EdgeSpeech::start(const QString &text, const QString &language, const QString &voice) {
    if (text.isEmpty() || text.toUcs4().size() > 5000) { fail(); return; }
    m_text = text; m_voice = voice.isEmpty() ? voices.value(language, voices.value("en")) : voice;
    if (!QRegularExpression("^[A-Za-z]{2,3}-[A-Za-z]{2,4}-[A-Za-z0-9-]{1,80}$").match(m_voice).hasMatch()) { fail(); return; }
    auto ticks = QDateTime::currentSecsSinceEpoch() + 11644473600LL; ticks = (ticks - ticks % 300) * 10000000;
    const auto signature = QCryptographicHash::hash(QByteArray::number(ticks) + publicClient, QCryptographicHash::Sha256).toHex().toUpper();
    QUrl url("wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1"); QUrlQuery query;
    query.addQueryItem("TrustedClientToken", QString::fromLatin1(publicClient)); query.addQueryItem("ConnectionId", identifier()); query.addQueryItem("Sec-MS-GEC", QString::fromLatin1(signature)); query.addQueryItem("Sec-MS-GEC-Version", "1-143.0.3650.75"); url.setQuery(query);
    QNetworkRequest request(url); request.setRawHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0"); request.setRawHeader("Cookie", "muid=" + identifier().toUpper().toLatin1() + ";"); request.setRawHeader("Cache-Control", "no-cache");
    m_timeout.start(180000); m_socket.open(request);
}
