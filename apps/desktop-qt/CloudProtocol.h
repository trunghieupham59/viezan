#pragma once
#include <QNetworkRequest>
#include <QVariantMap>
#include <QJsonArray>
namespace CloudProtocol {
struct Call { QNetworkRequest request; QByteArray body; QString error; QString kind; };
struct Event { QString text; QString error; bool done = false; bool successfulFinish = false; QVariantMap usage; };
Call prepare(const QVariantMap &request, const QJsonArray &messages);
Event decode(const QString &provider, const QByteArray &data, bool successfulFinish);
// The provider's own explanation in an error body ({"error":{"message":…}}), at most 300 characters.
QString errorMessage(const QByteArray &body);
}
