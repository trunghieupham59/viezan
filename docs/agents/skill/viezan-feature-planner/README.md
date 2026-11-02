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

1. `docs/migration/legacy-reference/agent-handbook/product-intro.md` để hiểu giá trị sản phẩm.
2. `docs/migration/legacy-reference/agent-handbook/ARCHITECTURE.md` để map thay đổi vào Main/Preload/Renderer.
3. Tài liệu domain nếu liên quan:
   - `docs/migration/legacy-reference/agent-handbook/manual/live_trans.md`
   - `docs/migration/legacy-reference/agent-handbook/manual/tts.md`
   - `docs/migration/legacy-reference/agent-handbook/manual/TTS_ARCHITECTURE.md`

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

## Browser Extension impact

Khi yêu cầu chạm browser extension hoặc local bridge, impact map phải xét riêng các surface sau:

- Popup quick translate: `chrome-extension/popup.html`, `chrome-extension/popup.js`, shared extension CSS.
- Selection tooltip/floating button: `chrome-extension/content.js`, `chrome-extension/content.css`.
- Options/default settings: `chrome-extension/options.html`, `chrome-extension/options.js`.
- Local bridge contract: `electron/ipc/localServer.ts`, `electron/preload/localServer.ts`, `electron/preload/legacyAssistant.ts`.

Checklist UX bắt buộc: popup/options/tooltip đồng bộ visual language, không dùng emoji làm action/status icon, provider/model badge không inline SVG trang trí, có missing-token/offline/loading/error/success states và manual smoke cho translate/copy/replace/listen.

## Checklist phân tích

- Feature thuộc nhóm nào: translate, live, image, chat, voice, TTS, settings, history, browser extension, release?
- Có cần provider API/key/model không?
- Có chạm IPC hoặc preload không?
- Có thêm state persisted không?
- Có thêm UI string/tooltip/error không?
- Nếu là extension: default target language/style có được lưu và dùng đồng nhất trong popup/tooltip/options không?
- Có ảnh hưởng lịch sử/session/preset không?
- Có cần fallback/retry/cancel/cleanup không?
- Có test ở tầng nào là đủ?
