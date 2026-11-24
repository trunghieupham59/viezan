# Việc còn mở sau ngày 2026-11-24

Tổng hợp từ `native-code-63…82`, `qt-parity-1…19`, `SPRINT-DESIGN-NOTES-20261124.md`,
`QT-DESIGN-AUDIT-20261124.md` và phần thêm hôm nay của `docs/design/findings.md`.
Mục đã được một báo cáo sau xác nhận là xong thì không còn ở đây. "Chưa rõ" nghĩa
là không báo cáo nào xác nhận đã xong.

Các mục về Classic hoặc preset khác Glass trong 63/64/71/73/78 không còn áp dụng
(Classic đã gỡ ở native-code-79, 81).

## Trạng thái kiểm tra khi dừng (macOS arm64, 2026-11-24)

- `swift test --package-path apps/macos`: đạt (212 + 116 test).
- Fan helper: build đạt, self-check đạt.
- Qt 6.12 offscreen/Fusion: build đạt, `ctest` 9/9 shard đạt.
- `npm run check:resources`, `npm run check:docs`, `domain.test.mjs` (11/11): đạt.
- `test_*.py`: 8/8 đạt với Python 3.13; Python hệ thống 3.9 lỗi `hashlib.file_digest`.
- Chưa chạy: app thật trên cả hai nền tảng, Windows/Linux, Qt 6.8.3, trình đọc màn hình.

## Ngoài mã nguồn

- `git stash@{0}` (`a11y-63-before-ff-20261124`, 26 tệp, chủ yếu spec trong
  `docs/design/screens/`) chưa được áp lại hay bỏ.
- `.vscode/launch.json` và `docs/agents/reports/vscode-problems-report-20261104-0907.md`
  để nguyên, chưa commit.
- Bản phát hành: workflow `Package Native Release` chạy khi PR đổi version được
  merge vào `develop`; bước ký manifest cần secret `VIEZAN_UPDATE_SIGNING_KEY`
  khớp khoá công khai trong hai tệp `NativeUpdates`. Lần chạy đầu tiên của bước
  ký này chưa được kiểm trên CI.

## 1. macOS — tính năng/code chưa làm

- Panel model: chưa đặt nút ghim trước dấu ✓, chưa có `KeyCap ⌘P` và bộ đếm `n/8` ở chân panel, chưa khoá ghim khi đủ 8/8, chưa có chuỗi `pinnedModelsCount`; chờ duyệt thiết kế (native-code-64, SPRINT-DESIGN-NOTES N6)
- `pinnedModels` chưa nằm trong phần tuỳ chọn của bản sao lưu, vì định dạng sao lưu dùng chung với Qt (native-code-64)
- Thao tác phím trong panel model (vị trí `nhóm/hàng`, ⌘P) chưa có test tự động (native-code-64)
- Tải model local: chưa cộng dồn bytes theo từng layer Ollama, số có thể quay về đầu khi sang layer mới; chưa dịch trạng thái thô của runtime; hàng đang tải chưa theo board (native-code-65)
- Dung lượng model chưa được lưu ngay trong bước khám phá nhà cung cấp; hiện đọc riêng mỗi khi danh sách đổi (native-code-66)
- Launcher: chưa dùng chuỗi/trạng thái `launcher_apps_unavailable` (native-code-67, 68)
- Từ điển: chưa có gợi ý `⌘⇧C`/`⌘V` dưới ô trống và tooltip kèm phím tắt trên nút ngữ cảnh (native-code-68, SPRINT-DESIGN-NOTES T2)
- Từ điển: lỗi tra vẫn dùng `HStack` kiểu cũ thay `InlineFailure`; trạng thái "không tìm thấy" thiếu icon tìm và hai lối thoát dạng `.row` (native-code-68, SPRINT-DESIGN-NOTES T2)
- Từ điển ở cửa sổ hẹp 820: ô trống chưa co về 44, ngôn ngữ/model/nút mục từ chưa rút gọn như Qt; chân mục từ thiếu "Lưu trên thiết bị" (khoá mới `savedOnDevice`); `savedWords` thiếu `wordsCount` (SPRINT-DESIGN-NOTES T2)
- Từ điển: `⌘⇧C` chưa có test tự động và chưa vào menu Lệnh; chưa cho gõ ngữ cảnh quá 500 ký tự rồi báo lỗi (native-code-68)
- Nhiệt độ: thẻ lỗi có tiêu đề/mô tả riêng (`InlineFailure`, `thermal_error_title/desc`) và dải "không có cảm biến" chưa làm (native-code-68, SPRINT-DESIGN-NOTES T1; chưa rõ R2–R4 trong native-code-82 có phủ không)
- Nhiệt độ: dải cảnh báo khi dịch vụ quạt chờ phê duyệt với ba hành động (Gỡ / Mở Cài đặt hệ thống / Thử lại) và trạng thái "chưa cài" với nút đăng ký chưa làm theo ghi chú thiết kế (native-code-68, SPRINT-DESIGN-NOTES T1; chưa rõ đã xong chưa sau R3)
- Nhiệt độ: bấm Thử lại không chờ tiến trình đọc cũ thoát hẳn trước khi chạy lại (native-code-68)
- Hai chuỗi `deleteKeyConfirm`, `deleteModelConfirm` không còn nơi dùng ở cả macOS lẫn Qt nhưng chưa xoá (native-code-68)
- Nhập sao lưu: tệp ảnh vẫn ghi ra trước khi hai kho lưu xong, để lại tệp mồ côi khi nhập lỗi; chưa đặt `storageError` khi chính lần hoàn tác cũng lỗi (native-code-69)
- Hoàn tác "Dùng làm nguồn" ở Dịch chưa có test tự động (native-code-69)
- Cảm biến IOHID: 26 tên `PMU …` và `als-temp` chưa có nhãn, nằm ở hàng chưa nhận diện; ánh xạ `pACC`/`eACC`/`GPU` chỉ có trong fixture (native-code-70)
- `FanPolicy` xếp `Tf*` vào `cpu` còn `ThermalSensors` xếp vào GPU; `rows` không có tiêu chí phá hoà khi hai hàng cùng nhiệt độ cao nhất (native-code-72)
- `applyProfile` huỷ profile ngay khi cảm biến nêu đích danh vắng một nhịp (native-code-72; chưa rõ R1 trong native-code-80 đã đổi chưa)
- Helper quạt: client không bật Hardened Runtime vẫn qua kiểm tra chữ ký, vì `scripts/native/build.py` ký không có `--options runtime`; chờ quyết định (native-code-76)
- Tự kiểm helper quạt còn hở: ca "fd sai" không phủ `current.fd == client` trong nhánh đổi người dùng console; ca `helper.exit` không phân biệt trễ 0,2 giây; ca `setTarget` hợp lệ không kiểm `result` (native-code-76)
- Ứng dụng (S7): reviewer nghi `ViewThatFits` cho nút xuống hàng sớm ở cửa sổ rộng; helper giữ bước trả lại mục khi kiểm danh tính sau chuyển thất bại; `canTrash` đọc đĩa mỗi lần vẽ dòng (native-code-79)
- Test Swift không có helper `viezan-fs` giả cho `apply`, nên luồng Gỡ/Đặt lại/Chuyển vào Thùng rác chưa có test đầu cuối (native-code-73, 77)
- Toast lỗi quạt: chưa có mức `.medium` (cần sửa `NativeToasts.swift`); hai lần thất bại liên tiếp cùng mã lỗi không được báo lần hai (native-code-82 R3)
- Các quyết định ghi trong `findings.md` hôm nay không có báo cáo triển khai riêng, chưa rõ đã xong hết chưa (mã và CHANGELOG có nhắc, nhưng chưa có báo cáo nghiệm thu): gỡ gói thuộc root qua Finder, cảnh báo dữ liệu cá nhân và nút Full Disk Access ở Ứng dụng, không khoá vì liên kết `.app` hỏng khi đích đã mất, thẻ ghim (tối đa 5, hít mép, loại khỏi chụp màn hình, khôi phục từ thanh menu), toast theo "sự kiện / trạng thái" ở góc trên phải, nút "Cài đặt và khởi động lại" (findings.md)

## 2. Windows/Linux Qt — chưa port/chưa làm

- Ba test `selectionReplacement…` chưa có QtTest: thiếu fixture Windows UI Automation cho vùng chọn UTF-16, setter nhận ghi nhưng giữ nguyên văn bản, và bản dịch giống nguyên văn; hoãn theo phân công tích hợp desktop (qt-parity-12, 14)
- `pastedImageBytesIngestLikeAFileAndRejectNonImages` chưa port: Qt chỉ ingest từ URL file, chưa có ca dán trực tiếp byte PNG (qt-parity-12, 14)
- Dịch nhanh: nhận diện câu tiếng Anh Latin lệch nhau ("The meeting starts at nine": Swift ra `en`, Qt ra chuỗi rỗng rồi dùng ngôn ngữ dự phòng); chưa chốt hành vi (qt-parity-12, 14)
- Chống ngủ và đọc trạng thái tắt tiếng đầu ra (4 test `SystemControlsTests`) chưa có trên Qt; qt-parity-14 xếp là riêng macOS, qt-parity-12 yêu cầu xác định phạm vi Windows/Linux (chưa rõ đã chốt chưa)
- Quy tắc thay văn bản giống hệt vùng chọn trên Windows chưa chốt (qt-parity-12)
- Hai job Qt 6.8.3 (Windows, Linux) trong `.github/workflows/ci.yml` chưa chạy với các thay đổi này; cần xác nhận NTFS junction/`.lnk`, QML/Fusion thiếu `expanded`/`motionPreference`, API qtspeech, liên kết User32/Advapi32/Qt DBus (qt-parity-17)
- `WorkbenchDomain::validate` (C++) vẫn chấp nhận tên preset cũ, trong khi Swift `validated()` chỉ nhận `glass` (native-code-81)
- `ChromeSurface` trong `Kit.qml` còn hai property thừa `darkMode`, `themeColors` (native-code-81)
- Cảnh báo biên dịch có sẵn: bỏ qua kết quả `QFile::open` ở `LocalProvider.cpp` và `Research.cpp` (qt-parity-1, 3, 5, 7, 12–15, 17)
- Chuỗi `captureRegionHint` (VI/EN/JA) chưa nhắc các phím di chuyển, đổi kích thước, xác nhận vùng chọn ảnh (qt-parity-10)
- Chờ lưu phím tắt đang mượn chuỗi `inProgress`; chưa có khoá riêng "Đang lưu phím tắt…" (qt-parity-13)
- Bộ chọn tiền tệ Launcher dùng mã ISO; chưa có danh mục tên tiền đầy đủ VI/EN/JA như menu Swift (qt-parity-2)
- Chưa có mẫu thời gian tương đối cho mốc sửa tệp trong tương lai; Qt dùng ngày ngắn (qt-parity-4)
- Chat nhanh, ô soạn Quick AI của Launcher và Dịch văn bản vẫn gửi bằng Ctrl/Meta+Enter, Enter xuống dòng — khác Chat chính đã đổi sang Enter; chưa có quyết định (qt-parity-16)
- Chưa tái hiện riêng `TypeError` của chip gợi ý trên bản cũ (qt-parity-9)
- Giả thuyết trình đọc màn hình đọc lặp số đo cảm biến ở `ThermalWorkspace.qml` chưa xác minh (qt-parity-13 V1.3)
- `Qt.inputMethod.commit()` trong `chat-draft` có thể chốt sớm preedit khi popup IME đang mở: chưa tái hiện bằng QtTest (qt-parity-18, SPRINT-DESIGN-NOTES)
- Ghim model và phím tắt Ctrl+Shift+M/T trên Qt chưa nghiệm thu sống (native-code-64, qt-parity-2)

## 3. Thiết kế/UX còn mở

- Nút "+" của ô soạn Chat và panel của nó vẫn mang tên trợ năng "Đính kèm ảnh"; đổi sang "Công cụ ô soạn" là quyết định thiết kế riêng (native-code-64)
- Nhãn chế độ đo `gpu`/`hybrid` chưa đổi sang tên hiển thị; "Chưa đo được" chưa đổi thành "Chưa đo" như board (native-code-67, qt-parity-9)
- Lịch sử: chưa có gợi ý "bỏ bộ lọc Lưu trữ" khi không lọc lưu trữ (native-code-68)
- Vị trí chip gợi ý thói quen: Qt có thêm ở Trang chủ, Swift chỉ có ở Chat trống; cần chốt trong spec chung (qt-parity-1)
- Qt `CardBox`/`CardRow`: vạch ngăn thụt vào, tiêu đề thẻ 13px bold thay 15px 600; chưa tách `Kit.GlassField` cho ô nhập ở Cài đặt/Recorder (QT-DESIGN-AUDIT, qt-parity-3 hoãn)
- Qt `PrimaryButton`: chữ 400 thay 600, thiếu viền/bóng nhấn ở Glass (QT-DESIGN-AUDIT, qt-parity-3 hoãn)
- Qt Cài đặt: mục chọn chưa dùng `GlassLens`; `preferredWidth: 268` làm thừa rãnh `FilterGroup`; khung xem trước Giao diện chỉ có 2 `Label`; popup tìm bo 20/rộng 376 thay 14/420 (QT-DESIGN-AUDIT, qt-parity-3 hoãn)
- Qt Cài đặt: dư vạch dòng cuối ở `ProviderSettings.qml`/`ModuleSettings.qml`; bố cục kết quả đo model chưa bọc thẻ; `DataSettings.qml` dùng `CheckBox` thay `GlassSwitch`; `UpdateSheet.qml` dồn nút sang trái (QT-DESIGN-AUDIT, qt-parity-3 hoãn)
- Qt Launcher và cửa sổ phụ: bo 16 thay 20; thiếu vạch chân và `KeyCap`; Quick AI tách hai thẻ thay một thẻ mỗi lượt; Dịch nhanh dùng `GlassComboBox` thay `SettingsPicker` (QT-DESIGN-AUDIT, qt-parity-3 hoãn)
- Qt Ứng dụng: hàng chọn dùng `alternateBase` thay lens; lỗi tô màu `action` thay `danger` (QT-DESIGN-AUDIT, qt-parity-3 hoãn)
- Qt Nhiệt độ: nút Dừng dùng `PrimaryButton` thay danger; thiếu thanh `.meter` (QT-DESIGN-AUDIT, qt-parity-3 hoãn)
- Qt Dịch mọi nơi và Phím tắt: picker native thay `SettingsPicker`, thiếu link đổi model, nút "Thử" dùng `GlassButton`, lỗi recorder không màu `danger` (QT-DESIGN-AUDIT, qt-parity-3 hoãn)
- Qt `StatusBadge`: đã có tông ngữ nghĩa, nhưng cỡ chữ 12px/500 theo audit chưa thấy ghi là đã sửa (chưa rõ)
- Spec `translate.md` còn ghi cảnh báo mềm, trong khi đã chốt chặn cứng 5.000 grapheme; cần thêm hàng R2 và toast Hoàn tác theo phiên (findings.md, qt-parity-12, 19)
- Spec `chat.md` C2 cần ghi ngoại lệ Qt (Enter và Ctrl+Enter cùng gửi) và hành vi hai nút Dừng khi nghiên cứu (qt-parity-6, 16)
- Spec Cài đặt hàng U6 còn hiện song song hai nút, trái quyết định "Cài đặt và khởi động lại" (findings.md)
- Tài liệu cần cập nhật, chưa rõ đã xong chưa: BACKEND-GAPS #36/#44, WINDOWS-HANDOFF, `launcher.md` (tiền tố, thử lại, mục Linux), `settings.md` (tốc độ model, trợ năng tiến độ tải), spec Từ điển (phím tắt Qt), spec Ứng dụng, điểm khác biệt Quick AI (qt-parity-1–8, 11, 13, 14)
- Nhập dữ liệu cũ có preset Graphite/Paper/Corporate/Midnight chuyển sang Glass mà không có thông báo cho người dùng (native-code-81)

## 4. Kiểm tra chưa chạy

- Checklist trợ năng macOS 8 màn × 6 mục đều NOT RUN: Trang chủ, AI Chat, Dịch, Từ điển, Phiên dịch, Cài đặt, Thư viện lịch sử, Chat nhanh/Dịch nhanh; gồm VoiceOver, Tab/Esc/IME, ba cỡ chữ, 640×480 và 1280, Increase Contrast/Reduce Transparency, Reduce Motion (native-code-63)
- macOS: tương phản 4,5:1 của chữ phụ, native halo của focus ring, phụ đề nổi ở cửa sổ phụ thật (native-code-63)
- macOS: ba cỡ chữ với nội dung dài/CJK; tràn ngang hàng ngôn ngữ/footer Dịch ở 640; toast Announcement có đọc lịch sự và không lặp (native-code-63)
- macOS chưa chạy app cho mọi story hôm nay: sáng/tối, 640×480, VoiceOver, focus sau Esc (native-code-64–68, 71–73, 78, 79, 81, 82)
- ⌘P có bị mục In của hệ thống giành không; ⌘⇧C có trùng "Show Colors" không, kể cả khi gõ IME Việt/Nhật (native-code-64, 68)
- Tải model Ollama thật (dòng bytes), đồng hồ nghiên cứu thật, hộp cập nhật khi có bản mới thật (native-code-65, 66, 68)
- Ứng dụng macOS: Gỡ/Đặt lại/Chuyển vào Thùng rác/Hoàn tác thật qua `viezan-fs`, ghi receipt, phục hồi sau gián đoạn; chạy lại sau khi sửa `inUse` (`lsof`); bản cài Riot thật và UID khác thật (native-code-73, 75, 77, 79)
- Ứng dụng macOS: hộp xác nhận (Esc/Return chọn Huỷ, Tab, VoiceOver), quét lại khi hộp đang mở, bố cục 1200/820/560 × VI/EN/JA × ba cỡ chữ (native-code-78, 79)
- Helper quạt chưa chạy với quyền root trên phần cứng: đăng ký daemon, ghi SMC thật, sleep/wake, đổi người dùng console, `serve()` qua socket thật, thoát lúc rảnh (native-code-74, 76)
- Quạt macOS trên máy thật: giữ RPM thủ công, về tự động, ngắt khi mất cảm biến, vòng đời xác nhận sau khởi động lại, cửa sổ mở từ thanh menu, cột ~400 pt tiếng Nhật, thứ tự Tab/VoiceOver của popover Quy tắc (native-code-80, 82)
- Nhiệt độ macOS: màn khi bộ đọc dừng hoặc helper chờ phê duyệt; cắt tên HID dài, tooltip, ghi chú dưới Picker; máy Intel (native-code-68, 70, 72)
- Mất điện giữa hai lần ghi kho (macOS và Qt), giữa rename và công bố receipt; lỗi thiết bị khiến cả bước hoàn tác thất bại (native-code-69, 79, qt-parity-15)
- 66/66 ảnh AppKit và 96/96 ảnh Qt trước/sau khớp điểm ảnh là do Codex báo, chưa chạy lại độc lập (native-code-81)
- Toàn bộ Qt mới chỉ build và chạy QtTest Fusion/offscreen trên macOS arm64 Qt 6.12.0: chưa chạy trên Windows/Linux, FluentWinUI3, Qt 6.8.3, chưa mở app (qt-parity-1–19, native-code-81)
- Ca `acceleratedGlassSurfacesSurviveAppearanceChanges` luôn bị bỏ qua vì offscreen thiếu RHI; bộ render GPU của Qt chưa kiểm (qt-parity-1–19)
- Checklist trình đọc màn hình Qt 6 hàng × Narrator/NVDA/Orca đều NOT RUN (qt-parity-10)
- Qt: IME Việt/Nhật thật, bàn phím số vật lý, Segoe UI 125–150%, High Contrast, Reduce Motion, cuộn quán tính, ba cỡ chữ đọc trên màn thật (qt-parity-9, 10, 13, 16, 18)
- Qt: micro, phát giọng, STT, provider thật, Ollama thật, endpoint tỷ giá thật, kiểm tra cập nhật qua mạng, chạy bộ cài thật, `gsettings` trên desktop Linux (qt-parity-1, 2, 5, 7, 8, 11, 17)
- Qt trên Windows thật: NTFS junction và thư mục Documents chuyển sang ổ khác trong tìm tệp Launcher (qt-parity-8, 17)
- Qt: focus danh sách Ứng dụng và menu hệ thống macOS trực tiếp (qt-parity-2, 9)

## 5. Rủi ro/giới hạn đã biết

- Phục hồi khi ghi hai kho thất bại là nỗ lực tốt nhất: nếu chính lần ghi phục hồi cũng lỗi thì dữ liệu có thể lệch, hàm vẫn báo lỗi (native-code-69)
- Trần nhiệt của dịch vụ quạt chỉ đọc SMC: chọn nguồn HID thì quạt không tự về tự động khi cảm biến đó quá nóng (native-code-72, 82)
- `clientIdentifier` của helper quạt ghi cứng `com.viezan.native.preview`; helper ký ad-hoc bỏ qua kiểm tra chữ ký (native-code-76)
- Khi thoát, helper quạt thử khôi phục tối đa 12 nhịp (3 giây) rồi chỉ ghi log quạt còn thủ công (native-code-76)
- Gốc `/Users/Shared/Riot Games` không đáng tin (symlink, tài khoản khác sở hữu, cho ghi rộng) bị bỏ qua im lặng (native-code-75)
- Liên kết `.app` đứt, mục `unreadable` và `scanLimit` có giới hạn thao tác riêng; kho chỉ lưu 50 đường dẫn chặn dù đếm đủ (native-code-71, 73, 79)
- Định dạng dung lượng dùng locale hệ thống, không theo ngôn ngữ app (native-code-65)
- Sandbox Codex chặn ghi module cache; vài test chỉ đỏ trong sandbox (dán ảnh, OCR, `Notes.rtfd`, `updateReplacesTheAppFromADiskImage`), ngoài sandbox đạt (native-code-63, 71, 73, 75, 77–79)
- Fixture AppKit không thấy toàn bộ nội dung SwiftUI thuần, nên test bố cục 572 pt không chứng minh mọi text frame (native-code-63)
- Qt không có API ghi một workspace tuỳ ý như `FilePersistence` của Swift; test round-trip đi qua đường đọc (qt-parity-12)
- Audit thiết kế Qt và review của Antigravity là đọc tĩnh, chưa mở app (QT-DESIGN-AUDIT, SPRINT-DESIGN-NOTES)
- Qt 6.12 mới có `motionPreference`, 6.10 mới có `styleHints.accessibility`; trên 6.8.3 chạy nhánh dự phòng chưa được CI xác nhận (qt-parity-10, 17)
