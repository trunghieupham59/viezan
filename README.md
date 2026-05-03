# Viezan Agent

Bộ rule, skill và workflow cho AI agent khi làm việc trên repo Viezan. Mục tiêu: agent đọc đúng tài liệu, tuân thủ Main/Preload/Renderer boundary, giữ cam kết local-first và áp dụng nhất quán quy trình feature/maintenance/audit/release.

Khi không chắc nên dùng cái gì: mở [`PROMPTS.md`](./PROMPTS.md) — Quick Chooser sẽ map "muốn làm gì" sang rule/skill/workflow phù hợp. Mỗi JSON trong `rule/`, `skill/`, `workflow/` cũng có `classification.lifecycle` và `classification.domain` để agent đọc bằng máy.

## Cấu trúc

```
viezanagent/
├── ARCHITECTURE.md          ← Tài liệu kiến trúc Viezan (process model, IPC, providers, ...)
├── PROMPTS.md               ← Catalog prompt mẫu và Category Map cho mọi rule/skill/workflow
├── product-intro.md         ← Giá trị sản phẩm, providers, locales, platforms
├── README.md                ← (file này) — index toàn bộ agent assets
├── docs/                    ← Docs domain: live translate, TTS, provider routing, security
│   ├── live_trans.md
│   ├── live-translate-pipeline.md
│   ├── tts.md
│   ├── TTS_ARCHITECTURE.md
│   ├── provider-routing.md
│   ├── security-boundaries.md
│   └── phase_2/local-ai-agent-tasks.md
├── rule/                    ← Rule nền (`classification.lifecycle: foundation`)
│   ├── generate-code/
│   └── viezan-product-engineering/
├── skill/                   ← Skill theo domain (`feature`, `maintenance`, `audit`)
│   ├── check-dup-hardcode/
│   ├── fix-vscode-problems/
│   ├── score-code/
│   ├── split-ui-component/
│   ├── viezan-doc-sync/
│   ├── viezan-extension-ux/
│   ├── viezan-feature-planner/
│   ├── viezan-i18n-audit/
│   ├── viezan-ipc-security-audit/
│   ├── viezan-live-perf-audit/
│   └── viezan-provider-integration/
├── workflow/                ← Workflow theo vòng đời task (`feature`, `maintenance`, `audit`)
│   ├── audit-extension-ux/
│   ├── audit-i18n-coverage/
│   ├── audit-live-perf/
│   ├── audit-local-first-security/
│   ├── check-dup-hardcode/
│   ├── fix-vscode-problems/
│   ├── release-readiness/
│   ├── score-code/
│   ├── ship-viezan-feature/
│   ├── split-ui-component/
│   └── sync-docs/
└── report/                  ← Nơi lưu báo cáo workflow (bỏ qua cũ trong git)
```

## Phân loại chính thức

| Lifecycle | Mục đích | Artifact chính |
|---|---|---|
| `foundation` | Rule nền áp dụng xuyên suốt khi code/review/refactor | `viezan-product-engineering`, `generate-code` |
| `feature` | Lập kế hoạch và ship tính năng/provider/model mới | `ship-viezan-feature`, `viezan-feature-planner`, `viezan-provider-integration` |
| `maintenance` | Fix diagnostics, refactor debt, hardcode/duplicate, docs sync, release gate | `fix-vscode-problems`, `check-dup-hardcode`, `score-code`, `split-ui-component`, `sync-docs`, `release-readiness` |
| `audit` | Kiểm tra rủi ro security/i18n/extension/live-perf trước merge/release | `audit-local-first-security`, `audit-i18n-coverage`, `audit-extension-ux`, `audit-live-perf` |

Domain tags phổ biến: `product-engineering`, `code-quality`, `security-privacy`, `electron-boundary`, `provider-models`, `local-ai`, `i18n`, `extension`, `live-translate`, `ui-components`, `diagnostics`, `docs`, `release`.

## Index — Rules

| Rule | Lifecycle | Domain chính | Mục đích |
|---|---|---|---|
| [`generate-code`](./rule/generate-code/) | `foundation` | code-quality, maintainability, testing | Code quality chung (correctness, structure, maintainability, security, reliability, testing) |
| [`viezan-product-engineering`](./rule/viezan-product-engineering/) | `foundation` | product, local-first, Electron, provider, UX/i18n | Rule nền cho mọi thay đổi Viezan: product fit, local-first, Electron boundary, provider contract, UX/i18n |

## Index — Skills

| Skill | Lifecycle | Domain chính | Mục đích |
|---|---|---|---|
| [`viezan-feature-planner`](./skill/viezan-feature-planner/) | `feature` | planning, product | Phân rã PRD/feature thành impact map, contracts, plan, verification, risks |
| [`viezan-provider-integration`](./skill/viezan-provider-integration/) | `feature` | provider, model, Local AI | Thêm hoặc audit provider/model theo registry pattern và key safety |
| [`check-dup-hardcode`](./skill/check-dup-hardcode/) | `maintenance` | duplicate, hardcode, security | Phát hiện duplicate code và hardcode |
| [`fix-vscode-problems`](./skill/fix-vscode-problems/) | `maintenance` | diagnostics, build, test | Phân loại Problems từ VS Code/build/test/Biome và đề xuất fix |
| [`score-code`](./skill/score-code/) | `maintenance` | rubric, review | Chấm điểm theo rubric chất lượng code |
| [`split-ui-component`](./skill/split-ui-component/) | `maintenance` | UI component, extension | Phân loại UI component, icon registry, duplicate UI pattern |
| [`viezan-doc-sync`](./skill/viezan-doc-sync/) | `maintenance` | docs, drift, release | Phát hiện drift giữa code và docs (ARCHITECTURE/PROMPTS/product-intro/README) |
| [`viezan-ipc-security-audit`](./skill/viezan-ipc-security-audit/) | `audit` | IPC, keychain, local-first | Audit Electron IPC/preload/keychain/external URL/local-first boundary |
| [`viezan-i18n-audit`](./skill/viezan-i18n-audit/) | `audit` | i18n, locale, extension | Audit i18n VI/EN/JA: missing key, hardcoded UI string, parity với Chrome Extension |
| [`viezan-extension-ux`](./skill/viezan-extension-ux/) | `audit` | extension, UX, bridge | Audit UX Chrome Extension và bảo mật local bridge |
| [`viezan-live-perf-audit`](./skill/viezan-live-perf-audit/) | `audit` | live translate, performance | Audit hiệu năng và lifecycle pipeline Live Translate |

## Index — Workflows

| Workflow | Lifecycle | Domain chính | Mục đích | Report path |
|---|---|---|---|---|
| [`ship-viezan-feature`](./workflow/ship-viezan-feature/) | `feature` | feature, product, i18n, security | Implement feature end-to-end (PRD -> code -> test -> docs) | — |
| [`check-dup-hardcode`](./workflow/check-dup-hardcode/) | `maintenance` | duplicate, hardcode, security | Kiểm tra duplicate code và hardcode | `fix/dup-hardcode-report-*.md` |
| [`fix-vscode-problems`](./workflow/fix-vscode-problems/) | `maintenance` | diagnostics, build, test | Fix Problems từ VS Code/build/test | `report/vscode-problems-report-*.md` |
| [`score-code`](./workflow/score-code/) | `maintenance` | rubric, review | Chấm điểm source code theo rubric | — |
| [`split-ui-component`](./workflow/split-ui-component/) | `maintenance` | UI component, extension drift | Phân tích UI component, icon registry | `report/split-ui-report-*.md` |
| [`sync-docs`](./workflow/sync-docs/) | `maintenance` | docs, drift | Đồng bộ docs với code thực tế | `report/doc-sync-report-*.md` |
| [`release-readiness`](./workflow/release-readiness/) | `maintenance` | release, package, smoke | Kiểm tra trước release | — |
| [`audit-local-first-security`](./workflow/audit-local-first-security/) | `audit` | privacy, IPC, preload, key safety | Audit privacy/IPC/preload/key safety | `report/local-first-security-audit-*.md` |
| [`audit-i18n-coverage`](./workflow/audit-i18n-coverage/) | `audit` | i18n, locale, extension | Audit i18n VI/EN/JA và hardcoded UI string | `report/i18n-audit-report-*.md` |
| [`audit-extension-ux`](./workflow/audit-extension-ux/) | `audit` | extension, UX, bridge | Audit Chrome Extension UX và local bridge | `report/extension-ux-report-*.md` |
| [`audit-live-perf`](./workflow/audit-live-perf/) | `audit` | live translate, performance | Audit hiệu năng/lifecycle pipeline Live Translate | `report/live-perf-report-*.md` |

## Quy ước thêm asset mới

1. **Skill mới**: tạo folder `skill/<kebab-name>/`, có file `<kebab-name>.json` + `README.md`. JSON tối thiểu nên có `name`, `version`, `description`, `type: "skill"`, `classification`, `trigger`, `references`.
2. **Workflow mới**: tạo folder `workflow/<kebab-name>/`, có file `<kebab-name>.json` + `README.md`. JSON tối thiểu nên có `name`, `version`, `description`, `type: "workflow"`, `classification`, `trigger`, `steps`, `references`. Nếu workflow có lưu báo cáo: thêm `save_path` và `filename_pattern`.
3. **Rule mới**: tạo folder `rule/<kebab-name>/`, có file `rules.json` + `README.md`. JSON tối thiểu nên có `classification.lifecycle: "foundation"`.
4. **Classification bắt buộc**: chọn đúng `classification.lifecycle` (`foundation`, `feature`, `maintenance`, `audit`), điền `classification.domain` và `classification.use_for`.
5. **Cập nhật `PROMPTS.md`**: thêm dòng vào Quick Chooser, Category Map, section Skill/Workflow tương ứng và (nếu có report) thêm hàng vào Report Paths.
6. **Cập nhật `README.md`** (file này): thêm dòng vào bảng Index tương ứng.
7. Validate cross-reference: `path` `../../...` trong JSON phải trỏ tới file có thật.

## Verify nhanh

```bash
# Validate tất cả JSON
find viezanagent -name "*.json" -exec sh -c 'jq -e . "$0" >/dev/null || echo FAIL: $0' {} \;

# Xem phân loại rule/skill/workflow
jq -r '[.classification.lifecycle,.type,.name,(.classification.domain|join(","))] | @tsv' \
  viezanagent/rule/*/*.json viezanagent/skill/*/*.json viezanagent/workflow/*/*.json | sort

# Đếm skill/workflow
ls viezanagent/skill | wc -l
ls viezanagent/workflow | wc -l
```

## Khi nào dùng cái gì

Xem [`PROMPTS.md`](./PROMPTS.md) để có Quick Chooser đầy đủ và prompt mẫu cho từng rule/skill/workflow.
