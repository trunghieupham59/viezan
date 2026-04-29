# Workflow: fix-vscode-problems

Workflow đọc **PROBLEMS từ VS Code**, tạo báo cáo phân loại, phân tích nguyên nhân gốc rễ, apply fix vào code và hướng dẫn fix các vấn đề cần thao tác bên ngoài.

## Mô tả

Workflow này hướng dẫn AI agent thực hiện toàn bộ quy trình từ đầu đến cuối:

> Thu thập PROBLEMS → Parse & phân loại → Đọc file → Phân tích root cause → Tạo báo cáo → Lưu báo cáo → Fix trong code → Hướng dẫn fix bên ngoài → Verify

## Cách kích hoạt

```
Hãy dùng workflow fix-vscode-problems để xử lý các PROBLEMS sau:
[paste nội dung từ VS Code tab PROBLEMS]
```

Hoặc yêu cầu scan trực tiếp:

```
Hãy dùng workflow fix-vscode-problems để quét và fix toàn bộ PROBLEMS hiện tại của project
```

---

## Các bước trong Workflow

```
Step 1: Thu thập danh sách PROBLEMS
         (user paste / chạy CLI / đọc từ screenshot)
   ↓
Step 2: Parse và phân loại PROBLEMS
         (dùng skill fix-vscode-problems)
   ↓
Step 3: Đọc tất cả file bị ảnh hưởng
         (đọc trước, không fix ngay)
   ↓
Step 4: Phân tích nguyên nhân gốc rễ
         (root cause category cho từng problem)
   ↓
Step 5: Tạo báo cáo chi tiết
         (format chuẩn: overview + per-problem + summary table + action plan)
   ↓
Step 6: Lưu báo cáo vào viezanagent/report/
         (tên file: vscode-problems-report-YYYYMMDD-HHmm.md)
   ↓
Step 7: Apply fix vào code
         (chỉ các problems fixable in code)
   ↓
Step 8: Hướng dẫn fix bên ngoài
         (GitHub Secrets, npm install, v.v.)
   ↓
Step 9: Verify kết quả
         (re-run diagnostics, đảm bảo không regression)
```

---

## Skill được sử dụng

Workflow này gọi **skill `fix-vscode-problems`** tại 2 bước chính:

| Bước | Skill Section | Mục tiêu |
|------|--------------|----------|
| Step 2 | `problem_taxonomy` | Parse và phân loại problem theo source + severity |
| Step 4 | `root_cause_analysis` | Xác định nguyên nhân gốc rễ |

---

## Phân loại PROBLEMS

| Loại | Source | Severity | Fix Location |
|------|--------|----------|-------------|
| TypeScript Error | `ts` | 🔴 Error | Code |
| ESLint Warning | `eslint` | 🟠 Warning | Code, chỉ khi repo có ESLint output |
| GitHub Actions Warning | `github-actions` | 🟡 Hint | External (GitHub Settings) |
| Biome Lint | `biome` | 🟡 Warning | Code |
| Import Error | `ts` | 🔴 Error | Code / Terminal |
| React/JSX Error | `ts` | 🔴 Error | Code |

---

## Luồng quyết định (Decision Tree)

```
Problem nhận được
      │
      ▼
┌─────────────────────────────────┐
│ Có file path + line number?      │
└─────────────┬───────────────────┘
          Yes │                 No │
              ▼                    ▼
       Đọc file trước       Phân tích từ message
              │
              ▼
┌─────────────────────────────────┐
│ Source là GitHub Actions?        │
└─────────────┬───────────────────┘
          Yes │                 No │
              ▼                    ▼
   "Context access might       Phân tích theo
    be invalid"?               TypeScript/ESLint/Biome
          │
          ▼
   Root cause = Missing        
   GitHub Secret              
   → Hướng dẫn tạo secret     
     tại repo Settings        
              │
              ▼
┌─────────────────────────────────┐
│ Fix được trong code?             │
└─────────────┬───────────────────┘
          Yes │                 No │
              ▼                    ▼
       Apply fix trực tiếp   Tạo hướng dẫn
       (Step 7)              manual action (Step 8)
              │
              ▼
┌─────────────────────────────────┐
│ Fix gây breaking change?         │
└─────────────┬───────────────────┘
          Yes │                 No │
              ▼                    ▼
  Báo cáo scope, chờ         Apply & ghi chú
  xác nhận developer
```

---

## Ví dụ thực tế (từ release.yml)

Từ screenshot VS Code PROBLEMS hiện tại:

### Problem 1
```
💡 Context access might be invalid: APPLE_TEAM_ID
   .github/workflows/release.yml [Ln 200, Col 34]
```
| | |
|--|--|
| **Source** | GitHub Actions |
| **Severity** | 🟡 Hint |
| **Root cause** | Secret `APPLE_TEAM_ID` chưa được tạo trong repo Settings → dùng để ký macOS app với Apple Developer Team |
| **Fix location** | ⚙️ External – GitHub repo Settings |
| **Action** | Settings → Secrets and variables → Actions → New secret: `APPLE_TEAM_ID` |

### Problem 2 & 3
```
⚠ Context access might be invalid: SIGNPATH_API_TOKEN
   .github/workflows/release.yml [Ln 298, Col 31]

⚠ Context access might be invalid: SIGNPATH_ORGANIZATION_ID
   .github/workflows/release.yml [Ln 299, Col 37]
```
| | |
|--|--|
| **Source** | GitHub Actions |
| **Severity** | 🟠 Warning |
| **Root cause** | Hai secrets dùng cho SignPath code-signing service chưa được setup trong repo |
| **Fix location** | ⚙️ External – GitHub repo Settings |
| **Action** | Tạo 2 secrets: `SIGNPATH_API_TOKEN` và `SIGNPATH_ORGANIZATION_ID` từ SignPath dashboard |

---

## Format báo cáo

### Từng Problem

```markdown
### [🟡 Hint] GitHub Actions – Context access might be invalid

**File:** `.github/workflows/release.yml:200`
**Message:** `Context access might be invalid: APPLE_TEAM_ID`

**Root Cause:**
Secret `APPLE_TEAM_ID` chưa được khai báo trong repository secrets.
Secret này được dùng tại step ký macOS application bundle với Apple Developer Team ID.
Nếu không có secret này, workflow sẽ fail hoặc bỏ qua bước code signing.

**Fix:** ⚙️ External Action Required (cannot be fixed in code)
1. Mở GitHub repository trên trình duyệt
2. Vào **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. **Name:** `APPLE_TEAM_ID`
5. **Value:** Team ID từ Apple Developer Portal (dạng: `XXXXXXXXXX`)
6. Click **"Add secret"**

**Verify:** Re-run workflow, hint icon sẽ biến mất khi secret được tạo đúng
```

### Bảng tóm tắt

```markdown
## Tóm tắt

| Type                   | 🔴 Error | 🟠 Warning | 🟡 Hint | Fix in Code | Manual Action |
|------------------------|---------|-----------|---------|------------|---------------|
| GitHub Actions         | 0       | 2         | 1       | 0          | 3             |
| TypeScript             | 0       | 0         | 0       | 0          | 0             |
| Biome / ESLint optional | 0       | 0         | 0       | 0          | 0             |
| **Tổng**               | **0**   | **2**     | **1**   | **0**      | **3**         |

**File bị ảnh hưởng:** `.github/workflows/release.yml`

**Action cần thực hiện:**
- ⚙️ Tạo 3 GitHub Secrets: APPLE_TEAM_ID, SIGNPATH_API_TOKEN, SIGNPATH_ORGANIZATION_ID
- ✅ Không có code fix cần thiết
```

---

## Quy tắc fix

### FIX ĐƯỢC TRONG CODE
- TypeScript type errors → sửa type annotation
- Unused imports → xóa import
- Missing hook dependencies → thêm vào deps array
- Wrong variable scope → refactor code

### YÊU CẦU THAO TÁC BÊN NGOÀI
- **GitHub Actions `Context access might be invalid`** → tạo secret/variable trong repo Settings
- **Cannot find module `xxx`** (không trong package.json) → xác nhận với developer trước khi `npm install xxx`
- **Missing .env variable** → thêm vào `.env` file và `.env.example`

### KHÔNG SỬA (False Positive)
- Warning cho secret dùng trong conditional job với guard `if: ${{ secrets.X != '' }}`
- TS error trong generated `.d.ts` files
- Biome warning trong vendor/generated code

---

## Lưu báo cáo

| | |
|--|--|
| **Thư mục** | `viezanagent/report/` |
| **Pattern** | `vscode-problems-report-YYYYMMDD-HHmm.md` |
| **Ví dụ** | `vscode-problems-report-20260420-1628.md` |

---

## Tham khảo

- Skill được dùng: [`../../skill/fix-vscode-problems/README.md`](../../skill/fix-vscode-problems/README.md)
- Workflow JSON: [`./fix-vscode-problems.json`](./fix-vscode-problems.json)
