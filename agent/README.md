# Viezan Agent Pack

Day la lop giao dien chinh cho AI agent trong repo Viezan. Khi user prompt, uu tien chon agent theo muc dich cong viec thay vi goi truc tiep tung rule, skill hay workflow cu.

Rule, skill va workflow cu duoc xem la capability noi bo cua agent:

- `rule/`: guardrail nen.
- `skill/`: kha nang phan tich theo domain.
- `workflow/`: quy trinh chi tiet ma agent co the goi khi can.

## Quick Chooser

| User prompt ngan | Agent | Viec agent se tu lam |
|---|---|---|
| `Hay implement ...` | [`implement`](./implement/) | Doc PRD, lap impact map, code, i18n, test, docs, security gate |
| `Hay maintenance he thong` | [`maintenance`](./maintenance/) | Chay diagnostics, hardcode/duplicate, score-code, UI split, docs drift, fix High/Critical, bao cao |
| `Hay cap nhat docs` | [`docs`](./docs/) | Extract code truth, sync ARCHITECTURE/PROMPTS/product-intro/docs/README, bao cao drift |
| `Hay audit he thong` | [`audit`](./audit/) | Security/privacy, i18n, extension UX, live-perf, local-first gates |
| `Hay kiem tra release` | [`release`](./release/) | Product smoke, build/test/package, signing/notarization, release notes |

## Agent Contract

Moi agent JSON nen co:

- `type: "agent"`
- `classification.lifecycle`
- `classification.domain`
- `activation_examples`
- `capabilities`
- `operating_workflow`
- `outputs`

Agent duoc phep tu dong goi nhieu capability ben duoi neu user prompt o muc cao, vi du `hay maintenance he thong`.
