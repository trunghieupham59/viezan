# Workflow: check-dup-hardcode

Workflow kiểm tra **duplicate code** và **hardcode** trong source code, tạo báo cáo có phân loại mức độ nghiêm trọng và kế hoạch refactor cụ thể.

## Mô tả

Workflow này hướng dẫn AI agent thực hiện toàn bộ quy trình phân tích từ đầu đến cuối:
1. Xác định phạm vi → Đọc code → Phát hiện duplicate → Phát hiện hardcode → Loại false positive → Ưu tiên hóa → Tạo báo cáo → Lưu file

## Cách kích hoạt

```
Hãy dùng workflow check-dup-hardcode để kiểm tra source code trong [thư mục / file / toàn bộ project]
```

hoặc chỉ định loại kiểm tra:

```
Hãy dùng workflow check-dup-hardcode để kiểm tra duplicate code trong src/services
Hãy dùng workflow check-dup-hardcode để kiểm tra hardcode trong toàn bộ electron/ipc
```

---

## Các bước trong Workflow

```
Step 1: Xác định phạm vi kiểm tra
   ↓
Step 2: Đọc toàn bộ source code (không phân tích từng file riêng)
   ↓
Step 3: Phát hiện Duplicate Code (dùng skill check-dup-hardcode)
   ↓
Step 4: Phát hiện Hardcode (dùng skill check-dup-hardcode)
   ↓
Step 5: Loại bỏ trùng lặp & false positive trong findings
   ↓
Step 6: Ưu tiên hóa vấn đề theo severity
   ↓
Step 7: Tạo báo cáo đầy đủ
   ↓
Step 8: Lưu báo cáo vào lotus-agent/fix/
```

---

## Phạm vi kiểm tra

| Tùy chọn | Mô tả |
|----------|-------|
| **Toàn bộ codebase** | Tất cả file source, bỏ qua node_modules/dist/build |
| **Một folder** | Ví dụ: `src/services`, `electron/ipc` |
| **Danh sách file** | Người dùng chỉ định file cụ thể |

---

## Skill được sử dụng

Workflow này gọi **skill `check-dup-hardcode`** ở 2 bước:

| Bước | Skill Category | Mục tiêu |
|------|---------------|----------|
| Step 3 | `duplicate-code` | Tìm 4 loại clone |
| Step 4 | `hardcode` | Tìm 5 loại hardcode |

---

## Bảng phân loại vấn đề

### Duplicate Code

| Loại | Clone Type | Severity | Dấu hiệu |
|------|-----------|----------|----------|
| Exact Duplicate | Type 1 | 🔴 Critical | Body giống hệt nhau |
| Near Duplicate | Type 2 | 🟠 High | Chỉ khác tên biến |
| Structural Duplicate | Type 3 | 🟡 Medium | Cùng flow, khác vài dòng |
| Semantic Duplicate | Type 4 | 🟢 Low | Cùng mục đích, implement khác |

### Hardcode

| Loại | Severity | Ví dụ |
|------|----------|-------|
| Hardcode Credential | 🔴 Critical | `const KEY = 'sk-abc123'` |
| Magic Number | 🟠 High | `setTimeout(fn, 3000)` |
| Magic String | 🟠 High | `if (status === 'pending')` |
| Hardcode Config | 🟡 Medium | `app.listen(3000)` |
| Hardcode UI Value | 🟢 Low | `color: '#FF5733'` |

---

## Quy tắc tránh False Positive

### KHÔNG phải Duplicate nếu:
- Hai hàm serve domain context khác nhau (ví dụ: `validateUser` vs `validatePayment`)
- Code giống nhau nhưng cần tách vì sẽ diverge trong tương lai
- Boilerplate theo convention framework (Redux slice, Zustand slice...)

### KHÔNG phải Hardcode nếu:
- Số `0`, `1`, `-1` trong context rõ ràng (default, flag)
- Chuỗi rỗng `''` làm default value
- Constant đã được define rõ với `const`/`enum`
- Test data trong file `*.test.ts` / `*.spec.ts`
- Class Tailwind theo design system (`p-4`, `text-sm`)

---

## Format báo cáo

### Từng vấn đề

```markdown
### [🔴 Critical] Hardcode Credential
**File:** `src/services/chatService.ts:42`
**Code:**
\```ts
const apiKey = "sk-abc123xyz789"
\```
**Vấn đề:** API key bị commit thẳng vào source code, nguy cơ lộ secret khi push lên git public
**Sửa:**
\```ts
const apiKey = import.meta.env.VITE_OPENAI_API_KEY
\```

---

### [🟠 High] Exact Duplicate
**File 1:** `electron/ipc/translate.ts:28–45`
**File 2:** `electron/ipc/imageTranslate.ts:31–48`
**Code (translate.ts):**
\```ts
const headers = { 'Content-Type': 'application/json', ... }
const response = await fetch(url, { method: 'POST', headers, body })
if (!response.ok) throw new Error(...)
\```
**Vấn đề:** Logic gọi API lặp lại 100% ở hai file
**Sửa:** Trích xuất thành `src/utils/apiClient.ts`
```

### Bảng tóm tắt

```markdown
## Tóm tắt

| Loại vấn đề         | 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low | Tổng |
|---------------------|------------|--------|----------|-------|------|
| Exact Duplicate     | 1          | 0      | 0        | 0     | 1    |
| Near Duplicate      | 0          | 3      | 0        | 0     | 3    |
| Structural Dup      | 0          | 0      | 2        | 0     | 2    |
| Hardcode Credential | 1          | 0      | 0        | 0     | 1    |
| Magic Number        | 0          | 4      | 0        | 0     | 4    |
| Magic String        | 0          | 5      | 0        | 0     | 5    |
| Hardcode Config     | 0          | 0      | 3        | 0     | 3    |
| Hardcode UI         | 0          | 0      | 0        | 8     | 8    |
| **Tổng**            | **2**      | **12** | **5**    | **8** | **27** |

**File bị ảnh hưởng nhiều nhất:** `src/services/translationService.ts` (7 vấn đề)

**Top 3 ưu tiên sửa:**
1. Hardcode credential tại `chatService.ts:42`
2. Exact duplicate logic tại `translate.ts:28` và `imageTranslate.ts:31`
3. Magic string `'pending'` lặp 9 lần trong codebase
```

---

## Lưu báo cáo

