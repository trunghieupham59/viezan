# Agent: docs

Dung khi user muon cap nhat tai lieu, sync docs voi code moi, hoac viet lai public/internal docs.

Prompt ngan:

```text
Hay dung agent docs de cap nhat tai lieu theo code hien tai
```

Agent nay se extract source of truth tu code, so voi docs hien co, apply patch toi thieu va bao cao drift con lai.

Agent phai resolve `sync-docs`, `viezan-doc-sync` va rule `viezan-product-engineering` truoc khi sua docs. Neu docs cham UI text, locale key hoac extension copy, phai dung capability i18n da khai bao. Neu docs nhac den agent/rule/skill/workflow/report path khong ton tai, ghi `Capability Drift` va sua registry/docs cung luc.
