# Skill: viezan-feature-planner

Skill chuyển một PRD, issue hoặc yêu cầu feature của Viezan thành bản phân rã kỹ thuật có thể implement ngay.

## Khi dùng

Dùng khi yêu cầu có dạng:

```text
Hãy phân tích PRD này cho Viezan và lập plan implement.
```

```text
Thêm tính năng [X] vào Viezan, cần sửa những module nào?
```

## Đầu vào cần đọc

1. `viezanagent/product-intro.md` để hiểu giá trị sản phẩm.
2. `viezanagent/ARCHITECTURE.md` để map thay đổi vào Main/Preload/Renderer.
3. Tài liệu domain nếu liên quan:
   - `viezanagent/docs/live_trans.md`
   - `viezanagent/docs/tts.md`
   - `viezanagent/docs/TTS_ARCHITECTURE.md`

## Output chuẩn

```markdown
## Product Fit
- User need:
- Success criteria:
- Out of scope:

## Impact Map
| Layer | Files/Modules | Change |
|---|---|---|

## Contracts
- IPC:
- Store:
- Types:
- i18n:

## Implementation Plan
1. ...

## Verification
- Tests:
- Manual checks:
- Build/lint:

## Risks
- Security/privacy:
- UX:
- Provider/API:
```

## Checklist phân tích

- Feature thuộc nhóm nào: translate, live, image, chat, voice, TTS, settings, history, browser extension, release?
- Có cần provider API/key/model không?
- Có chạm IPC hoặc preload không?
- Có thêm state persisted không?
- Có thêm UI string/tooltip/error không?
- Có ảnh hưởng lịch sử/session/preset không?
- Có cần fallback/retry/cancel/cleanup không?
- Có test ở tầng nào là đủ?

