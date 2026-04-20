# Skill: fix-vscode-problems

Skill phân tích danh sách **PROBLEMS** từ VS Code, phân loại từng lỗi theo loại nguồn, phân tích nguyên nhân gốc rễ và đề xuất hành động fix cụ thể.

## Mô tả

Skill này giúp AI agent:
1. **Đọc & parse** danh sách problems từ VS Code tab PROBLEMS (errors, warnings, hints)
2. **Phân loại** theo source: TypeScript, ESLint, GitHub Actions, Biome, v.v.
3. **Phân tích root cause** – giải thích TẠI SAO vấn đề xảy ra
4. **Đề xuất fix** – hành động cụ thể kèm code example hoặc hướng dẫn thao tác bên ngoài

## Cách dùng

```
Hãy dùng skill fix-vscode-problems để phân tích các PROBLEMS sau:
[paste nội dung từ VS Code tab PROBLEMS]
```

Hoặc:

```
Hãy dùng workflow fix-vscode-problems để đọc, báo cáo và fix toàn bộ PROBLEMS hiện tại
```

---

## Phân loại PROBLEMS

| Loại | Source | Severity | Ví dụ |
|------|--------|----------|-------|
| **TypeScript Error** | `ts` | 🔴 Error | `TS2304: Cannot find name 'X'` |
| **ESLint Warning** | `eslint` | 🟠 Warning | `no-unused-vars: 'x' is defined but never used` |
| **GitHub Actions Warning** | `github-actions` | 🟡 Warning | `Context access might be invalid: SECRET_NAME` |
| **Biome Lint** | `biome` | 🟡 Warning | `noUnusedVariables: This variable is unused` |
| **Import Error** | `ts` | 🔴 Error | `TS2307: Cannot find module './foo'` |
| **React/JSX Error** | `ts` | 🔴 Error | `React Hook called conditionally` |

---

## Root Cause Categories

| Category | Mô tả | Fix ở đâu |
|----------|-------|----------|
| **Code Logic Error** | Developer viết sai logic hoặc type | Sửa trong code |
| **Missing Configuration** | Thiếu secret, env var, tsconfig option | Config file / repo settings |
| **Missing External Setup** | Cần tạo GitHub Secret, install package | GitHub Settings / Terminal |
| **Type Mismatch** | Types không tương thích | Sửa type definitions |
| **Deprecated API** | API đã thay đổi theo version | Cập nhật code |

---

## Các Problem thường gặp

### 🔴 TypeScript Errors

```ts
// ❌ TS2304: Cannot find name 'X'
const x = MyUndeclaredType  // chưa import

// ✅ Fix: thêm import
import { MyUndeclaredType } from './types'

// ❌ TS2322: Type 'string' is not assignable to type 'number'
const num: number = "hello"

// ✅ Fix: sửa type hoặc value
const num: number = 42

// ❌ TS18048: X is possibly undefined
user.name.toUpperCase()  // user có thể undefined

// ✅ Fix: optional chaining
user?.name?.toUpperCase()
```

### 🟡 GitHub Actions – Context access might be invalid

```yaml
# ❌ Warning: Context access might be invalid: MY_SECRET
- name: Deploy
  env:
    TOKEN: ${{ secrets.MY_SECRET }}  # secret chưa được tạo trong repo
```

**Root cause:** Secret `MY_SECRET` chưa được khai báo trong:
> GitHub repo → Settings → Secrets and variables → Actions

**Fix:** Vào Settings → Secrets and variables → Actions → **New repository secret**
- Name: `MY_SECRET`
- Value: `<actual_secret_value>`

```yaml
# ✅ Guard optional secret (nếu secret là optional)
- name: Deploy
  if: ${{ secrets.MY_SECRET != '' }}
  env:
    TOKEN: ${{ secrets.MY_SECRET }}
```

### 🟠 ESLint Warnings

```ts
// ❌ no-unused-vars
import { unusedFunction } from './utils'  // không dùng

// ✅ Fix: xóa import

// ❌ react-hooks/exhaustive-deps
useEffect(() => {
  doSomething(value)
}, [])  // thiếu 'value' trong deps

// ✅ Fix: thêm dependency
useEffect(() => {
  doSomething(value)
}, [value])
```

---

## Quy tắc phân tích

| Quy tắc | Chi tiết |
|---------|---------|
| **Đọc file trước** | Luôn đọc file bị ảnh hưởng trước khi đề xuất fix |
| **Không suppress** | Không dùng `@ts-ignore`, `eslint-disable` trừ khi thực sự cần |
| **Phân biệt fix location** | Code fix vs External action rõ ràng |
| **Context + 10 dòng** | Xem ±10 dòng xung quanh dòng lỗi |
| **Verify sau fix** | Re-run diagnostics để đảm bảo không có regression |

---

## Output Format

### Từng Problem

```markdown
### [🟡 Warning] GitHub Actions – Context access might be invalid
**File:** `.github/workflows/release.yml:298`
**Message:** `Context access might be invalid: SIGNPATH_API_TOKEN`
**Root Cause:** Secret SIGNPATH_API_TOKEN chưa được tạo trong repo Settings.
  Secret này được dùng ở step "Sign with SignPath" (Ln 295-305) để ký artifact.
**Fix:** ⚙️ External Action Required
1. Vào GitHub repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `SIGNPATH_API_TOKEN` | Value: `<token_từ_signpath_dashboard>`
**Verify:** Re-run workflow, warning sẽ biến mất sau khi secret được tạo
```

### Bảng tóm tắt

```markdown
| Type                   | 🔴 Error | 🟠 Warning | 🟡 Hint | Fixable in Code | Requires Manual |
|------------------------|---------|-----------|---------|----------------|----------------|
| TypeScript Error       | 3       | 0         | 0       | 3              | 0              |
| GitHub Actions         | 0       | 0         | 3       | 0              | 3              |
| ESLint                 | 0       | 5         | 0       | 5              | 0              |
| **Tổng**               | **3**   | **5**     | **3**   | **8**          | **3**          |
```

---

## Tham khảo

- Workflow sử dụng skill này: [`../../workflow/fix-vscode-problems/README.md`](../../workflow/fix-vscode-problems/README.md)
- Skill JSON definition: [`./fix-vscode-problems.json`](./fix-vscode-problems.json)
