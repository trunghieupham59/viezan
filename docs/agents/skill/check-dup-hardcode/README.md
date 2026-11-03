# Skill: check-dup-hardcode

Skill phát hiện **duplicate code** và **hardcode** trong source code, phân loại theo mức độ nghiêm trọng và đề xuất refactor cụ thể.

## Mô tả

Skill này giúp AI agent quét codebase Viezan và phân tích hai nhóm vấn đề chất lượng code:

1. **Duplicate Code** – code bị lặp lại không cần thiết theo 4 loại clone
2. **Hardcode** – giá trị cứng nên được đưa ra constant/config/settings/keychain đúng layer

## Cách dùng

```
Hãy dùng skill check-dup-hardcode để kiểm tra [duplicate | hardcode | cả hai] trong source code sau:
[code hoặc đường dẫn]
```

---

## Phân loại Duplicate Code

| Loại | Mô tả | Severity |
|------|-------|----------|
| **Exact Duplicate** (Clone Type 1) | Copy-paste giống hệt nhau | 🔴 Critical |
| **Near Duplicate** (Clone Type 2) | Giống nhau, chỉ khác tên biến | 🟠 High |
| **Structural Duplicate** (Clone Type 3) | Cùng cấu trúc, khác vài câu lệnh | 🟡 Medium |
| **Semantic Duplicate** (Clone Type 4) | Cùng mục đích, implement khác nhau | 🟢 Low |

### Dấu hiệu nhận biết Duplicate

- Hai hàm/block có body gần như giống nhau từng dòng
- Cùng logic xử lý xuất hiện ở nhiều file khác nhau
- Các component React/Vue giống nhau chỉ khác prop name
- Switch/if-else lớn với các nhánh cùng cấu trúc xử lý
- Cùng error handling pattern lặp nhiều chỗ

### Cách sửa Duplicate

| Loại | Giải pháp |
|------|-----------|
| Exact | Trích xuất thành hàm/component/module dùng chung |
| Near | Tham số hóa phần khác nhau, dùng chung skeleton |
| Structural | Dùng template method pattern, HOF, custom hook |
| Semantic | Consolidate thành một implementation chuẩn |

---

## Phân loại Hardcode

| Loại | Mô tả | Severity |
|------|-------|----------|
| **Hardcode Credential** | API key, password, token, URL secret | 🔴 Critical |
| **Magic Number** | Số literal không tên, không rõ nghĩa | 🟠 High |
| **Magic String** | Chuỗi lặp lại hoặc có nghĩa đặc biệt | 🟠 High |
| **Hardcode Icon** | SVG inline, emoji icon, import thư viện icon ngoài `src/components/ui/icons/` | 🟠 High |
| **Hardcode Config** | Port, DB name, feature flag, file path | 🟡 Medium |
| **Hardcode UI Value** | Màu hex, px cứng, label không qua i18n | 🟢 Low |

### Dấu hiệu nhận biết Hardcode

```ts
// ❌ Magic Number
setTimeout(fn, 3000)
if (retries > 5)
const days = seconds / 86400

// ❌ Magic String
fetch('/api/v1/users')
if (status === 'pending')
emit('message-received')

// ❌ Hardcode Credential
const API_KEY = 'sk-abc123xyz'
const rawKey = window.api.keychain.getKey('openai')

// ❌ Hardcode Config
app.listen(3000)
const lang = 'vi'

// ❌ Hardcode UI
<div style={{ color: '#FF5733', fontSize: '14px' }}>

// ❌ Hardcode Icon — SVG inline trong JSX
<svg width="16" height="16" viewBox="0 0 24 24">
  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
</svg>

// ❌ Hardcode Icon — emoji dùng làm icon
<span>🔍</span>

// ❌ Hardcode Icon — import thẳng từ thư viện ngoài trong component
import { Search } from 'lucide-react'
```

### Cách sửa Hardcode

```ts
// ✅ Named Constant
const REQUEST_TIMEOUT_MS = 3000
const MAX_RETRY = 5
const ONE_DAY_SECONDS = 86400

// ✅ Enum / Constants file
import { ROUTES, STATUS, EVENTS } from '@/constants'
fetch(ROUTES.USERS)
if (status === STATUS.PENDING)

// ✅ Viezan local-first key flow
// Renderer chỉ hỏi trạng thái, không nhận raw key
const hasOpenAIKey = await window.api.keychain.hasKey('openai')

// Main Process mới được đọc key và gọi provider SDK
const apiKey = await getStoredApiKey('openai')

// ✅ Config / Settings
const PORT = config.get('server.port')
const lang = settingsStore.language

// ✅ Design Token / i18n
<div className="text-red-500 text-sm">
{t('common.label')}
```

---

## Kiểm tra Hardcode Icon

Icon **không được** hardcode trực tiếp trong source code. Mọi icon phải được quản lý tập trung tại `src/components/ui/icons/`.

### Registry icon hiện có

| Category file | Các icon có sẵn |
|---------------|----------------|
| `actions.tsx` | copy, check, trash, arrow-right, download, upload, X, plus, refresh, send, pencil, image, translate, rewrite, layers |
| `navigation.tsx` | chevron-down, chevron-right, gear, auto-detect, arrow-up |
| `media.tsx` | spinner, stop, speaker, microphone, monitor, subtitles |
| `status.tsx` | alert-triangle, radio-checked, info-circle, lightbulb, check-circle, user |
| `auth.tsx` | lock, eye, eye-off |
| `files.tsx` | document, clipboard |
| `providers.tsx` | provider logos/icons |

### Cách import icon đúng

```tsx
// ✅ Dùng icon có sẵn từ registry
import { CopyIcon, CheckIcon, TrashIcon } from '@/components/ui/icons'

// ✅ Khi import tương đối trong component gần registry
import { SearchIcon } from '../ui/icons'
```

### Cách tạo icon mới (nếu chưa có)

```tsx
// 1. Tạo component trong category file phù hợp, ví dụ: src/components/ui/icons/actions.tsx
export function SearchIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}
         fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

// 2. Export qua src/components/ui/icons/index.ts (đã tự động qua export * from './actions')

// 3. Dùng trong component
import { SearchIcon } from '@/components/ui/icons'
<SearchIcon size={20} className="text-gray-500" />
```

### Cách phát hiện vi phạm

```bash
# rg SVG inline ngoài thư mục icons
rg -n --glob '*.{tsx,ts}' '<svg' src -g '!src/components/ui/icons/**'

# rg import thư viện icon bên ngoài
rg -n --glob '*.{tsx,ts}' "from ['\"](lucide-react|react-icons|@heroicons)" \
  src -g '!src/components/ui/icons/**'
```

---

## Quy tắc khi phân tích

| Quy tắc | Chi tiết |
|---------|---------|
| **Đọc toàn codebase trước** | Không báo cáo từng file riêng lẻ, cần bức tranh tổng thể |
| **Trích dẫn cụ thể** | Luôn kèm file path + line number khi báo vấn đề |
| **Tránh false positive** | Code tương tự nhưng có lý do khác nhau KHÔNG phải duplicate |
| **Ưu tiên severity** | Critical → High → Medium → Low |
| **Kèm gợi ý sửa** | Mỗi vấn đề phải có code example cụ thể |

---

## Output Format

### Báo cáo từng vấn đề

```
[🔴 Critical] Hardcode Credential
File: src/services/chatService.ts:42
Code:  const apiKey = "sk-abc123xyz789"
Vấn đề: API key bị commit thẳng vào source code, nguy cơ lộ secret
Sửa: Chỉ Main Process đọc key từ keychain; Renderer dùng hasKey(provider)
```

### Tóm tắt cuối báo cáo

```
## Tổng kết
| Severity | Số lượng |
|----------|---------|
| 🔴 Critical | 2 |
| 🟠 High | 8 |
| 🟡 Medium | 5 |
| 🟢 Low | 11 |

File bị ảnh hưởng nhiều nhất: src/services/translationService.ts (6 vấn đề)

Top 3 ưu tiên sửa:
1. Hardcode credential trong chatService.ts:42
2. Exact duplicate logic ở translate.ts và imageTranslate.ts
3. Magic string 'pending'/'active' lặp 9 lần trong codebase
```

---

## Tham khảo

- Workflow sử dụng skill này: [`../../workflow/check-dup-hardcode/README.md`](../../workflow/check-dup-hardcode/README.md)
- Skill JSON definition: [`./check-dup-hardcode.json`](./check-dup-hardcode.json)
