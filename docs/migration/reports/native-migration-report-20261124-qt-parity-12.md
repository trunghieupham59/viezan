# Sprint 9 · Đối chiếu test domain Swift và Qt

Ngày 24-11-2026, nhánh `develop`. **34 hàm Swift được port hoặc bổ sung assertion tương đương** qua sáu nhóm. Phía Qt thêm 18 hàm test độc lập, hai hàm cung cấp dữ liệu và mở rộng các ca có sẵn. Ca tham số hoá có nhiều dòng dữ liệu. Một ca có thể bảo vệ nhiều quy tắc Swift.

## Phạm vi kiểm kê

Khi bắt đầu có 115 hàm trong 10 file. Bỏ qua 9 hàm mới về kiểm kê ứng dụng, quạt, phím tắt chụp màn hình và OCR theo phân công. Khi chốt, luồng song song đã thêm 6 hàm cùng phạm vi loại trừ vào `WorkbenchTests.swift` và 4 hàm trong file mới `SystemControlsTests.swift`. Kết quả cuối là **125 hàm trong 11 file, 15 loại trừ, 110 dòng đối chiếu**.

| Phân loại | Số hàm Swift |
| --- | ---: |
| Có QtTest kiểm quy tắc trước sprint | 54 |
| Port hoặc bổ sung phần kiểm còn thiếu trong sprint | 34 |
| Thiếu QtTest | 10 |
| Thiếu một phần | 7 |
| Riêng macOS | 5 |
| **Tổng trong bảng** | **110** |

Bảng đối chiếu hành vi và dữ liệu quan sát được trong thân test. Một quy tắc có thể dùng fixture hoặc API khác nhau trên mỗi nền tảng. Cột cuối ghi phần khác biệt khi có. Tất cả tên hàm Qt trong bảng nằm trong [WorkbenchBridgeTests.cpp](../../../apps/desktop-qt/tests/WorkbenchBridgeTests.cpp). Đã rà cả [BackendServicesTests.cpp](../../../apps/desktop-qt/tests/BackendServicesTests.cpp). Các hàm Swift nằm trong [ViezanDomainTests](../../../apps/macos/Tests/ViezanDomainTests).

## Lệch hành vi đã tái hiện và sửa trong C++

| Tình huống tái hiện | Trước khi sửa | Sau khi sửa |
| --- | --- | --- |
| Mở JSON hợp lệ có `tasks` bị thiếu hoặc là object | Nâng cấp gọi `toList()` trước khi kiểm kiểu, coi như không có tác vụ rồi cho phép ghi lại file. | Kiểm kiểu ba trường bắt buộc `sessions`, `tasks`, `active` trước nâng cấp. Thử sửa nháp, đổi điều hướng, lưu và thoát đều giữ nguyên byte của file hỏng. Fixture cũ chưa có Dictionary vẫn mở được. |
| Sửa nguồn hoặc đổi cặp ngôn ngữ khi Dịch đang chạy | Qt huỷ đúng tác vụ nhưng không ghi `finished`. | Lệnh huỷ qua chỉnh sửa truyền thời điểm cho reducer. Test kiểm cả terminal trễ và retry với revision cũ. |
| Bắt đầu so sánh ba model | Các tác vụ con thiếu `started`. | Mỗi lệnh submit con nhận cùng mốc thời gian với lệnh so sánh. Thứ tự cột giữ nguyên sau khi bỏ model trùng. |
| Xoá phiên có bản nháp lúc đích ghi bị chặn | Qt trả lỗi, nhưng phiên đã biến mất khỏi bộ nhớ và không có dữ liệu cho Hoàn tác. | Ghi trạng thái dự kiến bằng `QSaveFile` trước khi công bố kết quả xoá. Ca lỗi kiểm state, tín hiệu quan sát và lần thử lại. Xoá thành công rồi Hoàn tác phục hồi được bản nháp qua lần mở tiếp theo. Dọn bớt và xoá toàn bộ lịch sử dùng cùng đường ghi. |
| Tên phiên chạm biên 64 ký tự | Cắt theo code point làm mất dấu kết hợp hoặc tách emoji ghép. | Cắt tại biên grapheme của Qt như `String.prefix(64)` của Swift. Có đối chứng ASCII, tiếng Việt dạng tổ hợp, emoji và tên file ảnh. |
| Snapshot lưu chuỗi/bool thay cho số, hoặc object thay cho danh sách message của request | Giờ rời trang, hạn nhắc cập nhật, tốc độ giọng hoặc thời điểm attempt sai kiểu vẫn có thể được chấp nhận. Request cũng nhận được `messages` sai kiểu. | Chỉ nhận số JSON hữu hạn cho các trường đã đối chiếu và kiểm kiểu danh sách trước khi duyệt. Task đời cũ thiếu thời điểm và giá trị thời điểm `null` vẫn hợp lệ. |
| Xoá toàn bộ lịch sử khi `interpretation.json` hỏng | Workspace Chat/Dịch/Từ điển đã ghi trạng thái trống trước khi phát hiện không thể dọn Phiên dịch. | Bridge kiểm kho Phiên dịch trước khi thay đổi workspace, trả `interpretStorageError` và giữ nguyên hai file. Sau khi sửa fixture và tải lại, cả hai kho được dọn và lần mở tiếp theo có 0 mục. |

Việc dựng hai message của yêu cầu Từ điển được tách thành `LocalProvider::dictionaryMessages`. Cả adapter và QtTest dùng cùng hàm. Ca test kiểm nội dung trước bước vận chuyển tới provider.

## Bảng đối chiếu theo file

### ChatReasoningTests.swift

| Hàm Swift | Trạng thái | Hàm QtTest | Quy tắc hoặc phần còn thiếu |
| --- | --- | --- | --- |
| `chatReasoningSynchronizesFlagsWithoutInvalidatingWork` | Có | `chatReasoningPreservesSessionAndAttempt` | Đổi mức giữ revision, tác vụ và request đã chụp. |
| `carefulReasoningSynchronizesEffortAndPreservesMiddleLevels` | Có | `chatReasoningPreservesSessionAndAttempt` | Cờ cẩn thận và mức trung gian. |
| `effortSupportUsesProviderPolicy` | Có | `chatReasoningPreservesSessionAndAttempt` | Chính sách hỗ trợ theo provider và họ model. |

### HabitSuggestionsTests.swift

| Hàm Swift | Trạng thái | Hàm QtTest | Quy tắc hoặc phần còn thiếu |
| --- | --- | --- | --- |
| `habitsRequireThreeOccurrencesAndKeepAuto` | Có | `habitThresholdWindowDecayAndLocalHours` | Ngưỡng ba lượt, giữ nguồn tự động. |
| `habitsUseThirtyDayWindowAndDecay` | Có | `habitThresholdWindowDecayAndLocalHours` | Cửa sổ 30 ngày, điểm giảm theo tuổi. |
| `habitsBoostTimeOfDayAcrossMidnight` | Có | `habitThresholdWindowDecayAndLocalHours` | Giờ địa phương qua nửa đêm. |
| `habitsFilterDefaultsComparisonsEmptyAndExcludedActions` | Có | `habitFiltersModesModulesAndEmptyWork` | Bỏ mặc định, bản nháp, phiên con, hành động bị loại. |
| `storeHabitsUseClockModulesAndCurrentMode` | Có | `habitFiltersModesModulesAndEmptyWork`, `habitChipsNavigateWithoutReplacingWork` | Lọc theo module và chế độ. Cửa sổ thời gian có đồng hồ xác định ở test domain. |

### LauncherFileTests.swift

| Hàm Swift | Trạng thái | Hàm QtTest | Quy tắc hoặc phần còn thiếu |
| --- | --- | --- | --- |
| `launcherFilesCarryKindAndDateAndSkipWhatNobodyOpens` | Có | `launcherFilesCarryKindAndDateAndSkipExcludedPaths`, `launcherFilesAcceptRedirectedRoots` | Loại, thời gian, thư mục loại trừ, liên kết và ranh giới thư mục gốc. Gói tài liệu macOS là trường hợp riêng của nền tảng. |

### LocalCatalogTests.swift

| Hàm Swift | Trạng thái | Hàm QtTest | Quy tắc hoặc phần còn thiếu |
| --- | --- | --- | --- |
| `localCatalogReadsSizesAndKeepsOnlyValidModels` | Có | `localCatalogUsesOnlyValidSizes`, `localCatalogKeepsLargestDuplicateSize` | ID hợp lệ và dung lượng của mục trùng. |
| `launcherSettingsJumpMatchesTitleAndTermWordsOnly` | Có | `launcherSettingsJumpMatchesTitleAndTermWordsOnly` | Tìm đầu từ trong tiêu đề/nhãn, tối đa ba. |
| `localModelHeadlineIsTheAppliedProfileOrTheFastest` | Có | `localModelHeadlineIsTheAppliedProfileOrTheFastest` | Ưu tiên cấu hình đang áp dụng có số đo hợp lệ. |

### MenuBarPreferenceTests.swift

| Hàm Swift | Trạng thái | Hàm QtTest | Quy tắc hoặc phần còn thiếu |
| --- | --- | --- | --- |
| `menuBarVisibilityDefaultsVisibleAndPersistsIndependently` | Riêng macOS | — | Tuỳ chọn ẩn/hiện status item của macOS. Windows/Linux dùng khay hệ thống để mở lại cửa sổ. |
| `menuBarVisibilityDoesNotOverwriteBlockedWorkspace` | Riêng macOS | — | Setter của menuBarVisible chỉ có trên macOS. Quy tắc chung bảo vệ file được kiểm bằng invalidSnapshotBlocksWrites. |
| `menuBarSystemCallbacksDoNotRepeatWritesOrObservation` | Riêng macOS | — | Callback lặp từ menu hệ thống của macOS. Qt không có setter tuỳ chọn này. |

### ModelLineupTests.swift

| Hàm Swift | Trạng thái | Hàm QtTest | Quy tắc hoặc phần còn thiếu |
| --- | --- | --- | --- |
| `featuredKeepsTheNewestOfEachFamilyMostCapableFirst` | Có | `parityModelLineupMatchesSwift` | Đại diện mới nhất mỗi họ theo năng lực. |
| `shortNamesComeFromTheIDNotACatalog` | Có | `parityModelLineupMatchesSwift` | Rút gọn tên từ ID. |
| `tiersResolvePerProviderAndVanishWhereTheyWouldNotDiffer` | Có | `parityModelLineupMatchesSwift` | Các mức theo provider và trường hợp ẩn. |
| `searchFoldsSnapshotsAndDropsNonChatModels` | Có | `parityModelLineupMatchesSwift` | Gộp snapshot có ngày, lọc model ngoài chat. |
| `codenamedReleasesLeadTheirSize` | Port | `parityModelLineupMatchesSwift` | Bổ sung thứ tự featured của model mang tên mã và tên ngắn Claude. |
| `panelSectionsFollowTheQuery` | Có | `parityModelLineupMatchesSwift` | Các nhóm khi không gõ, khi tìm và khi nhập ID. |
| `recentModelsKeepThreeDistinctNewestFirst` | Có | `parityModelLineupMatchesSwift` | Ba mục gần nhất khác nhau, bỏ model ngoài chat. |

### PinnedModelTests.swift

| Hàm Swift | Trạng thái | Hàm QtTest | Quy tắc hoặc phần còn thiếu |
| --- | --- | --- | --- |
| `pinnedModelsFormTheirOwnGroupAndLeaveRecent` | Có | `parityModelLineupMatchesSwift` | Nhóm ghim riêng, bỏ khỏi nhóm gần đây. |
| `pinnedModelsToggleValidateAndPersist` | Có | `pinnedModelsPersistAndRejectInvalidState` | Ghim/bỏ ghim, giữ thứ tự sau khi đọc lại và giới hạn tám. |
| `pinnedModelsRejectInvalidStorageAndBlockedWorkspace` | Có | `pinnedModelsPersistAndRejectInvalidState` | Ghim trùng, sai kiểu, quá giới hạn và workspace bị chặn. |

### PullStepTests.swift

| Hàm Swift | Trạng thái | Hàm QtTest | Quy tắc hoặc phần còn thiếu |
| --- | --- | --- | --- |
| `pullStepReadsBytesAndRejectsBadLines` | Có | `pullStepReadsBytesAndRejectsBadLines` | Tiến độ theo byte, dòng manifest, giới hạn và JSON lỗi. |

### SelectionReplacementTests.swift

| Hàm Swift | Trạng thái | Hàm QtTest | Quy tắc hoặc phần còn thiếu |
| --- | --- | --- | --- |
| `selectionReplacementUsesUTF16AndPreservesSurroundingText` | Thiếu | — | Kiểm giữ nguyên hai bên vùng chọn cũng áp dụng cho Windows UI Automation. Chưa có fixture cho vùng chọn UTF-16 và biên sai. |
| `selectionReplacementRejectsAcceptedButUnchangedWrites` | Thiếu | — | WindowsSelection đọc lại giá trị sau SetValue. Chưa có mock control nhận ghi nhưng giữ nguyên văn bản. |
| `selectionReplacementWaitsForExactDocumentAndHonorsCancellation` | Riêng macOS | — | Chuỗi đọc lại có chờ và huỷ Task thuộc luồng dán bất đồng bộ macOS. WindowsSelection kiểm đọc lại đồng bộ. |
| `selectionReplacementDoesNotClaimAnUnchangedTranslationWasEdited` | Thiếu | — | Windows có thao tác thay thế tương ứng. Chưa có QtTest cho bản dịch giống nguyên văn. |

### SystemControlsTests.swift

File này xuất hiện trong lúc chạy các nhóm QtTest. Bốn hàm gọi adapter IOKit/CoreAudio trên macOS. Chức năng tương đương trên Windows/Linux có thể làm qua adapter riêng. Bảng giữ chúng trong danh sách thiếu cho đến khi phạm vi sản phẩm được chốt.

| Hàm Swift | Trạng thái | Hàm QtTest | Quy tắc hoặc phần còn thiếu |
| --- | --- | --- | --- |
| `keepAwakeDefaultsToOff` | Thiếu | — | Chống ngủ mặc định tắt. |
| `keepAwakeCanBeEnabledTwiceThenDisabled` | Thiếu | — | Bật hai lần vẫn chỉ giữ một yêu cầu, tắt giải phóng yêu cầu. |
| `shutdownTurnsOffKeepAwake` | Thiếu | — | Giải phóng yêu cầu khi thoát. |
| `outputMutedReadsConsistently` | Thiếu | — | Hai lần đọc trạng thái tắt tiếng cho cùng kết quả khi thiết bị giữ nguyên. |

### WorkbenchTests.swift

| Hàm Swift | Trạng thái | Hàm QtTest | Quy tắc hoặc phần còn thiếu |
| --- | --- | --- | --- |
| `workspaceDropsRetiredBrowserSettingsDuringRecovery` | Có | `workspaceDropsRetiredBrowserSettingsDuringRecovery` | Giữ active, loại module và cấu hình bridge đã nghỉ. |
| `sessionsKeepIndependentDraftsAndModelsWhileTasksRun` | Port | `simultaneousTasksKeepTheirSessionsAndModels` | Chat và Dịch chạy song song. Huỷ Chat sau khi sửa model chỉ tác động đúng chủ sở hữu. |
| `cancellationAndRetryRejectOldAttemptWithoutDuplicatingMessages` | Port | `cancelledAttemptCannotFinishItsRetry` | Chunk đến sau huỷ, terminal của lần cũ, số lần thử, hai tin nhắn và một task. |
| `editingTranslationInvalidatesOutputAndStaleCompletion` | Port | `editingTranslationEndsAttemptAndRejectsLateCompletion` | Sửa chữ hoặc cặp ngôn ngữ huỷ lần đang chạy, xoá output, từ chối retry và terminal cũ. |
| `recoveryKeepsPartialResultAndNeverRestartsTasks` | Port | `streamingShutdownFlushesPartialReplyAndDraft` | Mở lại với bản nháp chưa gửi, nội dung dở và attempt bị gián đoạn. |
| `storageFailureIsVisibleAndRetryDoesNotDiscardDraft` | Có | `saveFailureCanRetryWithoutLosingDraft` | Tạo lỗi đích ghi trong thư mục tạm rồi sửa đích và mở lại bản nháp. |
| `malformedStorageIsNotOverwritten` | Có | `corruptFileIsPreserved`, `foundationBlockedLoadInMountedShell` | File hỏng giữ nguyên byte. |
| `fileRoundTripAndSchemaValidation` | Port | `roundTripAndSeparateDrafts`, `invalidSnapshotBlocksWrites`, `workspacePromptLimitCountsUtf8Bytes` | Round-trip Unicode và từ chối schema 99 qua đường đọc, chặn ghi tiếp. Qt không công khai API ghi một workspace tuỳ ý như FilePersistence của Swift. |
| `resourcesHaveLocaleParityAndCanonicalMetrics` | Port | `bundledLocalesAndReadingMetricsMatchTheContract` | Tập khoá VI/EN/JA, ba model mẫu, cột đọc và thứ tự cỡ chữ. |
| `appearancePersistsWithoutChangingSessionsOrRunningRequests` | Có | `appearanceRoundTripKeepsWorkAndRejectsInvalidValues`, `foundationSaveRetryControls` | Giữ phiên, task, active và nháp qua đổi giao diện/ngôn ngữ. Lỗi ghi và retry có fixture riêng. |
| `oldSnapshotsDefaultAppearanceAndInvalidValuesFailClosed` | Port | `invalidSnapshotBlocksWrites`, `olderSnapshotKeepsDraftIdentityAndPartialReply` | Fixture cũ thiếu appearance, Qt trả map rỗng để shell dùng mặc định. Giá trị sai chặn đọc. |
| `settingsSearchIncludesLocalizedRowLabelsWithoutDiacritics` | Có | `settingsLayoutAndSearch` | Truy vấn tên hàng theo VI không dấu, EN và JA. |
| `historyIncludesEmptyQueryAndAccentInsensitiveContent` | Port | `historySearchesMessagesAndOrdersEditsAcrossFeatures` | Tìm cả câu trả lời, câu hỏi, chuỗi trắng và chữ Nhật. Lọc riêng Chat/Dịch. |
| `sharedRecoveryContractPreservesUnicodeAndIdentities` | Port | `olderSnapshotKeepsDraftIdentityAndPartialReply`, `sharedRecoveryAndLateEvents` | Fixture hợp đồng, ID của chat/attempt/tin nhắn, model nâng cấp và phần trả lời Unicode. |
| `streamingWritesAreCoalescedAndQuitFlushesPartialOutput` | Port | `streamingShutdownFlushesPartialReplyAndDraft` | 100 chunk giữ nguyên byte trên đĩa trước shutdown. Kiểm trực tiếp file đã flush, sau đó mở lại. Qt quan sát nội dung file thay cho bộ đếm save giả của Swift. |
| `navigationPreferencePreservesWorkAndSurvivesRecovery` | Port | `navigationSaveRetriesWithoutChangingWork`, `foundationLayoutAndNavigation` | Giữ nháp/task khi lưu lỗi, ghi lại, khôi phục và lệnh trùng không phát changed. |
| `navigationPreferenceRejectsInvalidTypeAndSupportsOlderSnapshot` | Port | `invalidSnapshotBlocksWrites`, `olderSnapshotKeepsDraftIdentityAndPartialReply` | Nhận fixture chưa có shell, từ chối chuỗi "false" trong cờ Boolean. |
| `commandsMatchVietnameseWithoutAccentsAndJapanese` | Có | `foundationLayoutAndNavigation` | Lệnh lịch sử theo VI không dấu và JA. |
| `commandPaletteListsDestinationsInNavigationOrderBeforeActions` | Port | `glassOverlayLayout` | So thứ tự từng ID trang thật với navigation rồi kiểm nhóm hành động đứng sau. |
| `localRuntimeReportsCheckedOnlyAfterAProbe` | Thiếu một phần | `providerNoticeFollowsRuntimeAndOpensLocalModels` | Đã kiểm thông báo với snapshot chưa/sau khi có kết quả. Thiếu test gọi LocalRuntime.refresh qua probe giả rồi kiểm checked. |
| `providerSnapshotPrefersOnDeviceThenCloudDefaults` | Có | `providerSnapshotPrefersOnDeviceThenCloudDefaults` | Trạng thái khả dụng, thứ tự model gần đây, cục bộ và đám mây. |
| `discoveryMovesOnlySessionsWithoutWorkToAvailableModels` | Port | `discoveryRetainsStartedChatsAndAdoptsNewModelForBlankOnes` | Áp snapshot giả vào bridge. Phiên hiện hành có nội dung và request đang chạy giữ model, phiên trống và phiên mới nhận model khả dụng. |
| `discoveryWithNothingAvailableKeepsModelsAndReportsEmpty` | Port | `discoveryRetainsStartedChatsAndAdoptsNewModelForBlankOnes` | Snapshot đã kiểm nhưng rỗng giữ nguyên phiên và báo offline cho model cục bộ. |
| `unreachableLocalRuntimeFailsAsOfflineNotGeneric` | Thiếu một phần | `providerSnapshotPrefersOnDeviceThenCloudDefaults` | Đã kiểm availability. Thiếu ca lỗi transport theo từng loại local, timeout cloud và thiếu khoá. |
| `dictionaryAcceptsJSONInsideAMarkdownFence` | Có | `dictionaryAcceptsJSONInsideAMarkdownFence` | Phản hồi bọc hàng rào Markdown thành mục từ. JSON sai trả lỗi. |
| `imageGenerationUsesAnyKeyedImageProvider` | Có | `imageGenerationUsesAnyKeyedImageProvider` | Thứ tự chọn provider tạo ảnh và trường hợp không có provider. |
| `refusedImageRequestsExplainTheModelCannotReadImages` | Có | `refusedImageRequestExplainsTheModelCannotReadImages` | Lỗi từ chối của yêu cầu có hình thành imageModelUnsupported, giữ detail. |
| `providerRejectionKeepsOnlyTheProvidersMessage` | Port | `refusedImageRequestExplainsTheModelCannotReadImages` | Chỉ nhận message trong JSON lỗi, chuẩn hoá xuống dòng, bỏ HTML. |
| `imageGenerationPicksAnImageModelTheAccountLists` | Port | `refusedImageRequestExplainsTheModelCannotReadImages` | Ưu tiên model ảnh đã chọn, model liệt kê phù hợp theo provider và fallback OpenAI. |
| `speechRecognitionDefaultsToAnyKeyedProvider` | Thiếu một phần | `speechRecognitionDefaultsToAutoInEveryEntryPoint` | Đã kiểm mặc định auto. Thiếu fixture Groq-only để kiểm speechReady, chọn OpenAI và phân loại ba lỗi STT. |
| `transcriptionUsesTheBestModelTheAccountLists` | Có | `transcriptionUsesTheBestModelTheAccountLists` | Chọn model chép giọng tốt nhất trong danh mục và fallback. |
| `voiceGateIgnoresSteadyRoomNoiseAndClosesAtAPause` | Có | `voiceGateIgnoresRoomNoiseAndClosesAtAPause` | Nền ồn ổn định, phát hiện giọng và kết thúc ở khoảng nghỉ. |
| `voiceGateDropsClicksAndSplitsLongSpeechAtAGap` | Có | `voiceGateIgnoresRoomNoiseAndClosesAtAPause` | Xung ngắn và gõ phím bị bỏ, câu dài tách ở khoảng ngắt; kiểm lời có nghĩa. |
| `voiceGateKeepsQuietSpeechInANoisyRoomAsOneUtterance` | Có | `voiceGateKeepsQuietSpeechInANoisyRoomAsOneUtterance` | Âm lượng biến động, một phát ngôn dài và chỉ một kết thúc. |
| `quickTranslatePairRoutesTextAlreadyInThePrimaryLanguage` | Thiếu một phần | `quickTranslatePairRoutesTextAlreadyInThePrimaryLanguage` | Cặp chính/phụ, hoán đổi và chọn đích đã có. Test Qt hiện kỳ vọng câu tiếng Anh mẫu cho kết quả nhận dạng rỗng. |
| `quickTranslatePairDefaultsToTheTranslateTargetAndPersists` | Port | `quickTranslatePairRoutesTextAlreadyInThePrimaryLanguage` | Mặc định lấy đích Dịch; chọn trùng bị bỏ qua; khôi phục cả hai ngôn ngữ từ file. |
| `launcherRanksNamePrefixThenWordThenAnywhereWithRecentFirst` | Có | `launcherRanksNamePrefixThenWordThenAnywhereWithRecentFirst` | Thứ tự khớp và ưu tiên gần đây. |
| `thermalSensorsFoldIntoNamedRowsPerGroup` | Có | `thermalHwmonSensorsFoldIntoNamedRows` | Quy tắc nhóm/gộp hàng có ca tương ứng hwmon. Tên nguồn phần cứng phụ thuộc OS. |
| `launcherCurrencyReadsAmountsUnitsAndTargetsLikeTheRenderer` | Có | `launcherCurrencyMatchesSwift` | Tiền tố, hậu tố, đơn vị, locale và chuỗi bị loại. |
| `launcherCurrencyTargetFollowsChoiceThenLanguageButNeverTheTypedCurrency` | Có | `launcherCurrencyMatchesSwift` | Đích mặc định, lựa chọn người dùng, tránh trùng đồng nguồn và phép đổi. |
| `onlyTheNewestFinishedChatAnswerCanBeRegenerated` | Có | `glassBackendReducerRules`, `settledChatContextIsReleased` | Cho chạy lại câu trả lời mới nhất và bảo toàn context còn dùng được. |
| `smartResetOpensAFreshTurnAfterTheBreakAndKeepsThePreviousOneReachable` | Có | `glassBackendSmartReset`, `smartResetPreservesSessionIdentity`, `smartResetBridgePersistence` | Ngưỡng nghỉ, tắt reset, giữ ID, bản nháp, mở lại và lưu bền. |
| `shortcutKeyNamesRoundTripThroughTheRegistryFormat` | Riêng macOS | — | Mã phím phần cứng macOS 17/49/53 và tổ hợp Option/Control của bộ đăng ký macOS. Qt lưu tổ hợp theo nền tảng. |
| `updateSnoozeHidesTheVersionForADayAndVoiceRateStaysWithinBounds` | Có | `parityReducerAndBridge`, `glassBackendReducerRules` | Hẹn 24 giờ, tự động kiểm tra và giới hạn tốc độ đọc; giữ tốc độ khi đổi provider. |
| `pastedImageBytesIngestLikeAFileAndRejectNonImages` | Thiếu | — | Qt ingest từ URL file. Chưa có ca dán trực tiếp byte PNG, từ chối byte lỗi và đọc lại đúng byte như Swift. |
| `theLastWorkspaceModuleStaysOnAndSentenceComparisonIsRemembered` | Có | `glassBackendReducerRules`, `glassBackendSecondPassReducer` | Giữ module làm việc cuối và lựa chọn bố cục so sánh. |
| `historyOrdersByLatestChangeAcrossFeatures` | Port | `historySearchesMessagesAndOrdersEditsAcrossFeatures` | Timestamp cố định, ba bản ghi; xếp đúng theo sửa gần nhất, lọc một hoặc mọi tính năng. |
| `newSessionSweepsEarlierEmptySessionsOfItsFeature` | Port | `newSessionSweepsOnlyEmptySiblings` | Chỉ dọn phiên trống cùng tính năng, giữ nháp cũ và hai tính năng còn lại. |
| `removingASessionIsUndoableAndKeepsAnActiveSession` | Port | `failedRemovalKeepsDraftAvailableForRetryAndUndo`, `parityReducerAndBridge` | Bảo toàn bản nháp và phiên đang chọn khi commit thất bại. Sau khi sửa đích, xoá/hoàn tác/mở lại. |
| `importedTitlesReadThroughMacRomanAreRepaired` | Thiếu | — | Cần fixture tiêu đề Việt lỗi MacRoman trong snapshot/backup có thể chuyển nền tảng, cùng đối chứng chuỗi toán học và UTF-8 tốt. |
| `derivedTitlesPreferTheImageOverADroppedPath` | Port | `firstTitleKeepsWholeCharactersAndImageNames` | Ảnh, đường dẫn được giải mã, xuống dòng, biên 64 chữ có dấu tổ hợp và emoji ghép. |
| `historyBucketsFollowTheCalendar` | Có | `glassHistoryActions` | Bốn nhóm theo ngày lịch địa phương, gồm hôm qua và tuần này. |
| `unchangedDictionaryContextKeepsTheEntry` | Có | `glassBackendReducerRules` | Ngữ cảnh lặp giữ revision và kết quả. Đổi ngữ cảnh làm mất hiệu lực kết quả. |
| `tasksRecordWhenEachAttemptStartedAndEnded` | Port | `glassBackendReducerRules`, `editingTranslationEndsAttemptAndRejectsLateCompletion`, `comparisonKeepsCallerOrderAndParentDraft` | Giờ bắt đầu/kết thúc xác định, gồm huỷ qua chỉnh sửa và thời điểm bắt đầu của các cột so sánh. |
| `tasksFromOlderSnapshotsDecodeWithoutTimes` | Port | `olderSnapshotKeepsDraftIdentityAndPartialReply`, `savedAttemptRequiresTypedTimesAndMessageList` | Task cũ thiếu thời gian vẫn đọc được. Timestamp null hợp lệ; chuỗi giả số bị chặn. |
| `dictionaryEntriesCarryOptionalRelatedWords` | Thiếu một phần | `glassBackendReducerRules`, `glassW2Dictionary` | Có kết quả và chọn từ liên quan. Chưa kiểm đủ chuỗi trống, mảng rỗng và block related sai kiểu. |
| `dictionaryPromptIsTheSharedContract` | Port | `dictionaryRequestUsesSharedPrompt` | Hai message thực mà adapter dựng, mã nguồn/đích, hết placeholder, schema và ngữ cảnh. |
| `onlyProvidersThatHonourItGetASpeakingRate` | Port | `glassBackendReducerRules` | Đã kiểm đủ cả năm provider với chính sách tốc độ đọc. |
| `systemSpeechFinishEndsReading` | Thiếu | — | Cần mô phỏng kết thúc lượt đọc và tín hiệu đến muộn của lượt cũ tại NativeAudio của Qt. macOS dùng ID utterance, Qt dùng QTextToSpeech. |
| `emptiedNameFallsBackToTheFirstQuestion` | Có | `glassBackendSecondPassReducer` | Đổi tên rồi xoá trắng lấy lại tiêu đề đầu. Fixture Qt dùng câu hỏi có ảnh. |
| `archivingRecordsWhenAndTheArchiveSortsByIt` | Có | `glassBackendSecondPassReducer`, `glassBackendSecondPassServices` | archivedAt, updated, bỏ mốc khi khôi phục, thứ tự theo lúc lưu trữ. |
| `comparisonKeepsTheCallersColumnOrder` | Port | `comparisonKeepsCallerOrderAndParentDraft` | Loại model trùng, giữ thứ tự cột, nguồn và active của cha. |
| `clearHistoryRemovesEveryEntryAndKeepsOneEmptySessionPerFeature` | Port | `glassBackendSecondPassReducer`, `w4HistoryConfirmation`, `remainingGapsInterpretation` | Chặn khi bận hoặc kho Phiên dịch không đọc được. Sau khi phục hồi, dọn cả lịch sử và transcript, giữ model và ba phiên trống rồi mở lại. |
| `dictionaryEntriesCarryOptionalContextSenseAndRegisters` | Thiếu một phần | `glassW2Dictionary`, `dictionaryRequestUsesSharedPrompt` | Có nghĩa/ngữ vực khi dữ liệu đúng và notFound trong prompt. Thiếu biến thể chỉ số vượt số nghĩa và exampleRegisters sai kiểu. |
| `dictionaryNotFoundIsItsOwnOutcomeWithSuggestions` | Có | `glassBackendSecondPassReducer`, `glassW2Dictionary` | Trạng thái dictionaryNotFound, danh sách gợi ý đã lọc và giao diện thử lại. |
| `imageDetailsAreOptionalAndBackupsMatchOnTheFile` | Port | `glassBackendSecondPassServices` | Preview backup ghép record ảnh cũ hoặc mới với metadata kích thước/model trong phiên. Sai tên file làm preview thất bại. |
| `speakingRemembersItsSourceAndAOneOffProvider` | Port | `oneOffReadingKeepsSourceAndPreferredProvider` | Chặn ngay lúc preparing trước I/O, nhớ nguồn vừa đọc và giữ provider mặc định. |
| `translateRefusesASourceOverTheLimit` | Có | `parityReducerAndBridge` | 5001 ký tự ASCII chặn submit/compare, 5000 cho submit. Khác biệt về đơn vị Unicode được ghi ở cuối. |
| `cancellingNoSummaryIsANoOp` | Port | `parityInterpretationRestoreAndCancelSummary` | Huỷ khi nghỉ giữ nguyên danh sách, cờ summarizing và trạng thái lỗi. |
| `paletteQueriesReadSumsPrefixesAndQuestions` | Có | `remainingGapsServices`, `w5aPaletteQueries` | Phép tính, hỏi, tiền tố Dịch/Từ điển, truy vấn thường. |
| `launcherHomeOffersEnabledPagesAndAFreshQuickChat` | Có | `remainingGapsServices` | Launcher lọc module, không tiếp tục chat trống và cho tiếp tục chat vừa có câu hỏi. |
| `localModelSuggestionsComeFromTheSharedContract` | Port | `remainingGapsServices` | Đúng bốn ID, thứ tự và metadata bytes/name/note của từng gợi ý. |
| `downloadEstimatesWaitForAStableRate` | Port | `remainingGapsServices` | ETA sau khi tốc độ ổn định, ẩn ở 100%. Phần hiệu chỉnh quạt SMC của cùng hàm chỉ có trên macOS. |
| `voicesFollowTheLanguageTheyRead` | Thiếu một phần | `remainingGapsServices`, `windowsMicrophonePermissionAndCaptureModes` | Có ngôn ngữ giọng và trạng thái micro. Chưa kiểm chính xác giọng Nhật đã chọn không đọc câu tiếng Anh. |
| `interpretationExportsTranslationOnlyAndReloadsAfterAStorageFailure` | Có | `remainingGapsInterpretation` | Phục hồi file Phiên dịch hỏng sau sửa, xuất chỉ bản dịch hoặc song ngữ, gồm TXT/SRT. |
| `settledChatContextIsReleased` | Có | `settledChatContextIsReleased` | Giữ request mới nhất, bỏ context đã hết khả năng tái tạo. |

## Phần còn lại chưa port

Các dòng **Thiếu** và **Thiếu một phần** trong bảng nêu từng assertion còn mở, tổng cộng 17 hàm. Nhóm dữ liệu còn lại gồm tiêu đề nhập từ MacRoman và đầu vào ảnh dán dạng byte. Nhóm adapter còn thiếu fixture cho Windows UI Automation, probe runtime, lỗi transport, STT chỉ có Groq, lượt đọc hệ thống kết thúc trễ, chọn giọng khác ngôn ngữ và bốn ca điều khiển hệ thống vừa xuất hiện. Từ điển còn trường tuỳ chọn sai kiểu; Dịch nhanh còn phân loại văn bản Latin. Bằng chứng Windows/Linux thực tế và việc chạy bộ Swift thuộc lượt nghiệm thu của các nền tảng tương ứng.

## Cần Tech Lead xử lý

- Chốt đặc tả giới hạn Dịch. Các mục S13, “Văn bản dài” và mục 8 trong đặc tả Dịch mô tả cảnh báo mềm. BACKEND-GAPS #18 và hai reducer đang áp dụng ngưỡng cứng. Ca tái hiện dùng 5.001 chữ `a`: cả hai test domain đều yêu cầu từ chối gửi. Cần xác định thêm đơn vị đếm cho chuỗi ghép. Ví dụ 5.000 lần `e` + U+0301 là 5.000 grapheme trong Swift và 10.000 code point theo đường kiểm tra Dịch hiện tại của Qt. Đây là đối chiếu nguồn; QtTest của ngưỡng Dịch hiện kiểm ASCII. [Đặc tả Dịch](../../design/screens/translate.md) · [BACKEND-GAPS #18](../../design/glass2/BACKEND-GAPS.md)
- Chốt hành vi khi Dịch nhanh nhận câu tiếng Anh dùng ký tự Latin. Test Swift yêu cầu nhận ra `en`; QtTest hiện yêu cầu chuỗi rỗng với “The meeting starts at nine” rồi dùng ngôn ngữ dự phòng. Việc thông qua cả hai bộ test riêng lẻ vẫn cho hai hành vi khác nhau. [Đặc tả Dịch mọi nơi](../../design/screens/everywhere.md)
- Chốt quy tắc thay văn bản giống hệt vùng chọn trên Windows và việc sửa tiêu đề MacRoman trong backup chuyển nền tảng. Windows cần fixture UI Automation mô phỏng setter thành công nhưng văn bản giữ nguyên; Qt cần fixture tiêu đề gốc/lỗi mã hoá trước khi tự sửa dữ liệu đã lưu. [Đặc tả Dịch mọi nơi](../../design/screens/everywhere.md)
- Xác định phạm vi Windows/Linux cho chống ngủ và đọc trạng thái tắt tiếng của đầu ra. Bốn ca mới của luồng macOS đang dùng IOKit/CoreAudio. Sprint này chỉ đọc mã của chúng.

## Bằng chứng kiểm tra

Dùng workflow `native-migration`, các rule `native-migration`, `viezan-product-engineering` và skill `viezan-native-migration`. Đã đọc hướng dẫn repo, UI/UX, native-code-66 và các đặc tả liên quan. Đã chạy Release trong `.native-build/qt` có sẵn với `BUILD_TESTING=ON`. QtTest 6.12.0 trên macOS arm64, Fusion/offscreen, đường dẫn dữ liệu của tiến trình kiểm thử nằm trong hồ sơ tạm. Mỗi nhóm được lọc theo tên hàm trước khi sang nhóm tiếp.

| Nhóm | Bộ lọc của ViezanQtTests | Trước sửa (qua/lỗi) | Kết quả nhóm (qua/lỗi) |
| --- | --- | ---: | ---: |
| 1. Workspace hỏng, khả năng phục hồi, bản nháp khi tắt | `invalidSnapshotBlocksWrites`, `olderSnapshotKeepsDraftIdentityAndPartialReply`, `streamingShutdownFlushesPartialReplyAndDraft`, `navigationSaveRetriesWithoutChangingWork`, `corruptFileIsPreserved`, `roundTripAndSeparateDrafts`, `saveFailureCanRetryWithoutLosingDraft` | 11/2 | 13/0 |
| 2. Quyền sở hữu tác vụ, retry, so sánh, xoá và hoàn tác | `simultaneousTasksKeepTheirSessionsAndModels`, `cancelledAttemptCannotFinishItsRetry`, `editingTranslationEndsAttemptAndRejectsLateCompletion`, `failedRemovalKeepsDraftAvailableForRetryAndUndo`, `comparisonKeepsCallerOrderAndParentDraft`, `translationInvalidation`, `parityReducerAndBridge`, `w4HistoryConfirmation` | 6/4 | 11/0 |
| 3. Lịch sử, tên phiên, giới hạn byte | `historySearchesMessagesAndOrdersEditsAcrossFeatures`, `newSessionSweepsOnlyEmptySiblings`, `firstTitleKeepsWholeCharactersAndImageNames`, `workspacePromptLimitCountsUtf8Bytes`, `glassBackendSecondPassServices` | 6/1 | 7/0 |
| 4. Tài nguyên, model, provider, ngôn ngữ | `bundledLocalesAndReadingMetricsMatchTheContract`, `discoveryRetainsStartedChatsAndAdoptsNewModelForBlankOnes`, `dictionaryRequestUsesSharedPrompt`, `oneOffReadingKeepsSourceAndPreferredProvider`, `parityModelLineupMatchesSwift`, `remainingGapsServices`, `refusedImageRequestExplainsTheModelCannotReadImages`, `glassBackendReducerRules`, `quickTranslatePairRoutesTextAlreadyInThePrimaryLanguage` | — | 11/0 |
| 5. Kiểu dữ liệu của snapshot và request | `invalidSnapshotBlocksWrites`, `savedAttemptRequiresTypedTimesAndMessageList`, `olderSnapshotKeepsDraftIdentityAndPartialReply`, `featureLeftLaunchPersistence`, `parityReducerAndBridge`, `dictionaryRequestUsesSharedPrompt` | 14/5 | 19/0 |
| 6. Xoá lịch sử liên kho và phục hồi Phiên dịch | `parityInterpretationRestoreAndCancelSummary`, `remainingGapsServices`, `glassOverlayLayout`, `remainingGapsInterpretation` | 6/1 | 7/0 |

Số lượt QtTest gồm cả khởi tạo, dọn dẹp và từng hàng dữ liệu. Ở nhóm 2, `w4HistoryConfirmation` chạy cùng bộ lọc sau khi sửa. Nhóm 4 xanh ở lần chạy đầu. Nhóm 5 bổ sung các hàng dữ liệu mới vào ca kiểm snapshot của nhóm 1.

```sh
cmake --build .native-build/qt --config Release -j 6
ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4
```

Các dòng hoàn tất ba target, trích nguyên văn từ build cuối:

```text
[ 13%] Built target ViezanBackendTests
[ 60%] Built target ViezanNativeQt
[100%] Built target ViezanQtTests
```

Build cuối không phát cảnh báo compiler. Khi biên dịch lại các file ở giữa sprint, compiler có báo kết quả `QFile::open` bị bỏ qua tại các dòng có sẵn của LocalProvider và Research. Đường dựng prompt Từ điển vừa tách đã kiểm kết quả mở resource.

Tổng kết nguyên văn của lần chạy toàn bộ CTest cuối sprint:

```text
100% tests passed out of 9

Total Test time (real) =  54.11 sec
```

Cả 9 mục CTest đều qua. Cộng các dòng `Totals` trong log QtTest được 405 lượt qua, 0 lỗi và 1 lượt bỏ qua (gồm khởi tạo, dọn dẹp và các hàng dữ liệu). Ca `acceleratedGlassSurfacesSurviveAppearanceChanges` dùng `QSKIP` do backend software/offscreen thiếu RHI tăng tốc. Phạm vi xác minh là build và QtTest cục bộ trên macOS. Kiểm thử Swift, chạy trên Windows/Linux, kiểm thử trợ năng trực tiếp và nghiệm thu giao diện nằm ngoài lượt này.

## Phạm vi thay đổi trong checkout dùng chung

Năm file nguồn do sprint này sửa là `apps/desktop-qt/WorkbenchDomain.cpp`, `WorkbenchBridge.cpp`, `LocalProvider.h`, `LocalProvider.cpp` và `tests/WorkbenchBridgeTests.cpp` trong cùng cây Qt. Cả năm đã có thay đổi của các vòng trước khi bắt đầu. File thêm mới của sprint là báo cáo này. Trong khi chạy có thay đổi đồng thời ở luồng macOS, tài liệu và bản sinh `qml/native.json`. Bản so trước/sau trong cây Qt khớp với năm file nguồn trên và bản sinh của luồng song song.
