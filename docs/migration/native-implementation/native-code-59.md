# Native code 59 — AI Chat: trạng thái trống và composer (2026-11-02)

Theo bốn ý của người dùng sau khi review bản dev-09 (composer giữa màn khi chưa có phiên, một dòng nở
tối đa năm dòng, gợi ý dưới composer, gửi xong composer xuống đáy) và nhận xét khung chat có bóng.
Artboard mới "AI Chat · trống · 1400" trên canvas Quiet Workbench (bản 12); quyết định ghi ở
[direction.md](../../design/direction.md) mục "AI Chat: trạng thái trống và composer". Theo yêu cầu,
không chạy QA chụp màn hình; người dùng review tay.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| Composer (`ChatWorkspace`) | Bỏ `.shadow`; viền `border`, khi editor có focus đổi `border-strong` (`ComposerEditor.onFocus`). Một hàng khi bản nháp một dòng và không có ảnh: [+] · editor · model · mic · Gửi; từ hai dòng (`onLines`) hoặc có ảnh: editor trên, hàng nút dưới. `submitOnReturn: true` (Enter gửi, Shift+Enter xuống dòng, ⌘↩ vẫn gửi). |
| `ComposerEditor` | `maxLines`, `onLines`, `onFocus`; `fit(measured:lineHeight:insetHeight:maxLines:)` tính chiều cao: tối thiểu một `control`, tối đa `maxLines × lineHeight` rồi cuộn trong. Token mới `--vzn-composer-max-lines: 5` → `composerMaxLines`. |
| Trạng thái trống | `starting` = chưa có tin nhắn và không có việc chạy: logo 28 pt, "Chúng ta bắt đầu từ đâu?" (`chatStart`), composer, danh sách "Tiếp tục" (`continueRecent`): ba phiên gần nhất của mọi tính năng (trừ phiên hiện tại, phiên so sánh, lưu trữ), bấm → `store.select` rồi `.viezanOpenRoute`. Ba `Spacer` (một trên, hai dưới) đặt cụm ở ~40 %. Bỏ `ContentUnavailableView` cũ. |
| Chuyển động | `.animation(easeOut durationNormal, value: starting)` trên cột: gửi tin đầu, composer trượt xuống đáy, bản ghi mờ dần vào; Reduce Motion tắt. |
| Chuỗi | `chatStart`, `continueRecent` VI/EN/JA. |
| Test | `composerReturnSendsAndShiftReturnKeepsTyping` (Enter/Shift+Enter/⌘↩/tắt cờ), `composerGrowsToFiveLinesThenCaps` (1, 3, 8 dòng với trần 5). |

## Vòng 2 — sau khi người dùng loại bản dev-10

| Nhận xét từ ảnh | Sửa |
| --- | --- |
| Vạch dọc giữa ô chữ và model. | Thanh cuộn của `NSScrollView` vẽ cả khi không cần: `autohidesScrollers = true`. |
| Nút Gửi bị bóp thành "…". | Cụm nút phải `fixedSize()`; chỉ editor co giãn. Một hàng: Gửi là icon vuông 36 (`arrow.up`, accessibility label "Gửi"), Dừng cũng icon; hai tầng vẫn Gửi có chữ. |
| Nhãn model to bằng chữ nhập. | `ModelPicker(dense:)`: `smallScale`, màu `text-muted` ở chế độ một hàng. |
| Logo lẻ loi. | Logo `brand` 32 pt, cụm tiêu đề cách composer thêm `small`. |
| "+" ô xám. | Là trạng thái hover của nút lặng lúc chụp; không đổi. |

## Vòng 3 — dòng chữ lệch lên trong composer một hàng

`NSTextView` căn chữ sát mép trên (inset 0) trong khi ô cao một `control`, nên chữ và placeholder nằm
cao hơn các nút ~9 pt. Editor có trần dòng (`maxLines`) giờ đặt `textContainerInset` dọc =
`(control + tight − lineHeight) / 2` (`ComposerEditor.verticalInset(for:)`), nên một dòng nằm đúng giữa
40 pt và mỗi dòng thêm đúng một `lineHeight`; `fit` bỏ phần `small` cho editor có trần; placeholder nhận
`leadingInset`/`topInset` trùng caret; hàng ngoài căn `.center`. Editor không trần (Dịch, panel) giữ
nguyên. Test `composerGrowsToFiveLinesThenCaps` thêm kiểm tra căn giữa và nhánh cũ.

## Còn lại

Gợi ý tầng 2 (hành động lặp ≥ 3 lần trong 30 ngày, suy giảm theo thời gian) và tầng 3 (giờ trong
ngày); menu "+" có mô tả từng chế độ; mức nỗ lực suy luận nhiều bậc. Chưa kiểm chứng bằng mắt: cụm giữa
màn ở 640 pt và cỡ chữ lớn, chuyển động khi gửi tin đầu, Dịch/Từ điển (không đổi vì không dùng
`maxLines`).

## Kiểm tra

`swift build` PASS; `swift test` 37 + 46 PASS; `generate-resources --check` (3 locale, 53 metric),
`native.json` hai bản giống nhau; `documentation.mjs` PASS.
