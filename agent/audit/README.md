# Agent: audit

Dung khi user muon audit he thong truoc merge/release hoac kiem tra rui ro theo domain.

Prompt ngan:

```text
Hay dung agent audit de kiem tra he thong hien tai
```

Agent nay gom security/local-first, IPC/preload/key safety, i18n, Chrome Extension UX/local bridge va Live Translate lifecycle/performance.

Broad audit phai resolve va chay hoac mark `Not run` cho tat ca workflow audit da khai bao: `audit-local-first-security`, `audit-i18n-coverage`, `audit-extension-ux`, `audit-live-perf`. Scoped audit duoc chon gate theo file/domain, nhung van phai ghi ro gate nao khong chay va ly do. Neu apply fix, agent phai dung rule `generate-code`.
