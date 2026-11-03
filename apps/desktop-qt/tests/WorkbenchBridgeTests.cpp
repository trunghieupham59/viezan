#include "../WorkbenchBridge.h"
#include "../WorkbenchDomain.h"
#include "../NativeAudio.h"
#include "../ProviderDiscovery.h"
#include <QUuid>
#include "../ImageGeneration.h"
#include "../CloudProtocol.h"
#include "../VoiceGate.h"
#include "../TextLanguage.h"
#include "../ThermalSensors.h"
#include "../LauncherTools.h"
#include "../NativeBackup.h"
#include "../LocalRuntime.h"
#include "../ModelLineup.h"
#include "../NativeUpdates.h"
#include "../Interpretation.h"
#include <QStandardPaths>
#include <QCryptographicHash>
#include <QFile>
#include <QInputMethodEvent>
#include <QJsonDocument>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQmlComponent>
#include <QSignalSpy>
#include <QQuickItem>
#include <QQuickWindow>
#include <QPointer>
#include <QTemporaryDir>
#include <QTest>
#include <QTimer>

static QVariantMap current(const WorkbenchBridge &bridge) {
    const auto state = bridge.state();
    const auto id = state.value("active").toMap().value(state.value("feature").toString());
    for (const auto &value : state.value("sessions").toList()) if (value.toMap().value("id") == id) return value.toMap();
    return {};
}
static QVariantMap latest(const WorkbenchBridge &bridge) { return bridge.state().value("tasks").toList().value(0).toMap(); }
static void chunk(WorkbenchBridge &bridge, const QVariantMap &task, const QString &text) {
    bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"chunk", text}});
}
static QQuickItem *visualItem(QQuickItem *item, const QString &name) {
    if (item->objectName() == name) return item;
    for (auto *child : item->childItems()) if (auto *found = visualItem(child, name)) return found;
    return nullptr;
}

static QQuickItem *visualText(QQuickItem *item, const QString &text) {
    if (item->property("text").toString() == text) return item;
    for (auto *child : item->childItems()) if (auto *found = visualText(child, text)) return found;
    return nullptr;
}

class WorkbenchBridgeTests : public QObject {
    Q_OBJECT
private slots:
    // Liquid Glass 2.0 backend (BACKEND-GAPS #2, #5, #9, #21, #24, #25, #29, #42).
    void glassBackendReducerRules() {
        using namespace WorkbenchDomain;
        auto session = [](const QVariantMap &state, const QString &id) { for (const auto &v : state.value("sessions").toList()) if (v.toMap().value("id") == id) return v.toMap(); return QVariantMap{}; };
        auto state = create("chat", "translate");
        // #21: an unchanged dictionary context neither bumps the revision nor clears the entry.
        state = command(state, "navigate", {{"feature", "dictionary"}, {"_updated", 10.0}}, "n1", "a1");
        const QString dict = "chat-dictionary";
        state = command(state, "draft", {{"sessionID", dict}, {"value", "serendipity"}}, "d1", "a1");
        state = command(state, "submit", {{"sessionID", dict}, {"_updated", 100.0}}, "t1", "a1");
        const auto json = QString(R"({"headword":"serendipity","pronunciation":"/x/","meaning":"chance","translations":[{"text":"tình cờ","pronunciation":"tình cờ"}],"related":{"synonyms":["luck"]}})");
        state = command(state, "receive", {{"taskID", "t1"}, {"attemptID", "a1"}, {"chunk", json}, {"terminal", "succeeded"}, {"_updated", 101.5}}, "r1", "a1");
        const auto task = state.value("tasks").toList().value(0).toMap();
        QCOMPARE(task.value("status").toString(), QString("succeeded")); // related words do not fail validation
        // #5: the attempt carries when it started and ended.
        QCOMPARE(task.value("started").toDouble(), 100.0);
        QCOMPARE(task.value("finished").toDouble(), 101.5);
        const auto revision = session(state, dict).value("revision").toLongLong();
        const auto unchanged = command(state, "dictionaryContext", {{"sessionID", dict}, {"value", ""}}, "c1", "a1");
        QCOMPARE(session(unchanged, dict).value("output").toString(), json);
        QCOMPARE(session(unchanged, dict).value("revision").toLongLong(), revision);
        const auto changed = command(state, "dictionaryContext", {{"sessionID", dict}, {"value", "science"}}, "c2", "a1");
        QCOMPARE(session(changed, dict).value("output").toString(), QString());

        // #24: the newest finished chat answer can be regenerated; an older one cannot.
        auto chat = command(create("c", "t"), "draft", {{"sessionID", "c"}, {"value", "Hi"}}, "x", "a");
        chat = command(chat, "submit", {{"sessionID", "c"}}, "q1", "a1");
        chat = command(chat, "receive", {{"taskID", "q1"}, {"attemptID", "a1"}, {"chunk", "Hello"}, {"terminal", "succeeded"}}, "x", "a");
        auto regenerated = command(chat, "retry", {{"taskID", "q1"}}, "x", "a2");
        QCOMPARE(regenerated.value("tasks").toList().value(0).toMap().value("status").toString(), QString("running"));
        chat = command(chat, "draft", {{"sessionID", "c"}, {"value", "Again"}}, "x", "a");
        chat = command(chat, "submit", {{"sessionID", "c"}}, "q2", "b1");
        chat = command(chat, "receive", {{"taskID", "q2"}, {"attemptID", "b1"}, {"chunk", "Sure"}, {"terminal", "succeeded"}}, "x", "a");
        QCOMPARE(command(chat, "retry", {{"taskID", "q1"}}, "x", "a3"), chat);

        // #42: the last enabled workspace page cannot be switched off.
        auto modules = create("c", "t");
        for (const auto &page : {"chat", "translate", "interpret", "dictionary", "thermal"}) modules = command(modules, "module", {{"id", page}, {"enabled", false}}, "x", "a");
        QCOMPARE(command(modules, "module", {{"id", "apps"}, {"enabled", false}}, "x", "a"), modules);
        QVERIFY(command(modules, "module", {{"id", "utilities"}, {"enabled", false}}, "x", "a") != modules);

        // #29: "new" sweeps earlier empty sessions of the feature instead of piling them up.
        auto fresh = create("c", "t");
        fresh = command(fresh, "new", {}, "n1", "a"); fresh = command(fresh, "new", {}, "n2", "a"); fresh = command(fresh, "new", {}, "n3", "a");
        int chats = 0; for (const auto &v : fresh.value("sessions").toList()) if (v.toMap().value("feature") == "chat") ++chats;
        QCOMPARE(chats, 1);

        // #9: the speaking rate is kept, validated, and survives a provider change without a rate.
        auto voice = command(create("c", "t"), "voice", {{"provider", "openai"}, {"voice", "alloy"}, {"rate", 1.25}}, "x", "a");
        QCOMPARE(voice.value("voice").toMap().value("rate").toDouble(), 1.25);
        QVERIFY(validate(voice));
        QCOMPARE(command(voice, "voice", {{"provider", "openai"}, {"voice", "alloy"}, {"rate", 3.0}}, "x", "a"), voice);
        QCOMPARE(command(voice, "voice", {{"provider", "edge"}, {"voice", ""}}, "x", "a").value("voice").toMap().value("rate").toDouble(), 1.25);
        auto legacy = create("c", "t"); legacy["voice"] = QVariantMap{{"provider", "system"}, {"voice", ""}};
        QVERIFY(validate(legacy)); // snapshots without a rate stay readable
        QVERIFY(NativeAudio::rateSupported("edge") && !NativeAudio::rateSupported("gemini") && !NativeAudio::rateSupported("elevenlabs"));
    }
    void glassBackendSmartReset() {
        using namespace WorkbenchDomain;
        auto state = create("c", "t");
        state = command(state, "navigate", {{"feature", "translate"}, {"_updated", 10.0}}, "x", "a");
        state = command(state, "draft", {{"sessionID", "t"}, {"value", "Hello"}}, "x", "a");
        state = command(state, "submit", {{"sessionID", "t"}}, "job", "a1");
        state = command(state, "receive", {{"taskID", "job"}, {"attemptID", "a1"}, {"chunk", "Xin chào"}, {"terminal", "succeeded"}}, "x", "a");
        state = command(state, "navigate", {{"feature", "chat"}, {"_updated", 1000.0}}, "x", "a");
        // Back within two hours: the finished turn stays.
        auto soon = command(state, "navigate", {{"feature", "translate"}, {"_updated", 2000.0}}, "fresh", "a");
        QCOMPARE(soon.value("active").toMap().value("translate").toString(), QString("t"));
        QVERIFY(!soon.contains("_resetNotice"));
        // Back after the break: a fresh turn opens and the old one is remembered.
        auto later = command(state, "navigate", {{"feature", "translate"}, {"_updated", 1000.0 + 7200}}, "fresh", "a");
        QCOMPARE(later.value("active").toMap().value("translate").toString(), QString("fresh"));
        QCOMPARE(later.value("_resetNotice").toMap().value("previousID").toString(), QString("t"));
        later.remove("_resetNotice");
        auto reopened = command(later, "reopenPrevious", {{"feature", "translate"}, {"previousID", "t"}}, "x", "a");
        QCOMPARE(reopened.value("active").toMap().value("translate").toString(), QString("t"));
        for (const auto &v : reopened.value("sessions").toList()) QVERIFY(v.toMap().value("id") != "fresh"); // the empty replacement leaves
        // The setting turns it off.
        auto off = command(state, "smartReset", {{"value", false}}, "x", "a");
        off = command(off, "navigate", {{"feature", "translate"}, {"_updated", 1000.0 + 7200}}, "fresh", "a");
        QCOMPARE(off.value("active").toMap().value("translate").toString(), QString("t"));
        QVERIFY(validate(off));
    }
    // Liquid Glass 2.0 backend, second pass (BACKEND-GAPS #4, #30, #31, #39, #40, #46, #52, #56, #57, #64, #6/#23).
    void glassBackendSecondPassReducer() {
        using namespace WorkbenchDomain;
        auto session = [](const QVariantMap &state, const QString &id) { for (const auto &v : state.value("sessions").toList()) if (v.toMap().value("id") == id) return v.toMap(); return QVariantMap{}; };
        // #31: an image-only turn takes the image's name; a dropped path its file name.
        const QVariantMap image{{"id", QUuid::createUuid().toString(QUuid::WithoutBraces)}, {"name", "beach.png"}, {"mime", "image/png"}, {"width", 1024}, {"height", 768}};
        auto state = command(create("c", "t"), "addImage", {{"sessionID", "c"}, {"image", image}}, "x", "a");
        state = command(state, "submit", {{"sessionID", "c"}, {"_updated", 10.0}}, "q1", "a1");
        QCOMPARE(session(state, "c").value("title").toString(), QString("beach.png"));
        QCOMPARE(derivedTitle("file:///Users/me/My%20Shot.png", {}), QString("My Shot.png"));
        QCOMPARE(derivedTitle("line one\nline two", {}), QString("line one line two"));
        state = command(state, "receive", {{"taskID", "q1"}, {"attemptID", "a1"}, {"chunk", "Sand"}, {"terminal", "succeeded"}}, "x", "a");
        // #57: an emptied name falls back to the first question's title.
        state = command(state, "rename", {{"sessionID", "c"}, {"value", "Holiday"}, {"_updated", 11.0}}, "x", "a");
        QCOMPARE(session(state, "c").value("title").toString(), QString("Holiday"));
        state = command(state, "rename", {{"sessionID", "c"}, {"value", "  "}, {"_updated", 12.0}}, "x", "a");
        QCOMPARE(session(state, "c").value("title").toString(), QString("beach.png"));
        // #30: every edit moves the session up, archiving and favourites included; a no-op does not.
        state = command(state, "model", {{"sessionID", "c"}, {"value", "openai:gpt-5"}, {"_updated", 20.0}}, "x", "a");
        QCOMPARE(session(state, "c").value("updated").toDouble(), 20.0);
        state = command(state, "model", {{"sessionID", "c"}, {"value", "openai:gpt-5"}, {"_updated", 21.0}}, "x", "a");
        QCOMPARE(session(state, "c").value("updated").toDouble(), 20.0);
        // #56: archiving records when; restoring drops it; a malformed value fails closed, an old state passes.
        auto archived = command(state, "archive", {{"sessionID", "c"}, {"value", true}, {"_updated", 30.0}}, "fresh", "a");
        QCOMPARE(session(archived, "c").value("archivedAt").toDouble(), 30.0);
        QCOMPARE(session(archived, "c").value("updated").toDouble(), 30.0);
        QVERIFY(validate(archived));
        QVERIFY(!session(command(archived, "archive", {{"sessionID", "c"}, {"value", false}, {"_updated", 31.0}}, "x", "a"), "c").contains("archivedAt"));
        auto broken = archived; auto sessions = broken.value("sessions").toList();
        for (auto &value : sessions) { auto item = value.toMap(); if (item.value("id") == "c") item["archivedAt"] = "yesterday"; value = item; }
        broken["sessions"] = sessions; QVERIFY(!validate(broken));
        QVERIFY(validate(create("c", "t")));
        // #40: the comparison layout is remembered and type-checked.
        auto layout = command(create("c", "t"), "compareBySentence", {{"value", true}}, "x", "a");
        QCOMPARE(layout.value("compareBySentence").toBool(), true);
        QCOMPARE(command(layout, "compareBySentence", {{"value", "yes"}}, "x", "a"), layout);
        layout["compareBySentence"] = "yes"; QVERIFY(!validate(layout));
        // #39: a dictionary context over 500 characters never reaches a provider.
        auto dictionary = command(create("c", "t"), "draft", {{"sessionID", "c-dictionary"}, {"value", "luck"}}, "x", "a");
        sessions = dictionary.value("sessions").toList();
        for (auto &value : sessions) { auto item = value.toMap(); if (item.value("id") == "c-dictionary") item["dictionaryContext"] = QString(501, 'x'); value = item; }
        dictionary["sessions"] = sessions;
        QCOMPARE(command(dictionary, "submit", {{"sessionID", "c-dictionary"}}, "d1", "a1").value("tasks").toList().size(), 0);
        // #4: "not found" replies are their own outcome, with at most 5 cleaned suggestions.
        auto lookup = command(create("c", "t"), "draft", {{"sessionID", "c-dictionary"}, {"value", "serendipituos"}}, "x", "a");
        lookup = command(lookup, "submit", {{"sessionID", "c-dictionary"}}, "d1", "a1");
        const QString reply = R"({"notFound":true,"suggestions":[{"word":"serendipitous","partOfSpeech":"tính từ","meaning":"tình cờ"},"serendipity",{"word":""}]})";
        lookup = command(lookup, "receive", {{"taskID", "d1"}, {"attemptID", "a1"}, {"chunk", reply}, {"terminal", "succeeded"}}, "x", "a");
        QCOMPARE(lookup.value("tasks").toList().value(0).toMap().value("errorCode").toString(), QString("dictionaryNotFound"));
        const auto suggestions = dictionarySuggestions(reply).toList();
        QCOMPARE(suggestions.size(), 2);
        QCOMPARE(suggestions.value(0).toMap().value("meaning").toString(), QString("tình cờ"));
        QVERIFY(!dictionarySuggestions(R"({"headword":"x"})").isValid());
        // #64: clear history refuses while a task runs, then keeps one empty session per feature.
        auto busy = command(create("c", "t"), "draft", {{"sessionID", "c"}, {"value", "Hi"}}, "x", "a");
        busy = command(busy, "model", {{"sessionID", "c"}, {"value", "openai:gpt-5"}}, "x", "a");
        busy = command(busy, "submit", {{"sessionID", "c"}}, "q1", "a1");
        QCOMPARE(clearableHistory(busy), 1);
        QCOMPARE(command(busy, "clearHistory", {}, "z", "a"), busy);
        busy = command(busy, "receive", {{"taskID", "q1"}, {"attemptID", "a1"}, {"chunk", "Hello"}, {"terminal", "succeeded"}}, "x", "a");
        const auto cleared = command(busy, "clearHistory", {}, "z", "a");
        QCOMPARE(cleared.value("sessions").toList().size(), 3);
        QVERIFY(cleared.value("tasks").toList().isEmpty());
        QCOMPARE(session(cleared, cleared.value("active").toMap().value("chat").toString()).value("model").toString(), QString("openai:gpt-5"));
        QVERIFY(validate(cleared)); QCOMPARE(clearableHistory(cleared), 0);
    }
    void glassBackendSecondPassServices() {
        // #52/#53: a backup whose images carry size and generator still matches its attachment records.
        const auto id = QUuid::createUuid().toString(QUuid::WithoutBraces);
        const QVariantMap image{{"id", id}, {"name", "a.png"}, {"mime", "image/png"}, {"width", 1024}, {"height", 1024}, {"generator", "openai:gpt-image-1"}};
        auto workspace = WorkbenchDomain::command(WorkbenchDomain::create("c", "t"), "addImage", {{"sessionID", "c"}, {"image", image}}, "x", "a");
        const auto snapshot = QJsonDocument::fromVariant(workspace).toJson(QJsonDocument::Compact); const QByteArray bytes("not-really-a-png");
        const auto sha = [](const QByteArray &data) { return QString::fromLatin1(QCryptographicHash::hash(data, QCryptographicHash::Sha256).toHex()); };
        auto record = image; record["data"] = QString::fromLatin1(bytes.toBase64()); record["sha256"] = sha(bytes);
        const auto backup = QJsonDocument::fromVariant(QVariantMap{{"format", "viezan-native-backup"}, {"version", 1}, {"workspace", QString::fromLatin1(snapshot.toBase64())}, {"sha256", sha(snapshot)}, {"attachments", QVariantList{record}}}).toJson();
        QVERIFY(NativeBackup::preview(backup).valid);
        // #56: the archive lists the most recently archived session first.
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        const auto first = current(bridge).value("id").toString(); bridge.command("draft", {{"sessionID", first}, {"value", "first"}});
        bridge.command("new"); const auto second = current(bridge).value("id").toString(); bridge.command("draft", {{"sessionID", second}, {"value", "second"}});
        bridge.command("archive", {{"sessionID", second}, {"value", true}}); QTest::qWait(5);
        bridge.command("archive", {{"sessionID", first}, {"value", true}});
        const auto archive = bridge.history({}, true);
        QCOMPARE(archive.size(), 2);
        QCOMPARE(archive.value(0).toMap().value("id").toString(), first);
        // #46: physical memory is known on every desktop platform.
        QVERIFY(LocalRuntime::memoryBytes() > 0);
        // #6/#23: an unknown one-off provider is refused; nothing starts.
        NativeAudio audio;
        audio.speak("Xin chào", "vi", "result", "bogus");
        QVERIFY(!audio.speaking()); QVERIFY(audio.speakingSource().isEmpty()); QVERIFY(!audio.preparing());
    }
    // Qt parity pass (BACKEND-GAPS #18, #26, #27, #28, #37, #43). ModelLineup cases are Swift's ModelLineupTests.
    void parityModelLineupMatchesSwift() {
        using namespace ModelLineup;
        QStringList claude; for (const auto &id : {"claude-fable-5", "claude-fable-5-1", "claude-haiku-4-5", "claude-haiku-5-5", "claude-opus-4-5", "claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8", "claude-opus-5", "claude-opus-5-5", "claude-sonnet-4-5", "claude-sonnet-4-6", "claude-sonnet-5", "claude-sonnet-5-5"}) claude << QString("claude:") + id;
        QCOMPARE(featured(claude), (QStringList{"claude:claude-fable-5-1", "claude:claude-opus-5-5", "claude:claude-sonnet-5-5", "claude:claude-haiku-5-5"}));
        QStringList openAI; for (const auto &id : {"babbage-002", "chat-latest", "chatgpt-image-latest", "computer-use-preview", "davinci-002", "gpt-3.5-turbo", "gpt-3.5-turbo-0125", "gpt-4.1", "gpt-4.1-mini", "gpt-5", "gpt-5-mini", "gpt-5.5", "gpt-5.5-mini", "gpt-5.5-nano", "o3", "o3-mini", "o4-mini", "text-embedding-3-small", "tts-1", "whisper-1"}) openAI << QString("openai:") + id;
        QCOMPARE(featured(openAI), (QStringList{"openai:gpt-5.5", "openai:gpt-5.5-mini", "openai:gpt-5.5-nano"}));
        QCOMPARE(featured({"openai:o3-pro", "openai:gpt-5.5", "openai:o3", "openai:gpt-5.5-mini"}), (QStringList{"openai:o3-pro", "openai:gpt-5.5", "openai:gpt-5.5-mini"}));
        QStringList gemini; for (const auto &id : {"gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-3-pro", "gemini-2.5-flash-lite", "gemini-embedding-001", "gemini-2.5-flash-live-001"}) gemini << QString("gemini:") + id;
        QCOMPARE(featured(gemini), (QStringList{"gemini:gemini-3-pro", "gemini:gemini-3-flash-preview", "gemini:gemini-2.5-flash-lite"}));
        QCOMPARE(featured({"claude:claude-sonnet-5-5-20260301", "claude:claude-sonnet-5-5"}), QStringList{"claude:claude-sonnet-5-5"});
        QCOMPARE(featured({"ollama:qwen3:4b", "ollama:gemma3:4b"}), (QStringList{"ollama:gemma3:4b", "ollama:qwen3:4b"}));
        QCOMPARE(featured({"openai:zeta-1", "openai:alpha-2"}), (QStringList{"openai:alpha-2", "openai:zeta-1"}));
        QVERIFY(featured({}).isEmpty());
        // Short names.
        QCOMPARE(shortName("claude:claude-sonnet-5-5"), QString("Sonnet 5.5"));
        QCOMPARE(shortName("claude:claude-opus-5"), QString("Opus 5"));
        QCOMPARE(shortName("claude:claude-fable-5-1-20260301"), QString("Fable 5.1"));
        QCOMPARE(shortName("openai:gpt-5.5-mini"), QString("GPT-5.5 Mini"));
        QCOMPARE(shortName("openai:o4-mini"), QString("o4 Mini"));
        QCOMPARE(shortName("gemini:gemini-2.5-flash-lite"), QString("Gemini 2.5 Flash Lite"));
        QCOMPARE(shortName("ollama:qwen3:4b"), QString("qwen3:4b"));
        QCOMPARE(shortName("openai:some-new-thing-2026-05-01"), QString("some-new-thing"));
        QCOMPARE(shortName("openai:gpt-6-astra"), QString("GPT-6 Astra"));
        // Tiers.
        const QStringList claudeListing{"claude:claude-haiku-5-5", "claude:claude-sonnet-5-5", "claude:claude-opus-5-5", "claude:claude-fable-5-1"};
        QCOMPARE(tiers("claude:claude-sonnet-5-5", claudeListing), (QVariantMap{{"fast", "claude:claude-haiku-5-5"}, {"balanced", "claude:claude-sonnet-5-5"}, {"careful", "claude:claude-opus-5-5"}}));
        QCOMPARE(tiers("openai:gpt-5.5", {"openai:gpt-5.5", "openai:gpt-5.5-mini", "openai:gpt-5.5-nano", "openai:babbage-002"}), (QVariantMap{{"fast", "openai:gpt-5.5-nano"}, {"balanced", "openai:gpt-5.5"}, {"careful", "openai:gpt-5.5"}}));
        QCOMPARE(tiers("gemini:gemini-3-flash", {"gemini:gemini-3-pro", "gemini:gemini-3-flash"}), (QVariantMap{{"fast", "gemini:gemini-3-flash"}, {"balanced", "gemini:gemini-3-flash"}, {"careful", "gemini:gemini-3-pro"}}));
        QVERIFY(tiers("claude:claude-sonnet-5-5", {"claude:claude-sonnet-5-5", "claude:claude-sonnet-5"}).isEmpty());
        QVERIFY(tiers("ollama:qwen3:4b", {"ollama:qwen3:4b", "ollama:gemma3:4b"}).isEmpty());
        QStringList shown; for (const auto &id : {"gpt-6.1-sol", "gpt-6-astra", "gpt-5.5-pro", "gpt-5.5", "gpt-5.4-mini", "gpt-5.4-nano"}) shown << QString("openai:") + id;
        QCOMPARE(tiers("openai:gpt-6-astra", shown), (QVariantMap{{"fast", "openai:gpt-5.4-nano"}, {"balanced", "openai:gpt-6.1-sol"}, {"careful", "openai:gpt-6.1-sol"}}));
        QCOMPARE(tiers("openai:gpt-6.1-sol", shown + QStringList{"openai:gpt-6.1-mini"}).value("fast").toString(), QString("openai:gpt-6.1-mini"));
        // Search.
        QStringList listing; for (const auto &id : {"gpt-4o", "gpt-4o-2024-05-13", "gpt-4o-2024-08-06", "gpt-4o-mini", "gpt-4o-mini-tts", "gpt-4o-transcribe", "gpt-4o-mini-search-preview", "gpt-4.1-mini", "gpt-5", "whisper-1"}) listing << QString("openai:") + id;
        QCOMPARE(search(listing, ""), (QStringList{"openai:gpt-4.1-mini", "openai:gpt-4o", "openai:gpt-4o-mini", "openai:gpt-5"}));
        QCOMPARE(search(listing, "MINI"), (QStringList{"openai:gpt-4.1-mini", "openai:gpt-4o-mini"}));
        QCOMPARE(search({"openai:gpt-4o-2024-05-13", "openai:gpt-4o-2024-08-06"}, "4o"), QStringList{"openai:gpt-4o-2024-08-06"});
        // Sections and recent.
        const QMap<QString, QStringList> listings{{"openai", {"openai:gpt-5.5", "openai:gpt-5.5-mini", "openai:whisper-1"}}, {"claude", {"claude:claude-sonnet-5-5", "claude:claude-haiku-5-5"}}, {"ollama", {"ollama:qwen3:4b"}}};
        const QVariantMap tierMap{{"fast", "openai:gpt-5.5-mini"}, {"balanced", "openai:gpt-5.5"}, {"careful", "openai:gpt-5.5"}};
        const QStringList cloud{"openai", "claude", "gemini"}, local{"ollama", "lmstudio", "llamacpp"};
        const auto keys = [](const QVariantList &list) { QStringList out; for (const auto &v : list) out << v.toMap().value("key").toString(); return out; };
        const auto idle = sections("", tierMap, {"claude:claude-haiku-5-5", "openai:gpt-5.5"}, listings, cloud, local);
        QCOMPARE(keys(idle), (QStringList{"purpose", "recent", "openai", "claude", "gemini", "local"}));
        QCOMPARE(idle[1].toMap().value("rows").toList().size(), 1);
        QCOMPARE(idle[4].toMap().value("rows").toList().value(0).toMap().value("kind").toString(), QString("setup"));
        QCOMPARE(keys(sections("mini", tierMap, {}, listings, cloud, local)), QStringList{"openai"});
        QCOMPARE(keys(sections("openai:gpt-7", {}, {}, listings, cloud, local)).last(), QString("typed"));
        QVERIFY(sections("zzz", {}, {}, listings, cloud, local).isEmpty());
        QCOMPARE(recent({"ollama:d", "gemini:c", "ollama:d", "openai:whisper-1", "claude:a", "openai:b"}), (QStringList{"ollama:d", "gemini:c", "claude:a"}));
    }
    void parityReducerAndBridge() {
        using namespace WorkbenchDomain;
        // #18: Translate refuses a source over 5 000 characters, for a turn and for a comparison.
        auto state = command(create("c", "t"), "draft", {{"sessionID", "t"}, {"value", QString(5001, 'a')}}, "x", "a");
        QVERIFY(command(state, "submit", {{"sessionID", "t"}}, "q", "a").value("tasks").toList().isEmpty());
        QVERIFY(command(state, "compare", {{"sessionID", "t"}, {"models", QStringList{"openai:gpt-5", "claude:claude-sonnet-5"}}}, "x", "a").value("tasks").toList().isEmpty());
        state = command(state, "draft", {{"sessionID", "t"}, {"value", QString(5000, 'a')}}, "x", "a");
        QCOMPARE(command(state, "submit", {{"sessionID", "t"}}, "q", "a").value("tasks").toList().size(), 1);
        // #27: delete a session at once, never while it runs; Undo puts it back as the current one.
        auto chat = command(create("c", "t"), "draft", {{"sessionID", "c"}, {"value", "Hi"}}, "x", "a");
        chat = command(chat, "submit", {{"sessionID", "c"}}, "q1", "a1");
        QCOMPARE(command(chat, "removeSession", {{"sessionID", "c"}}, "fresh", "a"), chat);
        chat = command(chat, "receive", {{"taskID", "q1"}, {"attemptID", "a1"}, {"chunk", "Hello"}, {"terminal", "succeeded"}}, "x", "a");
        const auto removed = command(chat, "removeSession", {{"sessionID", "c"}}, "fresh", "a");
        QVERIFY(validate(removed)); QCOMPARE(removed.value("active").toMap().value("chat").toString(), QString("fresh"));
        QVERIFY(removed.value("tasks").toList().isEmpty());
        QVariantMap original; for (const auto &v : chat.value("sessions").toList()) if (v.toMap().value("id") == "c") original = v.toMap();
        const auto restored = command(removed, "restoreSession", {{"session", original}, {"index", 0}}, "x", "a");
        QCOMPARE(restored.value("active").toMap().value("chat").toString(), QString("c"));
        QCOMPARE(command(restored, "restoreSession", {{"session", original}, {"index", 0}}, "x", "a"), restored);
        // #43: update preferences are optional, typed, and the snooze lasts 24 hours.
        auto updates = command(create("c", "t"), "autoCheckUpdates", {{"value", false}}, "x", "a");
        QCOMPARE(updates.value("updates").toMap().value("autoCheck").toBool(), false);
        updates = command(updates, "snoozeUpdate", {{"version", "2.5.0"}, {"_updated", 1000.0}}, "x", "a");
        QCOMPARE(updates.value("updates").toMap().value("snoozedUntil").toDouble(), 87400.0);
        QVERIFY(validate(updates));
        auto broken = updates; broken["updates"] = QVariantMap{{"autoCheck", "yes"}}; QVERIFY(!validate(broken));
        // Bridge: remove returns what Undo needs; a fresh bridge checks updates in the background by default.
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        const auto id = current(bridge).value("id").toString(); bridge.command("draft", {{"sessionID", id}, {"value", "keep me"}});
        const auto undo = bridge.removeSession(id);
        QCOMPARE(undo.value("session").toMap().value("draft").toString(), QString("keep me"));
        QVERIFY(current(bridge).value("id").toString() != id);
        bridge.restoreSession(undo.value("session").toMap(), undo.value("index").toInt());
        QCOMPARE(current(bridge).value("id").toString(), id);
        QVERIFY(bridge.autoCheckUpdates()); bridge.setAutoCheckUpdates(false); QVERIFY(!bridge.autoCheckUpdates());
        QVERIFY(bridge.updatePrompt().isEmpty()); QVERIFY(!bridge.updateSnoozed("9.9.9"));
        QVERIFY(bridge.modelTiers(id).isEmpty()); // no provider listing in tests
        QCOMPARE(bridge.shortModelName("claude:claude-sonnet-5-5"), QString("Sonnet 5.5"));
        QVERIFY(bridge.rateSupported("edge")); QVERIFY(!bridge.rateSupported("gemini"));
    }
    void parityInterpretationRestoreAndCancelSummary() {
        QStandardPaths::setTestModeEnabled(true);
        QFile::remove(QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) + "/interpretation.json");
        {
            Interpretation interpretation;
            const QVariantMap session{{"id", "meeting"}, {"created", 100.0}, {"model", "openai:gpt-5"}, {"provider", "openai"}, {"source", "en"}, {"target", "vi"}, {"locale", "vi"}, {"segments", QVariantList{}}, {"summary", ""}};
            interpretation.restoreSession(session);
            QCOMPARE(interpretation.sessions().size(), 1);
            interpretation.restoreSession(session); // already there: no duplicate
            QCOMPARE(interpretation.sessions().size(), 1);
            interpretation.deleteSession("meeting"); QVERIFY(interpretation.sessions().isEmpty());
            interpretation.restoreSession(session); QCOMPARE(interpretation.sessions().size(), 1);
            QVERIFY(!interpretation.summarizing()); interpretation.cancelSummary(); QVERIFY(!interpretation.summarizing());
        }
        QFile::remove(QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) + "/interpretation.json");
        QStandardPaths::setTestModeEnabled(false);
    }
    // Remaining gaps (BACKEND-GAPS #8, #10, #12, #16, #32, #45, #47, #63, #66, #68).
    void remainingGapsServices() {
        // #32: palette queries read sums, prefixes and questions, as Swift PaletteQuery.
        QCOMPARE(LauncherTools::paletteQuery("2+3*4"), (QVariantMap{{"kind", "calculation"}, {"value", "14"}}));
        QCOMPARE(LauncherTools::paletteQuery("? what is a mile"), (QVariantMap{{"kind", "ask"}, {"value", "what is a mile"}}));
        QCOMPARE(LauncherTools::paletteQuery("t xin chào"), (QVariantMap{{"kind", "translate"}, {"value", "xin chào"}}));
        QCOMPARE(LauncherTools::paletteQuery("D serendipity"), (QVariantMap{{"kind", "lookup"}, {"value", "serendipity"}}));
        QVERIFY(LauncherTools::paletteQuery("settings").isEmpty()); QVERIFY(LauncherTools::paletteQuery("t ").isEmpty());
        // #63: download estimates wait for a stable rate.
        QCOMPARE(NativeUpdates::remaining(10, 0.5), 10.0);
        QCOMPARE(NativeUpdates::remaining(0.5, 0.5), -1.0); QCOMPARE(NativeUpdates::remaining(10, 0.01), -1.0);
        NativeUpdates updates; QCOMPARE(updates.packageSize(), qint64(0)); QCOMPARE(updates.checkedAt(), 0.0); QCOMPARE(updates.remainingSeconds(), -1.0);
        // #10 / #16 / #8: no recording yet; a known permission word; system voices carry their language.
        NativeAudio audio;
        QCOMPARE(audio.recordingStarted(), 0.0);
        QVERIFY(QStringList({"granted", "denied", "undetermined"}).contains(audio.microphonePermission()));
        for (const auto &voice : audio.voiceList()) QVERIFY(!voice.toMap().value("language").toString().isEmpty());
        audio.configureVoice("edge", "", 1); QVERIFY(audio.voiceFor("en").isEmpty());
        // #45 / #47: launcher home and the shared local model suggestions.
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("module", {{"id", "interpret"}, {"enabled", false}});
        const auto home = bridge.launcherHome({});
        QStringList routes; for (const auto &page : home.value("pages").toList()) routes << page.toMap().value("route").toString();
        QCOMPARE(routes, (QStringList{"translate", "dictionary", "chat", "settings"}));
        QVERIFY(!home.contains("continue"));
        const auto chat = current(bridge).value("id").toString();
        bridge.command("draft", {{"sessionID", chat}, {"value", "Hi"}}); bridge.command("model", {{"sessionID", chat}, {"value", "openai:gpt-5"}}); bridge.command("submit", {{"sessionID", chat}});
        QCOMPARE(bridge.launcherHome(chat).value("continue").toMap().value("fresh").toBool(), true);
        QStringList suggested; for (const auto &item : bridge.resources().value("localModelSuggestions").toList()) suggested << item.toMap().value("id").toString();
        QCOMPARE(suggested, (QStringList{"qwen3:4b", "gemma3:4b", "llama3.2:3b", "qwen2.5:7b"}));
    }
    void remainingGapsInterpretation() {
        // #68 and #66 on Qt, against the test-mode store (never the app's own data).
        QStandardPaths::setTestModeEnabled(true);
        const auto folder = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation); QDir().mkpath(folder);
        const auto path = folder + "/interpretation.json";
        { QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write("not json"); }
        {
            Interpretation interpretation;
            QVERIFY(interpretation.blocked()); QCOMPARE(interpretation.error(), QString("interpretStorageError"));
            const QVariantList sessions{QVariantMap{{"id", "meeting"}, {"created", 100.0}, {"model", "openai:gpt-5"}, {"provider", "openai"}, {"source", "en"}, {"target", "vi"}, {"locale", "vi"}, {"summary", ""},
                                                    {"segments", QVariantList{QVariantMap{{"id", "s1"}, {"start", 0.0}, {"end", 2.0}, {"speaker", "A"}, {"original", "Hello"}, {"translated", "Xin chào"}, {"status", "done"}}}}}};
            { QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write(QJsonDocument::fromVariant(sessions).toJson()); }
            interpretation.reload();
            QVERIFY(!interpretation.blocked()); QVERIFY(interpretation.error().isEmpty()); QCOMPARE(interpretation.sessions().size(), 1);
            QVERIFY(interpretation.exportText(false, true).startsWith("[A] Xin chào"));
            QVERIFY(!interpretation.exportText(true, true).contains("Hello"));
            QVERIFY(interpretation.exportText(false).startsWith("[A] Hello\nXin chào"));
        }
        QFile::remove(path); QStandardPaths::setTestModeEnabled(false);
    }
    void glassBackendHistoryAndSpeechLanguage() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "chat"}});
        bridge.command("draft", {{"value", "Xin chào bạn"}});
        bridge.command("navigate", {{"feature", "translate"}});
        bridge.command("draft", {{"value", "Đường phố"}});
        bridge.command("navigate", {{"feature", "dictionary"}}); // empty dictionary session stays out of history
        QCOMPARE(bridge.history("", false, {}).size(), 2);
        QCOMPARE(bridge.history("", false, {"chat"}).size(), 1);
        QCOMPARE(bridge.history("duong", false, {}).size(), 1); // diacritics and đ fold
        QCOMPARE(bridge.history("", true, {}).size(), 0);
        QCOMPARE(bridge.speechLanguage("こんにちは"), QString("ja"));
        QCOMPARE(bridge.speechLanguage("Hello there", "en"), QString("en"));
        QCOMPARE(bridge.speechLanguage("Hello there", "auto"), QString("vi")); // falls back to the UI locale
    }
    void workspaceDropsRetiredBrowserSettingsDuringRecovery() {
        auto saved = WorkbenchDomain::create("chat-id", "translate-id");
        saved["bridge"] = QVariantMap{{"automatic", true}, {"origins", QStringList{"https://example.org"}}};
        saved["disabledModules"] = QStringList{"bridge", "thermal"};
        const auto recovered = WorkbenchDomain::recover(saved);
        QVERIFY(!recovered.contains("bridge"));
        QCOMPARE(recovered.value("disabledModules").toStringList(), QStringList{"thermal"});
        QCOMPARE(recovered.value("active"), saved.value("active"));
    }
    void voiceGlyphInstantiatesInsideLoader() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QQmlEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        QQmlComponent component(&engine);
        component.setData(R"(
            import QtQuick
            import "qrc:/qml" as Viezan
            Item {
                width: 100; height: 40
                Loader {
                    objectName: "voice-loader"
                    sourceComponent: Viezan.Kit.VoiceGlyph { color: "black" }
                }
            }
        )", QUrl("qrc:/voice-glyph-test.qml"));
        QScopedPointer<QObject> owner(component.create());
        QVERIFY2(owner, qPrintable(component.errorString()));
        auto *loader = owner->findChild<QObject *>("voice-loader");
        QVERIFY(loader);
        auto *glyph = loader->property("item").value<QQuickItem *>();
        QVERIFY(glyph);
        QVERIFY(glyph->implicitWidth() > 0 && glyph->implicitHeight() > 0);
        QCoreApplication::processEvents();
        QCOMPARE(warnings.count(), 0);
    }
    void editorUndoDoesNotCrossSessions_data() {
        QTest::addColumn<QString>("feature");
        QTest::newRow("chat") << QString("chat");
        QTest::newRow("translate") << QString("translate");
    }
    void editorUndoDoesNotCrossSessions() {
        QFETCH(QString, feature);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("navigate", {{"feature", feature}});
        bridge.command("draft", {{"value", "Base draft"}});
        const auto oldID = current(bridge).value("id");
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        auto *editor = visualItem(root->contentItem(), feature == "chat" ? "chat-draft" : "source-draft");
        QVERIFY(editor);
        editor->forceActiveFocus();
        editor->setProperty("cursorPosition", 10);
        QTest::keyClick(root, Qt::Key_X);
        QCOMPARE(current(bridge).value("draft").toString(), QString("Base draftx"));
        QTest::keyClick(root, Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(current(bridge).value("draft").toString(), QString("Base draft"));
        QTest::keyClick(root, Qt::Key_Z, Qt::ControlModifier | Qt::ShiftModifier);
        QCOMPARE(current(bridge).value("draft").toString(), QString("Base draftx"));
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "new"), Q_ARG(QVariant, QVariant())));
        QTRY_VERIFY(editor->hasActiveFocus());
        const auto fresh = bridge.state();
        QVERIFY(current(bridge).value("id") != oldID);
        QTest::keyClick(root, Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(bridge.state(), fresh);
    }
    void keypadHistoryRespectsCompositionAndOpensSelection() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("draft", {{"value", "Target history 日本語"}});
        const auto target = current(bridge).value("id").toString();
        bridge.command("new");
        bridge.command("draft", {{"value", "Keep current draft"}});
        const auto before = bridge.state();
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "history"), Q_ARG(QVariant, QVariant())));
        auto *search = visualItem(root->contentItem(), "history-search");
        QVERIFY(search);
        QTRY_VERIFY(search->hasActiveFocus());
        search->setProperty("text", "Target history");
        QTRY_COMPARE(root->property("quickID").toString(), target);
        QInputMethodEvent composing(QString::fromUtf8("にほん"), {});
        QCoreApplication::sendEvent(search, &composing);
        QTRY_VERIFY(search->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Enter);
        QCOMPARE(bridge.state(), before);
        QVERIFY(root->findChild<QObject *>("quick-history")->property("visible").toBool());
        QInputMethodEvent finished;
        QCoreApplication::sendEvent(search, &finished);
        QTRY_VERIFY(!search->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Enter);
        QCOMPARE(current(bridge).value("id").toString(), target);
        QVERIFY(!root->findChild<QObject *>("quick-history")->property("visible").toBool());
        QCOMPARE(bridge.state().value("sessions"), before.value("sessions"));
    }
    void keypadSubmitAndCommands_data() {
        QTest::addColumn<QString>("feature");
        QTest::newRow("chat") << QString("chat");
        QTest::newRow("translate") << QString("translate");
    }
    void keypadSubmitAndCommands() {
        QFETCH(QString, feature);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("navigate", {{"feature", feature}});
        bridge.command("draft", {{"value", "Keypad 日本語"}});
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        auto *editor = visualItem(root->contentItem(), feature == "chat" ? "chat-draft" : "source-draft");
        QVERIFY(editor);
        editor->forceActiveFocus();
        QInputMethodEvent composing(QString::fromUtf8("にほん"), {});
        QCoreApplication::sendEvent(editor, &composing);
        QTRY_VERIFY(editor->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Enter, Qt::ControlModifier);
        QVERIFY(bridge.state().value("tasks").toList().isEmpty());
        QInputMethodEvent finished;
        QCoreApplication::sendEvent(editor, &finished);
        QTRY_VERIFY(!editor->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Enter, Qt::ControlModifier);
        QCOMPARE(latest(bridge).value("status").toString(), QString("running"));
        const auto running = bridge.state();
        QTest::keyClick(root, Qt::Key_Enter, Qt::ControlModifier);
        QCOMPARE(bridge.state(), running);
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "commands"), Q_ARG(QVariant, QVariant())));
        auto *search = visualItem(root->contentItem(), "command-search");
        QVERIFY(search);
        QTRY_VERIFY(search->hasActiveFocus());
        QCoreApplication::sendEvent(search, &composing);
        QTRY_VERIFY(search->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Enter);
        QVERIFY(root->findChild<QObject *>("command-palette")->property("visible").toBool());
        QCoreApplication::sendEvent(search, &finished);
        QTRY_VERIFY(!search->property("inputMethodComposing").toBool());
        search->setProperty("text", "Cài đặt");
        QTest::keyClick(root, Qt::Key_Enter);
        QTRY_VERIFY(root->property("settings").toBool());
        QVERIFY(!root->findChild<QObject *>("command-palette")->property("visible").toBool());
        QCOMPARE(bridge.state().value("sessions"), running.value("sessions"));
        QCOMPARE(bridge.state().value("tasks"), running.value("tasks"));
        QCOMPARE(bridge.state().value("active"), running.value("active"));
        // Settings is transient: both native clients restore Home on the next launch.
        QCOMPARE(bridge.state().value("shell").toMap().value("lastRoute").toString(), QString("home"));
    }
    void navigationSelectionSurvivesRepeatedActivation_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<int>("width");
        QTest::addColumn<QString>("preset");
        QTest::addColumn<QString>("mode");
        for (const auto &locale : {"vi", "en", "ja"})
            for (int width : {640, 820, 1200, 1440}) {
                QTest::newRow(qPrintable(QString("%1-%2-graphite").arg(locale).arg(width)))
                    << QString(locale) << width << QString("graphite") << QString("light");
                for (const auto &mode : {"light", "dark"})
                    QTest::newRow(qPrintable(QString("%1-%2-glass-%3").arg(locale).arg(width).arg(mode)))
                        << QString(locale) << width << QString("glass") << QString(mode);
            }
    }
    void navigationSelectionSurvivesRepeatedActivation() {
        QFETCH(QString, locale); QFETCH(int, width);
        QFETCH(QString, preset); QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("appearance", {{"preset", preset}, {"mode", mode}});
        const auto labels = bridge.resources().value("locales").toMap().value(locale).toMap();
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->setWidth(width); root->setHeight(480);
        QCoreApplication::processEvents();
        auto *nav = visualItem(root->contentItem(), "primary-navigation");
        QVERIFY(nav);
        auto *chat = visualText(nav, labels.value("chat").toString());
        auto *translate = visualText(nav, labels.value("translate").toString());
        QVERIFY(chat); QVERIFY(translate);
        QTRY_VERIFY(chat->width() > 0);
        const auto click = [&](QQuickItem *item) {
            QTest::mouseClick(root, Qt::LeftButton, Qt::NoModifier,
                item->mapToScene(QPointF(item->width()/2, item->height()/2)).toPoint());
        };
        QTRY_VERIFY(chat->property("checked").toBool());
        click(chat);
        QTRY_VERIFY(chat->property("checked").toBool());
        click(translate);
        QTRY_VERIFY(translate->property("checked").toBool());
        QVERIFY(!chat->property("checked").toBool());
        click(translate);
        QTRY_VERIFY(translate->property("checked").toBool());
        translate->forceActiveFocus();
        QTest::keyClick(root, Qt::Key_Space);
        QVERIFY(translate->property("checked").toBool());
        QCOMPARE(bridge.state().value("feature").toString(), QString("translate"));
    }
    void submitShortcutDoesNotCancelRunningTask_data() {
        QTest::addColumn<QString>("feature");
        QTest::newRow("chat") << QString("chat");
        QTest::newRow("translate") << QString("translate");
    }
    void submitShortcutDoesNotCancelRunningTask() {
        QFETCH(QString, feature);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("navigate", {{"feature", feature}});
        bridge.command("draft", {{"value", "日本語 · Tiếng Việt"}});
        bridge.command("submit");
        const auto before = bridge.state();
        QCOMPARE(latest(bridge).value("status").toString(), QString("running"));
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        auto *editor = visualItem(root->contentItem(), feature == "chat" ? "chat-draft" : "source-draft");
        QVERIFY(editor);
        editor->forceActiveFocus();
        QTRY_VERIFY(editor->hasActiveFocus());
        QTest::keyClick(root, Qt::Key_Return, Qt::ControlModifier);
        QCOMPARE(bridge.state(), before);
        QCOMPARE(latest(bridge).value("status").toString(), QString("running"));
    }
    void foundationOverlayResizeAndEscape_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<QString>("mode");
        for (const auto &locale : {"vi", "en", "ja"})
            for (const auto &mode : {"light", "dark"})
                QTest::newRow(qPrintable(QString("%1-%2").arg(locale).arg(mode))) << QString(locale) << QString(mode);
    }
    void foundationOverlayResizeAndEscape() {
        QFETCH(QString, locale); QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("appearance", {{"mode", mode}, {"textSize", "large"}});
        for (int i = 0; i < 8; ++i) {
            bridge.command("new");
            bridge.command("draft", {{"value", QString("Draft %1 日本語").arg(i)}});
        }
        const auto before = bridge.state();
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        auto *opener = visualItem(root->contentItem(), "chat-draft");
        QVERIFY(opener);
        for (const auto &id : {"history", "commands", "activity"}) {
            root->setWidth(1440); root->setHeight(900);
            opener->forceActiveFocus();
            QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, id), Q_ARG(QVariant, QVariant::fromValue(opener))));
            const auto name = QString(id) == "history" ? "quick-history" : QString(id) == "commands" ? "command-palette" : "activity-panel";
            auto *panel = root->findChild<QObject *>(name);
            QVERIFY(panel);
            QTRY_VERIFY(panel->property("visible").toBool());
            for (int width : {640, 820, 1200, 1440}) {
                root->setWidth(width); root->setHeight(480);
                QTRY_VERIFY(panel->property("x").toDouble() >= 0);
                QTRY_VERIFY(panel->property("x").toDouble() + panel->property("width").toDouble() <= root->width());
                QTRY_VERIFY(panel->property("y").toDouble() + panel->property("height").toDouble() <= root->height());
            }
            QTest::keyClick(root, Qt::Key_Escape);
            QTRY_VERIFY(!panel->property("visible").toBool());
            QTRY_VERIFY(opener->hasActiveFocus());
        }
        QCOMPARE(bridge.state(), before);
        QCOMPARE(warnings.count(), 0);
    }
    void foundationPanelDismissControlsRemainReachable() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", "ja"}});
        for (int i = 0; i < 12; ++i) {
            bridge.command("new");
            bridge.command("draft", {{"value", QString("QA %1 日本語").arg(i)}});
            bridge.command("submit");
        }
        bridge.command("draft", {{"value", "Unsent draft\n日本語\nTiếng Việt"}});
        const auto before = bridge.state();
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->setWidth(640); root->setHeight(480);
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "activity"), Q_ARG(QVariant, QVariant())));
        auto *panel = root->findChild<QObject *>("activity-panel");
        QVERIFY(panel);
        QTRY_VERIFY(panel->property("visible").toBool());
        auto *close = visualItem(root->contentItem(), "activity-close");
        auto *scroll = visualItem(root->contentItem(), "activity-scroll");
        QVERIFY(close); QVERIFY(scroll);
        QTRY_VERIFY(close->hasActiveFocus());
        QTRY_VERIFY(close->mapToScene(QPointF(close->width(), 0)).x() <= root->width());
        const auto position = close->mapToScene(QPointF(0, 0));
        auto *flickable = scroll->property("contentItem").value<QObject *>();
        QVERIFY(flickable);
        QTRY_VERIFY(flickable->property("contentHeight").toDouble() > scroll->height());
        QVERIFY(flickable->setProperty("contentY", 300));
        QCoreApplication::processEvents();
        QCOMPARE(close->mapToScene(QPointF(0, 0)), position);
        QVERIFY(close->isVisible() && close->isEnabled());
        QVERIFY(QMetaObject::invokeMethod(close, "clicked"));
        QTRY_VERIFY(!panel->property("visible").toBool());
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "history"), Q_ARG(QVariant, QVariant())));
        auto *history = root->findChild<QObject *>("quick-history");
        QVERIFY(history);
        QTRY_VERIFY(history->property("visible").toBool());
        auto *snippet = visualItem(root->contentItem(), "history-snippet");
        QVERIFY(snippet);
        QVERIFY(!snippet->property("text").toString().contains('\n'));
        QCOMPARE(snippet->property("maximumLineCount").toInt(), 1);
        auto *historyClose = visualItem(root->contentItem(), "history-close");
        QVERIFY(historyClose);
        QVERIFY(historyClose->isVisible() && historyClose->isEnabled());
        QVERIFY(historyClose->mapToScene(QPointF(historyClose->width(), 0)).x() <= root->width());
        QVERIFY(QMetaObject::invokeMethod(historyClose, "clicked"));
        QTRY_VERIFY(!history->property("visible").toBool());
        QCOMPARE(bridge.state(), before);
        QCOMPARE(warnings.count(), 0);
    }
    void foundationSaveRetryControls_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<int>("width");
        for (const auto &locale : {"vi", "en", "ja"})
            for (int width : {640, 820, 1200, 1440})
                QTest::newRow(qPrintable(QString("%1-%2").arg(locale).arg(width))) << QString(locale) << width;
    }
    void foundationSaveRetryControls() {
        QFETCH(QString, locale); QFETCH(int, width);
        QTemporaryDir dir;
        QFile blocker(dir.filePath("blocker"));
        QVERIFY(blocker.open(QIODevice::WriteOnly)); blocker.close();
        const auto path = blocker.fileName() + "/state.json";
        WorkbenchBridge bridge(nullptr, path, false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("draft", {{"value", "Keep this draft 日本語"}});
        QCOMPARE(bridge.storageError(), QString("storageError"));
        QVERIFY(!bridge.loadBlocked());
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->setWidth(width); root->setHeight(480);
        QCoreApplication::processEvents();
        const auto labels = bridge.resources().value("locales").toMap().value(locale).toMap();
        auto *retry = visualText(root->contentItem(), labels.value("retrySave").toString());
        auto *notice = visualText(root->contentItem(), labels.value("storageError").toString());
        auto *draft = visualItem(root->contentItem(), "chat-draft");
        QVERIFY(retry); QVERIFY(notice); QVERIFY(draft);
        QVERIFY(retry->isVisible() && retry->isEnabled());
        QVERIFY(draft->isEnabled());
        for (auto *item : {retry, notice, draft}) {
            QVERIFY(item->width() > 0);
            QVERIFY(item->mapToScene(QPointF(0, 0)).x() >= 0);
            QVERIFY(item->mapToScene(QPointF(item->width(), 0)).x() <= root->width());
        }
        QVERIFY(blocker.remove()); // Only this test's temporary obstacle.
        QVERIFY(QMetaObject::invokeMethod(retry, "clicked"));
        QTRY_VERIFY(bridge.storageError().isEmpty());
        QTRY_VERIFY(!retry->isVisible());
        WorkbenchBridge restored(nullptr, path, false);
        QCOMPARE(current(restored).value("draft").toString(), QString("Keep this draft 日本語"));
        QCOMPARE(warnings.count(), 0);
    }
    void foundationMarkedTextAndCompactDismissal() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->setWidth(640); root->setHeight(480);
        auto execute = [&](const QString &id) { return QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, id), Q_ARG(QVariant, QVariant())); };
        QVERIFY(execute("commands"));
        auto *palette = root->findChild<QObject *>("command-palette");
        QVERIFY(palette);
        QTRY_VERIFY(palette->property("visible").toBool());
        auto *search = visualItem(root->contentItem(), "command-search");
        QVERIFY(search);
        QTRY_VERIFY(search->hasActiveFocus());
        QInputMethodEvent preedit(QString::fromUtf8("にほん"), {});
        QCoreApplication::sendEvent(search, &preedit);
        QTRY_VERIFY(search->property("inputMethodComposing").toBool());
        const auto before = bridge.state();
        QTest::keyClick(root, Qt::Key_Return);
        QTest::keyClick(root, Qt::Key_Escape);
        QVERIFY(palette->property("visible").toBool());
        QCOMPARE(bridge.state(), before);
        QInputMethodEvent commit;
        commit.setCommitString(QString::fromUtf8("日本"));
        QCoreApplication::sendEvent(search, &commit);
        QTRY_VERIFY(!search->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Escape);
        QTRY_VERIFY(!palette->property("visible").toBool());
        QVERIFY(execute("navigation"));
        auto *navigation = root->findChild<QObject *>("navigation-overlay");
        QVERIFY(navigation);
        QTRY_VERIFY(navigation->property("visible").toBool());
        QVERIFY(execute("commands"));
        QTRY_VERIFY(!navigation->property("visible").toBool());
        QVERIFY(execute("navigation"));
        QTRY_VERIFY(!palette->property("visible").toBool());
        root->setWidth(1200);
        QTRY_VERIFY(!navigation->property("visible").toBool());
        QCOMPARE(bridge.state(), before);
    }
    void foundationBlockedLoadInMountedShell() {
        QTemporaryDir dir;
        const auto path = dir.filePath("state.json");
        QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write("invalid-json"); file.close();
        WorkbenchBridge bridge(nullptr, path, false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = engine.rootObjects().first();
        const auto before = bridge.state();
        for (const auto &id : {"new", "translate", "history"})
            QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, id), Q_ARG(QVariant, QVariant())));
        QCOMPARE(bridge.state(), before);
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "settings"), Q_ARG(QVariant, QVariant())));
        QVERIFY(root->property("settings").toBool());
        QVERIFY(file.open(QIODevice::ReadOnly)); QCOMPARE(file.readAll(), QByteArray("invalid-json"));
    }
    void foundationLayoutAndNavigation_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<int>("width");
        QTest::addColumn<QString>("mode");
        for (const auto &locale : {"vi", "en", "ja"})
            for (const auto width : {640, 820, 1200, 1440})
                for (const auto &mode : {"light", "dark"})
                    QTest::newRow(qPrintable(QString("%1-%2-%3").arg(locale).arg(width).arg(mode))) << QString(locale) << width << QString(mode);
    }
    void foundationLayoutAndNavigation() {
        QFETCH(QString, locale); QFETCH(int, width); QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("appearance", {{"mode", mode}});
        bridge.command("draft", {{"value", "Foundation draft 日本語"}});
        const auto before = bridge.state();
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->setWidth(width); root->setHeight(600);
        QCoreApplication::processEvents();
        auto *navigation = visualItem(root->contentItem(), "primary-navigation");
        QVERIFY(navigation);
        const auto metrics = bridge.resources().value("metrics").toMap();
        const auto rail = metrics.value("rail").toDouble();
        const auto sidebar = metrics.value("sidebar").toDouble();
        QVERIFY(rail > 0 && sidebar > rail);
        QTRY_VERIFY(qAbs(navigation->width() - (width < 900 ? rail : sidebar)) < 0.5);
        QCOMPARE(bridge.state(), before);
        bridge.command("navigation", {{"collapsed", true}});
        QTRY_COMPARE(navigation->width(), rail);
        root->setWidth(820); QCoreApplication::processEvents();
        root->setWidth(1200); QCoreApplication::processEvents();
        QTRY_COMPARE(navigation->width(), rail);
        QVERIFY(bridge.state().value("shell").toMap().value("navigationCollapsed").toBool());
        QCOMPARE(bridge.state().value("sessions"), before.value("sessions"));
        WorkbenchBridge restored(nullptr, dir.filePath("state.json"), false);
        QVERIFY(restored.state().value("shell").toMap().value("navigationCollapsed").toBool());
        root->setWidth(width);
        QCoreApplication::processEvents();
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "commands"), Q_ARG(QVariant, QVariant())));
        auto *palette = root->findChild<QObject *>("command-palette");
        QVERIFY(palette);
        QTRY_VERIFY(palette->property("visible").toBool());
        QVERIFY(palette->property("width").toDouble() <= width);
        auto *search = visualItem(root->contentItem(), "command-search");
        QVERIFY(search);
        QTRY_VERIFY(search->hasActiveFocus());
        search->setProperty("text", locale == "vi" ? "lich su" : locale == "en" ? "History" : "履歴");
        QCoreApplication::processEvents();
        QCOMPARE(root->property("commandIndex").toInt(), 0);
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "activity"), Q_ARG(QVariant, QVariant())));
        QTRY_VERIFY(!palette->property("visible").toBool());
        QCOMPARE(warnings.count(), 0);
    }
    void chatStreamingKeepsSelectionAndReadingPosition_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<bool>("compact");
        QTest::newRow("vi-wide") << "vi" << false;
        QTest::newRow("en-wide") << "en" << false;
        QTest::newRow("ja-wide") << "ja" << false;
        QTest::newRow("vi-640") << "vi" << true;
        QTest::newRow("en-640") << "en" << true;
        QTest::newRow("ja-640") << "ja" << true;
    }
    void chatStreamingKeepsSelectionAndReadingPosition() {
        QFETCH(QString, locale);
        QFETCH(bool, compact);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        const auto chatID = current(bridge).value("id");
        bridge.command("draft", {{"value", "Question"}}); bridge.command("submit");
        bridge.command("draft", {{"value", "Next draft"}});
        const auto task = latest(bridge);
        const auto initial = QString("日本語・Tiếng Việt・👩🏽‍💻\n") + QString("A paragraph of readable streamed content.\n").repeated(40);
        chunk(bridge, task, initial);
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        if (compact) { root->setWidth(640); root->setHeight(600); }
        QCoreApplication::processEvents();
        auto *chat = visualItem(root->contentItem(), "chat-transcript");
        auto *list = visualItem(root->contentItem(), "chat-message-list");
        QVERIFY(chat); QVERIFY(list);
        chat->setProperty("followLatest", false);
        list->setProperty("contentY", 0);
        QCoreApplication::processEvents();
        const auto name = "chat-text-" + task.value("id").toString();
        QPointer<QQuickItem> editor = visualItem(root->contentItem(), name);
        QVERIFY(editor);
        QTRY_COMPARE(editor->property("text").toString(), initial);
        QVERIFY(QMetaObject::invokeMethod(editor, "select", Q_ARG(int, 0), Q_ARG(int, 3)));
        QCOMPARE(editor->property("selectedText").toString(), QString("日本語"));
        const auto position = list->property("contentY").toDouble();
        const auto right = editor->mapToScene(QPointF(editor->width(), 0)).x();
        QVERIFY(editor->width() > 0); QVERIFY(right <= root->width());
        chunk(bridge, task, "New chunk・日本語");
        QCoreApplication::processEvents();
        QVERIFY(editor); // Same native TextArea survives the changed snapshot.
        QCOMPARE(editor.data(), visualItem(root->contentItem(), name));
        QTRY_COMPARE(editor->property("text").toString(), initial + "New chunk・日本語");
        QCOMPARE(editor->property("selectedText").toString(), QString("日本語"));
        QCOMPARE(list->property("contentY").toDouble(), position);
        QCOMPARE(current(bridge).value("draft").toString(), QString("Next draft"));
        QVERIFY(QMetaObject::invokeMethod(chat, "returnToLatest"));
        QCoreApplication::processEvents();
        QVERIFY(chat->property("followLatest").toBool());
        QTRY_VERIFY(list->property("atYEnd").toBool());
        QCOMPARE(editor->property("selectedText").toString(), QString());
        bridge.command("new");
        QCoreApplication::processEvents();
        QTRY_COMPARE(chat->property("conversationID").toString(), current(bridge).value("id").toString());
        QTRY_COMPARE(list->property("count").toInt(), 0);
        QCOMPARE(latest(bridge).value("status").toString(), QString("running"));
        bridge.command("select", {{"sessionID", chatID}});
        QCoreApplication::processEvents();
        QTRY_COMPARE(list->property("count").toInt(), 2);
        QCOMPARE(current(bridge).value("draft").toString(), QString("Next draft"));
        QCOMPARE(warnings.count(), 0);
    }
    void glassComposerKeepsEditorAndModelOwnership_data() {
        QTest::addColumn<QString>("mode");
        QTest::newRow("light") << QString("light");
        QTest::newRow("dark") << QString("dark");
    }
    void glassComposerKeepsEditorAndModelOwnership() {
        QFETCH(QString, mode);
        QTemporaryDir dir;
        auto fixture = WorkbenchDomain::create("chat-first", "translate-first");
        auto sessions = fixture.value("sessions").toList();
        auto historicalChat = sessions.first().toMap();
        historicalChat["id"] = "chat-history";
        historicalChat["messages"] = QVariantList{QVariantMap{{"id", "synthetic-message"}, {"role", "user"}, {"text", "A synthetic saved conversation"}}};
        sessions.append(historicalChat);
        fixture["sessions"] = sessions;
        QVERIFY(WorkbenchDomain::validate(fixture));
        QFile file(dir.filePath("state.json"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        QVERIFY(file.write(QJsonDocument::fromVariant(fixture).toJson()) > 0);
        file.close();
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "chat"}});
        bridge.command("appearance", {{"preset", "glass"}, {"mode", mode}});
        ProviderDiscovery::Snapshot snapshot;
        snapshot.checked = true;
        snapshot.models["ollama"] = {"ollama:llama3.2", "ollama:qwen3:8b"};
        bridge.applyProviderSnapshot(snapshot); // No provider requests or credentials.
        bridge.command("model", {{"value", "ollama:llama3.2"}});
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->resize(1200, 820);
        QCoreApplication::processEvents();
        auto *composer = visualItem(root->contentItem(), "chat-composer");
        auto *scroll = visualItem(root->contentItem(), "chat-draft-scroll");
        auto *send = visualItem(root->contentItem(), "chat-send");
        auto *combo = visualItem(root->contentItem(), "chat-model-picker");
        auto *modelOptions = visualItem(root->contentItem(), "chat-model-options");
        auto *record = visualItem(root->contentItem(), "chat-record");
        QPointer<QQuickItem> editor = visualItem(root->contentItem(), "chat-draft");
        QVERIFY(composer); QVERIFY(scroll); QVERIFY(send); QVERIFY(combo); QVERIFY(modelOptions); QVERIFY(record); QVERIFY(editor);
        QTRY_VERIFY(composer->property("singleRow").toBool());
        const auto emptyComposerY = composer->mapToScene(QPointF()).y();
        QVERIFY(!send->isEnabled());
        const auto chatID = current(bridge).value("id");
        const QString draft = QString::fromUtf8("Hi 日本語");
        editor->setProperty("text", draft);
        editor->forceActiveFocus();
        QVERIFY(QMetaObject::invokeMethod(editor, "select", Q_ARG(int, 3), Q_ARG(int, 6)));
        const auto selected = editor->property("selectedText").toString();
        const auto cursor = editor->property("cursorPosition").toInt();
        for (const auto width : {820, 640, 1200}) {
            root->setWidth(width);
            QCoreApplication::processEvents();
            QCOMPARE(editor.data(), visualItem(root->contentItem(), "chat-draft"));
            QCOMPARE(editor->property("text").toString(), draft);
            QCOMPARE(editor->property("selectedText").toString(), selected);
            QCOMPARE(editor->property("cursorPosition").toInt(), cursor);
            QCOMPARE(current(bridge).value("id"), chatID);
            QVERIFY(editor->hasActiveFocus());
            // The named controls must own separate click regions. A custom
            // ComboBox label cannot rely on Fusion's TextInput width measuring.
            QVERIFY(combo->width() >= bridge.resources().value("metrics").toMap().value("editor").toDouble());
            const auto comboRight = combo->mapToScene(QPointF(combo->width(), 0)).x();
            const auto optionsLeft = modelOptions->mapToScene(QPointF()).x();
            const auto optionsRight = modelOptions->mapToScene(QPointF(modelOptions->width(), 0)).x();
            const auto recordLeft = record->mapToScene(QPointF()).x();
            QVERIFY(comboRight <= optionsLeft);
            QVERIFY(optionsRight <= recordLeft);
            QVERIFY(record->mapToScene(QPointF(record->width(), 0)).x() <= send->mapToScene(QPointF()).x());
            auto *modelLabel = combo->property("contentItem").value<QQuickItem *>();
            QVERIFY(modelLabel);
            QVERIFY(modelLabel->width() <= combo->width());
        }
        QVERIFY(send->isEnabled());
        const QString fiveLines = QString::fromUtf8("Một\nHai\n三\n四\nFive");
        editor->setProperty("text", fiveLines);
        QTRY_VERIFY(!composer->property("singleRow").toBool());
        QTRY_VERIFY(scroll->height() >= editor->height() - 1);
        const auto cappedHeight = scroll->height();
        editor->setProperty("text", fiveLines + "\nSix");
        QTRY_VERIFY(editor->height() > scroll->height());
        QCOMPARE(scroll->height(), cappedHeight);
        QCOMPARE(editor.data(), visualItem(root->contentItem(), "chat-draft"));
        QCOMPARE(current(bridge).value("draft").toString(), fiveLines + "\nSix");
        // Qt 6.8 deletes a ComboBox's replaced delegate. A theme round trip
        // must retain this owned component before the popup creates its rows.
        QPointer<QQmlComponent> modelDelegate = combo->property("delegate").value<QQmlComponent *>();
        QVERIFY(modelDelegate);
        bridge.command("appearance", {{"preset", "graphite"}, {"mode", mode}});
        QCoreApplication::processEvents();
        QVERIFY(modelDelegate);
        QCOMPARE(combo->property("delegate").value<QQmlComponent *>(), modelDelegate.data());
        auto *nativeLabel = combo->property("contentItem").value<QQuickItem *>();
        QVERIFY(nativeLabel);
        QVERIFY(nativeLabel->isVisible());
        QCOMPARE(editor.data(), visualItem(root->contentItem(), "chat-draft"));
        bridge.command("appearance", {{"preset", "glass"}, {"mode", mode}});
        QCoreApplication::processEvents();
        QVERIFY(modelDelegate);
        QCOMPARE(combo->property("delegate").value<QQmlComponent *>(), modelDelegate.data());
        QCOMPARE(combo->property("contentItem").value<QQuickItem *>(), nativeLabel);
        QVERIFY(!nativeLabel->isVisible());
        auto *glassLabel = visualItem(combo, "chat-model-label");
        QVERIFY(glassLabel);
        QVERIFY(glassLabel->isVisible());
        QCOMPARE(editor.data(), visualItem(root->contentItem(), "chat-draft"));
        QCOMPARE(current(bridge).value("draft").toString(), fiveLines + "\nSix");
        QObject *popup = nullptr;
        for (const auto &preset : {QString("glass"), QString("graphite"), QString("glass")}) {
            bridge.command("appearance", {{"preset", preset}, {"mode", mode}});
            QCoreApplication::processEvents();
            popup = combo->property("popup").value<QObject *>();
            QVERIFY(popup);
            QVERIFY(QMetaObject::invokeMethod(popup, "open"));
            QTRY_VERIFY2(popup->property("visible").toBool(), qPrintable(preset));
            auto *popupContent = popup->property("contentItem").value<QQuickItem *>();
            QVERIFY(popupContent);
            QTRY_VERIFY(visualItem(popupContent, "chat-model-option"));
            auto *option = visualItem(popupContent, "chat-model-option");
            auto *nativeContent = option->property("contentItem").value<QQuickItem *>();
            auto *nativeBackground = option->property("background").value<QQuickItem *>();
            auto *glassContent = visualItem(option, "chat-model-option-label");
            auto *glassBackground = visualItem(option, "chat-model-option-glass");
            QVERIFY(nativeContent && nativeBackground && glassContent && glassBackground);
            QTRY_VERIFY(option->isVisible());
            const bool glass = preset == "glass";
            QCOMPARE(nativeContent->isVisible(), !glass);
            QCOMPARE(glassContent->isVisible(), glass);
            QCOMPARE(glassBackground->isVisible(), glass);
            // Fusion owns its native hover/pressed background visibility.
            QCOMPARE(nativeBackground->isVisible(), !glass && (option->property("highlighted").toBool() || option->property("down").toBool()));
            QVERIFY(QMetaObject::invokeMethod(popup, "close"));
            QTRY_VERIFY(!popup->property("visible").toBool());
        }
        QVERIFY(QMetaObject::invokeMethod(popup, "open"));
        QTRY_VERIFY(popup->property("visible").toBool());
        bridge.command("new");
        QTRY_VERIFY(!popup->property("visible").toBool());
        QVERIFY(current(bridge).value("id") != chatID);
        bridge.command("select", {{"sessionID", chatID}});
        QCoreApplication::processEvents();
        combo->forceActiveFocus();
        QTest::keyClick(root, Qt::Key_Space);
        QTRY_VERIFY(popup->property("visible").toBool());
        QTest::keyClick(root, Qt::Key_Down);
        QTest::keyClick(root, Qt::Key_Return);
        QTRY_COMPARE(current(bridge).value("model").toString(), QString("ollama:qwen3:8b"));
        QCOMPARE(current(bridge).value("draft").toString(), fiveLines + "\nSix");
        bridge.command("select", {{"sessionID", "chat-history"}});
        QTRY_VERIFY(composer->mapToScene(QPointF()).y() > emptyComposerY);
        QCOMPARE(editor.data(), visualItem(root->contentItem(), "chat-draft"));
        bridge.command("select", {{"sessionID", chatID}});
        QTRY_COMPARE(editor->property("text").toString(), fiveLines + "\nSix");
        QCOMPARE(editor.data(), visualItem(root->contentItem(), "chat-draft"));
        // Model settings belong to the window overlay, not the composer at
        // the bottom of the conversation. Opening must not clamp its content.
        auto *configuration = root->findChild<QObject *>("model-configuration-dialog");
        QVERIFY(configuration);
        const auto beforeConfiguration = bridge.state();
        for (const auto size : {QSize(640, 480), QSize(820, 820), QSize(1200, 820)}) {
            root->resize(size);
            QCoreApplication::processEvents();
            QVERIFY(QMetaObject::invokeMethod(configuration, "open"));
            QTRY_VERIFY(configuration->property("visible").toBool());
            auto *content = configuration->property("contentItem").value<QQuickItem *>();
            QVERIFY(content);
            QTRY_VERIFY(content->height() >= configuration->property("contentHeight").toDouble());
            const auto x = configuration->property("x").toDouble();
            const auto y = configuration->property("y").toDouble();
            QVERIFY(x >= 0 && y >= 0);
            QVERIFY(x + configuration->property("width").toDouble() <= size.width());
            QVERIFY(y + configuration->property("height").toDouble() <= size.height());
            QVERIFY(QMetaObject::invokeMethod(configuration, "close"));
            QTRY_VERIFY(!configuration->property("visible").toBool());
        }
        QCOMPARE(bridge.state(), beforeConfiguration);
        QVERIFY(bridge.state().value("tasks").toList().isEmpty());
        QCOMPARE(warnings.count(), 0);
    }
    void glassDialogPreservesStandardActions_data() {
        QTest::addColumn<QString>("initialPreset");
        QTest::addColumn<QString>("mode");
        for (const auto &preset : {QString("graphite"), QString("glass")})
            for (const auto &mode : {QString("light"), QString("dark")})
                QTest::newRow(qPrintable(preset + "-" + mode)) << preset << mode;
    }
    void glassDialogPreservesStandardActions() {
        QFETCH(QString, initialPreset);
        QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"preset", initialPreset}, {"mode", mode}});
        QQmlEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        QQmlComponent component(&engine);
        component.setData(R"(
            import QtQuick
            import QtQuick.Controls
            import "qrc:/qml" as Viezan
            ApplicationWindow {
                width: 500; height: 300; visible: true
                Viezan.GlassDialog {
                    objectName: "standard-dialog"
                    title: "Synthetic dialog"
                    modal: true; focus: true
                    standardButtons: Dialog.Ok | Dialog.Cancel
                    Label { text: "Synthetic content" }
                    function acceptButton() { return footer.standardButton(Dialog.Ok) }
                    function cancelButton() { return footer.standardButton(Dialog.Cancel) }
                }
            }
        )", QUrl("qrc:/glass-dialog-test.qml"));
        QScopedPointer<QObject> owner(component.create());
        QVERIFY2(owner, qPrintable(component.errorString()));
        auto *root = qobject_cast<QQuickWindow *>(owner.data());
        QVERIFY(root);
        auto *dialog = owner->findChild<QObject *>("standard-dialog");
        QVERIFY(dialog);
        QSignalSpy accepted(dialog, SIGNAL(accepted()));
        QSignalSpy rejected(dialog, SIGNAL(rejected()));
        auto *footer = dialog->property("footer").value<QObject *>();
        QVERIFY(footer);
        auto *nativeBackground = dialog->property("background").value<QQuickItem *>();
        auto *nativeHeader = dialog->property("header").value<QQuickItem *>();
        QVERIFY(nativeBackground); QVERIFY(nativeHeader);
        const auto nativePadding = dialog->property("padding").toDouble();
        int nativeReturnActivation = -1;
        for (const auto &preset : {QString("graphite"), QString("glass"), QString("graphite")}) {
            bridge.command("appearance", {{"preset", preset}, {"mode", mode}});
            QCoreApplication::processEvents();
            QCOMPARE(dialog->property("footer").value<QObject *>(), footer);
            QVERIFY(QMetaObject::invokeMethod(dialog, "open"));
            QTRY_VERIFY(dialog->property("visible").toBool());
            QCOMPARE(dialog->property("background").value<QQuickItem *>(), nativeBackground);
            QCOMPARE(dialog->property("header").value<QQuickItem *>(), nativeHeader);
            QCOMPARE(nativeBackground->isVisible(), preset != "glass");
            if (preset == "graphite") QCOMPARE(dialog->property("padding").toDouble(), nativePadding);
            QVariant result;
            QVERIFY(QMetaObject::invokeMethod(dialog, "acceptButton", Q_RETURN_ARG(QVariant, result)));
            auto *button = qobject_cast<QQuickItem *>(result.value<QObject *>());
            QVERIFY(button);
            QVERIFY(button->metaObject()->indexOfProperty("usesGlass") >= 0);
            QCOMPARE(button->property("usesGlass").toBool(), preset == "glass");
            const auto before = accepted.count();
            button->forceActiveFocus();
            QCoreApplication::processEvents();
            QVERIFY(button->hasActiveFocus());
            QTest::keyClick(root, Qt::Key_Return);
            QCoreApplication::processEvents();
            const auto returnActivation = accepted.count() - before;
            if (nativeReturnActivation < 0) nativeReturnActivation = returnActivation;
            else QCOMPARE(returnActivation, nativeReturnActivation);
            if (!returnActivation) QTest::keyClick(root, Qt::Key_Space);
            QTRY_COMPARE(accepted.count(), before + 1);
            QTRY_VERIFY(!dialog->property("visible").toBool());
        }
        bridge.command("appearance", {{"preset", "glass"}, {"mode", mode}});
        QCoreApplication::processEvents();
        QVERIFY(QMetaObject::invokeMethod(dialog, "open"));
        QTRY_VERIFY(dialog->property("visible").toBool());
        QVariant result;
        QVERIFY(QMetaObject::invokeMethod(dialog, "cancelButton", Q_RETURN_ARG(QVariant, result)));
        auto *cancel = qobject_cast<QQuickItem *>(result.value<QObject *>());
        QVERIFY(cancel);
        cancel->forceActiveFocus();
        QCoreApplication::processEvents();
        QVERIFY(cancel->hasActiveFocus());
        QTest::keyClick(root, Qt::Key_Space);
        QTRY_COMPARE(rejected.count(), 1);
        QVERIFY(bridge.state().value("tasks").toList().isEmpty());
        QCOMPARE(warnings.count(), 0);
    }
    void roundTripAndSeparateDrafts() {
        QTemporaryDir dir;
        const auto file = dir.filePath("state.json");
        QString chatID;
        {
            WorkbenchBridge bridge(nullptr, file, false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
            chatID = current(bridge).value("id").toString();
            bridge.command("draft", {{"value", "Tiếng Việt・日本語"}});
            bridge.command("model", {{"value", "demo.slow"}});
            bridge.command("navigate", {{"feature", "translate"}});
            bridge.command("draft", {{"value", "Translate draft"}});
            bridge.shutdown();
            QVERIFY(bridge.storageError().isEmpty());
        }
        WorkbenchBridge restored(nullptr, file, false);
        QCOMPARE(current(restored).value("draft").toString(), QString("Translate draft"));
        restored.command("select", {{"sessionID", chatID}});
        QCOMPARE(current(restored).value("draft").toString(), QString("Tiếng Việt・日本語"));
        QCOMPARE(current(restored).value("model").toString(), QString("ollama:llama3.2"));
    }
    void corruptFileIsPreserved() {
        QTemporaryDir dir;
        const auto path = dir.filePath("state.json");
        QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write("invalid-json"); file.close();
        WorkbenchBridge bridge(nullptr, path, false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        QVERIFY(bridge.loadBlocked());
        bridge.command("draft", {{"value", "Do not replace"}}); bridge.save();
        QVERIFY(file.open(QIODevice::ReadOnly)); QCOMPARE(file.readAll(), QByteArray("invalid-json"));
    }
    void sharedRecoveryAndLateEvents() {
        QTemporaryDir dir;
        const auto path = dir.filePath("state.json");
        QVERIFY(QFile::copy(VIEZAN_CONTRACT_FIXTURE, path));
        WorkbenchBridge bridge(nullptr, path, false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        QCOMPARE(latest(bridge).value("status").toString(), QString("interrupted"));
        QCOMPARE(current(bridge).value("draft").toString(), QString("Bản nháp chưa gửi"));
        const auto old = latest(bridge);
        bridge.command("retry", {{"taskID", old.value("id")}});
        const auto attempt = latest(bridge);
        QVERIFY(attempt.value("attemptID") != old.value("attemptID"));
        chunk(bridge, old, "stale");
        QCOMPARE(latest(bridge).value("output").toString(), QString());
        chunk(bridge, attempt, "New result");
        bridge.shutdown();
        WorkbenchBridge restored(nullptr, path, false);
        QCOMPARE(latest(restored).value("output").toString(), QString("New result"));
        QCOMPARE(current(restored).value("messages").toList().size(), 2);
    }
    void translationInvalidation() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("navigate", {{"feature", "translate"}});
        bridge.command("draft", {{"value", "Original"}}); bridge.command("submit");
        const auto task = latest(bridge); chunk(bridge, task, "Partial");
        bridge.command("pair", {{"source", "en"}, {"target", "ja"}});
        chunk(bridge, task, "Wrong language");
        QCOMPARE(current(bridge).value("output").toString(), QString());
        QCOMPARE(latest(bridge).value("status").toString(), QString("cancelled"));
    }
    void saveFailureCanRetryWithoutLosingDraft() {
        QTemporaryDir dir;
        const auto blocker = dir.filePath("blocker");
        QFile file(blocker); QVERIFY(file.open(QIODevice::WriteOnly)); file.close();
        WorkbenchBridge bridge(nullptr, blocker + "/state.json", false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("draft", {{"value", "Keep this draft"}});
        QCOMPARE(bridge.storageError(), QString("storageError"));
        QCOMPARE(current(bridge).value("draft").toString(), QString("Keep this draft"));
        QVERIFY(file.remove()); // This test owns the temporary blocking file.
        bridge.save();
        QVERIFY(bridge.storageError().isEmpty());
        WorkbenchBridge restored(nullptr, blocker + "/state.json", false);
        QCOMPARE(current(restored).value("draft").toString(), QString("Keep this draft"));
    }
    void failureAndRetryUseQueuedProviderEvents() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("model", {{"value", "ollama:test-model"}});
        bridge.command("draft", {{"value", "Question"}}); bridge.command("submit");
        const auto first = latest(bridge);
        QTimer::singleShot(0, &bridge, [&bridge, first] {
            bridge.command("receive", {{"taskID", first.value("id")}, {"attemptID", first.value("attemptID")}, {"terminal", "failed"}});
        });
        QTRY_COMPARE(latest(bridge).value("status").toString(), QString("failed"));
        bridge.command("retry", {{"taskID", first.value("id")}});
        const auto retry = latest(bridge);
        QVERIFY(retry.value("attemptID") != first.value("attemptID"));
        QTimer::singleShot(0, &bridge, [&bridge, first, retry] {
            chunk(bridge, first, "stale");
            bridge.command("receive", {{"taskID", retry.value("id")}, {"attemptID", retry.value("attemptID")}, {"chunk", "Recovered reply"}, {"terminal", "succeeded"}});
        });
        QTRY_COMPARE(latest(bridge).value("status").toString(), QString("succeeded"));
        QCOMPARE(latest(bridge).value("output").toString(), QString("Recovered reply"));
        QCOMPARE(latest(bridge).value("attemptNumber").toInt(), 2);
        QCOMPARE(current(bridge).value("messages").toList().size(), 2);
    }
    void appearanceRoundTripKeepsWorkAndRejectsInvalidValues() {
        QTemporaryDir dir;
        const auto path = dir.filePath("state.json");
        WorkbenchBridge bridge(nullptr, path, false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("draft", {{"value", "Question"}}); bridge.command("submit");
        bridge.command("draft", {{"value", "Unsent draft"}});
        const auto before = bridge.state();
        bridge.command("appearance", {{"mode", "light"}, {"textSize", "large"}});
        bridge.command("locale", {{"value", "ja"}});
        QCOMPARE(bridge.state().value("sessions"), before.value("sessions"));
        QCOMPARE(bridge.state().value("tasks"), before.value("tasks"));
        QCOMPARE(bridge.state().value("active"), before.value("active"));
        WorkbenchBridge restored(nullptr, path, false);
        QCOMPARE(restored.state().value("appearance").toMap().value("mode").toString(), QString("light"));
        QCOMPARE(restored.state().value("appearance").toMap().value("textSize").toString(), QString("large"));
        QCOMPARE(current(restored).value("draft").toString(), QString("Unsent draft"));
        QCOMPARE(restored.state().value("locale").toString(), QString("ja"));
        const auto valid = restored.state();
        restored.command("appearance", {{"mode", "unsupported"}});
        QCOMPARE(restored.state(), valid);
    }
    void glassSearchAndFiltersPreserveNativeInteraction_data() {
        QTest::addColumn<QString>("mode");
        QTest::addColumn<QString>("locale");
        QTest::addColumn<int>("width");
        QTest::newRow("light-vi-640") << QString("light") << QString("vi") << 640;
        QTest::newRow("dark-ja-1200") << QString("dark") << QString("ja") << 1200;
    }
    void glassSearchAndFiltersPreserveNativeInteraction() {
        QFETCH(QString, mode); QFETCH(QString, locale); QFETCH(int, width);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"preset", "glass"}, {"mode", mode}, {"textSize", "large"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("draft", {{"value", "Preserve draft 日本語"}});
        const auto sessions = bridge.state().value("sessions");
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->resize(width, 820);
        QCoreApplication::processEvents();
        auto *home = visualItem(root->contentItem(), "home-workspace");
        auto *filters = visualItem(root->contentItem(), "home-recent-filters");
        QVERIFY(home); QVERIFY(filters);
        QCOMPARE(filters->property("count").toInt(), 4);
        QCOMPARE(filters->property("currentIndex").toInt(), 0);
        auto *selected = filters->property("currentItem").value<QQuickItem *>();
        QVERIFY(selected);
        selected->forceActiveFocus();
        QTest::keyClick(root, Qt::Key_Right);
        QTRY_COMPARE(filters->property("currentIndex").toInt(), 1);
        QTRY_COMPARE(home->property("filter").toString(), QString("chat"));
        QVERIFY(filters->mapToScene(QPointF()).x() >= 0);
        QVERIFY(filters->mapToScene(QPointF(filters->width(), 0)).x() <= width);
        const auto labels = bridge.resources().value("locales").toMap().value(locale).toMap();
        auto *all = visualText(filters, labels.value("filterAll").toString());
        QVERIFY(all);
        QTest::mouseClick(root, Qt::LeftButton, Qt::NoModifier, all->mapToScene(QPointF(all->width() / 2, all->height() / 2)).toPoint());
        QTRY_COMPARE(home->property("filter").toString(), QString());
        QTRY_COMPARE(filters->property("currentIndex").toInt(), 0);
        QCOMPARE(bridge.state().value("sessions"), sessions);
        QVERIFY(QMetaObject::invokeMethod(root, "openSettingsSection", Q_ARG(QVariant, "appearance")));
        QCoreApplication::processEvents();
        auto *theme = visualItem(root->contentItem(), "settings-theme");
        auto *search = visualItem(root->contentItem(), "settings-header-search");
        QVERIFY(theme); QVERIFY(search);
        QCOMPARE(theme->property("count").toInt(), 3);
        selected = theme->property("currentItem").value<QQuickItem *>();
        QVERIFY(selected);
        selected->forceActiveFocus();
        QTest::keyClick(root, Qt::Key_Right);
        QTRY_COMPARE(bridge.state().value("appearance").toMap().value("mode").toString(), mode == "light" ? QString("dark") : QString("system"));
        bridge.command("appearance", {{"mode", mode}});
        QTRY_COMPARE(theme->property("currentIndex").toInt(), mode == "light" ? 0 : 1);
        search->forceActiveFocus();
        search->setProperty("text", QString::fromUtf8("日本語"));
        QVERIFY(QMetaObject::invokeMethod(search, "select", Q_ARG(int, 0), Q_ARG(int, 3)));
        QCOMPARE(search->property("selectedText").toString(), QString::fromUtf8("日本語"));
        root->setWidth(width == 640 ? 1200 : 640);
        QCoreApplication::processEvents();
        QCOMPARE(search, visualItem(root->contentItem(), "settings-header-search"));
        QCOMPARE(search->property("selectedText").toString(), QString::fromUtf8("日本語"));
        QVERIFY(QMetaObject::invokeMethod(search, "deselect"));
        search->setProperty("cursorPosition", 3);
        const auto query = root->property("settingsQuery").toString();
        QInputMethodEvent preedit(QString::fromUtf8("にほん"), {});
        QCoreApplication::sendEvent(search, &preedit);
        QTRY_VERIFY(search->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Escape);
        QCOMPARE(root->property("settingsQuery").toString(), query);
        QInputMethodEvent committed;
        committed.setCommitString(QString::fromUtf8("日本"));
        QCoreApplication::sendEvent(search, &committed);
        QTRY_VERIFY(!search->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Escape);
        QTRY_COMPARE(root->property("settingsQuery").toString(), QString());
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "commands"), Q_ARG(QVariant, QVariant())));
        auto *commandSearch = visualItem(root->contentItem(), "command-search");
        QVERIFY(commandSearch);
        QTRY_VERIFY(commandSearch->hasActiveFocus());
        QTest::keyClick(root, Qt::Key_Down);
        QTRY_COMPARE(root->property("commandIndex").toInt(), 1);
        QTest::keyClick(root, Qt::Key_Up);
        QTRY_COMPARE(root->property("commandIndex").toInt(), 0);
        QTest::keyClick(root, Qt::Key_Escape);
        QTRY_VERIFY(!root->findChild<QObject *>("command-palette")->property("visible").toBool());
        QCOMPARE(bridge.state().value("sessions"), sessions);
        QCOMPARE(warnings.count(), 0);
    }
    void settingsLayoutAndSearch_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<bool>("compact");
        QTest::newRow("vi-wide") << "vi" << false;
        QTest::newRow("en-wide") << "en" << false;
        QTest::newRow("ja-wide") << "ja" << false;
        QTest::newRow("vi-640") << "vi" << true;
        QTest::newRow("en-640") << "en" << true;
        QTest::newRow("ja-640") << "ja" << true;
    }
    void settingsLayoutAndSearch() {
        QFETCH(QString, locale);
        QFETCH(bool, compact);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("appearance", {{"textSize", "large"}});
        bridge.command("draft", {{"value", "Preserve settings navigation draft"}});
        const auto before = bridge.state();
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = engine.rootObjects().first();
        if (compact) { root->setProperty("width", 640); root->setProperty("height", 600); }
        root->setProperty("settings", true);
        QCoreApplication::processEvents();
        auto *settings = root->findChild<QQuickItem *>("settings-workspace");
        QVERIFY(settings);
        QCOMPARE(settings->property("wide").toBool(), !compact);
        // Review 18 shows one category at a time; appearance controls belong here.
        settings->setProperty("activeSection", "appearance");
        QCoreApplication::processEvents();
        auto *content = qobject_cast<QQuickWindow *>(root)->contentItem();
        // Loader-created controls follow the visual tree; QObject ownership can
        // remain with the component context rather than the application root.
        auto *theme = visualItem(content, "settings-theme");
        auto *textSize = visualItem(content, "settings-text-size");
        QVERIFY(theme); QVERIFY(textSize);
        for (auto *control : {theme, textSize}) {
            const auto right = control->mapToScene(QPointF(control->width(), 0)).x();
            QVERIFY(control->width() > 0);
            QVERIFY(right <= root->property("width").toDouble());
        }
        settings->setProperty("query", locale == "vi" ? "co chu" : locale == "en" ? "text size" : "文字サイズ");
        QCoreApplication::processEvents();
        QCOMPARE(settings->property("activeSection").toString(), QString("appearance"));
        QCOMPARE(bridge.state(), before);
        settings->setProperty("query", "missing-setting");
        QCoreApplication::processEvents();
        QCOMPARE(settings->property("activeSection").toString(), QString());
        settings->setProperty("query", "");
        QCoreApplication::processEvents();
        QCOMPARE(bridge.state(), before);
        QCOMPARE(warnings.count(), 0);
    }
    void providerSnapshotPrefersOnDeviceThenCloudDefaults() {
        ProviderDiscovery::Snapshot snapshot;
        QCOMPARE(snapshot.availability("ollama:llama3.2"), QString("unknown"));
        snapshot.checked = true;
        QVERIFY(snapshot.empty());
        snapshot.keyed = {"openai"};
        snapshot.models["openai"] = {"openai:text-embedding-3-small", "openai:whisper-1", "openai:gpt-4o", "openai:gpt-4.1-mini-2025-04-14"};
        QVERIFY(!snapshot.empty());
        QCOMPARE(snapshot.preferredModel({}), QString("openai:gpt-4.1-mini-2025-04-14"));
        QCOMPARE(snapshot.availability("ollama:llama3.2"), QString("offline"));
        QCOMPARE(snapshot.availability("claude:claude-haiku-4"), QString("missingKey"));
        QCOMPARE(snapshot.availability("demo.standard"), QString("unsupported"));
        snapshot.models["ollama"] = {"ollama:nomic-embed-text", "ollama:qwen3:4b"};
        QCOMPARE(snapshot.preferredModel({}), QString("ollama:qwen3:4b"));
        QCOMPARE(snapshot.availability("ollama:llama3.2"), QString("notInstalled"));
        // A recently used model that still runs wins over the provider order.
        QCOMPARE(snapshot.preferredModel({"ollama:llama3.2", "openai:gpt-4o"}), QString("openai:gpt-4o"));
    }
    void dictionaryAcceptsJSONInsideAMarkdownFence() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        const QString json = R"({"headword":"serendipity","pronunciation":"/ser/","meaning":"chance","translations":[{"text":"sự tình cờ","pronunciation":"sự tình cờ"}]})";
        for (const auto &[reply, valid] : QList<QPair<QString, bool>>{{"```json\n" + json + "\n```", true}, {"not json", false}}) {
            bridge.command("navigate", {{"feature", "dictionary"}});
            bridge.command("new");
            bridge.command("draft", {{"value", "serendipity"}});
            bridge.command("submit", {{"sessionID", current(bridge).value("id")}});
            const auto task = bridge.state().value("tasks").toList().first().toMap();
            bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"chunk", reply}, {"terminal", "succeeded"}});
            const auto done = bridge.state().value("tasks").toList().first().toMap();
            QCOMPARE(done.value("status").toString(), QString(valid ? "succeeded" : "failed"));
            if (valid) QCOMPARE(current(bridge).value("output").toString(), json);
            else QCOMPARE(done.value("errorCode").toString(), QString("providerInvalidResponse"));
        }
    }
    void imageGenerationUsesAnyKeyedImageProvider() {
        const auto keys = [](const QStringList &present) { return [present](const QString &id) { return present.contains(id); }; };
        QCOMPARE(ImageGeneration::imageProvider("gemini:gemini-2.5-flash", keys({"openai", "gemini"})), QString("gemini"));
        QCOMPARE(ImageGeneration::imageProvider("claude:claude-haiku-4-5", keys({"openai"})), QString("openai"));
        QCOMPARE(ImageGeneration::imageProvider("openai:gpt-4o", keys({"gemini"})), QString("gemini"));
        QCOMPARE(ImageGeneration::imageProvider("ollama:qwen3:4b", keys({})), QString());
    }
    void refusedImageRequestExplainsTheModelCannotReadImages() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("navigate", {{"feature", "chat"}});
        bridge.command("addImage", {{"image", QVariantMap{{"id", QUuid::createUuid().toString(QUuid::WithoutBraces)}, {"name", "photo.png"}, {"mime", "image/png"}}}});
        bridge.command("draft", {{"value", "What is in this photo?"}});
        bridge.command("submit", {{"sessionID", current(bridge).value("id")}});
        const auto task = bridge.state().value("tasks").toList().first().toMap();
        QVERIFY(!task.value("request").toMap().value("messages").toList().last().toMap().value("images").toList().isEmpty());
        bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"chunk", ""}, {"terminal", "failed"}, {"errorCode", "providerRejected"}, {"errorDetail", "image too large"}});
        QCOMPARE(bridge.state().value("tasks").toList().first().toMap().value("errorCode").toString(), QString("imageModelUnsupported"));
        QCOMPARE(bridge.state().value("tasks").toList().first().toMap().value("errorDetail").toString(), QString("image too large"));
        QCOMPARE(CloudProtocol::errorMessage(R"({"error":{"message":"The model does not exist\nor no access."}})"), QString("The model does not exist or no access."));
        QCOMPARE(ImageGeneration::imageModel("openai", "gpt-4o", {"openai:gpt-image-1", "openai:gpt-image-1-mini", "openai:gpt-image-1.5"}), QString("gpt-image-1.5"));
        QCOMPARE(ImageGeneration::imageModel("gemini", "", {"gemini:imagen-4.0", "gemini:gemini-2.5-flash-image"}), QString("gemini-2.5-flash-image"));
    }
    void quickTranslatePairRoutesTextAlreadyInThePrimaryLanguage() {
        QCOMPARE(TextLanguage::detect("Xin chào, cuộc họp bắt đầu lúc chín giờ."), QString("vi"));
        QCOMPARE(TextLanguage::detect("会議は九時に始まります。"), QString("ja"));
        QCOMPARE(TextLanguage::detect("회의는 아홉 시에 시작합니다"), QString("ko"));
        QCOMPARE(TextLanguage::detect("Встреча начнётся в девять"), QString("ru"));
        QCOMPARE(TextLanguage::detect("The meeting starts at nine"), QString());
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QCOMPARE(bridge.quickTranslate().value("secondary").toString(), QString());
        bridge.command("quickTranslatePrimary", {{"value", "vi"}});
        bridge.command("quickTranslateSecondary", {{"value", "en"}});
        QCOMPARE(bridge.quickTranslateTarget("Xin chào các bạn, hôm nay trời đẹp."), QString("en"));
        QCOMPARE(bridge.quickTranslateTarget("Good morning"), QString("vi"));
        bridge.command("quickTranslateSecondary", {{"value", "vi"}});   // same as primary: ignored
        QCOMPARE(bridge.quickTranslate().value("secondary").toString(), QString("en"));
        bridge.command("quickTranslatePrimary", {{"value", "en"}});     // the secondary: swaps
        QCOMPARE(bridge.quickTranslate(), (QVariantMap{{"primary", "en"}, {"secondary", "vi"}}));
        bridge.command("quickTranslateSecondary", {{"value", ""}});
        QCOMPARE(bridge.quickTranslateTarget("Hello"), QString("en"));
        WorkbenchBridge reloaded(nullptr, dir.filePath("state.json"), false);
        QCOMPARE(reloaded.quickTranslate().value("primary").toString(), QString("en"));
    }
    void thermalHwmonSensorsFoldIntoNamedRows() {
        QCOMPARE(ThermalSensors::classify("coretemp / Package id 0").label, QString("cpu_package"));
        QCOMPARE(ThermalSensors::classify("coretemp / Core 3").label, QString("cpu_core"));
        QCOMPARE(ThermalSensors::classify("k10temp / Tctl").label, QString("cpu_package"));
        QCOMPARE(ThermalSensors::classify("amdgpu / edge").group, QString("gpu"));
        QCOMPARE(ThermalSensors::classify("nvme / Composite").label, QString("storage"));
        QCOMPARE(ThermalSensors::classify("acpitz / temp1").label, QString());
        const QVariantList sensors{QVariantMap{{"name", "coretemp / Core 0"}, {"value", 52.0}}, QVariantMap{{"name", "coretemp / Core 1"}, {"value", 58.0}},
            QVariantMap{{"name", "coretemp / Package id 0"}, {"value", 60.0}}, QVariantMap{{"name", "acpitz / temp1"}, {"value", 95.0}}, QVariantMap{{"name", "nvme / Composite"}, {"value", 41.0}}};
        const auto rows = ThermalSensors::rows(sensors);
        QCOMPARE(rows.size(), 4);
        QCOMPARE(rows[0].toMap().value("label").toString(), QString("cpu_package"));
        QCOMPARE(rows[1].toMap().value("count").toInt(), 2);
        QCOMPARE(rows[1].toMap().value("max").toDouble(), 58.0);
        QCOMPARE(rows[1].toMap().value("average").toDouble(), 55.0);
        // A sensor of unknown meaning keeps its driver name and follows the named rows, even when hottest.
        QCOMPARE(rows[2].toMap().value("label").toString(), QString("storage"));
        QCOMPARE(rows[3].toMap().value("title").toString(), QString("acpitz / temp1"));
        QCOMPARE(ThermalSensors::tone(70), QString("warm"));
    }
    void launcherRanksNamePrefixThenWordThenAnywhereWithRecentFirst() {
        QVariantList apps; for (const auto &name : {"Safari", "System Settings", "Photos", "Visual Studio Code", "Messages", "Notes", "Font Book"}) apps.append(QVariantMap{{"id", QString("/apps/") + name}, {"name", name}});
        const auto names = [&apps](const QString &query, const QStringList &recent) { QStringList out; for (const auto &app : LauncherTools::rank(apps, query, recent)) out.append(app.toMap().value("name").toString()); return out; };
        QCOMPARE(names("s", {}), (QStringList{"Safari", "System Settings", "Visual Studio Code", "Notes", "Photos", "Messages"}));
        QCOMPARE(names("set", {}), QStringList{"System Settings"});
        QCOMPARE(names("code", {}), QStringList{"Visual Studio Code"});
        QCOMPARE(names("s", {"/apps/System Settings"}).first(), QString("System Settings"));
        QCOMPARE(names("", {"/apps/Notes", "/apps/Safari"}), (QStringList{"Notes", "Safari"}));
        QVERIFY(names("zzz", {}).isEmpty());
    }
    void transcriptionUsesTheBestModelTheAccountLists() {
        QCOMPARE(NativeAudio::transcriptionModel({}), QString("whisper-1"));
        QCOMPARE(NativeAudio::transcriptionModel({"openai:whisper-1", "openai:gpt-4o-mini-transcribe"}), QString("gpt-4o-mini-transcribe"));
        QCOMPARE(NativeAudio::transcriptionModel({"openai:gpt-4o-mini-transcribe", "openai:gpt-4o-transcribe"}), QString("gpt-4o-transcribe"));
    }
    void voiceGateIgnoresRoomNoiseAndClosesAtAPause() {
        VoiceGate gate;
        // A fan at -38 dB (above the old fixed 0.008 RMS ≈ -42 dB threshold) is learned as the floor.
        for (int i = 0; i < 300; ++i) QVERIFY(gate.feed(-38) != VoiceGate::Finish);
        QVERIFY(!gate.heard);
        for (int i = 0; i < 20; ++i) QCOMPARE(gate.feed(-23), VoiceGate::None);
        QVERIFY(gate.heard);
        bool finished = false; for (int i = 0; i < 10; ++i) finished |= gate.feed(-38) == VoiceGate::Finish;
        QVERIFY(finished);
        // A click is dropped; continuous speech closes at a gap after 12 s, before the 25 s cap.
        bool discarded = false; gate.feed(-10); for (int i = 0; i < 10; ++i) discarded |= gate.feed(-38) == VoiceGate::Discard;
        QVERIFY(discarded);
        // Typing: short taps every 0.4 s keep the clip open but are not speech.
        bool typed = false, kept = false; for (int i = 0; i < 90; ++i) { const auto event = gate.feed(i < 80 && i % 4 == 0 ? -10 : -38); typed |= event == VoiceGate::Discard; kept |= event == VoiceGate::Finish; }
        QVERIFY(typed && !kept);
        double at = 0; for (int i = 0; i < 250 && at == 0; ++i) if (gate.feed(i >= 140 && i % 30 < 5 ? -38 : -20) == VoiceGate::Finish) at = i * VoiceGate::frame;
        QVERIFY(at >= VoiceGate::longClip && at < VoiceGate::maximum);
        QVERIFY(VoiceGate::meaningful("Xin chào") && !VoiceGate::meaningful(" ... "));
    }
    void voiceGateKeepsQuietSpeechInANoisyRoomAsOneUtterance() {
        // Levels measured on a real Mac: room noise -27…-34 dB, voice only -20…-29 dB.
        const double noise[] = {-31, -28, -33, -30, -27.5, -32, -29, -34}, speech[] = {-23, -25, -22, -26, -24, -28.8, -21, -24.5, -23.5, -25.5};
        VoiceGate gate; int finished = 0, other = 0;
        for (int i = 0; i < 60; ++i) finished += gate.feed(noise[i % 8]) == VoiceGate::Finish;
        QCOMPARE(finished, 0);
        for (int i = 0; i < 160; ++i) other += gate.feed(speech[i % 10]) != VoiceGate::None;
        QCOMPARE(other, 0);
        for (int i = 0; i < 20; ++i) { const auto event = gate.feed(noise[i % 8]); finished += event == VoiceGate::Finish; other += event == VoiceGate::Discard; }
        QCOMPARE(finished, 1); QCOMPARE(other, 0);
    }
    void speechRecognitionDefaultsToAutoInEveryEntryPoint() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QVERIFY(!bridge.state().contains("speechProvider") || bridge.state().value("speechProvider").toString() == "auto");
        for (const auto &file : {":/qml/Main.qml", ":/qml/InterpretationWorkspace.qml"}) {
            QFile qml(file); QVERIFY(qml.open(QIODevice::ReadOnly));
            QVERIFY2(!qml.readAll().contains(R"(speechProvider || "openai")"), file); // Settings shows Auto when unset
        }
    }
    void adoptModelMovesOnlySessionsWithoutWork() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("navigate", {{"feature", "chat"}});
        bridge.command("draft", {{"value", "Earlier question"}});
        const auto started = current(bridge).value("id").toString();
        bridge.command("submit", {{"sessionID", started}});
        bridge.command("navigate", {{"feature", "translate"}});
        bridge.command("draft", {{"value", "Not sent yet"}});
        const auto blank = current(bridge).value("id").toString();
        const auto model = [&](const QString &id) { for (const auto &value : bridge.state().value("sessions").toList()) if (value.toMap().value("id") == id) return value.toMap().value("model").toString(); return QString(); };
        bridge.command("adoptModel", {{"value", "gemini:gemini-2.5-flash"}, {"sessionIDs", QStringList{started, blank}}});
        QCOMPARE(model(blank), QString("gemini:gemini-2.5-flash"));
        QCOMPARE(model(started), QString("ollama:llama3.2"));
        QCOMPARE(current(bridge).value("draft").toString(), QString("Not sent yet"));
        bridge.command("adoptModel", {{"value", "not-a-model"}, {"sessionIDs", QStringList{blank}}});
        QCOMPARE(model(blank), QString("gemini:gemini-2.5-flash"));
    }
    void providerNoticeFollowsRuntimeAndOpensLocalModels() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "chat"}});
        bridge.command("model", {{"value", "ollama:llama3.2"}});
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        auto *notice = visualItem(root->contentItem(), "provider-notice");
        QVERIFY(notice);
        // Never warns before discovery has answered.
        QCoreApplication::processEvents();
        QVERIFY(!notice->isVisible());
        ProviderDiscovery::Snapshot snapshot; snapshot.checked = true;
        bridge.applyProviderSnapshot(snapshot); // nothing local answered, no cloud key
        QTRY_VERIFY(notice->isVisible());
        QVERIFY(bridge.providersEmpty());
        snapshot.models["ollama"] = {"ollama:llama3.2"};
        bridge.applyProviderSnapshot(snapshot);
        QTRY_VERIFY(!notice->isVisible());
        // A model this device cannot run warns again and offers the one it can.
        bridge.command("model", {{"value", "claude:claude-haiku-4"}});
        QTRY_VERIFY(notice->isVisible());
        auto *use = visualItem(root->contentItem(), "provider-notice-use");
        QVERIFY(use); QTRY_VERIFY(use->isVisible());
        QMetaObject::invokeMethod(notice, "useRequested", Q_ARG(QString, "ollama:llama3.2"));
        QTRY_VERIFY(!notice->isVisible());
        QCOMPARE(current(bridge).value("model").toString(), QString("ollama:llama3.2"));
        const auto before = bridge.state();
        QVERIFY(QMetaObject::invokeMethod(root, "openSettingsSection", Q_ARG(QVariant, "localModels")));
        auto *settings = root->findChild<QQuickItem *>("settings-workspace");
        QTRY_VERIFY(settings);
        QTRY_COMPARE(settings->property("activeSection").toString(), QString("localModels"));
        QTRY_COMPARE(root->property("settingsSection").toString(), QString());
        QCOMPARE(bridge.state().value("sessions"), before.value("sessions"));
        // A synchronous "section consumed" reset would loop the binding. Leaving Chat
        // also emits the known ChatTranscript.qml:33 warning, so filter for loops only.
        for (const auto &warning : warnings)
            for (const auto &error : qvariant_cast<QList<QQmlError>>(warning.at(0)))
                QVERIFY2(!error.toString().contains("Binding loop"), qPrintable(error.toString()));
    }
    void qmlLoadsWithRealBridge_data() {
        QTest::addColumn<QString>("feature");
        QTest::addColumn<bool>("library");
        QTest::addColumn<bool>("compact");
        QTest::addColumn<QString>("preset");
        QTest::addColumn<QString>("mode");
        QTest::newRow("chat") << "chat" << false << false << "graphite" << "light";
        QTest::newRow("translation") << "translate" << false << false << "graphite" << "light";
        QTest::newRow("chat-library") << "chat" << true << false << "graphite" << "light";
        QTest::newRow("translation-library") << "translate" << true << false << "graphite" << "light";
        QTest::newRow("chat-library-640") << "chat" << true << true << "graphite" << "light";
        QTest::newRow("translation-library-640") << "translate" << true << true << "graphite" << "light";
        QTest::newRow("glass-light") << "chat" << false << false << "glass" << "light";
        QTest::newRow("glass-dark") << "translate" << false << false << "glass" << "dark";
        QTest::newRow("glass-library-640") << "chat" << true << true << "glass" << "light";
        QTest::newRow("glass-library-dark-640") << "translate" << true << true << "glass" << "dark";
    }
    void qmlLoadsWithRealBridge() {
        QFETCH(QString, feature);
        QFETCH(bool, library);
        QFETCH(bool, compact);
        QFETCH(QString, preset);
        QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"preset", preset}, {"mode", mode}});
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("navigate", {{"feature", feature}});
        const auto previousID = current(bridge).value("id");
        bridge.command("draft", {{"value", "Original draft"}});
        bridge.command("new");
        bridge.command("draft", {{"value", "Active draft"}});
        const auto beforePreview = bridge.state();
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY2(!engine.rootObjects().isEmpty(), "QML must instantiate with the C++ state/resources");
        auto *root = engine.rootObjects().first();
        if (library) {
            if (compact) { root->setProperty("width", 640); root->setProperty("height", 600); }
            root->setProperty("previewID", previousID);
            root->setProperty("library", true);
            QCoreApplication::processEvents();
            auto *layout = root->findChild<QQuickItem *>("history-library");
            auto *open = root->findChild<QQuickItem *>("history-open");
            QVERIFY(layout); QVERIFY(open);
            QTRY_COMPARE(layout->property("columns").toInt(), compact ? 1 : 2);
            const auto bottomRight = open->mapToScene(QPointF(open->width(), open->height()));
            QVERIFY(open->width() > 0 && open->height() > 0);
            QVERIFY(bottomRight.x() <= root->property("width").toDouble());
            QVERIFY(bottomRight.y() <= root->property("height").toDouble());
            QCOMPARE(bridge.state(), beforePreview); // Viewing an older record must not select or save it.
            root->setProperty("historyQuery", "No matching record");
            QCoreApplication::processEvents();
            QCOMPARE(root->property("previewID").toString(), QString());
            QVERIFY(!open->isEnabled());
            QCOMPARE(bridge.state(), beforePreview);
        }
        QCoreApplication::processEvents();
        QCOMPARE(warnings.count(), 0);
    }
};
QTEST_MAIN(WorkbenchBridgeTests)
#include "WorkbenchBridgeTests.moc"
