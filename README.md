# Viezan Agent

Bộ rule, skill và workflow cho AI agent khi làm việc trên repo Viezan. Mục tiêu: agent đọc đúng tài liệu, tuân thủ Main/Preload/Renderer boundary, giữ cam kết local-first và áp dụng nhất quán quy trình audit/refactor/release.

Khi không chắc nên dùng cái gì: mở [`PROMPTS.md`](./PROMPTS.md) — Quick Chooser sẽ map "muốn làm gì" sang rule/skill/workflow phù hợp.

## Cấu trúc

```
viezanagent/
├── ARCHITECTURE.md          ← Tài liệu kiến trúc Viezan (process model, IPC, providers, ...)
├── PROMPTS.md               ← Catalog prompt mẫu cho mọi rule/skill/workflow
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
├── rule/                    ← Rule định hướng: hằng số, không tự thay đổi qua thời gian ngắn
│   ├── generate-code/
│   └── viezan-product-engineering/
├── skill/                   ← Skill: tài năng phân tích/đánh giá theo domain
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
├── workflow/                ← Workflow: chuỗi step orchestration, có save_path cho report
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

## Index — Rules

| Rule | Mục đích |
|---|---|
| [`generate-code`](./rule/generate-code/) | Code quality chung (correctness, structure, maintainability, security, reliability, testing) |
| [`viezan-product-engineering`](./rule/viezan-product-engineering/) | Rule nền cho mọi thay đổi Viezan: product fit, local-first, Electron boundary, provider contract, UX/i18n |

## Index — Skills

| Skill | Mục đích |
|---|---|
| [`viezan-feature-planner`](./skill/viezan-feature-planner/) | Phân rã PRD/feature thành impact map, contracts, plan, verification, risks |
| [`viezan-provider-integration`](./skill/viezan-provider-integration/) | Thêm hoặc audit provider/model theo registry pattern và key safety |
| [`viezan-ipc-security-audit`](./skill/viezan-ipc-security-audit/) | Audit Electron IPC/preload/keychain/external URL/local-first boundary |
| [`viezan-i18n-audit`](./skill/viezan-i18n-audit/) | Audit i18n VI/EN/JA: missing key, hardcoded UI string, parity với Chrome Extension |
| [`viezan-extension-ux`](./skill/viezan-extension-ux/) | Audit UX Chrome Extension và bảo mật local bridge |
| [`viezan-live-perf-audit`](./skill/viezan-live-perf-audit/) | Audit hiệu năng và lifecycle pipeline Live Translate |
| [`viezan-doc-sync`](./skill/viezan-doc-sync/) | Phát hiện drift giữa code và docs (ARCHITECTURE/PROMPTS/product-intro/README) |
| [`check-dup-hardcode`](./skill/check-dup-hardcode/) | Phát hiện duplicate code và hardcode |
| [`score-code`](./skill/score-code/) | Chấm điểm theo rubric chất lượng code |
| [`split-ui-component`](./skill/split-ui-component/) | Phân loại UI component, icon registry, duplicate UI pattern |
| [`fix-vscode-problems`](./skill/fix-vscode-problems/) | Phân loại Problems từ VS Code/build/test/Biome và đề xuất fix |

## Index — Workflows

| Workflow | Mục đích | Report path |
|---|---|---|
| [`ship-viezan-feature`](./workflow/ship-viezan-feature/) | Implement feature end-to-end (PRD → code → test → docs) | — |
| [`audit-local-first-security`](./workflow/audit-local-first-security/) | Audit privacy/IPC/preload/key safety | `report/local-first-security-audit-*.md` |
| [`audit-i18n-coverage`](./workflow/audit-i18n-coverage/) | Audit i18n VI/EN/JA và hardcoded UI string | `report/i18n-audit-report-*.md` |
| [`audit-extension-ux`](./workflow/audit-extension-ux/) | Audit Chrome Extension UX và local bridge | `report/extension-ux-report-*.md` |
| [`audit-live-perf`](./workflow/audit-live-perf/) | Audit hiệu năng/lifecycle pipeline Live Translate | `report/live-perf-report-*.md` |
| [`sync-docs`](./workflow/sync-docs/) | Đồng bộ docs với code thực tế | `report/doc-sync-report-*.md` |
| [`release-readiness`](./workflow/release-readiness/) | Kiểm tra trước release | — |
| [`check-dup-hardcode`](./workflow/check-dup-hardcode/) | Kiểm tra duplicate code và hardcode | `fix/dup-hardcode-report-*.md` |
| [`score-code`](./workflow/score-code/) | Chấm điểm source code theo rubric | — |
| [`split-ui-component`](./workflow/split-ui-component/) | Phân tích UI component, icon registry | `report/split-ui-report-*.md` |
| [`fix-vscode-problems`](./workflow/fix-vscode-problems/) | Fix Problems từ VS Code/build/test | `report/vscode-problems-report-*.md` |

## Quy ước thêm asset mới

1. **Skill mới**: tạo folder `skill/<kebab-name>/`, có file `<kebab-name>.json` + `README.md`. JSON tối thiểu nên có `name`, `version`, `description`, `type: "skill"`, `trigger`, `references`.
2. **Workflow mới**: tạo folder `workflow/<kebab-name>/`, có file `<kebab-name>.json` + `README.md`. JSON tối thiểu nên có `name`, `version`, `description`, `type: "workflow"`, `trigger`, `steps`, `references`. Nếu workflow có lưu báo cáo: thêm `save_path` và `filename_pattern`.
3. **Rule mới**: tạo folder `rule/<kebab-name>/`, có file `rules.json` + `README.md`.
4. **Cập nhật `PROMPTS.md`**: thêm dòng vào Quick Chooser, thêm section Skill/Workflow tương ứng và (nếu có report) thêm hàng vào Report Paths.
5. **Cập nhật `README.md`** (file này): thêm dòng vào bảng Index tương ứng.
6. Validate cross-reference: `path` `../../...` trong JSON phải trỏ tới file có thật.

## Verify nhanh

```bash
# Validate tất cả JSON
find viezanagent -name "*.json" -exec sh -c 'jq -e . "$0" >/dev/null || echo FAIL: $0' {} \;

# Đếm skill/workflow
ls viezanagent/skill | wc -l
ls viezanagent/workflow | wc -l
```

## Khi nào dùng cái gì

Xem [`PROMPTS.md`](./PROMPTS.md) để có Quick Chooser đầy đủ và prompt mẫu cho từng rule/skill/workflow.
