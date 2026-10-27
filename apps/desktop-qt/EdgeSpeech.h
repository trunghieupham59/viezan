#pragma once
#include <QObject>
#include <QWebSocket>
#include <QTimer>
class EdgeSpeech final : public QObject {
    Q_OBJECT
public:
    explicit EdgeSpeech(QObject *parent = nullptr);
    void start(const QString &text, const QString &language, const QString &voice);
    void cancel();
signals:
    void finished(const QByteArray &audio);
    void failed();
private:
    QWebSocket m_socket;
    QTimer m_timeout;
    QByteArray m_audio;
    QString m_text, m_voice;
    bool m_done = false;
    void fail();
};
