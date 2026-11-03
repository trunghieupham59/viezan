# Skill: viezan-ipc-security-audit

Skill audit thay đổi liên quan Electron IPC, preload, keychain, provider call, URL mở ngoài và local-first privacy của Viezan.

## Khi dùng

```text
Dùng skill viezan-ipc-security-audit để review thay đổi IPC/preload/provider.
```

```text
Audit xem feature này có làm lộ API key hoặc dữ liệu người dùng không.
```

## Các lớp cần kiểm tra

| Layer | Rủi ro chính |
|---|---|
| Renderer `src/` | Import Node/Electron/SDK, nhận raw key, hardcode secret, log dữ liệu |
| Preload `electron/preload/` | Expose API quá rộng, return raw key, thiếu type hẹp |
| IPC `electron/ipc/` | Không validate input, gọi provider sai key/model, log sensitive data |
| Main `electron/main.ts` | Navigation/window/external URL không chặn đúng |
| Storage | Persist key/transcript/ảnh ngoài ý muốn |

## Output chuẩn

```markdown
## Findings
| Severity | File | Issue | Fix |
|---|---|---|---|

## Security Boundary Verdict
- Renderer key exposure:
- Node access:
- IPC validation:
- External URL:
- Local-first promise:

## Required Fixes
1. ...

## Verification
- Commands:
- Manual checks:
```

