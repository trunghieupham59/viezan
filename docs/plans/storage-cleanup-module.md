# Kế hoạch: module Dung lượng & dọn dẹp (`cleanup`)

Trạng thái: thiết kế tổng thể; phần đầu đã có mã, xem ghi chú bên dưới. Ngày thiết kế: 2026-10-25.

Cập nhật triển khai 2026-10-26: checkout có nền `electron/fileActions/` trên
macOS và màn hình Ứng dụng cho gỡ/đặt lại từng app trong quyền người dùng.
Phạm vi chính xác và phần còn thiếu nằm ở
[`screens/apps.md`](../design/screens/apps.md). Các giai đoạn dưới đây là
lộ trình đầy đủ, không phải danh sách tính năng đã giao. Chưa có trang Cleanup.
Helper hiện dùng daemon ở bản phát hành và session ở dev; tham chiếu “chờ #149”,
helper luôn chạy theo phiên và số bước D/E/F/G trong bản thảo cần được chốt lại
khi làm phần quản trị. Bản đầu này không thêm lệnh vào helper đặc quyền.


Mục tiêu: thêm vào Viezan một module quản lý dung lượng và dọn dẹp máy cùng
hạng với CleanMyMac về độ phủ tính năng, nhưng vượt nó ở bốn điểm mà người
dùng kỹ tính quan tâm: **minh bạch** (biết chính xác thứ gì sẽ đi đâu và vì
sao), **luôn khôi phục được** (Thùng rác và Hoàn tác là mặc định, xoá vĩnh viễn
là ngoại lệ có tên), **hiểu developer** (rác build, kho gói, simulator, Docker)
và **AI local-first giải thích thay vì hù doạ**.

Module này là "module thứ hai dùng khung module platform" theo giai đoạn 4 của
[`module-platform-and-privileged-helper.md`](module-platform-and-privileged-helper.md).
Tài liệu này mô tả sản phẩm, kiến trúc, hợp đồng, quy tắc an toàn và lộ trình.
Không có mã.

Gỡ cài đặt sạch, tệp sót của app đã gỡ, cập nhật ứng dụng và mục khởi động
thuộc module chị em **`apps`** (Ứng dụng), kế hoạch riêng tại
[`apps-module.md`](apps-module.md). Hai module dùng chung một lớp hành động tệp
(Thùng rác, Hoàn tác, nhật ký, danh sách cấm; mục 4.4) và cùng các nguyên tắc ở
mục 2.

---

## 1. Vì sao làm, và làm khác CleanMyMac ở đâu

| Điểm | CleanMyMac | Viezan `cleanup` |
| --- | --- | --- |
| Người dùng biết gì trước khi bấm Dọn | Tổng dung lượng theo nhóm, chi tiết phải mở từng lớp | Mỗi mục có đường dẫn thật, kích thước **đo thật trên đĩa**, lý do an toàn, và hệ quả sau khi xoá ("app tự tạo lại", "tải lại khi cần", "build lại", "mất hẳn") |
| Khôi phục | Xoá vĩnh viễn với phần lớn nhóm | Chuyển vào Thùng rác là mặc định; toast có **Hoàn tác** đưa đúng tệp về đúng chỗ; nhật ký phiên dọn xem lại được |
| Developer | Vài mục Xcode | Danh mục rác dev đầy đủ (Xcode, simulator, SwiftPM, CocoaPods, npm/pnpm/yarn/bun, pip/uv/poetry, cargo, go, Gradle, Android, JetBrains, VS Code, Homebrew, Docker, Hugging Face); dùng **lệnh của chính công cụ** khi công cụ có lệnh dọn an toàn hơn xoá tay |
| Thư mục lạ | Không giải thích | Từ điển ý nghĩa thư mục offline; chưa biết thì hỏi model AI local (đường dẫn rút gọn, không gửi nội dung tệp); AI chỉ giải thích, không quyết định |
| Giọng điệu | Số đỏ, "X GB rác", nhắc nhở định kỳ | Trung tính; không tự chạy, không popup, không khuyến mãi |
| Quyền hệ thống | Xin Full Disk Access ngay từ đầu | Không cần quyền cho phần lớn tính năng; Full Disk Access và helper root là tuỳ chọn, mỗi cái có lý do và phạm vi ghi rõ |
| Nền tảng | macOS | Phân tích dung lượng, tệp lớn và Thùng rác chạy trên macOS/Linux/Windows nhờ bộ quét thuần Node; danh mục dọn theo từng hệ |
| Tích hợp | Menu bar riêng | Thẻ Trang chủ, hàng "việc đang chạy" ở đáy thanh điều hướng, số đo thanh menu dùng chung với module Nhiệt độ, lệnh trong bảng lệnh ⌘K |
| Gỡ app, cập nhật app, tiện ích mở rộng | Mục "Applications" trong cùng app | Module `apps` riêng, bật tắt độc lập (xem [`apps-module.md`](apps-module.md)) |

Những gì **cố ý không làm** (và nói rõ với người dùng nếu được hỏi):

- Quét malware: cần cơ sở dữ liệu chữ ký và trách nhiệm đi kèm.
- "Giải phóng RAM", "tăng tốc": macOS tự quản lý; nút như vậy chỉ có tác dụng tâm lý.
- Tự dọn theo lịch mà không xác nhận.
- Xoá dữ liệu của app đang chạy.
- Tìm tệp trùng lặp: phải đọc nội dung tệp (kích hoạt tải iCloud, tốn I/O); để sau với cơ chế riêng.

---

## 2. Nguyên tắc riêng của module (bổ sung cho nguyên tắc chung)

1. **Không đụng vào tệp chưa đo.** Nút Dọn chỉ xuất hiện khi kích thước mọi mục đã được đo thật (`lstat`, không ước lượng, không `du` đoán).
2. **Renderer không bao giờ gửi đường dẫn tuỳ ý để xoá.** Kết quả quét sống ở main với id mờ; renderer chọn id. Main kiểm tra lại từng id trước khi hành động (giống `LauncherFileIndex` ánh xạ id sang đường dẫn).
3. **Thùng rác trước, xoá vĩnh viễn là ngoại lệ có tên.** Chỉ ba việc xoá thẳng: Dọn Thùng rác, thao tác hệ thống qua helper, xoá ảnh chụp APFS. Mỗi việc có hộp xác nhận riêng, một câu theo mẫu, nói rõ "không hoàn tác được".
4. **Stat lại trước khi xoá.** Tệp đổi kích thước hoặc mtime so với lúc quét thì bỏ qua và báo "đã thay đổi", không xoá.
5. **Không đọc nội dung tệp khi quét.** Chỉ `lstat`/`opendir`. Không `mdls`, không đọc xattr, không mở tệp: tệp iCloud "dataless" không bị tải về, ảnh/video không bị chạm.
6. **Một danh sách cấm cứng ở main.** Không bao giờ đưa vào danh sách xoá: `/System`, `/usr`, `/bin`, `/sbin`, `/private/etc`, `~/Library/Keychains`, `~/Library/Mobile Documents` (iCloud Drive), `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.config/gh`, thư viện Photos (`*.photoslibrary`), dữ liệu của chính Viezan trừ cache của nó. Space Lens vẫn hiện kích thước các nơi này nhưng nút xoá bị tắt kèm lý do.
7. **Lệnh của công cụ thay cho xoá tay khi công cụ có lệnh dọn.** `pnpm store prune`, `brew cleanup`, `xcrun simctl delete unavailable`, `docker system prune` được chạy bằng `execFile` với đường dẫn tuyệt đối, không qua shell, có timeout; không bao giờ xoá tay kho của pnpm hay layer của Docker.
8. **Helper root chỉ nhận thao tác có tên, đường dẫn nằm trong binary.** Không có lệnh "xoá đường dẫn X" ở mức root: helper hiện chỉ kiểm tra uid của client, nên một lệnh như vậy sẽ là đường leo thang đặc quyền cho mọi tiến trình chạy dưới user.
9. **Quét không được làm máy chậm.** Chạy trong worker thread với độ ưu tiên thấp, báo tiến độ theo lô, huỷ được trong dưới một giây.
10. **AI giải thích, không quyết định.** Câu trả lời của AI không bao giờ đổi trạng thái chọn của một mục. Mặc định chỉ dùng model local; nhà cung cấp đám mây cần người dùng đồng ý cho từng câu hỏi (hoặc bật hẳn trong tuỳ chọn).

---

## 3. Phạm vi sản phẩm

### 3.1 Bốn khung nhìn của trang

| Khung nhìn | Việc | Cần quyền |
| --- | --- | --- |
| **Quét nhanh** (Smart Scan) | Một nút quét các nhóm có thể dọn; kết quả theo nhóm với lớp an toàn; chọn rồi Dọn | Không |
| **Dung lượng** (Space Lens) | Quét sâu một gốc (mặc định thư mục nhà, có thể chọn ổ), treemap + danh sách, đi sâu từng thư mục, xoá mục đã chọn | Không |
| **Tệp lớn & cũ** | Danh sách tệp theo kích thước/ngày mở gần nhất, bộ lọc loại và tuổi | Không (macOS dùng Spotlight để có kết quả tức thì) |
| **Bảo trì** | Thùng rác, ảnh chụp APFS cục bộ, thao tác hệ thống (cache/log hệ thống, DNS), nhật ký phiên dọn | Thùng rác không; thao tác hệ thống và xoá ảnh chụp cần helper |

Ứng dụng (gỡ sạch, tệp sót, cập nhật, khởi động) là trang của module `apps`.
Dung lượng của một app vẫn hiện trong Space Lens như một gói; hàng đó có nút
"Mở trong Ứng dụng" dẫn sang module kia khi module kia đang bật.

### 3.2 Nhóm kết quả của Quét nhanh và lớp an toàn

Mỗi mục thuộc một **nhóm** và một **lớp an toàn**:

- `auto` "Dọn ngay được": tích sẵn. Chỉ dành cho thứ app tự tạo lại.
- `review` "Cần xem": hiện nhưng không tích. Người dùng tự quyết.
- `blocked` "Không xoá ở đây": hiện kích thước, nút tắt, kèm lý do và nơi xử lý đúng (Cài đặt › Local AI, System Settings…).

Và một **hệ quả** hiển thị cạnh mỗi mục: `regenerated` (app tự tạo lại) · `redownload` (tải lại khi cần) · `rebuild` (build lại khi cần) · `lost` (mất hẳn).

| Nhóm | Nguồn (macOS) | Lớp | Hệ quả | Ghi chú |
| --- | --- | --- | --- | --- |
| Bộ nhớ đệm ứng dụng | `~/Library/Caches/*` | `auto` | regenerated | Trừ danh sách nhỏ (`com.apple.bird`, `CloudKit`) và mục sửa trong 24 giờ qua (app có thể đang dùng → `review`) |
| Nhật ký | `~/Library/Logs/*`, `~/Library/Logs/DiagnosticReports/*` cũ hơn 7 ngày | `auto` | lost | Tệp sửa trong 1 giờ qua bỏ qua |
| Rác build | `~/Library/Developer/Xcode/DerivedData`, thư mục `target/` (Cargo), `build/` (Gradle, CMake) trong dự án không chạm quá N ngày | `auto` (DerivedData) / `review` (còn lại) | rebuild | Dự án = thư mục có `Cargo.toml`, `build.gradle*`, `CMakeLists.txt` |
| Kho gói | `~/.npm/_cacache`, kho pnpm, cache Yarn/bun, pip/uv/poetry, `~/.cargo/registry/cache`, `~/Library/Caches/go-build`, `~/.gradle/caches`, SwiftPM, CocoaPods | `auto` | redownload | pnpm/Yarn/Homebrew qua lệnh của công cụ |
| Công cụ phát triển | Simulator không còn dùng (`simctl`), `iOS DeviceSupport` phiên bản cũ, `~/.gradle/wrapper/dists` cũ, JetBrains/VS Code caches, Docker (`docker system df`) | `review` | redownload / rebuild | Docker prune ghi rõ "xoá container đã dừng và image không dùng" |
| `node_modules` mồ côi | `node_modules` của dự án (có `package.json`) không chạm quá N ngày (mặc định 60) | `review` | rebuild | Hiện ngày sửa gần nhất của dự án, không chỉ của `node_modules` |
| Bộ cài đã dùng | `.dmg`, `.pkg`, `.zip` của bộ cài trong `~/Downloads` cũ hơn 30 ngày | `review` | redownload | Không bao giờ đụng tệp khác trong Downloads |
| Thùng rác | `~/.Trash`, `.Trashes` các ổ | riêng | lost | Nút "Dọn Thùng rác" riêng, xác nhận riêng |
| Mô hình AI local | `~/.ollama/models`, `~/.cache/huggingface/hub`, model do Viezan quản lý | `blocked` | — | Chỉ hiện kích thước, liên kết tới Cài đặt › Local AI (đã có luồng gỡ model có xác nhận) |
| Sao lưu iPhone | `~/Library/Application Support/MobileSync/Backup` | `review` | lost | Hiện ngày sao lưu từng thiết bị |
| Xcode Archives | `~/Library/Developer/Xcode/Archives` | `review` | lost | Cảnh báo: chứa dSYM để đọc crash log |
| Thư & trình duyệt | Mail Downloads, cache Safari (`~/Library/Containers/com.apple.*`) | `review` | regenerated | Chỉ khi có Full Disk Access (mục 6.3) |
| Hệ thống | `/Library/Caches`, log hệ thống cũ, Diagnostic Reports toàn máy, DNS | `review` | regenerated | Qua helper (mục 6.2), xoá thẳng, ghi rõ |
| Ảnh chụp APFS | `tmutil listlocalsnapshots /` | `review` | lost | Liệt kê không cần quyền; xoá cần helper |

Danh mục là dữ liệu khai báo (`electron/cleanup/catalog/rules.ts`), mỗi quy
tắc có: `id`, `group`, `platforms`, `paths` (mẫu với `~`), `safety`,
`consequence`, `detector` (tồn tại / tuổi / lệnh), `action` (`trash` ·
`command` · `root-op`), `evidence` (khoá i18n giải thích lý do). Thêm một quy
tắc là thêm một bản ghi, không thêm mã.

### 3.3 Điểm "cao cấp" phải có ngay từ bản đầu

- Hai con số cho mọi thứ: **trên đĩa** (`blocks × 512`) và **logic** (`size`), khớp với "Get Info" của Finder; tệp iCloud chưa tải hiện 0 trên đĩa và được gắn cờ.
- Hard link đếm một lần theo `dev:ino`; symlink không đi theo, không cộng dồn.
- Mỗi mục có: Hiện trong Finder, Sao chép đường dẫn, Loại trừ khỏi lần sau, Hỏi AI.
- Tiến độ quét nói đang ở đâu ("Đang quét ~/Library · 124.000 mục · 38 GB") và huỷ được.
- Toast sau khi dọn: "Đã chuyển 1.284 mục (12,4 GB) vào Thùng rác" với **Hoàn tác** (macOS/Linux) và "Mở Thùng rác".
- Nhật ký phiên dọn: ngày, số mục, dung lượng, từng đường dẫn, còn hoàn tác được không (kiểm tra tệp còn trong Thùng rác).
- Treemap luôn đi kèm danh sách điều hướng được bằng bàn phím; treemap tự nó là minh hoạ (`aria-hidden`), không phải cách duy nhất để làm việc.

---

## 4. Kiến trúc

### 4.1 Vị trí trong khung module

| Thành phần | Tệp | Ghi chú |
| --- | --- | --- |
| Kiểu dùng chung | `shared/cleanupApi.d.ts` | Nguồn duy nhất cho `window.api.cleanup` và mọi kiểu dữ liệu |
| Id module | `shared/modules.d.ts` (`PageModuleId` thêm `'cleanup'`), `electron/modules/appModules.ts` (`APP_MODULE_IDS`), `src/modules/catalog.ts` (`space: 'system'`, nhãn `nav_cleanup`), `src/modules/pages.ts` | Mặc định bật ở mọi nền tảng bộ quét chạy được |
| Runtime main | `electron/cleanup/index.ts` (`createCleanupRuntime(deps)` → `start`, `stop`, `getSupport`) | `stop` huỷ quét đang chạy, giải phóng worker và bộ nhớ kết quả |
| IPC | `electron/cleanup/ipc.ts`, kênh `cleanup:*` trong `electron/ipc/channels.ts` | Validate mọi tham số, id mờ, trả lỗi có cấu trúc |
| Preload | section `cleanup` trong `electron/preload.ts` theo `contract.ts` | Mock trong `src/test/setup.ts` và `installWebPreviewApi.ts` (cây tệp giả lập để QA thiết kế trên web preview) |
| Bộ quét | `electron/cleanup/scanner/walk.ts` (thuần, fs tiêm được), `scanWorker.ts` (worker_threads), `scanSession.ts` (quản lý một lần quét, tiến độ, huỷ) | Xem 4.2 |
| Danh mục | `electron/cleanup/catalog/rules.ts`, `detectors.ts`, `toolCommands.ts` | Xem 3.2 |
| Hành động tệp (dùng chung với `apps`) | `electron/fileActions/trash.ts`, `journal.ts`, `denylist.ts`, `verify.ts`, `itemRegistry.ts` | Dịch vụ lõi của main, không thuộc module nào; cả hai module nhận qua `deps`. Xem 4.4 |
| Hệ thống | `electron/cleanup/system/snapshots.ts`, `maintenance.ts` (qua `HelperClient`) | Xem 6.2 |
| Cài đặt | `electron/cleanup/settingsStore.ts` → `cleanup.json` | Cùng mẫu `thermal/settingsStore.ts`: validate từng trường, khoá lạ bỏ |
| Capability | `cleanup.scan`, `files.trash.undo`, `cleanup.fullDisk`, `helper.admin` trong `electron/ipc/capabilities.ts` | Hiển thị qua `CapabilityNotice` dùng chung; `files.trash.undo` và `helper.admin` dùng chung với `apps` |
| Binary gốc | `native/fs/main.swift` → `viezan-fs` (macOS) | Chỉ để Thùng rác có Hoàn tác chính xác; không đặc quyền; ký qua `mac.binaries` |
| Renderer | `src/pages/CleanupPage.tsx`, organisms `src/components/organisms/cleanup/*`, hooks `useCleanupScan`, `useCleanupItems`, `useCleanupApps`, `useCleanupSettings`, utils `src/utils/treemapLayout.ts`, `byteFormat.ts`, `pathDisplay.ts` | Xem mục 5 |
| Thiết kế | `docs/design/screens/cleanup.md`, `docs/design/specs/cleanup.html` | Viết cùng PR đầu, gắn "đề xuất" cho phần chưa có mã |

Ranh giới tin cậy giữ nguyên: `renderer → preload → main → (worker | viezan-fs | helper)`.
Renderer không biết worker, binary hay helper tồn tại.

### 4.2 Bộ quét

**Yêu cầu**: quét thư mục nhà vài trăm nghìn đến vài triệu mục mà không chặn
main, không làm máy nóng, huỷ được, và trả về cây đủ nhỏ để gửi qua IPC.

**Cách làm**

- Worker thread (`worker_threads`) chạy `scanWorker.js` đã biên dịch trong
  `dist-electron/cleanup/`. Worker gọi `os.setPriority(19)` cho chính nó.
  Việc cần xác minh ở bản đóng gói: worker nạp được từ trong asar; nếu không,
  thêm `dist-electron/cleanup/**` vào `asarUnpack`.
- Duyệt lặp (không đệ quy) bằng `fs.opendir` với `Dirent` để biết loại mà không
  `lstat` thư mục; chỉ `lstat` tệp thường để lấy `size`, `blocks`, `mtimeMs`,
  `atimeMs`, `ino`, `dev`, `nlink`. Một bể nhỏ (8) thư mục mở đồng thời.
- Ở lại trên thiết bị của gốc. Ngoại lệ macOS: tập thiết bị cho phép gồm `/` và
  `/System/Volumes/Data` (firmlink); loại trừ `/Volumes`, `/System/Volumes/{Preboot,VM,Update,Recovery,Hardware}`, `/dev`, `/Network`, `/.vol`.
  Không đi theo symlink. Thư mục `.photoslibrary`, `.app`, `.framework` được
  tính là một mục (package) trong Space Lens, không mở ra.
- Hard link: `nlink > 1` → ghi `dev:ino` vào một Set, cộng kích thước một lần.
- Tiến độ gửi mỗi 250 ms: `{ entries, bytes, currentPath, phase }`. Huỷ bằng cờ
  trong `SharedArrayBuffer` để worker dừng trong một vòng lặp.
- **Worker giữ cây đầy đủ** dạng mảng gọn (`parent`, `name`, `logical`,
  `allocated`, `mtime`, `flags`) cho tới lần quét sau hoặc khi module dừng;
  main chỉ nhận **cây đã tỉa**: với mỗi thư mục giữ con có kích thước ≥
  max(16 MB, 0,1 % gốc) hoặc trong 40 con lớn nhất, phần còn lại gộp thành một
  nút "… N mục khác". Yêu cầu `lens.children(id)` được trả lời từ worker, không
  quét lại.
- Tệp lớn trên macOS: hỏi Spotlight trước (`mdfind 'kMDItemFSSize > N'` trong
  các gốc cho phép, cùng mẫu `launcherFiles.ts`), xác minh lại bằng `lstat`;
  không có chỉ mục thì lấy từ cây quét.
- Quét nhanh không duyệt cả ổ: mỗi quy tắc trong danh mục chỉ định gốc của nó,
  nên thường xong trong vài giây.

**Tiêu chí đo** (ghi nhận trên máy phát triển, không phải lời hứa với người dùng):
thư mục nhà ~500.000 mục xong dưới 45 giây trên SSD Apple Silicon; bộ nhớ của
worker dưới 150 MB cho 2 triệu mục; CPU của app không quá một lõi khi quét; huỷ
dưới 1 giây.

**Sau này** (giai đoạn F): `fs.watch` đệ quy (FSEvents) trên các gốc đã quét để
lần quét sau chỉ duyệt lại nhánh đã thay đổi trong phiên app.

### 4.3 Hợp đồng `window.api.cleanup`

Hình dạng, không phải chữ ký cuối cùng; chữ ký nằm trong `shared/cleanupApi.d.ts`.

```text
getSupport()                       -> { supported, platform, features: { smartScan, lens, largeFiles, apps, trashUndo, fullDisk, root } }
getVolumes()                       -> [{ id, mountPoint, name, totalBytes, freeBytes }]        // fs.statfs

scan.start({ kind: 'smart' | 'lens' | 'large', rootId? })   -> { scanId }
scan.cancel(scanId)
scan.onProgress(cb)                -> { scanId, phase, entries, bytes, currentPath }
scan.onResult(cb)                  -> { scanId, kind, lens?: LensNode, items?: CleanupItem[], volumes }

lens.children(nodeId)              -> LensNode[]            // từ worker, không quét lại
lens.reveal(nodeId)                                         // shell.showItemInFolder

items.preview(ids)                 -> { items, totalBytes, skipped: [{ id, reason }] }   // stat lại, áp denylist
items.clean(ids)                   -> { sessionId }         // Thùng rác hoặc lệnh công cụ, theo action của từng mục
items.onCleanProgress(cb)          -> { sessionId, done, total, bytes, current }
items.undo(sessionId)              -> { restored, failed }
items.exclude(id)                                           // thêm vào exclusions trong cleanup.json

trash.status()                     -> { bytes, count }
trash.empty()                      -> { bytes }             // xoá vĩnh viễn, xác nhận riêng

snapshots.list()                   -> [{ name, createdAt }]
snapshots.delete(name)             -> qua helper (6.2)

maintenance.list()                 -> [{ id, bytes?, lastRunAt? }]   // đo bởi helper khi đã kết nối
maintenance.run(id)                -> { bytes }

journal.list()                     -> [{ sessionId, at, kind, count, bytes, undoable }]
journal.get(sessionId)             -> CleanSession

explain({ nodeId | itemId, allowCloud? })   -> { source: 'knowledge' | 'local' | 'cloud', text } hoặc { needsConsent: true }

settings.get() / update(patch) / onChanged(cb)
```

Mọi `id` là chuỗi mờ do main cấp cho kết quả của lần quét hiện tại; id lạ hoặc
của lần quét cũ bị từ chối với lỗi `stale`. Renderer không có API nào nhận
đường dẫn làm tham số để xoá.

### 4.4 Luồng xoá an toàn

```text
renderer chọn ids -> items.preview(ids)
  main: tra id -> đường dẫn; realpath; đối chiếu denylist; lstat lại; so size/mtime
        -> trả danh sách đã xác minh + mục bị bỏ kèm lý do
renderer hiện hộp xác nhận (số mục, dung lượng theo nhóm, "Chuyển vào Thùng rác")
  -> items.clean(ids)
main: ghi nhật ký trước (write-ahead) -> với từng mục:
   action 'trash'   : viezan-fs trash (macOS) | gio trash (Linux) | shell.trashItem (khác)
   action 'command' : execFile lệnh công cụ, không shell, timeout, log stdout tóm tắt
   -> cập nhật nhật ký từng mục (trashedPath cho Hoàn tác) -> onCleanProgress
renderer: toast "Đã chuyển N mục (X GB) vào Thùng rác" [Hoàn tác] [Mở Thùng rác]
Hoàn tác: items.undo(sessionId) -> viezan-fs restore các cặp (trashed -> original) nếu original còn trống
```

- Trên macOS, `shell.trashItem` của Electron không trả về vị trí mới trong
  Thùng rác nên không hoàn tác chính xác được. `viezan-fs` (Swift,
  `FileManager.trashItem(at:resultingItemURL:)`) đọc danh sách đường dẫn từ
  stdin dạng JSON lines và in ra cặp `{ original, trashed }`. Không có binary
  (bản dev chưa build, hoặc nền tảng khác) thì rơi về `shell.trashItem` và toast
  không có Hoàn tác, chỉ có "Mở Thùng rác"; capability `files.trash.undo` cho
  renderer biết trước.
- Linux: `gio trash` và `gio trash --restore`. Windows: `shell.trashItem`
  (Recycle Bin), không hoàn tác trong app.
- Nhật ký `fileActions/journal.json` trong userData, tối đa 200 phiên, mỗi
  phiên ghi module tạo ra nó (`cleanup` · `apps`), loại (`clean` · `uninstall` ·
  `reset` · `update`), và từng mục với đường dẫn gốc, đường dẫn trong Thùng
  rác, kích thước, kết quả (`trashed` · `deleted` · `ran-command` ·
  `skipped-changed` · `failed`). Hoàn tác khả dụng khi mọi `trashed` còn tồn
  tại. Khung nhìn Bảo trì liệt kê mọi phiên; trang Ứng dụng liệt kê phiên của nó.

### 4.5 Lớp hành động tệp dùng chung

`electron/fileActions/` là dịch vụ lõi của main (như keychain hay capabilities),
được tạo một lần trong `main.ts` và đưa vào `deps` của cả `cleanup` lẫn `apps`:

- `itemRegistry.ts`: cấp id mờ cho đường dẫn mà một lần quét tìm thấy, kèm
  `lstat` lúc tìm thấy; id gắn với thế hệ quét, thế hệ cũ bị từ chối (`stale`).
- `denylist.ts`: danh sách cấm cứng của nguyên tắc 6, áp cho mọi module.
- `verify.ts`: realpath, kiểm tra nằm dưới gốc cho phép, không qua symlink,
  stat lại và so với lúc quét.
- `trash.ts`: ba đường chuyển vào Thùng rác (4.4) và `restore`.
- `journal.ts`: nhật ký ghi trước, truy vấn theo module.

Module `apps` dùng lớp này cho gỡ app, tệp sót, đặt lại app và tắt Launch Agent;
không có đường xoá thứ hai.

### 4.6 AI giải thích

- Tầng 1, offline: `src/constants/pathKnowledge.ts` ánh xạ các thư mục quen
  (`~/Library/Application Support`, `DerivedData`, `.gradle`, `_cacache`,
  `Group Containers`…) sang đoạn giải thích i18n. Trả lời tức thì, không cần
  model.
- Tầng 2, model local: main dựng prompt từ đường dẫn đã rút gọn (`~`), loại,
  kích thước, tối đa 20 tên con (không nội dung), app sở hữu nếu biết, bằng
  chứng từ quy tắc; gửi qua pipeline chat hiện có với nhà cung cấp `local`.
  Không có model local: UI hiện thông báo và nút "Dùng nhà cung cấp đám mây cho
  câu này" (`allowCloud: true`), nhớ lựa chọn nếu người dùng bật trong tuỳ chọn
  (`explainProvider: 'local-only' | 'ask' | 'any'`, mặc định `local-only`).
- Câu trả lời hiện trong ngăn chi tiết của mục, có nhãn nguồn ("Từ điển" /
  "Model local" / tên nhà cung cấp). Không có nút hành động nào trong câu trả lời.

### 4.7 Cài đặt (`cleanup.json`)

```text
roots:             [{ id, path }]            // gốc Space Lens; mặc định thư mục nhà
exclusions:        string[]                  // người dùng thêm từ "Loại trừ khỏi lần sau"
orphanDays:        60                        // node_modules / build mồ côi
largeFileBytes:    500 MB
oldFileDays:       180
preselectGroups:   ['caches','logs','dev-build:derived-data','dev-packages']   // nhóm tích sẵn trong Quét nhanh
explainProvider:   'local-only' | 'ask' | 'any'
lowDiskNotice:     { enabled: false, thresholdGiB: 20 }   // giai đoạn F
```

---

## 5. Giao diện

Trang dùng khung đã chuẩn hoá ở trang Nhiệt độ: `PageHeader` với chip trạng
thái, nút chính và bánh răng; thân là `app-panel-grid` hai cột từ 900 px vùng
nội dung; toolbar panel `live-panel-toolbar`. Chuyển khung nhìn bằng pill
soft/ghost trong toolbar (cùng mẫu Mic/Hệ thống ở trang Phiên dịch). Đặc tả đầy
đủ theo `docs/design/screens/_template.md` viết ở PR đầu; dưới đây là khung.

```
┌ PageHeader ───────────────────────────────────────────────────────────────────────┐
│ Dung lượng & dọn dẹp     [● Macintosh HD · 312 GB trống / 1 TB]   [Quét] [⚙]       │
├ .cleanup-body ────────────────────────────────────────────────────────────────────┤
│ [Quét nhanh] [Dung lượng] [Tệp lớn & cũ] [Bảo trì]                                   │
│ ┌ Nhóm (.glass-panel) ───────────────┐ ┌ Chi tiết (.glass-panel) ─────────────────┐ │
│ │ ☑ Bộ nhớ đệm ứng dụng     8,2 GB   │ │ Bộ nhớ đệm ứng dụng · 214 mục · 8,2 GB    │ │
│ │ ☑ Nhật ký                 410 MB   │ │ ☑ com.apple.dt.Xcode         2,1 GB  ⓘ   │ │
│ │ ☑ Rác build              12,4 GB   │ │   ~/Library/Caches/com.apple.dt.Xcode     │ │
│ │ ☐ node_modules mồ côi     6,8 GB   │ │   App tự tạo lại · sửa 3 ngày trước       │ │
│ │ ☐ Công cụ phát triển      9,1 GB   │ │ ☑ Google/Chrome              1,4 GB  ⓘ   │ │
│ │ ☐ Bộ cài đã dùng          2,2 GB   │ │ …                                         │ │
│ │ — Mô hình AI local       18,0 GB → │ │ [Hiện trong Finder] [Loại trừ] [Hỏi AI]   │ │
│ ├────────────────────────────────────┤ └───────────────────────────────────────────┘ │
│ │ Dọn ngay được 21,0 GB · Cần xem 18,1 GB                     [Dọn 21,0 GB]        │ │
│ └────────────────────────────────────┘                                              │
└───────────────────────────────────────────────────────────────────────────────────┘
```

- **Quét nhanh**: cột trái nhóm với checkbox ba trạng thái và kích thước; cột
  phải mục của nhóm đang chọn. Thanh tổng ở đáy cột trái: "Dọn ngay được X ·
  Cần xem Y" và nút `Dọn X GB` (`primary` · `solid`, `md`). Nút chỉ bật khi có
  mục được chọn và không có quét đang chạy.
- **Dung lượng**: cột trái treemap (SVG, bố cục squarified trong
  `treemapLayout.ts`, màu theo loại nội dung bằng các token tông minh hoạ của
  persona, không cầu vồng), breadcrumb phía trên; cột phải danh sách con theo
  kích thước, điều hướng bằng phím mũi tên và Enter, mỗi hàng có thanh tỉ lệ.
  Dưới 900 px chỉ hiện danh sách, nút "Xem bản đồ" mở treemap thay chỗ.
- **Tệp lớn & cũ**: bảng một cột với bộ lọc (≥ 100 MB / 500 MB / 1 GB; mở lần
  cuối > 90 / 180 / 365 ngày; loại tệp), sắp xếp theo kích thước; checkbox và
  nút Dọn cùng mẫu.
- **Bảo trì**: các thẻ Thùng rác (dung lượng, nút "Dọn Thùng rác" `danger` ·
  `outline` + xác nhận), Ảnh chụp APFS (danh sách, xoá từng cái qua helper),
  Thao tác hệ thống (từng hàng với kích thước đo bởi helper, nút Chạy; trạng
  thái helper là chip như trang Nhiệt độ), Nhật ký phiên dọn (bảng mọi phiên
  của cả hai module, mỗi phiên có Hoàn tác nếu còn được).
- **Trạng thái quét**: trong lúc quét, nút chính đổi thành `Dừng` (`danger` ·
  `outline`), chip header hiện tiến độ, vùng `aria-live="polite"` đọc mốc mỗi
  10 giây thay vì mỗi lần cập nhật.
- **Trạng thái**: trống (chưa quét: lời mời một câu và nút Quét), đang quét, có
  kết quả, không có gì để dọn ("Máy gọn rồi" trung tính, không hoa giấy), lỗi
  (gốc không đọc được → hiện gốc và lý do), thiếu quyền (`CapabilityNotice`),
  module tắt (không có trang).
- **Bánh răng**: `AIConfigurationPopover` với các `ConfigSection`: gốc quét và
  loại trừ, ngưỡng (tệp lớn, tuổi, mồ côi), nhóm tích sẵn, AI giải thích (nhà
  cung cấp), quyền (Full Disk Access với `CapabilityNotice`), helper.
- **Trang chủ**: `HomeStorageCard` cạnh `HomeSystemCard`: ổ, dung lượng trống,
  lần quét gần nhất và con số "dọn ngay được", nút Quét. Chỉ hiện khi module bật.
- **Thanh điều hướng**: `useBackgroundStatus` thêm hàng "Đang quét dung lượng ·
  38 GB" khi có quét chạy mà người dùng đã rời trang.
- **Bảng lệnh ⌘K**: mục module với từ khoá `storage, disk, clean, cleanup,
  space, junk, cache, uninstall, large files`. Lệnh con ("Quét nhanh", "Gỡ ứng
  dụng…") chờ khung `launcherCommands` của module platform.
- Nội dung chữ: tiếng Việt là bản gốc, EN/JA nói đúng như vậy; dung lượng định
  dạng qua `Intl.NumberFormat` với đơn vị theo ngôn ngữ (`12,4 GB` / `12.4 GB`);
  câu có số dùng một khoá với placeholder (`cleanup_trashed_summary`:
  "Đã chuyển {count} mục ({size}) vào Thùng rác").

---

## 6. Quyền và helper

### 6.1 Capability

| Id | `supported` | `permission` | `request` |
| --- | --- | --- | --- |
| `cleanup.scan` | macOS, Linux, Windows | `not-required` | — |
| `files.trash.undo` | macOS có `viezan-fs`; Linux có `gio` | `not-required` | — (dùng chung với `apps`) |
| `cleanup.fullDisk` | macOS | thăm dò: `readdir('~/Library/Mail')` trả `EPERM` → `denied` | mở `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles`, trả trạng thái mới khi cửa sổ lấy lại focus |
| `helper.admin` | macOS có `viezan-fan-helper` | `granted` khi helper đang kết nối | khởi chạy helper theo phiên (hộp thoại mật khẩu hệ thống hiện có); dùng chung với `apps` |

### 6.2 Thao tác hệ thống qua helper

Mở rộng helper hiện có (`native/fanhelper/main.swift`) bằng một họ lệnh mới,
cùng socket, cùng `HelperClient`, cùng kiểm tra uid, cùng log. `hello` thêm
`"maintenance"` vào `capabilities`; `HELPER_PROTOCOL_VERSION` tăng lên 2 (helper
được khởi chạy từ chính bundle của app nên phiên bản luôn khớp).

```text
maintenance.list                  -> [{ id, bytes }]      // helper đo với quyền root
maintenance.run { id }            -> { bytes }
snapshots.delete { name }         -> {}                   // name khớp ^\d{4}-\d{2}-\d{2}-\d{6}$ và có trong tmutil listlocalsnapshots
```

Tập `id` cố định của `maintenance.run`, đường dẫn nằm trong mã Swift:

| id | Việc | Vì sao an toàn khi xoá thẳng |
| --- | --- | --- |
| `system-caches` | Nội dung `/Library/Caches/*` (không phải `/System/Library/Caches`) | Cache cấp máy, app và dịch vụ tự tạo lại |
| `system-logs` | `/private/var/log/*.gz`, `*.bz2`, log xoay vòng cũ hơn 7 ngày; không đụng tệp đang ghi | Bản lưu trữ của log đã xoay |
| `diagnostic-reports` | `/Library/Logs/DiagnosticReports/*` cũ hơn 30 ngày | Báo cáo sự cố đã cũ |
| `dns-flush` | `dscacheutil -flushcache` và `killall -HUP mDNSResponder` | Không xoá gì; đảo ngược tức thì |

Quy tắc trong helper: không đi theo symlink, từ chối nếu realpath của thư mục
đích khác đường dẫn hardcode, đếm và ghi log số mục đã xoá, không nhận tham số
đường dẫn. Mỗi lần chạy Bảo trì là một lần hỏi mật khẩu nếu helper chưa chạy
(helper tự thoát sau 60 giây rảnh); UI nói rõ điều đó trước khi bấm.

Đổi tên `viezan-fan-helper` thành `viezan-helper` là việc dọn dẹp riêng sau khi
PR #149 merge, không gộp vào module này.

### 6.3 Full Disk Access

- Chỉ các nhóm Thư & trình duyệt cần. Nhóm này ẩn khi `cleanup.fullDisk` là
  `denied`, thay bằng một `CapabilityNotice` trong Quét nhanh ("Một số mục cần
  Quyền truy cập toàn bộ ổ đĩa") và trong bánh răng.
- Lưu ý đã biết: bản phát hành đang ký ad-hoc, chữ ký đổi theo mỗi bản build
  nên macOS có thể quên quyền đã cấp sau khi cập nhật. Vì vậy nhóm này giữ
  nhãn "nâng cao" cho tới khi có Developer ID (quyết định §7 của kế hoạch module
  platform); UI nói thẳng điều này trong thông báo.
- Quyền root **không** thay được FDA: helper chạy root vẫn không đọc được Mail
  hay Safari nếu chưa được cấp.

---

## 7. Lộ trình: mỗi bước một PR, merge độc lập

Nhánh `feat/cleanup-*` tách từ `develop` mới nhất; PR tiêu đề chữ thường theo
`subjectPattern`. Bước A và B không phụ thuộc PR #149; bước D chờ #149 merge.
Module `apps` bắt đầu được sau bước B (cần lớp hành động tệp) và chạy song
song với C trở đi; lộ trình của nó nằm trong `apps-module.md`.

### A. Nền và phân tích dung lượng (chỉ đọc)

- Kiểu `shared/cleanupApi.d.ts`, id module, catalog, page, kênh IPC, preload,
  mock, settings store, capability `cleanup.scan`.
- Bộ quét: `walk.ts` thuần với fs tiêm được, worker, phiên quét, tiến độ, huỷ,
  cây tỉa, `lens.children`.
- Khung nhìn Dung lượng (treemap + danh sách) và Tệp lớn & cũ (Spotlight +
  fallback), chỉ có Hiện trong Finder và Sao chép đường dẫn. **Không có mã xoá
  nào trong PR này**, để review tập trung vào bộ quét.
- Thẻ Trang chủ, hàng trạng thái nền, i18n ba ngôn ngữ, đặc tả màn hình và
  board trạng thái.
- Hoàn thành khi: test `walk.ts` phủ symlink, hard link, thiết bị khác, huỷ
  giữa chừng, tỉa cây; đo tiêu chí 4.2 trên máy phát triển và ghi vào đây;
  web preview QA ở 1200/820 px, sáng/tối, ba cỡ chữ.

### B. Xoá an toàn và Hoàn tác (lớp dùng chung)

- `electron/fileActions/`: `viezan-fs` (Swift, build qua
  `scripts/build-native.mjs`, `mac.binaries`, `extraResources`), `trash.ts` với
  ba đường (binary, `gio`, `shell.trashItem`), `itemRegistry.ts`, `denylist.ts`,
  `verify.ts`, `journal.ts`; trong module: `items.preview/clean/undo`; capability
  `files.trash.undo`.
- Hộp xác nhận, tiến độ dọn, toast với Hoàn tác, khung nhìn Nhật ký (trong Bảo
  trì) và Thùng rác (trạng thái + Dọn Thùng rác có xác nhận).
- Hoàn thành khi: test từ chối id lạ/cũ, từ chối đường dẫn trong denylist,
  bỏ qua mục đã thay đổi, nhật ký ghi trước; QA thật trên macOS: dọn → Hoàn tác
  trả đúng chỗ, dọn → dọn Thùng rác → nhật ký báo không hoàn tác được; giết app
  giữa lúc dọn → nhật ký vẫn liệt kê đủ mục đã chuyển.

### C. Quét nhanh và danh mục

- `rules.ts`, `detectors.ts`, `toolCommands.ts` (tìm binary công cụ ở các vị
  trí cố định: `/opt/homebrew/bin`, `/usr/local/bin`, `~/.cargo/bin`,
  `~/.bun/bin`, `~/Library/pnpm`, thư mục của `brew --prefix`; không chạy shell
  để đoán PATH), các nhóm trong 3.2 trừ Thư & trình duyệt và Hệ thống.
- Khung nhìn Quét nhanh, tích sẵn theo `preselectGroups`, Loại trừ khỏi lần sau.
- Hoàn thành khi: mỗi quy tắc có test với cây tệp giả; lệnh công cụ chạy với
  đường dẫn tuyệt đối và timeout; quét nhanh trên máy phát triển dưới 10 giây.

### D. Bảo trì hệ thống (cần helper, sau PR #149)

- Lệnh `maintenance.*`, `snapshots.delete` trong helper; `HelperClient` dùng
  chung; capability `helper.admin`; capability `cleanup.fullDisk` và nhóm Thư &
  trình duyệt.
- Hoàn thành khi: helper từ chối `name` ảnh chụp sai định dạng hoặc không tồn
  tại; `maintenance.run` không đi theo symlink đặt thử trong `/Library/Caches`;
  log helper có một dòng mỗi thao tác.

### E. AI giải thích

- `pathKnowledge.ts`, `explain` qua pipeline chat với chính sách nhà cung cấp,
  ngăn trả lời trong chi tiết mục. Dịch vụ giải thích nằm ở main để module
  `apps` dùng lại cho tệp sót.
- Hoàn thành khi: không có model local thì không có yêu cầu mạng nào được gửi
  khi `explainProvider` là `local-only` (test bằng mock provider); prompt không
  chứa nội dung tệp.

### F. Mở rộng

- Số dung lượng trống trên mục thanh menu dùng chung với Nhiệt độ (tuỳ chọn thứ
  ba của `ThermalTrayOptions`, hoặc tách thành tuỳ chọn tray chung); thông báo
  hệ điều hành khi ổ dưới ngưỡng (opt-in, kiểm tra mỗi 10 phút, không quét).
- Quét lại tăng dần bằng `fs.watch`.
- Danh mục Linux (`~/.cache`, journal qua helper Linux của giai đoạn 3, flatpak/
  snap không dùng) và Windows (`%TEMP%`, cache npm/NuGet, Recycle Bin).
- Lệnh con trong bảng lệnh khi module platform có `launcherCommands`.

---

## 8. Kiểm thử và QA

- Đơn vị: `walk.ts` với fs giả (không chạm đĩa), `rules.ts` với cây tệp tạm,
  `denylist.ts`, `verify.ts`, `journal.ts`, `treemapLayout.ts`, định dạng dung
  lượng ba ngôn ngữ, validate IPC (id lạ, tham số sai kiểu).
- Tích hợp: handler đăng ký đủ cho mọi kênh `cleanup:*` (cùng test với
  `channels.ts`); preload section khớp interface (lỗi biên dịch nếu lệch).
- Electron thật: harness Playwright `_electron` như thermal
  (`dist-electron/main.js` + `npm run dev:vite`), gọi `window.api.cleanup.*`,
  kiểm tra Thùng rác và Hoàn tác trên một thư mục tạm có cấu trúc dựng sẵn,
  không bao giờ trên dữ liệu thật của máy phát triển.
- UI: web preview với cây tệp giả lập ở 1200/820 px, sáng/tối, ba cỡ chữ, ba
  ngôn ngữ; `npm run check:atomic`, `npm run check:design`, rà literal thủ công
  trong `src/pages` và CSS mới.
- Trước mỗi PR: Biome tệp đổi, `tsc` hai cấu hình, Vitest toàn bộ.

---

## 9. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- |
| Xoá nhầm dữ liệu người dùng | Cao nhất | Nguyên tắc 2–6; Thùng rác + Hoàn tác; PR A không có mã xoá; danh mục khai báo có test từng quy tắc |
| Quét làm máy chậm hoặc nóng | Trung bình | Worker ưu tiên thấp, bể mở thư mục nhỏ, huỷ tức thì, không quét cả ổ trong Quét nhanh |
| Kích hoạt tải iCloud khi quét | Trung bình | Chỉ `lstat`, không mở tệp, không `mdls` trên tệp; gắn cờ dataless |
| Worker không nạp được trong asar | Thấp | Xác minh ở PR A trên bản đóng gói; `asarUnpack` nếu cần |
| FDA bị quên sau mỗi bản cập nhật (ad-hoc) | Trung bình | Nhóm FDA là "nâng cao" có cảnh báo; thúc đẩy quyết định Developer ID |
| Lệnh công cụ (Docker, brew) làm điều người dùng không ngờ | Trung bình | Luôn `review`, mô tả đúng việc lệnh làm, hiện `docker system df` trước |
| Helper nhận lệnh xoá tuỳ ý | Cao nếu làm sai | Nguyên tắc 8: chỉ thao tác có tên, đường dẫn trong binary |
| Bộ nhớ worker với ổ rất lớn | Thấp | Mảng gọn, tỉa khi gửi, giải phóng khi module dừng; ngưỡng đo ở 4.2 |
| Phạm vi phình to | Trung bình | Sáu PR tách bạch, mỗi PR có tiêu chí hoàn thành; D–F có thể dừng mà sản phẩm vẫn tròn; phần ứng dụng là module riêng |

---

## 10. Quyết định đã lấy và quyết định còn mở

**Đã chốt với người dùng (2026-10-25):** đối tượng là cả developer và người
dùng phổ thông (mặc định gọn, chi tiết khi mở); MVP gồm Space Lens, rác dev và
cache, gỡ app sạch, tệp lớn và cũ; có Quét nhanh với tích sẵn; có helper root
cho thao tác hệ thống.

**Đề xuất trong tài liệu này, cần bạn xác nhận hoặc đổi:**

1. **Tên và id**: module `cleanup`, nhãn "Dung lượng & dọn dẹp" / "Storage &
   cleanup" / "ストレージとクリーンアップ", nhóm HỆ THỐNG cạnh Nhiệt độ & quạt.
2. **Thứ tự PR A → F** như mục 7, PR A hoàn toàn chỉ đọc; PR B là lớp dùng
   chung `electron/fileActions/`.
3. **Binary `viezan-fs`** để Hoàn tác chính xác trên macOS (binary thứ ba, không
   đặc quyền). Không có nó thì chỉ có "Mở Thùng rác".
4. **Full Disk Access** là tuỳ chọn ở bước E với nhãn "nâng cao" cho tới khi có
   Developer ID.
5. **AI giải thích** mặc định `local-only`; đám mây theo từng câu hỏi.
6. **Nền tảng**: phân tích dung lượng và Thùng rác chạy ở cả ba hệ ngay từ A–B;
   danh mục Quét nhanh macOS trước, Linux/Windows ở G; module bật mặc định ở
   mọi nơi bộ quét chạy được.
7. **Theo dõi nền** (số đo tray, cảnh báo ổ đầy) ở G, opt-in.
8. **Helper**: mở rộng `viezan-fan-helper` bằng họ lệnh `maintenance.*`; đổi
   tên binary là việc riêng sau #149.
9. **Hai module thay vì một**: gỡ cài đặt, tệp sót, cập nhật và khởi động tách
   thành module `apps` (bật tắt riêng, vì cập nhật có hành vi mạng mà người
   dùng có thể muốn tắt độc lập với dọn dẹp); hai module dùng chung
   `electron/fileActions/`. Chi tiết trong [`apps-module.md`](apps-module.md).
