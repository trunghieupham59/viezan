#pragma once
#include <QObject>
#include <QTcpServer>
#include <QTcpSocket>
#include <QPointer>
#include <QSharedPointer>
#include <QNetworkAccessManager>
#include <QVariantMap>
#include "LocalProvider.h"
#include "EdgeSpeech.h"
class ExtensionBridge final : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool listening READ listening NOTIFY changed)
    Q_PROPERTY(QVariantList tokens READ tokens NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QString revealedToken READ revealedToken NOTIFY changed)
public:
    explicit ExtensionBridge(QObject *parent = nullptr);
    ~ExtensionBridge() override { stop(); }
    void setEnabled(bool enabled) { m_enabled = enabled; if (!enabled) stop(); }
    bool listening() const { return m_server.isListening(); }
    QVariantList tokens() const;
    QString error() const { return m_error; }
    QString revealedToken() const { return m_revealed; }
    void setAllowedOrigins(const QStringList &origins) { m_origins = origins; }
    void setVoice(const QString &provider, const QString &voice) { m_voiceProvider = provider == "system" ? "edge" : provider; m_voiceID = provider == "system" ? "" : voice; }
    void setModel(const QString &model) { m_model = model; }
    Q_INVOKABLE void start();
    Q_INVOKABLE void stop();
    Q_INVOKABLE void createToken(const QString &name, int days);
    Q_INVOKABLE void revoke(const QString &id);
    Q_INVOKABLE void dismissToken() { m_revealed.clear(); emit changed(); }
signals:
    void changed();
private:
    bool m_enabled = true;
    struct Client {
        QByteArray buffer;
        QString id, origin, output;
        QPointer<QNetworkReply> reply;
        QPointer<EdgeSpeech> edge;
        bool handling = false;
    };
    QTcpServer m_server;
    LocalProvider m_provider;
    QNetworkAccessManager m_network;
    QHash<QTcpSocket*, QSharedPointer<Client>> m_clients;
    QVariantList m_tokens;
    QStringList m_origins;
    QString m_voiceProvider = "edge", m_voiceID;
    QString m_file, m_error, m_revealed, m_model;
    bool m_storageBlocked = false;
    bool persist(const QVariantList &tokens);
    bool authenticate(const QByteArray &secret) const;
    void accept();
    void read(QTcpSocket *socket);
    void dispatch(QTcpSocket *socket, const QString &method, const QString &path, const QMap<QByteArray,QByteArray> &headers, const QByteArray &body);
    void respond(QTcpSocket *socket, int status, const QVariantMap &body);
    void tts(QTcpSocket *socket, const QString &text, const QString &language);
};
