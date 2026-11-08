#pragma once
#include <QObject>
#include <QFuture>
#include <QVariantList>
#include <QVariantMap>
#include <functional>

namespace AppRemoval {
enum class Platform { Windows, Linux, Unsupported };
struct Command {
    QString program;
    QStringList arguments;
    QString nativeArguments; // Windows vendor arguments, preserved verbatim.
    bool interactive = false;
};
struct ProcessResult {
    bool started = false;
    bool finished = false;
    int exitCode = -1;
    QByteArray output;
    QString error;
};
struct Records {
    QVariantList rows;
    bool complete = true;
    QStringList errors;
};
struct Dependencies {
    Platform platform = Platform::Unsupported;
    std::function<Records()> registry;
    std::function<Records()> desktops;
    std::function<ProcessResult(const Command &)> run;
    std::function<QString(const QString &)> tool;
    std::function<QVariantMap(const QString &)> appImageInfo;
    std::function<bool(const QString &, QString *)> trash;
};
struct Entry {
    QVariantMap data;
    Command command;
    QString appImage;
    QVariantMap fingerprint;
};
struct Inventory {
    QList<Entry> entries;
    QStringList errors;
    bool complete = true;
    QVariantList rows() const;
};
Dependencies nativeDependencies();
ProcessResult runProcess(const Command &command);
Inventory scan(const Dependencies &dependencies);
Command windowsCommand(const QVariantMap &record, const QString &msiexec);
QVariantMap remove(const Dependencies &dependencies, const Entry &selected, Inventory *after);
}

class AppUninstall final : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(QVariantList apps READ apps NOTIFY changed)
    Q_PROPERTY(bool inventoryComplete READ inventoryComplete NOTIFY changed)
    Q_PROPERTY(QStringList errors READ errors NOTIFY changed)
    Q_PROPERTY(QVariantMap lastResult READ lastResult NOTIFY changed)
    Q_PROPERTY(bool operationUnverified READ operationUnverified NOTIFY changed)
public:
    explicit AppUninstall(QObject *parent = nullptr);
    explicit AppUninstall(AppRemoval::Dependencies dependencies, QObject *parent = nullptr);
    ~AppUninstall() override;
    bool busy() const { return m_busy; }
    QVariantList apps() const { return m_inventory.rows(); }
    bool inventoryComplete() const { return m_inventory.complete; }
    QStringList errors() const { return m_inventory.errors; }
    QVariantMap lastResult() const { return m_result; }
    bool operationUnverified() const { return m_operationUnverified; }
    Q_INVOKABLE bool inventory();
    // QML must confirm irreversible removal; privileged Linux operations additionally
    // require explicit consent. This flag never bypasses the OS authorization dialog.
    Q_INVOKABLE bool uninstall(const QString &id, bool authorizeSystem = false);
signals:
    void changed();
    void finished(const QVariantMap &result);
private:
    struct Outcome { AppRemoval::Inventory inventory; QVariantMap result; };
    void start(std::function<Outcome()> operation);
    AppRemoval::Dependencies m_dependencies;
    AppRemoval::Inventory m_inventory;
    QVariantMap m_result;
    QFuture<Outcome> m_future;
    bool m_busy = false;
    bool m_operationUnverified = false;
};
