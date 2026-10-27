#pragma once
#include <QObject>
#include <QAbstractNativeEventFilter>
#include <QVariantMap>
#include "WindowsSelection.h"
#ifdef Q_OS_LINUX
#include <QDBusMessage>
#include <QDBusObjectPath>
#endif
class DesktopIntegration final : public QObject, public QAbstractNativeEventFilter {
    Q_OBJECT
    Q_PROPERTY(bool canReplaceSelection READ canReplaceSelection NOTIFY changed)
    Q_PROPERTY(bool canUndoSelection READ canUndoSelection NOTIFY changed)
    Q_PROPERTY(QString currency READ currency NOTIFY changed)
    Q_PROPERTY(bool launchAtLogin READ launchAtLogin NOTIFY changed)
    Q_PROPERTY(QVariantList shortcuts READ shortcuts NOTIFY changed)
    Q_PROPERTY(QVariantList files READ files NOTIFY changed)
    Q_PROPERTY(QVariantList applications READ applications NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(bool applicationsBusy READ applicationsBusy NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
public:
    explicit DesktopIntegration(QObject *parent = nullptr);
    ~DesktopIntegration() override;
    bool canReplaceSelection() const { return m_selection.canReplace(); }
    bool canUndoSelection() const { return m_selection.canUndo(); }
    Q_INVOKABLE bool replaceSelection(const QString &text);
    Q_INVOKABLE bool undoSelection();
    QString currency() const { return m_currency; }
    bool launchAtLogin() const;
    Q_INVOKABLE void setLaunchAtLogin(bool enabled);
    Q_INVOKABLE QString diagnostics() const;
    Q_INVOKABLE void openPrivacySettings();
    QVariantList shortcuts() const { return m_shortcuts; }
    QVariantList files() const { return m_files; }
    Q_INVOKABLE QString calculate(const QString &input) const;
    Q_INVOKABLE void searchFiles(const QString &input);
    Q_INVOKABLE void openFile(const QString &path);
    Q_INVOKABLE void revealFile(const QString &path);
    Q_INVOKABLE void searchWeb(const QString &query);
    QVariantList applications() const { return m_applications; }
    bool applicationsBusy() const { return m_applicationsBusy; }
    QString error() const { return m_error; }
    bool busy() const { return m_busy; }
    Q_INVOKABLE void configure(const QString &id, const QString &key, bool enabled);
    Q_INVOKABLE void activate();
    Q_INVOKABLE void shutdown();
    Q_INVOKABLE void refreshApplications();
    Q_INVOKABLE void launch(const QString &id);
    Q_INVOKABLE void openApplicationSettings();
    Q_INVOKABLE void trigger(const QString &action);
    bool nativeEventFilter(const QByteArray &type, void *message, qintptr *result) override;
signals:
    void changed();
    void activated(const QString &action, const QString &selectedText);
private:
    WindowsSelection m_selection;
    QVariantList m_shortcuts, m_applications, m_files;
    quint64 m_fileSearchGeneration = 0;
    QString m_file, m_error, m_currency;
    bool m_busy = false;
    bool m_applicationsBusy = false;
    bool persist(const QVariantList &values);
    void apply(const QVariantList &values);
#ifdef Q_OS_LINUX
    QString m_session, m_pendingSession;
    QVariantList m_candidate;
    QMap<QString, QString> m_requests;
    void portalRequest(const QString &operation, const QVariantList &arguments, const QString &token);
    void closeSession(const QString &path);
private slots:
    void portalResponse(uint response, const QVariantMap &results, const QDBusMessage &message);
    void portalActivated(const QDBusObjectPath &session, const QString &shortcut, qulonglong timestamp, const QVariantMap &options);
#endif
};
