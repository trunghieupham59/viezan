# Ghi chú thiết kế cho sprint kế (2026-11-24)

Nguồn: Antigravity đọc tĩnh token, HANDOFF, board và code; chưa mở app. Kỹ sư đọc trước khi code từng story;
những dòng ghi "suy luận" cần người dùng duyệt bằng mắt.

**N1 (Qt) Dung lượng model đã cài**
(1) [LocalModelSettings.qml] (`downloadedModels` `CardBox`): chuyển delegate sang `Kit.CardRow` (`detail`: dung lượng + ID) khớp `installedDetail` ở [LocalModelSettings.swift].
(2) `labelScale`, `smallScale`, `small`, `tight`, `hairline`, `--vzn-text-muted`.
(3) Thiếu/≤0: chỉ hiện ID, không hiện `0 GB`; đủ: dùng `bytes()` theo locale.
(4) Văn bản tĩnh trong `CardRow`, đọc liền tên model.
(5) Sẵn `downloadedModels`, `noLocalModels`.
*Board* ([Settings-Local.dc.html]): vẽ `.srow`/`.note`, không vẽ dung lượng; *suy luận*: đặt ở `detail` theo macOS.

**N2 (Qt) Chip "Đang nghiên cứu · 1:42"**
(1) [ChatTranscript.qml] (`messageColumn`, thay `chat-answering-` bằng `chat-researching-` khi `web`/`research`); [Main.qml] cấp `task.started`.
(2) `Kit.StatusBadge`: `gutter`, `small`, `tight`, `smallScale`, `selectionOpacity`, `--vzn-action-soft`, `--vzn-action-text`.
(3) Có `started`: `Timer` 1s tính `m:ss` (≥1h: `h:mm:ss`, chặn âm); thiếu `started`: `researching`; xong/dừng: ẩn, dừng `Timer`.
(4) `Accessible.name: t("researching")` cố định (khớp [Workspaces.swift]).
(5) Sẵn `researchingElapsed`, `researching`, `chatAnswering`.
*Board* ([Chat-States.dc.html]): vẽ chip + nút Dừng; *suy luận*: dùng `StatusBadge` `gutter` (24), số tabular.

**N3 (Qt) Launcher mở mục Cài đặt**
(1) [Launcher.qml] (`items`, `activate`, `openSettingsRequested`) nối `openSettingsSection` ở [Main.qml], khớp `"settings-"` ở [Launcher.swift].
(2) `navControl`, `tight`, `gap`, `icon`, `captionScale`, `controlRadius`, `focusRingWidth`, `--vzn-action`.
(3) Khớp bỏ dấu `title`/`terms` (≥2 ký tự, ưu tiên `title`, tối đa 3); rỗng/không khớp: ẩn; `loadBlocked` vẫn mở.
(4) `ListItem`, tên `title`, mô tả `settings`, giữ ↑↓/↵/Esc, IME.
(5) Sẵn `launcher_section_viezan`, `settings`, `settingsSections`.
*Board* ([Launcher-States.dc.html]): chưa vẽ lúc gõ; *suy luận*: lọc `settingsSections` như macOS.

**N4 (macOS) Nút Dừng cạnh chip nghiên cứu**
(1) [Workspaces.swift] (`ChatWorkspace`, nhánh `researching`): bọc `chat-researching` và nút Dừng (`store.cancel`) trong `HStack`; giữ nút composer.
(2) `small`, `hairline`, `gutter`, `smallScale`, `.vznQuiet` (`.small`), `--vzn-danger`, `--vzn-action-soft`.
(3) Thiếu `started`: vẫn hiện cạnh `researching`; xong/huỷ: ẩn cả hàng.
(4) ID `chat-research-stop`, nhãn `stop`, giữ focus và nhãn chip cố định.
(5) Sẵn `stop`, `researchingElapsed`, `researching`.
*Board* ([Chat-States.dc.html]): vẽ `.btn.danger.sm` cạnh chip; *suy luận*: dùng `.vznQuiet` nhỏ.

**N5 (macOS+Qt) Tốc độ từng model local**
(1) [LocalModelSettings.swift] (`installedDetail`), [LocalModelSettings.qml] (`CardRow.detail`), đọc cache từ [LocalPerformance.swift] và [LocalPerformance.cpp].
(2) `smallScale`, `tight`, `navControl`, `--vzn-text-muted`, `monospacedDigit`.
(3) Có kết quả: ưu tiên `selected` (`auto`: nhanh nhất); chưa đo/lỗi: `notMeasured`.
(4) Văn bản tĩnh gộp trong `CardRow`.
(5) Sẵn `notMeasured`; thêm `localModelMeasured`: VI `"{mode} · {rate} token/giây"`, EN `"{mode} · {rate} tokens/s"`, JA `"{mode}・{rate}トークン/秒"`.
*Board* ([Settings-Local.dc.html]): vẽ tốc độ/`"Chưa đo"`; *suy luận*: ghép sau dung lượng, ưu tiên `selected`.

**N6 (macOS) Panel model: ghim, ✓, ⌘P**
(1) [ModelPanel.swift] (`rowView`/chân), [ComposerPanels.swift] (`PanelRow`): ghim trước slot `✓` mép phải; chân thêm `KeyCap("⌘P")` + `n/8`.
(2) `navControl`, `compactControl`, `icon`, `smallScale`, `--vzn-action`, `--vzn-text-muted`.
(3) Đạt `8/8`: khoá ghim mới; `tier`/`setup`: ẩn ghim.
(4) Giữ `accessibilityAction`, `pinModelNamed`/`unpinModelNamed`; chân đọc `pinnedModelsCount`.
(5) Sẵn `pinModel`, `unpinModel`; thêm `pinnedModelsCount`: VI `"{count}/{max} đã ghim"`, EN `"{count}/{max} pinned"`, JA `"{count}/{max}件ピン留め"`.
*Board* ([Overlays.dc.html], [Overlays-Settings.dc.html]): nút phụ trước `✓`, chưa vẽ ghim/`⌘P`; *suy luận* từ [findings.md].

## Bổ sung: Nhiệt độ và Từ điển (macOS)

### T1. Nhiệt độ & quạt

- **Mất cảm biến / lỗi SMC** ([ThermalMonitor.swift:64-68]: `error` là `thermalReaderMissing`/`thermalReadError`, hoặc `snapshot != nil && sensors.isEmpty`):
  - *Board:* thẻ viền `--vzn-danger-border`, `thermal_reader_missing_title`, `thermal_reader_missing_desc`, nút `.vznOutline` `retry` (chỉ vẽ thiếu reader).
  - *Suy luận:* thay `NoticeBand` 1 dòng ([ThermalWorkspace.swift:60-70]) bằng `InlineFailure` + nút `.vznOutline` `retry` (`stop(); start()`, hiện cả khi `monitoring == true`), tách `thermal_error_title`/`thermal_error_desc`; không có cảm biến dùng `NoticeBand(role:"warning", edge:false)` (`thermal_no_sensors_title`/`thermal_no_sensors_desc`).
- **Helper chờ phê duyệt** (`helperStatus == "helperApproval"`):
  - *Board:* khối lỗi + `StatusBadge` `.warning` (`helperApproval`), `thermal_fan_helper_error_title`, `thermal_fan_helper_approval_desc`, 3 nút: `.vznQuiet` destructive `unregisterHelper` → `confirmRemoval = true`, `.vznOutline` `openSystemSettings` → `openHelperSettings()`, `.vznPrimary` `retry` → `refreshHelperStatus()`.
  - *Suy luận:* khi `error == nil`, dùng `NoticeBand(role:"warning", edge:false)` + `thermal_fan_helper_approval_title`/`thermal_fan_helper_approval_desc`, bỏ giấu trong `Menu` ([ThermalWorkspace.swift:178]).
- **Helper chưa cài** (`helperStatus == "helperUnavailable"`):
  - *Suy luận* (board chỉ vẽ dialog đăng ký; Qt không điều khiển quạt): `StatusBadge` `.idle` (`helperUnavailable`), mô tả `thermal_fan_helper_not_installed_desc`, nút `.vznOutline` `registerHelper` → `confirmHelper = true`.
- **Đang đọc** (`monitoring && snapshot == nil && error == nil`):
  - *Suy luận* (board chỉ vẽ chưa theo dõi, nút `startMonitoring` dùng `.vznPrimary`): `StatusBadge` `.busy` (`thermal_waiting`) thay `GlassEmptyState` `sensorsEmpty`; giữ `.vznOutline` destructive `stop` → `stop()`. Đủ chuỗi `vi.json`.

### T2. Từ điển

- **Phím tắt `⌘⇧C` (ngữ cảnh):**
  - *Board:* nút ngữ cảnh mang `aria-label` `dictionaryAddContext`, `aria-pressed`, tooltip `dictionaryContextLabel` + `(⌘⇧C)`; gợi ý dưới ô trống thêm `KeyCap` `⌘⇧C` + `dictionaryAddContext`; nút ✕ là "Bỏ ngữ cảnh".
  - *Suy luận:* đặt ở `CommandMenu("commands")` ([ViezanApp.swift:115-117]) như `⌘⇧M`/`⌘⇧T` ([findings.md:63]), bật khi `screen == "dictionary"`, không chặn/IME (`hasMarkedText()`). Bật → `contextFocused = true`; tắt → focus `dictionary-term` qua `focusEpoch`. Khi có chữ: `⌘⇧C`/bấm nút chỉ thu gọn (`contextOpen = false`), giữ `dictionaryContext` và `.isSelected` (sửa kẹt [Workspaces.swift:591]); chỉ ✕ mới `setContext("")` rồi focus `dictionary-term`.
- **Trạng thái board vẽ nhưng Swift thiếu:**
  - Gợi ý `⌘⇧C`/`⌘V`, tooltip/shortcut nút ngữ cảnh ([Workspaces.swift:595-625]), nhãn ✕ đang dùng `close` ([Workspaces.swift:648]).
  - Lỗi tra dùng `HStack` classic thay `InlineFailure` ([Workspaces.swift:844-851]).
  - Không tìm thấy: thiếu icon tìm, 2 lối thoát dùng nút ngang thay `.row` ([Workspaces.swift:774-794]).
  - Hẹp 820: ô trống chưa co 44, ngôn ngữ/model/nút mục từ chưa rút gọn như Qt ([Workspaces.swift:583-590], [L854-859], [HomeWorkspace.swift:467-479]); chân mục từ thiếu "lưu trên thiết bị" ([HomeWorkspace.swift:539]); `savedWords` thiếu `wordsCount` ([Workspaces.swift:686]).
- **Khoá mới:** `dictionaryRemoveContext` ("Bỏ ngữ cảnh" / "Remove context" / "文脈を削除"); `savedOnDevice` ("Lưu trên thiết bị" / "Saved on this device" / "この端末に保存").

## Hàng đợi Qt từ review và đối chiếu của Antigravity (2026-11-24, cuối ngày)

Chưa được Tech Lead kiểm lại từng dòng; kỹ sư tự kiểm trước khi sửa.

### Trợ năng ở sáu màn bộ test chưa phủ

- **nghiêm trọng** · [DesktopPanels.qml:114-131] · Focus ở `quickDraft` (`TextArea`) nhấn Tab chèn ký tự tab, kẹt focus khỏi các nút sau. · Bắt `Keys.onTabPressed`/`onBacktabPressed` để chuyển focus.
- **nghiêm trọng** · [DesktopPanels.qml:228-243] · `modelMenu` đặt `modal: false` và `modelList` thiếu `activeFocusOnTab: true`, nên Shift+Tab không quay lại danh sách và Tab thoát popup. · Đặt `modal: true` cho `modelMenu` và `activeFocusOnTab: true` cho `modelList`.
- **nên sửa** · [ThermalWorkspace.qml:81-83] · Chi tiết cảm biến chỉ hiện khi rê chuột (`ToolTip`), còn `Label` gắn `Accessible.name: text` cập nhật liên tục dễ bị đọc lại (chưa xác minh). · Bỏ `Accessible.name` động trên số đo và đưa chi tiết cảm biến ra vùng tới được bằng bàn phím.
- **nên sửa** · [ThermalWorkspace.qml:99,105-115] · `thermal-reason` thiếu `popupOpen`, còn `reason` thiếu `focus: true` và `closePolicy: Popup.CloseOnEscape` nên Esc có thể không đóng (chưa xác minh `GlassDialog`). · Thêm `popupOpen: reason.visible` và khai báo `focus: true`, `closePolicy: Popup.CloseOnEscape`.
- **nên sửa** · [UpdateSheet.qml:51-54,75-78] · Đổi `phase` ẩn nút đang giữ focus (`download`/`cancel`); chuyển trạng thái tải/sẵn sàng không tự thông báo. · Chuyển focus sang nút kế tiếp khi đổi `phase` và báo trạng thái cho `update-sheet-status`.
- **nên sửa** · [ApplicationsWorkspace.qml:120-122] · Nhãn kết quả gỡ, trạng thái bận và hoàn tác thùng rác thiếu `Accessible.AlertMessage` nên không tự đọc. · Gắn `Accessible.role: Accessible.AlertMessage` cho các nhãn này.
- **nên sửa** · [DesktopPanels.qml:145-146,222] · Ẩn/hiện `quick-send`/`quick-stop` làm mất focus; `quick-feedback` dùng `StaticText` nên không đọc kết quả sao chép/thay thế. · Chuyển focus giữa hai nút và đổi `quick-feedback` sang `Accessible.AlertMessage`.
- **nhỏ** · [ShortcutRecorder.qml:34-38,76-78] · Khi `waiting: true`, nút bị khóa nhưng không báo trạng thái đang lưu. · Thêm nhãn đang lưu gắn `Accessible.role: Accessible.AlertMessage`.

### Năm việc Qt kế tiếp ở Chat, Dịch, Từ điển

- **AI Chat** · Phím tắt gửi bằng `Enter` (`Shift+Enter` xuống dòng, tôn trọng IME) · Swift: [Workspaces.swift] và [L1261-1264]; QML: [Main.qml] và [L1126-1127] chỉ gửi với `Ctrl+Enter` · QtTest: focus `chat-draft`, gửi `Key_Return` kiểm gọi `submit`; `Shift+Return` kiểm chèn `\n` không gửi; khi `inputMethodComposing=true` không gửi.
- **AI Chat** · Nút đọc to (`speak`) dưới từng phản hồi hoàn tất · Swift: [Workspaces.swift] hiện `ListenSpeakerButton` khi `task?.status != .running`; QML: [ChatTranscript.qml] chỉ có Copy, Retry, meta · QtTest: kiểm nút đọc ẩn khi `status==="running"`, hiện khi `"succeeded"` với `rawBody` khác rỗng; click kiểm `bridge.audio.speak` nhận đúng `rawBody`.
- **Dịch** · Thiếu nút `clearSource` ([vi.json]) và `useAsSource` ([vi.json]) · Swift: [Workspaces.swift], [L960-964], [L1015-1028]; QML: thiếu ở [Main.qml] và [L1595-1604] · QtTest: click `clearSource` kiểm `draft===""` và ẩn khi `activeTask` chạy; click `useAsSource` kiểm đảo `source`/`target`, `draft===oldOutput`, ẩn khi đang chạy hoặc có ảnh.
- **Dịch** · Không khoá chọn ngôn ngữ và nút So sánh khi đang dịch · Swift: [Workspaces.swift] và [L1032-1033] disable khi `running != nil`; QML: [Main.qml] và [L1601] không kiểm `!activeTask` · QtTest: tạo task `running` cho phiên Dịch → kiểm `translate-source-language`, `translate-target-language`, nút `swap` và `translate-compare` đều `enabled===false`, bật lại khi xong.
- **Từ điển** · Thiếu `Return` chọn gợi ý đầu khi `notFound`, ẩn nút đọc từng nghĩa ở Glass và thiếu chuỗi `relatedHint` ([vi.json]) · Swift: [Workspaces.swift], [HomeWorkspace.swift] và [L593-594]; QML: [DictionaryResult.qml], [L101-110], [L129] (`visible: !result.glass`) · QtTest: ở `notFound` gửi `Key_Return` kiểm tra gợi ý đầu; ở Glass kiểm `ListenButton` của nghĩa `visible===true` và tab Từ liên quan có `relatedHint`.

### Review ba chỗ sửa mất dữ liệu trên Qt (Antigravity, chỉ đọc)

Chưa được kiểm lại; kỹ sư viết test tái hiện trước khi sửa.

- **Nghiêm trọng** · [WorkbenchBridge.cpp:240-294] · `clearHistory` chỉ kiểm `m_interpretation.blocked()` lúc nạp rồi ghi `workbench.json` trống (dòng 259) và dọn ảnh (dòng 292) trước khi gọi `m_interpretation.clearAll()` (dòng 294); lỗi ghi `interpretation.json` giữa chừng để lại trạng thái nửa xoá (Chat/Dịch/Từ điển mất, Phiên dịch còn). · Hoàn tác `workbench.json` và `m_state` (hoãn dọn ảnh tới khi cả hai kho xong) nếu `clearAll()` thất bại.
- **Nghiêm trọng** · [WorkbenchBridge.cpp:258], [WorkbenchDomain.cpp:541] · `deleteArchived` không có trong `removesHistory`, nên khi `save()` lỗi (dòng 278), phiên lưu trữ và bản nháp đã bị xoá khỏi `m_state` mà không thể hoàn tác. · Thêm `name == "deleteArchived"` vào `removesHistory`.
- **Nên sửa** · [WorkbenchBridge.cpp:632-658] · `confirmBackup` ghi `m_interpretation.importArchive` trước khi ghi `workbench.json` (lỗi ghi gây nửa nhập), đồng thời callback bất đồng bộ không kiểm lại `m_loadBlocked`/`m_shuttingDown` nên có thể ghi đè file hỏng nếu `reload()` chặn giữa chừng. · Kiểm lại `m_loadBlocked`/`m_shuttingDown`, dùng `writeWorkspace`, và hoàn tác `m_interpretation` nếu ghi workspace lỗi.
- **Nên sửa** · [Interpretation.cpp:244-257] · `load()` gọi `toList()` trên `segments` mà không kiểm kiểu, nên `"segments": {}` vẫn nạp với `m_blocked = false` và bị ghi đè thành rỗng. · Kiểm `isMap`/`isList` cho từng phiên và `segments` rồi đặt `m_blocked = true` nếu sai kiểu.
- **Nhỏ** · [WorkbenchDomain.cpp:331-332] · `"disabledModules": "bridge"` bị `toStringList()` đổi thành danh sách rồi xoá thành `[]`, lọt qua `validate()` và cho phép ghi đè file hỏng. · Chỉ dọn `"bridge"` khi `disabledModules` đúng kiểu danh sách.
- **Nhỏ** · [WorkbenchBridge.cpp:241], [WorkbenchBridge.cpp:812] · `m_storageError = "interpretStorageError"` không tự xoá sau `Interpretation::reload()`, làm chặn `scheduleTranslation` tới lần lưu workspace kế tiếp. · Xoá `m_storageError` khi `m_interpretation.changed` báo kho Phiên dịch đã hết lỗi.
- **Hồi quy**: Không phát hiện từ chối snapshot cũ hợp lệ (thiếu `dictionary`, `started`/`finished`/`messages` vắng/`null`) hay chặn lưu vĩnh viễn ở ba chỗ sửa.

### Review phím gửi, Dịch, Từ điển trên Qt (Antigravity, chỉ đọc)

Chưa được kiểm lại; kỹ sư viết test tái hiện trước khi sửa.

- **nghiêm trọng** · [Main.qml:1401-1406] · `contextShortcut` (`Ctrl+Shift+C`) kiểm tra `!root.Overlay.overlay.visible`, nhưng `Overlay.overlay` của Qt Quick Controls luôn `visible: true` nên phím tắt bị vô hiệu hoàn toàn (chưa xác minh runtime); khi sửa bật lại, `Shortcut` cửa sổ cũng sẽ chặn `Ctrl+Shift+C` lúc bôi đen sao chép. · Thay bằng kiểm tra từng popup (`!history.visible && !activity.visible && !commands.visible && !navigationOverlay.visible && !root.composerPopup?.visible`) và `!(root.activeFocusItem?.selectedText)`.
- **nghiêm trọng** · [Main.qml:1378-1382], [DictionaryResult.qml:23-27] · Sau kết quả "không tìm thấy" có gợi ý, gõ từ mới vào `termDraft` rồi nhấn Enter vẫn bị `entryResult.chooseFirstSuggestion()` ghi đè bằng `suggestions[0].word` thay vì tra từ mới (lệch điều kiện với nút `dictionary-lookup`). · Chỉ gọi `chooseFirstSuggestion()` khi `session.draft` chưa đổi so với từ vừa tra lỗi và không giữ phím bổ trợ ngoài `KeypadModifier`.
- **nên sửa** · [Main.qml:1641-1646] · `translation-use-as-source` ghi đè bản nháp chưa dịch mà không có Hoàn tác; khi `source === "auto"` và `target === workspace.locale` (vd. Tự động → Tiếng Việt), cặp ngôn ngữ bị đặt trùng nhau (`locale → locale`). · Gắn toast Hoàn tác khôi phục `draft`/`pair` cũ và chọn ngôn ngữ đích khác `session.target` khi `source === "auto"`.
- **nên sửa** · [Main.qml:1262], [Main.qml:1396-1400] · Khi `session.dictionaryContext` có chữ, `hasContext` luôn `true` nên bấm `contextToggle`/`Ctrl+Shift+C` chỉ chuyển focus về `termDraft` mà không đóng được ô ngữ cảnh. · Khởi tạo `contextOpen = !root.glassChrome || !!session.dictionaryContext` theo phiên và bind hiển thị theo `contextOpen`.
- **nhỏ** · [Main.qml:1126-1132] · Gọi `Qt.inputMethod.commit()` trong `chat-draft` khi `inputMethodComposing` có thể ép chốt sớm preedit lúc popup chọn chữ IME Nhật/Việt đang mở (chưa xác minh runtime). · Xác minh trên IME Windows/Linux và chỉ `commit()` khi IME không tự xử lý Return.
- **nhỏ** · [Main.qml:1648] · Nhánh non-Glass của `translate-compare` mở `translationOptionsDialog` nhưng `onEnabledChanged` chỉ đóng `comparePanel` khi bắt đầu dịch. · Đóng thêm `translationOptionsDialog` khi `!enabled && translationOptionsDialog.visible`.
