# Liquid Glass 2.0 · Đợt 1 — tokens và shell (macOS)

Ngày 2026-11-03 · nhánh `develop` (gốc `682a43f` + gói bàn giao `docs/design/glass2/`) ·
chưa commit. Nguồn: [HANDOFF.md](../../design/glass2/HANDOFF.md) mục 2–4 và mục 5 "Shell";
board Foundations, Sidebar, Home, Translate-Compact, Chat-Dark.

## Kiểm tra trước

- `git status` chỉ có thay đổi của gói bàn giao (2 × `native.json`, `direction.md`,
  `findings.md`, `tokens.css`, `docs/design/glass2/`).
- `swift test` xanh trước khi sửa (49 test native + 60 test domain).

## Đã làm

| Phần | Thay đổi | File |
| --- | --- | --- |
| Token → native | Generator tách `--vzn-app-backdrop` thành 4 điểm màu lấy mẫu ở cùng vị trí (0 / 0,36 / 0,68 / 1) + 2 quầng, `--vzn-action-fill` thành hai đầu, màu bóng `sm/md/lg`; hình học nền và bóng thành metric. Preset không có gradient rơi về `app-bg` / `action`. `tokens.css` không đổi. | `scripts/native/generate-resources.mjs`, 2 × `native.json` (đã được duyệt sửa) |
| Màu Glass tối | Glass tối đọc palette Glass của chính nó (trước đây mượn Graphite). | `NativeFoundation.swift` |
| Nền cửa sổ `.win` | `AppBackdrop`: gradient 150° + quầng kem trên-trái, quầng thép dưới-phải, sáng và tối. | `NativeFoundation.swift`, `ViezanApp.swift` |
| Sidebar `.pane` | Pane kính lề trái 8, bắt đầu dưới hàng 48, rộng 236 / rail 68 / overlay 208, bo 22, viền sáng + highlight trong, bóng 18/48 chỉ bên ngoài. macOS 26+: `NSGlassEffectView` trong cửa sổ (không còn nhìn xuyên desktop). Reduce Transparency / Increase Contrast: mặt đặc, viền rõ. | `NativeFoundation.swift`, `ViezanApp.swift` |
| Mục chọn `.lens` | Lens sáng (chrome-item-active, viền sáng, bóng thấp), hover phẳng 45 %, icon màu nhấn, chữ semibold; hàng bo 12, rail rộng 40. Logo + "Viezan" 15; ô "Tìm" là capsule lõm với KeyCap ⌘K; rail là nút tròn kính 32. Nhãn nhóm 11 semibold; chân: "Đang chạy nền" + vạch + "Lịch sử lưu trên thiết bị". | `NativeFoundation.swift` |
| Header | Không còn dải nền; breadcrumb tại mép mặt đọc + 16 (x = 272), khi rail lùi sau nút thu gọn 12 pt (x = 140); cha mờ / trang hiện tại đậm, tách cả tiêu đề tính năng. Pill kính 32, chữ 13 medium; "Tạo mới" là tint (chữ nhấn, không tô nền); vạch ngăn 18 trước "Hoạt động" (thêm ở trang hệ thống); badge số việc chạy. | `ViezanApp.swift`, `NativeFoundation.swift` |
| Mặt đọc `.content` | Một pane trắng ấm 82 % (tối 80 %), bo 22, lề 12 / 12 / đáy 8 / đỉnh 8, viền sáng, bóng chỉ bên ngoài; áp dụng cả chế độ tối. | `NativeKit.swift` |
| Style chung | `.vznPrimary` gradient nhấn chữ trắng + bóng nhấn; `.vznOutline` pill kính; `.vznQuiet` trong suốt, hover thành kính; pill 32 / 36. `FilterTabs` = rãnh lõm 6 % + lens, cao 32. `SearchBox`/ô nhập = `.field` (trắng 62 %, hairline, đậm khi gõ, không vòng nhấn). `CardSection`/`CardRow` = thẻ phẳng hairline bo 16, hàng ≥ 48, vạch ấm. `KeyCap` 20 pt mono 11. `StatusBadge` chip 24, sẵn sàng = success. `NativePanel` (`ReadingPanelSurface`) = `.float` trắng 88 % trên blur, bo 20, bóng 24/64. | `NativeKit.swift`, `InsetInputSurface.swift`, `NativeFoundation.swift` |

Các preset Graphite / Paper / Corporate / Midnight giữ nguyên nhánh cũ. Không đổi
hành vi, dữ liệu, dịch vụ, route, phím tắt hay chuỗi; không thêm chuỗi mới.

Test được duyệt sửa theo số đo mới: `LiquidGlassShellTests` (pane kết thúc ở
sidebar/rail/compactSidebar + small, một id `navigation-glass-material` cho hai chế
độ, vẫn kiểm không đè nút cửa sổ, không bắt chuột, giữ trạng thái khi resize) và
`InterpretationLayoutTests` (bộ lọc 640 pt cao một `compactControl`).

## Kiểm chứng

```
$ npm run check:resources
Native resources verified: 3 locales, 77 metrics.
$ node --test scripts/native/__tests__/generate-resources.test.mjs
ℹ tests 2 · pass 2 · fail 0
$ swift build            (apps/macos)
Build complete! (4,48 giây)
$ swift test             (apps/macos)
✔ Test run with 49 tests in 7 suites passed after 19.164 seconds.
✔ Test run with 60 tests in 0 suites passed after 0.085 seconds.
```

Hai `native.json` giống hệt nhau (`cmp`).

## Nghiệm thu bằng ảnh

Bản dev `.native-build/dev/Viezan.app`, macOS (Darwin 27.2), dữ liệu thật của máy;
chế độ được đổi Sáng → Tối trong Cài đặt rồi trả lại Sáng. Ảnh ở
[`glass2-dot1/`](glass2-dot1/) (50 %):

- `compare-home-1280-light.png` — board Home | app 1280×800 sáng.
- `compare-translate-820-light.png` — board Translate-Compact | app 820×640 (rail).
- `compare-chat-1280-dark.png` — board Chat-Dark | app 1280×800 tối.
- `app-{light,dark}-{1280,820}-*.png` — Trang chủ, AI Chat, Dịch ở cả hai cỡ và hai chế độ.

Shell (nền, sidebar, header, mặt đọc) khớp board ở vị trí: pane 8…244 / 8…76,
mặt đọc từ x = 256 / 88, đỉnh 56, lề phải 12, đáy 8, breadcrumb 272 / 140.

## Chênh lệch còn lại

| Chênh lệch | Lý do |
| --- | --- |
| Nội dung Trang chủ (thẻ bao lưới, thẻ model bên phải), composer, transcript, hàng ngôn ngữ Dịch còn bố cục cũ. | Ngoài phạm vi Đợt 1 ("chưa sửa nội dung từng màn"); Đợt 2–3. |
| Hàng điều hướng cao 32 thay vì 34; bước hàng vẫn 36 như board. | Không có token 34; giữ `compactControl` + `tight`. |
| Khoảng breadcrumb 8 thay vì 6; đệm pane sidebar 12 thay vì 10. | Không có token 6 / 10; dùng `small` / `gap`. |
| Nút thu gọn 36 có tint nhấn khi cột mở; board vẽ ô kính 30×28 trơn. | Handoff giữ nguyên vị trí / hình nút thu gọn; trạng thái mở là hành vi đã chốt trong direction.md. |
| Màu đỏ nguy hiểm là `#DC2626` (tối `#FB7185`), không phải `#C4473F`. | Preset glass trong `tokens.css` không khai báo `--vzn-danger`; token thắng. |
| Fill pane sidebar 42 → 40 % thay vì 52 → 30 %; viền thẻ / ô nhập 8 % thay vì 10 %. | Theo token (`primary-nav-material`, `sidebar-bg`, `border`). |
| Bóng mặt đọc 8 % thay vì 10 %. | Token chỉ có màu bóng `sm` (8 %) và `md` (14 %); chọn mức gần hơn. |
| Nút chính bị vô hiệu là kính trung tính, board vẽ nút nhấn mờ 45 %. | `ui-ux.md`: disabled dùng dáng trung tính của toolkit. |
| Blur 30 của mặt đọc không vẽ riêng. | Mặt đọc nằm trên nền gradient mịn nên blur không thấy được; tránh chi phí và rủi ro cho văn bản. |
| Badge Hoạt động chưa chụp được ở trạng thái có việc chạy. | Không có tác vụ chạy lúc chụp; không tạo việc giả trên dữ liệu thật. |

## Chưa kiểm

- VoiceOver, ba cỡ chữ, EN/JA, 640×480, Reduce Transparency / Increase Contrast
  trong app đang chạy (chỉ kiểm qua code path và test fixture).
- Qt: chỉ nhận thêm khoá trong `native.json`; không chạy QtTest (Đợt 7).

Ghi chú vận hành: để chụp, app dev đang chạy được thoát êm rồi dựng lại; route cuối
được để ở Trang chủ, cửa sổ 1280×800.
