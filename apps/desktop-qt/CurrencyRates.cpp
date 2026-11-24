#include "CurrencyRates.h"
#include <QRegularExpression>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSharedPointer>
#include <QTimer>
#include <QFile>
#include <QSaveFile>
#include <QFileInfo>
#include <QDir>
#include <QDateTime>
#include <QLocale>
#include <QMap>
#include <algorithm>
#include <cmath>
namespace CurrencyRates {
namespace {
constexpr qint64 maxSnapshotBytes = 512 * 1024;
const QList<QPair<QString, QStringList>> currencies{
    {"USD", {"$", "us$", "usd", "dollar", "dollars", "bucks", "do", "do la", "dola", "do-la", "ドル", "米ドル"}},
    {"VND", {"₫", "d", "vnd", "vnđ", "dong", "dong viet", "ドン"}},
    {"JPY", {"¥", "￥", "jpy", "yen", "円", "えん"}},
    {"EUR", {"€", "eur", "euro", "euros", "ユーロ"}},
    {"GBP", {"£", "gbp", "pound", "pounds", "bang", "bang anh", "ポンド"}},
    {"KRW", {"₩", "krw", "won", "ウォン"}},
    {"CNY", {"cny", "rmb", "yuan", "te", "nhan dan te", "元", "人民元"}},
    {"TWD", {"nt$", "twd", "dai te", "台湾ドル"}},
    {"HKD", {"hk$", "hkd", "香港ドル"}},
    {"SGD", {"s$", "sgd", "シンガポールドル"}},
    {"THB", {"฿", "thb", "baht", "bat", "バーツ"}},
    {"MYR", {"rm", "myr", "ringgit", "リンギット"}},
    {"IDR", {"rp", "idr", "rupiah", "ルピア"}},
    {"PHP", {"₱", "php", "peso", "pesos", "ペソ"}},
    {"INR", {"₹", "inr", "rupee", "rupees", "ルピー"}},
    {"AUD", {"a$", "au$", "aud", "do uc", "豪ドル"}},
    {"NZD", {"nz$", "nzd"}},
    {"CAD", {"c$", "ca$", "cad", "do canada", "カナダドル"}},
    {"CHF", {"chf", "franc", "francs", "フラン"}},
    {"SEK", {"sek", "krona", "kronor"}},
    {"NOK", {"nok", "krone", "kroner"}},
    {"DKK", {"dkk"}},
    {"PLN", {"pln", "zloty", "zł"}},
    {"CZK", {"czk", "koruna"}},
    {"TRY", {"₺", "try", "lira"}},
    {"RUB", {"₽", "rub", "ruble", "rubles", "rup", "ルーブル"}},
    {"BRL", {"r$", "brl", "real", "reais"}},
    {"MXN", {"mx$", "mxn"}},
    {"ZAR", {"zar", "rand"}},
    {"AED", {"aed", "dirham"}},
};

QString fold(QString text) {
    static const QRegularExpression marks(R"(\p{Mn})");
    return text.normalized(QString::NormalizationForm_D).remove(marks).toLower().replace(u'đ', u'd');
}

const QMap<QString, QString> &aliases() {
    static const auto table = [] {
        QMap<QString, QString> result;
        for (const auto &[code, names] : currencies) {
            for (const auto &name : names) result.insert(fold(name), code);
            result.insert(code.toLower(), code);
        }
        return result;
    }();
    return table;
}

std::optional<double> number(QString raw, const QString &locale) {
    const auto dot = raw.lastIndexOf('.'), comma = raw.lastIndexOf(',');
    if (dot >= 0 && comma >= 0) {
        const QChar decimal = dot > comma ? '.' : ',';
        if (raw.count(decimal) != 1) return {};
        raw.remove(decimal == '.' ? ',' : '.').replace(decimal, '.');
    } else if (dot >= 0 || comma >= 0) {
        const QChar separator = dot >= 0 ? '.' : ',';
        const auto parts = raw.split(separator);
        const bool grouped = separator == (locale == "vi" ? '.' : ',') && !parts.first().isEmpty()
            && !parts.first().startsWith('0') && parts.first().size() <= 3
            && std::all_of(parts.cbegin() + 1, parts.cend(), [](const QString &part) { return part.size() == 3; });
        if (!grouped && parts.size() > 2) return {};
        raw = parts.join(grouped ? QString() : QStringLiteral("."));
    }
    bool ok;
    const auto amount = raw.toDouble(&ok);
    return ok && std::isfinite(amount) ? std::optional<double>(amount) : std::nullopt;
}

bool valid(const QJsonObject &object) {
    const auto rates = object.value("rates").toObject();
    const auto updated = object.value("updated").toDouble(), fetched = object.value("fetched").toDouble();
    const auto now = QDateTime::currentSecsSinceEpoch();
    if (!std::isfinite(updated) || updated <= 0 || updated > now + 86400 ||
        !std::isfinite(fetched) || fetched <= 0 || fetched > now + 60) return false;
    if (rates.size() > 1000 || rates.value("USD").toDouble() != 1) return false;
    static const QRegularExpression isoCode("^[A-Z]{3}$");
    for (auto it = rates.begin(); it != rates.end(); ++it) {
        const auto rate = it.value().toDouble();
        if (!isoCode.match(it.key()).hasMatch() || !std::isfinite(rate) || rate <= 0) return false;
    }
    return true;
}
}
const QStringList &codes() {
    static const auto list = [] {
        QStringList result;
        for (const auto &entry : currencies) result.append(entry.first);
        return result;
    }();
    return list;
}

std::optional<Query> parse(const QString &input, const QString &locale) {
    const auto text = fold(input.trimmed());
    if (text.isEmpty() || text.size() > 60) return {};
    static const auto pattern = [] {
        auto names = aliases().keys();
        std::sort(names.begin(), names.end(), [](const QString &a, const QString &b) { return a.size() > b.size(); });
        for (auto &name : names) name = QRegularExpression::escape(name);
        const auto unit = "(?:" + names.join('|') + ")";
        return QRegularExpression(QStringLiteral(
            R"(^(?:(%1)\s*)?(\d[\d.,]*\d|\d|\.\d+)(tr|k|m|万)?(?:\s*(%1))?(?:\s*(?:->|→|=|into|to|in|sang|thanh|ra|den|に|へ)\s*(%1)?|\s+(%1))?$)"
        ).arg(unit));
    }();
    const auto match = pattern.match(text);
    if (!match.hasMatch()) return {};
    const auto prefix = match.captured(1), suffix = match.captured(4);
    const auto from = aliases().value(prefix.isEmpty() ? suffix : prefix);
    const auto parsed = number(match.captured(2), locale);
    if (from.isEmpty() || !parsed) return {};
    static const QMap<QString, double> factors{{"k", 1e3}, {"tr", 1e6}, {"m", 1e6}, {"万", 1e4}};
    const double amount = *parsed * factors.value(match.captured(3), 1);
    if (!std::isfinite(amount) || amount > 1e15) return {};
    auto target = match.captured(5);
    if (target.isEmpty()) target = match.captured(6);
    if (target.isEmpty() && !prefix.isEmpty()) target = suffix;
    const auto to = aliases().value(target);
    return Query{amount, from, to == from ? QString() : to};
}

QString defaultTarget(const QString &locale, const QString &preferred, const QString &from) {
    const QString local = locale == "vi" ? "VND" : locale == "ja" ? "JPY" : "USD";
    for (const auto &code : QStringList{preferred, local, "USD", "EUR"})
        if (code != from && codes().contains(code)) return code;
    return "USD";
}

QVariantMap quote(const Query &query, const QString &language, const QString &preferred, const QJsonObject &snapshot) {
    const QLocale locale(language);
    const auto target = query.to.isEmpty() ? defaultTarget(language, preferred, query.from) : query.to;
    QString amount = locale.toString(query.amount, 'f', 6);
    while (amount.endsWith(locale.zeroDigit())) amount.chop(locale.zeroDigit().size());
    if (amount.endsWith(locale.decimalPoint())) amount.chop(locale.decimalPoint().size());
    QVariantMap result{{"amount", amount}, {"from", query.from}, {"to", target}, {"explicitTarget", !query.to.isEmpty()}};
    const auto rates = snapshot.value("rates").toObject();
    const auto a = rates.value(query.from).toDouble(), b = rates.value(target).toDouble();
    if (a <= 0 || b <= 0) return result;
    const auto value = query.amount / a * b, rate = b / a;
    if (!std::isfinite(value) || !std::isfinite(rate)) return result;
    const int decimals = QStringList{"JPY", "KRW", "VND"}.contains(target) ? 0 : 2;
    result["value"] = locale.toString(value, 'f', decimals);
    // Round to six significant digits, then show that value as a localized decimal.
    const double roundedRate = QString::number(rate, 'g', 6).toDouble();
    result["rate"] = locale.toString(roundedRate, 'f', QLocale::FloatingPointShortest);
    result["date"] = locale.toString(QDateTime::fromSecsSinceEpoch(qint64(snapshot.value("updated").toDouble())).date(), QLocale::ShortFormat);
    return result;
}

namespace {
QJsonObject cachedSnapshot(const QString &cache) {
    QFile file(cache);
    if (!file.open(QIODevice::ReadOnly)) return {};
    const auto bytes = file.read(maxSnapshotBytes + 1);
    if (bytes.size() > maxSnapshotBytes) return {};
    const auto snapshot = QJsonDocument::fromJson(bytes).object();
    return valid(snapshot) ? snapshot : QJsonObject{};
}

QJsonObject saveResponse(const QString &cache, const QByteArray &bytes) {
    const auto response = QJsonDocument::fromJson(bytes).object();
    const QJsonObject updated{{"rates", response.value("rates")}, {"updated", response.value("time_last_update_unix")},
                              {"fetched", QDateTime::currentSecsSinceEpoch()}};
    if (response.value("result") != "success" || response.value("base_code") != "USD" || !valid(updated)) return {};
    QDir().mkpath(QFileInfo(cache).absolutePath());
    QSaveFile output(cache);
    const auto data = QJsonDocument(updated).toJson(QJsonDocument::Compact);
    if (output.open(QIODevice::WriteOnly)) {
        output.setPermissions(QFileDevice::ReadOwner | QFileDevice::WriteOwner);
        if (output.write(data) == data.size()) output.commit();
    }
    return updated;
}
}

Loader::Loader(QObject *parent, QNetworkAccessManager *network)
    : QObject(parent), m_network(network ? network : new QNetworkAccessManager(this)) {}

Loader::~Loader() { cancel(); }

void Loader::cancel() {
    if (auto *reply = m_reply.data()) {
        m_reply.clear();
        reply->disconnect(this);
        reply->abort();
        reply->deleteLater();
    }
}

void Loader::load(const QString &cache, bool refresh) {
    if (m_reply) return;
    const auto cached = cachedSnapshot(cache);
    if (!m_network || (!refresh && QDateTime::currentSecsSinceEpoch() - cached.value("fetched").toDouble() < 86400)) {
        emit loaded(cached);
        return;
    }
    QNetworkRequest request(QUrl("https://open.er-api.com/v6/latest/USD"));
    request.setTransferTimeout(8000);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    auto *reply = m_network->get(request);
    m_reply = reply;
    reply->setReadBufferSize(maxSnapshotBytes + 1);
    auto bytes = QSharedPointer<QByteArray>::create();
    const auto readAvailable = [reply, bytes] {
        bytes->append(reply->read(maxSnapshotBytes + 1 - bytes->size()));
        if (bytes->size() > maxSnapshotBytes && !reply->isFinished()) reply->abort();
    };
    auto *deadline = new QTimer(reply);
    deadline->setSingleShot(true);
    connect(deadline, &QTimer::timeout, reply, &QNetworkReply::abort);
    connect(reply, &QNetworkReply::finished, deadline, &QTimer::stop);
    deadline->start(10000);
    connect(reply, &QNetworkReply::readyRead, this, readAvailable);
    const auto finish = [this, reply, readAvailable, cache, cached, bytes] {
        if (m_reply != reply) return;
        m_reply.clear();
        reply->deleteLater();
        QJsonObject updated;
        if (reply->error() == QNetworkReply::NoError && reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 200) {
            readAvailable();
            if (bytes->size() <= maxSnapshotBytes) updated = saveResponse(cache, *bytes);
        }
        emit loaded(updated.isEmpty() ? cached : updated);
    };
    connect(reply, &QNetworkReply::finished, this, finish);
    if (reply->isFinished()) QTimer::singleShot(0, this, finish);
}
}
