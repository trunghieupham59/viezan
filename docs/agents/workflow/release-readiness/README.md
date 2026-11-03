# Workflow: release-readiness

Workflow kiểm tra Viezan trước khi build/release desktop app.

## Cách dùng

```text
Dùng workflow release-readiness để kiểm tra trước release.
```

## Phạm vi

- Product smoke test: translate, live, image, chat, TTS/STT, settings, history, extension bridge.
- Chrome Extension smoke test: popup, options, selection tooltip, copy/replace/listen, offline/token states.
- Security/local-first audit.
- i18n completeness.
- Build/test/package sanity.
- Docs/release notes.

Docs/release notes là gate bắt buộc: chạy `npm run check:docs` và
`npm run test:docs`, kiểm tra README theo source của bản phát hành và mục version
trong `CHANGELOG.md`. Nếu review đã cũ, dùng `sync-docs` để rà rồi mới ghi lại
`docs:review`; không refresh fingerprint tự động để vượt gate.

## Output

```markdown
## Release Readiness
| Gate | Status | Notes |
|---|---|---|

## Blocking Issues
1. ...

## Commands Run
- ...
```
