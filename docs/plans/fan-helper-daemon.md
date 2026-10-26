# Kế hoạch: helper quạt thường trực (launchd daemon, rồi `SMAppService`)

Trạng thái: đường A (launchd cài thủ công) đang chạy; đường B (`SMAppService`)
đã có mã nhưng **chưa kích hoạt**, chờ Developer ID. Cả hai nằm trong một PR,
nhánh `feat/fan-helper-daemon`. Bật đường B theo mục 9. Ngày: 2026-10-26.

Mục tiêu: điều khiển quạt sống qua được việc app thoát, cập nhật, sleep và khởi
động lại máy giống Macs Fan Control: hỏi mật khẩu quản trị **một lần** khi cài
helper, sau đó app mở lên là tự kết nối và áp lại cấu hình quạt người dùng đã
chọn, không hỏi lại.

Tài liệu này nối tiếp giai đoạn 2 của
[`module-platform-and-privileged-helper.md`](module-platform-and-privileged-helper.md),
nơi đã ghi sẵn rằng "daemon `SMAppService` sau này chỉ là cách khởi chạy khác"
vì hợp đồng mục 4.3 và `HelperClient` giữ nguyên.

---

## 1. Vì sao làm

**Sự cố 2026-10-26.** Tối 25/10 người dùng bật điều khiển quạt theo cảm biến
rồi cho Mac sleep. Sáng ra điều khiển quạt đã tắt và cấu hình "Tuỳ chỉnh" mất.
Log (`/var/log/viezan-fan-helper.log`, `~/Library/Logs/Viezan-updater.log`):

| Giờ VN | Sự kiện |
|---|---|
| 00:00:29 | Updater cài bản 2.4.1, app thoát. Lúc thoát, `fanControl.stop()` gửi `fans.restoreAll` rồi ngắt kết nối (`restoreAll (client)`, `restoreAll (disconnect)`) |
| 00:00:54 | App mở lại nhưng không kết nối lại helper |
| 00:01:18 | Mac sleep (`restoreAll (sleep)`) |
| 00:09:05 | Helper tự thoát vì không có client (`exit (idle)`) |

Nguyên nhân không nằm ở sleep, mà ở ba đặc điểm của helper chạy theo phiên:

1. Helper khởi chạy bằng `osascript … with administrator privileges`, nên mỗi
   lần bật lại đều phải nhập mật khẩu. Vì vậy app không tự bật khi mở lên.
2. Helper thoát sau 60 giây không có client. Khi đó app chỉ có thể kết nối lại
   bằng cách hỏi mật khẩu lần nữa.
3. Cấu hình "Tuỳ chỉnh" (luật theo cảm biến cho từng quạt) chỉ nằm trong bộ nhớ
   của `fanPolicy`. Chỉ profile có tên mới được lưu trong `thermal.json`.

**Macs Fan Control làm khác** (theo diễn đàn hỗ trợ của CrystalIDEA): họ cài
một launch daemon `com.crystalidea.macsfancontrol.smcwrite` một lần và daemon
sống qua cả lúc app thoát lẫn lúc reboot. Cấu hình quạt được lưu lại và áp lại
khi app mở; app có tuỳ chọn tự chạy khi đăng nhập. Khi thoát app, quạt về
tự động. Viezan cũng làm như vậy và giữ nguyên hành vi đó.

**Lỗi phụ phát hiện cùng lúc.** Lúc sleep và lúc wake, helper trả quạt về tự
động nhưng kết nối vẫn giữ. Sau wake, `fanPolicy` chỉ gửi lại target khi nó
lệch ít nhất `FAN_TARGET_DEADBAND_RPM` (100 RPM) so với `appliedRpm` cũ
(`needsTargetUpdate` trong `electron/thermal/fanCurve.ts`). Nếu nhiệt độ gần
như không đổi, quạt nằm ở chế độ tự động trong khi giao diện vẫn hiện "Theo cảm
biến". Lần wake 22:14 ngày 25/10 không dính lỗi này chỉ vì target sau wake tăng
mạnh (2.700 RPM).

---

## 2. Điều kiện tiên quyết: chữ ký mã

Bản đang cài (`/Applications/Viezan.app`) chỉ được **ký ad-hoc**:
`codesign -dv` báo `Signature=adhoc`, `TeamIdentifier=not set`. Trong
`package.json`, `notarize: false`, còn `scripts/notarize.mjs` bỏ qua khi
thiếu secrets.

`SMAppService.daemon(plistName:)` (macOS 13+) **cần app và daemon được ký
bằng cùng một danh tính Apple cấp** (Developer ID khi phân phối ngoài App
Store). Theo Apple DTS trên Developer Forums, ký ad-hoc sẽ khiến `register()`
thất bại với "Operation not permitted" / `kSMErrorInvalidSignature`. launchd
cũng dùng chữ ký đó để đảm bảo binary nằm trong bundle (thư mục người dùng ghi
được) không bị tráo. Không có Developer ID thì không có cơ chế bảo vệ này.

Hệ quả: kế hoạch có **hai đường cài cho cùng một daemon**:

| | A. launchd cài thủ công | B. `SMAppService` |
|---|---|---|
| Cần Developer ID | Không | Có (kèm notarize) |
| Cách cài | Một lần `osascript … with administrator privileges`: chép binary vào `/Library/PrivilegedHelperTools/`, plist vào `/Library/LaunchDaemons/`, rồi `launchctl bootstrap system` | `register()`; người dùng bật trong Cài đặt hệ thống > Mục đăng nhập |
| Binary root nằm ở | Thư mục root sở hữu, người dùng không ghi được | Trong bundle app (`BundleProgram`), launchd kiểm chữ ký |
| Cập nhật helper | Hỏi mật khẩu lại **chỉ khi** phiên bản helper đổi | Tự đi theo bản cập nhật app |
| Gỡ | Nút gỡ trong app (hỏi mật khẩu) | `unregister()`, hoặc hệ thống tự dọn khi xoá app |
| Xác thực client | uid + người dùng console (mục 4.3) | Thêm yêu cầu chữ ký (Team ID + bundle id) |

Đề xuất: làm **A trước** vì chạy được ngay với bản ad-hoc hiện tại và giải
quyết trọn sự cố ở mục 1. Làm B khi có Developer ID; khi đó A trở thành đường
dự phòng cho bản tự build. Helper chạy theo phiên hiện tại giữ lại cho bản dev
(socket hậu tố `-dev`) và làm dự phòng khi cài daemon thất bại.

---

## 3. Mục tiêu và ngoài phạm vi

**Mục tiêu**

- Cài helper một lần, sau đó không hỏi mật khẩu nữa cho tới khi phiên bản
  helper đổi (A) hoặc không bao giờ hỏi (B).
- App mở lên (kể cả sau khi tự cập nhật) thì tự kết nối và áp lại cấu hình quạt
  lần trước, gồm cả "Tuỳ chỉnh".
- Sau sleep/wake, cấu hình được áp lại ngay, không phụ thuộc deadband.
- Mọi lớp an toàn hiện có giữ nguyên (mục 4.4).

**Ngoài phạm vi**

- Điều khiển quạt khi app **không** chạy. Thoát app thì quạt về tự động (như
  Macs Fan Control). Daemon không tự giữ luật quạt.
- Linux/Windows. Hai nền tảng này vẫn theo
  `module-platform-and-privileged-helper.md`.
- Gộp các lệnh `maintenance.*` của module `cleanup` vào daemon này (xem mục 8,
  quyết định 5).

---

## 4. Kiến trúc đích

### 4.1 Một daemon, hai cách chạy

`viezan-fan-helper` vẫn là một binary Swift (`native/fanhelper/main.swift`,
phiên bản 1.1.0, giao thức vẫn là 1). Ngoài chế độ chạy theo phiên, nó có chế
độ `--daemon`:

- Label `com.viezan.fan-helper`, binary ở
  `/Library/PrivilegedHelperTools/com.viezan.fan-helper`, socket chung cho cả
  máy `/var/run/viezan-fan-helper.sock` (root sở hữu, mode 0666; quyền thật do
  daemon kiểm, mục 4.3). Chế độ phiên không được dùng đường dẫn này.
- launchd giữ daemon chạy thường trực (`RunAtLoad` + `KeepAlive`), nên daemon
  không tự thoát khi rảnh. Daemon chết vì bất kỳ lý do gì thì launchd chạy lại.
- Mỗi lần khởi động (cả hai chế độ), helper trả mọi quạt về tự động trước khi
  nhận lệnh (`restoreAll (start)`). Nhờ vậy sau crash hay reboot, quạt luôn ở
  trạng thái an toàn.
- `status` có thêm `restoreSeq` (đếm số lần khôi phục) và `hello` có thêm
  `mode`. Hai trường đều là bổ sung, app cũ vẫn đọc được.
- Log `/var/log/viezan-fan-helper.log` được xoay vòng sang `.1` khi vượt 1 MB.
  Không có bước này, một daemon chạy suốt sẽ làm log phình mãi.

Plist (một dòng, vì script cài đi trong chuỗi AppleScript):

```xml
<key>Label</key><string>com.viezan.fan-helper</string>
<key>ProgramArguments</key><array><string>/Library/PrivilegedHelperTools/com.viezan.fan-helper</string><string>--daemon</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ProcessType</key><string>Interactive</string>
```

**Đổi so với bản thảo:** bản thảo định dùng launchd socket activation
(`Sockets` + `launch_activate_socket`) để daemon chỉ chạy khi có kết nối. Bản
làm thật chọn daemon thường trực, vì bốn lý do. Mã gần như giữ nguyên, daemon
vẫn tự tạo socket như chế độ phiên. Không cần gọi `launch_activate_socket` qua
`dlsym`, vì Swift không import `launch.h`. Crash được chạy lại mà không cần
`KeepAlive.Crashed`. Một tiến trình chặn ở `accept()` tốn không đáng kể (Macs
Fan Control cũng giữ daemon chạy suốt).

### 4.2 Phía app: `HelperInstaller`

`electron/helper/daemon.ts` (`createHelperDaemonInstaller`) làm ba việc:

- `status()` trả về `not-installed`, `installed` hoặc `outdated`. Nó so **SHA-256
  của binary đã cài với binary đi kèm app**, thay vì so chuỗi phiên bản (đổi so
  với bản thảo), nên mọi lần build lại helper đều được nhận ra.
- `install()` chạy một lần `osascript … with administrator privileges` cho cả
  chuỗi: `bootout`, `install -o root -g wheel`, ghi plist, rồi `bootstrap`
  (thử lại tối đa 5 lần, vì `bootout` trả về trước khi launchd nhả job cũ).
- `uninstall()` chạy `bootout` rồi xoá plist, binary và socket.

Đường B sẽ thêm một chiến lược `smappservice` bên cạnh, cùng giao diện này.

- `fanControl.ts` nhận `daemon?: { installer, socketPath }`:
  - `enable()`: nếu chưa cài thì cài (một lần mật khẩu), rồi chỉ connect.
    Daemon `outdated` mà vẫn cùng giao thức thì tiếp tục dùng. Nếu nó không
    trả lời hoặc khác giao thức (`HelperProtocolError`, không thử lại vô ích),
    app cài lại một lần.
  - `resume()`: chỉ connect, không bao giờ hỏi mật khẩu.
  - `installHelper()` / `uninstallHelper()`: cài lại hoặc gỡ.
- `FanControlState` thêm `install` và `restoreSeq`. Một lần khôi phục chỉ được
  coi là "tin mới" (`lastRestoreReason`) khi xảy ra sau lúc kết nối bắt đầu.
  Nhờ vậy lý do `disconnect` từ lần thoát app trước không hiện lại.
- Chọn chế độ: bản đóng gói macOS dùng daemon; bản chạy từ mã nguồn dùng helper
  theo phiên, để không bao giờ cài một binary dev vào hệ thống.
- (Đường B) Gọi `SMAppService` từ Electron cần mã native. Spike chọn một trong hai cách:
  (a) một CLI Swift nhỏ `viezan-helper-ctl` đặt trong `Contents/MacOS` để
  `Bundle.main` trỏ về app; hoặc (b) một addon N-API. Ưu tiên (a) vì
  `scripts/build-native.mjs` đã build Swift sẵn và repo chưa có addon nào.
  Lưu ý `build-native.mjs` đang nhắm `macos12.0`; `viezan-helper-ctl` cần
  `macos13.0`.

### 4.3 Xác thực client

Hiện tại helper chỉ chấp nhận peer có uid đúng bằng `--uid` (`getpeereid`).
Daemon dùng chung cho cả máy nên đổi thành:

1. Peer phải là root hoặc **người dùng đang ở console**
   (`SCDynamicStoreCopyConsoleUser`). Máy nhiều tài khoản thì người đang ngồi
   trước máy điều khiển quạt; người dùng chuyển nhanh sang tài khoản khác thì
   client cũ bị ngắt và quạt về tự động.
2. Mỗi lúc chỉ một client, như hiện nay.
3. Chỉ ở đường B: kiểm thêm chữ ký của peer qua `LOCAL_PEERTOKEN` (audit token),
   `SecCodeCopyGuestWithAttributes` và yêu cầu
   `anchor apple generic and certificate leaf[subject.OU] = "<TEAMID>" and identifier "com.Viezan.app"`.

**Điều kiện để bước 3 có nghĩa.** Hiện `build/entitlements.mac.plist` bật
`allow-dyld-environment-variables` và `disable-library-validation`, đồng thời
repo chưa cấu hình Electron fuses. Như vậy bất kỳ tiến trình nào cùng uid cũng
có thể chạy binary Viezan đã ký với `ELECTRON_RUN_AS_NODE` hoặc
`DYLD_INSERT_LIBRARIES`, và vẫn qua được kiểm tra chữ ký. Đường B phải đi kèm:
fuses (`RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off,
`EnableNodeCliInspectArguments` off, `EnableEmbeddedAsarIntegrityValidation` on,
`OnlyLoadAppFromAsar` on) và bỏ hai entitlement dyld/library-validation nếu
native module cho phép.

**Mô hình đe doạ được chấp nhận ở đường A:** một tiến trình bất kỳ cùng uid
với người dùng console có thể đặt tốc độ quạt trong dải phần cứng. Rủi ro này
giới hạn được nhờ các lớp ở mục 4.4 và bằng mức của helper theo phiên hiện
tại. Không được thêm lệnh mạnh hơn vào daemon khi chỉ có lớp xác thực này.

### 4.4 Các lớp an toàn giữ nguyên

Watchdog 15 giây, trần nhiệt 105 °C, trả quạt về tự động khi client ngắt, khi
sleep, khi wake, khi nhận tín hiệu dừng; kẹp mọi target vào dải phần cứng.

Phần mới thêm:

- Trả quạt về tự động khi daemon khởi động (4.1) và khi người dùng console đổi
  (4.3).
- Client im lặng quá 30 giây bị ngắt (`SO_RCVTIMEO`). App gửi heartbeat mỗi 5
  giây, nên chỉ peer bị treo hoặc cố ý chiếm chỗ mới chạm ngưỡng này; nếu không,
  nó giữ chỗ client duy nhất mãi.
- Ghi log dùng dạng `write(contentsOf:)` có `throws`, nên ổ đầy chỉ mất một dòng
  log chứ không làm daemon crash lặp dưới `KeepAlive`.
- Sau khi chạm trần nhiệt, `fanPolicy` bỏ mọi luật cảm biến. Nếu không, luật sẽ
  giành lại quạt ngay khi máy nguội dưới ngưỡng tối đa của nó. Lớp profile cũng
  không tự áp lại sau sleep/wake cho tới khi người dùng chọn lại, hoặc tới lần
  mở app sau.

### 4.5 Phiên bản và cập nhật

- **Đường A:** binary đã cài khác binary đi kèm app (so SHA-256) thì trạng thái
  là `outdated`. App vẫn dùng daemon cũ nếu cùng giao thức và hiện thông báo
  "Có bản helper mới" kèm nút "Cập nhật helper" (hỏi mật khẩu một lần). Khác
  giao thức thì `enable()` cài lại, còn `resume()` lúc mở app để yên cho người
  dùng bấm cập nhật. Không bao giờ
  để daemon root chạy binary nằm trong bundle app (người dùng ghi được), và
  không có lệnh "tự nâng cấp từ đường dẫn client gửi lên", vì cả hai đều mở ra
  leo thang đặc quyền.
- **Đường B:** binary nằm trong bundle nên đi theo bản cập nhật app. Sau khi
  cập nhật, app gửi lệnh mới `helper.exit` cho daemon cũ (vẫn đang chạy inode
  cũ), và launchd chạy binary mới ở kết nối kế tiếp.
- Updater (`electron/ipc/updater.ts`) thay bundle tại chỗ bằng `ditto` vào
  `/Applications/Viezan.app`, nên đường dẫn bundle không đổi. Bản ghi BTM vẫn
  khớp; spike B cần xác nhận lại điều này.

### 4.6 Gỡ helper

Popover Tuỳ chọn của trang Nhiệt độ & quạt có mục "Helper chạy nền" với nút "Gỡ helper". Đường A: một lần `osascript` chạy
`launchctl bootout system/com.viezan.fan-helper`, xoá plist, binary và socket.
Đường B: `unregister()`. Tắt module `thermal` **không** gỡ helper, chỉ ngắt
kết nối.

### 4.7 Ghi nhớ và tự áp lại (độc lập với daemon)

- `thermal.json` thêm `fanControl.autoEnable` và `fanControl.custom`. Hai
  trường này do main giữ: `parseThermalSettingsPatch` chỉ nhận chúng từ file
  (`trusted`), còn patch từ renderer bị bỏ qua.
- `autoEnable` thành `true` khi enable hoặc cài lại thành công. Nó chỉ thành
  `false` khi người dùng bấm "Tắt điều khiển quạt" hoặc "Gỡ helper". Thoát app
  (`stop()`) không đổi nó.
- Mỗi lệnh chỉnh tay (`setFan` ở lớp profile) lưu **toàn bộ** trạng thái quạt
  hiện tại vào `custom`, không chỉ quạt vừa chỉnh. Bấm "Về tự động" thì xoá
  `custom`.
- `fanProfiles` sở hữu việc "giữ cài đặt": áp `activeId` nếu có, ngược lại áp
  `custom`. Việc áp lại xảy ra (a) khi helper lên lại sau enable, resume hoặc
  cài lại, và (b) khi helper báo `restoreSeq` tăng với lý do `sleep`,
  `can-sleep`, `wake` hoặc `watchdog`. **Đổi so với bản thảo:** bản thảo định
  xoá `appliedRpm` ở `fanPolicy`. Áp lại ở lớp profile thì phủ cả quạt
  **Cố định** chứ không chỉ quạt Theo cảm biến, và tôn trọng lớp an toàn: sau
  `ceiling`, app **không** tự áp lại.
- Nhận diện cảm biến (calibration) giờ điều khiển thẳng `fanPolicy`, không đi
  qua lớp profile. Chạy xong thì `onFinished` gọi áp lại. Trong lúc nhận diện,
  lớp profile không tự áp lại (`paused`). **Lỗi cũ được sửa cùng:** trước đây
  chạy nhận diện xong thì profile đang chọn bị xoá (`activeId` về null); khi đã
  lưu cấu hình, lỗi này còn xoá luôn `custom`.
- Khi module bắt đầu (lúc mở app) mà `autoEnable` là `true`, runtime gọi
  `fanControl.resume()`.
- Trang chỉ hiện dòng "Helper đã trả quạt về tự động (…)" khi mọi quạt còn ở
  tự động, nên dòng này tự tắt khi cài đặt đã được áp lại.

---

## 5. Giao diện

Tuân theo `.claude/rules/ui-ux.md` và `docs/design/screens/thermal.md`. Mọi
chuỗi mới có đủ EN/VI/JA.

| Trạng thái | Header trang Nhiệt độ & quạt | Hành động |
|---|---|---|
| `not-installed` | "Cần cài helper để điều khiển quạt" | `primary` "Cài helper" (hỏi mật khẩu một lần); phụ: "Chỉ dùng phiên này" (chế độ hiện tại) |
| `requires-approval` (B) | "Hãy cho phép Viezan trong Mục đăng nhập" | "Mở Cài đặt hệ thống" (`SMAppService.openSystemSettingsLoginItems()`) |
| `installed`, đã kết nối | Như ảnh hiện tại: "Helper đã kết nối (v…)" | "Tắt điều khiển quạt" |
| `installed`, `autoEnable` tắt | "Điều khiển quạt đang tắt" | "Bật điều khiển quạt" (không hỏi mật khẩu) |
| `outdated` (A) | Dòng `.thermal-notice` "Có bản helper mới" | "Cập nhật helper" |

Sau khi cài lần đầu, macOS 13+ sẽ hiện thông báo "Background Items Added". Trang
cần một dòng giải thích ngắn để người dùng không bất ngờ.

---

## 6. Phạm vi PR này và phần còn lại

Theo yêu cầu, mọi thứ được gom vào một PR (`feat/fan-helper-daemon`):

- Mục 4.7: ghi nhớ, tự áp lại, sửa lỗi sau wake không gửi lại target, sửa lỗi
  calibration xoá cài đặt.
- Chế độ `--daemon` của helper (4.1, 4.3 bước 1–2, 4.4).
- Đường A: trình cài (4.2, 4.5, 4.6), IPC `installHelper`/`uninstallHelper`,
  giao diện (mục 5) và i18n EN/VI/JA.
- Cập nhật `docs/design/screens/thermal.md` và `docs/design/findings.md`.

Đường B cũng nằm trong PR này nhưng **tắt**:

- `native/helperctl/main.swift` → `viezan-helper-ctl` (macOS 13+), đặt ở
  `Contents/MacOS`. Lệnh: `status` (kèm đường dẫn bundle và `plistPresent`, để
  chẩn đoán), `register`, `unregister`, `open-settings`.
- `native/fanhelper/com.viezan.fan-helper.plist` được đóng gói vào
  `Contents/Library/LaunchDaemons`, với `BundleProgram` trỏ tới helper trong bundle.
- `electron/helper/smAppService.ts` (installer đường B, chuyển từ đường A sang),
  `electron/helper/strategy.ts` (`SMAPPSERVICE_ENABLED = false`, kèm điều kiện
  macOS 13 và app có Team ID).
- Bridge: trạng thái `requires-approval` (không phải lỗi), và tự khởi động lại
  daemon chạy binary cũ sau khi cập nhật (`hello.binarySha256` khác hash bản
  trong bundle → `helper.exit` → `KeepAlive` chạy file mới).
- Helper ký có Team ID tự kiểm chữ ký client (`LOCAL_PEERTOKEN` +
  `SecCodeCheckValidity`, yêu cầu cùng Team ID). Bản ad-hoc bỏ qua bước này, nên
  đường A không đổi.
- Giao diện: thông báo "Cần cho phép helper chạy nền" kèm nút "Mở Cài đặt hệ thống".

Đã kiểm: một bản đóng gói `--dir` có ctl ở `Contents/MacOS` và plist ở
`Contents/Library/LaunchDaemons`; chạy từ bundle, ctl thấy đúng `Bundle.main`
và plist. SMAppService báo `not-found` khi daemon chưa đăng ký, nên app coi đó là
"chưa cài". Bước `register` thật chưa chạy, vì cần Team ID.

---

## 7. Kiểm thử và QA

**Tự động (Vitest):** chọn chiến lược installer theo nền tảng, Team ID và chế độ
dev; ánh xạ trạng thái cài; `autoEnable` đổi khi người dùng bật/tắt nhưng không
đổi khi `stop()`; lưu và áp lại `custom`; `fanPolicy` gửi lại target sau
`lastRestoreAt` mới ngay cả khi target nằm trong deadband; app từ chối helper
có protocol major khác.

**Máy thật (macOS, Apple Silicon và Intel nếu có):**

- `launchctl print system/com.viezan.fan-helper`; `sfltool dumpbtm` (đường B).
- Cài, thoát app, mở lại: không hỏi mật khẩu, cấu hình được áp lại.
- Tự cập nhật app trong lúc đang điều khiển quạt: app mở lại thì cấu hình được
  áp lại. Đây là kịch bản đúng của sự cố 26/10.
- Sleep, wake với nhiệt độ ổn định: target được gửi lại trong vòng một
  snapshot.
- Reboot: daemon chạy cùng máy, quạt ở chế độ tự động cho tới khi app mở và áp
  lại cài đặt.
- `kill -9` daemon khi đang điều khiển: launchd chạy lại daemon (`KeepAlive`),
  daemon trả quạt về tự động lúc khởi động; app chuyển sang `idle` rồi thử kết
  nối lại một lần sau 2 giây và áp lại cài đặt. Ghi lại SMC tự làm gì nếu không
  có bước này, để biết lỗ hổng tương ứng của helper theo phiên.
- Hai tài khoản và chuyển nhanh người dùng: client của tài khoản rời console bị
  ngắt (`console-user`), quạt về tự động; quay lại tài khoản thì
  `powerMonitor` `user-did-become-active` kết nối lại.
- Gỡ: plist, binary, socket biến mất; `launchctl print` báo không tìm thấy.
- Theo dõi `/var/log/viezan-fan-helper.log` ở từng bước.

---

## 8. Rủi ro và quyết định còn mở

**Rủi ro**

- Đường A để lại một daemon root trên máy. Giảm rủi ro bằng cách: binary ở thư
  mục root sở hữu, tập lệnh cố định và có kẹp, chạy theo nhu cầu, có nút gỡ.
- `SMAppService` từng có lỗi theo phiên bản macOS (các báo cáo BTM "record not
  found" trên 14.2.1). Đường A là dự phòng.
- Macs Fan Control từng gặp lỗi app biến mất sau auto-update trong khi quạt kẹt
  ở tốc độ cao. Watchdog 15 giây của Viezan đã chặn trường hợp này; giữ nguyên.
- Tiến trình cùng uid có thể giả làm app ở đường A (4.3). Chấp nhận được chỉ khi
  tập lệnh giữ nguyên mức hiện tại.
- **Bước cài chạy với quyền root một binary mà người dùng ghi được** (helper
  trong bundle app). Malware chạy với quyền người dùng có thể tráo binary đó
  trước khi người dùng bấm "Cập nhật helper" và nhập mật khẩu. Helper theo phiên
  hiện tại cũng có đúng rủi ro này, vì mỗi lần nó chạy binary trong bundle với
  quyền root. Với bản ký ad-hoc, không có cách kiểm nào đáng tin: hash nhúng
  trong JS cũng nằm trong `app.asar`, mà người dùng ghi được. Lời giải là đường
  B: launchd kiểm chữ ký Developer ID của binary, và bước cài kiểm
  `codesign --verify -R <requirement>`. Chấp nhận có ghi nhận cho tới lúc đó.

**Quyết định (2026-10-26):** gom một PR; làm đường A trước; đường B làm sẵn
nhưng tắt, bật khi có Developer ID (mục 9). Các điểm 3–6
dưới đây đã được làm theo đề xuất. Điểm 1 vẫn mở.

**Đề xuất:**

1. **Developer ID:** có định đăng ký Apple Developer Program không, và khi nào.
   Câu trả lời quyết định PR 4–5 có nằm trong lộ trình gần hay không.
2. **Làm đường A trước** (launchd cài thủ công, chạy được với bản ad-hoc), B
   sau. Phương án khác là chờ Developer ID rồi làm thẳng B.
3. **Thoát app thì quạt về tự động** như Macs Fan Control; cấu hình được áp lại
   khi app mở. Daemon không giữ luật khi không có app.
4. **Tự bật khi mở app** nếu lần trước đang bật (`autoEnable`), không có hộp
   thoại mật khẩu bất ngờ.
5. **Không gộp `maintenance.*` của module `cleanup` vào daemon này** cho tới khi
   có xác thực chữ ký (đường B). Điều này điều chỉnh quyết định 8 trong
   [`storage-cleanup-module.md`](storage-cleanup-module.md), vốn định mở rộng
   `viezan-fan-helper`: một daemon root thường trực chỉ xác thực theo uid không
   nên nhận lệnh thao tác hệ thống tệp.
6. **Label và socket:** `com.viezan.fan-helper`, `/var/run/viezan-fan-helper.sock`.

---

## 9. Kích hoạt đường B (khi có Developer ID)

Làm theo thứ tự. Mỗi bước có cách kiểm tra.

1. **Developer ID.** Đăng ký Apple Developer Program, tạo chứng chỉ "Developer ID
   Application", xuất `.p12`.
2. **Ký và notarize.** Đặt `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
   `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` cho máy build hoặc CI.
   `scripts/notarize.mjs` (afterSign) đã sẵn, nên giữ `mac.notarize: false` trong
   electron-builder để không notarize hai lần. Kiểm tra:
   `codesign -dv --verbose=2 Viezan.app` có `TeamIdentifier=<TEAM>`, và
   `spctl -a -vv Viezan.app` báo `Notarized Developer ID`.
3. **Electron fuses.** Thêm vào `build` trong `package.json`:

   ```json
   "electronFuses": {
     "runAsNode": false,
     "enableNodeOptionsEnvironmentVariable": false,
     "enableNodeCliInspectArguments": false,
     "enableEmbeddedAsarIntegrityValidation": true,
     "onlyLoadAppFromAsar": true
   }
   ```

   Code của app không dùng `ELECTRON_RUN_AS_NODE`; chỉ các script test/dev xoá
   biến đó, và chúng chạy Electron dev chứ không chạy bản đóng gói. Kiểm tra:
   `ELECTRON_RUN_AS_NODE=1 Viezan.app/Contents/MacOS/Viezan -e 1` không chạy
   được như Node.
4. **Entitlements.** Rà `build/entitlements.mac.plist`: bỏ
   `allow-dyld-environment-variables` nếu không gì cần; giữ
   `disable-library-validation` chỉ khi native module (onnx, wasm…) thật sự cần.
   Không có bước 3–4 thì kiểm chữ ký client (4.3) chỉ có giá trị một phần.
5. **Bật công tắc.** `SMAPPSERVICE_ENABLED = true` trong
   `electron/helper/strategy.ts`. Test `stays switched off…` trong
   `electron/helper/__tests__/smAppService.test.ts` sẽ đỏ đúng chủ đích: sửa test
   đó cùng lúc.
6. **QA trên máy thật** (bắt đầu từ máy đang có daemon của đường A):
   - Mở bản đã ký và bật điều khiển quạt. App hỏi mật khẩu **một lần cuối** để
     gỡ job của đường A, rồi đăng ký. macOS hiện thông báo mục chạy nền; trang
     hiện "Cần cho phép helper chạy nền". Bấm "Mở Cài đặt hệ thống", bật Viezan,
     quay lại và bật điều khiển quạt: kết nối ngay, không hỏi mật khẩu.
   - `viezan-helper-ctl status` (trong `Contents/MacOS`) báo `enabled`.
     `sudo launchctl print system/com.viezan.fan-helper` cho thấy chương trình
     nằm trong bundle. `sfltool dumpbtm | grep -A6 -i viezan` có bản ghi của app.
   - Log helper có `daemon 1.1.0 listening…`. Dòng này xác nhận
     `ProgramArguments` cùng `BundleProgram` truyền được `--daemon`; nếu không
     thấy, chỉnh plist (spike còn mở).
   - `hello.teamSigned` là `true`. Một client lạ, ví dụ
     `nc -U /var/run/viezan-fan-helper.sock`, bị từ chối
     (`rejected client` trong log).
   - Cập nhật app trong lúc đang điều khiển quạt: log có `exit (client-exit)`,
     PID mới, rồi cài đặt quạt được áp lại.
   - "Gỡ helper": `viezan-helper-ctl status` về `not-registered`/`not-found`.
7. **Dọn đường A** (một bản sau, khi mọi máy đã chuyển): giữ installer đường A
   làm dự phòng cho bản tự build không ký, hoặc bỏ nếu không cần nữa.
