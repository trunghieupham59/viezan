# Agent: release

Dung khi user muon kiem tra hoac chuan bi release.

Prompt ngan:

```text
Hay dung agent release de kiem tra release readiness
```

Agent nay gom product smoke, test/build/package, signing/notarization, security/i18n/docs gates va release notes.

Agent phai resolve `release-readiness` truoc khi ket luan ready/not ready. Security, i18n va docs gates la bat buoc cho moi release pass; extension UX va live/perf gate phai chay hoac duoc ghi `Not run`/`Blocked` kem ly do. Khong publish hoac ket luan ready neu required gate bi bo qua im lang.
