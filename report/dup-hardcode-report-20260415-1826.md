# Báo cáo Duplicate Code & Hardcode
**Job**: Feature — Đính kèm ảnh trực tiếp (không qua popup)  
**Phạm vi**: `src/pages/TranslatePage.tsx`, `src/pages/ChatPage.tsx`  
**Workflow**: `check-dup-hardcode` v1.0.0  
**Ngày phát hiện**: 2026-04-15 18:26  
**Ngày fix**: 2026-04-15 18:35  
**Trạng thái**: ✅ Tất cả vấn đề đã được fix

---

## Tổng quan

| Loại vấn đề | Critical | High | Medium | Low | Tổng |
|---|---|---|---|---|---|
| Exact Duplicate | 0 | 0 | 0 | 0 | 0 |
| Near Duplicate | 0 | 0 | 1 | 0 | 1 |
| Structural Duplicate | 0 | 0 | 0 | 0 | 0 |
| Semantic Duplicate | 0 | 0 | 0 | 0 | 0 |
| Hardcode Credential | 0 | 0 | 0 | 0 | 0 |
| Magic Number | 0 | 0 | 0 | 0 | 0 |
| Magic String | 0 | 0 | 0 | 0 | 0 |
| Hardcode Config | 0 | 0 | 0 | 0 | 0 |
| Hardcode UI | 0 | 0 | 0 | 0 | 0 |
| Hardcode Icon | 0 | 1 | 0 | 0 | 1 |
| **Tổng** | **0** | **1** | **1** | **0** | **2** |

**File bị ảnh hưởng nhiều nhất**: Cả hai file đều bị ảnh hưởng bởi cùng 1 vấn đề.

---

## Duplicate Code

### DUP-01 — ~~🟡 Medium | Near Duplicate (Clone Type 2)~~ ✅ FIXED
**Fix**: Tách thành `src/components/translate/DragOverlay.tsx` (nhận props `label`, `zIndex`, `showRing`). Cả 2 page dùng chung `<DragOverlay>`.

**Vị trí**:
- `src/pages/TranslatePage.tsx` line ~472–490
- `src/pages/ChatPage.tsx` line ~420–446

**Code vi phạm** (TranslatePage.tsx):
```tsx
{isDraggingOver && (
  <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
    <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl
                    bg-white/90 dark:bg-gray-900/90 border-2 border-dashed border-emerald-400
                    shadow-lg">
      <svg className="w-8 h-8 text-emerald-500" viewBox="0 0 24 24" ...>
        <path ... d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5..." />
      </svg>
      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
        {t.image_translate_upload_hint.split('\n')[0]}
      </span>
    </div>
  </div>
)}
```

**Code vi phạm** (ChatPage.tsx):
```tsx
{isDraggingOver && (
  <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none
                  ring-2 ring-inset ring-emerald-300 dark:ring-emerald-700">
    <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl
                    bg-white/90 dark:bg-gray-900/90 border-2 border-dashed border-emerald-400
                    shadow-lg">
      <svg className="w-8 h-8 text-emerald-500" viewBox="0 0 24 24" ...>
        <path ... d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5..." />
      </svg>
      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
        {t.chat_attach_image}
      </span>
    </div>
  </div>
)}
```

**Phân tích**: Inner card `<div>` (rounded-2xl + svg + span) gần như giống nhau hoàn toàn, chỉ khác:
1. `z-30` vs `z-50 ring-2 ring-inset ...` ở wrapper div
2. Text label (`t.image_translate_upload_hint.split('\n')[0]` vs `t.chat_attach_image`)

**Gợi ý sửa**: Tách thành shared component `DragOverlay`:
```tsx
// src/components/translate/DragOverlay.tsx
interface DragOverlayProps {
  label: string
  zIndex?: string  // 'z-30' | 'z-50'
  showRing?: boolean
}

export function DragOverlay({ label, zIndex = 'z-30', showRing = false }: DragOverlayProps) {
  return (
    <div className={`absolute inset-0 ${zIndex} flex items-center justify-center pointer-events-none
                     ${showRing ? 'ring-2 ring-inset ring-emerald-300 dark:ring-emerald-700' : ''}`}>
      <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl
                      bg-white/90 dark:bg-gray-900/90 border-2 border-dashed border-emerald-400 shadow-lg">
        <UploadIcon className="w-8 h-8 text-emerald-500" />
        <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{label}</span>
      </div>
    </div>
  )
}
```

---

## Hardcode

### HC-01 — ~~🟠 High | Hardcode Icon~~ ✅ FIXED
**Fix**: Tạo `UploadIcon` trong `src/components/ui/icons/actions.tsx`, export qua `index.ts`. `DragOverlay` component dùng `<UploadIcon>` thay vì inline SVG.

**Vị trí**:
- `src/pages/TranslatePage.tsx` line 481–486
- `src/pages/ChatPage.tsx` line ~432–438

**Code vi phạm** (giống nhau ở cả 2 file):
```tsx
<svg className="w-8 h-8 text-emerald-500" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
  <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
</svg>
```

**Phân tích**: Icon này là **Heroicons `arrow-up-tray`** (upload icon), được hardcode trực tiếp dưới dạng inline `<svg>` thay vì dùng/tạo icon component tại `src/components/ui/icons/`. Kiểm tra `src/components/ui/icons/actions.tsx` — **chưa có `UploadIcon`**.

**Gợi ý sửa**:

**Bước 1**: Tạo `UploadIcon` trong `src/components/ui/icons/actions.tsx`:
```tsx
/** Upload / arrow-up-tray icon — used on drag-drop zone overlays. */
export function UploadIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  )
}
```

**Bước 2**: Update `src/components/ui/icons/index.ts` barrel comment để ghi nhận `upload` trong category `actions`.

**Bước 3**: Thay thế inline SVG trong TranslatePage.tsx và ChatPage.tsx:
```tsx
// Trước:
<svg className="w-8 h-8 text-emerald-500" viewBox="0 0 24 24" ...>...</svg>

// Sau:
<UploadIcon className="w-8 h-8 text-emerald-500" />
```

---

## Tóm tắt & Ưu tiên

| # | Severity | Vấn đề | File | Trạng thái |
|---|---|---|---|---|
| 1 | ~~🟠 High~~ | ~~Hardcode Icon — inline SVG upload~~ | TranslatePage.tsx, ChatPage.tsx | ✅ Fixed |
| 2 | ~~🟡 Medium~~ | ~~Near Duplicate — drop overlay JSX~~ | TranslatePage.tsx, ChatPage.tsx | ✅ Fixed |

## Files đã thay đổi sau fix

| File | Thay đổi |
|---|---|
| `src/components/ui/icons/actions.tsx` | Thêm `UploadIcon` |
| `src/components/ui/icons/index.ts` | Cập nhật barrel comment |
| `src/components/translate/DragOverlay.tsx` | Tạo mới shared component |
| `src/pages/TranslatePage.tsx` | Dùng `<DragOverlay>` thay inline SVG |
| `src/pages/ChatPage.tsx` | Dùng `<DragOverlay>` thay inline SVG |

**Kết quả**: `tsc --noEmit` exit:0 · 34 tests pass · Không còn inline SVG ngoài icon registry.
