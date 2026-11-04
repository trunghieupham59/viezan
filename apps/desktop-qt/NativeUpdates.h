#pragma once
#include <QObject>
#include <memory>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QPointer>
#include <QSaveFile>
#include <QCryptographicHash>
#include <QVariantMap>
#include <functional>
class NativeUpdates final : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(QString status READ status NOTIFY changed)
    Q_PROPERTY(QString version READ version NOTIFY changed)
    Q_PROPERTY(QString notes READ notes NOTIFY changed)
    Q_PROPERTY(double progress READ progress NOTIFY changed)
    Q_PROPERTY(bool ready READ ready NOTIFY changed)
    // Package size from the release listing (0 = unknown), when the last check finished (seconds since
    // 1970, 0 = not yet; not saved) and the estimated seconds left in a download (-1 = unknown).
    Q_PROPERTY(qint64 packageSize READ packageSize NOTIFY changed)
    Q_PROPERTY(double checkedAt READ checkedAt NOTIFY changed)
    Q_PROPERTY(double remainingSeconds READ remainingSeconds NOTIFY changed)
public:
    explicit NativeUpdates(QObject *parent = nullptr);
    bool busy() const { return m_busy; }
    QString status() const { return m_status; }
    QString version() const { return m_version; }
    QString notes() const { return m_notes; }
    double progress() const { return m_size > 0 ? double(m_received)/m_size : 0; }
    bool ready() const { return !m_downloaded.isEmpty(); }
    qint64 packageSize() const { return m_packageSize; }
    double checkedAt() const { return m_checkedAt; }
    double remainingSeconds() const;
    /// Linear estimate from the time so far; -1 before 2 % or the first second (Swift NativeUpdates.remaining).
    static double remaining(double elapsed, double fraction) { return elapsed >= 1 && fraction >= 0.02 && fraction < 1 ? elapsed * (1 - fraction) / fraction : -1; }
    Q_INVOKABLE void check();
    Q_INVOKABLE void download();
    Q_INVOKABLE void cancel();
    Q_INVOKABLE void openInstaller();
signals:
    void changed();
private:
    QNetworkAccessManager m_network;
    QPointer<QNetworkReply> m_reply;
    std::unique_ptr<QSaveFile> m_file;
    QCryptographicHash m_hash{QCryptographicHash::Sha256};
    QString m_status, m_version, m_notes, m_name, m_downloaded, m_destination;
    QUrl m_package, m_manifest;
    QByteArray m_expectedHash;
    qint64 m_received = 0, m_size = 0, m_packageSize = 0;
    double m_checkedAt = 0, m_downloadStarted = 0;
    bool m_busy = false;
    quint64 m_generation = 0;
    void fail();
    void get(const QUrl &url, qsizetype limit, std::function<void(QByteArray)> completion, int redirects = 0);
    void transfer(const QUrl &url, int redirects = 0);
};
