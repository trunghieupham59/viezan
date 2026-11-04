# Liquid Glass 2.0 · Kết nối backend

- **Ngày:** 2026-11-03
- **Nhánh:** `develop`, làm tiếp trên Đợt 1–9 (chưa commit). Không commit.
- **Nguồn:** [BACKEND-GAPS.md](../../design/glass2/BACKEND-GAPS.md) (90 mục, cột "Quyết định" đã điền), [HANDOFF.md](../../design/glass2/HANDOFF.md) mục 5.

## Bước 1: kiểm kê

- **Cách làm:** đối chiếu toàn bộ board với Swift `ViezanDomain` và C++ `apps/desktop-qt`. Ba agent đọc song song theo nhóm màn. Các phát hiện quan trọng nhất đã được kiểm lại trực tiếp trong code trước khi ghi.
- **Kết quả:** BACKEND-GAPS.md có 90 mục, chia bốn nhóm:

  | Nhóm | Số mục | Nội dung |
  | --- | --- | --- |
  | A (1–23) | 23 | Khoảng trống đã biết, nay có vị trí chính xác |
  | B (24–49) | 26 | Qt thiếu so với macOS |
  | C (50–72) | 23 | Cả hai nền tảng chưa có |
  | D (73–90) | 18 | Board không khớp hành vi hoặc chính sách |

- **Đính chính:** `domain.js` chỉ dùng cho test. Phần chạy thật trên Qt là `WorkbenchDomain.cpp`, `WorkbenchBridge` và đoạn lọc viết ngay trong QML.

## Bước 2: quyết định

- **Làm:** #1, #2, #5, #9, #21, #22, #24, #25, #29, #42 và nhóm D (#73–#90).
- **Hoãn:** #13, #17, #20, #67, #69.
- **Để trống (không làm):** các mục còn lại.

## Đã làm

| # | Việc | Swift | C++ | Hợp đồng / tài nguyên |
| --- | --- | --- | --- | --- |
| 2 | Một prompt từ điển cho cả hai nền tảng: thêm câu yêu cầu sắc thái / ví dụ mà bản C++ thiếu; ví dụ dùng `→` | `DictionaryEntry.prompt` / `userMessage` đọc từ `NativeResources.dictionaryPrompt`; `CloudProvider` dùng chung | `LocalProvider.cpp` đọc `dictionaryPrompt` trong `native.json`; bỏ chuỗi cứng | `contracts/native-workbench/dictionary-prompt.json` mới; `generate-resources.mjs` ghép vào hai `native.json` |
| 1 | Trường tuỳ chọn `related {derived, synonyms, antonyms}` trong mục từ (tối đa 6 từ mỗi nhóm) | `DictionaryEntry.Related` giải mã khoan dung (khối lỗi thì bỏ qua, mục từ vẫn hiện); view có tab "Từ liên quan · n", bấm từ là tra ngay và giữ ngữ cảnh | Trình kiểm hợp lệ chấp nhận mục từ có `related` | README hợp đồng |
| 21 | Ngữ cảnh không đổi thì không huỷ việc, không xoá mục từ | `setDictionaryContext` có `guard` so sánh | Lệnh `dictionaryContext` có điều kiện so sánh | — |
| 5 | Task có `started` / `finished` tuỳ chọn; `duration` | `WorkTask.started`, `finished`, `duration` (lúc tra, thử lại, dừng, kết thúc); view: chân mục từ, cột So sánh, Dịch nhanh hiện "· 1,4 giây" | `submit` / `retry` ghi `started`; rời trạng thái `running` thì ghi `finished` (đồng hồ lấy từ `_updated` của bridge) | Chuỗi `durationSeconds` |
| 9 | Tốc độ đọc trên Qt; danh sách nhà cung cấp hỗ trợ tốc độ chuyển vào domain | `VoicePreferences.rateSupported`; view dùng hàm này | Lệnh `voice` giữ và kiểm `rate` (0,5–2; giữ nguyên khi đổi nhà cung cấp mà không gửi `rate`); `NativeAudio::configureVoice(…, rate)`, `rateSupported`; giọng hệ thống `setRate`; Edge 120 % × rate; OpenAI `speed` | — |
| 22 | Đọc to đúng ngôn ngữ | View dùng `TextLanguage.detect` cho câu trả lời AI Chat, nguồn "Tự động" ở Dịch và nguyên bản Phiên dịch; không nhận ra thì dùng ngôn ngữ giao diện | `bridge.speechLanguage(text, fallback)` | — |
| 24 | Tạo lại câu trả lời chat mới nhất đã xong | (đã có) | Lệnh `retry` cho phép khi task đã xong và là tin nhắn mới nhất | — |
| 25 | Lượt mới sau khoảng nghỉ trên Qt | (đã có) | Reducer: `navigate` ghi lúc rời trang + `applySmartReset`; lệnh `smartReset`, `leave`, `launch`, `reopenPrevious`; bridge: thuộc tính `resetNotice` (không bao giờ lưu xuống file), `reopenPrevious()`, `dismissResetNotice()`; ghi lúc rời app khi thoát | — |
| 29 | Lịch sử dùng chung, không còn tích tụ phiên rỗng | (đã có) | `new` dọn phiên rỗng, chưa đặt tên, không chạy của cùng tính năng; `bridge.history(query, archived, features)`: lọc nhiều tính năng, bỏ dấu và đ, bỏ phiên rỗng, sắp theo `updated` | — |
| 42 | Không tắt được module trang cuối cùng | (đã có) | Lệnh `module` từ chối tắt trang cuối | — |
| 75 | "n lượt" = số câu hỏi | `HistoryViews` đếm tin nhắn của người dùng | (QML làm ở đợt Windows) | Board History |
| 82 | Groq nằm nhóm "Tìm kiếm và giọng nói" | `ProviderSettings.cloudGroup` | — | Board Settings-Models |
| 85 | Câu "lưu sau khi kết thúc phiên" sai với hành vi | Chuỗi `transcriptSavedHint` (VI / EN / JA) → "Lưu trên thiết bị sau mỗi câu." | Dùng chung chuỗi | Board Interpret / Interpret-States / Interpret-Summary |

Sửa board cho khớp code (nhóm D, canvas bản 34):

- **#73** Settings-Local: tên model gợi ý theo code (Qwen3 4B, Qwen2.5 7B, Gemma3 4B).
- **#74** Overlays: toast dùng giới hạn 20 MB và câu `attachFailed`.
- **#76** Overlays-Language: "đổi là bản dịch hiện tại được dịch lại".
- **#77** Apps / Apps-States: mục chỉ khớp tên hãng bị khoá; plist không được chọn sẵn; tổng thành "2 mục · 398 MB".
- **#78** Thermal: mô tả "Yên tĩnh" theo đúng quy tắc.
- **#79** Thermal-States: helper là dịch vụ chạy nền, có thể cần cho phép trong Mục đăng nhập.
- **#80** Shortcuts: tổ hợp mặc định thật (⌃⌥Space / ⌥T / ⌥Space).
- **#81** Shortcuts-Recorder: thông báo trùng dùng câu chung.
- **#82** Settings-Models: ElevenLabs bỏ "· 6 model"; thêm Jina; Groq chuyển nhóm.
- **#83** Overlays-Settings: "token đầu" thay cho "nạp".
- **#84** UpdateSheet-States: bỏ câu "Viezan sẽ thoát".
- **#86** Interpret: "Tổng hợp nội dung" vô hiệu khi đang nghe.
- **#87** Interpret-Summary: tab trống có nút "Tạo", không tự gọi AI.
- **#88** Ghi vào WINDOWS-HANDOFF: Windows / Linux không có "Quyền trợ năng".
- **#89** Settings-Data: "dọn một lần, giữ N mục mới nhất".
- **#90** Overlays-Listen: "giọng đã chọn".

Chuỗi mới (VI / EN / JA): `durationSeconds`, `relatedDerived`, `relatedSynonyms`, `relatedAntonyms`, `relatedHint`. Chuỗi sửa: `transcriptSavedHint`.

Tài liệu đã cập nhật:

- `contracts/native-workbench/README.md`: mục "Liquid Glass 2.0 backend".
- `WINDOWS-HANDOFF.md`: các phần backend Qt đã có sẵn cho QML.
- `BACKEND-GAPS.md`: cột Quyết định.

## Dữ liệu cũ

Mọi trường mới đều tuỳ chọn:

- **Swift:** task thiếu `started` / `finished` vẫn giải mã được (có test). Mục từ không có `related`, hoặc có `related` sai kiểu, vẫn hiện (có test).
- **C++:** state thiếu `voice.rate`, `smartReset`, `featureLeft` vẫn qua `validate` (có test). `featureLeft` và `smartReset` được kiểm kiểu khi có mặt.
- **`domain.js`:** không đổi (chỉ là tham chiếu cho test); 11 test vẫn xanh.

## Kiểm chứng (chạy sau thay đổi cuối cùng)

```
$ npm run check:resources
Native resources verified: 3 locales, 78 metrics.
$ npm run check:docs
Native documentation references version 2.4.2; runtime acceptance is separate.
$ node --test scripts/native/__tests__/domain.test.mjs
ℹ tests 11 · pass 11 · fail 0
$ python3 -m unittest discover -s scripts/native/__tests__ -p 'test_*.py'
OK
$ swift test --package-path apps/macos
✔ Test run with 49 tests in 7 suites passed after 19.163 seconds.
✔ Test run with 66 tests in 0 suites passed after 0.076 seconds.
$ ctest (Qt 6.12 Homebrew trên macOS, Fusion + offscreen)
100% tests passed out of 1
ViezanQtTests — Totals: 145 passed, 0 failed, 0 skipped
```

Test mới:

- **Swift (+6):**
  - ngữ cảnh không đổi giữ mục từ;
  - thời điểm và thời lượng task;
  - task cũ không có thời điểm;
  - `related` hợp lệ / thiếu / sai kiểu;
  - prompt đọc từ hợp đồng chung;
  - `rateSupported`.
- **Qt (+3):**
  - `glassBackendReducerRules`: ngữ cảnh không đổi, mục từ có `related` qua kiểm hợp lệ, `started` / `finished`, tạo lại câu mới nhất (câu cũ hơn thì không), khoá module cuối, `new` dọn phiên rỗng, tốc độ đọc (giữ, kiểm, dữ liệu cũ), `rateSupported`;
  - `glassBackendSmartReset`: quay lại trong vòng 2 giờ thì giữ lượt; quá 2 giờ thì mở lượt mới kèm thông báo; mở lại lượt trước; tắt bằng cài đặt;
  - `glassBackendHistoryAndSpeechLanguage`: lọc, bỏ dấu, bỏ phiên rỗng; nhận dạng ngôn ngữ và ngôn ngữ dự phòng.

Chạy thật: nạp lại app dev macOS với `native.json` mới, app khởi động bình thường (`glass2-backend/app-light-1280-launch.png`). Thiếu khoá `dictionaryPrompt` thì app sẽ dừng ngay lúc mở, nên ảnh này xác nhận tài nguyên đúng.

## Chưa làm / chưa kiểm

- **Hoãn và để trống:** các mục ghi "Hoãn" hoặc để trống trong BACKEND-GAPS: không làm.
- **Qt QML:** chưa nối `resetNotice`, `history()`, `speechLanguage()`, thời lượng, `related` vào giao diện. Đây là việc của đợt Windows (đã ghi trong WINDOWS-HANDOFF).
- **Chưa gọi AI thật:**
  - chưa kiểm model có trả `related` theo prompt mới không;
  - chưa kiểm hiển thị tab "Từ liên quan" với dữ liệu thật;
  - chưa kiểm thời lượng hiện sau một lượt tra thật.
- **Âm thanh:** chưa nghe thử tốc độ đọc trên Qt (giọng hệ thống, Edge, OpenAI); chưa kiểm cách quy đổi `setRate` của QTextToSpeech trên Windows.
- **Windows / Linux:** chưa chạy (cần máy).

---

# Lượt 2 (2026-11-03): các mục chọn thêm

- **Nguồn quyết định:** anh/chị chọn bốn nhóm trong phiên: "Quy tắc nhỏ", "Lớp Nghe", "Từ điển", "Ảnh", "Lịch sử", "Chỉ nối view". Cột "Quyết định" trong BACKEND-GAPS đã ghi **Làm** cho 24 mục.
- **Không commit.**

## Đã làm

| # | Việc | Swift | C++ (tới `WorkbenchBridge`) |
| --- | --- | --- | --- |
| 3 | Nghĩa hợp ngữ cảnh xếp trước | Trường tuỳ chọn `contextSense`, đọc khoan dung; dòng "Theo ngữ cảnh: “…” — nghĩa 01 được xếp trước." | Prompt dùng chung; validator bỏ qua trường |
| 4 | "Không tìm thấy" + gợi ý | `DictionaryEntry.notFound`; task `failed` với `dictionaryNotFound`; view: headword mờ, chip ấm, gợi ý (dòng đầu là lens, ↩), "Dịch “…” như một cụm", "Hỏi AI về từ này" (chỉ mở phiên, không tự gửi) | `dictionarySuggestions()`; cùng `errorCode`; `bridge.dictionarySuggestions` |
| 70 | Ví dụ ghi thuộc nghĩa nào + văn phong | `exampleRegisters` theo từng nghĩa, đọc khoan dung; tab Ví dụ ghi "nghĩa 01 · đời thường" | Prompt dùng chung; validator bỏ qua trường |
| 72 | "Dịch cả câu" kèm ngữ cảnh | Có ngữ cảnh thì nút là "Dịch cả câu" và gửi câu ngữ cảnh; không có thì "Dịch" gửi headword | (QML ở đợt Windows) |
| 6 | Nguồn đang đọc | `NativeAudio.speakingSource`; bỏ `ListenState` trong view | `speakingSource` Q_PROPERTY |
| 7 | "Đang tạo giọng…" | `preparing` tới khi audio phát; hàng lớp Nghe hiện câu này | `preparing` Q_PROPERTY |
| 23 | Đọc bằng giọng hệ thống khi giọng đám mây lỗi | `speak(…, source:, provider:)`, `lastSource`; nút trong khối lỗi, không đổi cài đặt | `speak(text, language, source, provider)`, `lastSource` |
| 30 | Một quy tắc `updated` | `edit` dùng `clock()` (hành vi như cũ) | Mọi lệnh sửa phiên đều cập nhật `updated` (lưu trữ, yêu thích, model, ảnh, tuỳ chọn, thử lại, so sánh); lệnh không đổi gì thì không |
| 31 | Tiêu đề phiên chỉ có ảnh | (đã có) | `derivedTitle` giống Swift (tên ảnh, tên tệp từ đường dẫn) |
| 38 | Nhớ micro theo phiên | (đã có) | Phiên lưu `deviceID` |
| 39 | Ngữ cảnh tối đa 500 khi tra | (đã có) | `submit` từ chối ngữ cảnh > 500 |
| 40 | Nhớ "Theo cột / Theo câu" | (đã có) | Lệnh `compareBySentence`, kiểm kiểu trong `validate` |
| 41 | Thứ tự cột So sánh | Giữ thứ tự truyền vào (bỏ trùng), không sắp xếp | (đã giữ thứ tự) |
| 46 | RAM | (đã có) | `LocalRuntime.memoryBytes` (Windows / macOS / Linux) |
| 51 | Sao chép ảnh | Nút "Sao chép ảnh" (NSPasteboard) | `bridge.copyImage(image)` |
| 52 | Kích thước ảnh | `ImageAttachment.width/height` khi lưu ảnh | `width` / `height` trong `Attachments::ingest` |
| 53 | Tên model tạo ảnh | `ImageAttachment.generator`; dòng "Đã tạo 1 ảnh 1024×1024 · GPT Image 1 · 6,2 giây" | `generator` qua `ImageGeneration::decode` |
| 56 | Thời điểm lưu trữ | `Session.archivedAt`; kho lưu trữ nhóm "Lưu trữ hôm nay / hôm qua / tuần này / trước đó" và hàng ghi "lưu trữ …" | `archivedAt` (lệnh `archive`, gộp trùng từ điển); `history(archived)` sắp theo nó |
| 57 | Đổi tên để trống | Dùng lại tiêu đề từ câu hỏi đầu (`Session.firstTitle`) | Cùng quy tắc trong lệnh `rename` |
| 64 | Xoá toàn bộ lịch sử | `clearHistory()` + `clearableHistoryCount`; hàng mới trong Cài đặt › Dữ liệu, hỏi xác nhận kèm số mục; xoá cả Phiên dịch | Lệnh `clearHistory`; bridge xoá Phiên dịch sau khi đã lưu workspace; `clearableHistoryCount()` |
| 50 | Trang chủ: "2 người nói · 38 câu" | View | (QML) |
| 54 | Dòng nhắc thiếu key tạo ảnh | Dòng trên composer khi ở chế độ Tạo ảnh mà không có key OpenAI / Gemini, kèm "Thêm khoá" | (đã có `imageProvider`) |
| 55 | Hoạt động gom So sánh | Một hàng "So sánh 3 model · 2/3 xong"; Mở / Dừng cả nhóm | (QML) |
| 58 | Phiên Dịch "Tự động" ghi ngôn ngữ nhận dạng | Hàng và xem trước trong Lịch sử dùng `TextLanguage.detect` | (QML) |

## Lỗi phát hiện và sửa luôn

- **Nhập sao lưu có ảnh mới sẽ hỏng (cả hai nền tảng).** `NativeBackup.preview` so ảnh trong phiên với bản ghi tệp bằng `==`, trong khi bản ghi chỉ có id / tên / mime. Thêm `width` / `height` / `generator` thì phép so trượt và bản sao lưu bị từ chối. Đã đổi sang so theo id, tên và mime (`sameFile` trong Swift; `known` trong C++). Có test cho cả hai bên.
- **Test có thể chạm dữ liệu thật.** Trong test, `Interpretation()` đọc và ghi `~/Library/Application Support/ViezanNativePreview/interpretation.json`; bước dọn ảnh di chuyển ảnh thật. Đã thêm `Interpretation(file:)`, tham số `interpretation` của `WorkbenchStore` và `store.quarantine` để test dùng thư mục tạm. App vẫn dùng mặc định như cũ.
- **Đọc giọng đám mây đã dừng mà vẫn có thể đọc khoá API.** Vòng tạo giọng giờ kiểm huỷ trước mỗi đoạn, nên nếu dừng trước khi task chạy thì không đọc khoá, không gọi nhà cung cấp.

## Lệch so với board (cố ý)

- **#64:** board ghi cả hai nút là "Dọn lịch sử". Tôi đặt tên riêng cho thao tác xoá toàn bộ ("Xoá toàn bộ lịch sử", nút "Xoá toàn bộ"), vì luật copy yêu cầu mỗi khái niệm một tên. Hộp xác nhận ghi số mục và nhắc xuất bản sao lưu.
- **#56:** board có nhóm "Lưu trữ tháng trước" và "Lưu trữ 5 ngày trước". Bản dựng dùng bốn nhóm của `HistoryBucket` (hôm nay, hôm qua, tuần này, trước đó). Thời gian cụ thể nằm trên từng hàng ("lưu trữ 5 ngày trước").
- **#70:** văn phong là mảng `exampleRegisters` đi song song với `examples` của từng nghĩa, không đổi `examples` thành object, để dữ liệu cũ và trình kiểm hợp lệ C++ vẫn chạy như trước.

## Dữ liệu cũ

- Mọi trường mới đều tuỳ chọn. `recovery-fixture.json` cố ý giữ dạng cũ; Swift, Qt và Node vẫn nạp được.
- Có test riêng cho: phiên không có `archivedAt`; mục từ không có `contextSense` / `exampleRegisters`, hoặc có nhưng sai kiểu; ảnh không có kích thước / `generator`; bản sao lưu có ảnh mới; state không có `compareBySentence`; `archivedAt` sai kiểu thì `validate` từ chối.

## Kiểm chứng (sau thay đổi cuối)

```
$ npm run check:resources
Native resources verified: 3 locales, 78 metrics.
$ npm run check:docs
Native documentation references version 2.4.2; runtime acceptance is separate.
$ node --test scripts/native/__tests__/domain.test.mjs
ℹ tests 11 · pass 11 · fail 0
$ python3 -m unittest discover -s scripts/native/__tests__ -p 'test_*.py'
OK
$ swift test --package-path apps/macos
✔ Test run with 49 tests in 7 suites passed
✔ Test run with 75 tests in 0 suites passed
$ ctest --test-dir .native-build/qt-glass2 (Qt 6.12 Homebrew trên macOS, offscreen + Fusion như CI)
100% tests passed out of 1 · ViezanQtTests Totals: 147 passed, 0 failed
```

- **Swift (+8):** `emptiedNameFallsBackToTheFirstQuestion`, `archivingRecordsWhenAndTheArchiveSortsByIt`, `comparisonKeepsTheCallersColumnOrder`, `clearHistoryRemovesEveryEntryAndKeepsOneEmptySessionPerFeature`, `dictionaryEntriesCarryOptionalContextSenseAndRegisters`, `dictionaryNotFoundIsItsOwnOutcomeWithSuggestions`, `imageDetailsAreOptionalAndBackupsMatchOnTheFile`, `speakingRemembersItsSourceAndAOneOffProvider`.
- **Qt (+2):**
  - `glassBackendSecondPassReducer`: #4, #30, #31, #39, #40, #56, #57, #64;
  - `glassBackendSecondPassServices`: sao lưu có ảnh mới, kho lưu trữ sắp theo `archivedAt`, RAM, nhà cung cấp lạ bị từ chối.
- **Chạy `ViezanQtTests` không đặt Fusion:** 69 test lỗi vì cảnh báo của style macOS. Lỗi này có từ trước, không do lượt này; ctest và CI luôn đặt Fusion (`CMakeLists.txt:36`).

## Chưa kiểm

- **App macOS chưa chạy lại.** Phải xem tận mắt: dòng ngữ cảnh, tab Ví dụ, "Không tìm thấy", nút Sao chép ảnh và dòng chú thích dưới ảnh, dòng nhắc key ảnh, hàng So sánh trong Hoạt động, nhóm Lưu trữ, Trang chủ, Xoá toàn bộ lịch sử, lớp Nghe ở bước "Đang tạo giọng…" và nút "Đọc bằng giọng hệ thống". Cửa sổ 1200 / 820, sáng / tối, VoiceOver.
- **Chưa gọi AI thật:** chưa biết model có trả `contextSense`, `exampleRegisters` và `notFound` theo prompt mới không.
- **Qt chưa có test cho:**
  - `preparing` / `speakingSource` khi đọc thật (cần khoá và mạng);
  - `deviceID` và `clearAll` của Phiên dịch (ghi vào file thật của Interpretation);
  - `width` / `height` trong `Attachments::ingest` và `generator` trong `ImageGeneration::decode` (ghi vào thư mục ảnh thật);
  - `copyImage`.
- **QML chưa nối:** để cho đợt Windows (đã liệt kê trong WINDOWS-HANDOFF).
- **Windows / Linux chưa chạy:** đặc biệt `memoryBytes` trên Windows (`GlobalMemoryStatusEx`).

---

# Lượt 3 (2026-11-03): đưa Qt ngang macOS + giới hạn Dịch

- **Phạm vi:** anh/chị chọn nhóm đề xuất (#26, #27, #28, #37, #43) và #18. Các nhóm ưu tiên thấp để sau (WINDOWS-HANDOFF mục 7). Cột "Quyết định" đã ghi "Làm" cho 6 mục này.
- **Không commit.**

## Đã làm

| # | Việc | Swift | C++ (tới `WorkbenchBridge`) |
| --- | --- | --- | --- |
| 18 | Giới hạn nguồn Dịch 5 000 ký tự | `WorkbenchStore.translateLimit`; `submit` và `compare` từ chối; nút Dịch tắt kèm gợi ý `sourceTooLong`; Dịch nhanh báo `sourceTooLong` thay cho "lỗi nhà cung cấp" | `WorkbenchDomain::translateLimit`; `submit` và `compare` từ chối |
| 26 | Chọn model theo mục đích, gần đây, tìm / nhập ID | (đã có) | `ModelLineup.cpp` port từng quy tắc của Swift; `bridge.modelSections`, `modelTiers`, `applyModelTier` (Kỹ bật suy luận kỹ), `recentPicks`, `shortModelName` |
| 27 | Xoá phiên ngay + Hoàn tác | (đã có) | Lệnh `removeSession` / `restoreSession`; `bridge.removeSession(id)` trả `{session, index}`; huỷ ghi âm của phiên đó |
| 28 | Phiên dịch: xoá + Hoàn tác | (đã có) | `Interpretation::restoreSession` (đặt lại đúng thứ tự thời gian, kiểm bằng `validateArchive`) |
| 37 | Tổng hợp: trạng thái + Huỷ riêng | `cancelSummary()` có token riêng: task cũ đã huỷ không đè lên lượt mới; nút Huỷ trong thẻ tổng hợp dùng nó (giữ chữ đã có, không dừng thứ khác) | `summarizing` Q_PROPERTY; `cancelSummary()` huỷ đúng task tổng hợp |
| 43 | Cập nhật: hộp tự hiện, nhắc sau 24 giờ, kiểm tra nền, công tắc | (đã có) | `updates` trong state (kiểm kiểu); lệnh `autoCheckUpdates`, `snoozeUpdate`; bridge: `updatePrompt`, `autoCheckUpdates` (đọc / ghi), `snoozeUpdate()`, `dismissUpdatePrompt()`, `presentUpdateIfAvailable()`; kiểm tra nền sau 1 phút rồi mỗi ngày (chỉ khi bật cung cấp tự động); dừng hẹn giờ khi thoát |

Thêm: `bridge.rateSupported(provider)` để QML biết khi nào làm mờ seg tốc độ.

## Kiểm chứng (sau thay đổi cuối)

```
$ swift test --package-path apps/macos
✔ Test run with 49 tests in 7 suites passed
✔ Test run with 77 tests in 0 suites passed
$ ctest --test-dir .native-build/qt-glass2 (offscreen + Fusion)
100% tests passed out of 1 · ViezanQtTests Totals: 150 passed, 0 failed
$ npm run check:resources → verified · domain.test.mjs → 11/11
```

- **Swift (+2):** `translateRefusesASourceOverTheLimit`, `cancellingNoSummaryIsANoOp`.
- **Qt (+3):**
  - `parityModelLineupMatchesSwift`: mọi ca của `ModelLineupTests.swift`, kết quả giống hệt;
  - `parityReducerAndBridge`: #18, #27 (cả qua bridge), #43 (lệnh, kiểm kiểu, bridge), `rateSupported`;
  - `parityInterpretationRestoreAndCancelSummary`: chạy với `QStandardPaths` test mode, không chạm file thật.

## Chưa kiểm

- **Huỷ tổng hợp khi đang chạy thật** (cả hai bên): cần gọi AI. Test chỉ phủ trường hợp không có tổng hợp nào đang chạy.
- **Hộp cập nhật tự hiện trên Qt:** chưa chạy với bản phát hành thật (cần mạng và một phiên bản mới hơn).
- **`removeSession` trên Qt:** đúng như Swift, chỉ khôi phục phiên, không khôi phục task hay các phiên so sánh của nó.
- **App macOS chưa chạy lại** cho #18 (nút Dịch tắt, gợi ý) và nút Huỷ tổng hợp.
- **Windows:** chưa chạy; xem WINDOWS-HANDOFF mục 3.

---

# Lượt 4 (2026-11-03): các mục ưu tiên thấp còn lại

- **Phạm vi:** anh/chị yêu cầu "làm tiếp các mục còn lại" (trừ Hoãn). 14 mục ghi "Làm": #8, #10, #12, #15, #16, #32, #45, #47, #59, #60, #61, #63, #66, #68.
- **Không commit.**

## Đã làm

| # | Việc | Swift | C++ (tới bridge) |
| --- | --- | --- | --- |
| 8 | Giọng theo ngôn ngữ | `NativeAudio.voice(for:)`: giọng đã chọn chỉ đọc đúng ngôn ngữ của nó, ngôn ngữ khác dùng giọng mặc định; lớp Nghe ghi "Tiếng Nhật · Kyoko" | `voiceList` `{name, language}`, `voiceFor(language)`, cùng quy tắc khi đọc |
| 10 | "Đang ghi âm · 00:14" | `recordingStarted`; dải ghi âm đếm mỗi giây | `recordingStarted` Q_PROPERTY |
| 12 | Dung lượng gói | `NativeRelease.size` từ danh sách phát hành; dòng trạng thái ghi dung lượng | `packageSize` |
| 63 | "đã kiểm tra …", thời gian còn lại | `checkedAt`, `remainingSeconds` (`remaining(elapsed:fraction:)`) | `checkedAt`, `remainingSeconds`, `NativeUpdates::remaining` |
| 16 | Thẻ quyền micro | `MicrophonePermission.status`; thẻ trong cột bản ghi với "Mở Cài đặt hệ thống" + "Kiểm tra lại"; Cài đặt › Hệ thống dùng chung hàm | `audio.microphonePermission()` |
| 66 | Xuất / sao chép "Chỉ bản dịch" | `export(srt:translatedOnly:)`; Sao chép, TXT, SRT theo công tắc Song ngữ / Chỉ bản dịch (trước đây bỏ qua công tắc) | `exportText` / `exportFile` thêm `translatedOnly` |
| 68 | Lỗi lưu + "Thử lại" | `Interpretation.reload()`: đọc vào biến tạm, chỉ thay khi đọc thành công; nút "Thử lại" trong dải lỗi | `reload()`, `blocked` Q_PROPERTY; cùng cách nạp an toàn |
| 32 | Bảng lệnh: "= …", "Hỏi AI", `t` / `d` | `PaletteQuery` chuyển từ view vào domain | `LauncherTools::paletteQuery`, `desktopIntegration.paletteQuery` |
| 45 | Launcher khi chưa gõ | `LauncherHome` (trang Viezan, quy tắc tiếp tục Quick AI 30 phút) trong domain; view dùng nó | `bridge.launcherHome(quickSessionID)` |
| 47 | Model local gợi ý dùng chung | Đọc từ `NativeResources.localModelSuggestions` | `workbench.resources.localModelSuggestions` |
| 15 | Thanh tiến độ hiệu chuẩn (chỉ macOS) | `calibrationElapsed/Total/Progress`, quạt i/n; thanh tiến độ + "Quạt 1/2" | — |
| 59 | "Nhận diện lúc …", "Quên kết quả" (chỉ macOS) | `calibratedAt` (lưu kèm, tuỳ chọn), `forgetCalibration()` | — |
| 60 | Nhật ký Ứng dụng: giờ, dung lượng (chỉ macOS) | `Item.bytes`, `movedBytes`; hàng nhật ký ghi thời gian và dung lượng | — |
| 61 | Nhãn "dữ liệu cá nhân, giữ mặc định" (chỉ macOS) | `ApplicationDataItem.note = "personalData"` cho mục được phép nhưng không chọn sẵn | — |

Chuỗi mới (VI / EN / JA): `recordingElapsed`, `microphonePermissionHint`, `updateRemainingSeconds`, `updateRemainingMinutes`, `updateCheckedAgo`, `fanCalibrationFan`, `fanCalibratedAt`, `fanCalibrated`, `fanForgetCalibration`, `appNote_personalData`.

Hợp đồng mới: `contracts/native-workbench/local-models.json`.

## Kiểm chứng (sau thay đổi cuối)

```
$ swift test --package-path apps/macos
✔ Test run with 49 tests in 7 suites passed
✔ Test run with 83 tests in 0 suites passed
$ ctest (offscreen + Fusion) → 100% · ViezanQtTests Totals: 152 passed, 0 failed
$ npm run check:resources → verified · check:docs → OK · domain.test.mjs 11/11 · Python OK
```

- **Swift (+6):**
  - `paletteQueriesReadSumsPrefixesAndQuestions`;
  - `launcherHomeOffersEnabledPagesAndAFreshQuickChat`;
  - `localModelSuggestionsComeFromTheSharedContract`;
  - `downloadEstimatesWaitForAStableRate` (cả thời lượng hiệu chuẩn);
  - `voicesFollowTheLanguageTheyRead`;
  - `interpretationExportsTranslationOnlyAndReloadsAfterAStorageFailure`.
- **Qt (+2):**
  - `remainingGapsServices`: #32, #63, #10, #16, #8, #45, #47;
  - `remainingGapsInterpretation`: #68, #66, chạy với `QStandardPaths` test mode.

## Chưa kiểm

- **Chưa có test tự động** cho mấy phần mà test sẽ phải đụng dữ liệu thật hoặc phần cứng:
  - `forgetCalibration` và `calibratedAt`: ghi `fan-profiles.json` thật;
  - nhãn `personalData`: quét `~/Library` thật;
  - đồng hồ ghi âm: cần micro.
  - Logic các phần này ngắn và đã build; cần anh/chị xem trên app.
- **App macOS chưa chạy lại** cho mọi màn của lượt này:
  - thẻ quyền micro, Thử lại khi lỗi lưu;
  - dòng cập nhật (dung lượng, đã kiểm tra, thời gian còn lại);
  - Nhiệt độ (thanh tiến độ, Quên kết quả), Ứng dụng (nhãn, nhật ký);
  - lớp Nghe ghi tên giọng.
- **Windows:** `voiceFor` dùng `QTextToSpeech::findVoices` và `microphonePermission` dùng `QMicrophonePermission`, chưa chạy trên Windows.
