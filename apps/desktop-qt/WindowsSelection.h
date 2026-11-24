#pragma once
#include <QString>
#include <memory>
#include <functional>

// Text read from the UI Automation document and its three ranges, in UTF-16.
struct WindowsSelectionText {
    enum class Result { Failed, Unchanged, Replaced };
    using Read = std::function<bool(QString &)>;
    using Write = std::function<bool(const QString &)>;
    QString full, prefix, selection, suffix, applied;
    bool matchesDocument() const;
    Result replace(const QString &replacement, const Read &read, const Write &write);
    bool undo(const Read &read, const Write &write);
};

// Holds an explicitly captured editor, never the current foreground clipboard.
class WindowsSelection {
public:
    WindowsSelection();
    ~WindowsSelection();
    WindowsSelection(const WindowsSelection &) = delete;
    WindowsSelection &operator=(const WindowsSelection &) = delete;
    void clear();
    QString capture();
    bool canReplace() const;
    bool canUndo() const;
    WindowsSelectionText::Result replace(const QString &text);
    bool undo();
private:
    struct State;
    std::unique_ptr<State> state;
};
