# Kế hoạch: kiến trúc module và lớp helper đặc quyền dùng chung

Trạng thái: bản thảo thiết kế, chưa có mã tính năng. Ngày: 2026-10-24.

Mục tiêu: định hình lại Viezan từ "app dịch" thành bộ công cụ hệ thống local-first
có AI, trong đó mỗi tính năng là một module bật tắt được, và mọi thao tác cần
quyền hệ thống đi qua một lớp helper đặc quyền duy nhất. Tính năng đầu tiên dùng
lớp này là giám sát và điều khiển quạt theo nhiệt độ CPU, GPU, lõi.

Tài liệu này chỉ mô tả kiến trúc, hợp đồng và lộ trình. Không có mã.

---

## 1. Hiện trạng cần biết trước khi thiết kế

Những điểm trong mã nguồn hôm nay mà kiến trúc mới phải tận dụng hoặc tháo gỡ.

| Thành phần | Hiện trạng | Hệ quả cho thiết kế |
| --- | --- | --- |
| Điều hướng | `AppPage` là union cứng `'translate' \| 'chat' \| 'live' \| 'dictionary'` trong `src/types/index.ts`; `App.tsx` chọn trang bằng chuỗi `if/else`; `PrimaryNavigationSidebar` và `SettingsPage` tự liệt kê mục của mình. | Thêm một module hiện phải sửa bốn chỗ. Cần một registry module để các nơi này đọc chung. |
| IPC main | `main.ts` gọi tay từng `registerXHandlers(ipcMain, ...)`. Mỗi domain có file riêng trong `electron/ipc/`. | Giữ cách chia theo domain, nhưng để module tự khai báo handler của mình qua registry. |
| Preload | `electron/preload.ts` gộp các `xSection` thành một `window.api`. Kiểu tương ứng khai báo tay trong `src/types/index.ts`, mock trong `src/test/setup.ts` và `src/web-preview/installWebPreviewApi.ts`. | Ba bản sao của một hợp đồng. Module mới phải có cách khai báo một lần rồi sinh ra cả ba. |
| Thao tác hệ thống | Gọi lệnh ngoài trực tiếp từ main: `osascript` (phím Cmd+C/V), `defaults` và `activateSettings` (Spotlight), `mdfind` (tìm file). Không có native module, không có helper đặc quyền. | Mẫu "gọi CLI hệ thống có timeout, không qua shell" đã có và đáng giữ cho việc không cần quyền. Việc cần root chưa có đường nào. |
| Quyền hệ thống | Đã có luồng xin quyền Trợ năng (macOS) và luồng bàn giao phím Spotlight, mỗi luồng tự viết. | Cần một mô hình "capability + permission" chung để không lặp lại cho quạt, clipboard, cửa sổ. |
| Build | `hardenedRuntime: true`, `notarize: false`, có `scripts/notarize.mjs` chờ biến môi trường Apple ID. Windows `requestedExecutionLevel: asInvoker`, ký qua SignPath. Linux chỉ AppImage. | Helper đặc quyền trên macOS bắt buộc ký Developer ID và notarize. Linux AppImage không có bước cài đặt để đặt dịch vụ hệ thống. |
| Runtime profile | `electron/runtimeProfile.ts` tách bản dev và bản phát hành (userData, cổng, tray). | Helper đặc quyền cũng phải tách theo profile để bản dev không ghi đè dịch vụ của bản cài. |
| Quy tắc dự án | `AGENTS.md`: renderer không chạm Node/Electron, mọi thao tác đặc quyền nằm sau preload/main; không mở rộng IPC hay quyền để test pass. | Lớp helper là phần mở rộng của ranh giới tin cậy hiện có, không phải lối tắt qua nó. |

---

## 2. Nguyên tắc thiết kế

1. **Module là đơn vị sản phẩm.** Một module gói trọn trang, mục Settings, lệnh
   Launcher, phím tắt, IPC, i18n và khai báo khả năng. Bật tắt module là bật tắt
   tất cả những thứ đó.
2. **Khả năng được khai báo và kiểm tra theo máy, không giả định.** Module nói nó
   cần gì (đọc cảm biến, ghi quạt, ghi cấu hình hệ thống) và nền tảng trả lời có
   hay không trên máy này. UI chỉ hiện phần được hỗ trợ.
3. **Một đường duy nhất cho thao tác đặc quyền.** Mọi việc cần root hoặc admin đi
   qua Privileged Helper. Main process không bao giờ tự gọi `sudo`, `pkexec` hay
   lệnh cần nâng quyền.
4. **Hợp đồng hẹp, đã kiểm tra, có kẹp giá trị.** Helper chỉ nhận một tập lệnh cố
   định với tham số đã kiểm tra kiểu và biên. Không có lệnh "chạy chuỗi này".
5. **An toàn phần cứng trước tiện ích.** Mọi thao tác ghi vào phần cứng phải có
   trạng thái mặc định an toàn để trở về khi app thoát, treo, máy ngủ dậy, hoặc
   helper mất kết nối.
6. **Ranh giới tin cậy giữ nguyên.** `renderer -> preload -> main -> helper`.
   Renderer không biết helper tồn tại; nó chỉ gọi API của module.
7. **Tăng dần, có đường lùi.** Mỗi giai đoạn giao được giá trị độc lập và có thể
   dừng mà không để lại hệ thống ở trạng thái dở dang.

---

## 3. Kiến trúc module

### 3.1 Khái niệm

```text
Module = {
  id, tên i18n, biểu tượng,
  page?            // trang trong vùng làm việc chính
  settings?        // một hoặc nhiều section trong Settings
  launcherCommands? // lệnh xuất hiện trong Launcher và Command Palette
  hotkeys?         // phím tắt toàn cục module sở hữu
  capabilities     // khả năng cần có (xem 3.4)
  main             // registerHandlers(ipcMain, ctx), start(ctx), stop(ctx)
  preload          // section cho window.api + kiểu + mock
  defaultEnabled   // bật sẵn hay không
}
```

Các module dự kiến sau khi tái cấu trúc:

| Module | Nguồn gốc | Mặc định |
| --- | --- | --- |
| `translate` | TranslatePage, Dịch nhanh (hotkey), image translate | bật |
| `live` | LiveTranslatePage, subtitle window | bật |
| `chat` | ChatPage, quick chat | bật |
| `dictionary` | DictionaryPage | bật |
| `launcher` | Quick chat window, launcherApps/Files, phím Command+Space | bật |
| `browser-bridge` | local server, extension, legacy assistant | bật nếu đã cấu hình |
| `thermal` | mới: giám sát nhiệt độ, quạt, tải; điều khiển quạt | tắt, người dùng bật |

Các module tương lai (clipboard, text expander, window manager, OCR vùng chọn)
dùng cùng khung này.

### 3.2 Registry và nơi đọc

Một registry duy nhất ở `shared/modules/` (kiểu) và `src/modules/registry.ts`
(renderer), `electron/modules/registry.ts` (main). Ba nơi hiện tự liệt kê sẽ đọc
từ registry:

- `PrimaryNavigationSidebar`: liệt kê module có `page` và đang bật.
- `App.tsx`: chọn trang theo `module.page`, thay chuỗi `if/else` bằng tra cứu.
- `SettingsPage`: ghép `module.settings` vào danh sách section hiện có. Section
  hệ thống (Tùy chọn, Giao diện, Nhà cung cấp, Cập nhật, Thông tin) vẫn cố định.
- `CommandPalette` và Launcher: gộp `launcherCommands` của module đang bật.

`AppPage` trở thành kiểu dẫn xuất từ registry thay vì union viết tay. Store giữ
`enabledModules: Record<ModuleId, boolean>` trong Zustand có persist; main cũng
lưu một bản để biết module nào được `start()` khi khởi động (hotkey, server) kể
cả khi renderer chưa lên.

### 3.3 Vòng đời module ở main

```text
app ready
  -> load enabledModules (userData)
  -> for module of registry: module.main.registerHandlers(ipcMain, ctx)   // luôn, để renderer hỏi trạng thái
  -> for module enabled:     module.main.start(ctx)                        // hotkey, server, polling
renderer toggles module
  -> IPC modules:setEnabled -> start()/stop() tương ứng -> persist
app quit
  -> stop() mọi module theo thứ tự ngược -> helper nhận lệnh "restore defaults"
```

`ctx` cung cấp: `getMainWindow`, `runtimeProfile`, `capabilities`, `helper`
(client tới Privileged Helper), `storage` (JSON userData có validate như
`hotkey-settings.json` hiện nay).

Đã làm (giai đoạn 0): `electron/modules/host.ts` là host thuần (không import
Electron) với `init`, `setEnabled`, `shutdown`, hàng đợi tuần tự để bật tắt nhanh
không chồng lấn; `enabledStore.ts` lưu `modules.json` trong userData, id lạ bị bỏ,
thiếu nghĩa là bật; `appModules.ts` khai báo sáu module (chat, translate, live,
dictionary, launcher, browser-bridge) với `registerHandlers` và `start`/`stop`;
`ipc.ts` cung cấp `modules:get`, `modules:setEnabled` và đẩy `modules:changed`.
Phím tắt Dịch nhanh và Launcher được module tắt/bật qua
`setHotkeyModuleActive` trong `globalHotkey.ts`; máy chủ cục bộ tách
`registerLocalServerHandlers` khỏi `startLocalServer` để dừng/chạy theo module.
Chưa có UI bật tắt; renderer mới có `window.api.modules`.

### 3.4 Capability và permission

Hai khái niệm tách bạch:

- **Capability**: máy này có làm được việc đó không. Ví dụ
  `thermal.sensors.read`, `thermal.fan.write`, `system.spotlight.write`,
  `input.keystroke`. Được phát hiện ở main lúc khởi động và khi được yêu cầu
  lại, có cache. Trả về `supported | unsupported | unknown` kèm lý do.
- **Permission**: người dùng hoặc hệ điều hành đã cho phép chưa. Ví dụ quyền Trợ
  năng macOS, helper đã cài và đã xác thực, polkit đã chấp thuận. Trả về
  `granted | denied | not-determined` kèm hành động để xin.

API chung cho renderer: `window.api.capabilities.get(ids)` và
`window.api.capabilities.request(id)`. Luồng Trợ năng và Spotlight hiện có sẽ
được chuyển sang API này ở giai đoạn 1 để làm mẫu, không viết thêm luồng riêng.

UI chuẩn: một atom/molecule `CapabilityNotice` hiển thị trạng thái và nút xin
quyền, dùng chung cho mọi module. Thẻ quyền Trợ năng và thẻ Spotlight trong
`HotkeySection` là hai trường hợp đầu tiên của nó.

### 3.5 Hợp đồng preload một nguồn

`tsconfig.electron.json` đặt `rootDir: electron`, nên `shared/` chỉ chứa được file
kiểu (`.d.ts`), không chứa mã chạy. Vì vậy hợp đồng là **một nguồn ở mức kiểu**:

- `shared/<module>Api.d.ts` khai báo interface của `window.api.<module>` và các kiểu
  dữ liệu đi kèm. Đây là nguồn duy nhất cho hình dạng API.
- `electron/ipc/channels.ts` khai báo tên kênh IPC dưới dạng hằng; main handler và
  preload cùng đọc, nên hai bên không thể lệch tên kênh.
- `electron/preload/contract.ts` có `invoke(channel)`, `subscribe(channel)` và
  `subscribeSignal(channel)`. Một section preload là một object literal được chú
  kiểu bằng interface trong `shared/`, mỗi phương thức là một dòng gọi helper;
  TypeScript suy kiểu tham số và kết quả từ interface nên thiếu hay sai phương thức
  là lỗi biên dịch.
- `src/types/index.ts` chỉ còn `hotkey: HotkeyApi` thay vì khai báo lại.
- Mock trong `src/test/setup.ts` và `installWebPreviewApi.ts` được chú kiểu bằng
  cùng interface, nên thêm phương thức mà quên mock cũng là lỗi biên dịch.
- Test `globalHotkey` kiểm tra main đã đăng ký handler cho mọi kênh `invoke` trong
  `channels.ts`.

Toàn bộ section preload đã chuyển sang mẫu này (hotkey, capabilities, system,
keychain, webSearch, localServer, legacyAssistant, updater, subtitle, quickChat và
launcher, audio, chat và image translate, translate và local AI), mỗi section một
PR. `src/types/index.ts` không còn khai báo tay hình dạng API nào: `WindowApi` kế
thừa các interface top-level và trỏ từng section lồng về `shared/`.

---

## 4. Lớp Privileged Helper dùng chung

### 4.1 Vì sao cần một helper riêng

Electron chạy với quyền người dùng. Ghi tốc độ quạt (SMC trên macOS, pwm trên
Linux), và sau này có thể là cấu hình mạng hay nguồn, cần root. Hai lựa chọn bị
loại:

- Chạy cả app với quyền cao: phá vỡ mô hình bảo mật của Electron và hệ điều hành.
- Gọi `sudo`/`pkexec` cho từng lệnh: hộp thoại mật khẩu liên tục, chuỗi lệnh khó
  kiểm soát, không có trạng thái để trả về an toàn khi app chết.

Vì vậy: một tiến trình helper nhỏ, chạy với quyền cao, cài một lần, chỉ hiểu một
tập lệnh cố định, và tự trả phần cứng về mặc định khi mất client.

### 4.2 Hình dạng theo nền tảng

| | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Hình thức | Daemon đăng ký qua `SMAppService` (macOS 13+), binary Swift nằm trong `Contents/Library/LaunchDaemons` hoặc `Contents/MacOS` theo yêu cầu của Apple | Dịch vụ systemd hoặc binary chạy qua `pkexec` với policy polkit riêng; AppImage không có bước cài nên cần "cài helper" lần đầu do người dùng xác nhận | Dịch vụ Windows chạy LocalSystem, cài qua installer NSIS với UAC một lần |
| Kênh IPC | XPC hoặc Unix socket với kiểm tra code signature của client | Unix socket trong `/run`, kiểm tra uid của client và chữ ký tùy chọn | Named pipe với ACL chỉ cho người dùng đã cài |
| Quyền đọc cảm biến | Không cần helper: IOKit SMC đọc được từ user space | Không cần helper: sysfs hwmon | Cần driver kernel đã ký để đọc MSR/SuperIO; chỉ giám sát qua thư viện có sẵn, không viết driver riêng |
| Quyền ghi quạt | Cần helper (root) ghi khóa SMC | Cần helper (root) ghi `pwm*`, `pwm*_enable` | Không nằm trong phạm vi: phụ thuộc EC từng hãng |
| Ký | Developer ID + notarize bắt buộc, entitlement cho app và helper | Không bắt buộc, nhưng kiểm tra checksum binary trước khi cài | Authenticode qua SignPath đã có |

Thứ tự triển khai helper: macOS trước (đã có môi trường test là máy của tác giả),
Linux sau (rẻ), Windows chỉ khi có nhu cầu ghi thật.

### 4.3 Hợp đồng helper

Giao thức khung-dài-đầu dòng JSON, mỗi yêu cầu có `id`, `op`, `args`, mỗi trả
lời có `id`, `ok`, `result | error`. Phiên bản giao thức trong lệnh `hello`.

Tập lệnh ban đầu, tất cả có schema tham số và biên cứng:

```text
hello            -> { protocol, helperVersion, platform, capabilities[] }
status           -> { uptime, activeOverrides[], lastError }
sensors.list     -> [{ id, kind: cpu|gpu|ambient|battery|other, label }]
sensors.read     -> [{ id, celsius }]
fans.list        -> [{ id, label, minRpm, maxRpm, currentRpm, mode: auto|manual }]
fans.setMode     ({ id, mode: auto })                       // luôn được phép
fans.setTarget   ({ id, rpm })                              // rpm kẹp vào [minRpm, maxRpm]
fans.restoreAll  ()                                         // mọi quạt về auto
```

Quy tắc an toàn nằm trong helper, không chỉ ở app:

- Mọi `setTarget` bị kẹp vào biên phần cứng báo. Giá trị ngoài biên bị từ chối,
  không được "làm tròn im lặng".
- Helper giữ **watchdog**: client phải gửi `status` hoặc lệnh bất kỳ trong mỗi
  N giây khi còn override. Hết hạn thì helper tự `fans.restoreAll`.
- Helper gọi `fans.restoreAll` khi client ngắt kết nối, khi nhận SIGTERM, và khi
  hệ thống báo sắp ngủ hoặc vừa dậy.
- Nhiệt độ vượt ngưỡng tuyệt đối (cấu hình trong helper, ví dụ 100 độ C cho CPU)
  thì helper trả quạt về auto bất kể lệnh app.
- Helper ghi log một dòng cho mỗi lệnh ghi, có timestamp và pid client, trong
  thư mục log hệ thống.

Phía main có `HelperClient` duy nhất trong `electron/helper/client.ts`: kết nối,
xác thực, hàng đợi lệnh, timeout, heartbeat, và phát sự kiện
`helper:connected | disconnected | degraded`. Module `thermal` dùng client này,
không mở kết nối riêng.

### 4.4 Cài đặt, cập nhật, gỡ

- **Cài**: khi người dùng bật lần đầu một capability cần helper, UI giải thích
  helper là gì, làm gì, cách gỡ, rồi mới gọi `capabilities.request`. macOS hiện
  hộp thoại hệ thống của SMAppService; Linux hiện pkexec; Windows hiện UAC.
- **Phiên bản**: helper mang phiên bản riêng; `hello` trả về. Nếu lệch so với
  bản app yêu cầu thì app đề nghị cập nhật helper (cài lại), không cố chạy với
  helper cũ.
- **Gỡ**: Settings có nút "Gỡ helper" gọi `fans.restoreAll` rồi hủy đăng ký dịch
  vụ. Gỡ app cũng phải gỡ helper (afterUninstall cho NSIS; macOS dựa vào
  SMAppService tự dọn khi app bị xóa, Linux cần script).
- **Runtime profile**: bản dev dùng tên dịch vụ và socket khác bản phát hành để
  hai bản không tranh nhau helper, nối tiếp đúng cách `runtimeProfile` tách
  userData và cổng hiện nay.

### 4.5 Những gì không cần helper

Nguyên tắc "không nâng quyền khi không cần" áp dụng ngay:

- Đọc cảm biến và tốc độ quạt trên macOS và Linux.
- Mọi việc Viezan đang làm hôm nay (osascript, defaults, mdfind).
- Giám sát trên Windows nếu thư viện cảm biến chạy được với quyền admin một lần
  thay vì dịch vụ thường trực (quyết định khi khảo sát thực tế).

---

## 5. Module `thermal` (áp dụng đầu tiên)

Phạm vi sản phẩm tối thiểu cho mỗi giai đoạn, không phải đặc tả UI.

- **Giám sát**: danh sách cảm biến nhiệt độ theo nhóm (CPU, GPU, khác), tốc độ
  từng quạt, tải CPU/GPU, lịch sử ngắn vài phút. Chu kỳ đọc 1 đến 2 giây, dừng
  khi cửa sổ ẩn và module không có override đang chạy. Có thể hiện trên tray.
- **Điều khiển**: ba chế độ cho mỗi quạt hoặc cho tất cả: tự động (mặc định hệ
  thống), cố định (RPM trong biên), theo đường cong (chọn cảm biến nguồn, các
  điểm nhiệt độ sang RPM, có hysteresis). Preset lưu được, có preset "Yên tĩnh"
  và "Mát".
- **An toàn trong UI**: lần đầu bật điều khiển hiện giải thích và miễn trừ trách
  nhiệm; luôn có nút "Về tự động" nổi bật; hiển thị trạng thái helper.
- **Ngoài phạm vi**: undervolt, giới hạn xung, điều khiển quạt trên Windows.

---

## 6. Lộ trình và tiêu chí hoàn thành

Mỗi giai đoạn là một hoặc vài PR riêng, có thể merge độc lập.

### Giai đoạn 0: nền tảng module (không đổi hành vi người dùng)

- Thêm registry module; chuyển bốn trang hiện có và Launcher thành module.
- `AppPage` dẫn xuất từ registry; sidebar, App, Settings, Command Palette đọc
  registry. Chưa có UI bật tắt module (tất cả bật).
- Hợp đồng preload một nguồn cho một module mẫu (hotkey) để chứng minh cách
  sinh kiểu và mock; các module khác chuyển dần.
- API `capabilities` ở main và preload; chuyển luồng Trợ năng và Spotlight sang
  API này; tạo `CapabilityNotice` dùng chung.

Hoàn thành khi: toàn bộ test hiện có pass, không đổi giao diện, thêm một module
giả trong test chỉ cần một file khai báo.

### Giai đoạn 1: giám sát nhiệt trên macOS và Linux

- Module `thermal` với đọc cảm biến không cần quyền: trên macOS qua binary nhỏ
  đọc SMC (CLI đi kèm app, giao tiếp stdout JSON, cùng mẫu với các lệnh ngoài
  hiện có nhưng là binary của Viezan, được ký cùng app); trên Linux đọc sysfs.
- Trang giám sát, mục Settings bật tắt module, tùy chọn tray.
- Windows: giám sát qua thư viện có sẵn nếu khảo sát cho thấy chạy được không
  cần dịch vụ; nếu không thì module báo "chưa hỗ trợ trên Windows" qua capability.

Hoàn thành khi: số liệu khớp với công cụ tham chiếu (Macs Fan Control, `sensors`)
trong sai số 1 độ và 50 RPM; CPU của app tăng dưới 1% khi giám sát.

### Giai đoạn 2: helper đặc quyền và điều khiển quạt trên macOS

- Bật ký Developer ID và notarize trong CI; entitlement cho helper.
- Helper Swift với hợp đồng mục 4.3, watchdog, restore khi ngắt, log.
- `HelperClient` trong main, API capability `thermal.fan.write`, luồng cài helper.
- UI điều khiển: cố định, đường cong, preset, nút về tự động.
- Kiểm thử bắt buộc: giết app khi đang override, máy ngủ dậy, helper không chạy,
  helper lệch phiên bản. Mỗi trường hợp quạt phải về auto.

Hoàn thành khi: toàn bộ kịch bản an toàn trên pass trên ít nhất một máy Intel và
một máy Apple Silicon.

### Giai đoạn 3: Linux ghi quạt, Windows đánh giá lại

- Helper Linux (pkexec hoặc systemd), cùng hợp đồng, cùng client.
- Windows: quyết định dựa trên khảo sát giai đoạn 1; mặc định giữ giám sát.

### Giai đoạn 4: module thứ hai dùng khung này

- Chọn một module không cần helper (clipboard hoặc OCR vùng chọn) để chứng minh
  khung module đủ tổng quát, trước khi thêm module cần helper thứ hai.

---

## 7. Rủi ro và quyết định cần người dùng

| Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- |
| Không có Developer ID hoặc không muốn notarize | Chặn giai đoạn 2 trên macOS | Quyết định sớm; giai đoạn 0 và 1 không cần |
| SMC không tài liệu, khóa khác nhau theo đời máy | Trung bình | Dùng danh sách khóa đã được cộng đồng xác nhận; capability báo "unsupported" khi không nhận diện được, không đoán |
| Can thiệp phần cứng gây hại | Thấp nếu có kẹp biên và watchdog | Quy tắc an toàn trong helper (mục 4.3), miễn trừ trong UI |
| Windows driver cảm biến bị chặn bởi AV | Cao | Không tự viết hay đóng gói driver; chỉ dùng thư viện có chữ ký hợp lệ, nếu không thì bỏ Windows ở phần đọc |
| Phạm vi phình to khi tái cấu trúc module | Trung bình | Giai đoạn 0 không đổi hành vi, có tiêu chí "thêm module giả chỉ một file" |
| Tăng kích thước app và thời gian build do binary gốc | Thấp | Binary nhỏ, tách theo nền tảng bằng `extraResources` như Ollama hiện nay |

Quyết định cần bạn chốt trước khi bắt đầu giai đoạn 2:

1. Có đăng ký Apple Developer Program và cho phép notarize trong CI không.
2. Có chấp nhận cài dịch vụ hệ thống (daemon) trên máy người dùng không, hay chỉ
   dùng helper chạy theo phiên (pkexec kiểu) với hộp thoại mật khẩu mỗi lần bật.
3. Windows: giữ ở mức giám sát hay bỏ hẳn khỏi module `thermal` cho tới khi có
   nhu cầu.

---

## 8. Việc cụ thể cho PR đầu tiên (giai đoạn 0, bước 1)

Để kiểm chứng kế hoạch bằng mã nhỏ trước khi tái cấu trúc rộng:

1. Tạo `shared/modules.d.ts` với kiểu `ModuleDefinition`, `ModuleId`.
2. Tạo `src/modules/registry.ts` liệt kê bốn module hiện có với `page`, nhãn
   i18n, biểu tượng; `AppPage` suy ra từ đây.
3. `PrimaryNavigationSidebar` và `App.tsx` đọc registry; test hiện có pass.
4. Tạo API `capabilities` ở main với hai capability đầu tiên là Trợ năng và
   Spotlight, bọc lại mã hiện có; `HotkeySection` dùng `CapabilityNotice`.

Bốn bước này không thêm tính năng, không đổi giao diện, và là nền để mọi module
sau đó đi vào theo cùng một cửa.
