# Báo cáo Split UI Component

**File phân tích:** `src/pages/settings/BrowserIntegrationSection.tsx`  
**Ngày:** 19/04/2026  
**Workflow:** split-ui-component v1.0.0

---

## Tổng quan

File `BrowserIntegrationSection.tsx` hiện có **445 dòng** và chứa 2 components:
- `InlineErrorBox` — inline sub-component, 38 dòng (≥ 30 ngưỡng cần tách)
- `BrowserIntegrationSection` — main feature component, 366 dòng

Kết quả kiểm tra nhanh:
- ✅ **Không có SVG inline** (đã fix ở dup-hardcode pass trước)
- ✅ **Không có emoji dùng làm icon** trong JSX (emoji nằm trong i18n strings → false positive)
- ✅ **Không có UI pattern duplicate** còn lại
- ⚠️ **1 inline sub-component** vượt ngưỡng 30 dòng cần tách

---

## Bản đồ Component (Phân loại hiện trạng)

| Component | Loại | Vị trí hiện tại | Vị trí đúng | Ghi chú |
|---|---|---|---|---|
| `InlineErrorBox` | Cần tách 🔧 | `src/pages/settings/BrowserIntegrationSection.tsx:39` | `src/components/ui/InlineErrorBanner.tsx` | Reusable, 38 dòng, không dùng store |
| `BrowserIntegrationSection` | Feature-specific ✅ | `src/pages/settings/` | `src/pages/settings/` | Đúng vị trí — dùng `useAppStore`, `useT` |

---

## Vấn đề: SVG Icon Hardcode Inline

**Kết quả grep:**
```
grep -rn '<svg' src/pages/settings/BrowserIntegrationSection.tsx
→ (không có kết quả)
```

✅ **Không có vi phạm.** File đã sử dụng `GitHubIcon` từ `src/components/ui/icons/actions.tsx`.

---

## Vấn đề: Emoji dùng làm Icon

Các emoji trong file đều nằm trong **i18n string values** (qua `t.xxx` keys), không phải trong JSX trực tiếp:

```tsx
// Tất cả đều qua i18n → FALSE POSITIVE → BỎ QUA
{t.settings_token_expired}        // "🔴 Đã hết hạn"
{t.settings_token_days_warning}   // "⚠️ Còn {days} ngày..."
{t.settings_token_expires_label}  // "🔒 Expires:"
```

✅ **Không có vi phạm thực sự.**

---

## Vấn đề: UI Pattern Duplicate

Patterns trong file:
- Install steps: rendered bằng `.map()` → không phải duplicate
- Error boxes: đã gộp vào `<InlineErrorBox>` (fix D-1 từ dup-hardcode pass)
- Token list items: rendered trong `.map()` → không phải duplicate

✅ **Không có UI pattern duplicate còn lại.**

---

## Vấn đề: Sub-component Inline quá lớn

### S-1 🟡 Medium — `InlineErrorBox` inline trong settings file (38 dòng)

**Vị trí:** `BrowserIntegrationSection.tsx` dòng 39–76  
**Kích thước:** 38 dòng (vượt ngưỡng 30 dòng)

**Code trích dẫn:**
```tsx
// Line 39–76 (38 dòng)
function InlineErrorBox({
  message,
  onDismiss,
  retryLabel,
  onRetry,
}: {
  message: string
  onDismiss?: () => void
  retryLabel?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-red-600 ...">
      <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} ...>
          <XIcon className="w-3 h-3" />
        </button>
      )}
      {onRetry && retryLabel && (
        <button type="button" onClick={onRetry} ...>
          {retryLabel}
        </button>
      )}
    </div>
  )
}
```

**Vấn đề:** Component này:
- Không dùng `useAppStore()`, `useT()`, hay bất kỳ service nào
- Props hoàn toàn generic: `message`, `onDismiss`, `onRetry`, `retryLabel`
- Tên không có domain ("Error Box" vs "Token Error")
- Có thể tái sử dụng trong các settings section khác

→ **Phân loại: Reusable** — nên đặt trong `src/components/ui/`, không phải trong `src/pages/settings/`

**Gợi ý sửa:**

1. Tạo file `src/components/ui/InlineErrorBanner.tsx`:
```tsx
import { AlertTriangleIcon, XIcon } from './icons'

export interface InlineErrorBannerProps {
  message: string
  onDismiss?: () => void
  retryLabel?: string
  onRetry?: () => void
}

/** Inline error banner — displays an error with optional dismiss and retry actions. */
export function InlineErrorBanner({
  message, onDismiss, retryLabel, onRetry,
}: InlineErrorBannerProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400
                    bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2
                    border border-red-100 dark:border-red-900">
      <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss}
          className="p-0.5 hover:text-red-700 cursor-pointer">
          <XIcon className="w-3 h-3" />
        </button>
      )}
      {onRetry && retryLabel && (
        <button type="button" onClick={onRetry}
          className="underline font-medium cursor-pointer">
          {retryLabel}
        </button>
      )}
    </div>
  )
}
```

2. Cập nhật `BrowserIntegrationSection.tsx`:
```tsx
// Xóa InlineErrorBox inline function
// Thêm import:
import { InlineErrorBanner } from '../../components/ui/InlineErrorBanner'

// Đổi usage:
{tokenActionError && (
  <InlineErrorBanner
    message={tokenActionError}
    onDismiss={() => setTokenActionError('')}
  />
)}
{extTokensError && (
  <InlineErrorBanner
    message={extTokensError}
    retryLabel={t.settings_token_retry}
    onRetry={loadTokenList}
  />
)}
```

---

## Vấn đề: Component đặt sai thư mục

| Component | Vấn đề | Fix |
|---|---|---|
| `InlineErrorBox` | Reusable component đang nằm trong `src/pages/settings/` | Tách thành `src/components/ui/InlineErrorBanner.tsx` |

---

## Kế hoạch tách component (Action Plan)

| Ưu tiên | Action | File nguồn | File đích | Component mới |
|---|---|---|---|---|
| 🟡 Medium | Tách + di chuyển | `BrowserIntegrationSection.tsx:39–76` | `src/components/ui/InlineErrorBanner.tsx` | `InlineErrorBanner` |

**Bước thực hiện:**
```
1. Tạo src/components/ui/InlineErrorBanner.tsx
   → Copy và rename InlineErrorBox → InlineErrorBanner
   → Export named export + interface InlineErrorBannerProps

2. Cập nhật BrowserIntegrationSection.tsx
   → Xóa local InlineErrorBox function (lines 35-76)
   → Thêm import InlineErrorBanner
   → Đổi tên 2 usages trong JSX

3. Verify: npx tsc -p tsconfig.json --noEmit
```

---

## Tóm tắt & Ưu tiên

| Loại vấn đề | 🟠 High | 🟡 Medium | 🟢 Low | Tổng |
|---|---|---|---|---|
| SVG Icon Hardcode Inline | 0 | 0 | 0 | 0 |
| UI Pattern Duplicate | 0 | 0 | 0 | 0 |
| Sub-component Inline quá lớn | 0 | 1 | 0 | **1** |
| Component sai thư mục | 0 | 1 | 0 | **1** |
| Emoji dùng như Icon | 0 | 0 | 0 | 0 |
| **Tổng** | **0** | **2** | **0** | **2** |

> ℹ️ Cả 2 issues đều về cùng 1 component (`InlineErrorBox`) — fix 1 lần là xong cả 2.

**Nhận xét tổng thể:** File `BrowserIntegrationSection.tsx` đã được cải thiện đáng kể sau dup-hardcode pass (không còn SVG inline, không duplicate). Chỉ còn 1 việc nhỏ: tách `InlineErrorBox` ra thành `src/components/ui/InlineErrorBanner.tsx` để có thể tái dùng ở các settings section khác trong tương lai.
