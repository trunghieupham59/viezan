# Workflow: release-readiness

Workflow kiểm tra Viezan trước khi build/release desktop app.

## Cách dùng

```text
Dùng workflow release-readiness để kiểm tra trước release.
```

## Phạm vi

- Product smoke test: translate, live, image, chat, TTS/STT, settings, history, extension bridge.
- Security/local-first audit.
- i18n completeness.
- Build/test/package sanity.
- Docs/release notes.

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

