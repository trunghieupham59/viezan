# Prompt Guide — Viezan Agent

Tài liệu prompt mẫu để gọi đúng rule, skill và workflow trong `viezanagent/`, phân loại theo vòng đời task để agent chọn nhanh hơn.

Nguyên tắc chung:

- Bắt đầu bằng `classification.lifecycle` trong JSON nếu cần chọn asset bằng máy.
- `foundation` là rule nền, dùng kèm hầu hết task.
- `feature` dùng khi tạo hoặc mở rộng năng lực sản phẩm.
- `maintenance` dùng khi fix, refactor, sync docs, release gate hoặc xử lý debt.
- `audit` dùng khi cần kiểm tra rủi ro theo domain trước merge/release.
- Task implement Viezan: ưu tiên `viezan-product-engineering` + `ship-viezan-feature`.
- Task audit security/privacy: dùng `audit-local-first-security` hoặc `viezan-ipc-security-audit`.
- Task provider/model: dùng `viezan-provider-integration`.
- Task code quality tổng quát: dùng `generate-code`, `score-code`, `check-dup-hardcode`, `split-ui-component`.

---

## Taxonomy

| Lifecycle | Dùng khi | Ví dụ artifact |
|---|---|---|
| `foundation` | Rule nền phải nhớ khi generate, review, refactor, audit | `rule viezan-product-engineering`, `rule generate-code` |
| `feature` | PRD, tính năng mới, provider/model/task AI mới | `workflow ship-viezan-feature`, `skill viezan-feature-planner`, `skill viezan-provider-integration` |
| `maintenance` | Fix diagnostics, refactor debt, hardcode/duplicate, docs sync, release readiness | `workflow fix-vscode-problems`, `workflow check-dup-hardcode`, `workflow sync-docs`, `workflow release-readiness` |
| `audit` | Gate rủi ro security, i18n, extension, live/perf trước merge/release | `workflow audit-local-first-security`, `workflow audit-i18n-coverage`, `workflow audit-extension-ux`, `workflow audit-live-perf` |

Domain tags trong JSON: `product-engineering`, `code-quality`, `security-privacy`, `electron-boundary`, `provider-models`, `local-ai`, `i18n`, `extension`, `live-translate`, `ui-components`, `diagnostics`, `docs`, `release`.

---

## Quick Chooser

| Nhóm | Muốn làm gì | Nên dùng |
|---|---|---|
| Foundation | Generate/review/refactor code đúng chuẩn Viezan | `rule viezan-product-engineering` + `rule generate-code` |
| Feature | Implement PRD/feature end-to-end | `workflow ship-viezan-feature` |
| Feature | Lập plan trước khi code | `skill viezan-feature-planner` |
| Feature | Thêm hoặc audit provider/model/Local AI | `skill viezan-provider-integration` + `viezanagent/docs/provider-routing.md` |
| Maintenance | Fix Problems từ VS Code/build/test/Biome | `workflow fix-vscode-problems` |
| Maintenance | Tìm duplicate/hardcode/secret/magic literal | `workflow check-dup-hardcode` |
| Maintenance | Chấm điểm chất lượng code | `workflow score-code`, loại bài `viezan-electron` |
| Maintenance | Kiểm tra/tách UI component, icon registry, UI duplicate | `workflow split-ui-component` |
| Maintenance | Đồng bộ docs với code (IPC/provider/locale/skill) | `workflow sync-docs` |
| Maintenance | Kiểm tra trước release | `workflow release-readiness` |
| Audit | Audit IPC/API key/local-first/data egress | `workflow audit-local-first-security` hoặc `skill viezan-ipc-security-audit` |
| Audit | Audit i18n VI/EN/JA và hardcoded UI string | `workflow audit-i18n-coverage` hoặc `skill viezan-i18n-audit` |
| Audit | Audit Chrome Extension UX và local bridge | `workflow audit-extension-ux` hoặc `skill viezan-extension-ux` |
| Audit | Audit hiệu năng/lifecycle pipeline Live Translate | `workflow audit-live-perf` hoặc `skill viezan-live-perf-audit` |

---

## Category Map

### Foundation

| Kind | Artifact | Domain | Dùng khi |
|---|---|---|---|
| Rule | `viezan-product-engineering` | product, local-first, Electron, provider, UI/i18n, extension | Mọi task code/product trong Viezan |
| Rule | `generate-code` | code quality, maintainability, testing, security, reliability | Generate/refactor code tổng quát |

### Feature

| Kind | Artifact | Domain | Dùng khi |
|---|---|---|---|
| Workflow | `ship-viezan-feature` | feature planning, product, i18n, security, docs | Implement PRD/feature end-to-end |
| Skill | `viezan-feature-planner` | planning, contracts, risk | Cần impact map/plan trước khi code |
| Skill | `viezan-provider-integration` | provider, model, Local AI, key safety | Thêm/audit provider, model hoặc tác vụ AI |

### Maintenance

| Kind | Artifact | Domain | Dùng khi |
|---|---|---|---|
| Workflow | `fix-vscode-problems` | diagnostics, build, test, Biome | Xử lý Problems hoặc output lỗi |
| Skill | `fix-vscode-problems` | diagnostics, root cause | Phân loại nhanh một batch lỗi |
| Workflow | `check-dup-hardcode` | duplicate, hardcode, secret | Quét toàn repo và tạo report |
| Skill | `check-dup-hardcode` | duplicate, hardcode | Kiểm tra nhanh file/folder/snippet |
| Workflow | `score-code` | rubric, review, code quality | Chấm code theo tiêu chí đầy đủ |
| Skill | `score-code` | rubric, focused review | Chấm một tiêu chí hoặc đoạn code nhỏ |
| Workflow | `split-ui-component` | UI component, icon, extension drift | Audit/tách UI toàn diện và tạo report |
| Skill | `split-ui-component` | reusable vs feature UI, SVG, duplicate pattern | Phân tích nhanh component/folder |
| Workflow | `sync-docs` | docs drift, release docs | Đồng bộ docs với code thực tế |
| Skill | `viezan-doc-sync` | docs drift | Rà docs sau khi đổi IPC/provider/locale/skill |
| Workflow | `release-readiness` | release, package, smoke, signing | Kiểm tra trước tag/build/publish |

### Audit

| Kind | Artifact | Domain | Dùng khi |
|---|---|---|---|
| Workflow | `audit-local-first-security` | security, privacy, IPC, preload, key | Security/privacy gate đầy đủ |
| Skill | `viezan-ipc-security-audit` | IPC, preload, keychain, provider | Review boundary bảo mật phạm vi nhỏ |
| Workflow | `audit-i18n-coverage` | i18n, locale, extension parity | Audit locale/hardcoded string toàn diện |
| Skill | `viezan-i18n-audit` | locale, key, hardcoded UI string | Audit i18n phạm vi nhỏ |
| Workflow | `audit-extension-ux` | extension, UX, local bridge, i18n | Audit extension/local bridge toàn diện |
| Skill | `viezan-extension-ux` | popup, options, tooltip, bridge | Review extension UX phạm vi nhỏ |
| Workflow | `audit-live-perf` | live translate, audio, performance, cleanup | Audit live pipeline toàn diện |
| Skill | `viezan-live-perf-audit` | audio, listener, throttle, cleanup | Review live translate pipeline phạm vi nhỏ |

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

### Skill: viezan-i18n-audit

Audit i18n VI/EN/JA: missing key giữa locale, hardcoded UI string, key chưa dùng, parity với Chrome Extension.

```text
Dùng skill viezan-i18n-audit để kiểm tra i18n giữa vi/en/ja.
```

```text
Dùng skill viezan-i18n-audit để tìm UI string hardcode trong:
[file/folder]
```

### Skill: viezan-extension-ux

Audit Chrome Extension UX: popup/options/tooltip parity, state UX (missing-token/offline/loading/error/success), options storage, local bridge security.

```text
Dùng skill viezan-extension-ux để audit popup/options/tooltip Chrome Extension.
```

```text
Dùng skill viezan-extension-ux để review thay đổi local bridge giữa extension và Electron app.
```

### Skill: viezan-live-perf-audit

Audit hiệu năng và lifecycle pipeline Live Translate: AudioContext/MediaStream cleanup, mountedRef guard, Whisper confidence gate, streaming throttle, subtitle window listener.

```text
Dùng skill viezan-live-perf-audit để review thay đổi useLiveTranslate.ts.
```

```text
Dùng skill viezan-live-perf-audit để kiểm tra leak/lag pipeline live trước release.
```

### Skill: viezan-doc-sync

Phát hiện drift giữa code và docs (ARCHITECTURE.md, PROMPTS.md, product-intro.md, README.md, viezanagent/docs/, chrome-extension/README.md).

```text
Dùng skill viezan-doc-sync để rà drift giữa code và docs.
```

```text
Dùng skill viezan-doc-sync sau khi thêm IPC/provider/locale/skill mới.
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

### Workflow: audit-i18n-coverage

Audit i18n VI/EN/JA: pre-filter `rg`, đối chiếu key giữa 3 locale, tìm hardcoded UI string, kiểm tra parity Chrome Extension.

```text
Dùng workflow audit-i18n-coverage để kiểm tra i18n giữa vi/en/ja và Chrome Extension.
```

```text
Dùng workflow audit-i18n-coverage và lưu report vào viezanagent/report/.
```

Báo cáo mặc định: `viezanagent/report/i18n-audit-report-YYYYMMDD-HHmm.md`.

### Workflow: audit-extension-ux

Audit Chrome Extension UX và local bridge security: visual parity, state UX, options storage, bind/origin/key safety, manual smoke.

```text
Dùng workflow audit-extension-ux để audit chrome-extension/ và local bridge.
```

```text
Dùng workflow audit-extension-ux trước release Windows/macOS.
```

Báo cáo mặc định: `viezanagent/report/extension-ux-report-YYYYMMDD-HHmm.md`.

### Workflow: audit-live-perf

Audit hiệu năng và lifecycle pipeline Live Translate: AudioContext/MediaStream cleanup, mountedRef, Whisper confidence gate, streaming throttle, subtitle window listener.

```text
Dùng workflow audit-live-perf để kiểm tra useLiveTranslate.ts và subtitle pipeline.
```

```text
Dùng workflow audit-live-perf trước release để chắc chắn không leak audio/listener.
```

Báo cáo mặc định: `viezanagent/report/live-perf-report-YYYYMMDD-HHmm.md`.

### Workflow: sync-docs

Đồng bộ docs Viezan với code: extract truth từ code (IPC/provider/store/locale/skill), diff với docs, đề xuất patch tối thiểu.

```text
Dùng workflow sync-docs để rà drift giữa code và docs.
```

```text
Dùng workflow sync-docs sau khi thêm IPC/provider/locale/skill mới.
```

```text
Dùng workflow sync-docs và lưu report vào viezanagent/report/.
```

Báo cáo mặc định: `viezanagent/report/doc-sync-report-YYYYMMDD-HHmm.md`.

---

## Report Paths

| Workflow | Report path |
|---|---|
| `check-dup-hardcode` | `viezanagent/fix/dup-hardcode-report-YYYYMMDD-HHmm.md` |
| `split-ui-component` | `viezanagent/report/split-ui-report-YYYYMMDD-HHmm.md` |
| `fix-vscode-problems` | `viezanagent/report/vscode-problems-report-YYYYMMDD-HHmm.md` |
| `audit-local-first-security` | `viezanagent/report/local-first-security-audit-YYYYMMDD-HHmm.md` |
| `audit-i18n-coverage` | `viezanagent/report/i18n-audit-report-YYYYMMDD-HHmm.md` |
| `audit-extension-ux` | `viezanagent/report/extension-ux-report-YYYYMMDD-HHmm.md` |
| `audit-live-perf` | `viezanagent/report/live-perf-report-YYYYMMDD-HHmm.md` |
| `sync-docs` | `viezanagent/report/doc-sync-report-YYYYMMDD-HHmm.md` |

---

## Appendix: Search Index

Dùng phụ lục này để tìm nhanh prompt, rule, skill, workflow hoặc report bằng `Cmd+F`/`rg`.

### Search by Intent

| Intent / từ khóa | Dùng artifact | Nơi đọc chính | Output thường gặp |
|---|---|---|---|
| `implement`, `feature`, `PRD`, `end-to-end`, `ship` | `workflow ship-viezan-feature` | `viezanagent/workflow/ship-viezan-feature/README.md` | Code, tests, docs, i18n |
| `plan`, `impact map`, `contract`, `risk` | `skill viezan-feature-planner` | `viezanagent/skill/viezan-feature-planner/README.md` | Implementation plan |
| `generate`, `refactor`, `code quality`, `maintainability` | `rule generate-code` + `rule viezan-product-engineering` | `viezanagent/rule/generate-code/README.md` | Scoped code patch |
| `review`, `score`, `rubric`, `merge` | `workflow score-code` | `viezanagent/workflow/score-code/README.md` | Score/report |
| `security`, `privacy`, `IPC`, `preload`, `API key`, `keychain`, `data egress` | `workflow audit-local-first-security` hoặc `skill viezan-ipc-security-audit` | `viezanagent/workflow/audit-local-first-security/README.md` | Security audit report |
| `provider`, `model`, `OpenAI`, `Gemini`, `Ollama`, `LM Studio`, `llama.cpp`, `Local AI` | `skill viezan-provider-integration` | `viezanagent/skill/viezan-provider-integration/README.md` | Provider patch/audit |
| `duplicate`, `hardcode`, `secret`, `token`, `PEM`, `magic string` | `workflow check-dup-hardcode` | `viezanagent/workflow/check-dup-hardcode/README.md` | `viezanagent/fix/dup-hardcode-report-*.md` |
| `UI`, `UX`, `component`, `icon`, `SVG`, `modal`, `popup`, `layout` | `workflow split-ui-component` hoặc `skill split-ui-component` | `viezanagent/workflow/split-ui-component/README.md` | UI split report |
| `VS Code Problems`, `Biome`, `TypeScript`, `build`, `test`, `diagnostic` | `workflow fix-vscode-problems` | `viezanagent/workflow/fix-vscode-problems/README.md` | Problems report/code fix |
| `i18n`, `locale`, `vi`, `en`, `ja`, `hardcoded string`, `translation key` | `workflow audit-i18n-coverage` hoặc `skill viezan-i18n-audit` | `viezanagent/workflow/audit-i18n-coverage/README.md` | i18n audit report |
| `Chrome Extension`, `extension`, `popup`, `options`, `tooltip`, `local bridge` | `workflow audit-extension-ux` hoặc `skill viezan-extension-ux` | `viezanagent/workflow/audit-extension-ux/README.md` | Extension UX report |
| `Live Translate`, `AudioContext`, `MediaStream`, `Whisper`, `streaming`, `subtitle`, `leak`, `lag` | `workflow audit-live-perf` hoặc `skill viezan-live-perf-audit` | `viezanagent/workflow/audit-live-perf/README.md` | Live perf report |
| `docs`, `README`, `ARCHITECTURE`, `PROMPTS`, `drift`, `sync` | `workflow sync-docs` hoặc `skill viezan-doc-sync` | `viezanagent/workflow/sync-docs/README.md` | Doc sync report |
| `release`, `package`, `signing`, `notarization`, `updater`, `smoke` | `workflow release-readiness` | `viezanagent/workflow/release-readiness/README.md` | Release checklist/report |

### Search by Artifact

| Artifact | Search tags | Khi nào dùng |
|---|---|---|
| `rule viezan-product-engineering` | `product`, `local-first`, `Electron boundary`, `UX`, `reliability` | Mọi task code/product trong Viezan |
| `rule generate-code` | `correctness`, `structure`, `testing`, `security`, `maintainability` | Generate/refactor code tổng quát |
| `skill viezan-feature-planner` | `PRD`, `plan`, `impact`, `contract`, `verification` | Cần plan trước khi code |
| `skill viezan-provider-integration` | `provider`, `model`, `registry`, `key safety`, `contract` | Thêm/audit provider hoặc model |
| `skill viezan-ipc-security-audit` | `IPC`, `preload`, `keychain`, `provider`, `local-first` | Review boundary bảo mật phạm vi nhỏ |
| `skill check-dup-hardcode` | `duplicate`, `hardcode`, `literal`, `secret` | Kiểm tra nhanh một file/folder |
| `skill score-code` | `rubric`, `criterion`, `score` | Chấm nhanh một tiêu chí/đoạn code |
| `skill split-ui-component` | `component`, `icon`, `SVG`, `pattern` | Phân tích nhanh component |
| `skill fix-vscode-problems` | `Problems`, `diagnostic`, `root cause` | Phân loại output lỗi trước khi fix |
| `skill viezan-i18n-audit` | `locale`, `key`, `hardcoded UI string` | Audit i18n phạm vi nhỏ |
| `skill viezan-extension-ux` | `popup`, `options`, `tooltip`, `bridge` | Review extension/local bridge |
| `skill viezan-live-perf-audit` | `audio`, `listener`, `throttle`, `cleanup` | Review live translate pipeline |
| `skill viezan-doc-sync` | `doc drift`, `architecture`, `README`, `PROMPTS` | Rà docs sau khi đổi code |

### Search by Source Area

| Source area | Từ khóa nên tìm | Artifact nên dùng |
|---|---|---|
| `electron/`, `preload`, `ipc` | `IPC`, `preload`, `keychain`, `contextBridge`, `externalUrl` | `audit-local-first-security`, `viezan-ipc-security-audit` |
| `src/services`, `src/lib`, provider registry | `provider`, `model`, `adapter`, `routing`, `API key` | `viezan-provider-integration`, `score-code` |
| `src/components`, `src/pages` | `component`, `modal`, `icon`, `i18n`, `layout` | `split-ui-component`, `audit-i18n-coverage` |
| `chrome-extension/` | `popup`, `options`, `tooltip`, `bridge`, `API Key` | `audit-extension-ux`, `audit-local-first-security` |
| Live Translate pipeline | `AudioContext`, `MediaStream`, `Whisper`, `subtitle`, `cleanup` | `audit-live-perf` |
| Locale files | `vi`, `en`, `ja`, `translation key`, `missing key` | `audit-i18n-coverage`, `viezan-i18n-audit` |
| Public/internal docs | `README`, `ARCHITECTURE`, `product-intro`, `provider-routing` | `sync-docs`, `viezan-doc-sync` |
| Release/build config | `release`, `package`, `signing`, `notarization`, `updater` | `release-readiness` |

### Search by Report Output

| Report keyword | Path pattern | Workflow |
|---|---|---|
| `dup-hardcode-report` | `viezanagent/fix/dup-hardcode-report-YYYYMMDD-HHmm.md` | `check-dup-hardcode` |
| `split-ui-report` | `viezanagent/report/split-ui-report-YYYYMMDD-HHmm.md` | `split-ui-component` |
| `vscode-problems-report` | `viezanagent/report/vscode-problems-report-YYYYMMDD-HHmm.md` | `fix-vscode-problems` |
| `local-first-security-audit` | `viezanagent/report/local-first-security-audit-YYYYMMDD-HHmm.md` | `audit-local-first-security` |
| `i18n-audit-report` | `viezanagent/report/i18n-audit-report-YYYYMMDD-HHmm.md` | `audit-i18n-coverage` |
| `extension-ux-report` | `viezanagent/report/extension-ux-report-YYYYMMDD-HHmm.md` | `audit-extension-ux` |
| `live-perf-report` | `viezanagent/report/live-perf-report-YYYYMMDD-HHmm.md` | `audit-live-perf` |
| `doc-sync-report` | `viezanagent/report/doc-sync-report-YYYYMMDD-HHmm.md` | `sync-docs` |

### Quick Search Commands

```bash
rg -n "provider|model|Local AI|Ollama|LM Studio" viezanagent/PROMPTS.md
rg -n "IPC|preload|API key|keychain|local-first" viezanagent/PROMPTS.md
rg -n "i18n|locale|vi|en|ja|hardcoded string" viezanagent/PROMPTS.md
rg -n "Chrome Extension|popup|options|local bridge" viezanagent/PROMPTS.md
rg -n "Live Translate|AudioContext|MediaStream|Whisper|subtitle" viezanagent/PROMPTS.md
rg -n "report|YYYYMMDD|dup-hardcode|doc-sync" viezanagent/PROMPTS.md
```
