# Skill: viezan-provider-integration

Skill hướng dẫn thêm hoặc sửa AI provider/model/task trong Viezan mà không phá contract hiện có.

## Khi dùng

```text
Dùng skill viezan-provider-integration để thêm provider/model [X].
```

```text
Audit provider integration cho task translate/chat/tts/models.
```

## Checklist nhanh

- Cập nhật `Provider` type và `SUPPORTED_PROVIDERS` nếu thêm provider mới.
- Cập nhật config provider/model/defaults trong `src/constants/providers.ts`.
- Cập nhật API key UI/status nếu provider cần key.
- Implement provider call trong Main Process, không trong Renderer.
- Register vào đúng registry: translate, rewrite, detect, stream, chat, tts, models.
- Classify errors và dùng retry/fallback đúng loại.
- Thêm verify model constant nếu có key verification.
- Thêm hoặc cập nhật test IPC/provider.

## Output audit

```markdown
## Provider Scope
- Provider:
- Tasks:
- Models:

## Required Code Changes
| Area | File | Change |
|---|---|---|

## Security Checks
- API key storage:
- Renderer exposure:
- Error redaction:

## Tests
- Unit:
- IPC:
- Manual:
```

