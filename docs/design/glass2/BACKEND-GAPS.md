# Liquid Glass 2.0 · khoảng trống giữa giao diện mới và backend

## Backend ở đâu

Kiểm kê ngày 2026-11-03, đối chiếu toàn bộ board trong `docs/design/glass2/boards/` với hai nền tảng:

- **macOS:** `apps/macos/Sources/ViezanDomain` (store, `NativeAudio`, `Interpretation`, `ThermalMonitor`, `Applications`, …).
  - Prompt từ điển nằm cứng trong `DictionaryEntry.swift:49-63`.
  - Một số logic vẫn còn trong view: `PaletteQuery`, kiểm quyền hệ thống, danh sách model gợi ý.
- **Windows/Linux:** dịch vụ C++ trong `apps/desktop-qt`.
  - Runtime là `WorkbenchDomain.cpp` + `WorkbenchBridge` + phần lọc/sắp xếp viết ngay trong QML.
  - Prompt từ điển nằm cứng trong `LocalProvider.cpp:69-72`.
  - **`domain.js` chỉ dùng cho test** (`scripts/native/__tests__/domain.test.mjs`); không file QML hay C++ nào nạp nó.
- **Hợp đồng chung:** `contracts/native-workbench/`.
  - Hiện **không** chứa prompt hay schema từ điển. `native.json` cũng không.

### Phạm vi nền tảng theo tài liệu

- **Chỉ macOS:** gỡ/đặt lại ứng dụng và điều khiển quạt (README.md:195-196, `docs/design/screens/apps.md`, `thermal.md`).
- **Launcher:** chỉ macOS trả lời AI ngay trong cửa sổ Launcher; Qt mở panel Chat nhanh riêng (README.md:42-44).
- **Nhiệt độ:** Linux đọc hwmon; Windows không có backend cảm biến.

Các mục thuộc phạm vi này ghi "chỉ macOS" và không tính là lệch nền tảng.

### Đọc bảng

Viết tắt đường dẫn:

| Viết tắt | Thư mục |
| --- | --- |
| `S/` | `apps/macos/Sources/ViezanDomain/` |
| `N/` | `apps/macos/Sources/ViezanNative/` |
| `Q/` | `apps/desktop-qt/` |

**Loại:**

- **a** — backend có, giao diện đã nối.
- **b** — backend có, giao diện chưa nối.
- **c** — backend chưa có, thêm được.
- **d** — không nên hoặc không thể hỗ trợ; có đề xuất sửa board.

**Lệch:** ✱ là chỗ Swift và C++ khác nhau.

**Quyết định:** anh/chị điền một trong ba giá trị:

- **Làm** — thêm cho cả hai nền tảng.
- **Bỏ** — gỡ khỏi board và HANDOFF.
- **Hoãn** — để lại, không làm lúc này.

Các mục loại a có đủ ở cả hai nền tảng không liệt kê ở đây; chúng nằm trong báo cáo kiểm kê.

## A. Khoảng trống đã biết (cập nhật vị trí sau kiểm kê)

| # | Giao diện cần | Hiện có | Nơi sẽ đụng | Loại | Lệch | Ghi chú | Quyết định |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Từ điển · tab "Từ liên quan" (cùng gốc, gần nghĩa, trái nghĩa) | Không có ở cả hai. Schema: `S/DictionaryEntry.swift:3-22`, prompt `:49-63`. C++: prompt `Q/LocalProvider.cpp:71`, validator `Q/WorkbenchDomain.cpp:72-95`, parser QML `Q/qml/DictionaryResult.qml:10-19` | Prompt + struct + validator cả hai bên; nên chuyển prompt vào `native.json` / `contracts/` để dùng chung | c | | Đã chốt giữ tab. Trường tuỳ chọn; dữ liệu cũ thì ẩn tab. | Làm |
| 2 | Từ điển · dòng "Sắc thái" | `Translation.nuance` có, tuỳ chọn ở cả hai. Prompt Swift có câu "Include concise usage, nuances, examples and collocations" (`:57`); **prompt C++ thiếu câu này**, ví dụ ghi `source -> target` thay vì `→` | Đồng bộ prompt C++ (tốt nhất: một prompt chung) | a/c | ✱ | macOS tách ví dụ theo " → "; C++ trả "->" sẽ không tách. | Làm |
| 3 | "Theo ngữ cảnh — nghĩa 01 được xếp trước" | Ngữ cảnh chỉ gửi kèm dạng văn bản (`S/CloudProvider.swift:18`, `Q/LocalProvider.cpp:72`); prompt không yêu cầu xếp nghĩa | Prompt + trường tuỳ chọn (ví dụ `contextSense`) | c | | Có thể chỉ hiện câu chung. | Làm |
| 4 | Từ điển · "Không tìm thấy" + gợi ý | Trả lời không có nghĩa thành `failed / providerInvalidResponse` (`S/DictionaryEntry.swift:41-45`, `S/WorkbenchStore.swift:572-578`; `Q/WorkbenchDomain.cpp:75-77,527-532`) | Prompt + dạng JSON `notFound` / `suggestions` cả hai bên | c | | | Làm |
| 5 | Thời lượng tác vụ ("1,4 giây", "Xong · 0,9 s", "GPT Image · 6,2 giây") | `WorkTask` không có dấu thời gian (`S/Models.swift:97-109`; `Q/WorkbenchDomain.cpp:488,520-535`) | `started` / `finished` tuỳ chọn trên task, cả hai | c | | Dùng chung cho #11, cột So sánh, ảnh. | Làm |
| 6 | Lớp Nghe · nguồn đang đọc | Chỉ có `speaking` (`S/NativeAudio.swift:12`; `Q/NativeAudio.h:18`). macOS đang tự nhớ trong view (`ListenState`) | `speakingSource` trên trình phát cả hai | c | | | Làm |
| 7 | Lớp Nghe · "Đang tạo giọng…" | `speaking = true` trước khi tải (`S/NativeAudio.swift:79`); C++ `nextVoiceChunk` `Q/NativeAudio.cpp:158-185` | Cờ `preparing` cả hai | c | | | Làm |
| 8 | Giọng theo ngôn ngữ ("Tiếng Nhật · Kyoko"); loa nhỏ đọc bằng giọng của ngôn ngữ đó | Một `voiceID` cho mọi ngôn ngữ (`S/Models.swift:132-140`; `Q/NativeAudio.cpp:147`). **C++ `voices()` chỉ trả tên, không có locale** (`:137`) | Hàm "giọng dùng cho ngôn ngữ X"; tuỳ chọn bản đồ giọng theo ngôn ngữ; C++ thêm `QVoice::locale()` | c | ✱ | Nếu Hoãn: board ghi "giọng đã chọn". | Làm |
| 9 | Tốc độ đọc (seg 0,75–1,5×) | Swift đủ (`S/Models.swift:136-139`, `NativeAudio.swift:76`, `EdgeSpeech.swift:12`, `NativeTTS.swift:16`); danh sách nhà cung cấp hỗ trợ nằm trong view. **C++ không có tốc độ**: lệnh `voice` bỏ `rate` (`Q/WorkbenchDomain.cpp:305-307`), `configureVoice` không nhận tốc độ (`Q/NativeAudio.cpp:138`), OpenAI không gửi `speed` (`Q/SpeechSynthesis.cpp:25`), Edge cố định +20 % (`Q/EdgeSpeech.cpp:26`) | C++: domain + `NativeAudio` + từng nhà cung cấp; cả hai: đưa danh sách "hỗ trợ tốc độ" vào domain | c | ✱ | Khôi phục bản sao lưu macOS trên Qt rồi đổi giọng sẽ mất `rate`. | Làm |
| 10 | Dải "Đang ghi âm · 00:14" | Không có thời điểm bắt đầu (`S/NativeAudio.swift:9,43`; `Q/NativeAudio.h:21,35`) | `recordingStarted` cả hai | c | | | Làm |
| 11 | Dịch nhanh "· 0,8 giây" | Như #5 | Như #5 | c | | |  |
| 12 | Hộp cập nhật · dung lượng gói, "bạn đang dùng x.y.z" | **Phiên bản hiện tại đã có** (`N/UpdateSettings.swift:5-10`; `Q/qml/UpdateSettings.qml:10`) → chỉ là chưa nối. Dung lượng: Swift bỏ qua `size` của asset (`S/NativeUpdates.swift:78-79`); C++ `m_size` private (`Q/NativeUpdates.h:41`) | Đọc `size` lúc kiểm tra, đưa ra ngoài cùng số bytes đã nhận | b (phiên bản) / c (dung lượng) | | | Làm |
| 13 | So sánh tối đa 4 model + nhóm "Gợi ý" | Cả hai 2–3 (`S/WorkbenchStore.swift:374`; `Q/WorkbenchDomain.cpp:332-333`; QML giới hạn 3). Không có quy tắc gợi ý; C++ không có tầng model / gần đây | Nâng giới hạn + quy tắc gợi ý | c | | Tốn chi phí, tác vụ đồng thời. | Hoãn |
| 14 | Nghiên cứu · "Đang nghiên cứu · 1:42" | Không có thời điểm bắt đầu (`S/Research.swift:8-17`; `Q/Research.cpp:53`) | `started` trong `ResearchState` cả hai | c | | |  |
| 15 | Hiệu chuẩn quạt · thanh tiến độ | Chỉ có pha + số giây còn lại của pha (`S/ThermalMonitor.swift:78-80,184`) | Tổng thời lượng / số giây đã chạy | c | chỉ macOS | Xem thêm #59, #60. | Làm |
| 16 | Phiên dịch · thẻ quyền microphone | Swift chỉ đọc trong view (`N/SystemSettings.swift:14`). C++ có kiểm nội bộ (`Q/Interpretation.cpp:86-87` `QMicrophonePermission`) nhưng không đưa ra QML | Trạng thái quyền mic vào domain / bridge | b/c | ✱ | | Làm |
| 17 | Ứng dụng · thẻ "Cần Toàn quyền truy cập ổ đĩa" | Không có mã FDA; lỗi đọc gộp thành `appIncomplete` (`S/Applications.swift:84,119`). **Chính sách hiện tại: "Không xin Full Disk Access"** (`docs/design/screens/apps.md:92`) | Cần đổi chính sách trước | d | chỉ macOS | Đề xuất: board dùng đúng câu lý do hiện có. | Hoãn |
| 18 | Dịch · khoá nút khi quá 5 000 ký tự | Hằng trong view (`N/Workspaces.swift:799`); nhà cung cấp vẫn nhận | Chính sách giới hạn trong store | c | | Đổi hành vi. | Làm |
| 19 | Dịch ảnh · thẻ ảnh + chữ trích ra trong pane nguồn | macOS OCR trên máy (Vision, `S/Attachments.swift:84`); **Qt gửi ảnh cho model của phiên** (`Q/WorkbenchBridge.cpp:423-435`) | Luồng `ImageTranslation`; Qt có thể dùng Windows.Media.Ocr | c | ✱ | Nhãn "· Haiku 5.5" trên board chỉ đúng với Qt. |  |
| 20 | Logo màu nhà cung cấp | Không có tài nguyên ở cả hai | `resources/` | c/d | | Có thể Bỏ. | Hoãn |
| 21 | Ô ngữ cảnh không được xoá mục từ khi giá trị không đổi | **Lỗi ở cả hai**: `S/WorkbenchStore.swift:421-425`, `Q/WorkbenchDomain.cpp:439-441` luôn huỷ tác vụ, tăng revision, xoá output (trong khi `draft` có so sánh). View đang chặn tạm (`N/Workspaces.swift` `setContext`; QML `onTextEdited`) | `guard` so sánh ở cả hai + test | c | | Mất dữ liệu; nên Làm. | Làm |
| 22 | Đọc to câu trả lời / nguyên bản "Tự động" đúng ngôn ngữ | **Đã có bộ nhận dạng**: `TextLanguage.detect` (`S/DesktopIntegration.swift:130-138`, NLLanguageRecognizer); `TextLanguage::detect` (`Q/TextLanguage.h:9-28`, chỉ theo chữ viết, chữ Latin → ""). macOS truyền ngôn ngữ giao diện, Qt truyền `session.target` (`Q/qml/Main.qml:484`) | Nối bộ nhận dạng; Qt dùng ngôn ngữ giao diện làm mặc định khi là chữ Latin | b | ✱ | | Làm |
| 23 | "Đọc bằng giọng hệ thống" một lần khi giọng đám mây lỗi | `speak` luôn dùng giọng đang đặt (`S/NativeAudio.swift:69-79`; `Q/NativeAudio.cpp:143-149`; `applyVoice` chạy lại mỗi lần lưu `Q/WorkbenchBridge.cpp:134`) | Tham số `provider` trên `speak` cả hai | c | | | Làm |

## B. Lệch nền tảng mới phát hiện (C++ thiếu so với Swift, không thuộc phạm vi chỉ macOS)

| # | Giao diện cần | Hiện có | Nơi sẽ đụng | Loại | Ghi chú | Quyết định |
| --- | --- | --- | --- | --- | --- | --- |
| 24 | "Thử lại / Tạo lại" câu trả lời chat mới nhất đã xong (cả ảnh) | Swift cho phép (`S/WorkbenchStore.swift:528-535`). **C++ chặn khi `status == succeeded`** (`Q/WorkbenchDomain.cpp:499`) | Quy tắc regenerate trong C++ | c | | Làm |
| 25 | Lượt mới sau khoảng nghỉ + "Mở lượt trước" (Dịch, Từ điển) + tuỳ chọn trong Cài đặt | Swift đủ (`S/WorkbenchStore.swift:32-36,128-157`). C++ **không có** (chỉ có chuỗi; Cài đặt Qt hiện công tắc nhưng không làm gì) | Port `featureLeft` / `applySmartReset` / `reopenPrevious` sang `WorkbenchDomain` + bridge | c | Công tắc Qt đang hứa một việc không xảy ra. | Làm |
| 26 | Chọn model: hàng mục đích Nhanh / Cân bằng / Kỹ, nhóm Gần đây, tìm / nhập ID; So sánh dùng nhãn "Gần đây", "Cân bằng" | Swift: `ModelLineup` + `modelTiers` / `recentPicks` (`S/WorkbenchStore.swift:274-285`, `S/ModelLineup.swift`). C++ không có (`recentModels` private) | Port `ModelLineup` (tầng, gần đây, tên ngắn) sang C++ | c | | Làm |
| 27 | Xoá phiên (chưa lưu trữ) ngay + Hoàn tác | Swift `removeSession` / `restoreSession` (`S/WorkbenchStore.swift:105-125`). C++ không có lệnh xoá phiên thường | Lệnh xoá + khôi phục trong C++ | c | | Làm |
| 28 | Phiên dịch · xoá phiên + Hoàn tác | Swift `restoreSession` (`S/Interpretation.swift:99`). C++ chỉ `deleteSession` (QML hỏi xác nhận) | `restoreSession` C++ | c | | Làm |
| 29 | Lịch sử: bộ lọc "Tất cả" + nhiều tính năng, bỏ phiên rỗng, sắp theo `updated`, nhóm Hôm qua / Tuần này | Swift `history(query:archived:features:)` + `HistoryBucket` (`S/WorkbenchStore.swift:93-103`, `S/Models.swift:309`). C++: lọc trong QML, chỉ tính năng hiện tại, không bỏ phiên rỗng, không sắp xếp; `new` không dọn phiên rỗng (Swift dọn ở `:262`) | Hàm history dùng chung trong C++ | c | Phiên rỗng tích tụ trên Qt. | Làm |
| 30 | `updated` thay đổi theo cùng quy tắc | Swift cập nhật mọi lần sửa (kể cả lưu trữ). C++ chỉ 5 lệnh, không có lưu trữ (`Q/WorkbenchDomain.cpp:542`) | Thống nhất quy tắc | c | Ảnh hưởng thứ tự Gần đây / Lịch sử. | Làm |
| 31 | Tiêu đề phiên chỉ có ảnh | Swift dùng tên ảnh (`S/Models.swift:33`); C++ chỉ dùng draft (`Q/WorkbenchDomain.cpp:478-481`) | Thống nhất | c | | Làm |
| 32 | Bảng lệnh ⌘K: dòng "Dịch …", "Hỏi AI: …", `=` máy tính, tiền tố `t` / `d` / `?` | Logic nằm trong view macOS (`N/NativeFoundation.swift:1142` `PaletteQuery`). C++ có `calculate()` nhưng bảng lệnh Qt chỉ lọc lệnh | Đưa `PaletteQuery` vào domain dùng chung | c | | Làm |
| 33 | Trích chữ từ ảnh trên máy | macOS: Vision trên máy. **Qt: gửi ảnh cho model** (tốn token, cần model đọc ảnh, không chạy offline) | Qt: Windows.Media.Ocr; Linux: hoãn | c | Khác hành vi và quyền riêng tư. |  |
| 34 | Reduce Transparency / Increase Contrast → mặt đặc | macOS có. Qt không | Qt 6.10 `QStyleHints`; Windows đọc cài đặt "Transparency effects"; Linux không có chuẩn | c / d (Linux) | Board nên ghi "khi hệ điều hành báo". |  |
| 35 | Tốc độ đọc giữ khi khôi phục bản sao lưu | Xem #9 | — | — | Gộp vào #9. | — |
| 36 | Phiên dịch: trạng thái đọc từng câu (pill "Đang đọc") | Swift `playback` public (`S/Interpretation.swift:49`). C++ `m_audio` private (`Q/Interpretation.h:69`), QML không thấy `speaking` / `error` | Đưa playback ra qua bridge | c | |  |
| 37 | Phiên dịch: thẻ "Đang tổng hợp…" + Huỷ riêng | Swift `summarizing` public, chỉ có `cancel()` dừng tất cả (`S/Interpretation.swift:45,189`). C++ `summarizing` không phải Q_PROPERTY | `summarizing` ra QML + `cancelSummary()` cả hai | b/c | | Làm |
| 38 | Phiên dịch: lưu thiết bị micro theo phiên | Swift lưu `deviceID` (`S/Interpretation.swift:18,118`); C++ không | C++ lưu `deviceID` | c | | Làm |
| 39 | Từ điển: giới hạn ngữ cảnh 500 khi tra | Swift kiểm (`S/WorkbenchStore.swift:499-500`); C++ `submit` không kiểm (`Q/WorkbenchDomain.cpp:460`) | Kiểm trong C++ | c | | Làm |
| 40 | So sánh: "Theo cột / Theo câu" được nhớ | Swift lưu `compareBySentence` (`:366`); Qt chỉ CheckBox cục bộ | Đưa vào state C++ | b | | Làm |
| 41 | So sánh: thứ tự cột (model đang dùng là cột đầu) | Swift **sắp xếp** model (`Array(Set(models)).sorted()` `:373`); C++ giữ thứ tự truyền vào | Giữ thứ tự truyền vào ở Swift | c | Board nói "model đang dùng luôn là cột đầu". | Làm |
| 42 | Khoá công tắc module cuối cùng | Swift `lockedModule` (`S/WorkbenchStore.swift:71,77`); C++ không kiểm (`Q/WorkbenchDomain.cpp:276`) | Kiểm trong C++ | c | Tắt hết module trên Qt. | Làm |
| 43 | Cập nhật: hộp thoại tự hiện, "Nhắc sau 24 giờ", kiểm tra nền, công tắc tự kiểm tra | Swift đủ (`S/WorkbenchStore.swift:438-474`). C++ chỉ có kiểm tra / tải / huỷ / ghi chú | Port vào C++ + bridge | c | | Làm |
| 44 | Launcher tiền tệ: tỷ giá đơn vị, tiền đích mặc định / ghi nhớ, bí danh, trạng thái tải / lỗi | Swift đủ (`S/LauncherTools.swift:67-150`, `S/CurrencyRates.swift`). C++ chỉ cú pháp `<số> ABC to XYZ` (`Q/CurrencyRates.cpp:31`) | Port `LauncherCurrency` sang C++ | c | |  |
| 45 | Launcher truy vấn trống: "Tiếp tục Quick AI", trang Viezan | Swift có (`N/Launcher.swift:161-185`, logic trong view). Qt chỉ có app gần đây | Đưa vào domain dùng chung | c | | Làm |
| 46 | Máy này: RAM | Swift có nhân + RAM (`S/LocalRuntime.swift:12-13`); C++ chỉ số nhân (`Q/LocalRuntime.h:15`) | RAM trong C++ | c | | Làm |
| 47 | Model local gợi ý | Danh sách cứng trong view macOS (`N/LocalModelSettings.swift:16-21`); C++ không có | Danh sách dùng chung trong domain / `native.json` | c | Board ghi tên model khác với code (xem #73). | Làm |
| 48 | Giọng đọc nhóm theo ngôn ngữ, có giới tính | Swift có id / tên / ngôn ngữ, không có giới tính (`S/NativeAudio.swift:5`); C++ chỉ có tên | Thêm ngôn ngữ (C++) và giới tính (cả hai) | c | |  |
| 49 | Quick Chat / Quick Translate trên Qt: đang nghĩ, lỗi, Tạo lại, chưa có model, "Đang dịch sang…", tên model | Backend C++ có (`retry`, `errorCode`, `providersEmpty`, `selectionUnavailable`) | Chỉ nối giao diện (đợt Windows) | b | |  |

## C. Cả hai nền tảng chưa có (thêm được)

| # | Giao diện cần | Hiện có | Nơi sẽ đụng | Loại | Ghi chú | Quyết định |
| --- | --- | --- | --- | --- | --- | --- |
| 50 | Trang chủ · dòng phiên dịch "2 người nói · 38 câu" | Dữ liệu có (`segments`, `speaker`) | Chỉ view | b | macOS hiện chỉ có cặp ngôn ngữ. | Làm |
| 51 | "Sao chép ảnh" | Không có | NSPasteboard / QClipboard | c | Việc nhỏ. | Làm |
| 52 | "Đã tạo 1 ảnh 1024×1024" | Kích thước tính rồi bỏ (`S/Attachments.swift:47`; `Q/Attachments.cpp:24`) | Trường tuỳ chọn `width` / `height` | c | Hoặc bỏ khỏi board. | Làm |
| 53 | Tên model tạo ảnh ("GPT Image") | Biến cục bộ, không lưu (`S/ImageGeneration.swift:24`) | Lưu model ảnh trên tin nhắn / task | c | | Làm |
| 54 | Dòng nhắc "Tạo ảnh cần API key … · Thêm key" | Có `ImageGeneration.provider` / `imageProvider()`; chưa có dòng nhắc | Chỉ view | b | | Làm |
| 55 | Hoạt động: gom "So sánh 3 model · 2/3 xong" thành một hàng | `comparisons(id)` có | Chỉ view | b | | Làm |
| 56 | Lưu trữ: nhóm "Lưu trữ tháng trước", "lưu trữ 5 ngày trước" | Không có `archivedAt` | Trường tuỳ chọn `archivedAt` | c | Hoặc board dùng nhóm thường. | Làm |
| 57 | Đổi tên để trống → dùng câu hỏi đầu tiên | Lưu "" rồi hiện "Chat mới" | Tính lại tiêu đề từ tin nhắn đầu | c | | Làm |
| 58 | Xem trước phiên Dịch "Tự động" ghi ngôn ngữ đã nhận dạng | Không lưu ngôn ngữ nhận dạng | Dùng `TextLanguage.detect` (xem #22) | b | | Làm |
| 59 | Hiệu chuẩn quạt: chỉ số quạt (i/n), "Nhận diện lúc …", "Quên kết quả" | Không có `calibratedAt`, không có `forgetCalibration` (`S/ThermalMonitor.swift:87`) | `ThermalMonitor` | c | chỉ macOS | Làm |
| 60 | Ứng dụng · nhật ký: giờ, dung lượng mỗi lần | `created` có nhưng chưa hiện (b); `snapshot.bytes` internal (c) | `ApplicationJournal` + view | b/c | chỉ macOS | Làm |
| 61 | Ứng dụng · nhãn "dữ liệu cá nhân, giữ mặc định" | Không có mã lý do | Mã `personalData` trên `ApplicationDataItem` | c | chỉ macOS | Làm |
| 62 | Model local: chip CPU, "Đang tải · 2,1 / 4,9 GB", dung lượng model, tốc độ đã đo từng model | Chỉ có tỉ lệ %, không có bytes, dung lượng, tốc độ theo model | `LocalModelManager`, `LocalProvider` (đọc `size`), `LocalPerformance` | c | |  |
| 63 | Cập nhật: "kiểm tra 8 phút trước", ETA "khoảng 20 giây nữa" | Không lưu thời điểm kiểm tra; chỉ có tỉ lệ | `NativeUpdates` | c | | Làm |
| 64 | Dữ liệu: "Dọn lịch sử" toàn bộ + số mục | Chỉ có cắt còn N (tối thiểu 20) | `clearHistory()` cả hai | c | | Làm |
| 65 | Launcher: tệp / thư mục + "~/Documents · hôm qua"; deep link trang con Cài đặt; nút Thử lại khi lỗi | `LauncherFile` chỉ có id / tên | `isDirectory`, ngày sửa; route trang con | c | |  |
| 66 | Phiên dịch: xuất / sao chép theo "Chỉ bản dịch" | Luôn song ngữ | Tuỳ chọn `translatedOnly` | c | | Làm |
| 67 | Phiên dịch: "Bắt đầu" nghe tiếp vào cùng phiên | `start` luôn tạo phiên mới (`S/Interpretation.swift:117-119`; `Q/Interpretation.cpp:81-82`) | Đường resume với độ lệch thời gian | c | Hoặc board bỏ "nghe tiếp vào cùng phiên". | Hoãn |
| 68 | Phiên dịch: lỗi lưu lịch sử + "Thử lại" | Không có `reload()` | `reload()` cả hai | c | Hoặc board bỏ "Thử lại". | Làm |
| 69 | Phiên dịch: "Tổng hợp tất cả 4 phân tích" | Một loại mỗi lần, khoá `busy` | Hàng đợi 4 lượt | c | Tốn gấp 4; ghi rõ trên board. | Hoãn |
| 70 | Tab Ví dụ: ví dụ thuộc nghĩa nào; nhãn văn phong ("đời thường") | Số nghĩa suy được (b); văn phong không có (c) | View; trường `examples[{text, translation, register}]` tuỳ chọn | b/c | | Làm |
| 71 | Dịch: tên ngôn ngữ nhận dạng khi nguồn "Tự động" | Không có | `TextLanguage.detect` trên draft | c | Qt không phân biệt các ngôn ngữ chữ Latin; board cho phép "Tự động" không kèm tên. |  |
| 72 | Từ điển: "Dịch cả câu" gửi kèm ngữ cảnh | Cả hai chỉ gửi headword | View / `createDetachedSession` | b | Hoặc đổi nhãn thành "Dịch" (đang dùng). | Làm |

## D. Board không khớp hành vi hoặc chính sách (đề xuất sửa board)

| # | Board | Chỗ sai | Đề xuất | Quyết định |
| --- | --- | --- | --- | --- |
| 73 | Settings-Local | Tên model gợi ý (Qwen3 8B / Gemma 3 12B / Llama 3.3 8B) khác code (Qwen3 4B, Gemma3 4B, Llama3.2 3B, Qwen2.5 7B) | Board theo code, hoặc cập nhật danh sách dùng chung (#47) | Làm |
| 74 | Overlays | Toast "quá 10 MB" | Giới hạn là 20 MB; dùng chuỗi `attachFailed` | Làm |
| 75 | History / History-Archived | "4 lượt" và "2 lượt" cho cùng 2 cặp hỏi–đáp | Chọn một quy tắc (đề xuất: số câu hỏi) | Làm |
| 76 | Overlays-Language (Tuỳ chọn dịch) | "Áp dụng cho lượt dịch tiếp theo" | Cả hai store dịch lại ngay; sửa câu board | Làm |
| 77 | Apps | Mục "khớp tên hãng" được tick sẵn; tổng "4 mục · 401 MB" | Chính sách an toàn khoá các mục này và không tick plist; vẽ ở trạng thái khoá | Làm |
| 78 | Thermal | "Yên tĩnh giữ quạt dưới 2 000 vòng/phút tới 75 °C rồi nhường lại cho hệ thống" | Mô tả sinh từ `rules`: "Quạt giữ tối thiểu tới 70 °C" | Làm |
| 79 | Thermal-States | "Khởi chạy helper chỉ cho phiên này… trả quạt về tự động khi thoát" | Helper là dịch vụ chạy nền lâu dài (SMAppService), có thể cần duyệt trong Mục đăng nhập; sửa câu | Làm |
| 80 | Shortcuts | Tổ hợp ⌥C / ⌥D | Mặc định thật là ⌃⌥Space / ⌥T / ⌥Space và đều tắt; sửa board hoặc đổi mặc định ở cả hai | Làm |
| 81 | Shortcuts-Recorder | "Trùng với Spotlight" | Chỉ phát hiện trùng nội bộ; dùng câu chung "Không đăng ký được tổ hợp này" | Làm |
| 82 | Settings-Models | ElevenLabs "· 6 model"; thiếu hàng Jina; Groq (nhận dạng giọng nói) nằm nhóm Cloud | Bỏ số model ở hàng không phải chat; thêm Jina; cân nhắc chuyển Groq | Làm |
| 83 | Overlays-Settings | "nạp 1,8 s" trong Đo hiệu năng | Dữ liệu là thời gian ra token đầu; đổi nhãn | Làm |
| 84 | UpdateSheet-States | "Viezan sẽ thoát bình thường…" | Mở gói không thoát app; câu riêng theo nền tảng | Làm |
| 85 | Interpret / Interpret-States | "Lưu … sau khi kết thúc phiên"; "Đã lưu trên thiết bị lúc 10:46" | Lưu liên tục sau mỗi câu; ghi "Lưu trên thiết bị" | Làm |
| 86 | Interpret | "Tổng hợp nội dung" khi đang nghe | Không chạy được khi đang nghe (khoá `busy`); vẽ nút vô hiệu | Làm |
| 87 | Interpret-Summary | "Các tab khác tạo khi mở lần đầu" | Sẽ gọi AI ngầm; thay bằng nút "Tạo" trong tab | Làm |
| 88 | Everywhere (Qt) | "Quyền trợ năng · Đã cấp" | Windows/Linux không có quyền này; thay bằng "khả năng thay vùng chọn" | Làm |
| 89 | Settings-Data | "Khi đầy, mục cũ nhất bị bỏ và có thông báo" | Chỉ là thao tác cắt một lần; sửa thành "Giữ N mục mới nhất [Dọn]" hoặc làm giới hạn thật | Làm |
| 90 | Overlays-Listen | "Loa nhỏ: đọc bằng giọng của ngôn ngữ đó" | Chỉ đúng nếu #8 = Làm; nếu không, ghi "giọng đã chọn" | Làm |

## E. Kiểm lại thực tế sau lượt 2 (2026-11-03)

Đối chiếu 37 mục chưa "Làm" với code hiện tại (chưa commit). Chỉ đọc code, chưa chạy app.

- **Kết quả:**
  - Không mục nào đã xong trên cả hai nền tảng.
  - Một phần đã xong: #11, #12, #14, #36, #49, #62, #71 (cột "Trạng thái" ghi rõ phần nào).
  - Còn lại là khoảng trống thật.
- **Quy ước:**
  - Số dòng trong cột "Hiện có" ở bảng A–C có thể đã lệch sau hai lượt sửa; vị trí đúng nằm trong bảng dưới.
  - "QML" nghĩa là backend C++ đã có tới bridge, chỉ chưa có giao diện (việc của đợt Windows).

| # | Trạng thái | Hiện có (đúng với code hiện tại) |
| --- | --- | --- |
| 8 | Còn trống; Swift có một phần | Swift: một `voiceID`; giọng trống hoặc đọc giọng hệ thống một lần thì dùng giọng mặc định của ngôn ngữ (`S/NativeAudio.swift:93`); prefs ở `S/Models.swift:150-159`. C++ `voices()` chỉ có tên, không có locale (`Q/NativeAudio.cpp:137`) |
| 10 | Còn trống | Không có thời điểm bắt đầu ghi âm ở cả hai bên |
| 11 | Swift xong; Qt: QML | `N/QuickTranslate.swift:152` hiện "· 1,4 giây". C++ có `started` / `finished` trong `state.tasks`, QML chưa đọc |
| 12 | Phiên bản: macOS xong; dung lượng còn trống | `N/UpdateSettings.swift:19` ("phiên bản mới nhất (v…)"). Qt chỉ có hàng phiên bản. Dung lượng chỉ biết lúc tải (`S/NativeUpdates.swift:87`, `Q/NativeUpdates.cpp:76`), không đưa ra ngoài |
| 13 | Còn trống (Hoãn) | `S/WorkbenchStore.swift:404`, `Q/WorkbenchDomain.cpp:445`: tối đa 3 |
| 14 | Domain xong; chưa view nào đọc | Nghiên cứu chạy trong task có `started` ở cả hai bên; chỉ còn thiếu đồng hồ trên giao diện |
| 15 | Còn trống (chỉ macOS) | Chỉ có pha + số giây còn lại (`S/ThermalMonitor.swift:79-80`) |
| 16 | Còn trống | Swift chỉ kiểm trong view (`N/SystemSettings.swift:14`). C++ kiểm nội bộ ở `Q/Interpretation.cpp:86` và `Q/NativeAudio.cpp:48`, không đưa ra bridge |
| 17 | Còn trống (Hoãn, chính sách) | `appIncomplete` ở `S/Applications.swift:84,105,112,119` |
| 18 | Còn trống | `N/Workspaces.swift:876`: chỉ tô đỏ bộ đếm, nút Dịch không khoá; store và C++ không có giới hạn |
| 19 | Còn trống (OCR trên Qt) | Luồng `ImageTranslation` đã có ở cả hai bên. Khoảng trống thật: Qt trích chữ bằng model của phiên (`Q/WorkbenchBridge.cpp:478-492`) |
| 20 | Còn trống (Hoãn) | Không có logo; `Q/qml/icons/providers.svg` là biểu tượng chung |
| 26 | Còn trống trên C++ | Swift `S/WorkbenchStore.swift:303-314`; C++ không có tầng model; `recentModels()` vẫn private. Bảng So sánh trên Swift cũng chưa có nhãn "Gần đây" / "Cân bằng" |
| 27 | Còn trống trên C++ | Swift `S/WorkbenchStore.swift:113-128`; C++ chỉ có `archive` / `deleteArchived` |
| 28 | Còn trống trên C++ | Swift `S/Interpretation.swift:108`; C++ chỉ có `deleteSession` |
| 32 | Còn trống | `PaletteQuery` vẫn nằm trong view (`N/NativeFoundation.swift:1142`); bảng lệnh Qt chỉ lọc lệnh |
| 33 | Còn trống | Như #19 |
| 34 | Còn trống trên Qt | `Q/qml/Kit.qml:69` ghi rõ chưa đưa trạng thái này ra QML |
| 36 | Swift xong; C++ còn trống | Swift đọc `playback.speakingSource`. C++: `m_audio` private (`Q/Interpretation.h:70`), `speak()` không truyền nguồn |
| 37 | Còn trống | Swift `summarizing` public, chỉ có `cancel()` dừng tất cả (`S/Interpretation.swift:198`). C++ `m_summarizing` private |
| 43 | Còn trống trên C++ | Swift `S/WorkbenchStore.swift:469-505` |
| 44 | Còn trống trên C++ | C++ chỉ có cú pháp `<số> ABC to XYZ` (`Q/CurrencyRates.cpp:31`) |
| 45 | Còn trống | Logic nằm trong view `N/Launcher.swift:160-185`, `QuickAISession` ở `N/LauncherChat.swift:7`; Qt chỉ có app gần đây |
| 47 | Còn trống | Danh sách cứng trong view `N/LocalModelSettings.swift:16-22` |
| 48 | Còn trống | Không có giới tính; C++ không có ngôn ngữ |
| 49 | Backend có; QML còn thiếu | `Q/qml/DesktopPanels.qml` chỉ hiện `desktop.error` và nút Dừng; chưa hiện lỗi task, đang nghĩ, Tạo lại, `providersEmpty`, tên model |
| 59 | Còn trống (chỉ macOS) | Đã lưu kết quả dưới dạng `affinity` (`S/ThermalMonitor.swift:81`); chưa có `calibratedAt`, "Quên kết quả", chỉ số i/n |
| 60 | Còn trống (chỉ macOS) | `created` có nhưng chưa view nào đọc; `snapshot.bytes` internal |
| 61 | Còn trống (chỉ macOS) | Không có mã `personalData` |
| 62 | Một phần | Chip CPU / RAM có ở cả hai bên; dung lượng chỉ có cho model gợi ý (cứng trong view macOS). Chưa có bytes đang tải, dung lượng model đã cài, tốc độ theo từng model |
| 63 | Còn trống | Không lưu thời điểm kiểm tra, không có ETA |
| 65 | Còn trống | `LauncherFile` chỉ có id / tên. Swift đã có `openSettings(section)` nhưng Launcher chưa dùng; nút Thử lại chỉ có cho tỷ giá |
| 66 | Còn trống | Xuất luôn song ngữ ở cả hai bên |
| 67 | Còn trống (Hoãn) | `start` luôn tạo phiên mới |
| 68 | Còn trống | Không có `reload()`; C++ còn không đưa trạng thái lỗi lưu ra ngoài |
| 69 | Còn trống (Hoãn) | Một loại mỗi lần, khoá khi `busy` |
| 71 | Một phần | Swift: dùng trong Lịch sử, đọc to, Dịch nhanh; pane Dịch vẫn chỉ ghi "Tự động nhận dạng". C++: có `speechLanguage()`, QML chưa gọi |

## Prompt kiểm tra và kết nối backend

```
Đọc AGENTS.md, .claude/rules/ui-ux.md, .claude/rules/testing.md,
docs/design/glass2/HANDOFF.md (mục 5) và docs/design/glass2/BACKEND-GAPS.md.
Đọc các báo cáo docs/migration/reports/native-migration-report-*-glass2-dot*.md.

Việc: đối chiếu giao diện Liquid Glass 2.0 với backend hiện tại và nối những
gì còn thiếu.

Bước 1 — kiểm kê, chưa sửa code:
- Với từng board trong docs/design/glass2/boards/, liệt kê mọi dữ liệu, trạng
  thái và hành động mà board thể hiện. Ghi rõ mỗi mục: đã có trong
  ViezanDomain (Swift) chưa, đã có trong dịch vụ C++ của apps/desktop-qt chưa,
  view đang đọc nó ở đâu.
- Phân loại mỗi mục:
  (a) backend có, giao diện đã nối;
  (b) backend có, giao diện chưa nối;
  (c) backend chưa có, thêm được;
  (d) không nên hoặc không thể hỗ trợ (giới hạn hệ điều hành hay nhà cung cấp,
      đổi chính sách, chi phí), kèm lý do và đề xuất sửa board.
- Đánh dấu chỗ hai nền tảng lệch nhau (Swift có mà C++ chưa có, hoặc ngược lại).
- Cập nhật bảng trong BACKEND-GAPS.md: thêm hàng mới, điền cột "Hiện có" và
  "Nơi sẽ đụng" cho chính xác. Không tự điền cột "Quyết định".
- Dừng, báo cáo bảng tóm tắt và chờ tôi điền "Quyết định".

Bước 2 — sau khi tôi điền "Quyết định", chỉ làm các mục "Làm":
- Sửa domain cho cả Swift (ViezanDomain) và C++ (apps/desktop-qt) cùng lúc;
  khi đổi schema, cập nhật contracts/native-workbench/ và fixture.
- Trường mới là tuỳ chọn; dữ liệu đã lưu, phiên cũ và bản sao lưu cũ phải đọc
  được như trước.
- Nối view macOS với dữ liệu mới. Phía Qt chỉ nối tới WorkbenchBridge; giao
  diện QML làm ở đợt Windows.
- Mục "Bỏ": gỡ khỏi board (.dc.html + .png), canvas.json và HANDOFF; ghi lý do.
- Giữ nguyên OS credential store, request có giới hạn, ghi file nguyên tử,
  quyền helper. Không thêm gọi AI ngầm.

Kiểm chứng:
- npm run check:resources; node --test scripts/native/__tests__/domain.test.mjs;
  swift test --package-path apps/macos; QtTest theo CONTRIBUTING.md nếu máy có
  Qt. Viết test cho mỗi trường hoặc hành vi mới, gồm cả trường hợp dữ liệu cũ.
- Thêm docs/migration/reports/native-migration-report-<ngày>-glass2-backend.md:
  bảng mục đã làm / bỏ / hoãn, test, mục chưa kiểm.
- Không commit. Dừng và báo cáo khi xong.
```
