# Skill: check-dup-hardcode

Skill phát hiện **duplicate code** và **hardcode** trong source code, phân loại theo mức độ nghiêm trọng và đề xuất refactor cụ thể.

## Mô tả

Skill này giúp AI agent quét codebase và phân tích hai nhóm vấn đề chất lượng code:

1. **Duplicate Code** – code bị lặp lại không cần thiết theo 4 loại clone
2. **Hardcode** – giá trị cứng nên được đưa ra constant/config/env

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
const DB_URL = 'mongodb://prod-server:27017/mydb'

// ❌ Hardcode Config
app.listen(3000)
const lang = 'vi'

// ❌ Hardcode UI
<div style={{ color: '#FF5733', fontSize: '14px' }}>
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

// ✅ Environment Variable
const API_KEY = process.env.OPENAI_API_KEY
const DB_URL = process.env.DATABASE_URL

// ✅ Config / Settings
const PORT = config.get('server.port')
const lang = settingsStore.language

// ✅ Design Token / i18n
<div className="text-red-500 text-sm">
{t('common.label')}
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
Sửa: const apiKey = import.meta.env.VITE_OPENAI_API_KEY
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
