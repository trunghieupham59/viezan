# Qt backend B1/B2 — gỡ ứng dụng và mặt đặc

Ngày yêu cầu: 2026-11-08. Worktree `D:/PPP/viezan-wt-backend`, branch
`feat/qt-backend-uninstall-solid`, tách từ `develop`. Không truy cập/sửa checkout
`D:/PPP/viezan`; không commit/push, không mở app thật.

## Phạm vi và nguồn

- B1: `apps/desktop-qt/AppUninstall.{h,cpp}` và `AppUninstallPlatform.cpp`.
- B2: `apps/desktop-qt/SystemAppearance.{h,cpp}`.
- Nối tối thiểu: hai context property trong `main.cpp`, thêm nguồn vào
  `ViezanNativeQt`, `ViezanQtTests` và target nhỏ `ViezanBackendTests` trong CMake.
- Test: `apps/desktop-qt/tests/BackendServicesTests.cpp`, QCoreApplication riêng,
  organization `ViezanBackendTests`, application `ViezanBackendUninstallSolidTests`.
- Tài liệu: README, spec Apps, WINDOWS-HANDOFF W3/W5/#34 và báo cáo này.
- Không sửa QML màn hình, token, locale, phiên bản hoặc lockfile.

Đã dùng AGENTS.md, CONTRIBUTING.md/Verification,
`docs/agents/agent/CAPABILITY_CONTRACT.md`, agent/workflow/rule `native-migration`,
skill `viezan-native-migration/SKILL.md`, rule `viezan-product-engineering`,
workflow `sync-docs` và skill JSON `viezan-doc-sync` trong phạm vi tài liệu liên
quan. Đã đọc skill `viezan-native-ux`, `.claude/rules/ui-ux.md`, spec Apps và
WINDOWS-HANDOFF mục 4/W3/W5; không thực hiện thiết kế/review hình ảnh trong lượt
dịch vụ này. Architecture/acceptance/workbench-ux phân biệt build với nghiệm thu.

## API cho QML W3

Context **`appUninstall`**:

| API | Hợp đồng |
| --- | --- |
| `inventory() -> bool` | Bắt đầu quét bất đồng bộ; false nếu đang bận. Không tự quét khi khởi tạo. |
| `uninstall(id, authorizeSystem=false) -> bool` | true = đã nhận công việc; không phải đã gỡ. ID phải thuộc lần quét; không nhận đường dẫn/lệnh từ QML. |
| `apps` | Danh sách QVariantMap, NOTIFY `changed`. |
| `busy`, `inventoryComplete`, `errors` | Trạng thái quét/thao tác; kho chưa đầy đủ khóa gỡ. |
| `lastResult` | Kết quả gần nhất, NOTIFY `changed`. |
| `operationUnverified` | Khóa gỡ tiếp trong phiên nếu không xác nhận được tiến trình đã kết thúc; vẫn cho quét. |
| `finished(result)` | Hoàn thành quét/thao tác hoặc trả lý do từ chối; QML dịch status, không hiển thị mã thô. |

Mỗi hàng có `id` (SHA-256 của nguồn/khóa định danh), `source`, `name`,
`canUninstall`, `canUndo`, `undoKind`, `requiresAuthorization`, `action`.
Metadata tùy nguồn: `version`, `publisher`, `installLocation`, `estimatedBytes`,
`scope`, `package`, `reason`, `settingsUrl`. Không expose chuỗi lệnh gỡ ra QML.
`source`: `registry | msix | flatpak | snap | deb | rpm | appimage`.

QML W3 cần xác nhận hành động không hoàn tác trước `uninstall`; với gói Linux
toàn hệ thống chỉ truyền `authorizeSystem=true` sau đồng ý rõ ràng. Nếu chưa đồng
ý, kết quả `authorizationRequired` và không chạy lệnh. Polkit vẫn có quyền từ
chối. Không có API tăng quyền hoặc thử lại tự động.

Store/MSIX có `canUninstall=false`, `action=openSettings`, URI cố định
`ms-settings:appsfeatures`; gọi `uninstall` cũng chỉ trả hành động này, không
chạy uninstaller hay tự mở Settings. QML mở URI khi người dùng chọn.

Kết quả gỡ có `id`, `status`, `verifiedRemoved`, và nếu đã chạy có `started`,
`processFinished`, `exitCode`, `inventoryComplete`. Status gồm:

- `removed`: tiến trình xác nhận thành công và kho đầy đủ xác nhận mục đã mất.
- `stillInstalled`: tiến trình trả 0 nhưng mục/gói còn trong phạm vi kiểm.
- `unverified`: tiến trình chưa xác nhận kết thúc hoặc quét/xác minh thất bại.
- `restartRequired`: MSI trả 3010/1641; không suy thành đã gỡ.
- `cancelled`, `startFailed`, `failed`: hủy/không mở được/lỗi tiến trình.
- `staleInventory`, `inventoryIncomplete`, `notAllowed`, `authorizationRequired`,
  `operationUnverified`: từ chối thực thi; UI hướng người dùng kiểm tra/quét lại.
- Quét dùng `scanned` hoặc `inventoryIncomplete`; Store dùng `openSettings`.

Windows EXE giữ UI nhà cung cấp, ShellExecuteEx dùng verb mặc định, không `runas`.
MSI luôn chuyển sang `/x {GUID}`, bỏ tham số quiet từ đăng ký MSI. EXE dùng
`UninstallString`, không dùng `QuietUninstallString`. Từ chối lệnh mơ hồ, đường
dẫn tương đối, non-EXE. Registry HKLM dùng view 64/32 (WOW6432Node), HKCU một view;
lọc SystemComponent, ParentKeyName, update/hotfix. Registry chỉ mở KEY_READ.

Linux: Flatpak user/system mặc định; Snap; gói sở hữu desktop qua dpkg/rpm;
AppImage Exec tuyệt đối, trực tiếp. Package manager chỉ nhận argv riêng, không
shell. Flatpak user không pkexec; nguồn toàn hệ thống dùng pkexec với executable
trong thư mục công cụ OS cố định. apt-get/dnf remove, không purge hoặc gọi bước
autoremove riêng. Kiểm trạng thái dpkg/rpm sau gỡ, kể cả launcher đã biến mất.

AppImage kiểm metadata trước gỡ và ngay trước moveToTrash; từ chối symlink hoặc
đường dẫn qua symlink. Chỉ tệp đã chọn vào Thùng rác, giữ launcher và dữ liệu.
`canUndo=true`, `undoKind=systemTrash` nghĩa là khôi phục bằng Thùng rác hệ điều
hành; chưa có API/nút Undo hoặc nhật ký bền vững trong Viezan Qt. Kết quả chuyển
Thùng rác cũng có `canUndo`/`undoKind`. Mọi nguồn gói khác không có Hoàn tác.

## API cho QML W5 / #34

Context **`systemAppearance`**:

- `reduceTransparency` / `reduceTransparencyChanged`: Windows đọc
  HKCU `Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`,
  `EnableTransparency == 0`.
- `highContrast` / `highContrastChanged`: Windows `SPI_GETHIGHCONTRAST`,
  `HCF_HIGHCONTRASTON`; Linux thử gsettings
  `org.gnome.desktop.a11y.interface high-contrast`.
- Hai cờ độc lập. W5 chọn mặt đặc khi
  `systemAppearance.reduceTransparency || systemAppearance.highContrast`.
- `refresh()` bất đồng bộ; đọc lần đầu và khi kích hoạt app/thay trạng thái
  ứng dụng/theme/palette. Gộp yêu cầu đến trong lúc đang đọc; chỉ NOTIFY khi đổi.
- Không đọc được hoặc nền tảng không có API thì false. Linux chưa có nguồn
  reduce-transparency phổ quát; cờ này false. Không ghi cài đặt hệ thống.

## An toàn và kiểm thử

`Dependencies` tiêm toàn bộ registry, desktop inventory, tool resolver, runner,
AppImage metadata và trash. Test khởi tạo bằng dependency giả đầy đủ, không dùng
constructor native; appearance dùng Reader giả. Không gọi thật registry,
uninstaller, pkexec, apt, dnf, flatpak, snap, gsettings hoặc moveToTrash để kiểm.
Không sửa credential store hay dữ liệu cá nhân.

Chỉ một thao tác mỗi service. Quét lại trước khi chạy và so toàn bộ action với
lựa chọn; thay command/metadata sẽ bị từ chối. Quét lại sau thao tác, không suy
thành công chỉ từ việc đã khởi chạy. Process Windows chờ tối đa 15 phút, không
kill installer khi quá hạn; trạng thái chưa xác minh khóa gỡ tiếp trong phiên.
Query tiến trình read-only giới hạn 15 giây/8 MiB; thao tác package manager chờ
kết thúc tự nhiên, không kill transaction giữa chừng. Shutdown có thể phải chờ
transaction; chưa có nút hủy trong API này.

Test bao phủ lọc metadata, quoted/unquoted/invalid commands, MSI, ID ổn định,
UAC hủy, lỗi start, reboot, process còn chạy, registry đổi/kho thiếu, Flatpak hai
scope/ref đầy đủ và rút gọn, Snap rỗng, thiếu pkexec, dpkg/rpm ownership và trạng
thái cài đặt, AppImage đổi/từ chối/trash lỗi, busy/consent/Store, NOTIFY/activation.

## Kiểm chứng

Toolchain: Windows 11, Qt 6.8.3 `D:/Qt/6.8.3/msvc2022_64`, VS 17 2022,
MSVC 19.44, Release x64. Build riêng `.native-build/qt` trong worktree.

```powershell
cmake -S apps/desktop-qt -B .native-build/qt -G 'Visual Studio 17 2022' -A x64 -DCMAKE_PREFIX_PATH=D:/Qt/6.8.3/msvc2022_64 -DBUILD_TESTING=ON -DCMAKE_BUILD_TYPE=Release
$env:MSBUILDDISABLENODEREUSE = '1'
cmake --build .native-build/qt --config Release --target ViezanBackendTests ViezanNativeQt ViezanQtTests --parallel 1 -- /nodeReuse:false
$env:PATH = 'D:\Qt\6.8.3\msvc2022_64\bin;' + $env:PATH
ctest --test-dir .native-build/qt -C Release -R '^native-qt-backend$' --output-on-failure
```

Build cả ba target: PASS, lệnh trả exit 0. Trích nguyên văn:

```text
ViezanBackendTests.vcxproj -> D:\PPP\viezan-wt-backend\.native-build\qt\Release\ViezanBackendTests.exe
ViezanNativeQt.vcxproj -> D:\PPP\viezan-wt-backend\.native-build\qt\Release\ViezanNativeQt.exe
ViezanQtTests.vcxproj -> D:\PPP\viezan-wt-backend\.native-build\qt\Release\ViezanQtTests.exe
Build succeeded.
    0 Warning(s)
    0 Error(s)
```

Lượt build đầu sửa lỗi ép DWORD sang QVariant; lỗi MSBuild tạo/ghi thư mục tlog
được giải quyết bằng tạo thư mục trung gian trong build của worktree và dùng
`--parallel 1 /nodeReuse:false`. Không sửa quyền hệ thống hoặc tiến trình phiên
khác. VS multi-config báo `CMAKE_BUILD_TYPE` không dùng; cấu hình thực là Release.

QtTest nguyên văn sau sửa C++/test cuối:

```text
Totals: 36 passed, 0 failed, 0 skipped, 0 blacklisted, 566ms
100% tests passed, 0 tests failed out of 1
Total Test time (real) =   0.69 sec
```

Các gate khác:

```text
Native documentation references version 2.4.2; runtime acceptance is separate.
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
Ran 7 tests in 0.000s
OK (skipped=7)
Error: Stale native resources: apps/macos/Sources/ViezanDomain/Resources/native.json
```

- `npm run check:docs`: PASS. `node --test scripts/native/__tests__/domain.test.mjs`:
  PASS 11/11. Python unittest: 7 skipped trên Windows, không tính là nghiệm thu.
- `npm run check:resources`: FAIL vì native.json trong checkout dùng CRLF, còn
  generator so byte với LF. `git diff --exit-code` xác nhận input/bundle không
  đổi so với HEAD. Chẩn đoán riêng `.native-build/qt/check-resources-eol.mjs` chỉ
  chuẩn hóa CRLF trong bộ nhớ trước so sánh: `Native resources verified: 3 locales,
  78 metrics.` Nội dung sinh và hai bundle khớp sau chuẩn hóa; không ghi lại file,
  không gọi chẩn đoán này là PASS của gate nguyên bản.
- `git diff --check`: PASS; không có thay đổi QML màn hình hoặc resource.
- Fusion/FluentWinUI3: Not run; target B1/B2 không có QML hoặc QGuiApplication,
  nên style không tham gia các test này.
- `WorkbenchBridgeTests` đầy đủ: Not run theo chỉ dẫn; chỉ build exe.
- Linux build/runtime, live UAC/Polkit/uninstall, QML W3/W5, ảnh Shell-Solid,
  Narrator/DPI/theme/input: Not run; không mở app thật, giao lượt QML/nghiệm thu.

## Giới hạn và nghiệm thu còn lại

Linux chưa nghiệm thu trên máy thật. Bộ đọc registry/Win32 launcher và nguồn
appearance thật cũng chưa được chạy trong lượt này. MSIX registry là best-effort
cho tài khoản hiện tại; Settings là hành động được hỗ trợ. Không liệt kê Flatpak
installation có tên; không quét mọi gói hệ thống nếu không sở hữu desktop entry.
Một gói có thể chứa nhiều app hoặc kéo theo gỡ phụ thuộc; W3 phải diễn giải rõ
trước xác nhận. Không dọn tệp sót, không kết luận đã sạch toàn máy.

Nguồn kỹ thuật đã đối chiếu: [Microsoft ShellExecute](https://learn.microsoft.com/en-us/windows/win32/shell/launch)
cho verb mặc định/UAC và [Flatpak command reference](https://docs.flatpak.org/en/latest/flatpak-command-reference.html)
cho scope, ref và uninstall. Các nguồn này không thay thế nghiệm thu runtime.
