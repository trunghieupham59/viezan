# Báo cáo Score Code
**Job**: Feature — Đính kèm ảnh trực tiếp (không qua popup)  
**Phạm vi**: `src/pages/TranslatePage.tsx`, `src/pages/ChatPage.tsx`  
**Workflow**: `score-code` v1.0.0  
**Loại dự án**: `project` (React + Electron app)  
**Ngày đánh giá**: 2026-04-15 18:26  
**Ngày fix**: 2026-04-15 18:35  
**Trạng thái**: ✅ Các vấn đề ưu tiên đã được fix

---

## Bảng điểm — Trước fix

| Tiêu chí | Trọng số | Điểm thô (/100) | Điểm đạt | Nhận xét tóm tắt |
|---|---|---|---|---|
| Correctness | 25% | 88 | 22.0 | Đúng spec, xử lý edge case tốt |
| Architecture | 15% | 82 | 12.3 | Phân tầng đúng, còn inline JSX duplicate |
| Code Quality | 15% | 74 | 11.1 | Naming tốt, nhưng có hardcode icon |
| Maintainability | 15% | 74 | 11.1 | Cần refactor drop overlay thành component |
| Testing | 10% | 30 | 3.0 | Không có unit test mới |
| Performance | 10% | 74 | 7.4 | ChatPage thiếu `useCallback` trên drag handlers |
| Security | 5% | 90 | 4.5 | Validate file type đúng, không lộ secret |
| Documentation | 5% | 82 | 4.1 | Comment đủ, JSDoc trên processImageFile |
| **TỔNG** | **100%** | — | **75.5 / 100** | |

## Bảng điểm — Sau fix (2026-04-15 18:35)

| Tiêu chí | Trọng số | Điểm thô (/100) | Điểm đạt | Thay đổi | Nhận xét |
|---|---|---|---|---|---|
| Correctness | 25% | 88 | 22.0 | — | Không thay đổi |
| Architecture | 15% | 92 | 13.8 | ↑ +1.5 | DragOverlay component giải quyết duplicate JSX |
| Code Quality | 15% | 90 | 13.5 | ↑ +2.4 | UploadIcon trong registry, không còn inline SVG |
| Maintainability | 15% | 88 | 13.2 | ↑ +2.1 | DragOverlay tập trung, sửa 1 chỗ ảnh hưởng cả 2 page |
| Testing | 10% | 30 | 3.0 | — | Không thay đổi |
| Performance | 10% | 90 | 9.0 | ↑ +1.6 | Tất cả handlers trong ChatPage đều dùng `useCallback` |
| Security | 5% | 90 | 4.5 | — | Không thay đổi |
| Documentation | 5% | 85 | 4.25 | ↑ +0.15 | DragOverlay có JSDoc đầy đủ với `@default` annotations |
| **TỔNG** | **100%** | — | **83.25 / 100** | **↑ +7.75** | |

---

## Chi tiết từng tiêu chí

### 1. Correctness — 88/100 → 22.0 điểm

**Điểm mạnh**:
- ✅ Click → file picker: dùng `useRef<HTMLInputElement>` + `fileInputRef.current?.click()`, đúng pattern
- ✅ Validation file type: `if (!file.type.startsWith('image/'))` → báo lỗi ngay, không silent fail
- ✅ Reset input: `e.target.value = ''` cho phép chọn lại cùng 1 file
- ✅ `handleSourcePanelDragLeave` dùng `e.currentTarget.contains(e.relatedTarget as Node)` — tránh false trigger khi drag qua child element
- ✅ `processImageFile` reset đủ tất cả state liên quan: `imageRegions`, `editedImageUrl`, `translatedText`, `phoneticText`, `translateError`
- ✅ Error từ `resizeImageFile` được catch và hiển thị qua `setTranslateError`

**Điểm trừ**:
- ⚠️ (−12) `handleImageSelect` trong ChatPage không kiểm tra `file.type.startsWith('image/')` trực tiếp — chỉ drop handler có check. Với file picker (`accept="image/*"`), browser filter đã đủ nhưng thiếu defensive check nhất quán với drop handler.

---

### 2. Architecture — 82/100 → 12.3 điểm

**Điểm mạnh**:
- ✅ UI layer giữ đúng vai trò: drag/drop handlers ở page component, không leak xuống service
- ✅ Image processing hoàn toàn delegate xuống `resizeImageFile` utility (đúng layer)
- ✅ Không có circular dependency mới
- ✅ `processImageFile` là pure callback, không có side effect ẩn ngoài state update

**Điểm trừ**:
- ⚠️ (−18) Drop overlay JSX block gần như giống nhau ở 2 page nhưng không được abstract thành component dùng chung — nếu design thay đổi phải sửa 2 chỗ. Nên extract thành `DragOverlay` component theo cấu trúc `src/components/translate/`.

---

### 3. Code Quality — 74/100 → 11.1 điểm

**Điểm mạnh**:
- ✅ Naming rõ nghĩa: `processImageFile`, `handleFileInputChange`, `handleSourcePanelDragOver`, `handleSourcePanelDragLeave`, `handleSourcePanelDrop`, `isDraggingOver`, `fileInputRef`
- ✅ Mỗi callback chỉ làm 1 việc (Single Responsibility)
- ✅ `useCallback` dùng đúng ở TranslatePage cho tất cả drag handlers
- ✅ Không có magic number mới
- ✅ i18n: dùng `t.image_translate_type_error`, `t.chat_attach_image` thay vì hard-code string

**Điểm trừ**:
- 🟠 (−20) **Hardcode Icon**: Inline `<svg>` với path `M3 16.5v2.25...` trong cả 2 file vi phạm quy tắc icon registry. Phải tạo `UploadIcon` trong `src/components/ui/icons/actions.tsx` (xem chi tiết tại dup-hardcode-report).
- ⚠️ (−6) `handleFileDrop` và `handleDragLeave` trong ChatPage là regular arrow function (không có `useCallback`) — inconsistent với TranslatePage pattern.

---

### 4. Maintainability — 74/100 → 11.1 điểm

**Điểm mạnh**:
- ✅ `processImageFile` và drag handlers có thể test/mock độc lập
- ✅ `isDraggingOver` state tên rõ ràng, không dùng boolean magic
- ✅ Comment giải thích intent: `// Only clear when leaving the panel itself, not a child element`
- ✅ `fileInputRef` scoped đúng trong component, không leak ra ngoài

**Điểm trừ**:
- ⚠️ (−18) Drop overlay JSX + icon SVG phải update ở 2 file nếu visual thay đổi → coupling rõ ràng. Giải pháp: tách `DragOverlay` component + `UploadIcon`.
- ⚠️ (−8) ChatPage: thiếu `useCallback` trên `handleFileDrop` và `handleDragLeave` — không nhất quán với pattern của TranslatePage.

---

### 5. Testing — 30/100 → 3.0 điểm

**Bằng chứng**:
- ❌ Không có unit test mới cho `processImageFile`, `handleSourcePanelDrop`, `handleDragLeave`
- ✅ Existing 34 tests vẫn pass (không regression)
- ✅ Logic drag-drop khó test trong jsdom, nhưng `processImageFile` (pure async function với mock) hoàn toàn testable

**Gợi ý**:
```ts
// Ví dụ test có thể viết cho processImageFile:
it('should reject non-image file and set error', async () => {
  const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
  // ... mock setTranslateError và verify nó được gọi
})
```

---

### 6. Performance — 74/100 → 7.4 điểm

**Điểm mạnh**:
- ✅ TranslatePage: tất cả 3 drag handlers wrap trong `useCallback` — không tạo hàm mới mỗi render
- ✅ `isDraggingOver` state update chỉ khi cần thiết (`dragLeave` kiểm tra `contains` trước khi set false)
- ✅ `processImageFile` wrap trong `useCallback` với deps array đúng

**Điểm trừ**:
- 🟡 (−26) **ChatPage**: `handleFileDrop` và `handleDragLeave` là regular arrow function, được recreate mỗi render. Không critical với component này nhưng inconsistent với TranslatePage pattern và là tech debt nhỏ.

```tsx
// ChatPage — cần sửa thành:
const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
  ...
}, [handleImageSelect, t])

const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
  ...
}, [])
```

---

### 7. Security — 90/100 → 4.5 điểm

**Điểm mạnh**:
- ✅ `file.type.startsWith('image/')` validate loại file trước khi process
- ✅ `accept="image/jpeg,image/png,image/webp,image/gif"` giới hạn ở file picker level
- ✅ Không có secret, API key, hay sensitive data trong code mới
- ✅ Image preview dùng data URL (`src={previewUrl}`) — không có XSS risk vì không dùng `innerHTML`
- ✅ Error message không leak stack trace ra UI

**Điểm trừ nhỏ**:
- ⚠️ (−10) Không validate file size trước khi resize — `resizeImageFile` chỉ compress nhưng không có size ceiling check ở UI layer trước khi gọi.

---

### 8. Documentation — 82/100 → 4.1 điểm

**Điểm mạnh**:
- ✅ JSDoc trên `processImageFile`: `/** Process an image File: resize, convert to base64, attach to translate area */`
- ✅ State comments: `// Drag-over state for source panel drop zone visual feedback`, `// Ref to hidden file input — triggered when user clicks the image icon`
- ✅ Inline comment giải thích DragLeave logic: `// Only clear when leaving the panel itself, not a child element`
- ✅ Inline comment: `// Reset input so the same file can be re-selected`
- ✅ JSX comment: `{/* Image translation button — opens native file picker directly */}`

**Điểm trừ**:
- ⚠️ (−18) Không có comment giải thích tại sao `useCallback` không dùng trên `handleFileDrop`/`handleDragLeave` trong ChatPage (inconsistency không có lý do documented).

---

## Điểm mạnh tổng thể

1. **Logic đúng spec**: Click mở file picker trực tiếp, kéo thả hoạt động đúng, biome/tsc không có lỗi
2. **Naming nhất quán**: Tất cả tên biến/hàm rõ nghĩa, theo camelCase đúng convention
3. **Error handling đủ**: Tất cả async operations có try/catch, không silent fail
4. **State reset đầy đủ**: Khi gắn ảnh mới, tất cả state liên quan (regions, editedImageUrl, translatedText...) đều được reset
5. **DragLeave edge case**: Xử lý đúng vấn đề `onDragLeave` bị trigger khi drag qua child element

## Điểm cần cải thiện (ưu tiên)

| # | Mức độ | Vấn đề | Trạng thái |
|---|---|---|---|
| 1 | High | Tạo `UploadIcon` trong icon registry, xóa inline SVG | ✅ Fixed |
| 2 | Medium | Thêm `useCallback` cho drag handlers trong ChatPage | ✅ Fixed |
| 3 | Medium | Tách `DragOverlay` component dùng chung | ✅ Fixed |
| 4 | Low | Thêm unit test cho `processImageFile` | ⏳ Chưa fix (low priority) |

---

## Kiểm tra không chồng chéo tiêu chí

- **Correctness** ↔ **Code Quality**: Correctness chấm logic đúng/sai; Code Quality chấm cách viết → ✅ không trùng
- **Architecture** ↔ **Structure**: Job này chỉ thêm logic vào 2 page hiện có, không tạo cấu trúc mới → Structure không được chấm riêng (merged vào Architecture)
- **Maintainability** ↔ **Architecture**: Maintainability chấm khả năng sửa/mở rộng; Architecture chấm thiết kế tổng thể → ✅ không trùng
- **Security** ↔ **Reliability**: Security chấm file type validation; Reliability không được chấm riêng vì chồng với Correctness ở scope nhỏ này → ✅ không trùng
