#include "WindowsSelection.h"
bool WindowsSelectionText::matchesDocument() const {
    return !selection.isEmpty() && prefix.isValidUtf16() && selection.isValidUtf16() && suffix.isValidUtf16()
        && prefix + selection + suffix == full;
}

WindowsSelectionText::Result WindowsSelectionText::replace(const QString &replacement, const Read &read, const Write &write) {
    QString current;
    if (!applied.isEmpty() || !matchesDocument() || replacement.isEmpty() || replacement.contains(QChar::Null)
        || replacement.size() > 32768 || !replacement.isValidUtf16() || !read(current) || current != full) return Result::Failed;
    if (replacement == selection) return Result::Unchanged;
    const auto next = prefix + replacement + suffix;
    if (next.size() > 131072 || !write(next) || !read(current) || current != next) return Result::Failed;
    applied = next;
    return Result::Replaced;
}

bool WindowsSelectionText::undo(const Read &read, const Write &write) {
    QString current;
    if (applied.isEmpty() || !read(current) || current != applied || !write(full) || !read(current) || current != full) return false;
    applied.clear();
    return true;
}

#ifdef Q_OS_WIN
#include <windows.h>
#include <UIAutomation.h>
#include <wrl/client.h>
using Microsoft::WRL::ComPtr;
namespace {
bool setValue(IUIAutomationValuePattern *editor, const QString &text) {
    BSTR value = SysAllocStringLen(reinterpret_cast<const OLECHAR *>(text.utf16()), static_cast<UINT>(text.size()));
    if (!value) return false;
    const auto result = editor->SetValue(value);
    SysFreeString(value);
    return SUCCEEDED(result);
}
QString take(BSTR value) { const auto result = value ? QString::fromWCharArray(value, SysStringLen(value)) : QString{}; SysFreeString(value); return result; }
bool text(IUIAutomationTextRange *range, QString &result) {
    BSTR value = nullptr; if (!range || FAILED(range->GetText(131073, &value))) { SysFreeString(value); return false; }
    result = take(value); return result.size() <= 131072;
}
}
struct WindowsSelection::State : WindowsSelectionText {
    HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    ComPtr<IUIAutomationElement> element;
    ComPtr<IUIAutomationTextPattern> pattern;
    ComPtr<IUIAutomationTextRange> selected;
    ComPtr<IUIAutomationValuePattern> editor;
    HWND foreground = nullptr;
    bool stillFocused() const {
        if (!foreground || GetForegroundWindow() != foreground) return false;
        ComPtr<IUIAutomation> automation;
        ComPtr<IUIAutomationElement> focused;
        BOOL same = FALSE;
        return SUCCEEDED(CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&automation)))
            && SUCCEEDED(automation->GetFocusedElement(&focused)) && focused
            && SUCCEEDED(automation->CompareElements(element.Get(), focused.Get(), &same)) && same;
    }
    int process = 0; bool captured = false;
    ~State() { editor.Reset(); selected.Reset(); pattern.Reset(); element.Reset(); if (SUCCEEDED(initialized)) CoUninitialize(); }
    bool value(QString &result) const {
        BOOL password = TRUE, readonly = TRUE, enabled = FALSE; int owner = 0;
        if (!element || !editor || FAILED(element->get_CurrentProcessId(&owner)) || owner != process ||
            FAILED(element->get_CurrentIsPassword(&password)) || password || FAILED(element->get_CurrentIsEnabled(&enabled)) || !enabled ||
            FAILED(editor->get_CurrentIsReadOnly(&readonly)) || readonly) return false;
        BSTR raw = nullptr; if (FAILED(editor->get_CurrentValue(&raw))) { SysFreeString(raw); return false; }
        if (raw && SysStringLen(raw) > 131072) { SysFreeString(raw); return false; }
        result = take(raw); return true;
    }
};
#else
struct WindowsSelection::State {};
#endif
WindowsSelection::WindowsSelection() : state(std::make_unique<State>()) {}
WindowsSelection::~WindowsSelection() = default;
void WindowsSelection::clear() { state = std::make_unique<State>(); }
QString WindowsSelection::capture() {
#ifdef Q_OS_WIN
    state = std::make_unique<State>();
    auto &s = *state; ComPtr<IUIAutomation> automation; ComPtr<IUIAutomationTextRangeArray> ranges;
    s.foreground = GetForegroundWindow();
    if (FAILED(CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&automation))) ||
        FAILED(automation->GetFocusedElement(&s.element)) || !s.element) return {};
    BOOL password = TRUE;
    if (FAILED(s.element->get_CurrentIsPassword(&password)) || password || FAILED(s.element->get_CurrentProcessId(&s.process)) || s.process == int(GetCurrentProcessId()) ||
        FAILED(s.element->GetCurrentPatternAs(UIA_TextPatternId, IID_PPV_ARGS(&s.pattern))) || !s.pattern ||
        FAILED(s.pattern->GetSelection(&ranges)) || !ranges) return {};
    int count = 0; if (FAILED(ranges->get_Length(&count)) || count != 1 || FAILED(ranges->GetElement(0, &s.selected)) || !s.selected || !text(s.selected.Get(), s.selection)) return {};
    // Reading also works for non-editable controls. Replacement requires both
    // text ranges and a plain value that exactly matches the document text.
    if (s.selection.isEmpty() || FAILED(s.element->GetCurrentPatternAs(UIA_ValuePatternId, IID_PPV_ARGS(&s.editor))) || !s.editor || !s.value(s.full)) return s.selection;
    ComPtr<IUIAutomationTextRange> document, before, after; QString documentText;
    if (FAILED(s.pattern->get_DocumentRange(&document)) || !document || !text(document.Get(), documentText) || documentText != s.full ||
        FAILED(document->Clone(&before)) || FAILED(document->Clone(&after)) || !before || !after ||
        FAILED(before->MoveEndpointByRange(TextPatternRangeEndpoint_End, s.selected.Get(), TextPatternRangeEndpoint_Start)) ||
        FAILED(after->MoveEndpointByRange(TextPatternRangeEndpoint_Start, s.selected.Get(), TextPatternRangeEndpoint_End)) ||
        !text(before.Get(), s.prefix) || !text(after.Get(), s.suffix) || !s.matchesDocument()) return s.selection;
    s.captured = true; return s.selection;
#else
    return {};
#endif
}
bool WindowsSelection::canReplace() const {
#ifdef Q_OS_WIN
    return state->captured && state->applied.isEmpty();
#else
    return false;
#endif
}
bool WindowsSelection::canUndo() const {
#ifdef Q_OS_WIN
    return state->captured && !state->applied.isEmpty();
#else
    return false;
#endif
}
WindowsSelectionText::Result WindowsSelection::replace(const QString &replacement) {
#ifdef Q_OS_WIN
    auto &s = *state; QString current;
    if (!canReplace()) return WindowsSelectionText::Result::Failed;
    ComPtr<IUIAutomationTextRangeArray> ranges; ComPtr<IUIAutomationTextRange> selection; int count = 0, start = 1, end = 1;
    if (FAILED(s.pattern->GetSelection(&ranges)) || !ranges || FAILED(ranges->get_Length(&count)) || count != 1 ||
        FAILED(ranges->GetElement(0, &selection)) || !selection ||
        FAILED(selection->CompareEndpoints(TextPatternRangeEndpoint_Start, s.selected.Get(), TextPatternRangeEndpoint_Start, &start)) || start != 0 ||
        FAILED(selection->CompareEndpoints(TextPatternRangeEndpoint_End, s.selected.Get(), TextPatternRangeEndpoint_End, &end)) || end != 0 ||
        !text(selection.Get(), current) || current != s.selection) return WindowsSelectionText::Result::Failed;
    return s.replace(replacement, [&s](QString &value) { return s.value(value); },
                     [&s](const QString &value) { return s.stillFocused() && setValue(s.editor.Get(), value); });
#else
    Q_UNUSED(replacement)
    return WindowsSelectionText::Result::Failed;
#endif
}
bool WindowsSelection::undo() {
#ifdef Q_OS_WIN
    auto &s = *state;
    if (!canUndo() || !s.undo([&s](QString &value) { return s.value(value); },
                              [&s](const QString &value) { return setValue(s.editor.Get(), value); })) return false;
    s.captured = false;
    return true;
#else
    return false;
#endif
}
