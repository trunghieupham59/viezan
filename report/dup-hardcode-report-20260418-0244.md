# Báo cáo Duplicate & Hardcode
**File kiểm tra:** `src/pages/__tests__/TranslatePage.test.tsx`
**Ngày:** 2026-04-18 02:44
**Workflow:** check-dup-hardcode v1.0.0

---

## Tổng quan

| Chỉ số | Giá trị |
|---|---|
| File kiểm tra | 1 |
| Tổng dòng code | 131 |
| Tổng vấn đề tìm được | 8 |
| Critical 🔴 | 0 |
| High 🟠 | 5 |
| Medium 🟡 | 2 |
| Low 🟢 | 1 |

---

## Duplicate Code

### DUP-01 — 🟠 High | Near Duplicate: `act(() => { useAppStore.setState({...}) })` lặp 4 lần

**Loại:** Near Duplicate (Clone Type 2)
**Vị trí:**
- `L76–78` — setState `translateError`
- `L93–95` — setState `sourceText: 'Hello world'`
- `L109–111` — setState `sourceText: 'Some text to translate'`
- `L120–122` — setState `sourceText: 'Hello'`

**Code trích dẫn:**
```ts
// L76-78
act(() => {
  useAppStore.setState({ translateError: 'API key invalid' })
})

// L93-95
act(() => {
  useAppStore.setState({ sourceText: 'Hello world' })
})

// L109-111
act(() => {
  useAppStore.setState({ sourceText: 'Some text to translate' })
})

// L120-122
act(() => {
  useAppStore.setState({ sourceText: 'Hello' })
})
```

**Giải thích:** Wrapper `act(() => { useAppStore.setState({...}) })` lặp lại 4 lần chỉ khác phần state bên trong. Nếu cần thêm side-effect (ví dụ: flush timers, await) phải sửa 4 chỗ.

**Gợi ý sửa:** Extract helper function dùng chung trong file test:
```ts
// Thêm ở đầu file, sau imports
function setStore(patch: Partial<Parameters<typeof useAppStore.setState>[0]>) {
  act(() => { useAppStore.setState(patch) })
}

// Dùng lại trong test:
setStore({ translateError: 'API key invalid' })
setStore({ sourceText: 'Hello world' })
setStore({ sourceText: 'Some text to translate' })
setStore({ sourceText: 'Hello' })
```

---

### DUP-02 — 🟢 Low | Semantic Duplicate: Regex `getByTitle` lặp 2 lần

**Loại:** Semantic Duplicate (Clone Type 4)
**Vị trí:**
- `L44` — `screen.getByTitle(/Tự động dịch|Dịch thủ công|Auto|Manual/i)`
- `L52` — `screen.getByTitle(/Tự động dịch|Dịch thủ công|Auto|Manual/i)`

**Code trích dẫn:**
```ts
// L44
const manualBtn = screen.getByTitle(/Tự động dịch|Dịch thủ công|Auto|Manual/i)

// L52
const toggle = screen.getByTitle(/Tự động dịch|Dịch thủ công|Auto|Manual/i)
```

**Giải thích:** Cùng một regex được viết lại hai lần trong hai test liên tiếp. Nếu title của toggle thay đổi, phải sửa 2 chỗ.

**Gợi ý sửa:** Extract thành constant ở đầu file test:
```ts
const AUTO_MANUAL_TOGGLE_TITLE = /Tự động dịch|Dịch thủ công|Auto|Manual/i

// Dùng lại:
const manualBtn = screen.getByTitle(AUTO_MANUAL_TOGGLE_TITLE)
const toggle = screen.getByTitle(AUTO_MANUAL_TOGGLE_TITLE)
```

---

## Hardcode

### HC-01 — 🟠 High | Magic String (CSS selector): `.text-gray-300, .text-gray-700`

**Loại:** Magic String
**Vị trí:** `L62`

**Code trích dẫn:**
```ts
const placeholders = document.querySelectorAll('.text-gray-300, .text-gray-700')
```

**Giải thích:** Tailwind utility class được dùng làm test selector. Coupling chặt giữa test và implementation: nếu class thay đổi (ví dụ: đổi sang `text-gray-400` hay thêm dark mode class), test vẫn pass mà không phát hiện sự thay đổi, hoặc ngược lại fail không đúng lý do. Testing Library khuyến nghị dùng semantic queries (`getByText`, `getByRole`) hoặc `data-testid`.

**Gợi ý sửa:**
```ts
// Trước:
const placeholders = document.querySelectorAll('.text-gray-300, .text-gray-700')
expect(placeholders.length).toBeGreaterThan(0)

// Sau — query bằng text content thực tế:
// (import t từ i18n hoặc dùng regex)
expect(screen.getByText(/Translation will appear here|Bản dịch sẽ hiển thị/i)).toBeInTheDocument()
```

---

### HC-02 — 🟠 High | Magic String (CSS selector): `.flex-1.basis-0`

**Loại:** Magic String
**Vị trí:** `L70`

**Code trích dẫn:**
```ts
const panels = document.querySelectorAll('.flex-1.basis-0')
expect(panels.length).toBeGreaterThanOrEqual(2)
```

**Giải thích:** Layout class `flex-1 basis-0` là implementation detail của Tailwind layout. Test này sẽ fail nếu layout được refactor (dù UI vẫn đúng), và không thực sự kiểm tra chức năng. Nên dùng `aria-label` để query panel.

**Gợi ý sửa:**
```ts
// Thêm aria-label vào result panel trong TranslatePage.tsx:
// <div aria-label="result-panel" ...>

// Trong test:
const panels = screen.getAllByRole('region') // hoặc dùng aria-label
expect(panels.length).toBeGreaterThanOrEqual(2)
```

---

### HC-03 — 🟠 High | Magic String (CSS selector): `.btn-ghost` (2 lần)

**Loại:** Magic String
**Vị trí:** `L105`, `L114`

**Code trích dẫn:**
```ts
// L105
expect(document.querySelector('.btn-ghost')).toBeNull()

// L114
expect(document.querySelector('.btn-ghost')).not.toBeNull()
```

**Giải thích:** CSS utility class `btn-ghost` dùng làm selector trong 2 test. Nếu ClearButton đổi class (ví dụ: refactor từ `btn-ghost` sang `btn-secondary` hay dùng Tailwind trực tiếp), cả 2 test sẽ fail mà không liên quan đến chức năng.

**Gợi ý sửa:**
```ts
// Thêm aria-label vào ClearButton, hoặc dùng text:
const clearBtn = screen.queryByLabelText(/clear|xóa/i)
// hoặc:
const clearBtn = screen.queryByTitle(/Clear|Xóa/i)

expect(clearBtn).toBeNull()    // L105
expect(clearBtn).not.toBeNull() // L114
```

---

### HC-04 — 🟠 High | Magic String (CSS selector): `.tabular-nums`

**Loại:** Magic String
**Vị trí:** `L125`

**Code trích dẫn:**
```ts
const counter = document.querySelector('.tabular-nums')
expect(counter).not.toBeNull()
expect(counter?.textContent).toMatch(/5/)
```

**Giải thích:** `.tabular-nums` là Tailwind typography class dùng làm selector. Fragile: counter có thể giữ `tabular-nums` hoặc không tùy design, không liên quan đến chức năng đếm ký tự.

**Gợi ý sửa:**
```ts
// Thêm data-testid="char-counter" vào span counter trong TranslatePage:
// <span data-testid="char-counter" className="text-xs tabular-nums ...">

// Trong test:
const counter = screen.getByTestId('char-counter')
expect(counter.textContent).toMatch(/5/)
```

---

### HC-05 — 🟡 Medium | Hardcode Config: Model IDs và Provider không dùng constants

**Loại:** Hardcode Configuration
**Vị trí:** `L20–21` (trong `beforeEach`)

**Code trích dẫn:**
```ts
keyStatus: { gemini: true, claude: false, openai: false },
selectedProvider: 'gemini',
selectedModels: {
  gemini: 'gemini-2.0-flash',          // ← hardcoded, không còn là recommended
  claude: 'claude-3-5-haiku-20241022', // ← hardcoded
  openai: 'gpt-4o'                     // ← hardcoded, không phải recommended (gpt-4o-mini)
},
```

**Giải thích:**
1. `'gemini-2.0-flash'` không còn là model recommended của Gemini (hiện tại là `gemini-2.5-flash-preview-04-17` theo `providers.ts`). Test state đã lệch với defaults thực tế.
2. `'gpt-4o'` không phải recommended của OpenAI (là `gpt-4o-mini`).
3. `'gemini'` là `selectedProvider` — nên dùng `DEFAULT_SETTINGS.defaultProvider`.
4. Nếu model defaults thay đổi trong `providers.ts`, test state sẽ không được cập nhật tự động.

**Gợi ý sửa:**
```ts
import { DEFAULT_SETTINGS, getRecommendedModel } from '../../constants/providers'

beforeEach(() => {
  act(() => {
    useAppStore.setState({
      sourceText: '',
      translatedText: '',
      phoneticText: '',
      sourceLang: 'auto',
      targetLang: DEFAULT_SETTINGS.defaultTargetLang,   // 'vi'
      isTranslating: false,
      translateError: null,
      autoTranslate: false,
      keyStatus: { gemini: true, claude: false, openai: false },
      selectedProvider: DEFAULT_SETTINGS.defaultProvider, // 'gemini'
      selectedModels: {
        gemini: getRecommendedModel('gemini'),   // tự động lấy recommended
        claude: getRecommendedModel('claude'),
        openai: getRecommendedModel('openai'),
      },
      showFurigana: false,
      translationStyle: 'neutral',
    })
  })
})
```

---

## Tóm tắt & Ưu tiên

| Loại vấn đề | Critical 🔴 | High 🟠 | Medium 🟡 | Low 🟢 | Tổng |
|---|---|---|---|---|---|
| Exact Duplicate | 0 | 0 | 0 | 0 | 0 |
| Near Duplicate | 0 | 1 | 0 | 0 | **1** |
| Structural Duplicate | 0 | 0 | 0 | 0 | 0 |
| Semantic Duplicate | 0 | 0 | 0 | 1 | **1** |
| Hardcode Credential | 0 | 0 | 0 | 0 | 0 |
| Magic Number | 0 | 0 | 0 | 0 | 0 |
| Magic String (CSS selector) | 0 | 4 | 0 | 0 | **4** |
| Hardcode Config | 0 | 0 | 2 | 0 | **2** |
| Hardcode UI | 0 | 0 | 0 | 0 | 0 |
| Hardcode Icon | 0 | 0 | 0 | 0 | 0 |
| **Tổng** | **0** | **5** | **2** | **1** | **8** |

**Top 3 vấn đề ưu tiên sửa:**
1. **HC-01/02/03/04** — 4 CSS class selectors dùng làm test query → fragile tests, tách biệt khỏi chức năng thực
2. **DUP-01** — `act(() => setState)` lặp 4 lần → extract helper `setStore()`
3. **HC-05** — Model IDs hardcoded thay vì dùng `DEFAULT_SETTINGS` / `getRecommendedModel()` → test state lệch với codebase thực tế

---

## Kế hoạch refactor gợi ý

### Bước 1 — Fix HC-05 (Model IDs) — ~10 phút, ảnh hưởng lớn nhất về độ chính xác
```ts
import { DEFAULT_SETTINGS, getRecommendedModel } from '../../constants/providers'
// Thay selectedProvider và selectedModels trong beforeEach
```

### Bước 2 — Fix DUP-01 (setState helper) — ~5 phút
```ts
// Thêm helper function setStore() và refactor 4 test case
```

### Bước 3 — Fix HC-03 (.btn-ghost) — ~15 phút, cần thêm aria-label
```ts
// Thêm aria-label hoặc title vào ClearButton, dùng screen.queryByTitle() trong test
```

### Bước 4 — Fix HC-04 (.tabular-nums) — ~10 phút, cần thêm data-testid
```ts
// Thêm data-testid="char-counter" vào span counter trong TranslatePage
```

### Bước 5 — Fix HC-01/HC-02 (placeholder + panel selectors) — ~15 phút
```ts
// HC-01: Dùng screen.getByText() với i18n string
// HC-02: Thêm aria-label="result-panel" hoặc dùng getByRole()
```

### Bước 6 — Fix DUP-02 (regex constant) — ~2 phút
```ts
const AUTO_MANUAL_TOGGLE_TITLE = /Tự động dịch|Dịch thủ công|Auto|Manual/i
```
