# Liquid Glass 2.0 · bàn giao sang Windows (Qt)

Đọc file này đầu tiên khi mở repo trên máy Windows. File này cho biết việc đã làm, phần còn lại, cách dựng app và thứ tự chạy prompt.

Cập nhật lần cuối: 2026-11-03, sau ba lượt backend trên máy Mac.

## 1. Bối cảnh trong một phút

- **Thiết kế:** Viezan chuyển sang ngôn ngữ thiết kế **Liquid Glass 2.0**, gồm ba lớp cảnh:
  - nền gradient champagne → taupe → lavender;
  - một mặt đọc trắng sữa;
  - kính chỉ dùng ở sidebar, nút header, composer, bộ lọc và lớp nổi.

  Nguồn thiết kế là canvas Claude Design; bản sao trong repo ở `docs/design/glass2/boards/` (`.dc.html` có số đo, `.png` để so bằng mắt). Quy tắc và ánh xạ vật liệu → thành phần nằm ở [HANDOFF.md](HANDOFF.md) mục 2–5.
- **macOS (SwiftUI):** đã làm Đợt 1–9 và đã duyệt. Báo cáo ở `docs/migration/reports/native-migration-report-*-glass2-dot*.md`; mỗi báo cáo có mục "Chênh lệch còn lại".
- **Qt (`apps/desktop-qt`):**
  - **Giao diện:** mới có Đợt 7a, làm và kiểm trên Qt chạy trên macOS (báo cáo `...-glass2-dot7.md`).
    - Đã có:
      - `Kit.qml`: `AppBackdrop`, `GlassPane`, `GlassLens`, `FlatCard`, `SearchField` kiểu `.field`, `FilterGroup` kiểu `.seg`, `KeyCap`, `PrimaryButton` gradient, `StatusBadge` 24.
      - Shell: header là các pill kính, mặt đọc `.content`, sidebar là pane kính.
      - Trang chủ Glass.
      - Hàng "Phím tắt toàn cục" trong Cài đặt.
    - Chưa có: bố cục bên trong mọi màn còn lại. Hiện chúng chỉ đổi vật liệu qua `Kit.qml`.
  - **Backend C++:** đã ngang macOS cho mọi mục board cần ở W1–W5, trừ các mục ưu tiên thấp ở mục 7. Mọi thứ đã nối tới `WorkbenchBridge` và có QtTest. **QML chưa dùng các phần này**: đó là việc của các bước W1–W5 (mục 5).
- **Nguồn đối chiếu backend:** [BACKEND-GAPS.md](BACKEND-GAPS.md). Mục "E" là bản kiểm lại thực tế; cột "Quyết định" cho biết mục nào đã làm.

## 2. Trước khi chuyển máy (trên Mac, tối nay)

1. Commit và push toàn bộ thay đổi trên `develop`: Đợt 1–9, board, ba lượt backend, tài liệu. Đến lúc viết file này mọi thứ **vẫn chưa commit**; agent không tự commit, anh/chị ra lệnh hoặc tự làm.
2. Kiểm nhanh trước khi push (đều đã xanh lúc viết):
   - `swift test --package-path apps/macos`;
   - ctest Qt (Fusion);
   - `npm run check:resources`.
3. Không đưa dữ liệu cá nhân, khoá API hay `workbench.json` của máy Mac sang Windows.

## 3. Trên Windows: cài đặt, dựng và kiểm

1. Clone hoặc pull `develop`.
2. Cài theo `CONTRIBUTING.md`:
   - Qt 6 (bản CI đang dùng; trên Mac đã kiểm với 6.12) và kit MSVC (Qt Creator tuỳ ý);
   - CMake, Node (cho `npm run resources`), Python 3.
3. Dựng và kiểm:

```sh
npm run check:resources
node --test scripts/native/__tests__/domain.test.mjs
cmake -S apps/desktop-qt -B .native-build/qt -DBUILD_TESTING=ON -DCMAKE_BUILD_TYPE=Release
cmake --build .native-build/qt --config Release
ctest --test-dir .native-build/qt -C Release --output-on-failure
```

- ctest tự đặt `QT_QPA_PLATFORM=offscreen` và `QT_QUICK_CONTROLS_STYLE=Fusion` (`apps/desktop-qt/CMakeLists.txt:36`), như CI. Trên Mac: **150 test xanh** với Fusion.
- Trên Windows chạy thêm một lần file test với style mặc định (FluentWinUI3) để thấy cảnh báo riêng của nền tảng. Trên Mac, chạy file test với style macOS sẽ có 69 test đỏ vì cảnh báo QML của style đó; đây không phải lỗi logic. Ghi lại số liệu FluentWinUI3 trong báo cáo W0.
- **Chỉ có thể kiểm trên Windows** (trên Mac đã dựng nhưng chưa chạy):
  - `LocalRuntime::memoryBytes()` dùng `GlobalMemoryStatusEx`;
  - nhánh `NOMINMAX` + `windows.h` trong `LocalRuntime.cpp`.

## 4. Bài học từ Đợt 7a (để khỏi lặp lỗi)

- Binding loop từng làm QtTest đỏ ở `FilterButton` (`palette.buttonText`) và `KeyCap` (`height`). Tính kích thước bằng padding, không gán ngược `implicitHeight`.
- `MultiEffect` phải `anchors.fill: parent`, nếu không mặt kính để lại một hình chữ nhật sáng khi nút giãn ra. Tránh dùng `MultiEffect` trên mặt rộng; khi render bằng phần mềm thì không có bóng.
- Ký tự `&` trong nhãn nút biến thành mnemonic. Thay bằng `&&`.
- Kính trong Qt là mặt bán trong kèm phản sáng, vẽ trong scene. Đừng tuyên bố blur desktop.
- Reduce Transparency / Increase Contrast chưa có nhánh mặt đặc trong Qt (BACKEND-GAPS #34, chưa làm). Trên Windows đọc được cài đặt "Transparency effects" và chế độ High Contrast; dùng chúng để chọn nhánh mặt đặc (board `Shell-Solid`). Đây là việc C++ nhỏ ở W5: hỏi trước khi đụng C++.
- Thanh tiêu đề: bản Qt trên macOS dùng khung hệ thống. Trên Windows, kiểm vị trí nút thu gọn sidebar và breadcrumb so với khung cửa sổ Windows 11.
- Dịch mọi nơi (BACKEND-GAPS #88): Windows và Linux không có "Quyền trợ năng". Thay dòng đó bằng trạng thái "có thể thay vùng chọn" (`desktopIntegration.canReplaceSelection`).
- Bố cục hai pane Dịch (bài học từ macOS Đợt 9): chia hai cột bằng nhau theo vùng chứa, không theo nội dung. Nút ở chân pane phải co lại (nhãn → biểu tượng) khi thiếu chỗ, nếu không pill "Đang đọc" sẽ đẩy cả màn và lớp Nghe xê dịch.

## 5. Thứ tự làm và backend sẵn có cho từng bước

QML chỉ cần nối các phần dưới đây, không viết lại logic. `bridge` = `workbench` trong QML; `state` = `workbench.state`.

### W0 · Nghiệm thu 7a trên Windows

- **Việc:** dựng, QtTest (Fusion + FluentWinUI3), chụp shell và Trang chủ; sửa lỗi riêng của nền tảng (DPI 100/125/150 %, font Segoe UI Variable, khung cửa sổ).
- **Board:** Foundations, Home, Translate-Compact.

### W1 · AI Chat, lớp nổi shell, thư viện Lịch sử

- **Board:** Chat-*, Overlays, History*, Shell-States, Nav-Overlay.
- **Gợi ý thói quen và mức suy luận (macOS native-code-62):** C++ chưa có; port `HabitSuggestions.swift` sang `WorkbenchDomain`/bridge rồi nối QML.
- **Lịch sử:**
  - `bridge.history(query, archived, features)`: lọc nhiều tính năng, bỏ dấu, bỏ phiên rỗng; kho lưu trữ sắp theo `archivedAt`.
  - Nhóm theo `updated` (kho lưu trữ: theo `archivedAt ?? updated`) như `HistoryBucket` của macOS: hôm nay / hôm qua / tuần này / trước đó.
  - Chuỗi `group_*` và `archivedGroup_*`; hàng lưu trữ ghi `archivedAgo`.
- **Xoá phiên ngay + Hoàn tác (#27):** `bridge.removeSession(id)` trả `{session, index}` (rỗng = bị từ chối vì đang chạy); nút Hoàn tác của toast gọi `bridge.restoreSession(session, index)`. Không hỏi xác nhận (luật trong `.claude/rules/ui-ux.md`).
- **Đổi tên** để trống thì tự lấy lại tiêu đề từ câu hỏi đầu (lệnh `rename`).
- **Chọn model (#26):**
  - `bridge.modelSections(query, sessionID)` trả các nhóm `{key, rows}`:
    - `key` ∈ `purpose | recent | openai | claude | gemini | local | typed`;
    - `rows[].kind` ∈ `tier | model | setup | typed`.
  - Hàng mục đích: `bridge.applyModelTier(sessionID, "fast" | "balanced" | "careful")`; Kỹ (careful) bật suy luận kỹ trong Chat.
  - Tên ngắn: `bridge.shortModelName(id)`. Gần đây: `bridge.recentPicks()`.
  - Logic trùng từng quy tắc với `ModelLineup.swift` (QtTest dùng chung ca kiểm).
- **Câu trả lời:**
  - Tạo lại câu mới nhất (`retry` cho phép khi đã xong).
  - Thời lượng từ task `started` / `finished` (chuỗi `durationSeconds`).
  - Ảnh: `width` / `height` / `generator` trên ảnh → dòng "Đã tạo 1 ảnh 1024×1024 · GPT Image 1 · 6,2 giây" (`imagesGenerated` / `imagesGeneratedSize`); nút "Sao chép ảnh" → `bridge.copyImage(image)`.
  - Chế độ Tạo ảnh không có key: `bridge.imageProvider(model)` rỗng → dòng `imageKeyNotice` + "Thêm khoá".
- **Lớp Hoạt động:** gom các task So sánh cùng phiên cha thành một hàng (`activityCompare`), như `HistoryViews.swift`.
- **Lượt mới sau khoảng nghỉ:** `bridge.resetNotice`, `reopenPrevious()`, `dismissResetNotice()`.

### W2 · Dịch, Từ điển, Phiên dịch, lớp Nghe

- **Board:** Translate*, Overlays-Language, Dictionary-*, Interpret*, Overlays-Interpret, Overlays-Listen.
- **Dịch:**
  - Nút Dịch tắt khi nguồn > 5 000 ký tự (`sourceTooLong`); domain cũng từ chối (`WorkbenchDomain::translateLimit`).
  - "Theo cột / Theo câu" của So sánh: `bridge.command("compareBySentence", {value})`, đọc `state.compareBySentence`.
  - Cột So sánh giữ thứ tự truyền vào (model đang dùng đứng đầu).
  - Đọc to đúng ngôn ngữ: `bridge.speechLanguage(text, fallback)`.
- **Từ điển:**
  - `related` → tab "Từ liên quan".
  - `contextSense` → "— nghĩa 01 được xếp trước".
  - `exampleRegisters` → "nghĩa 01 · đời thường".
  - Task `failed` với `errorCode: dictionaryNotFound` → trạng thái "Không tìm thấy", gợi ý lấy từ `bridge.dictionarySuggestions(output)`.
  - "Dịch cả câu" khi có ngữ cảnh.
  - Giữ giới hạn 120 / 500 (domain đã chặn ngữ cảnh > 500 khi tra).
- **Phiên dịch:**
  - Xoá phiên + Hoàn tác: `interpretation.deleteSession(id)` rồi `interpretation.restoreSession(session)` (#28); giữ bản sao `session` trước khi xoá.
  - Tổng hợp: `interpretation.summarizing` ("Đang tổng hợp…") và `interpretation.cancelSummary()` chỉ dừng phần tổng hợp, giữ chữ đã có (#37).
  - Phiên lưu `deviceID` của micro.
- **Lớp Nghe:**
  - `audio.speak(text, language, source, provider)`.
  - `audio.speakingSource` cho biết nguồn nào đang đọc; mọi nút loa so với nó.
  - `audio.preparing` → "Đang tạo giọng…".
  - Lỗi: nút "Đọc bằng giọng hệ thống" gọi lại `speak(…, "system")` với `audio.lastSource`.
  - Tốc độ: `voice.rate`; `bridge.rateSupported(provider)`.
  - Hàng lớp Nghe giữ cao 48: trạng thái đọc thay dòng phụ; Đọc lại là nút biểu tượng; không chèn thêm hàng.
- **Phiên dịch, thêm (lượt 4):**
  - Thẻ quyền micro (#16): `audio.microphonePermission()` trả `granted | denied | undetermined`; khi `denied` (hoặc lỗi `microphoneDenied`) thay trạng thái trống bằng thẻ "Quyền microphone · Chưa cấp" (`microphonePermissionHint`) với "Mở Cài đặt hệ thống" và "Kiểm tra lại" (đọc lại hàm này).
  - Lỗi lưu (#68): `interpretation.blocked`; nút "Thử lại" gọi `interpretation.reload()`.
  - Xuất / sao chép "Chỉ bản dịch" (#66): `interpretation.exportText(srt, translatedOnly)` / `exportFile(url, srt, translatedOnly)` theo công tắc Song ngữ / Chỉ bản dịch.
- **Lớp Nghe, thêm (#8):** `audio.voiceFor(language)` cho tên giọng đọc ngôn ngữ đó ("Tiếng Nhật · Kyoko"); giọng đã chọn chỉ đọc đúng ngôn ngữ của nó, ngôn ngữ khác dùng giọng mặc định. `audio.voiceList` có `{name, language}` để nhóm theo ngôn ngữ ở Cài đặt › Giọng nói.
- **Hạn chế đã biết:** trạng thái đọc từng câu riêng của Phiên dịch (#36) chưa có trên C++ (trình phát của Phiên dịch là private). Dùng `bridge.audio` cho nút loa từng câu hoặc ghi chênh lệch; không tự sửa C++.

### W3 · Trang hệ thống

- **Board:** Everywhere, Apps*, Thermal*, Shortcuts*.
- Thay "Quyền trợ năng" bằng `canReplaceSelection`.
- Ghi âm (Shell-States): `audio.recordingStarted` (giây từ 1970, 0 = không ghi) → dải "Đang ghi âm · 00:14" (`recordingElapsed`), đếm mỗi giây.
- Gỡ ứng dụng và điều khiển quạt là phạm vi chỉ macOS (README.md:195-196): trên Qt vẽ trạng thái "không hỗ trợ trên hệ điều hành này", không giả lập.

### W4 · Cài đặt

- **Board:** Settings-*, Overlays-Settings.
- **Dữ liệu:** "Dọn lịch sử" (`trimHistory`) và "Xoá toàn bộ lịch sử": `bridge.command("clearHistory")` sau hộp xác nhận ghi `bridge.clearableHistoryCount()` (`clearHistoryConfirm`). Không chạy được khi có task đang chạy hoặc Phiên dịch đang bận.
- **Máy này:** `localRuntime.processors`, `localRuntime.memoryBytes`.
- **Model local gợi ý (#47):** `workbench.resources.localModelSuggestions` (`{id, name, note, bytes}`, từ `contracts/native-workbench/local-models.json`, dùng chung với macOS).
- **Cập nhật:** công tắc tự kiểm tra = `bridge.autoCheckUpdates` (đọc / ghi). Dòng trạng thái như macOS: dung lượng gói `updates.packageSize`, "đã kiểm tra {time}" từ `updates.checkedAt` (`updateCheckedAgo`), khi tải "khoảng {n} giây nữa" từ `updates.remainingSeconds` (−1 = chưa ước được; `updateRemainingSeconds` / `updateRemainingMinutes`).
- **Lượt mới sau khoảng nghỉ:** lệnh `smartReset`.

### W5 · Cửa sổ phụ, cập nhật, cửa sổ hẹp / nhỏ nhất, mặt đặc

- **Board:** Launcher*, QuickChat, QuickTranslate, UpdateSheet*, *-Compact, Shell-Minimum, Shell-Solid.
- **Hộp cập nhật tự hiện (#43):**
  - `bridge.updatePrompt` (`{version, notes}`, rỗng = không hiện). Bridge tự kiểm tra một phút sau khi mở rồi mỗi ngày khi `autoCheckUpdates` bật.
  - "Nhắc sau 24 giờ" → `bridge.snoozeUpdate()`; đóng → `bridge.dismissUpdatePrompt()`.
  - Sau khi người dùng bấm "Kiểm tra" và kiểm tra xong → gọi `bridge.presentUpdateIfAvailable()`.
- **Launcher (#45, #32):** khi chưa gõ, `bridge.launcherHome(quickSessionID)` trả các trang Viezan `{route, title}` (theo module đang bật, Cài đặt luôn có) và `continue {id, title, fresh}` nếu phiên Quick AI còn tin nhắn. Bảng lệnh Ctrl+K: `desktopIntegration.paletteQuery(text)` trả `{kind: calculation | ask | translate | lookup, value}` cho các dòng "= …", "Hỏi AI: …", "Dịch …", "Tra …" trước danh sách lệnh (chuỗi `paletteCalc`, `paletteAsk`, `paletteTranslate`, `paletteLookup`).
- **Chat nhanh / Dịch nhanh:** backend có `retry`, `errorCode`, `providersEmpty`, `selectionUnavailable`; `DesktopPanels.qml` hiện mới chỉ hiện lỗi vùng chọn và nút Dừng (BACKEND-GAPS #49). Vùng chọn > 5 000 ký tự: submit bị từ chối, nên báo `sourceTooLong` như macOS.

Làm từng bước, mỗi bước một phiên agent mới. Xong một bước, xem báo cáo rồi mới sang bước sau.

Phím tắt: các tổ hợp ⌘ trên board đổi thành Ctrl trên Windows. Phím tắt toàn cục giữ theo `DesktopIntegration` hiện có; không tự đổi tổ hợp.

## 6. Prompt mẫu cho một bước (thay `<Wn>` và danh sách board)

```
Đọc AGENTS.md, .claude/rules/ui-ux.md, docs/design/direction.md,
docs/design/glass2/WINDOWS-HANDOFF.md (mục 4 và mục 5 của bước <Wn>) và
docs/design/glass2/HANDOFF.md (mục 2, 3, 4 và mục 5 của các màn bên dưới).
Đọc báo cáo macOS tương ứng trong docs/migration/reports/ để biết các quyết
định và chênh lệch đã chấp nhận.

Máy: Windows. Kiểm tra trước: bước trước đã có báo cáo; dựng và QtTest xanh
trước khi sửa.

Việc: bước <Wn> của Liquid Glass 2.0 trên Qt — dựng bố cục các màn bên dưới
theo board, ngang với bản macOS: cùng trạng thái, cùng chuỗi, cùng hành vi.
Bản macOS (apps/macos/Sources/ViezanNative) là tham chiếu cho logic trình bày;
không sao chép quyết định chỉ hợp với macOS. Dùng backend đã liệt kê cho bước
này trong WINDOWS-HANDOFF mục 5; không viết lại logic trong QML.

Board (đọc cả .dc.html và .png trong docs/design/glass2/boards/):
<danh sách board của bước>

File được sửa: apps/desktop-qt/qml/* và apps/desktop-qt/tests/*.
Cần đụng C++ (WorkbenchBridge, dịch vụ) hoặc file khác thì dừng và hỏi.

Luật chung:
- Lấy số đo, màu, bo góc, bóng từ resources/tokens.css (preset glass) qua
  workbench.resources.metrics / themePalettes, và từ HTML của board; không tự
  chọn giá trị khác; không đổi preset Graphite / Paper / Corporate / Midnight.
- Không đổi hành vi, dữ liệu, dịch vụ, route, phím tắt hay chuỗi đã có. Chuỗi
  mới thêm vào resources/locales/{vi,en,ja}.json rồi chạy `npm run resources`;
  giữ cả hai native.json đồng bộ (macOS dùng chung chuỗi; phần lớn chuỗi cần
  cho W1–W5 đã có sẵn).
- Giữ tên trợ năng, trạng thái disabled của toolkit, focus bàn phím, phím tắt
  và IME. Mọi thao tác thành công cần phản hồi (toast) như bản macOS.
- Kiểm: cmake build + ctest (Fusion), thêm một lần FluentWinUI3; dán tổng kết
  nguyên văn. Chạy lại test sau thay đổi cuối cùng.
- Nghiệm thu: chụp app ở 1280×800 và 820×640, sáng và tối, ở 100 % và 150 %
  DPI; đặt cạnh PNG của board. Kiểm Narrator cho các màn đã sửa. Trạng thái cần
  AI hoặc micro thật thì ghi chưa chụp, không giả lập dữ liệu. Sao lưu và trả
  lại dữ liệu preview nếu phải đổi cài đặt để chụp.
- Thêm docs/migration/reports/native-migration-report-<ngày>-glass2-win-<Wn>.md.
- Không commit. Dừng và báo cáo khi xong bước.
```

W0 dùng cùng prompt với phần "Việc" thay bằng câu sau: "nghiệm thu Đợt 7a trên Windows: dựng, QtTest, chụp shell và Trang chủ; chỉ sửa lỗi riêng của nền tảng".

## 7. Backend còn lại (ưu tiên thấp, làm sau)

Không chặn W0–W5. Vẽ trạng thái gần nhất mà backend hiện có và ghi chênh lệch vào báo cáo bước. Chi tiết và vị trí trong code: BACKEND-GAPS mục E.

| Nhóm | Mục | Ghi chú cho đợt Windows |
| --- | --- | --- |
| Âm thanh | #48 giọng có giới tính | Nhóm giọng theo ngôn ngữ (đã có `voiceList`), không ghi giới tính |
| Phiên dịch | #36 trạng thái đọc từng câu (C++) | Xem "Hạn chế đã biết" ở W2 |
| Hoãn | #13 So sánh 4 model, #17 Full Disk Access, #20 logo nhà cung cấp, #67 nghe tiếp cùng phiên, #69 tổng hợp cả 4 | — |
| Qt kém macOS | #44 tiền tệ Launcher, #19 / #33 OCR trên máy, #34 mặt đặc | #34 nên làm ở W5 (C++ nhỏ, hỏi trước) |
| Cả hai | #62 bytes khi tải model, #65 tệp trên Launcher, #11 / #14 / #71 chỉ còn phần hiển thị | — |
