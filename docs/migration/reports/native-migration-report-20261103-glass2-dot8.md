# Liquid Glass 2.0 · Đợt 8: trạng thái bổ sung (macOS)

- **Ngày:** 2026-11-03
- **Nhánh:** `develop`, làm tiếp trên Đợt 1–7 (chưa commit). Không commit.
- **Nguồn:** [HANDOFF.md](../../design/glass2/HANDOFF.md) mục 2–4 và mục 5 "Bổ sung sau Đợt 1–7".
- **Board:** Home-Compact, Chat-Compact, Nav-Overlay, Shell-Minimum, Shell-States, Shell-Solid, Chat-States, Translate-States, Dictionary-States, Interpret-States, Thermal-States, Apps-States, History-States, Launcher-States.

## Kiểm tra trước

Đã có báo cáo Đợt 1–7 (`native-migration-report-20261103-glass2-dot1.md` … `dot7.md`).

## Đã làm

Mọi thay đổi chỉ áp dụng cho preset Glass. Graphite, Paper, Corporate và Midnight giữ nhánh cũ.

| Phần | Thay đổi | File |
| --- | --- | --- |
| Thành phần chung | `NoticeBand` (dải tone: kiểu viền dưới header, hoặc hộp bo 12 trong trang), `InlineFailure` (khối lỗi đỏ nhạt trong lượt/thẻ), `GlassEmptyState` (đĩa tone 52 + tiêu đề 15 + gợi ý). `StatusTone` có thêm `warning`. Dòng nhắc `ProviderNotice` trên Glass: chấm đỏ khi không có AI, chấm cam khi model không dùng được, hành động là liên kết chữ. | `NativeKit.swift` |
| Dải thông báo shell | Lỗi lưu (đỏ, "Thử lưu lại"), đang thu âm/xử lý (chip nhấn + Dừng đỏ), Phiên dịch chạy nền (sóng xanh, "Đang nghe · mm:ss", Mở lại, Dừng). Cao 44, nằm trong mặt đọc ngay dưới header, vạch dưới. | `ViezanApp.swift` |
| Pane điều hướng tạm (< 900) | Mặt đọc bị phủ 10 % (`text-strong` × `selectionOpacity`). Pane có nền đục (material + `surface-raised`) và bóng lớn 24/64, nên nội dung bên dưới không lộ qua. | `ViezanApp.swift`, `NativeFoundation.swift` (`SidebarSurface(raised:)`) |
| Cửa sổ 640×480 | Khi cửa sổ hẹp hơn cột đọc (760), breadcrumb chỉ còn tên trang (nhãn trợ năng vẫn đủ hai cấp). Composer hẹp giữ một hàng; model thu vào nút ✦ tròn (`ModelPicker(iconOnly:)`), mic vẫn còn. | `ViezanApp.swift`, `Workspaces.swift` |
| Reduce Transparency | Mặt đọc đặc là `titlebar-bg` phủ `surface`, sáng hơn pane điều hướng (trước đây cùng màu với pane). Các mặt kính khác đã có nhánh đặc từ Đợt 1–6. | `NativeKit.swift` (`WorkspaceSurface`) |
| Trang chủ hẹp | Thêm bậc `ViewThatFits`: dải model thu thành pill "● Haiku 5.5 ⌄" cạnh "Tạo mới". Pill mở mục quản lý model, giống nút Quản lý. Lưới Bắt đầu nhanh vốn đã 2×2 ở 820. | `HomeWorkspace.swift` |
| AI Chat | Câu trả lời đang chạy có chip "Đang trả lời…" (`updatesFrequently`). Glass bỏ spinner; nút Dừng tròn màu đỏ. Lượt lỗi hoặc bị dừng: `InlineFailure`, Thử lại màu nhấn, chip meta đỏ, thay cho dòng trạng thái ở đáy. Ảnh đã tạo nằm trong khung bo 16 rộng 216, có bóng, nút Lưu ảnh / Sửa ảnh xếp bên cạnh. Ảnh đính kèm là thumbnail 56 có nút bỏ tròn 20. | `Workspaces.swift`, `ImageControls.swift` |
| Nghiên cứu | Thẻ phẳng. Đầu thẻ cao 40 ghi pha và số truy vấn · nguồn. Mở ra là hai cột: các bước đánh số (xong ✓, đang chạy là đĩa nhấn, chưa tới là viền) và truy vấn / nguồn / phát hiện. | `ResearchPanel.swift` |
| Dịch | Đang dịch: hàng ngôn ngữ khoá, Dừng đỏ ở chân nguyên bản, pane bản dịch có chip "Đang dịch…" và 3 vạch chờ, So sánh bị khoá. Quá 5 000 ký tự: chữ đếm đậm. Lượt mới sau nghỉ: một dòng 12 chấm trung tính, liên kết "Mở lượt trước". So sánh "Theo câu": mỗi câu nguồn một hàng, mỗi model một ô, ô đã chọn tô nhấn, nhãn "Đang dùng". | `Workspaces.swift`, `ComparisonPane.swift` |
| Từ điển | Trống: sách tone cam và tối đa 3 tra cứu gần đây để mở lại. Đang tra: headword hiện ngay, chip "Đang tra…", vạch chờ; "Tra từ" đổi thành Dừng đỏ. | `Workspaces.swift` |
| Phiên dịch | Thanh phiên: chip "Sẵn sàng" khi chưa có phiên, "Đã dừng · mm:ss" khi phiên đã dừng (thời lượng lấy từ đoạn cuối). Có thêm nút "Phiên mới" cạnh "Bắt đầu phiên dịch", gọi cùng hành động với nút ở header. Trạng thái trống dùng sóng tone xanh lá. Lỗi lưu / thu âm hiện thành dải đỏ trong trang. | `InterpretationWorkspace.swift` |
| Nhiệt độ | Chưa có số liệu: nhiệt kế tone cam, không có thẻ rỗng. Lỗi: dải đỏ. Bốn xác nhận (bật helper, gỡ helper, hiệu chuẩn, áp dụng tốc độ thủ công) là `BlockingDialog` giữa trang; gỡ helper dùng nút đỏ đặc. Hiệu chuẩn hiện chip pha · giây còn lại và Dừng đỏ. | `ThermalWorkspace.swift` |
| Ứng dụng | Kết quả hiện thành dải xanh có Hoàn tác và ×. Lỗi: dải đỏ. App bị khoá: thẻ viền ấm có ổ khoá, nằm chỗ của kế hoạch. Xác nhận: `BlockingDialog` liệt kê tối đa 6 đường dẫn mono, nút đỏ đặc. Tìm không ra: trạng thái trống trong cột danh sách. Khung chi tiết trống dùng `GlassEmptyState`. | `ApplicationsWorkspace.swift` |
| Thư viện lịch sử | Xem trước phiên Dịch: thẻ Nguyên bản · ngôn ngữ, bản dịch phẳng kèm Sao chép. Phiên Từ điển xem trước như màn Từ điển (`DictionaryResultView`). Không có kết quả: `GlassEmptyState`. Đổi tên: `BlockingDialog` với ô `.field`, Enter để lưu. | `HistoryViews.swift` |
| Launcher, Quick AI | Đang tải ứng dụng: chip nhấn. Không mở được: `InlineFailure`. Ô máy tính màu trung tính. Nút "Đổi sang" là pill kính nhỏ có mũi tên. Lượt Quick AI lỗi dùng `InlineFailure`; Sao chép bị khoá khi chưa có câu trả lời; "Tạo lại phản hồi" màu nhấn sau khi lỗi. | `Launcher.swift`, `LauncherChat.swift` |
| Cửa sổ Chat nhanh | Đầu cửa sổ: tiêu đề, chip tên tính năng, "Mở lại" là pill kính. Lượt chat cùng hình dạng với AI Chat (bong bóng phía người dùng, "✦ Viezan" phía trả lời). | `DesktopPanels.swift` (`QuickSessionPanel`) |

Chuỗi mới (VI / EN / JA), `npm run resources` đã chạy, hai `native.json` đồng bộ:

- `chatAnswering`: Đang trả lời… / Answering… / 回答中…
- `lookingUp`: Đang tra… / Looking up… / 検索中…
- `stoppedFor`: Đã dừng · {time} / Stopped · {time} / 停止 · {time}

Không sửa test. Không đổi hành vi, dữ liệu, dịch vụ, route hay phím tắt. Hai chỗ mới có thể bấm đều gọi hành động đã có: tra cứu gần đây (`store.select`) và "Phiên mới" trong thanh phiên (`clearSelection`).

## Kiểm chứng

```
$ npm run resources
Native resources generated: 3 locales, 78 metrics.
$ npm run check:resources
Native resources verified: 3 locales, 78 metrics.
$ swift build            (apps/macos)
Build complete! (0,46 giây)
$ swift test             (apps/macos)
✔ Test run with 49 tests in 7 suites passed after 19.282 seconds.
✔ Test run with 60 tests in 0 suites passed after 0.092 seconds.
```

## Nghiệm thu bằng ảnh

Ảnh nằm ở [`glass2-dot8/`](glass2-dot8/), chụp ở 1x:

- **Board đặt cạnh app (sáng):**
  - `compare-home-820-light.png`
  - `compare-chat-820-light.png`
  - `compare-nav-overlay-820-light.png`
  - `compare-minimum-640-light.png`
- **Ảnh app, sáng và tối (`app-light-*`, `app-dark-*`):**
  - 1280: Trang chủ, AI Chat, Từ điển (trạng thái trống có tra cứu gần đây), Phiên dịch (Đã dừng · 00:21 kèm Phiên mới), Nhiệt độ, Ứng dụng.
  - 820: Trang chủ, AI Chat, pane điều hướng tạm.
  - 640×480: AI Chat, Trang chủ.
  - Thêm `app-light-1280-apps-locked.png`: thẻ app bị khoá.

Cách chụp:

- Bản sáng chụp trên dữ liệu hiện có, không gửi yêu cầu AI nào.
- Bản tối: thoát app, sao lưu `workbench.json`, đặt tạm `appearance.mode = dark`, chụp, rồi chép trả file sao lưu. Checksum khớp: `7815c638…`.
- Trang mở cuối (`lastRoute`) được trả về Dịch như trước khi chụp.

## Chênh lệch còn lại

| Chênh lệch | Lý do |
| --- | --- |
| Chưa chụp: đang trả lời / lỗi / nghiên cứu / tạo ảnh của AI Chat, đang dịch, đang tra, So sánh theo câu, Phiên dịch đang nghe, dải thông báo shell, các hộp thoại của Nhiệt độ và Ứng dụng, Launcher, Quick AI, cửa sổ Chat nhanh, đổi tên trong Thư viện. | Muốn có các trạng thái này phải gọi AI, dùng micro, có lỗi lưu thật, chạy helper quạt hoặc chuyển tệp vào Thùng rác. Không giả lập dữ liệu. Code đã build, test xanh. |
| Chưa chụp Shell-Solid (Reduce Transparency). | Phải bật tuỳ chọn trợ năng của hệ thống, ảnh hưởng toàn máy. Tôi không đổi cài đặt hệ thống khi chưa được cho phép. Nhánh mặt đặc đã có trong code. |
| Màu mặt đặc theo token (`titlebar-bg`, `surface`, `border-strong`), không phải `#FBF8F3` / `#F4EEE6` / trắng. Increase Contrast chưa có viền 24 % riêng. | Token thắng board. Glass chưa có role cho các mức này. |
| Dải thông báo tô 10 % (`selectionOpacity`), board ghi 6–7 %. Dải Phiên dịch chạy nền dùng `tone-green`. Kết quả Ứng dụng dùng `success` (#059669), không phải xanh board. | Không có token 6–7 %. Lấy mức gần nhất. |
| Dải đang thu âm chưa có giờ "00:14" và câu "Bấm Dừng để chuyển thành văn bản…". | Shell không biết thời điểm bắt đầu thu âm. Câu trên cũng không đúng hành vi: nút Dừng ở dải gọi `audio.cancel()`, tức là huỷ bản ghi chứ không chuyển thành văn bản. |
| Composer nhiều dòng bo 22 (board 24). Ảnh đính kèm chưa ghi "2/4 ảnh · tối đa 20 MB". | Không có token 24. Câu đếm ảnh cần chuỗi mẫu mới. |
| Tiêu đề intro của Trang chủ ở 820 vẫn là 22 (board 20). | Giữ cỡ `headingScale` chung của mọi intro. |
| Thẻ Nghiên cứu chưa có chip "Đang nghiên cứu · 1:42" và nút Dừng riêng dưới thẻ. | Nút Dừng đã có trong composer. Thời điểm bắt đầu chưa có trong mô hình. |
| Dịch ảnh chưa có nút "Ảnh" bật trên hàng ngôn ngữ, và nguồn chưa hiện thành thẻ ảnh kèm chữ trích ra. Từ điển chưa có dòng "Tối đa 120 ký tự. ↩ để tra.". Tab Ví dụ và header Từ điển đã có từ Đợt 3 nên không đổi. | Thêm ảnh vẫn ở header (hành vi Đợt 3). Thẻ ảnh cần dời `ImageTranslationView` sang pane nguồn, tức là đổi luồng. Dòng gợi ý cần chuỗi mới. |
| Vượt 5 000 ký tự: nút Dịch chưa bị khoá; đầu pane chưa ghi "Quá giới hạn". | Khoá nút là thay đổi hành vi (hiện nhà cung cấp vẫn nhận). Chữ đếm đã đổi sang câu cảnh báo `sourceTooLong`. |
| "Từ đã lưu" vẫn mở Thư viện ở bộ lọc Từ đã lưu, chưa phải lớp nổi 376. | Đổi thành lớp nổi là đổi luồng điều hướng đã có. |
| Phiên dịch: thiếu quyền hiện qua `SpeechProviderNotice` / lỗi thu âm, chưa có thẻ quyền microphone giữa cột. Menu model vẫn là menu hệ thống. | Trang Phiên dịch không đọc trạng thái quyền (quyền nằm ở `SystemSettings`). Menu model đã ghi ở Đợt 3. |
| Lớp Profile / Quy tắc của Nhiệt độ vẫn là popover, nội dung chưa đổi (hàng lens + chip, đường cong minh hoạ). Hàng hiệu chuẩn chưa có meter tiến độ. | Popover hệ thống giữ nguyên ở Đợt 4. `ThermalMonitor` chỉ có số giây còn lại, không có tổng. |
| Thẻ app bị khoá chưa có chip "Chưa cấp" và nút mở Cài đặt hệ thống. Lớp Nhật ký vẫn là popover cũ. | Lý do khoá có nhiều loại (không chỉ Full Disk Access), nên chỉ hiện đúng câu lý do. |
| Cửa sổ Chat nhanh vẫn có DisclosureGroup "Cấu hình model" và nút Gửi / Sao chép nằm ngoài composer. | Giữ đúng cấu trúc và hành vi của `QuickSessionPanel`. |
| Quick AI: nút Gửi ở đầu chưa đổi thành Dừng tròn khi đang nghĩ (Dừng nằm ở chân). Khi chưa có model, `ProviderNotice` hiện thành một dòng, chưa có trạng thái trống riêng. | Giữ cấu trúc đầu cửa sổ của Đợt 6. |

## Chưa kiểm

- VoiceOver, ba cỡ chữ, EN/JA.
- Reduce Transparency / Increase Contrast trên app chạy thật.
- Mọi trạng thái cần AI, micro, helper hoặc lỗi lưu thật (bảng trên).
- QtTest: đợt này không đụng tới Qt.

## Bổ sung sau rà soát (2026-11-03)

Anh/chị rà soát lại và thấy hai màn còn lệch board, đồng thời nhiều thao tác không có phản hồi. Phần sửa sau đó:

| Phần | Thay đổi | File |
| --- | --- | --- |
| Phản hồi sao chép | `copyText` dùng chung: chép vào clipboard rồi hiện toast "Đã sao chép" (hoặc toast lỗi). Áp dụng cho Sao chép ở Dịch, So sánh, bản ghi Phiên dịch và cửa sổ Chat nhanh. | `NativeKit.swift`, `Workspaces.swift`, `ComparisonPane.swift`, `InterpretationWorkspace.swift`, `DesktopPanels.swift` |
| Phản hồi lưu tệp | `announceSaved`: toast "Đã lưu {tên}" kèm nút "Hiện trong Finder" sau khi xuất JSON (Lịch sử), TXT/SRT (Phiên dịch) và Lưu ảnh (AI Chat). Trước đây chỉ có toast khi lỗi. | `NativeKit.swift`, `HistoryViews.swift`, `InterpretationWorkspace.swift`, `Workspaces.swift` |
| Dịch | Nhãn ngôn ngữ đầu ra ở chân pane bản dịch không còn bị cắt ("Tiến…"). Nút xoá nội dung có chữ "× Xoá" như board. Chip model ở hàng ngôn ngữ thành "✦ tên ⌄". | `Workspaces.swift`, `ViezanApp.swift` |
| Nhà cung cấp AI | Bố cục theo Settings-Models:<br>• Một thẻ chia hai nhóm: Cloud (dòng "Đang dùng: …" bên phải) và Tìm kiếm và giọng nói.<br>• Mỗi hàng: ô chữ cái 28, tên kèm chip trạng thái, liên kết "Lấy API key ↗" bên dưới, Thay/Thêm khoá, Xoá khoá chữ đỏ.<br>• Ô nhập khoá mở ngay trong hàng: ô khoá, Lưu khoá, Đóng và câu gợi ý.<br>• "Kiểm tra lại" chuyển lên intro của mục. | `ProviderSettings.swift`, `NativeSettings.swift` |
| Cài đặt | Breadcrumb ghi "Cài đặt / {mục}". Có vạch ngăn giữa ô tìm và Hoạt động. | `ViezanApp.swift`, `NativeFoundation.swift`, `NativeSettings.swift` |
| Chữ | Thống nhất "khoá": `saveKey` = "Lưu khoá", `deleteKey` = "Xoá khoá". Chuỗi mới: `copyFailed`, `fileSaved`, `providerGroupCloud`, `providerGroupSearchVoice`, `providerInUse`, `keyReplaceHint` (VI/EN/JA). | `resources/locales/*.json`, hai `native.json` |
| Sửa lỗi test | Pane điều hướng tạm vẫn dùng lớp `NavigationGlassMaterial`, phủ `surface-raised` lên trên. Bản sửa độ đục ở phần nghiệm thu bên trên đã bỏ lớp này, làm `LiquidGlassShellTests` đỏ. Lần chạy test ở mục Kiểm chứng diễn ra trước bản sửa đó. | `NativeFoundation.swift` |

Kiểm chứng lại:

```
Native resources verified: 3 locales, 78 metrics.
✔ Test run with 49 tests in 7 suites passed after 19.462 seconds.
✔ Test run with 60 tests in 0 suites passed after 0.093 seconds.
```

Ảnh:

- `review-translate-copied.png`: Dịch kèm toast "Đã sao chép".
- `review-providers-edit.png`: Nhà cung cấp AI, đang mở ô nhập khoá.
- `compare-providers-1280-light.png`: board đặt cạnh app.

Còn lệch:

- Logo nhà cung cấp là ô chữ cái màu trung tính, không dùng màu thương hiệu. Không có token cho màu thương hiệu.
- Thẻ Dịch nhanh và Launcher đóng ngay khi sao chép, nên toast hiện ở cửa sổ chính và có thể không thấy được.
