# Desktop Review 03 — macOS, Windows, Linux

**Audit tiếp theo:** [Các vấn đề và ảnh trước/sau](audit/README.md).
Bản này chưa đạt cổng chốt thiết kế; đã sửa mật độ Home/Chat và panel Hoạt động.
Trạng thái và ghi nhận xét hiện nằm trong **Tùy chọn review**.

2026-10-26 · **Bộ thiết kế để người dùng review; chưa được duyệt và chưa áp dụng
vào ứng dụng.** iOS/iPadOS/Android để giai đoạn sau. Không yêu cầu Figma.

Mở [index.html](index.html) trực tiếp hoặc dùng preview đang chạy tại
<http://127.0.0.1:8766>. Chạy lại từ repository:

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs/migration/desktop-review
```

## Cách nghiệm thu

1. Chọn nền tảng ở thanh trên; Linux có KDE/GNOME để xem khác biệt chrome.
2. Duyệt đủ 10 mục điều hướng và 8 nhóm Cài đặt.
3. Đổi sáng/tối, chiều rộng full/820/640; Mac có giảm trong suốt.
4. Chọn các trạng thái trống, đang chạy, đang chờ, lỗi kết nối, rate limit,
   thiếu khóa, hủy, phục hồi hoặc chưa hỗ trợ.
5. Mở **Mục lục review** để duyệt 27 luồng/cửa sổ phụ. Mở **Hoạt động**, hủy A,
   kiểm tra B còn chạy; thử lại A hoặc xem phục hồi sau gián đoạn.
6. **Ghi nhận xét** gắn nền tảng, trang và trạng thái. Tải `.txt` trước khi đóng
   hoặc tải lại trang; không tự gửi nhận xét lên dịch vụ nào.

## Thiết kế theo nền tảng

| Phần | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Chrome | Liquid Glass có nền đặc dự phòng | Fluent-inspired, nền ổn định, caption phải | Qt desktop, KDE/GNOME chrome mẫu |
| Chữ | System/SF | Segoe UI ưu tiên, system fallback | Noto Sans ưu tiên, system fallback |
| Phím tắt hiển thị | Cmd/Option | Ctrl/Alt | Ctrl/Alt; kiểm tra xung đột desktop |
| Dịch vùng chọn | Quyền Trợ năng theo hành động | Xác minh khả năng đọc vùng chọn; fallback dán | Không giả định đọc vùng chọn Wayland; fallback dán/browser |
| Gỡ ứng dụng | Bundle và dữ liệu được xác minh | Trình gỡ cài đặt đăng ký | Theo Flatpak/package/AppImage; không xóa tệp package riêng lẻ |
| Cảm biến/quạt | Mẫu helper + profile + rule | Chưa có backend xác minh → không có số đo giả | Chưa có backend xác minh → không có số đo giả |
| Cập nhật | Mẫu updater | Mẫu updater | Theo nguồn cài; không ghi đè package manager |

Windows không được gọi là WinUI runtime; Linux không được gọi là GTK/Kirigami
runtime. Đây là bản vẽ tương tác HTML của UI đề xuất SwiftUI/AppKit và Qt/QML.
Font Windows/Linux trên máy Mac có thể fallback; không có pixel parity với OS thật.

Tham chiếu chính thức: [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials),
[Windows materials](https://learn.microsoft.com/en-us/windows/apps/develop/ui/materials),
[KDE HIG](https://develop.kde.org/hig/),
[GNOME header bars](https://developer.gnome.org/hig/patterns/containers/header-bars.html).
Các guideline là cơ sở định hướng; không chứng minh prototype tuân thủ native API.

## Độ phủ thiết kế

- Trang chủ: bắt đầu nhanh, việc gần đây, local model và shortcut.
- Chat: nội dung, empty, composer duy nhất, model picker, history, rename/delete
  trong lịch sử, error/retry, draft, tác vụ nền độc lập.
- Dịch: nguồn/đích, văn bản, ảnh, giọng điệu, so sánh, lịch sử và kết quả.
- Phiên dịch: nguồn âm thanh, bản ghi song ngữ, trạng thái nghe/dừng, tóm tắt,
  xuất và phụ đề nổi.
- Từ điển: từ, phiên âm, ví dụ, lưu từ.
- Dịch mọi nơi: vùng chọn, browser bridge, quyền và phương án nhập thủ công.
- Ứng dụng: inventory, chi tiết, xác nhận gỡ/reset, protected data, nhật ký.
- Nhiệt độ & quạt: cảm biến, profile, form rule, calibration preflight,
  capability unavailable. Không mô phỏng hiệu chuẩn thành công.
- Launcher & phím tắt: launcher, Quick Chat, tìm kiếm mẫu và chỉnh phím tắt.
- Cài đặt: Chung, Giao diện, Mô hình AI, Giọng nói, Chat, Module, Cập nhật,
  Giới thiệu. Provider sheet có endpoint/model và lỗi kiểm tra giữ form.

Luồng hệ thống có thể kiểm tra bằng click trong prototype nhưng không gọi API,
không thu âm, không gỡ ứng dụng, không cài helper, không sửa clipboard hoặc dữ liệu
production. Các thao tác đó có phản hồi mẫu. Bộ chọn trạng thái là công cụ review,
không phải phần UI sẽ đưa vào sản phẩm. Màn nghiệp vụ dùng fixture đại diện, không
bao phủ mọi nhà cung cấp hoặc mọi model phần cứng có thể xuất hiện sau này.

## Bằng chứng

[Kết quả thao tác trình duyệt](evidence/qa-results.json):

- 54 lần kiểm tra nội dung: 10 trang + 8 nhóm Cài đặt × 3 nền tảng.
- 37 lần mở/đóng sheet: 27 luồng chung trên Mac + 5 khác biệt trên Windows và Linux.
- 30 kiểm tra trạng thái Chat: 10 trạng thái × 3 nền tảng; composer đều hiện.
- Kiểm tra riêng: draft Chat sau Chat → Dịch → Chat; hủy A không đổi B;
  nhập/lưu nhận xét trong phiên; Linux GNOME dark ở 640 và KDE ở 820.
- Screenshot đã xem: Windows Chat/lỗi/Hoạt động/Home; Linux GNOME compact,
  Apps/capability/Settings; Mac được kế thừa từ Review 02 và kiểm tra lại ở Review 03.

Ảnh: [Windows](evidence/windows-home.png), [Linux dark 640](evidence/linux-gnome-640-dark.png),
[Linux capability 820](evidence/linux-capability-820.png), [macOS](evidence/macos-home.png).

**Chỉ PASS ở mức prototype được nêu trên.** Chưa kiểm chứng VoiceOver/NVDA/Orca,
IME thật, font Windows/Linux, DPI, portal, hiệu năng, stream, persistence sau
relaunch hoặc quyền trên OS thật. EN/JA vẫn là cổng localization trước triển khai;
vòng review hiện tại dùng VI và nội dung mẫu song ngữ. HTML theme không thay cho
test native runtime. Không tuyên bố mọi tổ hợp theme/size/state đã kiểm thử.

## Handoff sau khi duyệt

Giữ bộ thiết kế này trong `docs/migration`; chưa tạo SwiftUI/Qt project. Review 01
và 02 được giữ riêng. `source-tokens.snapshot.css` là bản snapshot phục vụ artifact,
không chỉnh tay hoặc import vào product. Production vẫn dùng `src/styles/tokens.css`.
`platforms.css` chỉ là art direction của bản nghiệm thu. Khi được duyệt, chuyển
semantic roles qua generator/token native và làm một vertical slice trước.

README sản phẩm vẫn đúng vì không đổi hành vi đã phát hành. Không sửa version,
release hoặc dấu review production để coi thiết kế là tính năng đã ship.

### Develop follow-up · 2026-10-26

Source inspected: remote `origin/develop` at `5f2c2a6` (PR #177), with the same tree as local `8aa4311`. This update includes session recovery from PR #176 and previewed application removal from PR #177. No production source was changed.

Open **Mới trên develop** in the prototype to inspect:
- Translate return after 2 hours and Dictionary return after 30 minutes: completed-session fixture, fresh workspace and restore previous. Fresh drafts survive navigation in memory. The fixture trigger assumes completion and elapsed time; it does not implement the production timer or persistence service.
- General settings: completed-work reset, default on, fixed thresholds; disabling does not disable recovery.
- Persistent read/write recovery errors; retry only for write failure. New work is retained, auto-reset is blocked while saving fails.
- macOS removal/reset: item selection, protected shared data, running application, open files, incomplete scan and managed application refusal; result, Undo, conflict and interrupted/unverified journal fixtures.
- Windows/Linux keep their existing platform-specific package/uninstaller proposals. They do not inherit macOS Trash/Undo behavior.

Verification: browser exercised removal → result → Undo, incomplete-scan refusal, fresh translation → draft → Chat → translation retaining draft, storage warning → retry, restore previous, and Windows application page. Screenshots: `audit/07-develop-removal.png`, `audit/08-develop-session.png`. JS syntax, Atomic and design checks pass. Atomic/design scripts scan production components, not this prototype; this extension adds no CSS literals. Full app build and runtime filesystem tests were not run because only isolated design artifacts changed. Native OS integration, true persistence/timing and screen-reader behavior remain unverified; this is a review increment, not final acceptance.

### Review 04 — revised after rejection

The user rejected Review 03. The current prototype loads `workbench-v4.js/css`, revising Home, shared shell, Chat header and Translation. Open-work switching, recent-work filters and the create chooser are interactive. Secondary review controls now live under **Công cụ review**. Evidence, tested paths and remaining limitations are in [Review 04 audit](audit/review04.md). User acceptance remains pending; this does not certify the entire desktop design as finished.

### Review 05 — independent Chat sessions

`workbench-v5.js/css` replaces the fixed Chat tab with independently switchable in-memory sessions. New Chat preserves earlier drafts and models. Close removes a Chat from open work; History can search and reopen it. History is a contextual desktop column, with a compact overlay and Escape focus restoration. Home and Activity target the correct launch-plan session. See [Review 05 evidence](audit/review05.md). Reload resets demo data; no native persistence or model calls are implemented.

### Review 06 — macOS material hierarchy

The macOS review now uses the existing source Glass material tokens for primary navigation, toolbar/work strip and floating layers, while retaining an opaque reading/composer region. Reduced transparency turns these materials solid. New Chat gets a platform shortcut hint; empty Send is disabled. Windows/Linux do not receive this material treatment. See [source trace, Apple guidance and evidence](audit/review06.md). This is a browser approximation, not proof of native Liquid Glass rendering.

### Review 07 — Settings

All eight groups now share a compact settings layout with independent scrolling, searchable group navigation, empty results and consistent rows. General, Appearance and Models receive expanded treatments; voice/chat/modules/update/about follow the same structure. Light/dark, text size and material controls update the prototype; preset cards are explicitly preview-only. See [Settings review evidence and limits](audit/review07-settings.md). Native selected-section navigation is a proposal; the current Electron Settings scroll-spy is unchanged.

### User revision — remove open-work strip

Removed the global open-work strip at the user's request. Chat sessions remain reachable through History, and running jobs through Activity. Context history now starts immediately below the toolbar. Prior screenshots describing the strip are historical. Verified Settings after removal; evidence: `audit/27-without-work-strip.png`. Only prototype artifacts changed.

### Settings header refinement

Settings now has a single toolbar row: title, contextual search and a quiet Activity control. Launcher and the redundant scope/preview line are removed from this screen. Clear search appears only for nonempty input. Browser verified search `model`, clear/reset visibility and the rendered header; screenshot `audit/28-settings-single-header.png`. JS syntax and Atomic/design checks passed. Product source remains unchanged; no native runtime/build verification was needed for this prototype-only edit.

### Review 08 — feature icon system

Prototype navigation now uses vendored Lucide outline SVGs (license in
`assets/lucide/LICENSE`), with shared geometry across desktop adapters.
Sidebar symbols use the source 20px icon token; Settings uses 16px.
Chat uses conversations, translation languages, interpretation audio waves,
dictionary an open text book, everywhere scan-text, apps an application window,
thermal a thermometer, launcher command, settings sliders. Appearance uses a
palette, modules boxes, and About information rather than the Home symbol.
Assets are local and introduce no runtime network requests or package dependency.
Production icon registry remains unchanged pending design approval.

Verified: JS syntax, Atomic Design and design-token checks; browser screenshots
29–33 cover macOS light/dark, collapsed rail, and Windows/Linux dark adapters.
These are browser design previews, not native OS runtime validation. Native builds
and product tests were not run because no product source changed.

### Language pair controls

Dictionary and Interpretation now expose independent input/output selects and a
swap button. Six fixture languages are selectable; choices survive feature
navigation within the current page session (not reload). Dictionary draft text
is retained. Existing sample output is explicitly labeled English → Vietnamese;
changing selectors does not pretend to generate a new translation. Interpretation
explains that the next segment would use the selected pair.

Verified JS syntax, atomic/design checks, browser selection (Japanese → Vietnamese),
swap (Vietnamese → English), and independent state after navigating back.
Screenshots: audit/34-dictionary-languages.png and 35-interpret-languages.png.
Native runtime and AI processing not run; this remains a design-only prototype.

### Review 10 — compact language controls

Replaces full-width selects with a compact Input / Swap / Output toolbar and a
searchable anchored picker. Localized and native language names, selected checks,
Escape dismissal, focus return, and independent feature choices are provided.
Dictionary groups language controls with its input and explicit lookup action;
changed pairs show a ready state instead of mismatched prior results. Interpretation
removes the large intro and adds a change marker after the existing transcript.
Six languages remain fixtures; lookup and audio are not connected to providers.

Verified: syntax, atomic/design checks; browser search `nhat`, selection, focus
return, swap, independent feature state, and 640px layout. Evidence screenshots
39–41. Fixed button defaults so opening/switching languages does not submit lookup.
Production code and dependencies unchanged. Native runtime / VoiceOver not tested.

### Review 11 — translation, interpretation and dictionary redesign

Three task-specific layouts replace rejected card compositions:
- Translation: unified side-by-side editor with source/output footers.
- Interpretation: full-width speaker/time transcript; summary/export/history are
  utilities rather than a permanent right-hand card stack. Bilingual toggle works.
- Dictionary: readable entry with definition/example views; saved words open
  separately. Search and language pair remain above the reading surface.
Shared configuration uses the existing searchable language picker and model dialog.
No production changes. AI operations, audio, export, and history remain fixtures.

Verified: JS syntax, atomic/design checks, screenshots of all three desktop views,
dictionary example and transcript toggles, and interpretation at 640px dark.
Screenshots 42–45. Native OS runtime, actual provider operations and full
accessibility validation remain NOT RUN. User acceptance is pending.

### Review 11.2 — one contextual title

Removed duplicate content headings and category kickers from the three language
workspaces. The shared toolbar now owns the sole level-one title: Dictionary,
Translation / document, or Interpretation / session. History and contextual
utilities move into that toolbar; Launcher remains available in navigation.
Compact layouts wrap toolbar actions without repeating the title. Refreshed
feature-icon asset URLs after observing stale fallback icons in browser review.

Verified syntax, atomic/design checks; current screenshots 46–48 cover Dictionary,
Interpretation with a long title, and Translation at 640px. Remaining design issue:
at 640px the stacked editors place output below the source; a dedicated output
switcher may be preferable for longer documents. Native runtime not exercised.

### Review 11.3 — translation viewport sizing

Desktop translation now fills the available workspace height. Each text pane
scrolls independently and its action footer stays at the bottom. Removed fixed
352px minimum and manual textarea resizing; compact stacked views retain page
scrolling with a smaller token-derived minimum. All dimensions reuse tokens.

Visual check: screenshot 49; editor bottom 785 within content bottom 797 (12px
padding), footer visible at 736–784. Atomic/design checks pass. Long-text input
check was attempted but browser input failed with a target mismatch, so long-text
interaction validation remains incomplete. No production or native runtime changes.

### Review 11.4 — aligned translation panes

Both panes now share explicit header/content/footer grid rows. Header controls no
longer increase the output header height. Footer actions use flex alignment and
36px controls, removing inline-button baseline drift. Typography and content
padding are identical in both panes.

Browser measurements: both content tops 235px, footer tops 732px, header label
centers 210.996px, and all footer button centers 758.5px. Screenshot 50 records
visual verification. Atomic/design checks pass. Prototype only; no native build.

### Review 12 — conversation history navigation

History trigger is now left of the conversation title and labeled Hội thoại.
The independent contextual sidebar contains search, new chat, count, active state
and draft previews. Search ignores Vietnamese combining accents. New-chat action
appears in the panel while open, in the chat header while closed. Compact layouts
have a dismissible outside-click layer; stored app navigation is untouched.

Verified syntax, atomic/design checks, desktop screenshot 51, `ke hoach` search,
Escape dismissal and focus return. Existing session state machinery retained.
Compact overlay, new-session switching and draft retention not re-tested this turn.
Prototype only; native runtime and full accessibility acceptance remain pending.

### Review 13 — one history system across four workspaces

Chat, Translation, Interpretation and Dictionary now share the same left-of-title
history trigger, contextual sidebar geometry, search field, active row treatment,
new-item placement, and Escape/focus-return behavior. The old language history
dialog entry points are removed. Chat's duplicate content header is removed too.
Feature names and metadata remain specific (conversation, language pair, draft,
listening state). At compact width the panel overlays content and dismisses outside.
Activity closes history instead of stacking two contextual panels.

Prototype records are isolated per feature and kept only in memory. Translation,
interpretation and dictionary snapshots include their language pair, model and
relevant draft/session fields. Creating a new record preserves the old one;
opening a record restores its state. Blank translations do not display fixture
output or enable copy/compare. No disk history or provider calls are implemented.

Verified: JS syntax and atomic/design checks; all four history surfaces inspected;
created a new translation, entered a draft, switched to the original and back,
confirmed text restoration; compact Chat search `ke hoach`, Escape and focus return.
Screenshots 52–56 cover the shared layout. Minor final fixes remove a redundant
breadcrumb slash and dictionary term repetition, and close history for Activity.
Native OS builds, persistence across reload, large history performance, and full
screen-reader validation remain NOT RUN. User acceptance remains pending.

### Review 14 — floating history library

Replaces the contextual sidebar from Review 13 with one centered modal library
shared by Chat, Translation, Interpretation and Dictionary. Opening history no
longer compresses the workspace. Search, current-item metadata, previews and
new-item action share one layout; choosing or creating an item closes the library.
The reading surface is opaque in both modes to prevent underlying content from
showing through. The backdrop preserves workspace context.

Verified in browser: Chat search without Vietnamese accents, Escape dismissal and
focus return, Translation selection and closed-dialog state, and the final opaque
layout (screenshot 57). JavaScript syntax and atomic/design checks pass. These
repository checks do not scan this standalone prototype; new stylesheet values
were manually checked for token references. Native builds, dark/compact visual
acceptance and full screen-reader testing were not run for this iteration.
History remains session-memory-only; user acceptance is pending.

### Review 15 — history workspace

Review 14 was rejected. History now occupies the feature workspace with a list
and separate preview column. Selecting a row previews it; Open restores that
record. Back returns to the current work. All four features share this structure.
Feature editing controls are hidden while browsing history.

Verified Translation layout in browser, Open restoring source text and language
pair, JS syntax, atomic/design checks. Screenshot 58 captures the new structure.
Checks do not scan standalone prototype styles; added values use source tokens.
Native builds, large-list, compact and screen-reader acceptance remain untested.
This is a session-memory prototype, pending design approval.

### Review 16 — history trigger placement

Corrects the interpretation of the request: this iteration changes the history
button placement, not the history browsing layout. All four feature headers use
a trailing History / New action group, separate from global Activity. History
uses a clock icon and neutral emphasis; New uses a soft accent. The title remains
uninterrupted at the leading edge. Syntax and atomic/design checks pass; browser
QA covers the four desktop headers. Native and compact acceptance remain pending.

### Review 17 — anchored quick history

History now opens a non-modal popover below its header button. It contains search,
current-item state, record previews and a full-history link. Only that link opens
the Review 15 library. Native popover light dismissal preserves the canvas;
Escape returns focus to the trigger. Shared by all four feature adapters.

Verified Translation popover geometry, outside click, Escape/focus return,
full-library transition and back. Screenshot 60. JS syntax, atomic and design
checks pass; those checks do not scan this prototype. Native OS, compact, dark
mode and full screen-reader testing remain pending. Records remain in memory.

### Review 18 — interaction readiness and native handoff

Fixes session/model isolation, named compact New controls, window-bounded History
and Activity positioning, consistent task stop/retry, and correct task-to-record
navigation. Changed translation/dictionary input no longer keeps a mismatched
sample result. History search supports unaccented Vietnamese and arrow/Enter/Escape
navigation; search-field focus follows the border-only rule.

[Handoff](../review18-handoff.md) records platform mappings, observed checks and
remaining gates. [Visual review](audit/review18-handoff/index.html) has screenshots.
Claude Fable 5.1 review is BLOCKED by Invalid API key, not completed. User approved
the bounded 7-image/17-file packet and is updating Claude Code authentication.
No native app or production Electron changes are included in this iteration.
