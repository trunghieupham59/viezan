# Skill: viezan-extension-ux

Skill audit và thiết kế UX cho Chrome Extension của Viezan: popup quick translate, options page, selection tooltip, floating button, background service worker và local bridge với Electron app.

## Khi dùng

```text
Dùng skill viezan-extension-ux để audit popup/options/tooltip Chrome Extension.
```

```text
Dùng skill viezan-extension-ux để review thay đổi local bridge giữa extension và Electron app.
```

## 5 surface cần xét

| Surface | Files |
|---|---|
| Popup | `chrome-extension/popup.html`, `popup.js`, `extension-ui.css`, `model-display.js` |
| Options | `chrome-extension/options.html`, `options.js` |
| Content script | `chrome-extension/content.js`, `content.css` |
| Background | `chrome-extension/background.js` |
| Local bridge | `electron/ipc/localServer.ts`, `electron/preload/localServer.ts`, `electron/preload/legacyAssistant.ts` |

## Output chuẩn

```markdown
## Surface Map
- Popup:
- Options:
- Content script:
- Background:
- Local bridge:

## Findings
| Severity | Surface | Issue | Fix |

## State UX Verdict
- missing-token / offline / loading / error / success: covered?

## Bridge Security Verdict
- bind address:
- origin allowlist:
- key exposure:
- payload validation:

## Required Fixes
1. ...

## Manual Smoke Plan
- ...
```

## Checklist nhanh

- Popup, Options, Tooltip có cùng visual language không?
- Có emoji hoặc inline SVG trang trí trong popup.js / content.js không?
- Mọi state (missing-token, offline, loading, error, success) có UX rõ ràng không?
- Options storage key có khớp với popup/tooltip đọc không?
- Local bridge có bind 127.0.0.1, có origin allowlist, có giấu raw API key không?
- Có manual smoke translate/copy/replace/listen sau thay đổi không?
