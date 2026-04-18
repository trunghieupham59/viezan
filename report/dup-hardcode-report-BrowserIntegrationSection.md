# Báo cáo Duplicate & Hardcode

**File:** `src/pages/settings/BrowserIntegrationSection.tsx`  
**Ngày:** 19/04/2026  
**Workflow:** check-dup-hardcode v1.0.0

---

## Tổng quan

| Loại vấn đề | Critical | High | Medium | Low | Tổng |
|---|---|---|---|---|---|
| Exact Duplicate | 0 | 0 | 0 | 0 | 0 |
| Near Duplicate | 0 | 1 | 0 | 0 | 1 |
| Structural Duplicate | 0 | 0 | 1 | 0 | 1 |
| Semantic Duplicate | 0 | 0 | 0 | 0 | 0 |
| Hardcode Credential | 0 | 0 | 0 | 0 | 0 |
| Magic Number | 0 | 0 | 3 | 1 | 4 |
| Magic String | 0 | 0 | 0 | 1 | 1 |
| Hardcode Config | 0 | 1 | 0 | 0 | 1 |
| Hardcode UI | 0 | 0 | 0 | 2 | 2 |
| Hardcode Icon | 0 | 1 | 0 | 0 | 1 |
| **Tổng** | **0** | **3** | **4** | **4** | **11** |

---

## Duplicate Code

### D-1 🟠 High — Near Duplicate: Error display blocks

**Loại:** Near Duplicate (Clone Type 2)  
**Vị trí:**
- Block 1 — `tokenActionError`: dòng ~225–233
- Block 2 — `extTokensError`: dòng ~236–244

**Code trích dẫn — Block 1:**
```tsx
{tokenActionError && (
  <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2 border border-red-100 dark:border-red-900">
    <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
    <span className="flex-1">{tokenActionError}</span>
    <button type="button" onClick={() => setTokenActionError('')} ...>
      <XIcon className="w-3 h-3" />
    </button>
  </div>
)}
```

**Code trích dẫn — Block 2:**
```tsx
{extTokensError && (
  <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2 border border-red-100 dark:border-red-900">
    <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
    <span className="flex-1">{extTokensError}</span>
    <button type="button" onClick={loadTokenList} ...>{t.settings_token_retry}</button>
  </div>
)}
```

**Vấn đề:** Hai block có cùng cấu trúc HTML/CSS hoàn toàn giống nhau, chỉ khác `message` và `action button`. Nếu cần thay đổi style error box phải sửa 2 nơi.

**Gợi ý sửa:** Tạo component `<InlineErrorBox>` hoặc `<TokenErrorBanner>`:
```tsx
function InlineErrorBox({ message, onDismiss, retryLabel, onRetry }: {
  message: string
  onDismiss?: () => void
  retryLabel?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2 border border-red-100 dark:border-red-900">
      <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="p-0.5 hover:text-red-700 cursor-pointer">
          <XIcon className="w-3 h-3" />
        </button>
      )}
      {onRetry && retryLabel && (
        <button type="button" onClick={onRetry} className="underline font-medium cursor-pointer">{retryLabel}</button>
      )}
    </div>
  )
}

// Usage:
{tokenActionError && <InlineErrorBox message={tokenActionError} onDismiss={() => setTokenActionError('')} />}
{extTokensError && <InlineErrorBox message={extTokensError} retryLabel={t.settings_token_retry} onRetry={loadTokenList} />}
```

---

### D-2 🟡 Medium — Structural Duplicate: Token mutation handlers

**Loại:** Structural Duplicate (Clone Type 3)  
**Vị trí:**
- `handleCreateToken`: dòng ~57–73
- `handleDeleteToken`: dòng ~75–84
- `handleRegenerateToken`: dòng ~86–97

**Pattern lặp lại trong cả 3 hàm:**
```tsx
async function handleXxx() {
  if (!window.api?.localServer) return   // ← lặp
  setXxxLoading(id)                      // ← lặp
  setTokenActionError('')                // ← lặp
  try {
    const res = await window.api.localServer.xxxToken(...)
    // ... handle success
  } catch (e) {
    setTokenActionError(e instanceof Error ? e.message : t.xxx_error)  // ← lặp
  } finally { setXxxLoading(null) }      // ← lặp
}
```

**Vấn đề:** Error handling và guard check bị lặp 3 lần. Nếu cần thay đổi cách report lỗi phải sửa 3 chỗ.

**Gợi ý sửa:** Higher-order function hoặc helper:
```tsx
async function withTokenAction<T>(
  action: () => Promise<T>,
  setLoading: (v: boolean) => void
): Promise<T | null> {
  if (!window.api?.localServer) return null
  setLoading(true)
  setTokenActionError('')
  try {
    return await action()
  } catch (e) {
    setTokenActionError(e instanceof Error ? e.message : String(e))
    return null
  } finally {
    setLoading(false)
  }
}
```

---

## Hardcode

### H-1 🟠 High — Hardcode Icon: GitHub SVG inline

**Loại:** Hardcode Icon  
**Vị trí:** dòng ~125–146

**Code trích dẫn:**
```tsx
<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
           0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94..."/>
</svg>
```

**Vấn đề:** GitHub logo SVG được inline trực tiếp, vi phạm quy tắc icon registry. Không có `GitHubIcon` trong `src/components/ui/icons/`.

**Gợi ý sửa:**
1. Tạo `GitHubIcon` trong `src/components/ui/icons/actions.tsx`:
```tsx
/** GitHub mark icon — used on download/release links. */
export function GitHubIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
               0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
               -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
               .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
               -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27
               .68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
               .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
               0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  )
}
```
2. Export qua `src/components/ui/icons/index.ts`
3. Import và dùng: `<GitHubIcon />`

---

### H-2 🟠 High — Hardcode Config: GitHub releases URL

**Loại:** Hardcode Config  
**Vị trí:** dòng ~121

**Code trích dẫn:**
```tsx
onClick={() => window.api?.openExternal('https://github.com/trunghieupham59/T.R.E-Assistant/releases/latest')}
```

**Vấn đề:** URL GitHub releases được ghi cứng. Nếu repo đổi tên phải tìm và sửa khắp code.

**Gợi ý sửa:**
```tsx
// src/constants/urls.ts (tạo mới hoặc thêm vào file constants hiện có)
export const GITHUB_RELEASES_URL = 'https://github.com/trunghieupham59/T.R.E-Assistant/releases/latest'

// Usage:
import { GITHUB_RELEASES_URL } from '../../constants/urls'
onClick={() => window.api?.openExternal(GITHUB_RELEASES_URL)}
```

---

### H-3 🟡 Medium — Magic Number: Default TTL days `30`

**Loại:** Magic Number  
**Vị trí:** dòng ~29 và ~70, ~78

**Code trích dẫn:**
```tsx
const [newTokenTtl, setNewTokenTtl] = useState(30)  // line ~29
// ...
setNewTokenTtl(30)  // line ~70 (cancel) và ~78 (handleCreateToken)
```

**Vấn đề:** Số `30` xuất hiện 3 lần, không rõ nghĩa là "30 ngày".

**Gợi ý sửa:**
```tsx
const DEFAULT_TOKEN_TTL_DAYS = 30
const [newTokenTtl, setNewTokenTtl] = useState(DEFAULT_TOKEN_TTL_DAYS)
// ...
setNewTokenTtl(DEFAULT_TOKEN_TTL_DAYS)
```

---

### H-4 🟡 Medium — Magic Number: Expiry warning threshold `7`

**Loại:** Magic Number  
**Vị trí:** dòng ~261

**Code trích dẫn:**
```tsx
} : daysLeft <= 7 ? (
  <span className="text-[10px] text-amber-500 font-medium">
    {tpl(t.settings_token_days_warning, { days: daysLeft, date: expireDate })}
  </span>
```

**Vấn đề:** `7` là ngưỡng cảnh báo sắp hết hạn, không có tên.

**Gợi ý sửa:**
```tsx
const TOKEN_EXPIRY_WARNING_DAYS = 7
// ...
} : daysLeft <= TOKEN_EXPIRY_WARNING_DAYS ? (
```

---

### H-5 🟡 Medium — Magic Number: One day in milliseconds

**Loại:** Magic Number  
**Vị trí:** dòng ~258

**Code trích dẫn:**
```tsx
const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
```

**Vấn đề:** `1000 * 60 * 60 * 24` là số ms trong 1 ngày, không có tên.

**Gợi ý sửa:**
```tsx
const ONE_DAY_MS = 1000 * 60 * 60 * 24
const daysLeft = Math.ceil(msLeft / ONE_DAY_MS)
```

---

### H-6 🟢 Low — Magic Number: Copy confirmation timeout `2000`

**Loại:** Magic Number  
**Vị trí:** dòng ~99

**Code trích dẫn:**
```tsx
setTimeout(() => setRevealedCopied(false), 2000)
```

**Vấn đề:** `2000` ms là thời gian hiển thị "Copied!" không có tên.

**Gợi ý sửa:**
```tsx
const COPY_FEEDBACK_DURATION_MS = 2000
setTimeout(() => setRevealedCopied(false), COPY_FEEDBACK_DURATION_MS)
```

---

### H-7 🟢 Low — Magic String: Token name prefix

**Loại:** Magic String  
**Vị trí:** dòng ~36

**Code trích dẫn:**
```tsx
return `Chrome Extension - ${today}`
```

**Vấn đề:** Chuỗi prefix `"Chrome Extension - "` hardcode, nếu đổi tên product phải tìm lại.

**Gợi ý sửa:**
```tsx
const DEFAULT_TOKEN_NAME_PREFIX = 'Chrome Extension'
return `${DEFAULT_TOKEN_NAME_PREFIX} - ${today}`
```

---

### H-8 🟢 Low — Hardcode UI: Section header text không qua i18n

**Loại:** Hardcode UI  
**Vị trí:** dòng ~104 và ~111

**Code trích dẫn:**
```tsx
<h2 className="section-label">Browser Extension</h2>          {/* line ~104 */}
<p className="...">Chrome Extension</p>                        {/* line ~111 */}
```

**Vấn đề:** Hai label UI không qua hệ thống i18n. Nếu app hỗ trợ đa ngôn ngữ hoặc đổi branding, cần tìm thủ công.

**Gợi ý sửa:** Thêm key vào i18n:
```tsx
<h2 className="section-label">{t.settings_browser_extension_section ?? 'Browser Extension'}</h2>
```

---

## Tóm tắt & Ưu tiên

### 🔴 Critical (0)
_Không có_

### 🟠 High — Cần xử lý sớm (3 issues)
| # | Issue | Vị trí |
|---|---|---|
| 1 | **D-1** Near Duplicate: 2 error display blocks | dòng ~225–244 |
| 2 | **H-1** GitHub SVG icon inline | dòng ~125–146 |
| 3 | **H-2** GitHub releases URL hardcode | dòng ~121 |

### 🟡 Medium — Tech debt (4 issues)
| # | Issue | Vị trí |
|---|---|---|
| 4 | **D-2** Structural Duplicate: 3 mutation handlers | dòng ~57–97 |
| 5 | **H-3** Magic number `30` (default TTL) | dòng ~29, ~70, ~78 |
| 6 | **H-4** Magic number `7` (expiry warning) | dòng ~261 |
| 7 | **H-5** Magic expression `1000*60*60*24` | dòng ~258 |

### 🟢 Low — Good practice (4 issues)
| # | Issue | Vị trí |
|---|---|---|
| 8 | **H-6** Magic number `2000` (copy timeout) | dòng ~99 |
| 9 | **H-7** Magic string `"Chrome Extension - "` | dòng ~36 |
| 10 | **H-8** UI label không i18n x2 | dòng ~104, ~111 |

---

## Kế hoạch refactor gợi ý

```
Priority 1 (High — thực hiện trong sprint tới):
  ├── Tạo GitHubIcon tại src/components/ui/icons/actions.tsx → export index.ts
  ├── Tạo GITHUB_RELEASES_URL constant (src/constants/urls.ts)
  └── Extract <InlineErrorBox> component để gộp 2 error display blocks

Priority 2 (Medium — sprint sau):
  ├── Đặt tên các magic number: DEFAULT_TOKEN_TTL_DAYS, TOKEN_EXPIRY_WARNING_DAYS, ONE_DAY_MS
  └── Refactor 3 token mutation handlers dùng withTokenAction() helper

Priority 3 (Low — backlog):
  ├── Thêm i18n key cho "Browser Extension" và "Chrome Extension" headers
  └── Đặt tên COPY_FEEDBACK_DURATION_MS và DEFAULT_TOKEN_NAME_PREFIX
```
