# Viezan Agent

Bo agent cho AI khi lam viec tren repo Viezan. Giao dien chinh bay gio la **purpose agent**: user chi can noi `implement`, `maintenance`, `docs`, `audit` hoac `release`; agent se tu chon rule/skill/workflow noi bo de lam viec.

Khi khong chac nen dung gi: mo [`PROMPTS.md`](./PROMPTS.md). Day la entry point cho prompt ngan.

## Cau truc

```text
viezanagent/
├── agent/                   <- Purpose agents: implement, maintenance, docs, audit, release
│   └── CAPABILITY_CONTRACT.md
├── workflow/                <- Workflow capability layer; `maintenance/` la workflow tong hop moi
├── skill/                   <- Domain analysis capabilities used by agents
├── rule/                    <- Foundation guardrails used by agents
├── docs/                    <- Viezan domain docs
├── report/                  <- Workflow/agent reports
├── fix/                     <- Fix-oriented reports
├── ARCHITECTURE.md
├── PROMPTS.md
├── product-intro.md
└── README.md
```

## Agent Chinh

| Agent | Khi user noi | Agent se tu dung |
|---|---|---|
| [`implement`](./agent/implement/) | `Hay implement ...` | `ship-viezan-feature`, `viezan-feature-planner`, provider/security/i18n/docs gates |
| [`maintenance`](./agent/maintenance/) | `Hay maintenance he thong` | `workflow maintenance`, diagnostics, hardcode/duplicate, score-code, UI split, extension drift, docs drift, i18n/security/perf gates |
| [`docs`](./agent/docs/) | `Hay cap nhat docs` | `sync-docs`, `viezan-doc-sync`, code truth extraction |
| [`audit`](./agent/audit/) | `Hay audit he thong` | local-first security, i18n, extension UX, live-perf workflows |
| [`release`](./agent/release/) | `Hay kiem tra release` | `release-readiness`, build/test/package, signing/notarization, docs/release notes gates |

## Capability Contract

Tat ca agent phai tuan theo [`agent/CAPABILITY_CONTRACT.md`](./agent/CAPABILITY_CONTRACT.md):

- Resolve `primary_workflow` hoac `primary_workflows` truoc khi phan tich/sua code.
- Dung rule/skill/workflow da khai bao trong agent JSON hoac duoc workflow chinh link truc tiep/gian tiep.
- Neu capability can dung chua ton tai hoac reference bi gay, bao `Capability Drift` va sua registry truoc.
- Report cuoi phai ghi ro rule, skill va workflow da dung; gate skipped phai co `Not run`/`Blocked` kem ly do.

## Workflow Da Gom

`workflow/maintenance` la workflow tong hop cho maintenance. No gom cac workflow cu:

- `fix-vscode-problems`
- `check-dup-hardcode`
- `score-code`
- `split-ui-component`
- `sync-docs`
- `audit-i18n-coverage`
- `audit-local-first-security`
- `audit-extension-ux`
- `audit-live-perf`
- `release-readiness` khi scope co release/package

Prompt mac dinh:

```text
Hay dung agent maintenance de maintenance he thong hien tai.
Tu danh gia diagnostics, hardcode/duplicate, code quality, UI drift, docs drift, i18n/security gates.
Fix Critical/High trong scope va tao bao cao tong hop.
```

Bao cao mac dinh: `viezanagent/report/maintenance-report-YYYYMMDD-HHmm.md`.

Report maintenance phai co gate matrix va section rieng cho `System Score`, `Duplicate Code Audit`, `Hardcode & Secret Audit`, `UI/Component/Extension Audit`, `Docs/I18n/Security Gates` va `Report Completeness Checklist`. Gate khong chay phai duoc ghi `Not run`/`Blocked` kem ly do, khong duoc bo qua.

## Capability Noi Bo

Rule/skill/workflow cu khong phai la entry point chinh nua. Chuyen vai tro:

| Layer | Vai tro moi | Khi nao doc truc tiep |
|---|---|---|
| `agent/` | Giao dien prompt theo muc dich cong viec | Luon doc dau tien |
| `workflow/` | Quy trinh orchestration ben trong agent | Khi debug/chay gate hep |
| `skill/` | Rubric/analysis domain-specific | Khi workflow can phan tich sau |
| `rule/` | Guardrail nen | Khi implement/review/refactor |

## Report Paths

| Agent / Workflow | Report path |
|---|---|
| `agent maintenance` / `workflow maintenance` | `report/maintenance-report-*.md` |
| `agent docs` / `workflow sync-docs` | `report/doc-sync-report-*.md` |
| `agent audit` | `report/audit-report-*.md` |
| `agent release` | `report/release-readiness-report-*.md` |
| `workflow check-dup-hardcode` | `fix/dup-hardcode-report-*.md` |
| `workflow split-ui-component` | `report/split-ui-report-*.md` |
| `workflow fix-vscode-problems` | `report/vscode-problems-report-*.md` |
| `workflow audit-local-first-security` | `report/local-first-security-audit-*.md` |
| `workflow audit-i18n-coverage` | `report/i18n-audit-report-*.md` |
| `workflow audit-extension-ux` | `report/extension-ux-report-*.md` |
| `workflow audit-live-perf` | `report/live-perf-report-*.md` |

## Quy Uoc Them/Sua Agent

1. Neu them muc dich cong viec moi, tao `agent/<name>/<name>.json` va `README.md` truoc.
2. JSON agent toi thieu co `name`, `version`, `description`, `type: "agent"`, `classification`, `activation_examples`, `capabilities`, `operating_workflow`, `outputs`.
3. Chi tao workflow/skill/rule moi khi agent hien tai thieu capability that su.
4. Khi them capability, cap nhat `agent/*/*.json`, [`PROMPTS.md`](./PROMPTS.md), file nay va `viezan-doc-sync`.
5. Neu workflow co report, them `save_path` va `filename_pattern`.
6. Validate cross-reference trong JSON sau khi sua.

## Verify Nhanh

```bash
# Validate JSON
find viezanagent -name "*.json" -exec jq -e . {} \;

# Xem agent/capability map
jq -r '[.type,.classification.lifecycle,.name,(.classification.domain|join(","))] | @tsv' \
  viezanagent/agent/*/*.json viezanagent/rule/*/*.json viezanagent/skill/*/*.json viezanagent/workflow/*/*.json | sort

# Kiem tra path noi bo
rg -n "\"\\.\\./" viezanagent/agent viezanagent/workflow viezanagent/skill viezanagent/rule

# Kiem tra agent contract
jq -e '.capability_resolution and .mandatory_capability_use' viezanagent/agent/*/*.json
```
