# Sprint 11 · Qt/QML · Giới hạn nhập và test domain

Ngày 24-11-2026, nhánh `develop`. Dịch, Từ điển và Quick AI dùng chung bộ đếm grapheme. Trong 17 hàm còn thiếu hoặc kiểm một phần ở vòng 12, đã port đủ 8 hàm trong phạm vi. Năm hàm thuộc tích hợp desktop hoặc đính kèm, bốn hàm thuộc điều khiển hệ thống riêng của macOS. [Bảng gốc của vòng 12](native-migration-report-20261124-qt-parity-12.md)

## Thay đổi theo file

Các file dưới đây nằm trong `apps/desktop-qt/`.

| File | Thay đổi và hành vi đã kiểm |
| --- | --- |
| `WorkbenchDomain.h/.cpp` | Đếm bằng `QTextBoundaryFinder::Grapheme` khi gửi, so sánh và thử lại. Đọc các trường tùy chọn của mục từ và sửa tiêu đề MacRoman khi nạp snapshot hoặc backup. |
| `WorkbenchBridge.h/.cpp`, `ProviderDiscovery.h` | Nối bộ đếm, validator ngữ cảnh và mục từ với QML. Snapshot phân biệt khóa STT với khóa Chat. |
| `qml/Main.qml`, `qml/ComparisonPane.qml`, `qml/DictionaryResult.qml` | Nhãn đếm và nút Dịch, So sánh, Tra cứu dùng số grapheme. Ẩn tab Từ liên quan khi không có từ hợp lệ. |
| `qml/DesktopPanels.qml`, `qml/Launcher.qml` | Chặn gửi câu Quick AI quá dài, hiện số đếm và giữ nguyên câu chuyển từ Launcher. Dịch nhanh dùng cùng bộ đếm với Dịch chính. |
| `LanguageSegments.h` | Điểm cắt giữa các request nằm ở biên grapheme, kể cả khi một cụm dài hơn kích thước đoạn. |
| `LocalRuntime.h/.cpp`, `LocalProvider.h/.cpp` | Tiêm mạng giả để kiểm probe và phân loại lỗi kết nối thực tế của adapter. |
| `NativeAudio.h/.cpp` | Phân loại lỗi STT, chọn giọng theo ngôn ngữ và gắn tín hiệu kết thúc với đúng lượt đọc. |
| `CredentialStore.cpp`, `tests/WorkbenchBridgeTests.cpp` | Kho khóa trong bộ nhớ dành riêng cho QtTest. Fixture kiểm qua reducer, backup, adapter và các ô nhập QML. |

## Các lệch hành vi

- Dịch nhận 5.000 lần `e` + U+0301 và từ chối 5.001 lần ở cả gửi đơn và so sánh. Bộ đếm QML khớp domain. Test kiểm emoji gia đình ZWJ và cặp surrogate. Từ điển nhận đủ 120 grapheme ở từ tra và 500 ở ngữ cảnh. Quick AI nhận 3.000 sau khi bỏ khoảng trắng hai đầu, giữ nháp khi vượt ngưỡng. Launcher từng cắt câu hỏi ở 500 đơn vị UTF-16.
- Tiêu đề lỗi phục hồi thành “Giải thích ngắn gọn”, giữ nguyên bản nháp, tiêu đề UTF-8 đúng và “√2 ≈ 1,41”. Mục từ vẫn đọc được khi `related` hoặc `exampleRegisters` sai kiểu, hay `contextSense` vượt số nghĩa.
- Bốn ca đỏ trước sửa gồm LM Studio không tới được và llama.cpp timeout (nay trả `providerOffline`), cloud timeout (`providerError`) và STT mất mạng (`providerNetworkError`). Test STT kiểm thêm thiếu khóa và phản hồi trên 1 MiB.

## Bảng đối chiếu cập nhật

| Hàm Swift trong vòng 12 | Trạng thái và bằng chứng Qt |
| --- | --- |
| `importedTitlesReadThroughMacRomanAreRepaired` | Đã port · `importedTitlesRoundTripAcrossSnapshotAndBackup` |
| `systemSpeechFinishEndsReading` | Đã port · `systemSpeechFinishBelongsToItsUtterance` |
| `localRuntimeReportsCheckedOnlyAfterAProbe` | Đủ · `localRuntimeChecksCompletedProbes` |
| `unreachableLocalRuntimeFailsAsOfflineNotGeneric` | Đủ · `providerTransportFailures`, 5 hàng dữ liệu |
| `speechRecognitionDefaultsToAnyKeyedProvider` | Đủ · `speechReadinessAndTranscriptionFailures`, `speechRecognitionDefaultsToAutoInEveryEntryPoint` |
| `dictionaryEntriesCarryOptionalRelatedWords` | Đủ · `dictionaryOptionalAnnotations`, `glassW2Dictionary` |
| `dictionaryEntriesCarryOptionalContextSenseAndRegisters` | Đủ · `dictionaryOptionalAnnotations`, `dictionaryRequestUsesSharedPrompt` |
| `voicesFollowTheLanguageTheyRead` | Đủ · `voicesFollowTheLanguageTheyRead`, `windowsMicrophonePermissionAndCaptureModes` |
| `selectionReplacementUsesUTF16AndPreservesSurroundingText`, `selectionReplacementRejectsAcceptedButUnchangedWrites`, `selectionReplacementDoesNotClaimAnUnchangedTranslationWasEdited` | 3 ca thiếu · hoãn theo phân công tích hợp desktop |
| `quickTranslatePairRoutesTextAlreadyInThePrimaryLanguage` | 1 ca một phần · hoãn phần nhận diện tiếng Anh của Dịch mọi nơi |
| `pastedImageBytesIngestLikeAFileAndRejectNonImages` | 1 ca thiếu · hoãn theo phân công đính kèm/OCR |
| `keepAwakeDefaultsToOff`, `keepAwakeCanBeEnabledTwiceThenDisabled`, `shutdownTurnsOffKeepAwake`, `outputMutedReadsConsistently` | 4 ca riêng macOS theo phạm vi Launcher hiện hành. [Đặc tả Launcher](../../design/screens/launcher.md) |

Trên cùng 110 dòng của vòng 12, hiện có 96 hàm đủ QtTest, 4 thiếu, 1 một phần và 9 riêng macOS.

## Cần Tech Lead xử lý

- Phối hợp luồng đính kèm và tích hợp desktop để chốt bốn ca thiếu và một ca một phần trong bảng. Với “The meeting starts at nine”, Swift nhận ra `en`, còn test Qt nhận chuỗi rỗng và dùng ngôn ngữ dự phòng.
- Cập nhật điểm khác biệt Quick AI trong tài liệu chung khi gộp luồng. Sprint đã dùng chuỗi và token hiện có.

## Kiểm chứng

Workflow và rule `native-migration`, rule `viezan-product-engineering`, skill `viezan-native-migration` và `viezan-native-ux`. Đã đối chiếu ghi chú Designer, đặc tả màn hình và mục Inline Validation của UI UX Pro Max. QtTest 6.12.0 trên macOS arm64, Release, Fusion/offscreen, hồ sơ thử tạm.

| Nhóm lọc theo tên hàm | Tổng kết nguyên văn |
| --- | --- |
| W1 · `inputLimitsCountGraphemes`, `glassW2Layout`, `dictionaryContextShortcut`, `w5bQuickPanels` | `Totals: 17 passed, 0 failed, 0 skipped, 0 blacklisted, 9754ms` |
| W2 · tiêu đề và Từ điển | `Totals: 11 passed, 0 failed, 0 skipped, 0 blacklisted, 3998ms` |
| W2 · probe, provider, STT trước sửa | `Totals: 5 passed, 4 failed, 0 skipped, 0 blacklisted, 519ms` |
| W2 · probe, provider, STT sau sửa | `Totals: 10 passed, 0 failed, 0 skipped, 0 blacklisted, 544ms` |
| W2 · vòng đời đọc, chọn giọng | `Totals: 6 passed, 0 failed, 0 skipped, 0 blacklisted, 337ms` |
| W1 · kiểm thêm đường nhập Launcher và Quick AI | `Totals: 10 passed, 0 failed, 0 skipped, 0 blacklisted, 2621ms` |
| Kiểm lại điểm cắt, bộ đếm QML và TTS trên bản cuối | `Totals: 13 passed, 0 failed, 0 skipped, 0 blacklisted, 35713ms` |

Build Release cuối trong thư mục có sẵn, không phát cảnh báo compiler. Các lượt biên dịch trung gian có cảnh báo `QFile::open` đã ghi nhận ở vòng 13 trong `LocalProvider.cpp` và `Research.cpp`. Ba dòng hoàn tất target được trích nguyên văn dưới đây.

```text
[ 12%] Built target ViezanBackendTests
[ 56%] Built target ViezanQtTests
[100%] Built target ViezanNativeQt
```

Hai lệnh kiểm cuối chạy từ gốc repo.

```sh
cmake --build .native-build/qt --config Release -j 6
ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4
```

Tổng kết CTest nguyên văn.

```text
100% tests passed out of 9

Total Test time (real) =  48.17 sec
```

Chín log QtTest cộng lại có **421 lượt qua, 0 lỗi, 1 bỏ qua**. Ca `acceleratedGlassSurfacesSurviveAppearanceChanges` cần RHI tăng tốc. Phạm vi xác minh là build và QtTest offscreen trên macOS. Chưa chạy ứng dụng thật, Windows/Linux, trình đọc màn hình hoặc phát âm thanh thực tế.

**Checkout dùng chung.** Đối chiếu trạng thái Git và nội dung cây Qt đầu/cuối lượt xác nhận sprint sửa 19 file Qt liệt kê ở trên và thêm đúng báo cáo này. Luồng song song đã thêm file macOS và tài liệu. Bản sinh `qml/native.json` được cập nhật lúc 18:00:50, sau khi CTest kết thúc lúc 18:00:48. Kết quả trên ứng với tài nguyên đóng gói trong binary đã kiểm.
