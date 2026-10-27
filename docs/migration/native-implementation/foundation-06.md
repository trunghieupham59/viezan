# Foundation 06 — kiểm tra macOS tiếp nối

Ngày 2026-10-27. Chỉ foundation, chưa làm Trang chủ. Cùng dirty checkout với
[Foundation 05](foundation-05.md), không commit/push/install dependency.
Host macOS arm64, SDK macOS 27.0; SwiftUI/AppKit và Qt Quick chạy trên cùng host.

## Thay đổi

- Qt `ShellButton` lấy `palette.buttonText`; command delegate lấy `text` hoặc
  `highlightedText`. Trước sửa, SVG toolbar và command palette gần như mất trên
  nền tối. Đã build lại, relaunch và nhìn lại ảnh thật sau sửa.
- Thêm `FoundationRuntimeTests.swift`: mounted SwiftUI giữ draft/task qua resize
  và overlay; load failure khóa hành động; save retry giữ draft; marked text chặn
  submit/search commands; Close giữ task; Quit hủy khi lưu lỗi, retry lưu được
  interruption và restore không tự chạy provider.
- Thêm Qt mounted-shell tests cho preedit/commit `QInputMethodEvent`, Return/Escape,
  độc quyền navigation/commands, resize đóng compact overlay, load failure giữ
  file hỏng và vẫn mở được Settings.

## Kết quả đã thực hiện

| Kiểm tra | Kết quả và phạm vi |
| --- | --- |
| Swift build/test | PASS: 17 domain + 10 AppKit/SwiftUI = 27 tests, gồm một test render 144 tổ hợp |
| Qt build/CTest | PASS: 51 scenarios + init/cleanup = 53 passes, không fail/skip |
| Shared Node contract | PASS 10 tests |
| Atomic / Design | PASS; thay đổi QML dùng palette semantic, không thêm literal design value |
| docs:sync / docs:review / check:docs / test:docs | PASS; 13 documentation tests; đọc toàn bộ README, prose vẫn đúng với preview chưa nghiệm thu |
| CUA Qt dark toolbar/palette | PASS sau relaunch binary mới; icon sáng, hàng selected dùng màu tương phản |
| CUA system appearance live | PASS cả hai: system dark → Auto (sáng tại thời điểm thử), không relaunch |
| CUA Reduce Transparency | PASS Swift sidebar/palette chuyển sang nền đục; Qt popup vẫn đục, đọc được |
| CUA Reduce Motion | Smoke PASS: bật rồi mở history/Escape trên cả hai; không phải đo frame/timing animation |
| CUA outside dismiss | Qt command palette đóng khi click ngoài |
| VoiceOver | Đã bật, thử VO-Right trên bảng lệnh rồi tắt; không đủ bằng chứng speech/cursor để chứng nhận thứ tự đọc |
| Bộ gõ hệ thống | Chưa PASS: host có Japanese–Romaji và Australia. Shortcut đúng theo Settings nhưng automation chỉ nhập Latin; SystemUIServer timeout -10005 |

Lệnh chính:

```bash
# Chạy trong môi trường cho phép SwiftPM sandbox/compiler cache.
env VIEZAN_NATIVE_TEST_EVIDENCE=/tmp/viezan-foundation06-matrix \
  CLANG_MODULE_CACHE_PATH=/tmp/viezan-native-clang-cache \
  SWIFT_MODULECACHE_PATH=/tmp/viezan-native-swift-module-cache \
  SWIFTPM_MODULECACHE_OVERRIDE=/tmp/viezan-native-swift-module-cache \
  swift test --package-path apps/macos \
  --scratch-path /tmp/viezan-native-swift-build \
  --cache-path /tmp/viezan-native-swift-cache \
  --config-path /tmp/viezan-native-swift-config \
  --security-path /tmp/viezan-native-swift-security
cmake --build apps/desktop-qt/build --parallel 4
ctest --test-dir apps/desktop-qt/build --output-on-failure --timeout 120
node --test scripts/native/__tests__/domain.test.mjs
npm run check:atomic
npm run check:design
npm run docs:sync
npm run check:docs
npm run test:docs
```

Không chạy lại Electron build/full Vitest/web: lượt này chỉ sửa QML và native
unit/runtime tests; không đổi Electron/React/TypeScript. Các checks đó không được
suy ra từ kết quả native. Biome không hỗ trợ Swift/C++/QML.

## Ma trận render và bằng chứng

Ảnh và log: [evidence/foundation-06](evidence/foundation-06/).

- [System live comparison](evidence/foundation-06/system-live-comparison.jpg):
  ảnh cửa sổ thật, cả hai app cập nhật dark/Auto.
- [Qt dark commands](evidence/foundation-06/qt-dark-commands.jpg): bản đã sửa icon.
- [Swift Reduce Transparency](evidence/foundation-06/swift-reduce-transparency.jpg):
  nền đục trên cửa sổ thật.
- `fixture-{vi,en,ja}-{light,dark}.jpg`: 6 contact sheets, mỗi sheet 4 widths ×
  6 states (chat, commands, history, activity, settings, translate), large text,
  chiều cao 480. Test tạo đủ 144 PNG; kích thước pixel đều khớp 2× point size.
- [Manifest](evidence/foundation-06/fixture-manifest.json) ghi kích thước/hash;
  raw PNG tái tạo bằng lệnh trên, hiện ở `/tmp/viezan-foundation06-matrix`.
  Ba PNG 640px được giữ trong evidence để xem chi tiết.

Fixture là `NSHostingView` thật trong cửa sổ ẩn của test, không có native toolbar.
Lượt lưu cuối chạy khi Reduce Transparency bật. Chúng chứng minh render/layout
nội dung; không chứng nhận Liquid Glass, window controls hay tất cả tương tác.
Khi transparency bật bình thường, offscreen cache không tái hiện đúng glass;
không lấy ảnh đó làm pass. CUA resize bị kẹt ở kích thước phóng lớn; đã bỏ các
capture đặt tên width sai, không dùng chúng để khai đủ visual window matrix.

## Khôi phục môi trường

Đã có phê duyệt người dùng trước kiểm thử trợ năng/nguồn nhập.

| Tuỳ chọn | Ban đầu | Sau thử, xác minh trong UI |
| --- | --- | --- |
| System appearance | Auto | Auto |
| Reduce Transparency | Off | Off |
| Reduce Motion | Off | Off |
| VoiceOver | Off | Off |
| Qt app theme | System | System |
| Input source list | Japanese–Romaji + Australia | Không thêm/xóa nguồn; không sửa shortcut |

Các phím chuyển nguồn được thử theo cặp; không quan sát được thay đổi sang
composition Nhật. Không khẳng định đã nghiệm thu IME thật từ chuỗi Latin hay
unit tests marked text. Không sửa dữ liệu Electron hoặc provider thật.

## Còn lại trước khi đóng gate macOS

1. Visual window matrix thật ở 640/820/1200/1440, gồm toolbar/window controls,
   compact navigation và mọi đường focus/dismiss. Render fixture chưa thay thế.
2. Bộ gõ VI/JA thật: candidate/commit, Return/Escape khi composing trong composer,
   command/history search; cần tương tác nguồn nhập hoạt động hoặc người dùng
   thao tác nguồn nhập trực tiếp trong lúc nghiệm thu.
3. VoiceOver traversal/announcement thực tế; ảnh AX và việc bật VoiceOver chưa
   chứng minh thứ tự đọc hoặc focus trap.
4. Hoàn thiện visual failure-state matrix (banner/retry/disabled tại từng width),
   và close/reopen khi stream chạy bằng CUA; domain/AppDelegate tests đã pass.

Windows/Linux là gate riêng. Foundation vẫn IN PROGRESS, không mở Trang chủ.
