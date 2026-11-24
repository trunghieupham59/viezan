#pragma once

#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QPointer>
#include <QStringList>
#include <QVariantMap>
#include <optional>

namespace CurrencyRates {
struct Query {
    double amount;
    QString from, to;
};
const QStringList &codes();
std::optional<Query> parse(const QString &input, const QString &locale);
QString defaultTarget(const QString &locale, const QString &preferred, const QString &from = {});
// Presentation fields for the current pair. A missing rate leaves the converted value absent.
QVariantMap quote(const Query &query, const QString &locale, const QString &preferred, const QJsonObject &snapshot);
class Loader final : public QObject {
    Q_OBJECT
public:
    explicit Loader(QObject *parent, QNetworkAccessManager *network = nullptr);
    ~Loader() override;
    void load(const QString &cache, bool refresh);
    void cancel();
signals:
    void loaded(const QJsonObject &snapshot);
private:
    QPointer<QNetworkAccessManager> m_network;
    QPointer<QNetworkReply> m_reply;
};
}
