# Native code 63 — Nghiệm thu trợ năng macOS: audit tĩnh và checklist (2026-11-08)

Audit và sửa trực tiếp trên `codex/macos-accessibility`. Đã kiểm số 63 còn trống trước khi tạo.
Không commit/push/đổi nhánh/worktree; không cài dependency, chạy app, chụp ảnh hoặc đổi cài đặt hệ thống.
Hai file chưa track của người dùng được giữ nguyên. Build/test dùng `apps/macos/.build` có sẵn.

Áp dụng workflow native-migration, rule native-migration/product-engineering, `.claude/rules/ui-ux.md`,
skill viezan-native-migration, viezan-native-ux và UI UX Pro Max. Đọc tài liệu theo yêu cầu và
CONTRIBUTING. Tra cứu `icon button accessible label` domain ux trả một mục Mobile không phù hợp;
tra cứu hẹp domain icons trả `icon-context-accessibility`: lấy nguyên tắc icon trang trí ẩn,
icon hành động có tên; dùng SwiftUI/AppKit và SF Symbols hiện có, không nhập thư viện web.
Nguồn, test fixture, build và nghiệm thu sống là các mức bằng chứng riêng (UX07–UX10).

## Thay đổi

| File | Mục | Thay đổi |
| --- | --- | --- |
| `NativeFoundation.swift` | A, C9 | `usesSolidSurfaces` + Environment dùng chung; ShellSurface đặc và có viền; NSButton dùng border-strong ở nhánh đặc; điều hướng có vòng focus riêng; ẩn icon route trang trí. |
| `NativeKit.swift`, `InsetInputSurface.swift` | A5, C | Các vật liệu đọc điều kiện chung; viền input/composer dùng border-strong; track filter đặc có viền đầy đủ; TaskStatusText có giá trị trạng thái cập nhật. |
| `ComposerPanels.swift` | C9 | PanelRow giữ vòng focus cả khi hàng đang chọn. |
| `HistoryViews.swift` | A3, C9 | Nhóm thư viện có tên; SessionRow gộp chữ; heading lịch sử; focus hàng độc lập với lens; trạng thái chọn lịch sử nhanh phản ánh phiên hiện hành. |
| `NativeSettings.swift` | A2–A4, C9 | Nhóm danh sách và section có tên; picker mở có trạng thái chọn; ẩn icon kèm chữ. Hàng dùng NavigationButtonStyle có vòng riêng. |
| `Workspaces.swift` | A2–A5, B, C, D | Nhóm bản ghi Chat và pane Dịch; giá trị trạng thái trả lời/dịch; tên kiểu dịch chứa nhãn nhìn thấy; lớp nổi có trạng thái; font preview mục từ; Reduce Motion cho ngữ cảnh. |
| `ViezanApp.swift` | A1, B | Nhãn model chứa tên ngắn nhìn thấy cùng ID; overload readingFont cho heading giữ cỡ gốc ở Vừa và nhân đúng textScales. |
| `HomeWorkspace.swift` | B | Nội dung mục từ, phiên âm, ví dụ, nghĩa, ghi chú và heading dùng font đọc; điều khiển/metadata giữ vai trò hệ thống. |
| `DesktopPanels.swift`, `QuickTranslate.swift`, `LauncherChat.swift` | B, D | Chat nhanh/Dịch nhanh và câu hỏi Launcher dùng font đọc; cuộn Launcher tôn trọng Reduce Motion. |
| `ComparisonPane.swift`, `InterpretationWorkspace.swift` | A2, B | Nguồn/kết quả theo câu, bản ghép và nguyên bản Phiên dịch dùng font đọc; trigger Phiên dịch có trạng thái lớp nổi. |
| `NativeToasts.swift`, `ResearchPanel.swift` | A5, D | Toast đăng Announcement; Reduce Motion bỏ animation thao tác toast, dùng transition opacity; mở nghiên cứu không animation khi giảm chuyển động. |
| `AccessibilityTests.swift` | F | Swift Testing: tên control VI/EN/JA ở shell compact, host Chat/Dịch 572 pt, font ba mức và điều kiện mặt đặc. |
| `direction.md`, `findings.md`, `glass2/BACKEND-GAPS.md`, spec màn | G | Ghi quyết định và checklist còn mở; Qt chưa được sửa. |

Đường dẫn source trong các bảng là tương đối với `apps/macos/Sources/ViezanNative/`;
test ở `apps/macos/Tests/ViezanNativeTests/`. Không thêm chuỗi, token, màu hoặc preset mới.

## Audit

Đơn vị đếm là **vị trí khai báo control icon-only/có nhánh icon-only** trong source, gồm
wrapper ShellCloseButton và hàng route sinh động, không phải số instance trên màn.
**72 vị trí**: **3 sửa tên/trạng thái**, **69 ghi nhận có tên sẵn**; không tìm thấy control
icon-only thiếu tên. `help` được xét riêng, không dùng làm bằng chứng cho tên.
Không có `.labelStyle(.iconOnly)` trong source; các ShellToolbarButton bỏ `showsLabel` mặc định false.
Tên động (route, model, tên attachment, dữ liệu người dùng) được đi cùng chuỗi ngôn ngữ UI;
không dịch ID/model/tên file của người dùng. Vai trò gốc Button/Menu/Toggle giữ nguyên.

| Control / khoá tên | Vị trí | Vấn đề / xử lý |
| --- | --- | --- |
| 1. `refresh` | `ApplicationsWorkspace.swift:50` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 2. `close` | `ApplicationsWorkspace.swift:108` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 3. `close` | `ApplicationsWorkspace.swift:136` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 4. `refresh` | `ApplicationsWorkspace.swift:187` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 5. `close` | `ApplicationsWorkspace.swift:236` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 6. `close` | `ApplicationsWorkspace.swift:248` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 7. `close` | `ComparisonPane.swift:111` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 8. `copy` | `ComparisonPane.swift:231` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 9. `copy` | `ComparisonPane.swift:329` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 10. `close` | `HistoryViews.swift:529` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 11. `speak` | `HomeWorkspace.swift:528` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 12. `copy` | `HomeWorkspace.swift:530` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 13. `speak` | `HomeWorkspace.swift:593` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 14. `speak` | `HomeWorkspace.swift:626` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 15. `speak` | `HomeWorkspace.swift:643` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 16. `attachImage` | `ImageControls.swift:25` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 17. `removeAttachment` | `ImageControls.swift:196` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 18. `removeAttachment` | `ImageControls.swift:214` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 19. `swap` | `InterpretationWorkspace.swift:303` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 20. `swap` | `InterpretationWorkspace.swift:308` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 21. `summarize` | `InterpretationWorkspace.swift:415` | Đã sửa: thêm trạng thái lớp analyses đang mở |
| 22. `summarize` (Menu classic) | `InterpretationWorkspace.swift:430` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 23. `close` | `InterpretationWorkspace.swift:456` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 24. `deleteSession` | `InterpretationWorkspace.swift:474` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 25. `speak` | `InterpretationWorkspace.swift:551` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 26. `close` | `InterpretationWorkspace.swift:595` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 27. `close` | `InterpretationWorkspace.swift:670` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 28. `ai_chat_popup_short_label / ai_chat_popup_new_conversation` | `LauncherChat.swift:100` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 29. `quickClear` | `LauncherChat.swift:113` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 30. `send` | `LauncherChat.swift:116` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 31. `ShellCloseButton · label từ caller` | `NativeFoundation.swift:190` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 32. `searchEverything / commands` | `NativeFoundation.swift:1053` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 33. `route · store.text(id) / keyAbsent` | `NativeFoundation.swift:1096` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 34. `close` | `NativeFoundation.swift:1208` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 35. `close` | `NativeFoundation.swift:1264` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 36. `close` | `NativeKit.swift:545` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 37. `readAgain` | `NativeKit.swift:614` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 38. `ListenSpeakerButton · label từ caller / readingNow / stopSpeaking` | `NativeKit.swift:656` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 39. `close` | `NativeToasts.swift:72` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 40. `close` | `QuickTranslate.swift:231` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 41. `ShellCloseButton · label từ caller` | `ViezanApp.swift:415` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 42. `back` | `ViezanApp.swift:429` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 43. `launcher` | `ViezanApp.swift:444` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 44. `summarizeShort` | `ViezanApp.swift:448` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 45. `history` | `ViezanApp.swift:449` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 46. `newInterpretation` | `ViezanApp.swift:450` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 47. `addImage` | `ViezanApp.swift:454` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 48. `savedWords` | `ViezanApp.swift:457` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 49. `history` | `ViezanApp.swift:460` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 50. `newChat / newLookup / newTranslation` | `ViezanApp.swift:464` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 51. `activity` | `ViezanApp.swift:468` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 52. `model / tierCareful / tên ngắn / ID` | `ViezanApp.swift:596` | Đã sửa: tên chứa nhãn model nhìn thấy và ID đầy đủ |
| 53. `stop` | `Workspaces.swift:282` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 54. `send` | `Workspaces.swift:286` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 55. `close` | `Workspaces.swift:446` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 56. `close` | `Workspaces.swift:455` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 57. `close` | `Workspaces.swift:527` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 58. `dictionaryAddContext` | `Workspaces.swift:601` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 59. `close` | `Workspaces.swift:628` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 60. `speak` | `Workspaces.swift:687` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 61. `swap` | `Workspaces.swift:837` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 62. `swap` | `Workspaces.swift:848` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 63. `clearSource` | `Workspaces.swift:901` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 64. `useAsSource` | `Workspaces.swift:992` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 65. `useAsSource` | `Workspaces.swift:996` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 66. `readingNow / stopSpeaking / listen` | `Workspaces.swift:1007` | Đã sửa: thêm trạng thái lớp listen đang mở |
| 67. `listen` | `Workspaces.swift:1025` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 68. `copy` | `Workspaces.swift:1029` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 69. `stopRecording` | `Workspaces.swift:1250` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 70. `record` | `Workspaces.swift:1253` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 71. `stop` | `Workspaces.swift:1259` | Ghi nhận: tên có sẵn, kiểm sống còn mở |
| 72. `speechProvider` | `Workspaces.swift:1296` | Ghi nhận: tên có sẵn, kiểm sống còn mở |

Các control có chữ, nhóm và trạng thái cũng được rà riêng; không cộng vào 72 vị trí ở trên:

| Control / nhóm | Vị trí | Vấn đề / đã sửa hay ghi nhận |
| --- | --- | --- |
| Kiểu dịch (Glass + classic) | Workspaces.resultPane | Đã sửa WCAG 2.5.3: tên bao gồm style đang nhìn thấy, cùng translationOptions; trạng thái mở. |
| PanelRow | ComposerPanels | Đã sửa vòng focus bị bỏ khi selected; tên title + detail, isSelected, icon/check ẩn có sẵn. |
| Navigation / Settings / history row | NativeFoundation, NativeSettings, HistoryViews | Thêm vòng riêng hai hairline action-text cho hàng; SessionRow combine; Settings và thư viện contain + nhãn. |
| Header ShellToolbarButton | NativeFoundation.FocusButton | Ghi nhận native `.exterior` focus ring và focus mask riêng với mặt/lens; không đổi hình học/phím tắt. Màu/độ dày native halo còn kiểm sống. |
| Model / + / quick history / sidebar | ModelPanel, ComposerPanels, HistoryViews, NativeFoundation | contain + label đã có; thư viện và transcript Chat bổ sung nhóm. |
| Pane nguồn/kết quả Dịch | Workspaces | contain + source/result, status value kết quả khi translating/empty/result. |
| SettingsPicker / lớp Dịch và Phiên dịch | NativeSettings, Workspaces, InterpretationWorkspace | Thêm isSelected cho lớp mở; LanguagePill có accessibilityValue sẵn. Native Toggle/Picker giữ trạng thái gốc. |
| Tiêu đề | PageIntro, Eyebrow, CardSection, paneHeader, Settings | isHeader có sẵn; bổ sung heading Lịch sử nhanh. |
| Trang trí | AppBackdrop, GlassRim, OuterShadow, ChromeDivider, material NSView | accessHidden hoặc setAccessibilityElement(false) có sẵn; bổ sung icon route, Settings, sparkle Chat. Label gốc native cung cấp semantics cho icon kèm chữ. |
| Toast / trạng thái async | NativeToasts, TaskStatusText, Workspaces | Toast Announcement; TaskStatusText, transcript Chat và pane kết quả có value cập nhật. Không tạo hệ thống live mới; nhịp đọc lịch sự/không đọc từng token cần VoiceOver thật. |

## Vùng đọc → font

| Vùng | Font cuối / ghi nhận |
| --- | --- |
| Chat · lượt người dùng | readingFont(store), fixedSize vertical, không chiều cao cố định |
| Chat · trả lời | TranscriptText → readingNSFont(store), markdown theo cùng font |
| Ô soạn Chat / chỉ dẫn phiên | ComposerEditor → readingNSFont(store), placeholder readingFont, tăng dòng rồi cuộn |
| Dịch · nguồn / kết quả | readingNSFont / readingFont; editor và ScrollView, không khoá chiều cao chữ |
| So sánh · nguồn từng câu, kết quả từng câu, bản ghép | readingFont; đã sửa nguồn/Glass result/assembly dùng cỡ cố định |
| Từ điển · nội dung nghĩa/bản dịch/ví dụ/nuance/ghi chú/preview | readingFont; heading dùng overload base NSFont để giữ hierarchy gốc ở Vừa rồi nhân textScales; phiên âm readingFont.monospaced |
| Từ điển · ô từ/ngữ cảnh | Điều khiển nhập từ/ngữ cảnh giữ font role section/body hệ thống, cùng quy tắc control; không đổi sang scale hội thoại |
| Phiên dịch · nguyên bản/bản dịch | readingFont cho cả hai trong Glass; classic kế thừa readingFont của vùng nội dung |
| Thư viện lịch sử · SessionPreview | readingFont cho user/assistant, draft/output và preview từng phần |
| Chat nhanh · QuickSessionPanel | readingFont cho hai vai trò và output; editor readingNSFont (sửa phần transcript) |
| Dịch nhanh · kết quả Glass/classic | readingFont, lineLimit 12 + fixedSize vertical có sẵn, cần kiểm khả năng xem hết câu dài |
| Launcher Chat nhanh · câu hỏi/soạn/trả lời | readingFont / readingNSFont / TranscriptText readingNSFont; đã bỏ font cố định câu hỏi |
| Phụ đề nổi | Nguyên bản Glass readingFont; bản dịch title/heading là vai trò caption chuyên biệt hiện có, chưa nghiệm thu cửa sổ phụ thật |
| Hàng lịch sử hai dòng / Tiếp tục / Thường làm | Metadata/nhãn control Font.vzn, không phải vùng đọc theo readingSizeDescription; lineLimit chủ ý và help tiêu đề. Không có bằng chứng cắt do textSize vì các font này không đổi |

Bong bóng Chat không có height cố định; editor tăng dòng có trần và cuộn. Hàng Tiếp tục/Thường làm
cao compactControl nhưng giữ cỡ control hệ thống. Không nới khung theo phỏng đoán. Context mục từ, heading hai dòng, bản ghép so sánh hai dòng và Dịch nhanh 12 dòng là các giới hạn snippet có sẵn; cần kiểm tay xem mức Lớn có làm mất nội dung cần đọc hay không.
Kiểm tra ba mức cho nội dung dài/CJK vẫn là NOT RUN trên app thật.

## Kiểm tĩnh 640×480 và Reduce Motion

Ngân sách: 640 − rail 68 = **572 pt**; với Glass WorkspaceSurface trừ hai gap 12 còn
548, Chat trừ hai gutter 24 còn 500, Dịch trừ hai (gutter − tight) 20 còn 508.
Header compact bỏ nhãn qua showsLabel; breadcrumb còn leaf; model composer có nhánh iconOnly.

| Khung / hàng | Fixed width / tổng ngân sách | Kết luận tĩnh |
| --- | --- | --- |
| Shell header | navigation control 36; các nút compact 32/36 + gap, divider + trailing inset; breadcrumb co trước | Đã có icon-only; fixture tên trên shell 640. Không sửa bố cục rộng. |
| Sidebar / panel shell | rail 68; overlay 236/compactSidebar; panelWidth min(sidebar+editor, width−2×inset) | Bị chặn bởi container, giữ preference; không đổi min window. |
| Chat composer | 500; hai control 36, cap model/audio, gap/padding; editor linh hoạt, model icon ở narrow | Fixture 572 kiểm mọi NSView descendant maxX. Nhánh draft dài/attachments/stream còn kiểm tay. |
| Hàng ngôn ngữ Dịch | 508; LanguagePill.fixedSize ×2 + swap + ModelPicker và insets | NativeFlow có thể xuống dòng trong cụm; tổng nhãn phụ thuộc VI/EN/JA/model. Chỉ nghi ngờ, giữ nguyên và checklist kiểm tay. |
| Hai pane Dịch | Hai cột chỉ khi ≥reading 760; dưới đó xếp dọc. width half chỉ ở hai cột | Fixture 572 xanh; không chứng minh mọi SwiftUI text frame. |
| Footer nguồn Dịch | icon/audio, counter (co/cắt), Clear, nút Dịch có KeyCap, small gaps/padding | Nhãn locale và số ký tự ảnh hưởng; kiểm tay long counter và trạng thái recording. |
| Footer kết quả Dịch | language.fixedSize, useAsSource ViewThatFits nhãn→icon, Compare.fixedSize, Listen/Reading, Copy + small gaps | Fallback useAsSource có tên; kiểm tay khi Reading dài + kết quả sẵn/so sánh. Chưa có bằng chứng chắc chắn tràn để đổi layout. |
| Panel options/language | sidebar+editor (356), language sidebar+editor; comparison min(maxWidth, …) | Dưới ngân sách 508 ở tối thiểu; test khi panel mở vẫn cần kiểm tay. |
| Settings / Dictionary lists | Settings sidebar chỉ khi ≥reading; lookup list có ViewThatFits giữa hai cột min sidebar+2×large và một cột | Không ép hai cột ở 640; nhãn heading và control vẫn cần kiểm tay. |
| Comparison classic / card | card sidebar 236 trong ScrollView ngang; Glass panel min(maxWidth, reading+compactSidebar) | Cuộn nội bộ theo thiết kế; không đổi hình học. |

Đã rà withAnimation/.animation/.transition trên toàn ViezanNative: sidebar dùng navigationAnimation
nil khi Reduce Motion; composer dùng reduceMotion; các transition opacity của nhãn/sidebar/Chat
kế thừa transaction này. Overlay shell/workspace không có animation dịch chuyển riêng.
Toast bỏ withAnimation khi hệ thống giảm chuyển động, transition chỉ opacity; nghiên cứu,
ngữ cảnh Từ điển và cuộn Launcher cũng dùng nil. Timeline ReadingWave pause và glass interactive
đã tôn trọng Reduce Motion. Không thêm animation mới.

## Checklist kiểm tay

Tất cả ô dưới đây là **NOT RUN**, dành cho người dùng; không có app/screenshot làm bằng chứng.
Ghi máy/macOS, SHA + dirty diff, theme/preset, locale/cỡ chữ, expected/actual và PASS/FAIL.
Lặp EN/VI/JA × Nhỏ/Vừa/Lớn, sáng/tối; thử riêng Increase Contrast, riêng Reduce Transparency,
rồi cả hai. Ở Increase Contrast, mọi vùng kính đặc và border-strong rõ; chữ phụ kiểm 4,5:1.
Dùng 1280 cho header một hàng và 640×480 cho tràn ngang; phục hồi cài đặt sau kiểm.

### Trang chủ

- [ ] VoiceOver đọc đủ tên và trạng thái; icon trang trí không tạo điểm đọc rời.
- [ ] Tab/Shift-Tab, Esc, vòng focus riêng và focus trả về nút mở; thử IME VI/JA.
- [ ] Ba cỡ chữ không cắt nội dung đọc dài; metadata/control giữ cỡ hệ thống.
- [ ] 640×480 không tràn ngang, 1280 header một hàng ở EN/VI/JA.
- [ ] Increase Contrast mặt đặc, viền rõ; lặp với Reduce Transparency.
- [ ] Reduce Motion không trượt/resize có animation hoặc cuộn có animation.

Thử Tiếp tục/Thường làm/đang chạy với tiêu đề dài, không cắt hàng hoặc mất nút; toast Undo đọc một lần và không giành focus.

### AI Chat

- [ ] VoiceOver đọc đủ tên và trạng thái; icon trang trí không tạo điểm đọc rời.
- [ ] Tab/Shift-Tab, Esc, vòng focus riêng và focus trả về nút mở; thử IME VI/JA.
- [ ] Ba cỡ chữ không cắt nội dung đọc dài; metadata/control giữ cỡ hệ thống.
- [ ] 640×480 không tràn ngang, 1280 header một hàng ở EN/VI/JA.
- [ ] Increase Contrast mặt đặc, viền rõ; lặp với Reduce Transparency.
- [ ] Reduce Motion không trượt/resize có animation hoặc cuộn có animation.

Thử chat trống→tin đầu, stream/dừng/lỗi, draft một/nhiều dòng, attachments, model dài; mở +/model/history, chuyển phiên rồi đóng.

### Dịch

- [ ] VoiceOver đọc đủ tên và trạng thái; icon trang trí không tạo điểm đọc rời.
- [ ] Tab/Shift-Tab, Esc, vòng focus riêng và focus trả về nút mở; thử IME VI/JA.
- [ ] Ba cỡ chữ không cắt nội dung đọc dài; metadata/control giữ cỡ hệ thống.
- [ ] 640×480 không tràn ngang, 1280 header một hàng ở EN/VI/JA.
- [ ] Increase Contrast mặt đặc, viền rõ; lặp với Reduce Transparency.
- [ ] Reduce Motion không trượt/resize có animation hoặc cuộn có animation.

Thử cặp ngôn ngữ tên dài + model dài, counter gần giới hạn, kết quả sẵn, nút Dùng làm nguồn, Reading pill đang đọc, so sánh theo câu và bản ghép; nghe trạng thái khi bắt đầu/kết thúc/lỗi, không đọc từng token.

### Từ điển

- [ ] VoiceOver đọc đủ tên và trạng thái; icon trang trí không tạo điểm đọc rời.
- [ ] Tab/Shift-Tab, Esc, vòng focus riêng và focus trả về nút mở; thử IME VI/JA.
- [ ] Ba cỡ chữ không cắt nội dung đọc dài; metadata/control giữ cỡ hệ thống.
- [ ] 640×480 không tràn ngang, 1280 header một hàng ở EN/VI/JA.
- [ ] Increase Contrast mặt đặc, viền rõ; lặp với Reduce Transparency.
- [ ] Reduce Motion không trượt/resize có animation hoặc cuộn có animation.

Thử từ dài/CJK, nghĩa/ví dụ/related/notes dài, context, saved và từng nút loa; focus ở hàng đang chọn vẫn thấy vòng riêng.

### Phiên dịch

- [ ] VoiceOver đọc đủ tên và trạng thái; icon trang trí không tạo điểm đọc rời.
- [ ] Tab/Shift-Tab, Esc, vòng focus riêng và focus trả về nút mở; thử IME VI/JA.
- [ ] Ba cỡ chữ không cắt nội dung đọc dài; metadata/control giữ cỡ hệ thống.
- [ ] 640×480 không tràn ngang, 1280 header một hàng ở EN/VI/JA.
- [ ] Increase Contrast mặt đặc, viền rõ; lặp với Reduce Transparency.
- [ ] Reduce Motion không trượt/resize có animation hoặc cuộn có animation.

Thử nguyên bản dài + bản dịch, hai kiểu bản ghi, history/analyses/export/setup, phụ đề nổi; chỉ đọc câu hoàn tất thay vì mọi token.

### Cài đặt

- [ ] VoiceOver đọc đủ tên và trạng thái; icon trang trí không tạo điểm đọc rời.
- [ ] Tab/Shift-Tab, Esc, vòng focus riêng và focus trả về nút mở; thử IME VI/JA.
- [ ] Ba cỡ chữ không cắt nội dung đọc dài; metadata/control giữ cỡ hệ thống.
- [ ] 640×480 không tràn ngang, 1280 header một hàng ở EN/VI/JA.
- [ ] Increase Contrast mặt đặc, viền rõ; lặp với Reduce Transparency.
- [ ] Reduce Motion không trượt/resize có animation hoặc cuộn có animation.

Thử mục đang chọn bằng Tab, picker mở/đóng, control disabled, kết quả tìm không có; nghe nhãn mục và control riêng.

### Thư viện lịch sử

- [ ] VoiceOver đọc đủ tên và trạng thái; icon trang trí không tạo điểm đọc rời.
- [ ] Tab/Shift-Tab, Esc, vòng focus riêng và focus trả về nút mở; thử IME VI/JA.
- [ ] Ba cỡ chữ không cắt nội dung đọc dài; metadata/control giữ cỡ hệ thống.
- [ ] 640×480 không tràn ngang, 1280 header một hàng ở EN/VI/JA.
- [ ] Increase Contrast mặt đặc, viền rõ; lặp với Reduce Transparency.
- [ ] Reduce Motion không trượt/resize có animation hoặc cuộn có animation.

Nghe mỗi hàng thành một phần tử chứa tiêu đề/dòng phụ/thời gian, trạng thái chọn đúng; preview Chat/Dịch/Từ điển dài, archived/favorite và thao tác Undo.

### Chat nhanh/Dịch nhanh

- [ ] VoiceOver đọc đủ tên và trạng thái; icon trang trí không tạo điểm đọc rời.
- [ ] Tab/Shift-Tab, Esc, vòng focus riêng và focus trả về nút mở; thử IME VI/JA.
- [ ] Ba cỡ chữ không cắt nội dung đọc dài; metadata/control giữ cỡ hệ thống.
- [ ] 640×480 không tràn ngang, 1280 header một hàng ở EN/VI/JA.
- [ ] Increase Contrast mặt đặc, viền rõ; lặp với Reduce Transparency.
- [ ] Reduce Motion không trượt/resize có animation hoặc cuộn có animation.

Thử câu hỏi/answer/draft dài và Dịch nhanh >12 dòng; cửa sổ phụ có kích thước riêng nên kiểm co giãn trong phạm vi app cho phép, không ép NSPanel thành min window chính.

## Còn lại

- Nghiệm thu sống UX07–UX10 theo checklist: VoiceOver thực, Increase Contrast/Reduce Transparency,
  Reduce Motion, độ tương phản 4,5:1, native halo và cửa sổ thật. Build/test fixture không thay thế nghiệm thu này.
- Việc đọc Announcement của toast có lịch sự và không lặp phải nghe bằng VoiceOver; các async khác
  dùng value cập nhật, chưa xây announcement cho từng dịch vụ. Không có runtime acceptance tuyên bố mới.
- Các hàng Dịch phụ thuộc nhãn/model/Reading và nội dung dài chưa có bằng chứng tràn chắc chắn;
  không đoán để sửa layout. AppKit descendants không thấy toàn bộ nội dung SwiftUI thuần.
- Qt chưa có nhánh mặt đặc theo hệ điều hành; không sửa Qt/native helper/scripts trong đợt này.
- Hai test clipboard/attachment có thể đỏ do sandbox; người điều phối chạy lại ngoài sandbox.

## Tự quyết

- Chọn helper thuần + EnvironmentValues để test bốn tổ hợp hệ điều hành và gom một điều kiện.
- Giữ heading mục từ theo cỡ gốc ở Vừa qua overload readingFont(base:), không áp reading size lên control/metadata.
- Dùng isSelected cho trigger lớp nổi vì yêu cầu cho phép; native ShellToolbarButton giữ accessibilityExpanded.
- Không thêm hint hoặc chuỗi khi tên hiện có đã nói hành động; không tạo hệ thống thông báo async mới.
- Fixture shell dùng NSWindow offscreen không show, theo mẫu LiquidGlassShellTests. Chat/Dịch dùng NSHostingView trực tiếp;
  không gọi makeKeyAndOrderFront, không capture. Có thể dựng Dịch bằng TranslationWorkspace nên không bỏ test Dịch.
- Trong sandbox, đổi CLANG_MODULE_CACHE_PATH về ModuleCache có sẵn và --disable-sandbox chỉ tắt sandbox con SwiftPM;
  không vượt sandbox phiên hoặc tạo thư mục build khác. Các lệnh H nguyên bản cũng được ghi kết quả.

## Kiểm tra

Không có chuỗi mới: `npm run resources` **NOT RUN** theo điều kiện H. Tài nguyên sinh không đổi.
Hai lệnh Swift nguyên bản bị chặn trước khi biên dịch source/test (exit 1), dòng lỗi nguyên văn:

```text
swift build --package-path apps/macos
<unknown>:0: error: error opening '/Users/phamtrunghieu/.cache/clang/ModuleCache/Swift-18Y2CYADWFGX0.swiftmodule' for output: /Users/phamtrunghieu/.cache/clang/ModuleCache: Operation not permitted
<unknown>:0: error: unable to load standard library for target 'arm64-apple-macosx14.0'
swift test --package-path apps/macos
<unknown>:0: error: error opening '/Users/phamtrunghieu/.cache/clang/ModuleCache/Swift-18Y2CYADWFGX0.swiftmodule' for output: /Users/phamtrunghieu/.cache/clang/ModuleCache: Operation not permitted
<unknown>:0: error: unable to load standard library for target 'arm64-apple-macosx14.0'
```

Đã chạy lại với `CLANG_MODULE_CACHE_PATH="$PWD/apps/macos/.build/index-build/arm64-apple-macosx/debug/ModuleCache"`
và `--disable-sandbox` (sandbox con SwiftPM). Cache này đã có trước; `.build/out` được SwiftPM dùng lại.
Lượt cuối trên cây mã sau chỉnh sửa, dòng tổng kết nguyên văn:

```text
npm run check:resources
Native resources verified: 3 locales, 78 metrics.
swift build --disable-sandbox --package-path apps/macos
Build complete! (4,00 giây)
swift test --disable-sandbox --package-path apps/macos
✔ Suite AccessibilityTests passed after 1.154 seconds.
✘ Test run with 53 tests in 8 suites failed after 19.937 seconds with 4 issues.
✘ Test run with 98 tests in 0 suites failed after 0.203 seconds with 1 issue.
npm run check:docs
Native documentation references version 2.4.2; runtime acceptance is separate.
```

`swift build`, tài nguyên và docs exit 0; `swift test` exit 1: **đỏ do sandbox, người điều phối sẽ chạy lại**.
Chỉ hai test đã được cảnh báo đỏ: `composerPasteHandsImagesToTheIntakeInsteadOfTheText` (4 issues)
và `pastedImageBytesIngestLikeAFileAndRejectNonImages` (1 issue). Không sửa hai test này.
Các test khác xanh; 4 test mới trong AccessibilityTests xanh (gồm 3 locale và 2 feature cases).
Test navigationPaneKeepsControlsAndSavedStateAcrossCollapseAndResize xanh ở lượt cuối.
Lượt focused trước đó: `✔ Test run with 4 tests in 2 suites passed after 1.097 seconds.`

`git diff --check` exit 0. Chưa chạy app, không chụp ảnh; không export evidence qua biến môi trường
capture. VoiceOver, contrast thật, cửa sổ thật, IME và nghiệm thu người dùng: **NOT RUN theo yêu cầu**.

