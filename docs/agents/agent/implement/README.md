# Agent: implement

Dung khi user muon them tinh nang, sua hanh vi san pham, hoac implement PRD end-to-end.

Prompt ngan:

```text
Hay dung agent implement de implement:
[mo ta tinh nang / PRD]
```

Agent nay se tu:

1. Doc PRD va xac dinh product fit.
2. Lap impact map, contract va rui ro.
3. Ap dung rule `viezan-product-engineering` va `generate-code`.
4. Resolve `ship-viezan-feature` va cac skill/rule lien quan truoc khi sua code.
5. Reuse provider/security/i18n/extension/live-perf/docs capability khi scope cham cac domain do.
6. Sua code, cap nhat test, i18n va docs lien quan.
7. Chay verify phu hop va bao cao rule/skill/workflow da dung.

Neu capability can dung chua co trong `implement.json`, agent phai bao `Capability Drift` thay vi tu tao flow rieng.
