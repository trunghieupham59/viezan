# Kế hoạch: module Ứng dụng (`apps`)

Trạng thái: bản thảo thiết kế, chưa có mã tính năng. Ngày: 2026-10-25.

Mục tiêu: một chỗ để nhìn toàn bộ ứng dụng trên máy và làm bốn việc mà macOS
không làm giúp: **gỡ sạch** (app và mọi dữ liệu nó để lại), **dọn tệp sót** của
app đã gỡ từ trước, **cập nhật** qua đúng kênh của từng app, và **quản mục khởi
động**. Đây là phần "Applications" của CleanMyMac (Uninstaller, Updater,
Extensions), làm lại theo nguyên tắc của Viezan: bằng chứng thay cho cơ sở dữ
liệu đóng, kênh của chính app thay cho tự tải bundle, và mọi thứ rời máy đều
được nói trước.

Module này là chị em của `cleanup` ([`storage-cleanup-module.md`](storage-cleanup-module.md)):
dùng chung lớp hành động tệp `electron/fileActions/` (Thùng rác, Hoàn tác, nhật
ký, danh sách cấm, id mờ) và toàn bộ mười nguyên tắc ở mục 2 của kế hoạch đó.
Tài liệu này chỉ ghi phần riêng. Không có mã.

---

## 1. Vì sao tách module riêng, và làm khác CleanMyMac ở đâu

Tách riêng vì ba lý do: cập nhật có hành vi mạng (tải appcast, hỏi App Store)
mà người dùng có thể muốn tắt độc lập với dọn dẹp; "Ứng dụng" là một đơn vị
sản phẩm tự đứng được (ai cũng cần gỡ app, không phải ai cũng cần treemap); và
khung module platform khuyến khích module nhỏ, bật tắt được.

| Điểm | CleanMyMac | Viezan `apps` |
| --- | --- | --- |
| Tìm tệp sót | Cơ sở dữ liệu riêng cộng heuristic, không giải thích | Theo bằng chứng: khớp bundle id chính xác thì tích sẵn, khớp tên hoặc team id thì chỉ hiện; mỗi mục nói vì sao nó được coi là của app này |
| App đang chạy | Tự thoát app | Nói rõ app đang chạy; "Thoát giúp" gửi lệnh thoát chuẩn (Apple Event) để app lưu dữ liệu; không bao giờ `kill` |
| Preferences | Xoá tệp plist | `defaults export` bản sao trước, rồi `defaults delete` để `cfprefsd` không tạo lại; khôi phục bằng `defaults import` |
| Mục cần root (receipt, daemon, helper tool) | Xoá bằng helper | Helper chuyển vào thư mục cách ly và có lệnh khôi phục; đường dẫn do helper suy ra từ receipt hoặc plist, không do app gửi |
| Cập nhật | Tải và thay bundle từ cơ sở dữ liệu của MacPaw | Điều phối kênh của chính app: Homebrew kiểm tra và cập nhật; App Store và Sparkle chỉ phát hiện rồi mở đúng nơi. Viezan không bao giờ tải hay thay bundle |
| Dữ liệu rời máy | Không nói | Bảng 4.7: nguồn nào gửi gì đi đâu, và nút tắt từng nguồn |
| Đặt lại app | Có | Có, với bản sao preferences và Hoàn tác |
| Tiện ích mở rộng | Liệt kê, bật tắt | Liệt kê qua `pluginkit`, bật tắt ở mức người dùng (đảo ngược được), giai đoạn sau |
| Nền tảng | macOS | macOS trước; cập nhật trên Windows qua `winget` và Linux qua `flatpak` là giai đoạn sau vì cùng mô hình "kênh của chính app" |

Những gì **cố ý không làm**:

- Không có máy chủ hay cơ sở dữ liệu phiên bản của riêng Viezan.
- Không tải, không thay bundle app, kể cả khi appcast có chữ ký: việc đó là
  của Sparkle trong chính app. Lý do: làm đúng nghĩa là viết lại bộ cài của
  Sparkle (ba kiểu gói, xác minh chữ ký và Team ID, thay bundle nguyên tử) và
  Viezan ký ad-hoc không phải chỗ đứng tốt cho vai trò đó.
- Không gỡ app hệ thống, app của Apple nằm dưới SIP, hay chính Viezan.
- Không "tối ưu" hay "sửa" app.

---

## 2. Nguyên tắc riêng của module

Áp dụng nguyên vẹn mười nguyên tắc của `cleanup` (id mờ, Thùng rác trước, stat
lại, danh sách cấm, helper chỉ nhận thao tác có tên, AI chỉ giải thích). Thêm:

1. **Không gỡ, không cập nhật app đang chạy.** Kiểm tra bằng `pgrep -f
   <bundle>/Contents/MacOS/`; nếu đang chạy, nút chính đổi thành "Thoát rồi
   gỡ". Thoát bằng `osascript -e 'tell application id "<bundleId>" to quit'`
   (lần đầu macOS hỏi quyền Tự động hoá cho từng app; UI nói trước), chờ tối đa
   15 giây, không thoát được thì dừng và nói rõ, không `kill`.
2. **Kênh của chính app.** Cập nhật chạy lệnh của Homebrew, `mas`, hoặc mở
   chính app để Sparkle của nó làm việc. Viezan chỉ là người điều phối.
3. **Không gửi danh sách app ra ngoài.** Chỉ dùng nguồn chạy trên máy
   (Homebrew, `mas`) và appcast của từng app có `SUFeedURL` (yêu cầu tới máy
   chủ của chính nhà phát triển, như app vẫn làm). Không có tra cứu tập trung:
   Viezan không hỏi Apple hay dịch vụ nào "app X có bản mới chưa".
4. **Tệp sót theo độ tin cậy, không theo tên gần giống.** `exact` = bundle id
   trùng; `vendor` = tiền tố reverse-DNS hoặc Team ID của nhà phát triển trùng;
   `name` = tên app xuất hiện trong tên thư mục. Chỉ `exact` được tích sẵn.
5. **Preferences qua `defaults`, có bản sao.** Xoá tệp plist trực tiếp không
   đủ vì `cfprefsd` giữ bản trong bộ nhớ và ghi lại. Luồng là `defaults export
   <domain> <tệp trong thư mục nhật ký>` rồi `defaults delete <domain>`; Hoàn
   tác là `defaults import`.
6. **Mục root đi qua helper bằng thao tác có tên, có cách ly.** Helper không
   xoá; nó chuyển vào `/Library/Application Support/Viezan/Quarantine/<phiên>/`
   và có lệnh khôi phục. Đường dẫn do helper suy ra từ receipt (`pkgutil`) hoặc
   từ plist trong `/Library/LaunchDaemons`, không nhận từ app.
7. **Một thao tác gỡ là một phiên nhật ký**, dù gỡ một app hay mười; Hoàn tác
   áp cho cả phiên.
8. **Dùng chung thì không đụng.** Một mục khớp ở mức `vendor` hoặc `name` bị
   loại khỏi danh sách gỡ (hiện mờ với lý do "dùng chung với X, Y") khi còn app
   khác đang cài có cùng Team ID, cùng tiền tố reverse-DNS hoặc cùng tên nhà
   phát triển. Ví dụ `~/Library/Group Containers/UBF8T346G9.Office` khi gỡ
   Outlook mà Word còn, `~/Library/Application Support/Google` khi gỡ Google
   Drive mà Chrome còn.
9. **Đang dùng thì bỏ qua.** Trước khi chuyển, một ảnh chụp `lsof -Fpcn` (một
   lần, chỉ tiến trình của người dùng) được lọc theo tiền tố đường dẫn của từng
   mục; mục có tệp đang mở bởi tiến trình không thuộc app đang gỡ → `in-use`,
   bỏ qua và báo tên tiến trình. Không có ngoại lệ "cứ xoá rồi tính".
10. **Gỡ xong phải kiểm lại.** Sau mỗi phiên, chạy lại tìm tệp sót cho bundle
    id đó và báo kết quả: "Đã gỡ sạch" hoặc "Còn N mục: M cần quyền quản trị,
    K đang dùng, J bạn đã bỏ chọn", mỗi nhóm có hành động tiếp theo.

---

## 3. Phạm vi sản phẩm

### 3.1 Kho ứng dụng

Nguồn liệt kê: `/Applications` (và một cấp thư mục con như `/Applications/Utilities`,
`/Applications/Adobe …`), `~/Applications`, `/Applications/Setapp`. Tái dùng
`scanLauncherApps` của `electron/services/launcherApps.ts` (đã có icon và cache)
và thêm phần siêu dữ liệu cho từng bundle:

| Trường | Nguồn | Ghi chú |
| --- | --- | --- |
| `bundleId`, tên hiển thị, `CFBundleShortVersionString`, `CFBundleVersion`, `SUFeedURL`, `LSMinimumSystemVersion` | `Info.plist` qua `plutil -convert json -o -` | Không parse plist nhị phân bằng tay |
| Team ID | `codesign -dv --verbose=2` (stderr `TeamIdentifier=`) | Dùng cho độ tin cậy `vendor` và cho xác minh cập nhật |
| Nguồn cài | `Contents/_MASReceipt/receipt` → App Store; nằm trong artifacts của một cask đã cài → Homebrew; `/Applications/Setapp/` → Setapp; `/System/Applications` hoặc Team ID của Apple → Hệ thống; còn lại → Tải trực tiếp | Hệ thống và chính Viezan là `blocked` |
| Mở lần cuối | `mdls -name kMDItemLastUsedDate -raw` trên bundle | Chỉ trên bundle app, không trên tệp thường |
| Kích thước app | Bộ quét của `cleanup` chạy trên bundle (trên đĩa và logic) | Bundle là một gói, không mở trong Space Lens |
| Kích thước dữ liệu | Tổng các vị trí ở 3.2 với độ tin cậy `exact` | Hiện riêng "App 1,2 GB · Dữ liệu 3,4 GB" |
| Đang chạy | `pgrep -f` | Làm mới khi cửa sổ lấy lại focus |

Danh sách có tìm kiếm, lọc theo nguồn, sắp xếp theo tên / kích thước / mở lần
cuối, và bộ lọc nhanh "Không dùng quá 180 ngày" (ngưỡng trong cài đặt).

### 3.2 Gỡ cài đặt

Vị trí dữ liệu được tìm cho mỗi app, với cách khớp và độ tin cậy:

| Vị trí | Khớp | Tin cậy |
| --- | --- | --- |
| `~/Library/Application Support/<x>` | `x` = bundle id | `exact`; `x` = tên app hoặc tên nhà phát triển → `name` |
| `~/Library/Caches/<bundleId>` | bundle id | `exact` |
| `~/Library/Preferences/<bundleId>.plist`, `ByHost/<bundleId>.*.plist` | bundle id | `exact`, xử lý qua `defaults` (nguyên tắc 5) |
| `~/Library/Containers/<bundleId>`, `~/Library/Group Containers/<teamId>.*` | bundle id / Team ID | `exact` / `vendor` |
| `~/Library/Saved Application State/<bundleId>.savedState` | bundle id | `exact` |
| `~/Library/HTTPStorages/<bundleId>`, `~/Library/WebKit/<bundleId>`, `~/Library/Cookies/<bundleId>.binarycookies` | bundle id | `exact` |
| `~/Library/Logs/<x>` | bundle id / tên | `exact` / `name` |
| `~/Library/LaunchAgents/<bundleId>*.plist` | tiền tố bundle id | `exact`; tắt bằng `launchctl bootout` trước khi chuyển |
| `~/Library/Application Scripts/<bundleId>` | bundle id | `exact` |
| `~/Library/Containers/<bundleId>.<ext>` (app extension, widget, Share) | tiền tố bundle id với ranh giới `.` | `exact` |
| Thư mục cache/tạm theo người dùng: `$(getconf DARWIN_USER_CACHE_DIR)/<bundleId>`, `$(getconf DARWIN_USER_TEMP_DIR)/<bundleId>` (dưới `/private/var/folders`) | bundle id | `exact` |
| `~/Library/Application Support/CrashReporter/<Tên app>_*.plist` | tên app | `name` |
| Plugin của app trong `~/Library/{QuickLook, Services, PreferencePanes, Internet Plug-Ins, Screen Savers, Spotlight, Mail/Bundles, Address Book Plug-Ins, Safari/Extensions}` | `CFBundleIdentifier` của plugin bắt đầu bằng bundle id hoặc Team ID của app | `exact` / `vendor` |
| Helper đặc quyền khai báo trong `Info.plist` (`SMPrivilegedExecutables`) → `/Library/PrivilegedHelperTools/<label>`, `/Library/LaunchDaemons/<label>.plist` | label | Qua helper (4.5) |
| Lưới thứ hai: `mdfind "kMDItemCFBundleIdentifier == '<bundleId>*'"` | bundle id | Bắt bundle con nằm ngoài các vị trí trên (plugin ở chỗ lạ, bản sao app ở Desktop); `exact`, hiện vị trí thật |
| Symlink mồ côi trong `/usr/local/bin`, `/opt/homebrew/bin`, `~/.local/bin`, `~/bin` trỏ vào bundle vừa gỡ | đích symlink | `exact`, chỉ sau khi bundle đã chuyển; thư mục không ghi được thì qua helper |
| Tài liệu do app tạo trong `~/Documents`, `~/Movies`… (ví dụ `~/Documents/Zoom`) | tên app | Không thuộc gỡ cài đặt; liệt kê riêng dưới "Tài liệu của bạn", không bao giờ tích sẵn |
| `/Library/Application Support/<x>`, `/Library/LaunchAgents`, `/Library/LaunchDaemons`, `/Library/PrivilegedHelperTools/<bundleId>*`, `/Library/Preferences/<bundleId>.plist` | bundle id / Team ID | Hiện với nhãn "cần quyền quản trị"; xử lý qua helper (4.5) |
| Receipt `pkgutil --pkgs` có id bắt đầu bằng bundle id hoặc reverse-DNS của nhà phát triển | tiền tố | Hiện số tệp (`pkgutil --files`); gỡ và `--forget` qua helper (4.5) |

Luồng gỡ: chọn một hoặc nhiều app → ngăn chi tiết liệt kê app và dữ liệu theo
độ tin cậy, `exact` tích sẵn → nút `Gỡ N ứng dụng` (`danger` · `outline`) → nếu
có app đang chạy, bước "Thoát" trước → hộp xác nhận một câu theo mẫu ("Chuyển
{count} ứng dụng và {items} mục dữ liệu ({size}) vào Thùng rác?") → một phiên
nhật ký qua `fileActions` → toast với Hoàn tác và "Mở Thùng rác". Preferences
đi theo nguyên tắc 5 trong cùng phiên.

**Đặt lại app**: giữ bundle, chuyển dữ liệu `exact` vào Thùng rác và xoá
preferences có bản sao; app mở lại như mới cài. Cùng luồng và cùng Hoàn tác.

**Không gỡ được ở đây** (`blocked`, kèm lý do và nơi xử lý): app trong
`/System/Applications`, app của Apple dưới SIP, Viezan, app do cấu hình MDM cài
(có profile quản lý), app Setapp ("quản lý trong Setapp").

#### 3.2.1 Ba bảo đảm của một lần gỡ

Hai yêu cầu kéo ngược nhau: không được đụng thứ app khác còn dùng, và phải xoá
sạch. Cách giải quyết là làm cả hai một cách có thể kiểm chứng, thay vì chọn
một.

**Không đụng thứ còn dùng**

- Quy tắc dùng chung (nguyên tắc 8) chạy trên toàn bộ kho app, không chỉ app
  đang gỡ. Một mục bị loại vì dùng chung vẫn hiện trong chi tiết, mờ, với tên
  các app còn dùng nó.
- Ranh giới tiền tố: `com.foo` khớp `com.foo` và `com.foo.helper`, không khớp
  `com.foobar`. Test riêng cho trường hợp này.
- Ảnh chụp `lsof` (nguyên tắc 9) chạy ngay trước khi chuyển, không phải lúc
  liệt kê, vì trạng thái "đang dùng" thay đổi theo giây.
- Không bao giờ nằm trong danh sách gỡ, dù khớp tên: mục Keychain, iCloud
  Drive, `~/Library/Mobile Documents`, phông chữ trong `~/Library/Fonts`, và
  tài liệu của người dùng (hàng "Tài liệu của bạn" ở bảng trên là danh sách
  riêng để xem, không phải phần của phiên gỡ).
- Preferences: xoá domain của app (`<bundleId>`, `<bundleId>.*`, `ByHost`);
  không đụng domain của nhà phát triển (`com.foo` khi gỡ `com.foo.app`) nếu
  còn app khác cùng tiền tố.

**Xoá sạch**

- Phạm vi tìm là toàn bộ bảng 3.2, cộng lưới thứ hai bằng Spotlight theo
  `kMDItemCFBundleIdentifier` để bắt bundle con nằm ở chỗ không ngờ.
- Tiến trình: `pgrep -f` bắt cả helper nằm trong bundle; Launch Agents của app
  được `bootout` trước khi chuyển plist; `SMPrivilegedExecutables` dẫn tới
  daemon và helper tool ở `/Library` (qua helper, cách ly).
- Sau khi bundle đã chuyển, tìm symlink mồ côi trong các thư mục `bin` của
  người dùng và Homebrew.
- Dọn dấu vết tuỳ chọn, tắt sẵn, mỗi cái một công tắc trong hộp xác nhận: gỡ
  ô Dock đã chết (sửa `persistent-apps` của `com.apple.dock` sau khi `defaults
  export`, rồi `killall Dock`), thu hồi quyền đã cấp (`tccutil reset All
  <bundleId>`; không hoàn tác được, app cài lại sẽ hỏi lại).

**Kiểm chứng**

- Lượt kiểm lại (nguyên tắc 10) dùng cùng mã tìm tệp sót với lần đầu, nên
  "Đã gỡ sạch" nghĩa là bộ tìm không còn thấy gì, không phải "đã chạy xong".
- Nhật ký của phiên ghi cả những mục **không** xoá và lý do (`shared-with`,
  `in-use`, `needs-admin`, `user-unchecked`), để người dùng xem lại sau.
- Hộp xác nhận liệt kê rõ ba cột: sẽ chuyển, bỏ qua vì dùng chung, bỏ qua vì
  đang dùng. Không có con số gộp che chi tiết.

### 3.3 Tệp sót của app đã gỡ

Quét các vị trí ở 3.2 tìm thư mục hoặc tệp có tên dạng reverse-DNS
(`com.x.y`, `org.…`, `io.…`) mà không app nào đang cài có bundle id, tiền tố
nhà phát triển hoặc Team ID tương ứng, và không có tiến trình nào đang chạy
dưới id đó. Loại trừ `com.apple.*`, các id trong danh sách bỏ qua của người
dùng, và mọi mục sửa trong 7 ngày qua (có thể là công cụ dòng lệnh đang dùng,
ví dụ `com.docker.*` khi chỉ còn CLI). Mỗi nhóm hiện bundle id, tổng kích
thước, ngày sửa gần nhất, và nút "Hỏi AI" dùng dịch vụ giải thích của
`cleanup` (từ điển offline trước, model local sau). Tất cả là `review`, không
tích sẵn; "Bỏ qua id này" thêm vào danh sách bỏ qua.

### 3.4 Cập nhật: điều phối kênh

Viezan là một bảng tổng hợp "app nào đã lỗi thời" cộng một nút đưa người dùng
tới đúng kênh của app đó. Chỉ Homebrew được Viezan chạy cập nhật hộ, vì đó là
một lệnh hoàn chỉnh của chính công cụ; mọi kênh khác chỉ **phát hiện và mở**.
Đo trên máy phát triển (2026-10-25): 25 app, 15 qua Homebrew cask, 7 qua App
Store, 4 có Sparkle (3 trong đó cũng là cask), nên bảng này phủ gần hết mà
không cần Viezan tự cài gì.

| Nguồn | Nhận diện | Kiểm tra | Hành động | Dữ liệu rời máy |
| --- | --- | --- | --- | --- |
| Homebrew cask | App nằm trong `artifacts` của `brew info --cask --installed --json=v2` | `brew outdated --cask --greedy --json=v2` (so với tap đã có; nút "Làm mới Homebrew" chạy `brew update` có tiến độ) | **Cập nhật**: `brew upgrade --cask <token>` (thêm `--greedy` khi cask `auto_updates`), chạy nền có tiến độ, huỷ được | Homebrew tự gọi GitHub và máy chủ của từng cask |
| App Store | `_MASReceipt` | `mas outdated` khi có `mas`; không có `mas` thì không kiểm tra được, hàng hiện "xem trong App Store" | **Mở**: trang Cập nhật của App Store (`macappstore://showUpdatesPage?scan=true`) | Chỉ khi có `mas`: như App Store vẫn gửi, qua tài khoản của người dùng |
| Sparkle | `SUFeedURL` trong `Info.plist` | Tải appcast, chọn item mới nhất của kênh mặc định có `sparkle:minimumSystemVersion` ≤ macOS hiện tại, so `sparkle:version` với `CFBundleVersion` (rơi về short version) bằng bộ so sánh kiểu Sparkle | **Mở**: `open -a`, Sparkle của app hiện hộp thoại cập nhật của nó | Yêu cầu GET appcast tới máy chủ của nhà phát triển, đúng như app vẫn làm |
| Setapp | Đường dẫn | Không | **Mở**: Setapp | Không |
| Viezan | Chính nó | Luồng updater sẵn có (`window.api.updater`) | **Mở**: luồng sẵn có | Như hiện nay (GitHub Releases) |
| Tải trực tiếp, không Sparkle | Không có feed | Không kiểm tra được | Hiện "không theo dõi được"; mở trang nhà phát triển nếu `brew info` của một cask cùng tên có `homepage` | Không |
| Công cụ dòng lệnh Homebrew (tuỳ chọn, tắt sẵn) | `brew outdated --formula --json=v2` | Cùng cơ chế | **Cập nhật**: `brew upgrade <formula>` | Như cask |

Hành vi chung:

- Kiểm tra chỉ chạy khi người dùng mở khung nhìn hoặc bấm "Kiểm tra" (mặc
  định `updateCheck: 'manual'`). Kiểm tra nền (hằng ngày, chỉ nguồn rẻ, thông
  báo hệ điều hành với số lượng) là tuỳ chọn ở giai đoạn P5.
- Danh sách hiện: icon, tên, `đang cài → có sẵn`, chip nguồn, nhãn "tự cập
  nhật" cho cask `auto_updates` hoặc app có Sparkle tự động, ngày phát hành
  nếu biết. Ngăn chi tiết: ghi chú phát hành (appcast `description` hoặc
  `sparkle:releaseNotesLink` lấy về và hiện dạng chữ thuần, không chạy
  script; Homebrew `homepage`; App Store: "xem trong App Store"), kích thước
  tải nếu biết.
- "Cập nhật tất cả (N)" chỉ gom app Homebrew. Hàng App Store, Sparkle và
  Setapp có nút `Mở` riêng và một dòng nói vì sao Viezan không chạy hộ.
- Mỗi lần cập nhật Homebrew là một phiên nhật ký loại `update` với lệnh, mã
  thoát và phiên bản trước/sau; không có Hoàn tác (Homebrew không hỗ trợ quay
  lại), nhật ký nói rõ. Thao tác `Mở` không tạo phiên.
- "Bỏ qua phiên bản này" và "Không theo dõi app này" lưu trong cài đặt.
- App đang chạy: trước khi `brew upgrade` chạy luồng Thoát của nguyên tắc 1.
- Đã cân nhắc và bỏ (2026-10-25): tự tải và cài từ appcast với xác minh EdDSA
  và Team ID, và tra cứu phiên bản App Store theo bundle id. Lý do ở mục 1.

### 3.5 Khởi động

| Loại | Nguồn | Làm được |
| --- | --- | --- |
| Launch Agents của người dùng | `~/Library/LaunchAgents/*.plist`, trạng thái qua `launchctl print gui/<uid>/<label>` | Tắt: `launchctl bootout gui/<uid> <plist>` rồi chuyển plist vào Thùng rác (phiên nhật ký, Hoàn tác = khôi phục + `bootstrap`) |
| Login Items và "Cho phép chạy nền" | Đăng ký qua `SMAppService`, app thứ ba không đọc được đầy đủ | Liệt kê phần đọc được từ `Contents/Library/LoginItems` của các app; nút mở `x-apple.systempreferences:com.apple.LoginItems-Settings.extension` |
| Launch Agents và Daemons toàn máy | `/Library/LaunchAgents`, `/Library/LaunchDaemons` (đọc không cần quyền) | Xem; tắt qua helper `launchd.disable` (4.5) với cách ly và khôi phục |
| System extensions | `systemextensionsctl list` | Xem; gỡ phải do chính app làm, nút mở app |

### 3.6 Tiện ích mở rộng (giai đoạn sau)

Liệt kê qua `pluginkit -m -v -p <protocol>` (Safari, Finder Sync, Share, Quick
Look, Spotlight importer) và theo thư mục (`~/Library/QuickLook`,
`PreferencePanes`, `Internet Plug-Ins`, `Screen Savers`). Bật tắt ở mức người
dùng bằng `pluginkit -e ignore|use -i <id>` (đảo ngược được); xoá bundle trong
`~/Library` qua `fileActions`.

---

## 4. Kiến trúc

### 4.1 Vị trí trong khung module

| Thành phần | Tệp | Ghi chú |
| --- | --- | --- |
| Kiểu dùng chung | `shared/appsApi.d.ts` | Nguồn duy nhất cho `window.api.apps` |
| Id module | `PageModuleId` thêm `'apps'`; `APP_MODULE_IDS`; `catalog.ts` (`space: 'system'`, `nav_apps`, từ khoá `apps, uninstall, remove, update, upgrade, leftovers, login items, launch agents`); `pages.ts` | Mặc định bật trên macOS; Linux/Windows tắt cho tới khi có kho app cho hệ đó |
| Runtime main | `electron/apps/index.ts` (`createAppsRuntime(deps)`) | `deps` gồm `fileActions`, `helper`, `capabilities`, `explain` (dịch vụ của `cleanup`), `scanDirectory` (bộ quét của `cleanup` để đo bundle) |
| IPC | `electron/apps/ipc.ts`, kênh `apps:*` | Validate, id mờ từ `itemRegistry` |
| Kho app | `electron/apps/inventory.ts` (trên `launcherApps.ts`), `bundleInfo.ts`, `appSources.ts` | Cache theo mtime của bundle |
| Gỡ | `electron/apps/residues.ts`, `uninstall.ts`, `preferences.ts` (`defaults` export/delete/import), `quit.ts` | Mọi xoá qua `fileActions` |
| Tệp sót | `electron/apps/leftovers.ts` | Dùng `residues.ts` theo chiều ngược |
| Cập nhật | `electron/apps/updates/{homebrew,mas,sparkle,viezan}.ts`, `versionCompare.ts`, `appcast.ts`, `updateRunner.ts` | Mỗi nguồn một tệp, cùng interface `UpdateSource` (`detect`, `check`, `openTarget`); chỉ `homebrew` có `apply`, `updateRunner.ts` chỉ chạy nó |
| Khởi động | `electron/apps/startup/{launchAgents,loginItems,daemons,systemExtensions}.ts` | |
| Lệnh ngoài | `electron/apps/tools.ts`: tìm `brew` ở `/opt/homebrew/bin`, `/usr/local/bin`, `~/.linuxbrew`; `mas` cạnh `brew`; không đoán PATH | `execFile`, không shell, timeout, `NO_COLOR=1`, `HOMEBREW_NO_AUTO_UPDATE=1`, `HOMEBREW_NO_ENV_HINTS=1` |
| Cài đặt | `electron/apps/settingsStore.ts` → `apps.json` | Mẫu `thermal/settingsStore.ts` |
| Capability | `apps.inventory`, `apps.homebrew`, `apps.mas`, `helper.admin` (dùng chung với `cleanup`) | `CapabilityNotice` |
| Renderer | `src/pages/AppsPage.tsx`, organisms `src/components/organisms/apps/*`, hooks `useAppsInventory`, `useAppUninstall`, `useAppUpdates`, `useStartupItems`, `useAppsSettings` | |
| Thiết kế | `docs/design/screens/apps.md`, `docs/design/specs/apps.html` | Viết cùng PR đầu |

### 4.2 Hợp đồng `window.api.apps`

```text
getSupport()                              -> { supported, features: { uninstall, leftovers, updates: { homebrew, mas, sparkle }, startup, root } }

inventory.list({ refresh? })              -> { apps: InstalledApp[], scannedAt }
inventory.onChanged(cb)
app.detail(appId)                         -> { app, sizes: { bundle, data }, residues: Residue[], receipts: Receipt[], update?: UpdateCandidate }
app.quit(appId)                           -> { running: boolean }           // Apple Event, chờ tối đa 15 s
app.uninstall([{ appId, residueIds }])    -> { sessionId }                  // fileActions, một phiên
app.reset(appId, { residueIds })          -> { sessionId }
app.reveal(appId)

leftovers.list()                          -> LeftoverGroup[]
leftovers.clean(ids)                      -> { sessionId }
leftovers.ignore(bundleId)

updates.check({ sources? })               -> { checkId }
updates.onProgress(cb)                    -> { checkId, source, state }
updates.onResult(cb)                      -> { checkId, candidates: UpdateCandidate[], errors: [{ source, message }] }
updates.apply(appIds)                     -> { runId, rejected: [{ appId, reason: 'not-homebrew' | 'running' }] }   // chỉ app Homebrew
updates.onRunProgress(cb)                 -> { runId, appId, line }          // dòng stdout đã lọc
updates.cancel(runId)
updates.open(appId)                       -> {}                             // App Store: trang Cập nhật; Sparkle: mở app; Setapp: mở Setapp; Viezan: luồng updater
updates.ignore(appId, version | '*')
updates.refreshHomebrew()                 -> { runId }                      // brew update

startup.list()                            -> { agents, daemons, loginItemsUrl, systemExtensions }
startup.setAgent(id, enabled)             -> { sessionId }                  // user agents
startup.setDaemon(id, enabled)            -> qua helper (4.5)

journal.list()                            -> phiên của module này
settings.get() / update(patch) / onChanged(cb)
```

`appId`, `residueId`, id tệp sót là id mờ của `itemRegistry` gắn với lần liệt
kê hiện tại. Không có API nào nhận đường dẫn hay bundle id tuỳ ý để xoá.

### 4.3 Cài đặt (`apps.json`)

```text
unusedDays:          180
updateCheck:         'manual' | 'daily'            // 'daily' là P5
updateSources:       { homebrew: true, mas: true, sparkle: true, homebrewFormulae: false }
ignoredUpdates:      [{ bundleId, version | '*' }]
ignoredLeftovers:    string[]                      // bundle id
```

### 4.4 Capability

| Id | `supported` | `permission` | `request` |
| --- | --- | --- | --- |
| `apps.inventory` | macOS (Linux/Windows sau) | `not-required` | — |
| `apps.homebrew` | tìm thấy `brew` | `not-required` | — |
| `apps.mas` | tìm thấy `mas` | `not-required` | — |
| `helper.admin` | macOS có helper | `granted` khi helper đang kết nối | khởi chạy helper theo phiên (dùng chung với `cleanup`, trước đây gọi là `cleanup.root`) |

### 4.5 Thao tác qua helper

Thêm vào helper cùng họ với `maintenance.*` của `cleanup`:

```text
pkg.uninstall { id }        // id phải có trong `pkgutil --pkgs`; helper đọc `pkgutil --files`,
                            // chỉ chuyển các tệp nằm dưới /Library, /usr/local, /opt vào Quarantine,
                            // bỏ qua mọi đường dẫn khác, rồi `pkgutil --forget`
launchd.disable { label }   // plist phải tồn tại trong /Library/LaunchDaemons hoặc /Library/LaunchAgents (không /System);
                            // `launchctl bootout`, chuyển plist và tệp `Program`/`ProgramArguments[0]` nếu nằm trong
                            // /Library/PrivilegedHelperTools hoặc /Library/Application Support vào Quarantine
launchd.restore { label }   // chuyển lại từ Quarantine và `bootstrap`
quarantine.list             // các phiên còn trong /Library/Application Support/Viezan/Quarantine
quarantine.purge { session }// xoá thật một phiên cách ly (xác nhận riêng trong UI)
```

Helper ghi một dòng log mỗi tệp chuyển; từ chối `id`/`label` không khớp regex
reverse-DNS hoặc không tồn tại; không nhận đường dẫn. `label` khớp
`^[A-Za-z0-9._-]{3,200}$` và phải trùng tên tệp plist.

### 4.6 So sánh phiên bản

`versionCompare.ts` theo cách của Sparkle: tách chuỗi thành đoạn số và đoạn
chữ, so số theo giá trị, chữ theo thứ tự, đoạn thiếu coi là 0; `1.10` > `1.9`;
`2.0b3` < `2.0`. Có test với bộ mẫu lấy từ các app thật trên máy phát triển.

### 4.7 Dữ liệu rời máy

| Khi nào | Đi đâu | Gồm gì | Tắt ở đâu |
| --- | --- | --- | --- |
| Kiểm tra Homebrew | GitHub và máy chủ của từng cask, do `brew` gọi | Như `brew` vẫn gửi | `updateSources.homebrew` |
| Kiểm tra Sparkle | Máy chủ của nhà phát triển từng app | Yêu cầu GET appcast; Viezan không gửi thêm tham số nào ngoài User-Agent của chính nó | `updateSources.sparkle`, hoặc từng app |
| `mas outdated` (chỉ khi có `mas`) | Apple, qua tài khoản App Store của người dùng | Như App Store vẫn gửi | `updateSources.mas` |
| Hỏi AI về tệp sót | Model local; đám mây chỉ khi đồng ý từng câu | Đường dẫn rút gọn, tên con, không nội dung | Chính sách của `cleanup` |

Không có yêu cầu mạng nào khác. Liệt kê, gỡ, tệp sót và khởi động chạy hoàn
toàn trên máy.

---

## 5. Giao diện

Cùng khung với `cleanup` và Nhiệt độ: `PageHeader` với chip, nút chính và bánh
răng; pill chọn khung nhìn trong toolbar; `app-panel-grid` hai cột từ 900 px.
Đặc tả đầy đủ ở `docs/design/screens/apps.md` viết trong PR đầu.

```
┌ PageHeader ───────────────────────────────────────────────────────────────────────┐
│ Ứng dụng        [● 128 ứng dụng · 4 cập nhật]              [Kiểm tra cập nhật] [⚙] │
├ .apps-body ───────────────────────────────────────────────────────────────────────┤
│ [Gỡ cài đặt] [Tệp sót] [Cập nhật] [Khởi động]                                        │
│ ┌ Danh sách (.glass-panel) ──────────────┐ ┌ Chi tiết (.glass-panel) ─────────────┐ │
│ │ 🔍 Tìm   [Nguồn ▾] [Sắp xếp ▾] [Không dùng 180 ngày] │ Slack            4.41.97 · Homebrew │ │
│ │ ☐ Slack          App 512 MB · Dữ liệu 2,1 GB │ │ App 512 MB · Dữ liệu 2,1 GB · mở 2 ngày trước │
│ │ ☐ Figma          App 380 MB · Dữ liệu 640 MB │ │ ● Đang chạy  [Thoát giúp]                │ │
│ │ ☐ OldTool        App 90 MB · mở 14 tháng trước│ │ ☑ ~/Library/Application Support/Slack   1,9 GB · bundle id │
│ │ …                                           │ │ ☑ ~/Library/Caches/com.tinyspeck.slackmacgap 180 MB │
│ │                                             │ │ ☐ ~/Library/Logs/Slack                   8 MB · tên │
│ │                                             │ │ ☑ Preferences com.tinyspeck.slackmacgap   (sao lưu rồi xoá) │
│ ├─────────────────────────────────────────────┤ │ [Hiện trong Finder] [Đặt lại]  [Gỡ ứng dụng] │
│ │ Đã chọn 0 · 0 B                             │ └──────────────────────────────────────────┘ │
│ └─────────────────────────────────────────────┘                                              │
└───────────────────────────────────────────────────────────────────────────────────┘
```

- **Gỡ cài đặt**: trái là danh sách có chọn nhiều và thanh tổng ở đáy ("Đã
  chọn 3 · 4,2 GB" và nút `Gỡ 3 ứng dụng`, `danger` · `outline`, `md`); phải
  là chi tiết app đang chọn với dữ liệu theo độ tin cậy, mỗi hàng ghi lý do
  khớp ("bundle id", "nhà phát triển", "tên"). App `blocked` hiện lý do thay
  nút Gỡ.
- **Tệp sót**: danh sách nhóm theo bundle id với kích thước và ngày sửa; chi
  tiết liệt kê từng đường dẫn, "Hỏi AI", "Bỏ qua id này"; nút `Dọn` cùng mẫu
  `cleanup`.
- **Cập nhật**: danh sách theo nguồn, hàng `đang cài → có sẵn`, chip nguồn,
  nhãn "tự cập nhật"; nút chính trong header là `Kiểm tra cập nhật`
  (`primary` · `solid`) và đổi thành `Dừng` khi đang chạy; `Cập nhật tất cả
  (N)` trong toolbar danh sách chỉ đếm app Homebrew; hàng Homebrew có nút
  `Cập nhật`, hàng App Store / Sparkle / Setapp / Viezan có nút `Mở` (cùng cỡ
  `sm`, `neutral` · `outline`); chi tiết có ghi chú phát hành dạng chữ, "Bỏ
  qua phiên bản", "Không theo dõi". Khi đang cập nhật, hàng đó hiện dòng
  stdout cuối và nút huỷ.
- **Khởi động**: ba thẻ (Agents của bạn với công tắc; Login Items với nút mở
  System Settings và lời giải thích vì sao không tắt được ở đây; Toàn máy với
  chip helper và công tắc chỉ bật khi helper kết nối).
- **Trạng thái**: đang liệt kê lần đầu (skeleton danh sách), trống ("Không có
  tệp sót" / "Mọi ứng dụng đã mới" trung tính), lỗi theo nguồn (một nguồn lỗi
  không che kết quả nguồn khác; dòng lỗi dưới danh sách với "Thử lại"), thiếu
  công cụ (`CapabilityNotice` "Chưa có Homebrew/mas" với liên kết cài), app
  đang chạy, helper chưa kết nối, module tắt.
- **Bánh răng**: `ConfigSection` cho ngưỡng không dùng, nguồn cập nhật (từng
  công tắc với một dòng "gửi gì đi đâu" từ bảng 4.7), kiểm tra nền (P5), danh
  sách bỏ qua, helper và thư mục cách ly (liệt kê, xoá thật có xác nhận).
- **Trang chủ**: `HomeAppsCard`: số cập nhật có sẵn (từ lần kiểm tra gần
  nhất, không tự kiểm tra), tổng tệp sót, nút mở trang. Chỉ hiện khi module bật.
- **Thanh điều hướng**: `useBackgroundStatus` thêm "Đang cập nhật 3 ứng dụng"
  khi có `runId` đang chạy mà người dùng rời trang.
- **Chữ**: tiếng Việt gốc; "Gỡ" cho uninstall, "Đặt lại" cho reset, "Tệp sót"
  cho leftovers, "Cập nhật" cho update, giữ nguyên trong mọi màn hình; câu có
  số dùng một khoá với placeholder.

---

## 6. Lộ trình: mỗi bước một PR

Nhánh `feat/apps-*` từ `develop`. Phụ thuộc: P1 cần PR B của `cleanup`
(`electron/fileActions/`); P4 cần PR #149 và PR D của `cleanup` (helper
`maintenance.*`, capability `helper.admin`).

### P1. Kho ứng dụng và gỡ sạch

- Id module, kiểu, kênh, preload, mock (kho app giả cho web preview), cài đặt,
  `inventory.ts`, `bundleInfo.ts`, `appSources.ts`, `residues.ts`, `quit.ts`,
  `preferences.ts`, `uninstall.ts`, khung nhìn Gỡ cài đặt, đặt lại, i18n ba
  ngôn ngữ, đặc tả màn hình.
- Hoàn thành khi: test `residues.ts` với cây `~/Library` giả cho ba độ tin cậy
  và không khớp nhầm app cùng tiền tố (`com.foo` với `com.foobar`); test quy
  tắc dùng chung với hai app giả cùng Team ID (gỡ một app thì Group Container
  chung bị loại, gỡ cả hai thì được đưa vào); test ảnh chụp `lsof` giả đánh dấu
  `in-use` và phiên bỏ qua đúng mục; test `preferences.ts` xuất rồi nhập lại
  bằng nhau; QA thật trong `HOME` tạm: cài một app thử nghiệm, tạo dữ liệu, gỡ
  → lượt kiểm lại báo "Đã gỡ sạch", Hoàn tác trả lại đủ; giữ một tệp trong thư
  mục dữ liệu mở bằng `tail -f` → mục đó `in-use`, phần còn lại vẫn gỡ; app
  đang chạy → luồng Thoát; app `blocked` không có nút.

### P2. Tệp sót và Khởi động (người dùng)

- `leftovers.ts`, khung nhìn Tệp sót với "Hỏi AI" (dịch vụ của `cleanup`,
  hoặc chỉ từ điển offline nếu PR E của `cleanup` chưa có), `launchAgents.ts`,
  `loginItems.ts`, `systemExtensions.ts`, khung nhìn Khởi động trừ phần toàn
  máy.
- Hoàn thành khi: tệp sót không liệt kê id của app đang cài hay đang chạy;
  tắt rồi bật lại một Launch Agent thử nghiệm hoạt động; Login Items mở đúng ngăn.

### P3. Cập nhật

- `tools.ts`, `UpdateSource` với Homebrew, `mas`, Sparkle, Viezan;
  `appcast.ts`, `versionCompare.ts`, `updateRunner.ts` (chỉ Homebrew: tiến độ,
  huỷ, nhật ký), `updates.open`, khung nhìn Cập nhật, cài đặt nguồn, bảng dữ
  liệu rời máy trong bánh răng.
- Hoàn thành khi: `versionCompare` qua bộ mẫu; `appcast.ts` parse đúng appcast
  của ít nhất bốn app thật (có trên máy phát triển: AdGuard, AppCleaner, Maccy,
  XKey) và chọn đúng item theo `minimumSystemVersion`; khi mọi nguồn tắt thì
  không có yêu cầu mạng nào (test với fetch giả); `updates.apply` từ chối app
  không phải Homebrew với `not-homebrew`; `brew upgrade` một cask thử nghiệm
  chạy nền, huỷ được, nhật ký ghi mã thoát; app đang chạy đi qua luồng Thoát
  trước; nút `Mở` của một app App Store mở trang Cập nhật, của một app Sparkle
  mở app đó.

### P4. Mục cần quyền quản trị (sau PR #149 và `cleanup` D)

- Lệnh `pkg.uninstall`, `launchd.disable/restore`, `quarantine.*` trong helper;
  receipt và tệp `/Library` trong chi tiết app; phần Toàn máy của Khởi động;
  quản lý thư mục cách ly trong bánh răng.
- Hoàn thành khi: helper từ chối `label` không tồn tại hay có `/`; tệp ngoài
  các tiền tố cho phép trong receipt bị bỏ qua và ghi log; `disable` rồi
  `restore` một daemon thử nghiệm đưa hệ thống về đúng trạng thái; log một
  dòng mỗi tệp.

### P5. Mở rộng

- Tiện ích mở rộng (3.6); kiểm tra cập nhật nền opt-in với thông báo hệ điều
  hành; công cụ dòng lệnh Homebrew; Windows (`winget upgrade`, kho app từ
  registry Uninstall, Recycle Bin) và Linux (`flatpak remote-ls --updates`,
  `~/.local/share/applications`), cùng mô hình điều phối kênh: `winget` và
  `flatpak` được chạy hộ như Homebrew vì cũng là lệnh hoàn chỉnh của công cụ.

---

## 7. Kiểm thử và QA

- Đơn vị: `residues.ts`, `leftovers.ts`, `versionCompare.ts`, `appcast.ts`,
  `appSources.ts` (nhận diện nguồn từ cây giả), parser JSON của `brew` và
  `mas`, validate IPC, `preferences.ts` với `defaults` giả.
- Tích hợp: handler đủ cho mọi kênh `apps:*`; preload khớp interface; mọi xoá
  đi qua `fileActions` (test kiểm tra không có `fs.rm`/`unlink` trong
  `electron/apps/`).
- Electron thật: harness Playwright `_electron` với một app thử nghiệm dựng
  sẵn (bundle rỗng có `Info.plist`, dữ liệu giả trong `~/Library` của một
  `HOME` tạm) để QA gỡ, đặt lại, Hoàn tác, Launch Agent; không chạy trên app
  thật của máy phát triển.
- UI: web preview 1200/820 px, sáng/tối, ba cỡ chữ, ba ngôn ngữ; `check:atomic`,
  `check:design`; rà literal thủ công.

---

## 8. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- |
| Gỡ nhầm dữ liệu của app khác cùng tiền tố | Cao | Khớp chính xác mới `exact`; tiền tố cần dấu `.` ranh giới; test riêng cho trường hợp `com.foo`/`com.foobar` |
| Gỡ mất thư mục dùng chung của một bộ app (Office, Adobe, Google) | Cao | Quy tắc dùng chung chạy trên toàn kho app; mục dùng chung bị loại kèm tên app còn dùng; test với hai app giả cùng Team ID |
| Xoá tệp đang được tiến trình khác dùng | Trung bình | Ảnh chụp `lsof` ngay trước khi chuyển; `in-use` bỏ qua và báo tên tiến trình |
| Người dùng tưởng đã sạch nhưng còn sót | Trung bình | Lượt kiểm lại bằng cùng bộ tìm; nhật ký ghi mục không xoá và lý do |
| `cfprefsd` ghi lại preferences đã xoá | Trung bình | Luôn `defaults delete`, không xoá plist tay; bản sao để Hoàn tác |
| `mas outdated` hỏng trên bản macOS mới | Thấp | Chỉ dùng để phát hiện; hành động luôn là mở App Store; lỗi `mas` không chặn nguồn khác |
| Appcast độc hại hoặc sai | Thấp | Chỉ parse XML và hiện chữ thuần, không theo liên kết tự động; không bao giờ tải hay cài từ appcast |
| `brew upgrade` làm hỏng app đang chạy | Trung bình | Luồng Thoát trước; chạy nền có log; nhật ký ghi phiên bản trước/sau |
| Hộp thoại Tự động hoá khi "Thoát giúp" gây khó hiểu | Thấp | Giải thích trước lần đầu; luôn có cách thoát tay ("Hiện ứng dụng") |
| Helper nhận `label`/`id` lạ | Cao nếu làm sai | Regex, tồn tại trên đĩa, không `/System`, cách ly thay vì xoá, log |
| Người dùng tưởng "Cập nhật tất cả" gồm cả App Store và Sparkle | Thấp | Nút đếm đúng số app Homebrew; mỗi hàng khác có nút `Mở` riêng và một dòng giải thích |

---

## 9. Quyết định

**Đã chốt với người dùng (2026-10-25):**

- **Cập nhật là điều phối kênh, không tự cài.** Homebrew: kiểm tra và cập
  nhật hộ. App Store và Sparkle: chỉ phát hiện rồi mở đúng nơi (trang Cập nhật
  của App Store, chính app). Bỏ hẳn chế độ tự cài từ appcast và tra cứu App
  Store theo bundle id.
- **Gỡ phải nghiêm ngặt theo cả hai chiều** (3.2.1): không đụng mục dùng
  chung hay đang dùng, và kiểm lại sau khi gỡ để nói được "đã sạch".

**Cần bạn xác nhận hoặc đổi:**

1. **Tách module `apps`** khỏi `cleanup` (lý do ở mục 1), nhãn "Ứng dụng" /
   "Applications" / "アプリ", nhóm HỆ THỐNG.
2. **Thứ tự P1 → P5**, P1 sau PR B của `cleanup`.
3. **"Thoát giúp" qua Apple Event**, chấp nhận hộp thoại Tự động hoá lần đầu
   cho từng app; không dùng tín hiệu tiến trình.
4. **Mục root chuyển vào thư mục cách ly** thay vì xoá, với lệnh khôi phục và
   nút xoá thật riêng.
5. **Capability helper chung** tên `helper.admin` cho cả `cleanup` và `apps`.
6. **Windows/Linux** ở P5 qua `winget`/`flatpak`; module tắt mặc định ở hai hệ
   đó cho tới lúc ấy.
