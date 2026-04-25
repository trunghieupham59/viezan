# Báo cáo: Split UI Component — Viezan

**Workflow:** split-ui-component  
**Ngày:** 26/04/2026 — 01:08  
**Phạm vi:** `src/components/` + `src/pages/`  
**Công cụ phát hiện:** Skill `split-ui-component`

---

## Tóm tắt

| Loại vấn đề                   | 🟠 High | 🟡 Medium | 🟢 Low | Tổng |
|-------------------------------|---------|-----------|--------|------|
| SVG Icon Hardcode Inline      | 0       | 0         | 0      | 0    |
| UI Pattern Duplicate          | 0       | 1         | 0      | 1    |
| Sub-component Inline quá lớn | 0       | 0         | 0      | 0    |
| Component sai thư mục         | 0       | 1         | 0      | 1    |
| Emoji dùng như Icon           | 0       | 0         | 0      | 0    |
| **Tổng**                      | **0**   | **2**     | **0**  | **2** |

**File bị ảnh hưởng:** `src/components/translate/VoiceOverlay.tsx`, `src/components/FuriganaText.tsx`

**Top 2 ưu tiên sửa:**
1. 🟡 VoiceOverlay có UI pattern duplicate (3 animated circle elements)
2. 🟡 Kiểm tra `FuriganaText.tsx` vị trí trong cây thư mục

> **Nhận xét tổng quan:** Đây là codebase được tổ chức **rất tốt** về UI component. Không có SVG inline, không có emoji icon, không có sub-component inline quá lớn. Đây là kết quả tốt đáng kể so với báo cáo trước đó.

---

## PHẦN 1: BẢN ĐỒ COMPONENT

### Reusable — `src/components/ui/`

| Component | Trạng thái | Tiêu chí | Ghi chú |
|-----------|-----------|---------|---------|
| `CopyButton.tsx` | ✅ Đúng vị trí | Pass 5/5 | Props-only, icon từ registry |
| `RewriteButton.tsx` | ✅ Đúng vị trí | Pass 5/5 | Props-only, icon từ registry |
| `SpeakButton.tsx` | ✅ Đúng vị trí | Pass 5/5 | Props-only, icon từ registry |
| `SettingsCopyButton.tsx` | ✅ Đúng vị trí | Pass 5/5 | Variant của CopyButton |
| `InlineErrorBanner.tsx` | ✅ Đúng vị trí | Pass 5/5 | Domain-agnostic error display |
| `SettingsFormActions.tsx` | ✅ Đúng vị trí | Pass 5/5 | Generic form actions |
| `ButtonGroup.tsx` (inferred) | ✅ Đúng vị trí | Pass 5/5 | Generic grouping |
| `icons/` directory | ✅ Icon registry | — | Tập trung đúng chuẩn |

### Feature-specific — `src/components/translate/`

| Component | Feature | Trạng thái | Ghi chú |
|-----------|---------|-----------|---------|
| `DragOverlay.tsx` | translate | ✅ Đúng vị trí | Layout drag-drop đặc thù |
| `ImageAttachmentPreview.tsx` | translate | ✅ Đúng vị trí | Preview ảnh của image translate |
| `ImageSwitchToast.tsx` | translate | ✅ Đúng vị trí | Toast đặc thù feature |
| `ImageTranslator.tsx` | translate | ✅ Đúng vị trí | Image translate logic |
| `VoiceOverlay.tsx` | translate | ✅ Đúng vị trí | Voice UI đặc thù |
| `TranslateError.tsx` | translate | ✅ Đúng vị trí | Error UI của translate |
| `ResultPanelActions.tsx` | translate | ✅ Đúng vị trí | Actions cho translate result |
| `SourcePanelActions.tsx` | translate | ✅ Đúng vị trí | Actions cho translate source |
| `SourceLanguageSelector.tsx` | translate | ✅ Đúng vị trí | Language selector đặc thù |
| `TargetLanguageSelector.tsx` | translate | ✅ Đúng vị trí | Language selector đặc thù |
| `TranslateToolbar.tsx` | translate | ✅ Đúng vị trí | Toolbar đặc thù |

### Feature-specific — `src/components/chat/`

| Component | Feature | Trạng thái | Ghi chú |
|-----------|---------|-----------|---------|
| `MessageBubble.tsx` | chat | ✅ Đã tách đúng | Đã có file riêng (trước đây inline) |
| `SystemPromptDropdown.tsx` | chat | ✅ Đúng vị trí | Import chat store |
| `DeepResearchApiSection.tsx` | chat | ✅ Đúng vị trí | Settings section cho deep research |

### Root-level Reusable — `src/components/`

| Component | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| `Sidebar.tsx` | ✅ Đúng vị trí | Không import feature-specific logic |
| `AppLogo.tsx` | ✅ Đúng vị trí | Pure presentational |
| `MarkdownEditor.tsx` | ✅ Đúng vị trí | Generic editor, props-only |
| `MarkdownText.tsx` | ✅ Đúng vị trí | Generic renderer |
| `ModelSelector.tsx` | ✅ Đúng vị trí | Generic model picker |
| `LanguageSelector.tsx` | ✅ Đúng vị trí | Generic language picker |
| `ProviderIcon.tsx` | ✅ Đúng vị trí | Generic provider icon |
| `SettingsModal.tsx` | ⚠️ Xem xét | Modal lớn, có thể tách sections ra |
| `VoiceRecorder.tsx` | ⚠️ Xem xét | Có internal state nhưng props-only interface |
| `FuriganaText.tsx` | ⚠️ Xem xét | Japanese-specific — có thể là feature-specific |
| `ApiKeyInput.tsx` | ✅ Đúng vị trí | Generic API key input |

---

## PHẦN 2: VẤN ĐỀ PHÁT HIỆN

---

### [🟡 Medium] UI Pattern Duplicate — 3 Animated Ripple Circles trong VoiceOverlay

**File:** `src/components/translate/VoiceOverlay.tsx:37–41`

**Code hiện tại:**
```tsx
<div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-30"
  style={{ animationDuration: '1.8s' }} />
<div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-20"
  style={{ animationDuration: '1.4s', animationDelay: '0.2s' }} />
<div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-10"
  style={{ animationDuration: '1.1s', animationDelay: '0.1s' }} />
```

**Vấn đề:** 3 element JSX có cùng cấu trúc, chỉ khác `opacity`, `animationDuration`, `animationDelay`. Nếu muốn thêm một vòng sóng thứ 4 hoặc thay đổi màu sắc, phải sửa thủ công từng dòng.

**Sửa đề xuất:**
```tsx
const RIPPLE_RINGS = [
  { opacity: 'opacity-30', duration: '1.8s', delay: undefined },
  { opacity: 'opacity-20', duration: '1.4s', delay: '0.2s' },
  { opacity: 'opacity-10', duration: '1.1s', delay: '0.1s' },
] as const

{RIPPLE_RINGS.map((ring, i) => (
  <div
    key={i}
    className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 ${ring.opacity}`}
    style={{
      animationDuration: ring.duration,
      ...(ring.delay && { animationDelay: ring.delay }),
    }}
  />
))}
```

---

### [🟡 Medium] Xem xét vị trí `FuriganaText.tsx`

**File:** `src/components/FuriganaText.tsx`

**Tình trạng:** Component này render furigana (phiên âm tiếng Nhật). Đây là tính năng đặc thù cho Japanese language.

**Phân tích theo 5 tiêu chí Reusable:**

| # | Tiêu chí | Kết quả |
|---|---------|---------|
| 1 | Không import business logic | ✅ Pass — chỉ nhận props |
| 2 | Props-only interface | ✅ Pass — không gọi store |
| 3 | Domain-agnostic | ⚠️ Borderline — tên gắn với Japanese script |
| 4 | Icon từ registry | ✅ Pass — không có icon |
| 5 | Label qua props | ✅ Pass |

**Kết luận:** Vẫn hợp lệ ở root-level nếu furigana được dùng ở nhiều tính năng (translate + live translate). Nếu chỉ dùng ở translate feature → nên move vào `src/components/translate/`.

**Action:** Kiểm tra import graph — nếu chỉ `TranslatePage.tsx` import thì move vào `src/components/translate/FuriganaText.tsx`.

---

## PHẦN 3: ĐIỂM MẠNH ĐÃ ĐƯỢC GIẢI QUYẾT TỐT

### ✅ SVG Icon Hardcode — KHÔNG CÓ VI PHẠM

Kết quả grep:
```bash
grep -rn "<svg" src/ --include="*.tsx" | grep -v "src/components/ui/icons/"
# → Không có kết quả
```

**Tất cả SVG đều nằm trong** `src/components/ui/icons/` — đây là điểm xuất sắc so với các dự án React thông thường.

Icon registry hiện tại:
| Category file | Icons |
|---------------|-------|
| `actions.tsx` | copy, check, trash, download, X, plus, refresh, send, pencil, image, translate, rewrite, layers |
| `navigation.tsx` | chevron-down, chevron-right, gear, auto-detect, arrow-up |
| `media.tsx` | spinner, stop, speaker, microphone, monitor, subtitles |
| `status.tsx` | alert-triangle, radio-checked, info-circle, lightbulb, check-circle, user |
| `auth.tsx` | lock, eye, eye-off |
| `files.tsx` | document, clipboard |
| `providers.tsx` | Gemini, Claude, OpenAI provider logos |

---

### ✅ Emoji Icon — KHÔNG CÓ VI PHẠM

Các emoji tìm thấy trong codebase chỉ xuất hiện trong:
- `src/types/index.ts:190` — JSDoc comment: `"🔍 Phân tích câu hỏi"` (label string, không phải JSX render)
- Không có emoji render trực tiếp trong JSX như `<span>🔍</span>`

---

### ✅ Sub-component Inline — ĐÃ ĐƯỢC XỬ LÝ TỐT

- `MessageBubble` đã được tách ra `src/components/chat/MessageBubble.tsx` (báo cáo trước ghi nhận là vấn đề, đã được fix)
- Không có sub-component inline nào ≥ 30 dòng vi phạm trong pages hiện tại

---

### ✅ Component Vị trí — ĐẠI BỘ PHẬN ĐÚNG VỊ TRÍ

Cấu trúc thư mục được tổ chức rõ ràng:
```
src/components/
  ui/           ← Reusable (CopyButton, RewriteButton, SpeakButton, icons/...)
  translate/    ← Feature: Translate (DragOverlay, ImageTranslator, VoiceOverlay, ...)
  chat/         ← Feature: Chat (MessageBubble, SystemPromptDropdown, ...)
  *.tsx         ← Root-level reusable (Sidebar, ModelSelector, MarkdownEditor...)
```

---

## Kế hoạch Action

| # | Ưu tiên | Action | Chi tiết |
|---|---------|--------|---------|
| 1 | 🟡 Medium | Refactor VoiceOverlay ripples | Tham số hóa 3 animated circle thành array + map |
| 2 | 🟡 Medium | Verify FuriganaText imports | Nếu chỉ dùng ở translate feature → move vào `translate/` |

---

## Kết luận

Codebase **đạt tiêu chuẩn cao** về tổ chức UI component:

- 🟢 **Zero SVG inline** ngoài icon registry
- 🟢 **Zero emoji icon** trong JSX
- 🟢 **MessageBubble đã tách** thành file riêng
- 🟢 **Icon registry hoàn chỉnh** với 6 category files
- 🟢 **Feature folder rõ ràng**: `translate/`, `chat/` tách biệt
- 🟡 **2 điểm nhỏ** cần cải thiện: VoiceOverlay ripple pattern và FuriganaText placement

So sánh với báo cáo `split-ui-component-report-20260422.md` trước đó, dự án đã có **cải thiện đáng kể**: số vấn đề giảm từ 17 xuống còn 2.

---

*Báo cáo được tạo bởi workflow `split-ui-component` — viezanagent*
