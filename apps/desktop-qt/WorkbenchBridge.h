#pragma once
#include <QObject>
#include "LocalProvider.h"
#include "NativeAudio.h"
#include "LocalModelManager.h"
#include "NativeBackup.h"
#include "DesktopIntegration.h"
#include "ThermalMonitor.h"
#include "Interpretation.h"
#include "LocalRuntime.h"
#include "LocalPerformance.h"
#include "NativeUpdates.h"
#include "ProviderDiscovery.h"
#include "CredentialStore.h"
#include "ImageGeneration.h"
#include <QVariantMap>
#include <QTimer>
#include <QImage>
#include <QTemporaryFile>
#include <memory>
#include <QSet>

class WorkbenchBridge final : public QObject {
    Q_OBJECT
    Q_PROPERTY(LocalPerformance* localPerformance READ localPerformance CONSTANT)
    Q_PROPERTY(NativeUpdates* updates READ updates CONSTANT)
    Q_PROPERTY(LocalRuntime* localRuntime READ localRuntime CONSTANT)
    Q_PROPERTY(Interpretation* interpretation READ interpretation CONSTANT)
    Q_PROPERTY(ThermalMonitor* thermalMonitor READ thermalMonitor CONSTANT)
    Q_PROPERTY(DesktopIntegration* desktopIntegration READ desktopIntegration CONSTANT)
    Q_PROPERTY(bool ocrBusy READ ocrBusy NOTIFY changed)
    Q_PROPERTY(QString ocrError READ ocrError NOTIFY changed)
    Q_PROPERTY(bool backupBusy READ backupBusy NOTIFY changed)
    Q_PROPERTY(QVariantMap backupPreview READ backupPreview NOTIFY changed)
    Q_PROPERTY(QString backupStatus READ backupStatus NOTIFY changed)
    Q_PROPERTY(LocalModelManager* modelManager READ modelManager CONSTANT)
    Q_PROPERTY(NativeAudio* audio READ audio CONSTANT)
    Q_PROPERTY(QString pendingTranscript READ pendingTranscript NOTIFY changed)
    Q_PROPERTY(bool credentialBusy READ credentialBusy NOTIFY changed)
    Q_PROPERTY(QString credentialStatus READ credentialStatus NOTIFY changed)
    Q_PROPERTY(QStringList localModels READ localModels NOTIFY changed)
    Q_PROPERTY(bool loadingModels READ loadingModels NOTIFY changed)
    Q_PROPERTY(QString modelError READ modelError NOTIFY changed)
    // Provider discovery: which local runtimes answer and which cloud providers have a key.
    Q_PROPERTY(bool providersChecked READ providersChecked NOTIFY changed)
    Q_PROPERTY(bool providersEmpty READ providersEmpty NOTIFY changed)
    Q_PROPERTY(bool discovering READ discovering NOTIFY changed)
    Q_PROPERTY(QString preferredModel READ preferredModel NOTIFY changed)
    Q_PROPERTY(QVariantMap state READ state NOTIFY changed)
    Q_PROPERTY(QVariantMap resources READ resources CONSTANT)
    Q_PROPERTY(QString storageError READ storageError NOTIFY changed)
    Q_PROPERTY(bool loadBlocked READ loadBlocked NOTIFY changed)
    /// Smart reset: {feature, previousID} while a fresh turn replaced finished work after a break.
    Q_PROPERTY(QVariantMap resetNotice READ resetNotice NOTIFY changed)
    // Update prompt (Swift WorkbenchStore.updatePrompt): {version, notes} after a check found a version
    // that is not snoozed; empty otherwise. autoCheckUpdates: background checks at launch and daily.
    Q_PROPERTY(QVariantMap updatePrompt READ updatePrompt NOTIFY changed)
    Q_PROPERTY(bool autoCheckUpdates READ autoCheckUpdates WRITE setAutoCheckUpdates NOTIFY changed)
public:
    explicit WorkbenchBridge(QObject *parent = nullptr, const QString &storageFile = {}, bool automaticProvider = true);
    QVariantMap state() const { return m_state; }
    QVariantMap resources() const { return m_resources; }
    QString storageError() const { return m_storageError; }
    bool loadBlocked() const { return m_loadBlocked; }
    Q_INVOKABLE bool moduleEnabled(const QString &route) const;
    Q_INVOKABLE void command(const QString &name, const QVariantMap &payload = {});
    QStringList localModels() const { return m_localModels; }
    bool loadingModels() const { return m_loadingModels; }
    QString modelError() const { return m_modelError; }
    bool providersChecked() const { return m_providers.checked; }
    bool providersEmpty() const { return m_providers.empty(); }
    bool discovering() const { return m_discovering; }
    QString preferredModel() const;
    // unknown | available | offline | missingKey | notInstalled | unsupported
    Q_INVOKABLE QString availability(const QString &model) const { return m_providers.availability(model); }
    Q_INVOKABLE void discoverProviders();
    // Speech-to-text runs in the cloud: "auto" needs any of OpenAI/Gemini/Groq, else that provider's key.
    Q_INVOKABLE bool speechReady(const QString &provider) const {
        return provider == "auto" ? (m_credentials.contains("openai") || m_credentials.contains("gemini") || m_credentials.contains("groq")) : m_credentials.contains(provider);
    }
    Q_INVOKABLE bool chatCapable(const QString &model) const { return ProviderDiscovery::chatCapable(model); }
    // Who draws in image mode for this model ("openai" | "gemini" | ""), from cached key presence.
    Q_INVOKABLE QString imageProvider(const QString &model) const { return ImageGeneration::imageProvider(model, [this](const QString &id) { return m_credentials.contains(id); }); }
    // Settings row state: {keyed, models (count, -1 when not listed), failure}. Presence
    // never unlocks the credential store; chat providers are verified by their listing.
    Q_INVOKABLE QVariantMap providerState(const QString &provider) const {
        return {{"keyed", m_credentials.contains(provider)}, {"models", m_providers.models.contains(provider) ? m_providers.models.value(provider).size() : -1}, {"failure", m_providers.failures.value(provider)}};
    }
    // C++-only entry for tests and diagnostics: publish a known snapshot without probing.
    void applyProviderSnapshot(const ProviderDiscovery::Snapshot &snapshot) { publishProviders(snapshot); }
    Q_INVOKABLE void discoverIfNeeded() { if (m_automaticProvider && !m_providers.checked && !m_discovering) discoverProviders(); }
    LocalModelManager *modelManager() { return &m_modelManager; }
    NativeAudio *audio() { return &m_audio; }
    QString pendingTranscript() const { return m_pendingTranscript; }
    LocalPerformance *localPerformance() { return &m_localPerformance; }
    NativeUpdates *updates() { return &m_updates; }
    LocalRuntime *localRuntime() { return &m_localRuntime; }
    Interpretation *interpretation() { return &m_interpretation; }
    ThermalMonitor *thermalMonitor() { return &m_thermalMonitor; }
    DesktopIntegration *desktopIntegration() { return &m_desktopIntegration; }
    Q_INVOKABLE QString createDetachedSession(const QString &feature, const QString &draft = {});
    // Quick translate's pair ({primary, secondary}; until set, the Translate page's target) and the target for `text`.
    Q_INVOKABLE QVariantMap quickTranslate() const;
    Q_INVOKABLE QString quickTranslateTarget(const QString &text) const;
    bool ocrBusy() const { return !m_ocrID.isEmpty(); }
    QString ocrError() const { return m_ocrError; }
    Q_INVOKABLE void finishCapture(double x, double y, double width, double height);
    Q_INVOKABLE void cancelCapture();
    Q_INVOKABLE void captureImage(const QString &sessionID);
    Q_INVOKABLE void extractImageText(const QUrl &url, const QString &sessionID);
    Q_INVOKABLE void cancelOCR();
    bool backupBusy() const { return m_backupBusy; }
    QVariantMap backupPreview() const;
    QString backupStatus() const { return m_backupStatus; }
    Q_INVOKABLE void exportBackup(const QUrl &url);
    Q_INVOKABLE void inspectBackup(const QUrl &url);
    Q_INVOKABLE void confirmBackup(bool restorePreferences = false);
    Q_INVOKABLE void dismissBackup();
    Q_INVOKABLE void exportSession(const QUrl &url, const QString &sessionID);
    Q_INVOKABLE QString translatedImage(const QVariantMap &image, const QString &output);
    Q_INVOKABLE QString imageTranslationText(const QString &output);
    Q_INVOKABLE void exportTranslatedImage(const QUrl &url, const QVariantMap &image, const QString &output);
    Q_INVOKABLE void exportImage(const QUrl &url, const QVariantMap &image);
    Q_INVOKABLE void reuseImage(const QString &sessionID, const QVariantMap &image);
    Q_INVOKABLE void attachImage(const QUrl &url, const QString &sessionID);
    Q_INVOKABLE void startRecording();
    Q_INVOKABLE void insertTranscript();
    bool credentialBusy() const { return m_credentialBusy; }
    QString credentialStatus() const { return m_credentialStatus; }
    Q_INVOKABLE void saveCredential(const QString &provider, const QString &secret, bool remove = false);
    Q_INVOKABLE void refreshModels(const QString &requestedProvider = {});
    Q_INVOKABLE void save();
    Q_INVOKABLE void reload();
    Q_INVOKABLE void copy(const QString &text);
    Q_INVOKABLE bool copyImage(const QVariantMap &image);
    /// Items "Clear history" removes: Chat, Translate and Dictionary sessions plus Interpretation transcripts.
    Q_INVOKABLE int clearableHistoryCount() const;
    /// A "not found" dictionary reply's suggestions, or undefined for any other output.
    Q_INVOKABLE QVariant dictionarySuggestions(const QString &output) const;
    /// Delete a session that is not running (Swift removeSession); returns {session, index} for Undo,
    /// or an empty map when refused. restoreSession puts it back where it was.
    Q_INVOKABLE QVariantMap removeSession(const QString &sessionID);
    Q_INVOKABLE void restoreSession(const QVariantMap &session, int index);
    /// Model picker (Swift ModelLineup): purposes for the session's provider ({fast, balanced, careful} or
    /// empty), picking one (Careful also turns on careful reasoning in Chat), recent picks, short names
    /// and the panel's sections for a query.
    Q_INVOKABLE QVariantMap modelTiers(const QString &sessionID) const;
    Q_INVOKABLE void applyModelTier(const QString &sessionID, const QString &tier);
    Q_INVOKABLE QStringList recentPicks() const;
    Q_INVOKABLE QString shortModelName(const QString &id) const;
    /// Whether a voice provider honours the speaking rate (the speed seg dims otherwise).
    Q_INVOKABLE bool rateSupported(const QString &provider) const { return NativeAudio::rateSupported(provider); }
    Q_INVOKABLE QVariantList modelSections(const QString &query, const QString &sessionID) const;
    /// The launcher before anything is typed (Swift LauncherHome): Viezan pages {route, title} for enabled
    /// modules (Settings always), and the quick AI chat to continue ({id, title, fresh}) when that session
    /// still has messages; fresh = changed within 30 minutes, so a new question continues it.
    Q_INVOKABLE QVariantMap launcherHome(const QString &quickSessionID) const;
    QVariantMap updatePrompt() const { return m_updatePrompt; }
    bool autoCheckUpdates() const { return m_state.value("updates").toMap().value("autoCheck", true).toBool(); }
    void setAutoCheckUpdates(bool value) { command("autoCheckUpdates", {{"value", value}}); }
    Q_INVOKABLE bool updateSnoozed(const QString &version) const;
    /// "Remind me in 24 hours": the prompt leaves and this version stays quiet for a day.
    Q_INVOKABLE void snoozeUpdate();
    Q_INVOKABLE void dismissUpdatePrompt() { if (m_updatePrompt.isEmpty()) return; m_updatePrompt.clear(); emit changed(); }
    /// Shows the prompt when a check (background or manual) found a version that is not snoozed.
    Q_INVOKABLE void presentUpdateIfAvailable();
    Q_INVOKABLE QVariantList chartArtifacts(const QString &text) const;
    Q_INVOKABLE void renderMarkdown(QObject *document, const QString &text);
    Q_INVOKABLE void openLink(const QString &url);
    Q_INVOKABLE QStringList sentences(const QString &text) const;
    Q_INVOKABLE void shutdown();
    QVariantMap resetNotice() const { return m_resetNotice; }
    Q_INVOKABLE void reopenPrevious();
    Q_INVOKABLE void dismissResetNotice();
    /// Sessions for the history views (Swift WorkbenchStore.history): only those with work, no
    /// comparison children, newest change first. `features` empty = every enabled feature.
    /// The language to read `text` aloud in: its script when that tells, otherwise `fallback`
    /// (the UI locale for answers, the session source for originals). Same rule as macOS.
    Q_INVOKABLE QString speechLanguage(const QString &text, const QString &fallback = {}) const;
    Q_INVOKABLE QVariantList history(const QString &query, bool archived = false, const QStringList &features = {}) const;
signals:
    void capturePreparing();
    void captureReady(const QUrl &image, int x, int y, int width, int height);
    void captureFinished();
    void changed();
private slots:
    void screenshotResponse(uint code, const QVariantMap &results);
private:
    quint64 m_autoTranslationEpoch = 0;
    void scheduleTranslation(const QString &sessionID);
    QString m_captureOwner, m_capturePortal;
    QImage m_captureImage;
    std::unique_ptr<QTemporaryFile> m_captureTemp;
    quint64 m_captureGeneration = 0;
    QString m_catalogProvider;
    NativeUpdates m_updates;
    LocalPerformance m_localPerformance;
    LocalRuntime m_localRuntime;
    Interpretation m_interpretation;
    ThermalMonitor m_thermalMonitor;
    DesktopIntegration m_desktopIntegration;
    LocalProvider m_ocrProvider;
    QString m_ocrID, m_ocrOwner, m_ocrText, m_ocrError;
    qlonglong m_ocrRevision = 0;
    NativeBackup::Preview m_backupPreview;
    bool m_backupBusy = false;
    quint64 m_backupGeneration = 0;
    QString m_backupStatus;
    LocalModelManager m_modelManager;
    NativeAudio m_audio;
    qlonglong m_recordingRevision = 0;
    QString m_pendingTranscript;
    bool m_credentialBusy = false;
    QString m_credentialStatus;
    LocalProvider m_provider;
    QStringList m_localModels;
    QString m_modelError;
    bool m_loadingModels = false;
    ProviderDiscovery::Snapshot m_providers;
    QSet<QString> m_credentials; // every provider with a saved key, refreshed by discovery
    bool m_discovering = false, m_runtimeAvailable = false;
    quint64 m_discoveryEpoch = 0;
    void publishProviders(const ProviderDiscovery::Snapshot &snapshot);
    void adoptAvailableModels();
    QStringList recentModels() const;
    QHash<QString, QString> m_networkWorkers; // task ID -> attempt ID
    bool m_synchronizing = false, m_synchronizeAgain = false, m_shuttingDown = false;
    QVariantMap m_state, m_resources;
    QVariantMap m_resetNotice, m_updatePrompt;
    QTimer m_updateTimer;
    bool m_backgroundCheck = false;
    QString m_file, m_storageError;
    bool m_loadBlocked = false;
    bool m_automaticProvider;
    QTimer m_saveTimer;
    void applyVoice();
    void synchronizeWorkers();
};
