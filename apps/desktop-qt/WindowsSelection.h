#pragma once
#include <QString>
#include <memory>

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
    bool replace(const QString &text);
    bool undo();
private:
    struct State;
    std::unique_ptr<State> state;
};
