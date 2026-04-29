# Rule: viezan-product-engineering

Bộ quy tắc nền để AI agent generate, review và refactor code cho Viezan đúng với PRD: trợ lý dịch thuật AI desktop local-first, bảo mật API key, đa provider, live translation, image translation, chat, TTS/STT, Chrome Extension và trải nghiệm đa ngôn ngữ.

## Cách dùng

```text
Áp dụng rule viezan-product-engineering khi implement tính năng Viezan:
[mô tả yêu cầu]
```

Kết hợp tốt với:

- [`generate-code`](../generate-code/README.md): rule code quality chung
- [`viezan-feature-planner`](../../skill/viezan-feature-planner/README.md): phân rã PRD/task thành module cần sửa
- [`viezan-ipc-security-audit`](../../skill/viezan-ipc-security-audit/README.md): audit bảo mật IPC/local-first

## Rule Groups

| Nhóm | Mục tiêu | Bắt buộc khi |
|---|---|---|
| Product Fit | Không lệch khỏi giá trị cốt lõi của Viezan | Mọi feature |
| Local-first Privacy | Không làm dữ liệu đi qua server trung gian của project | Mọi feature gọi AI/audio/key |
| Electron Boundary | Giữ ranh giới Main/Preload/Renderer rõ ràng | Thêm IPC/window/api |
| Provider Contract | Tích hợp OpenAI/Gemini/Claude nhất quán | Thêm model/provider/tác vụ AI |
| UX & i18n | Giao diện rõ, nhanh, hỗ trợ VI/EN/JA | Thay đổi UI text |
| Browser Extension UX | Popup/options/tooltip đồng bộ với app, thao tác dịch nhanh | Chạm `chrome-extension/` hoặc local bridge |
| Reliability | Retry, fallback, cleanup, mounted guard | Async, stream, audio, network |
| Test & Release | Có kiểm chứng đúng tầng | Mọi thay đổi có logic |

## Quy tắc chính

### R-VZN-PRD-01: Giữ đúng người dùng và ngữ cảnh sản phẩm

Viezan phục vụ BrSE/PM/dev làm việc đa ngôn ngữ, đặc biệt Việt - Nhật - Anh. Tính năng mới phải giúp dịch, hiểu, trao đổi hoặc lưu lại ngữ cảnh tốt hơn. Không biến app thành dashboard/landing page/CRM nếu không liên quan trực tiếp tới dịch thuật, chat, live session, browser translation hoặc quản lý model/key.

### R-VZN-SEC-01: Local-first là ràng buộc sản phẩm, không phải option

- Không thêm server trung gian cho dữ liệu người dùng.
- API key chỉ nằm ở Main Process và OS secure storage.
- Renderer không được nhận raw API key, token hay secret.
- Không log transcript, ảnh, prompt, key hoặc response nhạy cảm ra console/file.
- URL mở bên ngoài phải qua allowlist.

### R-VZN-IPC-01: Renderer chỉ nói chuyện qua preload API

- Renderer không gọi Node.js, filesystem, SDK provider hay Electron API trực tiếp.
- IPC channel dùng pattern `domain:action`.
- Input qua IPC phải validate ở Main Process.
- Preload chỉ expose wrapper tối thiểu qua `contextBridge`.
- Mọi API mới phải có đường đi rõ: Renderer -> Preload -> IPC handler -> provider/service.

### R-VZN-AI-01: Provider logic đi qua registry và contract chung

- Provider hợp lệ lấy từ `SUPPORTED_PROVIDERS` và type `Provider`.
- Tác vụ mới phải có registry rõ ràng: translate/rewrite/detect/stream/chat/tts/models.
- Error từ provider phải được classify và hiển thị thành thông điệp người dùng hiểu được.
- Network transient dùng retry; auth/rate-limit/bad request không retry mù.
- Model default và danh sách model phải nhất quán trong constants, settings và UI.

### R-VZN-LIVE-01: Live/audio pipeline ưu tiên ổn định hơn độ "thông minh"

- Luôn cleanup recorder, stream, timer, listener và mounted state.
- Không update React state sau unmount.
- Với stream token/subtitle, phải xử lý partial, completion và error.
- Audio/transcribe phải chống hallucination, duplicate và chunk quá dài.
- Permission/system audio failure phải có UX recoverable.

### R-VZN-UI-01: UI là công cụ làm việc, không phải landing page

- Màn hình chính phải cho người dùng thao tác ngay.
- Text UI đi qua i18n; tối thiểu cập nhật VI/EN/JA khi thêm label.
- Component reusable không import domain store/service; nhận props.
- Icon dùng registry `src/components/ui/icons/`, không inline SVG trong page/component feature.
- State loading/error/empty/success phải rõ ràng và không làm layout nhảy bất thường.

### R-VZN-EXT-UI-01: Extension UI phải là công cụ dịch nhanh, không phải trang giới thiệu

- Popup, Options và selection tooltip dùng cùng visual language: neutral surface, accent tiết chế, radius tối đa 10px, typography nhỏ gọn.
- Không dùng emoji làm icon/action/status trong extension UI; dùng text rõ, status dot, icon asset sẵn có hoặc CSS shape đơn giản.
- Không inline SVG provider/action trong `popup.js` hoặc `content.js` nếu chỉ để trang trí; provider/model badge ưu tiên text + dot màu.
- Floating button và tooltip phải clamp trong viewport, không che selection quá mức và không làm layout của trang host bị ảnh hưởng.
- Trạng thái local bridge phải rõ: connecting, active, offline/token invalid, loading, copied/replaced, TTS failed.
- Options phải lưu cùng bộ default mà popup/tooltip dùng: target language và translation style.

### R-VZN-DATA-01: Persist đúng dữ liệu, không persist trạng thái tạm

- Persist settings, history, session/preset cần khôi phục.
- Không persist loading/error/sourceText/transient stream state.
- Dữ liệu lịch sử phải có khả năng mở lại, tìm kiếm hoặc tái sử dụng nếu feature hứa hẹn điều đó.
- Khi thay schema persisted state, phải cân nhắc backward compatibility.

### R-VZN-TEST-01: Test theo tầng bị ảnh hưởng

- Pure util: test trong `src/utils/__tests__/`.
- Store slice: test trong `src/store/__tests__/`.
- IPC handler: test trong `electron/ipc/__tests__/`.
- Page/component workflow: test bằng Testing Library khi behavior user-facing thay đổi.
- Chạy tối thiểu `npm run build` hoặc test/lint hẹp phù hợp trước khi kết luận.
