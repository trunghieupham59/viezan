#include "WindowsSelection.h"
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
struct WindowsSelection::State {
    HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    ComPtr<IUIAutomationElement> element;
    ComPtr<IUIAutomationTextPattern> pattern;
    ComPtr<IUIAutomationTextRange> selected;
    ComPtr<IUIAutomationValuePattern> editor;
    QString full, prefix, selection, suffix, applied;
    int process = 0; bool captured = false, replaced = false;
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
        !text(before.Get(), s.prefix) || !text(after.Get(), s.suffix) || s.prefix + s.selection + s.suffix != s.full) return s.selection;
    s.captured = true; return s.selection;
#else
    return {};
#endif
}
bool WindowsSelection::canReplace() const {
#ifdef Q_OS_WIN
    return state->captured && !state->replaced;
#else
    return false;
#endif
}
bool WindowsSelection::canUndo() const {
#ifdef Q_OS_WIN
    return state->captured && state->replaced;
#else
    return false;
#endif
}
bool WindowsSelection::replace(const QString &replacement) {
#ifdef Q_OS_WIN
    auto &s = *state; QString current;
    if (!canReplace() || replacement.isEmpty() || replacement.contains(QChar::Null) || replacement.size() > 32768 || !s.value(current) || current != s.full) return false;
    ComPtr<IUIAutomationTextRangeArray> ranges; ComPtr<IUIAutomationTextRange> selection; int count = 0, start = 1, end = 1;
    if (FAILED(s.pattern->GetSelection(&ranges)) || !ranges || FAILED(ranges->get_Length(&count)) || count != 1 ||
        FAILED(ranges->GetElement(0, &selection)) || !selection ||
        FAILED(selection->CompareEndpoints(TextPatternRangeEndpoint_Start, s.selected.Get(), TextPatternRangeEndpoint_Start, &start)) || start != 0 ||
        FAILED(selection->CompareEndpoints(TextPatternRangeEndpoint_End, s.selected.Get(), TextPatternRangeEndpoint_End, &end)) || end != 0 ||
        !text(selection.Get(), current) || current != s.selection) return false;
    s.applied = s.prefix + replacement + s.suffix;
    if (s.applied.size() > 131072 || !setValue(s.editor.Get(), s.applied)) { s.applied.clear(); return false; }
    s.replaced = true;
    return s.value(current) && current == s.applied;
#else
    Q_UNUSED(replacement)
    return false;
#endif
}
bool WindowsSelection::undo() {
#ifdef Q_OS_WIN
    auto &s = *state; QString current;
    if (!canUndo() || !s.value(current) || current != s.applied || !setValue(s.editor.Get(), s.full)) return false;
    s.captured = false; s.replaced = false; return s.value(current) && current == s.full;
#else
    return false;
#endif
}
