# Prompt Guide - Viezan Agent Pack

Tu bay gio, user nen goi **agent theo muc dich cong viec** thay vi phai nho rieng `rule`, `skill`, `workflow`.

Rule, skill va workflow cu van ton tai, nhung chi la capability noi bo. Agent se tu chon capability phu hop, tu danh gia, tu fix trong scope va bao cao lai.

---

## Capability-First Contract

Moi agent phai resolve capability graph da khai bao truoc khi chay:

```text
agent -> primary workflow(s) -> rules/skills/related workflows -> report
```

- Khong tu tao quy trinh ad hoc neu rule/skill/workflow phu hop da ton tai.
- Chi dung capability duoc khai bao trong agent JSON hoac duoc workflow chinh link truc tiep/gian tiep.
- Neu can capability moi hoac reference bi gay, ghi `Capability Drift` va cap nhat registry agent/workflow/skill/rule truoc.
- Report cuoi phai ghi ro rule, skill va workflow da dung; gate khong chay phai co `Not run`/`Blocked` kem ly do.

Chi tiet: `docs/agents/agent/CAPABILITY_CONTRACT.md`.

---

## Quick Chooser

| User muon | Prompt ngan nen dung | Agent chinh |
|---|---|---|
| Implement PRD/feature | `Hay dung agent implement de implement ...` | `agent implement` |
| Maintenance he thong | `Hay dung agent maintenance de maintenance he thong` | `agent maintenance` |
| Cap nhat/tong hop docs | `Hay dung agent docs de cap nhat docs theo code hien tai` | `agent docs` |
| Audit rui ro truoc merge/release | `Hay dung agent audit de audit he thong hien tai` | `agent audit` |
| Kiem tra/chuan bi release | `Hay dung agent release de kiem tra release readiness` | `agent release` |

Neu user noi chung chung:

- `maintenance he thong` -> dung `agent maintenance`.
- `implement cai nay` -> dung `agent implement`.
- `cap nhat docs` -> dung `agent docs`.
- `audit source hien tai` -> dung `agent audit`.
- `release/readiness/package` -> dung `agent release`.

---

## Agent Catalog

### `agent implement`

Muc dich: ship tinh nang end-to-end.

Capabilities noi bo:

- Rules: `viezan-product-engineering`, `generate-code`.
- Skills: `viezan-feature-planner`, `viezan-provider-integration`, `viezan-ipc-security-audit`, `viezan-i18n-audit`, `viezan-doc-sync`, `viezan-extension-ux`, `viezan-live-perf-audit`.
- Workflows: `ship-viezan-feature`, `audit-local-first-security`, `audit-i18n-coverage`, `audit-extension-ux`, `audit-live-perf`, `sync-docs`.

Prompt mau:

```text
Hay dung agent implement de implement PRD sau:
[noi dung PRD]
```

### `agent maintenance`

Muc dich: bao tri he thong, gom cac workflow cu thanh mot luong duy nhat.

Capabilities noi bo:

- Workflow chinh: `workflow maintenance`.
- Workflows duoc gom: `fix-vscode-problems`, `check-dup-hardcode`, `score-code`, `split-ui-component`, `sync-docs`, `audit-i18n-coverage`, `audit-local-first-security`, `audit-extension-ux`, `audit-live-perf`, `release-readiness`.
- Skills: `fix-vscode-problems`, `check-dup-hardcode`, `score-code`, `split-ui-component`, `viezan-doc-sync`, `viezan-i18n-audit`, `viezan-ipc-security-audit`, `viezan-extension-ux`, `viezan-live-perf-audit`.
- Rules: `viezan-product-engineering`, `generate-code`.

Prompt mau:

```text
Hay dung agent maintenance de maintenance he thong hien tai.
Tu danh gia diagnostics, hardcode/duplicate, code quality, UI drift, docs drift, i18n/security gates.
Fix Critical/High trong scope va tao bao cao tong hop.
```

Report bat buoc khong duoc bo cac muc: `Maintenance Gate Matrix`, `System Score`, `Duplicate Code Audit`, `Hardcode & Secret Audit`, `UI/Component/Extension Audit`, `Docs/I18n/Security Gates`, `Verification`, `Remaining Queue`, `Report Completeness Checklist`. Neu gate nao khong chay, ghi `Not run`/`Blocked` kem ly do thay vi bo qua.

Bao cao mac dinh: `docs/agents/reports/maintenance-report-YYYYMMDD-HHmm.md`.

### `agent docs`

Muc dich: dong bo tai lieu voi code that.

Capabilities noi bo:

- Skill: `viezan-doc-sync`.
- Workflow: `sync-docs`, `audit-i18n-coverage` khi docs cham UI text/locale/extension copy.
- Docs source: `ARCHITECTURE.md`, `PROMPTS.md`, `product-intro.md`, `docs/migration/legacy-reference/agent-handbook/manual/`, `README.md`, `chrome-extension/README.md`.

Prompt mau:

```text
Hay dung agent docs de cap nhat docs theo source code hien tai.
```

Bao cao mac dinh: `docs/agents/reports/doc-sync-report-YYYYMMDD-HHmm.md`.

### `agent audit`

Muc dich: audit rui ro theo domain.

Capabilities noi bo:

- Security/local-first: `audit-local-first-security`, `viezan-ipc-security-audit`.
- i18n: `audit-i18n-coverage`, `viezan-i18n-audit`.
- Extension UX/local bridge: `audit-extension-ux`, `viezan-extension-ux`.
- Live Translate perf/lifecycle: `audit-live-perf`, `viezan-live-perf-audit`.

Prompt mau:

```text
Hay dung agent audit de audit he thong hien tai truoc merge.
Tap trung security/privacy, i18n, extension va live translate.
```

Bao cao mac dinh: `docs/agents/reports/audit-report-YYYYMMDD-HHmm.md`.

### `agent release`

Muc dich: kiem tra hoac chuan bi release.

Capabilities noi bo:

- Workflow: `release-readiness`.
- Gates phu: `audit-local-first-security`, `audit-i18n-coverage`, `sync-docs`.
- Checks: product smoke, tests/build/package, signing/notarization, release notes, assets.

Prompt mau:

```text
Hay dung agent release de kiem tra release readiness cho version hien tai.
```

Bao cao mac dinh: `docs/agents/reports/release-readiness-report-YYYYMMDD-HHmm.md`.

---

## Khi Nao Goi Capability Truc Tiep

Chi goi workflow/skill/rule cu khi user chi dinh rat hep:

| User chi dinh | Co the goi truc tiep |
|---|---|
| Chi fix mot diagnostic/Biome file-local | `workflow fix-vscode-problems` |
| Chi scan hardcode/duplicate mot folder | `workflow check-dup-hardcode` |
| Chi cham diem mot diff | `workflow score-code` |
| Chi audit UI component/icon | `workflow split-ui-component` |
| Chi sync docs | `workflow sync-docs` |
| Chi security gate | `workflow audit-local-first-security` |

Neu user khong chi dinh hep, dung agent purpose-level.

---

## Agent-To-Capability Map

| Agent | Rules | Skills | Workflows |
|---|---|---|---|
| `implement` | `viezan-product-engineering`, `generate-code` | `viezan-feature-planner`, `viezan-provider-integration`, `viezan-ipc-security-audit`, `viezan-i18n-audit`, `viezan-doc-sync`, `viezan-extension-ux`, `viezan-live-perf-audit` | `ship-viezan-feature`, `audit-local-first-security`, `audit-i18n-coverage`, `audit-extension-ux`, `audit-live-perf`, `sync-docs` |
| `maintenance` | `viezan-product-engineering`, `generate-code` | `fix-vscode-problems`, `check-dup-hardcode`, `score-code`, `split-ui-component`, `viezan-doc-sync`, `viezan-i18n-audit`, `viezan-ipc-security-audit`, `viezan-extension-ux`, `viezan-live-perf-audit` | `maintenance`, `fix-vscode-problems`, `check-dup-hardcode`, `score-code`, `split-ui-component`, `sync-docs`, `audit-i18n-coverage`, `audit-local-first-security`, `audit-extension-ux`, `audit-live-perf`, `release-readiness` |
| `docs` | `viezan-product-engineering` | `viezan-doc-sync`, `viezan-i18n-audit` | `sync-docs`, `audit-i18n-coverage` |
| `audit` | `viezan-product-engineering`, `generate-code` | `viezan-ipc-security-audit`, `viezan-i18n-audit`, `viezan-extension-ux`, `viezan-live-perf-audit` | `audit-local-first-security`, `audit-i18n-coverage`, `audit-extension-ux`, `audit-live-perf` |
| `release` | `viezan-product-engineering`, `generate-code` | `viezan-ipc-security-audit`, `viezan-i18n-audit`, `viezan-doc-sync`, `viezan-extension-ux`, `viezan-live-perf-audit` | `release-readiness`, `audit-local-first-security`, `audit-i18n-coverage`, `audit-extension-ux`, `audit-live-perf`, `sync-docs` |

---

## Report Paths

| Agent / Workflow | Report path |
|---|---|
| `agent maintenance` / `workflow maintenance` | `docs/agents/reports/maintenance-report-YYYYMMDD-HHmm.md` |
| `agent docs` / `workflow sync-docs` | `docs/agents/reports/doc-sync-report-YYYYMMDD-HHmm.md` |
| `agent audit` | `docs/agents/reports/audit-report-YYYYMMDD-HHmm.md` |
| `agent release` | `docs/agents/reports/release-readiness-report-YYYYMMDD-HHmm.md` |
| `workflow check-dup-hardcode` | `docs/agents/fixes/dup-hardcode-report-YYYYMMDD-HHmm.md` |
| `workflow split-ui-component` | `docs/agents/reports/split-ui-report-YYYYMMDD-HHmm.md` |
| `workflow fix-vscode-problems` | `docs/agents/reports/vscode-problems-report-YYYYMMDD-HHmm.md` |
| `workflow audit-local-first-security` | `docs/agents/reports/local-first-security-audit-YYYYMMDD-HHmm.md` |
| `workflow audit-i18n-coverage` | `docs/agents/reports/i18n-audit-report-YYYYMMDD-HHmm.md` |
| `workflow audit-extension-ux` | `docs/agents/reports/extension-ux-report-YYYYMMDD-HHmm.md` |
| `workflow audit-live-perf` | `docs/agents/reports/live-perf-report-YYYYMMDD-HHmm.md` |

---

## Search Index

| Tu khoa user | Agent mac dinh |
|---|---|
| `implement`, `PRD`, `feature`, `provider`, `model`, `Local AI` | `agent implement` |
| `maintenance`, `bao tri`, `technical debt`, `hardcode`, `duplicate`, `Biome`, `Problems`, `refactor`, `UI split` | `agent maintenance` |
| `docs`, `README`, `ARCHITECTURE`, `product-intro`, `drift`, `sync` | `agent docs` |
| `audit`, `security`, `privacy`, `IPC`, `preload`, `API key`, `i18n`, `extension`, `live translate` | `agent audit` |
| `release`, `build`, `package`, `signing`, `notarization`, `asset`, `tag` | `agent release` |

## Quick Validation Commands

```bash
find docs/agents -name "*.json" -exec jq -e . {} \;
jq -r '[.type,.classification.lifecycle,.name,(.classification.domain|join(","))] | @tsv' \
  docs/agents/agent/*/*.json docs/agents/rule/*/*.json docs/agents/skill/*/*.json docs/agents/workflow/*/*.json | sort
```

## Native desktop migration

Dùng [agent native-migration](agent/native-migration/native-migration.json) cho
chuyển đổi Electron, thiết kế native và nghiệm thu đa nhiệm.
Workflow: [native-migration](workflow/native-migration/native-migration.json).
Rule: [native-migration](rule/native-migration/rules.json).
Skills: [migration](skill/viezan-native-migration/SKILL.md),
[UX acceptance](skill/viezan-native-ux/SKILL.md).
Plan: [docs/migration](../migration/README.md).
Report: `docs/migration/reports/native-migration-report-*.md`.
Đây là capability mới; chưa thay kiến trúc Electron đang vận hành.
