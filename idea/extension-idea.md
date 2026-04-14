---
title: Extension Idea
---

## Idea

Đây là application trên OS như MacOS và Windows, nhưng việc copy paste từ native application sang các application khác như Slack, Zalo, Chrome (các ứng dụng khác của Chromenium), ... tốn nhiều thời gian và công sức
Vì vậy muốn bổ sung thêm một dạng extension của application bằng một custom hot key có thể cài đặt trong màn hình Settings, khi user mở application thì hoàn toàn có thể dịch trực tiếp trên các application khác bằng cách nhấn hot key đã cài trước đó và replace luôn text cũ mà user đang gõ sẵn ở bộ nhập nội dung.
Riêng với Chrome hoặc các ứng dụng browser khác sử dụng nhân chromium thì sẽ có một dạng Legency Assistant, ở trên browser sẽ có icon (logo) nhỏ của application hiện lên và trong đó user có thể config nhanh để có thể dịch ngôn ngữ. Tuy nhiên config như API Key,... cần config trên native application được cài đặt ở OS

## Tính khả thi

## Tổng quan định hướng

Có thể xây được, nhưng nên chia thành *2 cơ chế riêng* thay vì cố làm một cách duy nhất cho mọi nơi:

* *Desktop universal translate*:
    * Dùng *global hotkey* ở cấp OS
    * Hỗ trợ mọi app ở mức “best effort”
    * Cơ chế chính: lấy selected text hoặc text trong input, gửi đi dịch, rồi replace lại

* *Browser enhanced translate*:
    * Với Chrome/Edge/Chromium, có 2 lựa chọn:
        * *Khuyến nghị*: browser extension + native app bridge
        * *Legacy assistant không cần extension*: native app inject JS/CSS hoặc dùng accessibility/automation để gắn một floating helper vào browser window
    * Cách “không cài extension gì cả” *có thể làm một phần*, nhưng khó ổn định và khó maintain hơn extension rất nhiều

Nếu mục tiêu là sản phẩm thương mại ổn định, tôi khuyên:

* Bản 1:
    * desktop hotkey cho mọi app
    * browser extension cho Chrome/Edge
* Bản 2:
    * thêm “legacy assistant” cho Chromium như một lớp fallback hoặc marketing feature
    * không dùng nó làm cơ chế chính

Lý do: browser extension là cách đúng chuẩn để thao tác text/input/DOM trong web page. Còn “icon nổi trong trình duyệt mà không cài extension” thực chất là workaround, không phải integration first-class.

---

## Solution architecture chi tiết

## 1. Mục tiêu hệ thống

Hệ thống phải cho phép:

* User dịch text trực tiếp khi đang dùng app khác
* Không cần copy/paste thủ công
* Có thể replace text cũ ngay trong input nếu khả thi
* Hoạt động trên:
    * macOS
    * Windows
    * Chrome/Edge/Chromium-based browser
* Config nhạy cảm như:
    * API key
    * model
    * account
    * quota
    * audit/log policy
  chỉ nằm ở native app

---

## 2. Kiến trúc tổng thể

```text
+--------------------------------------------------------------+
|                        Native Desktop App                     |
|--------------------------------------------------------------|
| Settings UI                                                  |
| Translation Orchestrator                                     |
| Auth / API Key Manager                                       |
| Secure Storage                                               |
| Hotkey Manager                                               |
| Selection Capture Service                                    |
| Text Replace Service                                         |
| Clipboard Guard                                              |
| Overlay / Toast UI                                           |
| Browser Bridge Service                                       |
| Local IPC / Native Messaging Host                            |
| App-specific Adaptors                                        |
+--------------------------------------------------------------+
                  |                           |
                  |                           |
                  v                           v
     +------------------------+      +------------------------+
     | macOS OS Integration   |      | Windows OS Integration |
     | Accessibility          |      | UI Automation          |
     | Input Monitoring       |      | Win32 hooks            |
     | Apple Events / AX APIs |      | Clipboard APIs         |
     +------------------------+      +------------------------+

                  |
                  v
     +--------------------------------------------------+
     | Chrome / Edge / Chromium                         |
     |--------------------------------------------------|
     | Option A: Browser Extension                      |
     | - Content script                                 |
     | - Popup UI                                       |
     | - Context menu                                   |
     | - Shortcut                                       |
     | - Native messaging bridge                        |
     |                                                  |
     | Option B: Legacy Assistant (fallback)            |
     | - Floating icon / helper                         |
     | - JS injection or automation-assisted overlay    |
     +--------------------------------------------------+
```

---

## 3. Các thành phần chính

## 3.1 Native Desktop App Core

Đây là app chính trên macOS/Windows.

### Chức năng

* Login/account
* Cấu hình source/target language
* Chọn model AI / provider
* Quản lý API key
* Chọn hotkey
* Bật/tắt tính năng theo app
* Quản lý browser integration
* Logging, analytics, diagnostics

### Module nội bộ

* `Settings Module`
* `Translation Orchestrator`
* `Hotkey Manager`
* `Selection Capture Service`
* `Text Replace Service`
* `Clipboard Guard`
* `Secure Storage`
* `Browser Bridge Service`
* `Permission Manager`

---

## 3.2 Translation Orchestrator

Nhiệm vụ:

* Nhận text đầu vào
* Xác định mode:
    * translate selection
    * translate inline replace
    * translate compose
* Chuẩn hóa text
* Gọi AI provider
* Trả kết quả
* Cache tạm nếu cần
* Timeout/retry/fallback

### Input

* text
* source language
* target language
* context app/browser/site
* mode
* optional glossary/tone

### Output

* translated text
* metadata:
    * detected language
    * latency
    * provider used
    * confidence nếu có

---

## 3.3 Hotkey Manager

### Nhiệm vụ

* Đăng ký global hotkey
* Cho user custom trong Settings
* Dispatch action tương ứng:
    * translate selected text
    * translate and replace
    * open quick translator
    * re-translate with last pair

### Ví dụ shortcut

* macOS: `⌥ + Shift + T`
* Windows: `Alt + Shift + T`

---

## 3.4 Selection Capture Service

Đây là phần quan trọng nhất.

### Mục tiêu

Lấy text mà user đang:

* bôi đen
* đang nhập trong input
* hoặc text gần caret

### Strategy chain

Không nên dùng một cách duy nhất. Nên có *multi-strategy fallback*:

#### Strategy 1: Accessibility/UI Automation
* macOS:
    * AXUIElement
    * selected text / focused element / value / selected range
* Windows:
    * UI Automation TextPattern / ValuePattern

Ưu điểm:
* sạch hơn clipboard
* có thể giữ selection/caret tốt hơn

Nhược điểm:
* không phải app nào cũng expose tốt

#### Strategy 2: Simulated Copy
* Gửi `Cmd+C` / `Ctrl+C`
* Đọc clipboard tạm
* Restore clipboard sau khi xong

Ưu điểm:
* support rộng
* ra MVP nhanh

Nhược điểm:
* ảnh hưởng clipboard
* có delay
* một số app chặn

#### Strategy 3: Browser-side direct extraction
Nếu đang ở browser có integration:
* content script lấy `selection`, `input.value`, `textarea.value`, `contenteditable`

Ưu điểm:
* chính xác nhất trên web
* replace đẹp nhất

#### Strategy 4: App-specific adapters
Ví dụ:
* Slack desktop
* Zalo desktop
* Teams
* Outlook

Mỗi app có workaround riêng.

---

## 3.5 Text Replace Service

Dùng để ghi ngược translated text vào đúng nơi user đang nhập.

### Strategy chain

#### Replace 1: Accessibility/UI Automation set value
* Set selected text hoặc replace range

#### Replace 2: Simulated paste
* Đưa translated text vào clipboard tạm
* Gửi paste
* Restore clipboard

#### Replace 3: Browser DOM replace
Trong browser:
* thay `value`
* dispatch `input/change`
* thao tác `Range/Selection` cho `contenteditable`

#### Replace 4: Simulated keystrokes
Fallback cuối cùng, ít khuyến nghị.

### Yêu cầu

* Cố gắng giữ:
    * caret position
    * undo stack
    * selection state
* Không dùng cho:
    * password fields
    * secure input

---

## 3.6 Clipboard Guard

Module riêng để tránh UX xấu.

### Chức năng

* Lưu clipboard cũ
* Phân biệt text/image/file clipboard
* Restore an toàn sau khi dịch xong
* Timeout nếu clipboard đã bị user thay đổi trong lúc xử lý
* Không restore đè nội dung mới do user tạo sau đó

### Quy tắc nên có

* Gắn `clipboard transaction id`
* Chỉ restore nếu clipboard vẫn do app kiểm soát trong khoảng thời gian ngắn

---

## 3.7 Browser Bridge Service

Dùng khi app cần làm việc với browser.

### Hai mode

#### Mode A: Extension Bridge
* Extension kết nối native app qua:
    * native messaging
    * localhost websocket/http
    * named pipe bridge

#### Mode B: Legacy Assistant Bridge
* App phát hiện browser window
* Inject helper UI hoặc overlay
* Helper gửi lệnh về native app

### Khuyến nghị
* Dùng *Extension Bridge* làm chính
* *Legacy Assistant* chỉ là fallback

---

## 3.8 Secure Storage

Lưu:

* API key
* refresh token
* tenant config
* encryption secret local

### Nền tảng

* macOS Keychain
* Windows DPAPI / Credential Manager

Không lưu API key trong browser extension.

---

## 4. Kiến trúc cho browser

## 4.1 Option khuyến nghị: Browser extension

### Thành phần

* `background service worker`
* `content scripts`
* `popup`
* `context menu`
* `commands`
* `native messaging client`

### Vai trò

* Đọc text hiện tại từ page
* Replace text trong DOM
* Hiện icon/popup
* Gửi request tới native app
* Nhận config public từ native app

### Dữ liệu native app giữ

* API key
* session
* model settings
* policy
* advanced config

### Dữ liệu extension giữ

* last UI state
* last selected languages
* ephemeral session id

---

## 4.2 Option bạn muốn: Legacy assistant không cần cài extension

### Có thể làm theo 3 hướng

#### Hướng 1: Browser helper injection qua remote debugging protocol
* Kết nối Chromium qua DevTools Protocol
* Inject JS/CSS vào page
* Hiện icon nổi

Nhược điểm:
* cần attach vào browser/page
* không thân thiện bảo mật
* setup phức tạp
* dễ vỡ theo browser version/policy

#### Hướng 2: Accessibility + overlay nổi theo window
* App vẽ một floating button nằm gần browser window
* Khi focus vào browser input, app hiện helper
* Khi click helper, app dùng automation để lấy text, dịch, paste lại

Nhược điểm:
* icon không thực sự “nằm trong DOM”
* khó đồng bộ vị trí caret/input
* không chính xác bằng extension

#### Hướng 3: Proxy/injection kiểu network/script
* can thiệp sâu vào page load
* inject script trợ lý

Nhược điểm:
* cực khó maintain
* rủi ro bảo mật/pháp lý
* không nên chọn

### Kết luận cho legacy assistant

*Làm được mức UX gần giống*, nhưng không nên coi là giải pháp chính.
Nếu user nói “không muốn cài extension”, bạn có thể cung cấp:

* floating helper ngoài browser window
* context hotkey cho browser
* mini popup near caret

Đây là thực tế hơn.

---

## Flow kỹ thuật cho macOS / Windows / Chrome extension

## 1. Flow chung: Dịch selected text bằng hotkey

```text
User selects text in any app
    -> presses global hotkey
        -> Hotkey Manager receives event
            -> Selection Capture Service tries capture strategies
                -> Accessibility/UIA
                -> fallback to simulated copy
            -> Translation Orchestrator calls AI service
            -> Text Replace Service writes translated text back
            -> Overlay/Toast shows success/failure
```

---

## 2. Flow macOS chi tiết

## 2.1 Quyền hệ thống

Cần ít nhất:

* Accessibility
* có thể cần Input Monitoring nếu bắt phím/giả lập input theo cách đang dùng

### Thành phần macOS

* Swift/AppKit service
* AX API wrapper
* Global shortcut registration
* Pasteboard manager
* Optional menu bar app

## 2.2 Flow lấy text

### Case A: Accessibility thành công

```text
Focused app detected
    -> AXUIElementCopyAttributeValue(focused element)
    -> read selected text / selected text range / value
    -> if selected text exists, use it
    -> else fallback
```

### Case B: Fallback bằng clipboard

```text
Save current NSPasteboard snapshot
    -> simulate Cmd+C
    -> wait 100-300 ms
    -> read clipboard text
    -> if text changed and non-empty, use it
    -> continue translation
```

## 2.3 Flow replace text

### Case A: AX replace
```text
Focused AX element
    -> compute selected range
    -> set selected text / set value / insert replacement
    -> try preserve caret
```

### Case B: paste replace
```text
Store old clipboard
    -> write translated text to clipboard
    -> simulate Cmd+V
    -> restore clipboard if safe
```

## 2.4 Rủi ro macOS

* Một số app không expose AX đầy đủ
* Secure text field không truy cập được
* App sandbox hoặc webview custom có thể hạn chế
* App Store review có thể nhạy cảm nếu dùng automation mạnh

---

## 3. Flow Windows chi tiết

## 3.1 Thành phần Windows

* C#/.NET service
* RegisterHotKey hoặc low-level keyboard hook
* UI Automation
* Clipboard manager
* SendInput

## 3.2 Flow lấy text

### Case A: UI Automation

```text
Get focused element
    -> inspect supported patterns
        -> TextPattern
        -> ValuePattern
    -> read selected text or control value
    -> if success, continue
```

### Case B: clipboard fallback

```text
Save current clipboard
    -> SendInput Ctrl+C
    -> wait 100-300 ms
    -> read clipboard text
    -> continue
```

## 3.3 Flow replace text

### Case A: UIA set value / replace range
```text
If ValuePattern supported
    -> replace value or selected range
```

### Case B: paste fallback
```text
Set translated text to clipboard
    -> SendInput Ctrl+V
    -> restore previous clipboard if safe
```

## 3.4 Rủi ro Windows

* Ứng dụng chạy admin có thể không bị app thường điều khiển
* Rich editors custom không expose pattern chuẩn
* UWP/Electron/webview mỗi loại hành vi khác nhau

---

## 4. Flow Chrome/Edge extension chi tiết

## 4.1 Kiến trúc extension

* `background.js` hoặc service worker
* `content-script.js`
* `popup.html/js`
* `commands`
* `native messaging connector`

## 4.2 Flow khi user bấm icon extension

```text
User clicks extension icon
    -> popup opens
    -> popup asks content script for current context
        -> selection text?
        -> focused input?
        -> textarea?
        -> contenteditable?
    -> popup shows source/target language
    -> user clicks Translate / Replace
    -> extension sends request to native app
    -> native app calls AI translation
    -> response returns to extension
    -> content script replaces DOM text
```

## 4.3 Flow khi user dùng shortcut trong browser

```text
User focuses input on webpage
    -> presses browser command shortcut
    -> background sends message to content script
    -> content script extracts selected or surrounding text
    -> native app translates
    -> content script replaces value/range
    -> dispatches input/change events if needed
```

## 4.4 Flow Native Messaging

```text
Extension
    -> connects to native host
    -> sends request:
        { action, tabContext, text, sourceLang, targetLang }
Native host
    -> validates extension ID/origin
    -> forwards to desktop app translation service
Desktop app
    -> returns translated text
Native host
    -> sends response to extension
```

---

## 5. Flow cho “legacy assistant” không cần extension

Đây là bản gần nhất với mong muốn của bạn.

## 5.1 Cách khả thi nhất

Thay vì “icon bên trong browser thật sự”, hãy làm:

* app phát hiện browser đang active
* nếu đang focus input trên browser:
    * hiện một floating icon nhỏ cạnh cửa sổ browser hoặc gần caret tương đối
* user click icon hoặc hotkey
* app lấy text bằng:
    * automation
    * copy fallback
* dịch
* replace bằng paste hoặc automation

### Flow

```text
Desktop app monitors active window
    -> detects Chrome/Edge/Chromium process
    -> detects probable text-entry state
    -> shows floating assistant button near browser window
    -> user clicks button
    -> app captures selected text/current input
    -> translates
    -> replaces text
```

### Giới hạn

* không truy được DOM thật sự
* vị trí icon chỉ là overlay
* không đẹp bằng extension
* web editor phức tạp sẽ hay lỗi hơn

---

## Khuyến nghị công nghệ

## Native app

### Nếu ưu tiên tốc độ ra sản phẩm
* Tauri cho shell/UI
* Rust sidecar hoặc native module cho hotkey/clipboard/OS integration
* macOS bridge viết Swift
* Windows bridge viết C# hoặc Rust + Win APIs

### Nếu ưu tiên ổn định lâu dài
* macOS:
    * Swift + AppKit
* Windows:
    * C#/.NET + WPF/WinUI
* Shared business logic:
    * Rust / TypeScript backend service / C# core tùy team

### Khuyến nghị thực tế
Nếu app của bạn cần automation sâu với OS, *không nên phụ thuộc hoàn toàn vào Electron/Tauri* cho lớp integration. Nên có *native helper/service* riêng cho:
* hotkey
* accessibility/UIA
* clipboard
* input simulation

---

## App states và modes nên hỗ trợ

* `Translate Selection`
* `Translate and Replace`
* `Open Mini Translator`
* `Browser Inline Translate`
* `Legacy Assistant Mode`
* `Quick Re-translate Last Text`

---

## Danh sách capability theo nền tảng

| Capability | macOS | Windows | Chrome Extension |
|---|---|---|---|
| Global hotkey | Tốt | Tốt | Không áp dụng ngoài browser |
| Capture selected text | Trung bình-Tốt | Trung bình-Tốt | Tốt |
| Replace selected text | Trung bình | Trung bình | Tốt |
| Rich editor support | Hạn chế | Hạn chế | Khá tốt |
| Keep undo stack | Hạn chế | Hạn chế | Tốt hơn |
| Floating assistant no extension | Có thể | Có thể | Không áp dụng |
| Native secure config | Tốt | Tốt | Chỉ nên đọc qua bridge |

---

## PRD ngắn gọn để giao team dev

## 1. Product title

*Inline AI Translator for Desktop and Browser*

## 2. Product goal

Cho phép người dùng dịch văn bản trực tiếp trong app khác và trên web mà không cần copy/paste thủ công, thông qua hotkey toàn cục và browser assistant kết nối với native desktop app.

## 3. Problem statement

Người dùng hiện phải:
* copy text từ app A
* chuyển sang app dịch
* paste
* dịch
* copy kết quả
* quay lại app A
* paste lại

Quy trình này chậm, gây gián đoạn và làm giảm trải nghiệm sử dụng AI translation.

## 4. Objectives

* Rút ngắn thao tác dịch xuống 1 hotkey hoặc 1 click
* Hỗ trợ macOS và Windows
* Hỗ trợ browser inline translate
* Lưu secret/config ở native app
* Hạn chế tối đa ảnh hưởng clipboard và undo

## 5. Non-goals

* Không cam kết hỗ trợ hoàn hảo mọi app/editor
* Không hỗ trợ secure/password fields
* Không đảm bảo giữ undo stack trên mọi native app
* Không làm deep integration cho mọi browser nếu không có extension

## 6. User stories

* Là user, tôi muốn chọn một đoạn text trong bất kỳ app nào và nhấn hotkey để dịch và thay thế ngay.
* Là user, tôi muốn cấu hình hotkey trong Settings.
* Là user, tôi muốn dịch text ngay trong browser input mà không cần copy/paste.
* Là user, tôi muốn API key chỉ lưu trong ứng dụng desktop.
* Là user, tôi muốn có một assistant nhỏ khi dùng browser để dịch nhanh.

## 7. Functional requirements

### FR-1 Global hotkey
* User có thể bật/tắt hotkey
* User có thể custom shortcut
* Hotkey hoạt động khi app chạy nền

### FR-2 Capture selected text
* Hệ thống thử lấy selected text từ focused app
* Nếu thất bại, fallback sang clipboard copy simulation

### FR-3 Translate
* Hỗ trợ chọn source/target language
* Hỗ trợ auto-detect source language
* Timeout tối đa mặc định: 10 giây

### FR-4 Replace text
* Nếu app/editor hỗ trợ, replace selected text
* Nếu không, cho phép chỉ copy kết quả hoặc show popup

### FR-5 Browser assistant
* Hiển thị entry point trong browser
* Cho phép dịch selected text hoặc text trong input
* Gọi translation qua native app bridge

### FR-6 Secure config
* API key không lưu ở extension
* Secret lưu trong OS secure store

### FR-7 Feedback UI
* Toast/loading khi đang dịch
* Error message nếu thiếu permission hoặc app không hỗ trợ

## 8. Non-functional requirements

* Thời gian phản hồi mục tiêu:
    * local action dưới 150 ms trước khi gửi request AI
    * end-to-end dưới 2,5 giây với request ngắn trong điều kiện mạng bình thường
* Không crash browser/app đang thao tác
* Clipboard restore thành công trên 95% flow fallback
* Logging không chứa plaintext nhạy cảm nếu user không bật debug mode

## 9. Supported platforms

### Phase 1
* macOS 13+
* Windows 10/11
* Chrome, Edge

### Phase 2
* Firefox
* Electron apps phổ biến
* Browser legacy assistant fallback

## 10. UX requirements

* Có onboarding xin quyền Accessibility/UI Automation
* Có màn hình test hotkey
* Có màn hình test browser connection
* Có trạng thái rõ ràng:
    * Ready
    * Waiting permission
    * Translating
    * Replace failed
    * Browser assistant connected

---

## Tech spec ngắn gọn để giao dev

## 1. Components

### Native Desktop
* `settings-ui`
* `translation-core`
* `hotkey-service`
* `capture-service`
* `replace-service`
* `clipboard-service`
* `browser-bridge-service`
* `secure-store`
* `permission-service`

### Browser
* `extension-background`
* `extension-content-script`
* `extension-popup`
* `native-messaging-client`

### Optional Legacy
* `browser-overlay-helper`
* `chromium-detector`

---

## 2. API nội bộ đề xuất

### Translate request
```json
{
    "requestId": "uuid",
    "mode": "replace_selection",
    "text": "Hello world",
    "sourceLang": "auto",
    "targetLang": "vi",
    "context": {
        "platform": "macos",
        "app": "Google Chrome",
        "site": "mail.google.com",
        "inputType": "contenteditable"
    }
}
```

### Translate response
```json
{
    "requestId": "uuid",
    "success": true,
    "translatedText": "Xin chào thế giới",
    "detectedSourceLang": "en",
    "latencyMs": 840
}
```

### Capture response
```json
{
    "success": true,
    "captureMethod": "accessibility",
    "text": "How are you?",
    "selectionRange": {
        "start": 0,
        "end": 12
    },
    "replaceSupported": true
}
```

---

## 3. Trạng thái xử lý

```text
IDLE
 -> HOTKEY_TRIGGERED
 -> CAPTURING_TEXT
 -> TRANSLATING
 -> REPLACING_TEXT
 -> SUCCESS
 -> or FAILED
```

---

## 4. Fallback logic

```text
Capture:
    accessibility/uia
    -> browser direct DOM if connected
    -> clipboard copy fallback
    -> fail

Replace:
    browser DOM replace
    -> accessibility/uia replace
    -> clipboard paste fallback
    -> copy result only
```

---

## 5. Error codes đề xuất

* `ERR_PERMISSION_MISSING`
* `ERR_NO_TEXT_FOUND`
* `ERR_CAPTURE_UNSUPPORTED`
* `ERR_TRANSLATION_TIMEOUT`
* `ERR_REPLACE_FAILED`
* `ERR_BROWSER_NOT_CONNECTED`
* `ERR_SECURE_FIELD_BLOCKED`

---

## 6. Telemetry nên đo

* hotkey trigger count
* capture success rate by app
* replace success rate by app
* average latency
* browser bridge connected rate
* permission denial rate
* fallback usage rate
* clipboard restore failure rate

---

## 7. Test matrix tối thiểu

### macOS
* TextEdit
* Notes
* Chrome
* Edge
* Slack
* Zalo
* Word nếu có

### Windows
* Notepad
* WordPad hoặc app text chuẩn
* Chrome
* Edge
* Slack
* Zalo
* Outlook nếu có

### Browser
* `input`
* `textarea`
* `contenteditable`
* Gmail compose
* Slack web
* Messenger web
* Notion web
* Google Docs để xác định limitation

---

## 8. Lộ trình triển khai khuyến nghị

## Phase 1: MVP trong 4-6 tuần
* Native app settings
* Global hotkey
* Clipboard fallback capture/replace
* Basic AI translation flow
* Toast/overlay
* macOS + Windows basic support

## Phase 2: Stability trong 4-6 tuần
* Accessibility/UIA capture
* Better replace logic
* Clipboard Guard
* App compatibility tracking
* Permission onboarding

## Phase 3: Browser integration trong 4-8 tuần
* Chrome/Edge extension
* Native messaging
* Browser popup + inline replace
* Native app config sync

## Phase 4: Legacy assistant fallback
* Floating helper for Chromium
* Browser-focused overlay
* Limited no-extension support

---

## Quyết định kiến trúc tôi khuyến nghị

Nếu phải chốt nhanh để team làm, tôi sẽ chốt như sau:

* *Core desktop experience*:
    * global hotkey
    * capture/replace bằng accessibility + clipboard fallback

* *Browser experience chính thức*:
    * Chrome/Edge extension
    * native messaging với desktop app
    * không lưu API key ở extension

* *Legacy no-extension assistant*:
    * chỉ làm dưới dạng floating helper ngoài browser window
    * không hứa là icon nằm “bên trong” page một cách ổn định
    * không dùng làm giải pháp chính

Lý do:
* triển khai được thực tế
* dễ kiểm soát bảo mật
* scale được
* ít rủi ro hơn kiểu injection trực tiếp vào browser mà không extension

---

## Kết luận ngắn gọn cho team/business

* Ý tưởng hoàn toàn khả thi
* Nên chia thành:
    * *Universal hotkey translation* cho desktop apps
    * *Extension-based inline translation* cho browser
* Nếu muốn “không cần cài extension”, chỉ nên làm *legacy floating assistant* như fallback, không nên là luồng chính
* Secret/config nên nằm hết ở native app
* Cần chấp nhận rằng replace text sẽ là *best effort*, không thể 100% cho mọi app/editor

Nếu bạn muốn, bước tiếp theo tôi có thể viết ngay cho bạn 1 trong 3 tài liệu sau ở mức sẵn sàng đưa dev dùng luôn:

* *System design document 2-3 trang*
* *PRD chuẩn format sản phẩm*
* *Technical specification có sequence diagram + module breakdown + API contract*
