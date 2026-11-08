# Native code 62 — AI Chat: gợi ý theo thói quen và mức suy luận (2026-11-08)

Triển khai trên macOS theo [direction.md](../../design/direction.md), giữ một composer và scope của phiên.
Không chạy app hoặc chụp ảnh theo yêu cầu; người dùng review tay.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| `ViezanDomain/HabitSuggestions.swift` (mới) | Logic thuần: hành động từ phiên có tin nhắn/kết quả, bỏ phiên so sánh và thiếu thời gian; cửa sổ 30 ngày, ít nhất ba lần, điểm exp(−tuổi_ngày/10), nhân đôi khi ít nhất ba lần trong ±90 phút theo calendar (vòng qua nửa đêm). Loại hành động đang dùng, sắp theo điểm rồi lần mới nhất, tối đa ba. |
| `ViezanDomain/WorkbenchStore.swift` | `habitSuggestions(for:)` dùng clock, lọc module đã tắt và mode chat hiện tại. `setChatReasoning(_:effort:)` đồng bộ effort/careful, không đổi revision hoặc huỷ task; setter cũ và mục đích model đồng bộ ngược. |
| `ViezanDomain/ModelLineup.swift`, `CloudProvider.swift` | `supportsEffort(model:)` và request dùng cùng helper đọc regex từ reasoningPolicy; local không có effort. Không đổi payload provider. |
| `ViezanNative/Workspaces.swift` | Khối "Thường làm" chỉ trong Chat trống: tối đa ba chip `.vznQuiet`, một hàng hoặc hai hàng qua ViewThatFits, bề rộng reading, chiều cao compactControl; nhãn có placeholder và trợ năng. Bấm chọn mode hoặc mở Dịch/Từ điển; Dịch có việc thì tạo phiên mới trước khi đặt cặp ngôn ngữ. |
| `ViezanNative/ComposerPanels.swift` | Bốn hàng chọn Tự động/Thấp/Vừa/Kỹ rồi Chỉ dẫn cho phiên; Thấp/Vừa disabled và mô tả không hỗ trợ khi cần. Bỏ kind careful và phần công tắc không còn dùng; giữ chuỗi carefulReasoning. Không sửa mô tả mode đã có. |
| `ViezanNative/ViezanApp.swift`, `ModelPanel.swift` | Chip model và chọn mức Kỹ đọc effort high; giữ fallback careful cho phiên cũ chưa lưu effort. Low/medium không có tiền tố. |
| `ViezanDomainTests/HabitSuggestionsTests.swift`, `ChatReasoningTests.swift` (mới) | Ngưỡng, cửa sổ, suy giảm, auto, giờ địa phương qua nửa đêm, loại phiên/hành động, limit, clock/module; đồng bộ effort, giá trị lạ, guard Translate, giữ task/revision, regex provider. |
| `ViezanNativeTests/FoundationRuntimeTests.swift` | Cập nhật test panel cũ sang bốn hàng chọn; kiểm Thấp/Vừa disabled khi không hỗ trợ. |
| `resources/locales/{vi,en,ja}.json` | 11 khoá mới cho thói quen, bốn mức, mô tả và trạng thái không hỗ trợ. |
| `apps/macos/Sources/ViezanDomain/Resources/native.json`, `apps/desktop-qt/qml/native.json` | Sinh bằng `npm run resources`, không sửa tay. Qt chỉ đổi tài nguyên sinh, không đổi C++/QML. |
| `docs/design/direction.md`, `findings.md`, `screens/chat.md`, `glass2/WINDOWS-HANDOFF.md`, `README.md` | Ghi hành vi đã làm, hai quyết định và phần Qt chưa port; bỏ ba việc đã xong khỏi câu còn mở. |
| `docs/migration/README.md` | Thêm liên kết báo cáo 62. |

Áp dụng workflow native-migration, rule native-migration/product-engineering cùng
`.claude/rules/ui-ux.md`, `.claude/rules/chat-state.md`; skill viezan-native-migration,
viezan-native-ux và UI UX Pro Max. Tra cứu `adaptive layout` rồi `ViewThatFits` với
stack swiftui không có kết quả; dùng quyết định đã chốt, native Button, ViewThatFits
và token hiện có, không xem tra cứu là bằng chứng runtime.

## Còn lại

Chưa kiểm bằng mắt: Chat trống, chip một/hai hàng tại các bề rộng, theme, cỡ chữ và VI/EN/JA;
chọn mode, mở Dịch/Từ điển, panel, focus, VoiceOver và IME. Không chạy app/chụp ảnh theo yêu cầu.
Qt chưa port gợi ý thói quen và mức suy luận; đã ghi W1. Ghim model và phím tắt mở panel vẫn mở.
Build và unit test không thay thế nghiệm thu giao diện của người dùng.

## Tự quyết

- Yêu cầu test tầng 3 có mâu thuẫn: ba phiên trong 30 ngày luôn đủ tầng 2. Test kiểm nhân đôi điểm đúng giờ và mất hệ số khi lệch 5 giờ; gợi ý vẫn còn theo tầng 2, hai phiên vẫn không đủ.
- Bỏ thời gian tương lai/không hữu hạn và limit không dương; nếu điểm và thời gian cùng bằng nhau, dùng ID để thứ tự ổn định.
- Phiên cũ có careful=true nhưng chưa có effort vẫn hiện mức Kỹ và tiền tố Kỹ; không di chuyển dữ liệu lưu.
- Các hàng mode hiện dùng dấu chọn, không có icon riêng; chip dùng SF Symbols globe, sparkle.magnifyingglass, photo cho web, research, image. Dịch/Từ điển dùng symbol sẵn có.

## Kiểm tra

Hai lượt, cùng một cây mã.

**Lượt 1 — Codex trong sandbox `workspace-write` (không mạng, không clipboard, không ghi ngoài worktree).**
Build và tài nguyên xanh; `swift test` đỏ 5 test vì sandbox chặn clipboard, kho attachment và
dịch vụ macOS (`composerPasteHandsImagesToTheIntakeInsteadOfTheText`,
`pastedImageBytesIngestLikeAFileAndRejectNonImages`, một lần
`navigationPaneKeepsControlsAndSavedStateAcrossCollapseAndResize`); bản HEAD đối chứng đỏ cùng
những test đó trong cùng sandbox. Lọc riêng 9 test mới: xanh. Không sửa hay nới test cũ.

**Lượt 2 — người điều phối chạy lại ngoài sandbox, trên macOS thật, sau khi sửa báo cáo và chuỗi JA.**
Dòng tổng kết nguyên văn:

```text
npm run resources          → Native resources generated: 3 locales, 78 metrics.
npm run check:resources    → Native resources verified: 3 locales, 78 metrics.
swift test --package-path apps/macos
                           → ✔ Test run with 49 tests in 7 suites passed after 19.755 seconds.
                           → ✔ Test run with 98 tests in 0 suites passed after 0.208 seconds.
npm run check:docs         → Native documentation references version 2.4.2; runtime acceptance is separate.
```

So với develop (90 test domain): thêm 8 test domain, test panel "+" sửa theo bốn mức.
Hai `native.json` sinh ra giống nhau. Nghiệm thu bằng mắt, VoiceOver, IME: NOT RUN theo
yêu cầu người dùng (review tay).
