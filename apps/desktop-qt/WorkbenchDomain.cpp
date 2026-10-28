#include <QRegularExpression>
#include <algorithm>
#include "WorkbenchDomain.h"
#include "ImageTranslation.h"
#include "LanguageSegments.h"
#include <QSet>
#include <QUrl>
#include <QUuid>
#include <QStringList>
#include <cmath>
#include <algorithm>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>

namespace {
using Map = QVariantMap;
using List = QVariantList;
const QStringList features{"chat", "translate", "dictionary"};
const QStringList locales{"vi", "en", "ja"};
const QStringList languages{"vi", "en", "ja", "zh", "zh-TW", "ko", "fr", "de", "es", "pt", "ru", "ar", "th", "id", "it", "nl", "pl", "tr", "hi"};
bool sourceLanguage(const QString &value) { return value == "auto" || languages.contains(value); }
const QStringList models{"demo.standard", "demo.slow", "demo.failure"};
const QStringList statuses{"running", "succeeded", "cancelled", "failed", "interrupted"};
const QStringList modes{"system", "light", "dark"};
const QStringList sizes{"small", "medium", "large"};
QString normalizeOrigin(const QString &value) {
    QUrl url(value.trimmed(), QUrl::StrictMode);
    if (!url.isValid() || url.scheme() != "https" || url.host().isEmpty() || !url.userInfo().isEmpty() || url.hasQuery() || url.hasFragment() || (!url.path().isEmpty() && url.path() != "/")) return {};
    url.setPath(""); if (url.port() == 443) url.setPort(-1); return url.toString();
}
bool validModel(const QString &id) {
    if (models.contains(id)) return true;
    const auto prefix = id.section(':', 0, 0);
    if (!QStringList{"ollama", "lmstudio", "llamacpp", "openai", "claude", "gemini"}.contains(prefix) || id.size() <= prefix.size() + 1 || id.toUtf8().size() > 512) return false;
    for (const auto c : id) if (c.category() == QChar::Other_Control) return false;
    return true;
}
bool isString(const QVariant &v) { return v.metaType().id() == QMetaType::QString; }
bool isMap(const QVariant &v) { return v.metaType().id() == QMetaType::QVariantMap; }
bool isList(const QVariant &v) { return v.metaType().id() == QMetaType::QVariantList; }
bool integer(const QVariant &v, double minimum = 0) {
    const auto type = v.metaType().id();
    if (type != QMetaType::Int && type != QMetaType::LongLong && type != QMetaType::Double && type != QMetaType::UInt && type != QMetaType::ULongLong) return false;
    // Revisions/counts must be exact integers, not approximately integral floats.
    const auto n = v.toDouble();
    return std::isfinite(n) && n >= minimum && n <= 9007199254740991.0 && std::fpclassify(n - std::trunc(n)) == FP_ZERO;
}
Map freshSession(const QString &id, const QString &feature) {
    return {{"id", id}, {"feature", feature}, {"title", ""}, {"draft", ""},
            {"model", "ollama:llama3.2"}, {"source", "en"}, {"target", "vi"},
            {"revision", 0}, {"output", ""}, {"messages", List{}}};
}
qsizetype find(const List &items, const QString &id) {
    for (qsizetype i = 0; i < items.size(); ++i)
        if (items[i].toMap().value("id").toString() == id) return i;
    return -1;
}
qsizetype running(const List &tasks, const QString &sessionID) {
    for (qsizetype i = 0; i < tasks.size(); ++i) {
        const auto task = tasks[i].toMap();
        if (task.value("status") == "running" && task.value("request").toMap().value("sessionID") == sessionID) return i;
    }
    return -1;
}
void cancelRunning(List &tasks, const QString &sessionID) {
    const auto i = running(tasks, sessionID);
    if (i >= 0) { auto task = tasks[i].toMap(); task["status"] = "cancelled"; tasks[i] = task; }
}
// The JSON object inside a reply: strips a ```json fence or any text around the outermost braces.
QString dictionaryJSON(const QString &text) {
    const auto trimmed = text.trimmed();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
    const auto start = trimmed.indexOf('{'), end = trimmed.lastIndexOf('}');
    return start >= 0 && end > start ? trimmed.mid(start, end - start + 1) : trimmed;
}
bool validDictionary(const QString &text) {
    if (text.toUtf8().size() > 1048576) return false;
    const auto entry = QJsonDocument::fromJson(text.toUtf8()).object();
    for (const auto &key : {"headword", "pronunciation", "meaning"}) if (entry.value(key).toString().trimmed().isEmpty()) return false;
    const auto translations = entry.value("translations").toArray();
    if (translations.isEmpty() || translations.size() > 6) return false;
    const auto strings = [](const QJsonValue &value) {
        if (value.isUndefined() || value.isNull()) return true;
        if (!value.isArray()) return false;
        for (const auto &entry : value.toArray()) if (!entry.isString()) return false;
        return true;
    };
    for (const auto &key : {"partOfSpeech", "examples", "notes"}) if (!strings(entry.value(key))) return false;
    for (const auto &value : translations) {
        const auto translation = value.toObject();
        if (translation.value("text").toString().trimmed().isEmpty() || translation.value("pronunciation").toString().trimmed().isEmpty()) return false;
        for (const auto &key : {"partOfSpeech", "meaning", "usage", "nuance"}) {
            const auto field = translation.value(key);
            if (!field.isUndefined() && !field.isNull() && !field.isString()) return false;
        }
        for (const auto &key : {"examples", "collocations", "notes"}) if (!strings(translation.value(key))) return false;
    }
    return true;
}
void setOutput(Map &session, const QString &taskID, const QString &output) {
    if (session.value("feature") != "chat") session["output"] = output;
    else {
        auto messages = session.value("messages").toList();
        const auto i = find(messages, taskID);
        if (i >= 0) { auto message = messages[i].toMap(); message["text"] = output; messages[i] = message; }
        session["messages"] = messages;
    }
}
}

namespace WorkbenchDomain {
QVariantMap create(const QString &chatID, const QString &translateID) {
    return {{"schemaVersion", 1}, {"sessions", List{freshSession(chatID, "chat"), freshSession(translateID, "translate"), freshSession(chatID + "-dictionary", "dictionary")}},
            {"tasks", List{}}, {"active", Map{{"chat", chatID}, {"translate", translateID}, {"dictionary", chatID + "-dictionary"}}},
            {"feature", "chat"}, {"locale", "vi"}};
}
static bool validImages(const QVariant &value) {
    if (!value.isValid() || value.isNull()) return true;
    if (value.metaType().id() != QMetaType::QVariantList || value.toList().size() > 4) return false;
    QSet<QString> ids;
    for (const auto &entry : value.toList()) {
        const auto image = entry.toMap(); const auto id = image.value("id").toString();
        if (QUuid(id).isNull() || id.contains('/') || id.contains('\\') || ids.contains(id) || image.value("name").metaType().id() != QMetaType::QString || !QStringList{"image/jpeg", "image/png", "image/webp", "image/gif"}.contains(image.value("mime").toString())) return false;
        ids.insert(id);
    }
    return true;
}
bool validate(const Map &state) {
    for (const auto &key : {"rates", "bridge", "runtime", "voice"}) if (state.contains(key) && !state.value(key).isNull() && !isMap(state.value(key))) return false;
    if (state.contains("disabledModules") && !state.value("disabledModules").isNull() && !isList(state.value("disabledModules")) && state.value("disabledModules").metaType().id() != QMetaType::QStringList) return false;
    for (const auto &module : state.value("disabledModules").toStringList()) if (!QStringList{"chat", "translate", "dictionary", "interpret", "thermal", "apps", "utilities", "bridge"}.contains(module)) return false;
    const auto rates = state.value("rates").toMap(); if (rates.size() > 1000) return false;
    for (auto it = rates.begin(); it != rates.end(); ++it) {
        if (!isMap(it.value())) return false;
        const auto value = it.value().toMap();
        for (const auto &key : {"input", "output"}) { const auto type = value.value(key).metaType().id(); if (type != QMetaType::Double && type != QMetaType::Int && type != QMetaType::LongLong && type != QMetaType::UInt && type != QMetaType::ULongLong) return false; }
        const auto a = value.value("input").toDouble(), b = value.value("output").toDouble();
        if (!validModel(it.key()) || !std::isfinite(a) || !std::isfinite(b) || a < 0 || b < 0 || a > 1000000 || b > 1000000 || !QRegularExpression("^[A-Z]{3}$").match(value.value("currency").toString()).hasMatch()) return false;
    }
    for (const auto &entry : state.value("tasks").toList()) {
        const auto rawUsage = entry.toMap().value("usage");
        if (rawUsage.isValid() && !rawUsage.isNull() && !isMap(rawUsage)) return false;
        const auto usage = rawUsage.toMap();
        for (auto it = usage.begin(); it != usage.end(); ++it) if ((it.key() != "input" && it.key() != "output") || !integer(it.value()) || it.value().toLongLong() < 0 || it.value().toLongLong() > 1000000000) return false;
    }
    if (state.contains("bridge")) {
        const auto bridge = state.value("bridge").toMap(); const auto origins = bridge.value("origins").toStringList();
        if (bridge.value("automatic").metaType().id() != QMetaType::Bool || origins.size() > 32 || QSet<QString>(origins.begin(), origins.end()).size() != origins.size()) return false;
        for (const auto &origin : origins) if (origin.toUtf8().size() > 2048 || normalizeOrigin(origin) != origin) return false;
    }
    if (state.contains("voice")) { const auto voice = state.value("voice").toMap(); if (!QStringList{"system", "edge", "openai", "gemini", "elevenlabs"}.contains(voice.value("provider").toString()) || voice.value("voice").toString().toUtf8().size() > 256) return false; }
    if (state.contains("autoTranslate") && state.value("autoTranslate").metaType().id() != QMetaType::Bool) return false;
    if (state.contains("quickTranslate")) {
        const auto quick = state.value("quickTranslate").toMap(); const auto primary = quick.value("primary").toString(), secondary = quick.value("secondary").toString();
        if (!languages.contains(primary) || (!secondary.isEmpty() && (!languages.contains(secondary) || secondary == primary))) return false;
    }
    if (state.contains("autoTranslateDelay") && (!integer(state.value("autoTranslateDelay"),100) || state.value("autoTranslateDelay").toInt()>5000)) return false;
    if (state.contains("runtime")) { const auto runtime = state.value("runtime").toMap(); if (!QList<int>{1,2,4}.contains(runtime.value("parallel").toInt()) || !QList<int>{2048,4096,8192,16384,32768}.contains(runtime.value("context").toInt())) return false; }
    if (state.contains("prompts")) {
        if (!isList(state.value("prompts")) || state.value("prompts").toList().size() > 500) return false;
        QSet<QString> ids;
        for (const auto &value : state.value("prompts").toList()) { const auto prompt = value.toMap(); const auto id = prompt.value("id").toString(); if (id.isEmpty() || ids.contains(id) || prompt.value("name").toString().isEmpty() || prompt.value("name").toString().size() > 100 || prompt.value("text").toString().toUtf8().size() > 32768) return false; ids.insert(id); }
    }
    if (!integer(state.value("schemaVersion")) || state.value("schemaVersion").toInt() != 1 ||
        !locales.contains(state.value("locale").toString()) || !features.contains(state.value("feature").toString()) ||
        !isList(state.value("sessions")) || !isList(state.value("tasks")) || !isMap(state.value("active"))) return false;
    if (state.contains("appearance") && !state.value("appearance").isNull()) {
        const auto appearance = state.value("appearance").toMap();
        if (!QStringList{"graphite", "glass", "paper", "corporate", "midnight"}.contains(appearance.value("preset", "graphite").toString()) || !QStringList{"auto", "violet", "pink", "teal", "green", "amber", "red"}.contains(appearance.value("accent", "auto").toString())) return false;
        if (!modes.contains(appearance.value("mode").toString()) || !sizes.contains(appearance.value("textSize").toString())) return false;
    }
    if (state.contains("shell") && !state.value("shell").isNull() &&
        state.value("shell").toMap().value("navigationCollapsed").metaType().id() != QMetaType::Bool) return false;
    const auto sessions = state.value("sessions").toList(), tasks = state.value("tasks").toList();
    QSet<QString> sessionIDs, taskIDs;
    for (const auto &value : sessions) {
        if (!isMap(value)) return false;
        const auto s = value.toMap();
        for (const auto &key : {"id", "title", "draft", "output"}) if (!isString(s.value(key))) return false;
        const auto id = s.value("id").toString();
        if (id.isEmpty() || sessionIDs.contains(id) || !features.contains(s.value("feature").toString()) ||
            !validModel(s.value("model").toString()) || !sourceLanguage(s.value("source").toString()) ||
            !languages.contains(s.value("target").toString()) || !integer(s.value("revision")) || !isList(s.value("messages"))) return false;
        if (!validImages(s.value("images")) || (s.contains("archived") && s.value("archived").metaType().id() != QMetaType::Bool) || (s.contains("systemPrompt") && (!isString(s.value("systemPrompt")) || s.value("systemPrompt").toString().toUtf8().size() > 32768))) return false;
        if (s.contains("translationStyle") && !QStringList{"general", "formal", "casual", "business", "technical", "natural"}.contains(s.value("translationStyle").toString())) return false;
        if (s.contains("translationMode") && !QStringList{"translate", "annotate", "phonetic", "rewrite"}.contains(s.value("translationMode").toString())) return false;
        if (s.contains("carefulReasoning") && s.value("carefulReasoning").metaType().id() != QMetaType::Bool) return false;
        if (s.contains("reasoningEffort") && !QStringList{"auto", "low", "medium", "high"}.contains(s.value("reasoningEffort").toString())) return false;
        sessionIDs.insert(id);
        QSet<QString> messageIDs;
        for (const auto &entry : s.value("messages").toList()) {
            const auto message = entry.toMap();
            const auto messageID = message.value("id").toString();
            if (!isMap(entry) || !isString(message.value("id")) || messageID.isEmpty() || messageIDs.contains(messageID) ||
                !QStringList{"user", "assistant", "system"}.contains(message.value("role").toString()) || !isString(message.value("text")) || !validImages(message.value("images"))) return false;
            messageIDs.insert(messageID);
        }
    }
    for (const auto &feature : features) {
        const auto i = find(sessions, state.value("active").toMap().value(feature).toString());
        if (i < 0 || sessions[i].toMap().value("feature") != feature || sessions[i].toMap().value("archived").toBool()) return false;
    }
    for (const auto &value : tasks) {
        const auto task = value.toMap(), request = task.value("request").toMap();
        const auto id = task.value("id").toString();
        const auto i = find(sessions, request.value("sessionID").toString());
        if (!isMap(value) || id.isEmpty() || taskIDs.contains(id) || !isString(task.value("id")) ||
            !isString(task.value("attemptID")) || task.value("attemptID").toString().isEmpty() ||
            (task.contains("attemptNumber") && !integer(task.value("attemptNumber"), 1)) ||
            !statuses.contains(task.value("status").toString()) || !isString(task.value("output")) ||
            !isMap(task.value("request")) || i < 0 || sessions[i].toMap().value("feature") != request.value("feature") ||
            !validModel(request.value("model").toString()) || !isString(request.value("input")) ||
            !integer(request.value("revision")) || !locales.contains(request.value("locale").toString()) ||
            !sourceLanguage(request.value("source").toString()) || !languages.contains(request.value("target").toString())) return false;
        if (request.contains("carefulReasoning") && request.value("carefulReasoning").metaType().id() != QMetaType::Bool) return false;
        if (request.contains("reasoningEffort") && !QStringList{"auto", "low", "medium", "high"}.contains(request.value("reasoningEffort").toString())) return false;
        for (const auto &value : request.value("messages").toList()) {
            const auto message = value.toMap(); if (!QStringList{"user", "assistant", "system"}.contains(message.value("role").toString()) || !isString(message.value("content")) || !validImages(message.value("images"))) return false;
        }
        taskIDs.insert(id);
    }
    QSet<QString> busy;
    for (const auto &value : tasks) {
        const auto task = value.toMap();
        if (task.value("status") != "running") continue;
        const auto sessionID = task.value("request").toMap().value("sessionID").toString();
        if (busy.contains(sessionID)) return false;
        busy.insert(sessionID);
    }
    return true;
}
QVariantMap recover(const Map &saved) {
    auto state = saved;
    auto legacySessions = state.value("sessions").toList();
    auto legacyActive = state.value("active").toMap();
    bool hasDictionary = false;
    for (const auto &value : legacySessions) if (value.toMap().value("feature") == "dictionary") hasDictionary = true;
    if (!hasDictionary && !legacyActive.contains("dictionary")) {
        QString dictionaryID = "native-dictionary";
        while (find(legacySessions, dictionaryID) >= 0) dictionaryID += "-new";
        legacySessions.append(freshSession(dictionaryID, "dictionary"));
        legacyActive["dictionary"] = dictionaryID;
        state["sessions"] = legacySessions; state["active"] = legacyActive;
    }
    auto migratedSessions = state.value("sessions").toList(), migratedTasks = state.value("tasks").toList();
    for (auto &value : migratedSessions) { auto session = value.toMap(); if (session.value("model").toString().startsWith("demo.")) session["model"] = "ollama:llama3.2"; value = session; }
    for (auto &value : migratedTasks) { auto task = value.toMap(); auto request = task.value("request").toMap(); if (request.value("model").toString().startsWith("demo.")) request["model"] = "ollama:llama3.2"; task["request"] = request; value = task; }
    state["sessions"] = migratedSessions; state["tasks"] = migratedTasks;
    if (!validate(state)) return {};
    auto tasks = state.value("tasks").toList();
    for (auto &value : tasks) {
        auto task = value.toMap();
        if (task.value("status") == "running") { task["status"] = "interrupted"; value = task; }
    }
    state["tasks"] = tasks;
    return state;
}
QVariantMap command(const Map &original, const QString &name, const Map &p, const QString &id, const QString &attemptID) {
    auto state = original;
    // Bulk history operations preserve active work, drafts, favorites and comparison parents.
    // They construct a candidate snapshot first; callers persist only validated state.
    if (name == "trimHistory") {
        const auto keep = p.value("keep").toInt(); if (!QList<int>{20, 100, 500, 1000}.contains(keep)) return original;
        auto tasks = state.value("tasks").toList(); for (const auto &value : tasks) if (value.toMap().value("status") == "running") return original;
        auto sessions = state.value("sessions").toList(); const auto active = state.value("active").toMap().values(); QMap<QString, int> counts; QSet<QString> removed;
        QSet<QString> protectedParents;
        for (const auto &value : sessions) { const auto child = value.toMap(); if (active.contains(child.value("id")) || child.value("favorite").toBool()) protectedParents.insert(child.value("comparisonParent").toString()); }
        auto ordered = sessions;
        std::stable_sort(ordered.begin(), ordered.end(), [](const QVariant &a, const QVariant &b) { return a.toMap().value("updated").toDouble() > b.toMap().value("updated").toDouble(); });
        for (const auto &value : ordered) { const auto item = value.toMap(); if (protectedParents.contains(item.value("id").toString()) || !item.value("comparisonParent").toString().isEmpty() || active.contains(item.value("id")) || item.value("favorite").toBool() || (!item.value("draft").toString().isEmpty() && (item.value("feature") == "chat" || item.value("output").toString().isEmpty()))) continue;
            if (++counts[item.value("feature").toString()] > keep) removed.insert(item.value("id").toString());
        }
        for (const auto &value : sessions) if (removed.contains(value.toMap().value("comparisonParent").toString())) removed.insert(value.toMap().value("id").toString());
        for (qsizetype i = sessions.size(); i-- > 0;) if (removed.contains(sessions[i].toMap().value("id").toString())) sessions.removeAt(i);
        for (qsizetype i = tasks.size(); i-- > 0;) if (removed.contains(tasks[i].toMap().value("request").toMap().value("sessionID").toString())) tasks.removeAt(i);
        state["sessions"] = sessions; state["tasks"] = tasks; return state;
    }
    // Disabling a module cancels only its owned tasks, leaving other features untouched.
    if (name == "module") {
        const auto module = p.value("id").toString();
        if (!QStringList{"chat", "translate", "dictionary", "interpret", "thermal", "apps", "utilities", "bridge"}.contains(module) || p.value("enabled").metaType().id() != QMetaType::Bool) return original;
        auto disabled = state.value("disabledModules").toStringList(); disabled.removeAll(module); if (!p.value("enabled").toBool()) disabled.append(module); state["disabledModules"] = disabled;
        auto jobs = state.value("tasks").toList(); for (auto &value : jobs) { auto job = value.toMap(); if (disabled.contains(job.value("request").toMap().value("feature").toString()) && job.value("status") == "running") { job["status"] = "cancelled"; value = job; } }; state["tasks"] = jobs; return state;
    }
    const auto disabled = state.value("disabledModules").toStringList();
    if ((name == "navigate" && disabled.contains(p.value("feature").toString())) || (name == "route" && disabled.contains(p.value("value").toString() == "everywhere" ? "translate" : p.value("value").toString()))) return original;
    if (name == "retry") {
        for (const auto &value : state.value("tasks").toList()) { const auto task = value.toMap(); if (task.value("id") == p.value("taskID") && disabled.contains(task.value("request").toMap().value("feature").toString())) return original; }
    }
    if (name == "submit" || name == "retry") {
        for (const auto &session : state.value("sessions").toList()) if (session.toMap().value("id") == p.value("sessionID") && disabled.contains(session.toMap().value("feature").toString())) return original;
    }
    if (name == "savePrompt" || name == "deletePrompt") {
        auto prompts = state.value("prompts").toList();
        if (name == "deletePrompt") { for (qsizetype i = prompts.size(); i-- > 0;) if (prompts[i].toMap().value("id") == p.value("id")) prompts.removeAt(i); }
        else {
            const auto title = p.value("name").toString().trimmed(), text = p.value("text").toString();
            if (title.isEmpty() || title.size() > 100 || text.toUtf8().size() > 32768 || prompts.size() >= 500) return original;
            bool found = false; for (auto &value : prompts) { auto prompt = value.toMap(); if (prompt.value("name") == title) { prompt["text"] = text; value = prompt; found = true; } }
            if (!found) prompts.append(Map{{"id", id}, {"name", title}, {"text", text}});
        }
        state["prompts"] = prompts; return state;
    }
    if (name == "bridgePreferences") {
        const auto input = p.value("origins").toStringList(); QStringList origins;
        if (input.size() > 32 || p.value("automatic").metaType().id() != QMetaType::Bool) return original;
        for (const auto &value : input) { const auto origin = normalizeOrigin(value); if (origin.isEmpty() || origin.toUtf8().size() > 2048) return original; origins.append(origin); }
        origins.removeDuplicates(); origins.sort(); state["bridge"] = Map{{"automatic", p.value("automatic")}, {"origins", origins}}; return state;
    }
    if (name == "usageRate") {
        const auto model = p.value("model").toString(), currency = p.value("currency").toString();
        bool aOK = false, bOK = false; const auto a = p.value("input").toDouble(&aOK), b = p.value("output").toDouble(&bOK);
        if (!aOK || !bOK || !std::isfinite(a) || !std::isfinite(b) || a < 0 || b < 0 || a > 1000000 || b > 1000000 || !QRegularExpression("^[A-Z]{3}$").match(currency).hasMatch() || model.size() > 512 || !model.contains(':')) return original;
        auto rates = state.value("rates").toMap(); if (rates.size() >= 1000 && !rates.contains(model)) return original;
        rates[model] = Map{{"input", a}, {"output", b}, {"currency", currency}}; state["rates"] = rates; return state;
    }
    if (name == "voice") {
        if (!QStringList{"system", "edge", "openai", "gemini", "elevenlabs"}.contains(p.value("provider").toString()) || p.value("voice").toString().toUtf8().size() > 256) return original;
        state["voice"] = Map{{"provider", p.value("provider")}, {"voice", p.value("voice")}}; return state;
    }
    if (name == "autoTranslate") {
        if (p.value("enabled").metaType().id() != QMetaType::Bool || !integer(p.value("delay"),100) || p.value("delay").toInt()>5000) return original;
        state["autoTranslate"] = p.value("enabled"); state["autoTranslateDelay"] = p.value("delay"); return state;
    }
    if (name == "runtime") {
        if (!QList<int>{1,2,4}.contains(p.value("parallel").toInt()) || !QList<int>{2048,4096,8192,16384,32768}.contains(p.value("context").toInt())) return original;
        state["runtime"] = Map{{"parallel", p.value("parallel").toInt()}, {"context", p.value("context").toInt()}}; return state;
    }
    if (name == "deleteArchived") {
        auto records = state.value("sessions").toList(), jobs = state.value("tasks").toList();
        const auto archivedID = p.value("sessionID").toString(); const auto index = find(records, archivedID);
        if (index < 0 || !records[index].toMap().value("archived").toBool()) return original;
        QSet<QString> ids{archivedID}; for (const auto &record : records) if (record.toMap().value("comparisonParent") == archivedID) ids.insert(record.toMap().value("id").toString());
        for (const auto &job : jobs) if (ids.contains(job.toMap().value("request").toMap().value("sessionID").toString()) && job.toMap().value("status") == "running") return original;
        for (qsizetype i = records.size(); i-- > 0;) if (ids.contains(records[i].toMap().value("id").toString())) records.removeAt(i);
        for (qsizetype i = jobs.size(); i-- > 0;) if (ids.contains(jobs[i].toMap().value("request").toMap().value("sessionID").toString())) jobs.removeAt(i);
        state["sessions"] = records; state["tasks"] = jobs; return validate(state) ? state : original;
    }
    // Comparison children retain the parent revision so stale results cannot be adopted.
    if (name == "compare") {
        auto sessions = state.value("sessions").toList(), tasks = state.value("tasks").toList();
        const auto parentID = p.value("sessionID").toString(); const auto position = find(sessions, parentID); if (position < 0) return original;
        auto parent = sessions[position].toMap(); auto selected = p.value("models").toStringList(); selected.removeDuplicates();
        if (parent.value("feature") != "translate" || parent.value("draft").toString().trimmed().isEmpty() || selected.size() < 2 || selected.size() > 3) return original;
        for (const auto &model : selected) if (!validModel(model)) return original;
        QSet<QString> obsolete; for (qsizetype i = sessions.size(); i-- > 0;) if (sessions[i].toMap().value("comparisonParent") == parentID) { obsolete.insert(sessions[i].toMap().value("id").toString()); sessions.removeAt(i); }
        for (qsizetype i = tasks.size(); i-- > 0;) if (obsolete.contains(tasks[i].toMap().value("request").toMap().value("sessionID").toString())) tasks.removeAt(i);
        parent.remove("assemblyParts"); sessions[find(sessions, parentID)] = parent; state["sessions"] = sessions; state["tasks"] = tasks;
        for (const auto &model : selected) {
            const auto childID = QUuid::createUuid().toString(QUuid::WithoutBraces); auto child = freshSession(childID, "translate");
            for (const auto &key : {"draft", "source", "target", "translationStyle", "translationMode", "reasoningEffort"}) if (parent.contains(key)) child[key] = parent.value(key);
            child["model"] = model; child["comparisonParent"] = parentID; child["comparisonRevision"] = parent.value("revision");
            auto values = state.value("sessions").toList(); values.append(child); state["sessions"] = values;
            state = command(state, "submit", {{"sessionID", childID}}, QUuid::createUuid().toString(QUuid::WithoutBraces), QUuid::createUuid().toString(QUuid::WithoutBraces));
        }
        return state;
    }
    auto sessions = state.value("sessions").toList(), tasks = state.value("tasks").toList();
    auto active = state.value("active").toMap();
    const auto sessionID = p.value("sessionID", active.value(state.value("feature").toString())).toString();
    const auto index = find(sessions, sessionID);
    auto item = index >= 0 ? sessions[index].toMap() : Map{};
    if (QStringList{"draft", "pair", "translationOptions", "reasoning", "addImage", "removeImage", "archive"}.contains(name)) {
        for (const auto &value : sessions) if (value.toMap().value("comparisonParent") == sessionID) cancelRunning(tasks, value.toMap().value("id").toString());
        item.remove("assemblyParts");
    }
    if (name == "adoptComparison" || name == "useSentence" || name == "adoptAssembly") {
        if (index < 0 || running(tasks, sessionID) >= 0) return original;
        if (name == "adoptAssembly") {
            const auto parts = item.value("assemblyParts").toMap(); const auto count = LanguageSegments::sentences(item.value("draft").toString()).size(); QStringList output;
            for (int i = 0; i < count; ++i) { if (!parts.contains(QString::number(i))) return original; output.append(parts.value(QString::number(i)).toString()); }
            if (count > 0) item["output"] = output.join('\n');
        } else {
            const auto ci = find(sessions, p.value("childID").toString()); if (ci < 0) return original; const auto child = sessions[ci].toMap();
            bool succeeded = false; for (const auto &value : tasks) if (value.toMap().value("request").toMap().value("sessionID") == child.value("id") && value.toMap().value("status") == "succeeded") succeeded = true;
            if (!succeeded || child.value("comparisonParent") != sessionID || child.value("comparisonRevision") != item.value("revision") || running(tasks, child.value("id").toString()) >= 0) return original;
            if (name == "adoptComparison") { item["output"] = child.value("output"); item["model"] = child.value("model"); }
            else { const auto translated = LanguageSegments::sentences(child.value("output").toString()); const auto source = LanguageSegments::sentences(item.value("draft").toString()); const auto row = p.value("index").toInt(); if (translated.size() != source.size() || row < 0 || row >= translated.size()) return original; auto parts = item.value("assemblyParts").toMap(); parts[QString::number(row)] = translated[row]; item["assemblyParts"] = parts; }
        }
        sessions[index] = item; state["sessions"] = sessions; return state;
    }
    // Navigation changes selection without mutating drafts or task identities.
    if (name == "navigate" && features.contains(p.value("feature").toString())) state["feature"] = p.value("feature");
    else if (name == "select" && index >= 0 && !item.value("archived").toBool()) { state["feature"] = item.value("feature"); active[item.value("feature").toString()] = item.value("id"); }
    // Quick translate's pair; choosing the current secondary as primary swaps the two.
    else if ((name == "quickTranslatePrimary" || name == "quickTranslateSecondary") && (languages.contains(p.value("value").toString()) || (name == "quickTranslateSecondary" && p.value("value").toString().isEmpty()))) {
        auto quick = state.value("quickTranslate").toMap(); const auto value = p.value("value").toString();
        if (!quick.contains("primary")) { quick["primary"] = "vi"; for (const auto &entry : sessions) if (entry.toMap().value("id") == active.value("translate")) quick["primary"] = entry.toMap().value("target"); }
        if (name == "quickTranslatePrimary") { if (quick.value("secondary") == value) quick["secondary"] = quick.value("primary"); quick["primary"] = value; }
        else if (value != quick.value("primary").toString()) quick["secondary"] = value;
        state["quickTranslate"] = quick;
    }
    else if (name == "speechProvider" && QStringList{"auto", "openai", "groq", "gemini"}.contains(p.value("value").toString())) state["speechProvider"] = p.value("value");
    else if (name == "locale" && locales.contains(p.value("value").toString())) state["locale"] = p.value("value");
    else if (name == "route" && QStringList{"home", "chat", "translate", "dictionary", "settings", "utilities", "everywhere", "thermal", "interpret", "apps"}.contains(p.value("value").toString())) {
        auto shell = state.value("shell").toMap();
        if (!shell.contains("navigationCollapsed")) shell["navigationCollapsed"] = false;
        shell["lastRoute"] = p.value("value") == "settings" ? QVariant("home") : p.value("value");
        state["shell"] = shell;
    }
    else if (name == "navigation" && p.value("collapsed").metaType().id() == QMetaType::Bool && p.value("collapsed").toBool() != state.value("shell").toMap().value("navigationCollapsed").toBool()) {
        auto shell = state.value("shell").toMap(); shell["navigationCollapsed"] = p.value("collapsed"); state["shell"] = shell;
    }
    else if (name == "appearance") {
        auto appearance = state.value("appearance").toMap();
        const auto mode = p.value("mode", appearance.value("mode", "system")).toString();
        const auto size = p.value("textSize", appearance.value("textSize", "medium")).toString();
        const auto preset = p.value("preset", appearance.value("preset", "graphite")).toString(), accent = p.value("accent", appearance.value("accent", "auto")).toString();
        if (modes.contains(mode) && sizes.contains(size) && QStringList{"graphite", "glass", "paper", "corporate", "midnight"}.contains(preset) && QStringList{"auto", "violet", "pink", "teal", "green", "amber", "red"}.contains(accent)) state["appearance"] = Map{{"mode", mode}, {"textSize", size}, {"preset", preset}, {"accent", accent}};
    } else if (name == "new") {
        sessions.prepend(freshSession(id, state.value("feature").toString()));
        active[state.value("feature").toString()] = id;
    } else if (name == "newDetached" && features.contains(p.value("feature").toString())) {
        auto next = freshSession(id, p.value("feature").toString()); next["draft"] = p.value("draft", "");
        for (const auto &key : {"model", "source", "target"}) next[key] = item.value(key, next.value(key));
        sessions.append(next);
    } else if (name == "rename" && index >= 0 && isString(p.value("value"))) {
        item["title"] = p.value("value").toString().trimmed().left(256);
    } else if (name == "archive" && index >= 0 && p.value("value").metaType().id() == QMetaType::Bool) {
        const auto archived = p.value("value").toBool(); item["archived"] = archived;
        if (archived) cancelRunning(tasks, sessionID);
        sessions[index] = item;
        if (archived && active.value(item.value("feature").toString()) == sessionID) {
            QString next;
            for (const auto &value : sessions) { const auto candidate = value.toMap(); if (candidate.value("feature") == item.value("feature") && !candidate.value("archived").toBool()) { next = candidate.value("id").toString(); break; } }
            if (next.isEmpty()) { sessions.append(freshSession(id, item.value("feature").toString())); next = id; }
            active[item.value("feature").toString()] = next;
        }
    } else if (name == "draft" && index >= 0 && isString(p.value("value")) && item.value("draft") != p.value("value")) {
        if (item.value("feature") != "chat") { cancelRunning(tasks, sessionID); item["output"] = ""; }
        item["draft"] = p.value("value"); item["revision"] = item.value("revision").toLongLong() + 1;
    } else if (name == "addImage" && index >= 0 && !item.value("archived").toBool() && QStringList{"chat", "translate"}.contains(item.value("feature").toString()) && !p.value("image").toMap().isEmpty() && item.value("images").toList().size() < (item.value("feature") == "translate" ? 1 : 4)) {
        if (item.value("feature") == "translate") { cancelRunning(tasks, sessionID); item["output"] = ""; }
        auto images = item.value("images").toList(); images.append(p.value("image")); item["images"] = images;
        item["revision"] = item.value("revision").toLongLong() + 1;
    } else if (name == "removeImage" && index >= 0) {
        if (item.value("feature") == "translate") { cancelRunning(tasks, sessionID); item["output"] = ""; }
        auto images = item.value("images").toList();
        for (qsizetype i = images.size(); i-- > 0;) if (images[i].toMap().value("id") == p.value("imageID")) images.removeAt(i);
        item["images"] = images; item["revision"] = item.value("revision").toLongLong() + 1;
    } else if (name == "carefulReasoning" && index >= 0 && item.value("feature") == "chat" && p.value("value").metaType().id() == QMetaType::Bool) {
        item["carefulReasoning"] = p.value("value");
    } else if (name == "chatMode" && index >= 0 && item.value("feature") == "chat" && QStringList{"text", "web", "research", "image"}.contains(p.value("value").toString())) {
        item["chatMode"] = p.value("value");
    } else if (name == "systemPrompt" && index >= 0 && isString(p.value("value")) && p.value("value").toString().toUtf8().size() <= 32768) {
        item["systemPrompt"] = p.value("value");
    } else if (name == "reasoning" && index >= 0 && item.value("feature") == "translate" && QStringList{"auto", "low", "medium", "high"}.contains(p.value("value").toString())) {
        cancelRunning(tasks, sessionID); item["reasoningEffort"] = p.value("value"); item["revision"] = item.value("revision").toLongLong() + 1; item["output"] = "";
    } else if (name == "translationOptions" && index >= 0 && item.value("feature") == "translate" && QStringList{"general", "formal", "casual", "business", "technical", "natural"}.contains(p.value("style").toString()) && QStringList{"translate", "annotate", "phonetic", "rewrite"}.contains(p.value("mode").toString())) {
        cancelRunning(tasks, sessionID); item["translationStyle"] = p.value("style"); item["translationMode"] = p.value("mode"); item["revision"] = item.value("revision").toLongLong() + 1; item["output"] = "";
    } else if (name == "dictionaryContext" && index >= 0 && item.value("feature") == "dictionary" && isString(p.value("value")) && p.value("value").toString().size() <= 500) {
        cancelRunning(tasks, sessionID); item["dictionaryContext"] = p.value("value");
        item["revision"] = item.value("revision").toLongLong() + 1; item["output"] = "";
    } else if (name == "favorite" && index >= 0 && item.value("feature") == "dictionary") {
        item["favorite"] = !item.value("favorite").toBool();
    } else if (name == "model" && index >= 0 && validModel(p.value("value").toString())) item["model"] = p.value("value");
    // Provider discovery moves sessions that have produced nothing to a model this device
    // can run. Unlike "model" it never schedules auto-translation (no provider charge).
    else if (name == "adoptModel" && validModel(p.value("value").toString())) {
        const auto ids = p.value("sessionIDs").toStringList(); bool changed = false;
        for (auto &value : sessions) {
            auto session = value.toMap(); if (!ids.contains(session.value("id").toString())) continue;
            const bool running = std::any_of(tasks.cbegin(), tasks.cend(), [&](const QVariant &task) { return task.toMap().value("request").toMap().value("sessionID") == session.value("id") && task.toMap().value("status") == "running"; });
            if (running || !session.value("messages").toList().isEmpty() || !session.value("output").toString().isEmpty() || !session.value("comparisonParent").toString().isEmpty()) continue;
            session["model"] = p.value("value"); value = session; changed = true;
        }
        if (!changed) return original;
    }
    else if (name == "pair" && index >= 0 && sourceLanguage(p.value("source").toString()) && languages.contains(p.value("target").toString())) {
        cancelRunning(tasks, sessionID); item["source"] = p.value("source"); item["target"] = p.value("target");
        item["revision"] = item.value("revision").toLongLong() + 1; item["output"] = "";
    } else if (name == "submit" && index >= 0 && (!item.value("draft").toString().trimmed().isEmpty() || (QStringList{"chat", "translate"}.contains(item.value("feature").toString()) && !item.value("images").toList().isEmpty())) && running(tasks, sessionID) < 0 && (item.value("feature") != "dictionary" || item.value("draft").toString().toUcs4().size() <= 120)) {
        // Freeze provider, language, revision and message context for this attempt.
        Map request{{"sessionID", sessionID}, {"locale", state.value("locale")}};
        for (const auto &key : {"feature", "model", "source", "target", "revision"}) request[key] = item.value(key);
        request["input"] = item.value("draft");
        if (item.contains("reasoningEffort")) request["reasoningEffort"] = item.value("reasoningEffort");
        request["translationStyle"] = item.value("translationStyle", "general"); request["translationMode"] = item.value("translationMode", "translate");
        if (item.contains("systemPrompt")) request["systemPrompt"] = item.value("systemPrompt");
        if (item.contains("carefulReasoning")) request["carefulReasoning"] = item.value("carefulReasoning");
        if (item.contains("chatMode")) request["chatMode"] = item.value("chatMode");
        if (item.contains("dictionaryContext")) request["dictionaryContext"] = item.value("dictionaryContext");
        List context;
        for (const auto &value : (item.value("feature") == "chat" ? item.value("messages").toList() : List{})) {
            const auto message = value.toMap();
            if (!message.value("text").toString().isEmpty() || !message.value("images").toList().isEmpty()) context.append(Map{{"role", message.value("role")}, {"content", message.value("text")}, {"images", message.value("images").toList()}});
        }
        context.append(Map{{"role", "user"}, {"content", item.value("draft")}, {"images", item.value("images").toList()}});
        request["messages"] = context;
        if (item.value("title").toString().isEmpty()) {
            const auto points = item.value("draft").toString().toUcs4();
            item["title"] = QString::fromUcs4(points.constData(), qMin(qsizetype(64), points.size())).replace('\n', ' ');
        }
        if (item.value("feature") == "chat") {
            auto messages = item.value("messages").toList();
            messages.append(Map{{"id", id + "-user"}, {"role", "user"}, {"text", item.value("draft")}, {"images", item.value("images").toList()}});
            messages.append(Map{{"id", id}, {"role", "assistant"}, {"text", ""}});
            item["messages"] = messages; item["draft"] = ""; item["images"] = List{};
        } else { item["output"] = ""; item["messages"] = List{}; }
        tasks.prepend(Map{{"id", id}, {"attemptID", attemptID}, {"attemptNumber", 1}, {"request", request}, {"status", "running"}, {"output", ""}});
    } else if (name == "cancel" || name == "retry" || name == "receive") {
        const auto ti = find(tasks, p.value("taskID").toString());
        if (ti >= 0) {
            auto task = tasks[ti].toMap();
            const auto request = task.value("request").toMap();
            const auto si = find(sessions, request.value("sessionID").toString());
            auto target = si >= 0 ? sessions[si].toMap() : Map{};
            const auto parentIndex = find(sessions, target.value("comparisonParent").toString());
            const bool currentRevision = (request.value("feature") == "chat" || target.value("revision") == request.value("revision")) && (!target.contains("comparisonParent") || (parentIndex >= 0 && sessions[parentIndex].toMap().value("revision") == target.value("comparisonRevision")));
            if (name == "cancel" && task.value("status") == "running") task["status"] = "cancelled";
            else if (name == "retry" && si >= 0 && !target.value("archived").toBool() && task.value("status") != "running" && task.value("status") != "succeeded" && running(tasks, request.value("sessionID").toString()) < 0 && currentRevision) {
                task["attemptID"] = attemptID; task["attemptNumber"] = task.value("attemptNumber", 1).toLongLong() + 1;
                task["status"] = "running"; task["output"] = ""; task.remove("errorCode"); task.remove("errorDetail"); setOutput(target, task.value("id").toString(), "");
            } else if (name == "receive" && task.value("status") == "running" && task.value("attemptID") == p.value("attemptID")) {
                if (si < 0 || !currentRevision) task["status"] = "cancelled";
                else {
                    if (p.contains("usage")) {
                        auto usage = task.value("usage").toMap(); const auto delta = p.value("usage").toMap();
                        for (const auto &key : {QString("input"), QString("output")}) { const auto count = delta.value(key).toLongLong(); if (count >= 0 && count <= 1000000000) usage[key] = qMin<qint64>(1000000000, usage.value(key).toLongLong() + count); }
                        task["usage"] = usage;
                    }
                    if (p.contains("research")) task["research"] = p.value("research");
                    task["output"] = task.value("output").toString() + p.value("chunk").toString();
                    if (p.value("terminal") == "failed") {
                        task["errorCode"] = p.value("errorCode", "providerError");
                        // The provider's own explanation, shown under the localized error.
                        if (!p.value("errorDetail").toString().isEmpty()) task["errorDetail"] = p.value("errorDetail").toString().left(300); else task.remove("errorDetail");
                        // A refused or unusable answer to a request with images usually means the model cannot read images.
                        bool images = ImageTranslation::isImageRequest(request);
                        if (!images) for (const auto &message : request.value("messages").toList()) if (message.toMap().value("role") == "user") images = !message.toMap().value("images").toList().isEmpty(); // last user turn
                        if (images && request.value("chatMode") != "image" && QStringList{"providerRejected", "providerInvalidResponse"}.contains(task.value("errorCode").toString())) task["errorCode"] = "imageModelUnsupported";
                    }
                    setOutput(target, task.value("id").toString(), task.value("output").toString());
                    if (p.contains("images") && validImages(p.value("images")) && target.value("feature") == "chat") {
                        auto messages = target.value("messages").toList(); const auto mi = find(messages, task.value("id").toString());
                        if (mi >= 0) { auto message = messages[mi].toMap(); message["images"] = p.value("images"); messages[mi] = message; target["messages"] = messages; }
                    }
                    if (p.value("terminal") == "succeeded" && ImageTranslation::isImageRequest(request) && !ImageTranslation::valid(task.value("output").toString())) { task["status"] = "failed"; task["errorCode"] = "imageModelUnsupported"; }
                    else if (p.value("terminal") == "succeeded" && request.value("feature") == "dictionary") {
                        // Models often fence the JSON despite the prompt; keep the JSON only.
                        const auto json = dictionaryJSON(task.value("output").toString());
                        task["output"] = json; setOutput(target, task.value("id").toString(), json);
                        task["status"] = validDictionary(json) ? "succeeded" : "failed";
                        if (!validDictionary(json)) task["errorCode"] = "providerInvalidResponse";
                    }
                    else if (p.value("terminal") == "succeeded" || p.value("terminal") == "failed") task["status"] = p.value("terminal");
                }
            }
            tasks[ti] = task;
            if (si >= 0) { sessions[si] = target; if (si == index) item = target; }
        }
    }
    // Ignored commands must not change recency or trigger unnecessary persistence.
    if (index >= 0 && (item != sessions[index].toMap() || tasks != original.value("tasks").toList()) && QStringList{"draft", "submit", "rename", "pair", "dictionaryContext"}.contains(name) && p.value("_updated").toDouble() > 0 && std::isfinite(p.value("_updated").toDouble())) item["updated"] = p.value("_updated");
    // New inserts before the old index; do not overwrite the newly created session.
    if (index >= 0 && name != "new" && name != "adoptModel") sessions[index] = item;
    if (name == "receive" && p.value("terminal") == "succeeded") {
        QString owner; for (const auto &value : tasks) { const auto task = value.toMap(); if (task.value("id") == p.value("taskID") && task.value("status") == "succeeded" && task.value("request").toMap().value("feature") == "dictionary") owner = task.value("request").toMap().value("sessionID").toString(); }
        const auto currentIndex = find(sessions, owner);
        if (currentIndex >= 0) {
            auto current = sessions[currentIndex].toMap(); bool favorite = current.value("favorite").toBool();
            const auto key = [](QString text) { return text.normalized(QString::NormalizationForm_C).toLower().simplified(); };
            for (qsizetype i = 0; i < sessions.size(); ++i) { if (i == currentIndex) continue; auto other = sessions[i].toMap();
                if (other.value("feature") == "dictionary" && !other.value("archived").toBool() && other.value("source") == current.value("source") && other.value("target") == current.value("target") && key(other.value("draft").toString()) == key(current.value("draft").toString()) && key(other.value("dictionaryContext").toString()) == key(current.value("dictionaryContext").toString()) && running(tasks, other.value("id").toString()) < 0) {
                    favorite = favorite || other.value("favorite").toBool(); other["archived"] = true; other["favorite"] = false; sessions[i] = other; if (active.value("dictionary") == other.value("id")) active["dictionary"] = current.value("id");
                }
            }
            current["favorite"] = favorite; sessions[currentIndex] = current;
        }
    }
    state["sessions"] = sessions; state["tasks"] = tasks; state["active"] = active;
    return state;
}
}
