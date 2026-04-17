# Báo cáo Check Duplicate & Hardcode + Split UI Component
**File:** `src/pages/TranslatePage.tsx`  
**Thời gian:** 2026-04-18 02:49  
**Workflow:** `check-dup-hardcode` + Skill `split-ui-component`

---

## Tổng quan

| Loại | Critical | High | Medium | Low | Tổng |
|---|---|---|---|---|---|
| **Duplicate Code** | | | | | |
| Near Duplicate | 0 | 1 | 0 | 0 | 1 |
| Structural Duplicate | 0 | 0 | 1 | 0 | 1 |
| Semantic Duplicate | 0 | 0 | 0 | 2 | 2 |
| **Hardcode** | | | | | |
| Magic String (error matching) | 0 | 1 | 0 | 0 | 1 |
| Magic String (MIME types) | 0 | 0 | 1 | 0 | 1 |
| Magic String (fallback lang) | 0 | 0 | 1 | 0 | 1 |
| Hardcode UI text | 0 | 0 | 2 | 2 | 4 |
| **Split UI** | | | | | |
| Sub-component quá lớn (inline) | 0 | 5 | 1 | 0 | 6 |
| **TỔNG** | **0** | **7** | **5** | **4** | **16** |

---

## Phần 1 — Duplicate Code

### DUP-01 🟠 High — Near Duplicate: `syncFromSource` / `syncFromTranslated`

**File:** `src/pages/TranslatePage.tsx` — Lines 66–82

**Code vi phạm:**
```tsx
// Line 66–73
const syncFromSource = () => {
  if (isSyncingScrollRef.current) return
  isSyncingScrollRef.current = true
  const maxSrc = source.scrollHeight - source.clientHeight
  const ratio = maxSrc > 0 ? source.scrollTop / maxSrc : 0
  translated.scrollTop = ratio * (translated.scrollHeight - translated.clientHeight)
  requestAnimationFrame(() => { isSyncingScrollRef.current = false })
}

// Line 75–82
const syncFromTranslated = () => {
  if (isSyncingScrollRef.current) return
  isSyncingScrollRef.current = true
  const maxSrc = translated.scrollHeight - translated.clientHeight
  const ratio = maxSrc > 0 ? translated.scrollTop / maxSrc : 0
  source.scrollTop = ratio * (source.scrollHeight - source.clientHeight)
  requestAnimationFrame(() => { isSyncingScrollRef.current = false })
}
```

**Vấn đề:** Hai hàm có cùng cấu trúc logic — check flag → set flag → tính maxSrc → tính ratio → set scrollTop → reset flag. Chỉ khác nhau vai trò `source`/`translated`. Đây là Type 2 clone (near duplicate), vi phạm DRY.

**Gợi ý sửa:**
```tsx
// Tạo helper factory
const makeSyncHandler = (
  from: HTMLDivElement,
  to: HTMLDivElement,
  flagRef: React.MutableRefObject<boolean>
) => () => {
  if (flagRef.current) return
  flagRef.current = true
  const maxFrom = from.scrollHeight - from.clientHeight
  const ratio = maxFrom > 0 ? from.scrollTop / maxFrom : 0
  to.scrollTop = ratio * (to.scrollHeight - to.clientHeight)
  requestAnimationFrame(() => { flagRef.current = false })
}

// Trong useEffect:
const syncFromSource = makeSyncHandler(source, translated, isSyncingScrollRef)
const syncFromTranslated = makeSyncHandler(translated, source, isSyncingScrollRef)
```

---

### DUP-02 🟡 Medium — Structural Duplicate: Bottom bar `className` pattern

**File:** `src/pages/TranslatePage.tsx` — Lines 245–246 và 394–395

**Code vi phạm:**
```tsx
// Line 245 (Source panel bottom bar)
<div className="flex-shrink-0 flex items-center justify-between px-4 h-12
                border-t border-gray-100 dark:border-gray-800 relative z-20 bg-white dark:bg-gray-900">

// Line 394 (Result panel bottom bar)
<div className="flex-shrink-0 flex items-center justify-between px-4 h-12
                border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
```

**Vấn đề:** Cùng layout `PanelFooter` xuất hiện 2 lần với className gần giống hệt nhau (chỉ khác `relative z-20`). Khi cần thay đổi style footer (ví dụ đổi height từ h-12 → h-14), phải sửa 2 chỗ.

**Gợi ý sửa:**
```tsx
// Tạo component PanelFooter trong src/components/translate/PanelFooter.tsx
// hoặc define className constant:
const PANEL_FOOTER_CLS = 
  'flex-shrink-0 flex items-center justify-between px-4 h-12 ' +
  'border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900'

// Dùng lại:
<div className={PANEL_FOOTER_CLS}>          {/* result panel */}
<div className={`${PANEL_FOOTER_CLS} relative z-20`}>  {/* source panel */}
```

---

### DUP-03 🟢 Low — Semantic Duplicate: `SpeakButton` usage pattern

**File:** `src/pages/TranslatePage.tsx` — Lines 300–309 và 403–412

**Code vi phạm:**
```tsx
// Line 300–309 (Source panel)
<SpeakButton
  panel="source"
  text={sourceText}
  lang={sourceLang === 'auto' ? 'en' : sourceLang}
  speakingPanel={speakingPanel}
  speakLoading={speakLoading}
  onSpeak={handleSpeak}
  labelSpeak={t.translate_speak}
  labelStop={t.translate_speak_stop}
/>

// Line 403–412 (Result panel)
<SpeakButton
  panel="translated"
  text={translatedText}
  lang={targetLang}
  speakingPanel={speakingPanel}
  speakLoading={speakLoading}
  onSpeak={handleSpeak}
  labelSpeak={t.translate_speak}
  labelStop={t.translate_speak_stop}
/>
```

**Vấn đề:** Cùng 5 props dùng chung (`speakingPanel`, `speakLoading`, `onSpeak`, `labelSpeak`, `labelStop`) phải truyền lặp lại cả 2 lần. Semantic duplicate.

**Gợi ý sửa:** Đây là low priority — `SpeakButton` đã được tách component. Khi extract các panel thành component riêng (xem Phần 3), nên gom `speakProps` thành 1 object để truyền.

---

### DUP-04 🟢 Low — Semantic Duplicate: `RewriteButton` usage pattern

**File:** `src/pages/TranslatePage.tsx` — Lines 312–318 và 432–439

**Code vi phạm:**
```tsx
// Line 312–318 (Source panel)
<RewriteButton
  panel="source"
  isRewriting={isRewriting}
  onRewrite={handleRewrite}
  labelRewrite={t.translate_rewrite}
  labelRewriting={t.translate_rewriting}
/>

// Line 432–439 (Result panel)
<RewriteButton
  panel="translated"
  isRewriting={isRewriting}
  onRewrite={handleRewrite}
  labelRewrite={t.translate_rewrite}
  labelRewriting={t.translate_rewriting}
/>
```

**Vấn đề:** 4 props dùng chung phải truyền lặp 2 lần. Tương tự DUP-03.

---

## Phần 2 — Hardcode

### HC-01 🟠 High — Magic String: Error message matching (fragile multi-language check)

**File:** `src/pages/TranslatePage.tsx` — Lines 368–369

**Code vi phạm:**
```tsx
{(translateError.includes('API key') || translateError.includes('Settings') ||
  translateError.includes('Cài đặt') || translateError.includes('設定')) && (
  <button type="button" onClick={() => setActivePage('settings')} className="btn-primary text-xs">
    {t.translate_error_open_settings}
  </button>
)}
```

**Vấn đề:** Logic phân loại lỗi dựa trên substring matching của error message với chuỗi hardcode đa ngôn ngữ (`'API key'`, `'Settings'`, `'Cài đặt'`, `'設定'`). Cực kỳ fragile:
- Thay đổi format error message ở backend/service sẽ break logic này
- Hardcode chuỗi tiếng Việt + tiếng Nhật trực tiếp trong render logic
- Không scale khi thêm ngôn ngữ mới

**Gợi ý sửa:**
```tsx
// Trong useTranslate.ts hoặc translationService.ts — expose error type:
type TranslateErrorType = 'api-key' | 'rate-limit' | 'network' | 'unknown'

// Thay vì string, expose thêm:
const isApiKeyError: boolean = /* detect once in the hook */

// Trong TranslatePage.tsx:
{isApiKeyError && (
  <button type="button" onClick={() => setActivePage('settings')} className="btn-primary text-xs">
    {t.translate_error_open_settings}
  </button>
)}
```

---

### HC-02 🟡 Medium — Magic String: Accepted image MIME types

**File:** `src/pages/TranslatePage.tsx` — Line 279

**Code vi phạm:**
```tsx
<input
  ref={fileInputRef}
  type="file"
  accept="image/jpeg,image/png,image/webp,image/gif"
  className="hidden"
  onChange={handleFileInputChange}
/>
```

**Vấn đề:** MIME type list hardcode inline. File `src/constants/image.ts` đã có các constants liên quan đến image nhưng chưa định nghĩa accepted types. Nếu cần thêm `image/avif` hay bỏ `image/gif`, phải tìm khắp codebase.

**Gợi ý sửa:**
```ts
// src/constants/image.ts — thêm:
/** Accepted MIME types for image file input (translate and chat). */
export const ACCEPTED_IMAGE_MIME_TYPES = 'image/jpeg,image/png,image/webp,image/gif'
```
```tsx
// TranslatePage.tsx:
import { ACCEPTED_IMAGE_MIME_TYPES } from '../constants/image'
<input accept={ACCEPTED_IMAGE_MIME_TYPES} ... />
```

---

### HC-03 🟡 Medium — Magic String: Default fallback language `'en'`

**File:** `src/pages/TranslatePage.tsx` — Line 303

**Code vi phạm:**
```tsx
lang={sourceLang === 'auto' ? 'en' : sourceLang}
```

**Vấn đề:** `'en'` là fallback language code khi source là `'auto'` — hardcode inline thay vì dùng constant. Nếu sau này muốn fallback sang ngôn ngữ khác, phải tìm tất cả nơi dùng `'en'` làm fallback.

**Gợi ý sửa:**
```ts
// src/constants/providers.ts — thêm:
/** Fallback TTS language code when source language is auto-detected. */
export const DEFAULT_TTS_FALLBACK_LANG = 'en'
```
```tsx
// TranslatePage.tsx:
lang={sourceLang === 'auto' ? DEFAULT_TTS_FALLBACK_LANG : sourceLang}
```

---

### HC-04 🟡 Medium — Hardcode UI Text: `"Using"` trong model-switch toast

**File:** `src/pages/TranslatePage.tsx` — Line 468

**Code vi phạm:**
```tsx
<p className="text-xs opacity-90 leading-snug mt-0.5">
  Using <strong>{imageSwitchNotice.model}</strong>
  {imageSwitchNotice.provider !== selectedProvider && (
    <> ({imageSwitchNotice.provider})</>
  )}
  {' '}— {t.image_model_switched_body}.
</p>
```

**Vấn đề:** Chuỗi `"Using"` hardcode tiếng Anh trong JSX, không qua i18n. Nếu user đang dùng ngôn ngữ khác, phần đầu toast sẽ luôn hiện tiếng Anh.

**Gợi ý sửa:** Thêm key i18n:
```ts
// src/i18n/locales/en.ts:
image_model_switched_using: 'Using {model}',  // hoặc format riêng

// Hoặc đơn giản hơn — gộp vào string hiện có:
image_model_switched_detail: 'Using {model} ({provider}) — {body}.'
```
```tsx
// Dùng tpl helper nếu có, hoặc:
{t.image_model_switched_using.replace('{model}', imageSwitchNotice.model)}
```

---

### HC-05 🟡 Medium — Hardcode UI Text: `'Dịch'` làm fallback cho translate button

**File:** `src/pages/TranslatePage.tsx` — Line 254

**Code vi phạm:**
```tsx
labelTranslate={t.translate_btn ?? 'Dịch'}
```

**Vấn đề:** Chuỗi `'Dịch'` (tiếng Việt) hardcode làm fallback khi `t.translate_btn` undefined. Nếu người dùng dùng locale English, fallback sẽ hiện tiếng Việt — inconsistent UX. Key này nên luôn có giá trị trong tất cả locale files.

**Gợi ý sửa:**
```tsx
// Đảm bảo t.translate_btn luôn được định nghĩa trong tất cả locale (en, vi, ja...)
// Bỏ fallback:
labelTranslate={t.translate_btn}

// Nếu vẫn muốn giữ fallback, dùng neutral:
labelTranslate={t.translate_btn ?? 'Translate'}
```

---

### HC-06 🟢 Low — Hardcode UI Text: `alt="Translated"` trên image kết quả

**File:** `src/pages/TranslatePage.tsx` — Line 381

**Code vi phạm:**
```tsx
<img
  src={editedImageUrl}
  alt="Translated"
  className="max-w-full rounded-lg fade-in"
/>
```

**Vấn đề:** Alt text `"Translated"` hardcode tiếng Anh. Nên dùng i18n key.

**Gợi ý sửa:**
```tsx
<img src={editedImageUrl} alt={t.image_translate_title} className="max-w-full rounded-lg fade-in" />
```

---

### HC-07 🟢 Low — Hardcode UI Text: Dấu câu inline trong toast

**File:** `src/pages/TranslatePage.tsx` — Line 472

**Code vi phạm:**
```tsx
{' '}— {t.image_model_switched_body}.
```

**Vấn đề:** Em dash `—` và dấu `.` hardcode inline, không phải phần của i18n string. Một số ngôn ngữ dùng dấu câu khác nhau.

**Gợi ý sửa:** Gộp dấu câu vào giá trị của `t.image_model_switched_body` trong từng locale file.

---

## Phần 3 — Split UI Component (skill `split-ui-component`)

### Phân loại component hiện có trong TranslatePage.tsx

| Component được dùng | Loại | Vị trí | Đánh giá |
|---|---|---|---|
| `ModelSelector` | Reusable | `src/components/` | ✅ Đúng chỗ |
| `LanguageSelector` | Reusable | `src/components/` | ✅ Đúng chỗ |
| `AutoTranslateToggle` | Reusable | `src/components/ui/` | ✅ Đúng chỗ |
| `PhoneticToggle` | Reusable | `src/components/ui/` | ✅ Đúng chỗ |
| `ClearButton` | Reusable | `src/components/ui/` | ✅ Đúng chỗ |
| `CopyButton` | Reusable | `src/components/ui/` | ✅ Đúng chỗ |
| `DownloadImageButton` | Reusable | `src/components/ui/` | ✅ Đúng chỗ |
| `ImageTranslateButton` | Reusable | `src/components/ui/` | ✅ Đúng chỗ |
| `RewriteButton` | Reusable | `src/components/ui/` | ✅ Đúng chỗ |
| `SpeakButton` | Reusable | `src/components/ui/` | ✅ Đúng chỗ |
| `TranslateButton` | Reusable | `src/components/ui/` | ✅ Đúng chỗ (giả định) |
| `DragOverlay` | Reusable | `src/components/ui/` | ✅ Đúng chỗ |
| `VoiceRecorder` | Reusable | `src/components/` | ✅ Đúng chỗ |
| `MarkdownEditor` | Reusable | `src/components/` | ✅ Đúng chỗ |
| `MarkdownText` | Reusable | `src/components/` | ✅ Đúng chỗ |
| `FuriganaText` | Reusable | `src/components/` | ✅ Đúng chỗ |
| `VoiceOverlay` | Feature-specific | `src/components/translate/` | ✅ Đúng chỗ |
| `ImageAttachmentPreview` | Feature-specific | `src/components/translate/` | ✅ Đúng chỗ |

**Icon check:** ✅ Không có SVG inline. Tất cả icon đều import từ `'../components/ui/icons'`:
- `AlertTriangleIcon`, `AutoDetectIcon`, `ChevronDownIcon`, `SpinnerIcon`, `SwapIcon`, `XIcon` — đều có trong registry.

**Emoji check:** ✅ Không dùng emoji làm icon.

---

### SPLIT-01 🟠 High — Sub-component Inline quá lớn: Toolbar (Style dropdown)

**File:** `src/pages/TranslatePage.tsx` — Lines 96–155 (~60 dòng)

**Mô tả:** Toàn bộ Toolbar row (ModelSelector + Style dropdown + AutoTranslateToggle + PhoneticToggle) được render inline trong page. Phần style dropdown chiếm 26 dòng, toàn bộ toolbar ~60 dòng.

**Phân loại:** Feature-specific (tham chiếu `translationStyle`, `setTranslationStyle`, `autoTranslate`, `showFurigana` từ feature hook)

**Gợi ý tách:**
```
src/components/translate/TranslateToolbar.tsx
```
```tsx
// Props interface:
interface TranslateToolbarProps {
  translationStyle: TranslationStyle
  onStyleChange: (style: TranslationStyle) => void
  autoTranslate: boolean
  onAutoTranslateChange: (v: boolean) => void
  showFurigana: boolean
  onShowFuriganaChange: (v: boolean) => void
  phoneticLabel: string
  // ... i18n labels
}
```

---

### SPLIT-02 🟠 High — Sub-component Inline quá lớn: Language Bar

**File:** `src/pages/TranslatePage.tsx` — Lines 157–194 (~38 dòng)

**Mô tả:** Language selection bar gồm auto-detect badge + swap button + target language selector. 38 dòng, feature-specific (dùng `handleSwapLanguages`, `detectedSourceLang`, `imageAttachment`).

**Phân loại:** Feature-specific

**Gợi ý tách:**
```
src/components/translate/TranslateLanguageBar.tsx
```
```tsx
interface TranslateLanguageBarProps {
  targetLang: string
  onTargetLangChange: (lang: string) => void
  detectedSourceLang: string | null
  canSwap: boolean
  isDetectingLang: boolean
  onSwap: () => void
  langAutoLabel: string
  langNames: Record<string, string>
  swapTitle: string
}
```

---

### SPLIT-03 🟠 High — Sub-component Inline quá lớn: Source Panel Actions (bottom bar)

**File:** `src/pages/TranslatePage.tsx` — Lines 245–327 (~82 dòng)

**Mô tả:** Bottom bar của source panel chứa TranslateButton, VoiceRecorder, ImageTranslateButton, hidden file input, char counter, SpeakButton, RewriteButton, ClearButton. 82 dòng, rõ ràng feature-specific.

**Phân loại:** Feature-specific

**Gợi ý tách:**
```
src/components/translate/SourcePanelActions.tsx
```

---

### SPLIT-04 🟠 High — Sub-component Inline quá lớn: Error Display Block

**File:** `src/pages/TranslatePage.tsx` — Lines 341–374 (~34 dòng)

**Mô tả:** Error display gồm icon + error message + dismiss button + action buttons (Retry, Open Settings). 34 dòng, vượt ngưỡng, feature-specific (gọi `setActivePage('settings')`).

**Phân loại:** Feature-specific

**Gợi ý tách:**
```
src/components/translate/TranslateError.tsx
```
```tsx
interface TranslateErrorProps {
  error: string
  canRetry: boolean
  isApiKeyError: boolean   // thay thế cho string matching (xem HC-01)
  onRetry: () => void
  onDismiss: () => void
  onOpenSettings: () => void
  // i18n labels...
}
```

---

### SPLIT-05 🟠 High — Sub-component Inline quá lớn: Result Panel Actions (bottom bar)

**File:** `src/pages/TranslatePage.tsx` — Lines 394–453 (~59 dòng)

**Mô tả:** Bottom bar của result panel chứa char count, SpeakButton, DownloadImageButton (×2), RewriteButton, CopyButton với nhiều điều kiện render. 59 dòng, feature-specific.

**Phân loại:** Feature-specific

**Gợi ý tách:**
```
src/components/translate/ResultPanelActions.tsx
```

---

### SPLIT-06 🟡 Medium — Sub-component Inline borderline: ImageSwitchToast

**File:** `src/pages/TranslatePage.tsx` — Lines 457–485 (~28 dòng)

**Mô tả:** Toast cảnh báo model switch khi image translate. 28 dòng — chạm ngưỡng 30. Hiện tại có thể giữ inline nhưng nên tách để dễ test và tái dùng.

**Phân loại:** Feature-specific

**Gợi ý tách (optional):**
```
src/components/translate/ImageSwitchToast.tsx
```

---

## Tóm tắt & Ưu tiên

### Top issues cần fix ngay (High)

| # | ID | Mô tả | Action |
|---|---|---|---|
| 1 | HC-01 | Error matching bằng hardcode string đa ngôn ngữ | Expose `isApiKeyError: boolean` từ hook, bỏ string matching |
| 2 | DUP-01 | `syncFromSource`/`syncFromTranslated` near duplicate | Tạo `makeSyncHandler` factory |
| 3 | SPLIT-03 | Source Panel Actions 82 dòng inline | Tách `SourcePanelActions.tsx` |
| 4 | SPLIT-05 | Result Panel Actions 59 dòng inline | Tách `ResultPanelActions.tsx` |
| 5 | SPLIT-01 | Toolbar 60 dòng inline | Tách `TranslateToolbar.tsx` |
| 6 | SPLIT-02 | Language Bar 38 dòng inline | Tách `TranslateLanguageBar.tsx` |
| 7 | SPLIT-04 | Error block 34 dòng inline | Tách `TranslateError.tsx` |

### Medium priority

| # | ID | Mô tả | Action |
|---|---|---|---|
| 8 | HC-02 | MIME types hardcode | Thêm `ACCEPTED_IMAGE_MIME_TYPES` vào `src/constants/image.ts` |
| 9 | HC-03 | `'en'` fallback lang hardcode | Thêm `DEFAULT_TTS_FALLBACK_LANG` vào constants |
| 10 | HC-04 | `"Using"` text không qua i18n | Thêm i18n key |
| 11 | HC-05 | `'Dịch'` fallback cho translate button | Đảm bảo `t.translate_btn` có trong mọi locale; bỏ fallback |
| 12 | DUP-02 | Bottom bar className lặp 2 lần | Define `PANEL_FOOTER_CLS` constant |

### Low priority

| # | ID | Mô tả | Action |
|---|---|---|---|
| 13 | HC-06 | `alt="Translated"` hardcode | Dùng `t.image_translate_title` |
| 14 | HC-07 | Dấu câu inline trong toast | Gộp vào i18n string |
| 15 | DUP-03 | SpeakButton props lặp | Gom khi extract panel components |
| 16 | DUP-04 | RewriteButton props lặp | Gom khi extract panel components |

---

## Kế hoạch Refactor Gợi ý

### Giai đoạn 1 — Nhanh (< 30 phút mỗi task)
1. **HC-01**: Thêm `isApiKeyError` vào `useTranslate.ts`, xóa 4 hardcode strings
2. **DUP-01**: Viết `makeSyncHandler`, thay 2 duplicate functions
3. **HC-02, HC-03, HC-05**: Thêm constants, 3 dòng sửa đơn giản

### Giai đoạn 2 — Extract components (có thể làm từng bước)
4. `TranslateError.tsx` (SPLIT-04) — nhỏ nhất, 34 dòng → nên làm trước
5. `TranslateLanguageBar.tsx` (SPLIT-02) — 38 dòng, ít dependency nhất
6. `TranslateToolbar.tsx` (SPLIT-01) — 60 dòng, dependency vừa
7. `SourcePanelActions.tsx` (SPLIT-03) + `ResultPanelActions.tsx` (SPLIT-05) — làm cùng lúc

### Sau refactor
- `TranslatePage.tsx` từ ~488 dòng → dự kiến còn ~150–180 dòng (chỉ layout skeleton + scroll sync)
- Các component mới đều testable riêng lẻ
- Error logic type-safe, không còn string matching fragile
