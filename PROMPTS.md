# Prompt Guide — Viezan Agent

Tài liệu prompt mẫu để gọi đúng rule, skill và workflow trong `viezanagent/`.

Nguyên tắc chung:

- Task implement Viezan: ưu tiên `viezan-product-engineering` + `ship-viezan-feature`.
- Task audit security/privacy: dùng `audit-local-first-security` hoặc `viezan-ipc-security-audit`.
- Task provider/model: dùng `viezan-provider-integration`.
- Task code quality tổng quát: dùng `generate-code`, `score-code`, `check-dup-hardcode`, `split-ui-component`.

---

## Quick Chooser

| Muốn làm gì | Nên dùng |
|---|---|
| Implement PRD/feature cho Viezan | `workflow ship-viezan-feature` |
| Lập plan trước khi code | `skill viezan-feature-planner` |
| Generate/refactor code đúng chuẩn Viezan | `rule viezan-product-engineering` + `rule generate-code` |
| Thêm hoặc audit provider/model | `skill viezan-provider-integration` |
| Maintain/audit Local AI | `viezanagent/docs/provider-routing.md` + `viezanagent/docs/phase_2/local-ai-agent-tasks.md` + `skill viezan-provider-integration` |
| Audit IPC/API key/local-first | `workflow audit-local-first-security` hoặc `skill viezan-ipc-security-audit` |
| Kiểm tra trước release | `workflow release-readiness` |
| Tìm duplicate/hardcode | `workflow check-dup-hardcode` |
| Chấm điểm chất lượng code | `workflow score-code`, loại bài `viezan-electron` |
| Kiểm tra/tách UI component | `workflow split-ui-component` |
| Fix Problems từ VS Code/build/test | `workflow fix-vscode-problems` |

---

## Combo Prompts

### Implement một PRD end-to-end

```text
Dùng workflow ship-viezan-feature để implement PRD sau.
Áp dụng rule viezan-product-engineering và generate-code.

PRD:
[dán PRD hoặc mô tả feature]
```

### Review một diff trước khi merge

```text
Review thay đổi hiện tại theo:
- rule viezan-product-engineering
- workflow audit-local-first-security nếu có chạm IPC/preload/provider/key
- workflow score-code với loại bài viezan-electron

Tập trung bugs, security/privacy, reliability và thiếu test.
```

### Refactor một khu vực code

```text
Áp dụng rule generate-code và viezan-product-engineering để refactor:
[file/folder]

Mục tiêu:
- giảm duplicate/hardcode
- giữ đúng Main/Preload/Renderer boundary
- giữ i18n VI/EN/JA và icon registry
- thêm/cập nhật test phù hợp
```

### Maintain hoặc audit Local AI

```text
Kiểm tra hoặc mở rộng Local AI trong Viezan theo:
- viezanagent/docs/provider-routing.md
- viezanagent/docs/phase_2/local-ai-agent-tasks.md

Áp dụng:
- rule viezan-product-engineering
- skill viezan-provider-integration
- workflow audit-local-first-security trước khi merge

Tập trung vào:
- local provider contract
- Ollama/LM Studio/llama.cpp runtime detection
- hardware benchmark/model recommendation
- model download progress and uninstall flow
- Main/Preload/Renderer boundary
```

---

## Rules

### Rule: viezan-product-engineering

Rule nền cho mọi thay đổi trong Viezan: product fit, local-first privacy, Electron boundary, provider contract, UX/i18n, reliability và test.

```text
Áp dụng rule viezan-product-engineering khi implement:
[mô tả yêu cầu]
```

```text
Hãy review code này theo rule viezan-product-engineering:
[file/diff/mô tả]
```

### Rule: generate-code

Rule code quality chung: correctness, structure, maintainability, testing, security, reliability.

```text
Áp dụng rule generate-code và viezan-product-engineering để generate code cho:
[mô tả task]
```

```text
Sau khi sửa xong, tự kiểm tra lại code theo rule generate-code và chỉ ra rủi ro còn lại.
```

---

## Skills

### Skill: viezan-feature-planner

Phân rã PRD/issue/feature request thành product fit, impact map, contracts, implementation plan, verification và risks.

```text
Dùng skill viezan-feature-planner để phân tích PRD này cho Viezan:
[nội dung PRD]
```

```text
Dùng skill viezan-feature-planner để lập impact map cho tính năng:
[mô tả feature]
```

### Skill: viezan-provider-integration

Thêm hoặc audit provider/model/task AI theo registry pattern, key safety và provider contract.

```text
Dùng skill viezan-provider-integration để thêm provider [provider name] cho:
- translate
- chat
- models

Yêu cầu giữ API key trong Main Process/keychain và cập nhật tests liên quan.
```

```text
Dùng skill viezan-provider-integration để audit provider integration trong:
[file hoặc domain: translate/chat/tts/models/image]
```

### Skill: viezan-ipc-security-audit

Audit Electron IPC/preload/keychain/provider/local-first boundary.

```text
Dùng skill viezan-ipc-security-audit để review thay đổi IPC/preload/provider trong nhánh hiện tại.
```

```text
Dùng skill viezan-ipc-security-audit để kiểm tra feature này có làm lộ API key hoặc dữ liệu người dùng không:
[mô tả hoặc file]
```

### Skill: check-dup-hardcode

Kiểm tra duplicate code và hardcode ở phạm vi nhỏ hoặc khi chưa cần báo cáo workflow đầy đủ.

```text
Dùng skill check-dup-hardcode để kiểm tra duplicate và hardcode trong:
[file/folder/snippet]
```

### Skill: score-code

Chấm một tiêu chí hoặc một đoạn code nhỏ theo rubric.

```text
Dùng skill score-code để chấm tiêu chí Security cho:
[file/snippet]
```

### Skill: split-ui-component

Phân loại UI component, phát hiện inline SVG/icon hardcode, duplicate UI pattern, component sai vị trí.

```text
Dùng skill split-ui-component để phân tích nhanh component:
[file/folder]
```

### Skill: fix-vscode-problems

Phân loại Problems từ VS Code/build/test/Biome và đề xuất fix root cause.

```text
Dùng skill fix-vscode-problems để phân tích problems sau:
[paste output từ VS Code Problems hoặc terminal]
```

---

## Workflows

### Workflow: ship-viezan-feature

Implement feature end-to-end: PRD -> plan -> contracts -> code -> i18n -> security audit -> tests -> docs.

```text
Dùng workflow ship-viezan-feature để implement PRD sau:
[nội dung PRD]
```

```text
Dùng workflow ship-viezan-feature để thêm:
[mô tả feature nhỏ]
```

### Workflow: audit-local-first-security

Audit local-first privacy, API key safety, IPC/preload boundary, external URL và data egress.

```text
Dùng workflow audit-local-first-security để kiểm tra nhánh hiện tại trước khi merge.
```

```text
Dùng workflow audit-local-first-security và lưu report vào viezanagent/report/.
```

### Workflow: release-readiness

Kiểm tra trước release: product smoke, security/local-first, i18n, tests, build/package, docs/release notes.

```text
Dùng workflow release-readiness để kiểm tra trước khi build bản release.
```

```text
Dùng workflow release-readiness cho release Windows/macOS, tập trung build package, updater và signing/notarization settings.
```

### Workflow: check-dup-hardcode

Quy trình kiểm tra duplicate code và hardcode, dùng `rg` pre-filter rồi tạo báo cáo.

```text
Dùng workflow check-dup-hardcode để kiểm tra source code trong toàn bộ project.
```

```text
Dùng workflow check-dup-hardcode để kiểm tra duplicate code trong:
src/services
electron/ipc
```

```text
Dùng workflow check-dup-hardcode để kiểm tra hardcode trong:
src/
electron/
chrome-extension/
```

Báo cáo mặc định: `viezanagent/fix/dup-hardcode-report-YYYYMMDD-HHmm.md`.

### Workflow: score-code

Chấm điểm source code theo rubric. Với repo này, ưu tiên loại bài `viezan-electron`.

```text
Dùng workflow score-code để chấm source code này.
Loại bài: viezan-electron

[file/folder/diff cần chấm]
```

```text
Dùng workflow score-code để chấm source code theo tiêu chí:
- Correctness (20đ)
- Architecture (15đ)
- Security (15đ)
- Reliability (15đ)
- Code Quality (10đ)
- Maintainability (10đ)
- Testing (10đ)
- Performance (3đ)
- Documentation (2đ)

Phạm vi:
[file/folder/diff]
```

### Workflow: split-ui-component

Phân tích UI component, icon registry, duplicate UI pattern, component quá lớn hoặc sai vị trí.

```text
Dùng workflow split-ui-component để phân tích toàn bộ:
src/components
src/pages
```

```text
Dùng workflow split-ui-component để kiểm tra SVG icon hardcode trong src/.
```

```text
Dùng workflow split-ui-component để verify sau refactor:
src/components/ui
src/components/translate
src/pages/TranslatePage.tsx
```

Báo cáo mặc định: `viezanagent/report/split-ui-report-YYYYMMDD-HHmm.md`.

### Workflow: fix-vscode-problems

Đọc Problems từ VS Code hoặc output `npm run build`, `npm run build:electron`, `npm test -- --run`, `npx biome check .`; phân loại root cause rồi fix hoặc hướng dẫn manual action.

```text
Dùng workflow fix-vscode-problems để xử lý các PROBLEMS sau:
[paste nội dung từ VS Code Problems]
```

```text
Dùng workflow fix-vscode-problems để quét diagnostics hiện tại và fix các problem có thể sửa trong code.
Ưu tiên:
- npm run build
- npm run build:electron
- npm test -- --run
- npx biome check .
```

Báo cáo mặc định: `viezanagent/report/vscode-problems-report-YYYYMMDD-HHmm.md`.

---

## Report Paths

| Workflow | Report path |
|---|---|
| `check-dup-hardcode` | `viezanagent/fix/dup-hardcode-report-YYYYMMDD-HHmm.md` |
| `split-ui-component` | `viezanagent/report/split-ui-report-YYYYMMDD-HHmm.md` |
| `fix-vscode-problems` | `viezanagent/report/vscode-problems-report-YYYYMMDD-HHmm.md` |
| `audit-local-first-security` | `viezanagent/report/local-first-security-audit-YYYYMMDD-HHmm.md` |
