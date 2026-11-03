# Viezan Agent Pack

Day la lop giao dien chinh cho AI agent trong repo Viezan. Khi user prompt, uu tien chon agent theo muc dich cong viec thay vi goi truc tiep tung rule, skill hay workflow cu.

Rule, skill va workflow cu duoc xem la capability noi bo cua agent:

- `rule/`: guardrail nen.
- `skill/`: kha nang phan tich theo domain.
- `workflow/`: quy trinh chi tiet ma agent co the goi khi can.

Tat ca agent phai tuan theo [`CAPABILITY_CONTRACT.md`](./CAPABILITY_CONTRACT.md): resolve workflow/rule/skill da khai bao truoc khi phan tich, sua code hoac tao report. Neu capability can dung chua duoc khai bao hoac reference bi gay, agent phai bao `Capability Drift` va sua registry truoc khi tiep tuc.

## Quick Chooser

| User prompt ngan | Agent | Viec agent se tu lam |
|---|---|---|
| `Hay implement ...` | [`implement`](./implement/) | Doc PRD, lap impact map, code, i18n, test, docs, security gate |
| `Hay maintenance he thong` | [`maintenance`](./maintenance/) | Chay diagnostics, hardcode/duplicate, score-code, UI split, extension/perf/docs/i18n/security gates, fix High/Critical, bao cao co gate matrix |
| `Hay cap nhat docs` | [`docs`](./docs/) | Extract code truth, sync ARCHITECTURE/PROMPTS/product-intro/docs/README, bao cao drift |
| `Hay audit he thong` | [`audit`](./audit/) | Security/privacy, i18n, extension UX, live-perf, local-first gates |
| `Hay kiem tra release` | [`release`](./release/) | Product smoke, build/test/package, signing/notarization, release notes |

## Agent Contract

Moi agent JSON nen co:

- `type: "agent"`
- `classification.lifecycle`
- `classification.domain`
- `activation_examples`
- `primary_workflow` hoac `primary_workflows`
- `capabilities`
- `capability_resolution`
- `mandatory_capability_use`
- `operating_workflow`
- `outputs`

Agent duoc phep tu dong goi nhieu capability ben duoi neu user prompt o muc cao, vi du `hay maintenance he thong`.

Voi `agent maintenance`, report chi hop le khi co du cac section score-code, duplicate, hardcode va UI/component/extension. Neu capability nao khong chay, agent phai ghi `Not run`/`Blocked` kem ly do trong gate matrix.

## Capability Validation

Sau moi thay doi agent/rule/skill/workflow:

- Parse tat ca JSON trong `docs/agents`.
- Validate tat ca relative refs trong agent, rule, skill va workflow.
- Kiem tra moi agent co `capability_resolution` va `mandatory_capability_use`.
- Kiem tra docs entrypoint (`PROMPTS.md`, `README.md`) khop voi capability map moi.
