# Issues and design debt found while writing the specifications

These issues were identified while comparing each screen with its implementation (2026-10-25). Design differences and proposed features remain in section 10 of each specification under `screens/`; this file collects **behavioral issues** and **convention debt** as actionable work. Resolved items move to "Fixed"; the remaining tables and lists contain outstanding work only.

## Fixed

- [x] Native Glass shared components (2026-11-03): replaced the composer's thick
  accent focus ring with a neutral inset editing edge; search fields share
  capsule geometry. Filters and Settings navigation use raised selection
  lenses, while floating text panels share a quiet perimeter and opaque reading
  center. Qt filter selection now updates its content from keyboard arrows as
  well as pointer activation. Palette and native input ownership are retained;
  visual/platform acceptance is tracked separately in the
  [component report](../migration/reports/native-migration-report-20261103-glass-components.md).

- [x] Status tokens (success, warning, danger, disabled, scrim, skeleton) were declared only under `html.dark`, so elements pinned to `data-mode="dark"` (Appearance previews and dark board frames) still received light colors. Updated the selectors to `html.dark, [data-mode="dark"]` and `:root, [data-mode="light"]` in `resources/tokens.css` during the documentation pass.
- [x] AI Chat: the failed-research button now says "Restart research from the beginning", matching its full-restart behavior (`chat_research_retry_step`, `src/i18n/locales/*.ts`).
- [x] AI Chat: the sidebar shows "Deep research · stopping" only when the session is not running (`chatRunningSessionIds` in `chatSlice.ts`, `AIChatSidebar.tsx`).
- [x] AI Chat: removed the like/dislike buttons that had no `onClick` (`MessageBubble.tsx`).
- [x] AI Chat: changed the page root to `<section aria-label="AI Chat">` and removed `role="application"` (`ChatPage.tsx`).
- [x] Interpretation: denied screen-recording permission in "Both" mode now reports the correct Screen Recording error (`useLiveTranslate.ts`).
- [x] Home: the System card shows sensor errors with "Retry" and reports "No sensors" instead of remaining on "Reading sensors…" (`HomeSystemCard.tsx`).
- [x] Launcher & shortcuts: disabling Translate no longer counts Quick Translate as running, preventing false shortcut-conflict warnings (`useShortcutInventory.ts`).
- [x] Settings: deleting an ElevenLabs key checks the result and reports Keychain errors; deleting a Groq key asks for confirmation (`TtsSection.tsx`, `SttSection.tsx`).
- [x] Settings: failed chat-image cleanup/deletion re-enables the button and shows an error toast (`ChatImageStorageCard.tsx`).
- [x] Settings: key-deletion confirmation uses a single interpolation key, "Delete the API key for {name}?" (`ApiKeyInput.tsx`, `DeepResearchApiSection.tsx`).
- [x] Settings: `CheckUpdateButton` always uses `neutral · outline`, avoiding two adjacent `solid` buttons (`CheckUpdateButton.tsx`).
- [x] Shell: collapsed CSS uses `max-width: 899px`, matching the JavaScript `< 900` condition (`codex.css`).
- [x] Thermal: hooks no longer contain hardcoded English fallbacks; the page uses localized messages (`useThermalMonitor.ts`, `useFanControl.ts`, `useFanProfiles.ts`, `useThermalSettings.ts`).
- [x] Accessibility: added `aria-live="polite"` to Launcher answers (`AIChatPopup.tsx`), calculator/currency results (`QuickLauncher.tsx`), finalized interpretation sentences (`LiveTranslatePage.tsx`) and new dictionary entries (`DictionaryResultPanel.tsx`).
- [x] Accessibility: disabled shortcuts on Home include "· disabled" (`ShortcutList.tsx`).
- [x] Accessibility: text-size button groups have an accessible name (`FontSizePicker.tsx`); the two toggles are named "Enable Quick Translate" and "Enable Launcher" (`settings_hotkey_enabled`, `settings_chat_hotkey_enabled`).
- [x] Hardcoded Tailwind colors were replaced with tokens in `CostOverviewCard`, `ProviderCostStats` (`src/styles/cost.css`), `MessageBubble`, `ResearchStepsPanel` (`chat.css`), the interpretation permission dialog (`DialogShell` + `ai-configuration.css`) and `AIChatPopup.tsx` (`codex.css`).
- [x] Hardcoded values: `translate.css` no longer uses `rem` (it uses `--vzn-translate-*` tokens); Chat's "+" menu uses `--vzn-chat-plus-menu-inline` and `--vzn-layer-picker` (`chat.css`).
- [x] Container-based media queries: `.app-panel-grid` uses two columns from an `app-main` width of 900 px (`src/index.css`); Settings section tabs respond to `app-main` < 760 px (`codex.css`, `SettingsTemplate.tsx`).
- [x] Sibling button sizes: "Use as source" is now `md` (`TranslationResultPane.tsx`); the ✕ button beside the shortcut recorder is also `md` (`HotkeySection.tsx`, `ChatPresetsSection.tsx`).
- [x] Dead code: removed `ChatPageV2.tsx`, `SystemPromptDropdown.tsx`, `VoiceOverlay.tsx` and `.settings-choice-row`.
- [x] Hardcoded English in `AIChatPopup.tsx` ("New conversation", "Quick AI", etc.) now uses i18n keys; the default "New Chat" title is localized in the sidebar and Chat header (`DEFAULT_CHAT_SESSION_TITLE`, `AIChatSidebar.tsx`).
- [x] AI Chat and Quick Chat: Enter used to commit IME composition does not send a message (`shouldSendChatMessage` ignores `isComposing`/`keyCode 229`, PR #153); Escape used to cancel IME composition does not hide Quick Chat (`AIChatPopup.tsx`).
- [x] Settings: saved API keys can be replaced without deleting them first (`CredentialCard.tsx`, PR #153).
- [x] Translate Everywhere: deleting another token does not close the dialog displaying a newly created token (`BrowserIntegrationSection.tsx`, PR #153).
- [x] Accessibility: removed global `outline: none`; keyboard focus uses the shared ring from `tokens.css` (`codex.css`, PR #153).
- [x] Home: untitled conversations show the localized "New Chat" title in the Continue row (`chatSessionTitle` in `src/utils/chatSessionTitle.ts`, shared with the AI Chat sidebar).
- [x] Settings: Groq/ElevenLabs keys show "Saving…" while being saved (`settings_key_saving`).
- [x] EN/VI/JA copy: all ten risks in `locales.md` were addressed (Japanese word order such as "{key}を押す", short Japanese navigation labels, Japanese spacing, the High quality mode name, dates following the app locale, etc.).

## Behavioral issues

No known behavioral issues remain in this list.

## Accessibility

No known accessibility items remain in this list.

## Convention debt (hardcoded values instead of tokens, inconsistent button sizes)

- Hardcoded Tailwind colors: the Interpretation Summary dialog (`LiveTranslatePage.tsx`) and Chrome token form (`BrowserIntegrationSection.tsx`).
- Hardcoded CSS values: `codex.css` (sidebar `10px 8px`, `180ms`, command palette `560px`/`480px`); `chat.css` (`5px 9px`, `104px`, `44px`, `720px`, `.usage-cost-badge` at 18/10/11 px).
- Dead code: Home's activity icon is not passed to `ActivityRow`; nine thermal i18n keys are unused.

## Quyết định thiết kế (2026-11-03 · Liquid Glass 2.0)

Nguồn: canvas <https://claude.ai/artifact/A39txAordDuiSCrtznFhrQ>, chép vào
`docs/design/glass2/` cùng [HANDOFF.md](glass2/HANDOFF.md). Các dòng dưới thay
thế quyết định cùng chủ đề của ngày 2026-11-02 và 2026-11-03 phía dưới khi mâu
thuẫn; người dùng đã duyệt từng board trước khi ghi.

- Preset Glass đổi sang cảnh ba lớp và bảng màu champagne / taupe / lavender /
  thép theo ảnh tham chiếu của người dùng; nhấn lavender-indigo `#5A5FA3`. Lý
  do: cyan trên cyan không có gì để kính khúc xạ, bốn lớp bo góc lồng nhau.
- Mặt đọc là một pane duy nhất; thẻ bên trong phẳng, viền hairline, không
  lồng pane bo góc. Kính chỉ ở điều hướng, điều khiển và lớp nổi.
- Hộp thoại chặn (cập nhật, ghi phím tắt, xoá khoá, dọn lịch sử, xoá model, đo
  hiệu năng) ở giữa cửa sổ, bo 18, nền phủ 22 %; không dùng sheet treo mép
  trên. Lý do: sheet che hàng nút cửa sổ và breadcrumb của vỏ kính.
- Thư viện lịch sử: "Phiên đã lưu trữ" là nút bật tắt cạnh ô tìm, lọc tại chỗ;
  khung xem trước đổi Lưu trữ → Khôi phục, Xoá → Xoá vĩnh viễn (có xác nhận).
  Không có màn hình lưu trữ riêng.
- Cài đặt bỏ mục "Launcher & phím tắt"; mục Chung có hàng "Phím tắt toàn cục"
  dẫn sang trang ở sidebar. Lý do: hai nơi cùng nội dung là hai nguồn sự thật.
- So sánh mô hình: "So sánh" mở bước chọn model (checkbox theo nhóm, model đang
  dùng khoá làm cột đầu, tối đa 4) rồi chạy; bảng kết quả có "Đổi model"; lần
  sau nhớ bộ đã chọn. Lý do: bản cũ bắt người dùng lọc bằng ô tìm.
- Picker ngôn ngữ, Tuỳ chọn dịch, menu Nghe, Thiết lập phiên dịch và mọi picker
  trong Cài đặt là lớp nổi của shell, cùng listbox bo 14, hàng 34, ✓ ở mục chọn.
- Sidebar mở rộng giữ hàng "Phím tắt toàn cục · n" trong nhóm chân; rail dùng
  chấm trên icon. Lý do: chữ nói được "cái gì" và "bao nhiêu", chấm thì không.
- Tổng hợp của Phiên dịch vẫn là thẻ có tab ở đầu cột bản ghi (không phải cửa sổ
  nổi); trạng thái đang tạo có skeleton và Huỷ. Phụ đề nổi nền tối 78 %, không
  có tuỳ chỉnh màu/cỡ.
- Cửa sổ nổi hẹp hơn 400 pt: meta và nút không chung một hàng.

## Quyết định thiết kế (2026-11-02)

- 2026-11-03: ảnh mẫu sidebar yêu cầu một pane kính chung, mục đang chọn là capsule kính nổi và rail là nút tròn; mục nghỉ để trong, hover nhẹ hơn selection. Thay nền phẳng của hàng điều hướng bằng vật liệu control thật trên macOS, giữ màu hiện tại và focus riêng. [Evidence](../migration/reports/native-migration-report-20261103-sidebar-lens.md).
- 2026-11-03: người dùng bác chất liệu nút còn phẳng và yêu cầu toàn bộ Viezan. Thay nền đục giả kính bằng native Liquid Glass cho control macOS; Qt dùng mặt bán trong, phản sáng và bóng cục bộ. Phạm vi gồm shared primary/secondary/quiet actions, menu và bộ lọc; giữ nền đọc ổn định và một vật liệu cho mỗi nhóm. [Evidence](../migration/reports/native-migration-report-20261103-glass-buttons.md).
- Bốn ảnh điều khiển Chat bổ sung capsule composer, nhóm model/thu âm và lớp kính thường trực cho hàng model đã chọn. Áp dụng quầng mép có hướng và phân nhóm thao tác, giữ nền cyan hiện tại, chữ đọc rõ và chức năng thật. Nền neon, hạt lấp lánh và tên model minh hoạ không đưa vào app. [Evidence](../migration/reports/native-migration-report-20261102-chat-glass.md).
- Ảnh dashboard cyan được chọn lại sau khi người dùng bác bản Finder phẳng: tách nền cyan, navigation, workspace và card thành bốn mức sáng; thêm gutter có bù đệm trong và gom nội dung Trang chủ thật thành panel. Quyết định này thay hướng sky/sage ở dòng dưới; không đổi route, kích thước native hay preset tối. [Evidence](../migration/reports/native-migration-report-20261102-cyan-glass.md).
- Ảnh Finder mới thay pane nổi tím của Glass sáng bằng cột kính sữa liền header, xanh trời pha xám sage, divider mảnh và accent periwinkle. Giữ nền đọc/nhập đục, khoảng hở logo/nút cửa sổ và pane nổi của Glass tối. [Evidence](../migration/reports/native-migration-report-20261102-milky-glass.md).
- Theo yêu cầu áp dụng trực tiếp, Glass sáng dùng vật liệu xanh–tím pastel, viền sáng nhẹ và bóng pane mềm hơn. Qt pha nền vùng đọc/nhập thành đục; macOS giữ vùng đọc Graphite. Kích thước desktop co giãn tự do, không khoá 16:9. [Evidence](../migration/reports/native-migration-report-20261102-pastel-glass.md).
- Sau khi tách pane khỏi hàng nút cửa sổ, thêm đệm trong 12 pt phía trên nội dung Glass để logo không chạm góc bo; giữ kích thước logo và trục icon ở mọi trạng thái điều hướng.
- Phản hồi ảnh chụp về viền Glass chạm nút cửa sổ: cả pane mở rộng, rail và overlay đều bắt đầu dưới hàng nút hệ thống; giữ nút đóng/thu nhỏ/phóng to và toggle đúng vị trí để viền kính không bao quanh chúng.
- Bộ ảnh Liquid Glass được áp dụng vào shell và thành phần chung: pane nổi, pill chọn trung tính với icon accent, tìm kiếm tròn ở rail, thẻ/nút bo mềm và viền sáng mảnh; giữ nền đọc đục để cân bằng chiều sâu với độ rõ. Qt dùng nền pha màu đục và cần nghiệm thu Windows/Linux riêng.

## Design decisions (2026-10-25)

- **Liquid Glass shell material (2026-11-02):** the user's reference and explicit pane request replace the continuous Glass sidebar with one floating pane (8 pt margins, now 26 pt corners after the reference-image refinement); following the window-control feedback, expanded navigation, rail and compact overlays all start below the header. Behind-window material plus `NSGlassEffectView` on macOS 26+ gives depth; macOS 15 retains material fallback. Remove the Glass full-height divider, keep 4 pt row-to-pane gaps and preserve icon/text axes, 236/68 pt widths and window-control geometry. Header buttons retain native controls over glass. Reading/composer/history stay opaque, accessibility uses solid fallback, and mode/preset/accent stay independent. Other presets are unchanged; optical edge gradients are allowed, decorative page gradients excluded. Windows/Linux visual and runtime parity remain unverified.
- **Stable macOS window-control alignment (2026-11-02):** only the sidebar's fixed top row aligns the traffic lights. Observe late AppKit button/titlebar geometry changes, including origin-only resets; coalesce updates and ignore self-generated notifications so the toggle stays aligned after native relayout and fullscreen exit. [Regression evidence](../migration/reports/native-migration-report-20261102-sidebar-refinement.md#sidebar-toggle-alignment-follow-up).
- **Separate sidebar storage from live activity (2026-11-02):** "History saved on this device" uses a neutral icon and a separate divider; its hint explains that AI processing depends on the selected model. A shorter brand row and quieter macOS selection border prioritize navigation without conflating local storage with local AI processing. [Evidence](../migration/reports/native-migration-report-20261102-sidebar-refinement.md).
- **Interpretation synthesis uses one tabbed card (2026-11-02):** four analyses appear in one card with tabs and per-type Copy/Regenerate actions, replacing four separate expandable groups. Interpretation history supports per-row deletion with Undo. [Evidence](../migration/native-implementation/native-code-57.md).
- **Native shell meets the specification (2026-11-02):** the sidebar includes Running in background and a Missing key badge on Settings; the ⌘K command palette supports calculations, Ask AI and `t `/`d ` prefixes; Chat answers show the model and token usage. [Evidence](../migration/native-implementation/native-code-56.md).
- **Native layout ratios are tokens (2026-11-02):** native-only ratios (Launcher position/height, Quick Translate cards, Applications column split, thermal scale) are defined as `--vzn-native-*` in `tokens.css` and generated into `native.json`; views contain no literals. Chat web/deep research shows phases, queries, sources and findings directly below the answer. [Evidence](../migration/native-implementation/native-code-55.md).
- **Native status roles (2026-11-02):** the generated palette includes `success` and `warning` from tokens; views no longer use system colors or `accentColor`. The last enabled workspace module cannot be disabled. Interpretation shows a "This session" column at sufficient width, following Review 18. [Evidence](../migration/native-implementation/native-code-54.md).
- **Native Translate and Chat (2026-11-02):** do not add the session strip beside Chat from Review 12/13 or Electron's Text/Image/Voice selector. Review 18 keeps the History popover and Add image in the header. Chat/Translate accept pasted or dropped images as well as the Add image button. The Translate footer shows character count (warning above 5,000), clear source and use result as source; swapping is disabled with automatic language detection. [Evidence](../migration/native-implementation/native-code-53.md).
- **Native updates and speech (2026-11-02):** background update checks run 60 seconds after launch, then daily, and only prompt through a sheet with "Remind me in 24 hours"; installation is never automatic. Speech selects the provider and actual voice directly from a list, with speed and Preview controls; it does not use Electron's Economy/Automatic/High quality modes. [Evidence](../migration/native-implementation/native-code-52.md).
- **Native completed-session refresh (2026-11-02):** use the same rules as Electron (Translate after 2 hours, Dictionary after 30 minutes, completed sessions with results only, never running sessions). Record departure time per feature, including app quit; a button reopens the previous session. Record shortcuts by pressing keys, not entering strings. Manage provider keys inline by row rather than in a separate form. [Evidence](../migration/native-implementation/native-code-51.md).
- **Shared native toasts (2026-11-02):** whole-action feedback (deletion with Undo, export/backup/login-item errors) uses `ToastCenter` at the bottom right; field errors remain below their fields; Copy buttons still change their label. Interpretation deletion and session archiving happen immediately with a 6-second Undo window; permanent archive deletion still asks for confirmation. [Evidence](../migration/native-implementation/native-code-50.md).
- **One native design direction (2026-11-02):** Quiet Workbench means Desktop Review 18 translated into `NativeKit`; Review 02 (macOS 27), Figma and Electron boards become references. Native appearance is defined in [`direction.md`](direction.md) and the Claude Design artifact; screen specifications define behavior. Reason: four parallel sources forced every UI iteration to choose its baseline again.

- **Native keyboard foundation (2026-10-27):** Return and keypad Enter use the same IME guard; editor Undo/Redo resets when switching sessions so another session's content cannot enter the current draft. [Evidence](../migration/native-implementation/foundation-11.md).

- **Native foundation (2026-10-27):** preserve the system focus ring for search; the send shortcut never becomes Stop while a task runs, preventing accidental cancellation. See [Foundation 09](../migration/native-implementation/foundation-09.md).

Previously marked "needs confirmation", now settled for consistency:

- **Navigation preserves Translate drafts.** The sidebar and command palette no longer clear source text/results, matching AI Chat's conversation retention. The source field's Clear button starts over. Only Home's Quick start actions (meaning "start new work", like creating a new AI Chat conversation) still clear the draft (`navigateEffect` in `catalog.ts`).
- **The in-app update dialog is web-only.** In Electron, the separate update popup (`UpdatePopupPage`) handles notifications. `UpdateNotification` staying closed when preload exposes `getNotificationPreferences` is intentional.
- **Toast Undo uses the shared toast button style** (`NotificationToast`), not a separate `xs neutral outline` style, so all actionable toasts look consistent.
- **The Dictionary "same languages" error remains a toast.** It belongs to the language pair rather than one field. Empty/too-long errors remain below their respective fields.
- **Quick Chat question label:** EN/JA use "Q"; VI uses "Hỏi" (a single "H" is not meaningful enough in Vietnamese).
- **Japanese spacing:** do not insert spaces between Latin text and kana/kanji, following the convention already prevalent in `ja.ts`.
- **The page-header language pair uses one pattern across Translate, Interpretation and Dictionary:** two separately framed language buttons with a separate middle control (⇄, → or a lock). Original designs used three patterns (Translate: three separate buttons; Interpretation, Dictionary and narrow Translate: one combined "A → B" button); the implementation used a continuous bar for the latter two pages. The shared header style lives in `.page-header .language-pair-bar` (`language-pair-bar.css`); the continuous bar remains the default for `LanguagePairBar` outside headers.
- **Text fields do not get an accent-colored border on focus.** Clicking a field only changes its border to `--vzn-border-strong`; the caret is the main indicator. `--vzn-focus-ring` is reserved for buttons and other controls during keyboard navigation.
- **Shortcut hints belong inside buttons.** Key chips (⌘N, ⌘K) stay inside the control they activate, never beside it as a separate, unclickable second button.
- **Text size is a token multiplier.** Previously, Text size changed the `html` font size, but all text sizes used fixed pixels, so no text changed (0/358 measurements across five pages); only `rem` dimensions grew. All `--vzn-font-size-*` values now multiply `--vzn-text-scale`, `rem` stays fixed at 15 px, and 69 hardcoded CSS text sizes were converted to tokens.
- **Typography follows the design.** Use the system font (`--vzn-font-sans`; Inter in the designs was only for mockups). Primary navigation and Settings navigation use `--vzn-font-size-lg` (14), as specified in `foundations.md` §4, instead of 13. `body`, Tailwind's `font-mono` and monospace text in `chat.css` read `--vzn-font-sans` / `--vzn-font-mono` tokens instead of handwritten font lists.
- **Settings type hierarchy.** Section titles (`.settings-section-title`) use `--vzn-font-size-title` (16); previously they matched the page title (18), flattening the hierarchy. Settings navigation is regular, with only the selected item semibold, matching primary navigation; previously every item was semibold and heavier than primary navigation. Setting-row labels use `--vzn-line-normal` rather than `--vzn-line-tight` to accommodate stacked Vietnamese diacritics (ữ, ộ, ể). "Viezan" uses `--vzn-weight-semibold` instead of a hardcoded 650.
- **Consistent Vietnamese tone-mark placement: "hoà, khoá, xoá, huỷ, tuỳ, thuỷ".** In open oa/oe/uy syllables, place the mark on the main vowel, as most design documents already did. `vi.ts` mixed both conventions (34 instances of this form, 43 of "xóa, hủy, tùy"); it is now consistent. Syllables ending in a consonant ("hoàn", "toán") and those containing "qu" ("quý") remain unchanged because both conventions agree. The label "Phiên Âm" was corrected to sentence case, "Phiên âm".
- **Floating surfaces use readable glass; task options use a submenu beside the popover (2026-10-26).** In Glass, popovers and menus previously used `--vzn-surface-raised` at 72% without blur, leaving underlying page text legible. All floating surfaces now share one material (`floating-material.css`): Glass preserves translucency inspired by Liquid Glass (76% light / 80% dark, the lowest levels at which `--vzn-text-muted` still reaches 4.5:1 on the page background), with 40 px blur and increased saturation so underlying text becomes color patches. Reduced transparency or increased contrast makes these surfaces opaque. A fully opaque attempt (88/90%) lost the glass character. The Tasks popover no longer has a selector at the bottom that opened over the list and stacked three text layers. Options now open beside their task row, beyond the popover edge, like a submenu, keeping the popover six rows tall. Inline chips were tried, but 19 languages made the popover tall and caused task-dependent jumps. Available space is measured within `.app-workspace` so the popover does not overlap the header.
- **Fan control survives app exits (2026-10-26).** The release installs the fan helper once as a launchd daemon. Quitting still restores automatic fan control, but the next launch (including after an update) reconnects and reapplies the saved profile or Custom settings without a password prompt. Only "Disable fan control" stops automatic restoration. Reason: the 2026-10-26 incident, when the 2.4.1 update installed at midnight and fan control was lost.

## Session decisions (2026-10-26)

- V1 restores Chat threads and text drafts; Translate/Dictionary use a separate recovery store for the open session. Refresh only completed, successfully saved work when returning after 2 hours/30 minutes, balancing continuity with readiness for new work. Reading time does not count; never clear drafts or call AI automatically on reopen. Provide a button to reopen the previous session and a toggle to disable refresh.
- Retain existing history limits and notify users when reached; remove the fallback that shrinks/deletes history when localStorage is full. Migrating all history to a new store and adding a Dictionary cache TTL belong to a later phase.

V1 verification in the 2026-10-26 checkout:

- Full suite on the PR branch merged with `develop` 2.4.2: 2,754 tests passed, 5 skipped under the existing configuration; renderer/main TypeScript checks and build passed.
- Browser session tests used real IndexedDB and fake data: text/image drafts, multi-model results, selected Chat, refresh on return, reopening the previous session without AI calls, and explicit translation continuation passed. Web smoke and 168 clipping checks across EN/VI/JA, light/dark and wide/narrow passed; recovery-notification screenshots were reviewed.
- Atomic, Design, Biome on changed files, agent registry, docs checks and 13 docs tests passed. IPC accepts save acknowledgments only from the main window; the renderer gains no Node/filesystem/network privileges. Event listeners clean up, and waiting for save on quit is bounded to 1.5 seconds.
- Real desktop sleep/lock/quit interactions were not run; those branches have unit tests. No packaging or installed-app update was performed. Forced termination can still lose uncheckpointed work; unsent Chat images do not recover after restart.

Applied capabilities: workflows `ship-viezan-feature`, `audit-local-first-security`, `audit-i18n-coverage`, `audit-live-perf`, `sync-docs`; skills `viezan-feature-planner`, `viezan-ipc-security-audit`, `viezan-i18n-audit`, `viezan-live-perf-audit`, `viezan-doc-sync`; rules `viezan-product-engineering`, `generate-code`. Provider/extension gates did not apply because provider protocols and the browser extension were unchanged.

## Applications (2026-10-26)

- The first version uninstalls/resets individual apps within user permissions. Post-uninstall status states the scan scope explicitly and never claims the whole machine is clean. Group Containers, ByHost and managed items are preserved. All mutations use fileActions with a pre-operation journal, Trash/backup and checks before Undo.

- Applications (2026-10-26): select only bundle/cache/log/saved state by default; persistent data requires explicit selection. Name/vendor/prefix matches, Containers, launch agents and incomplete scans are insufficient evidence for deletion. An error stops the entire sequence; results containing retained items/errors must not be presented as a clean uninstall.

- 2026-10-27 native: prioritize Review 18 UI/UX parity based on user feedback;
  test results do not replace visual acceptance. Qt uses a Graphite palette
  generated one-way from tokens.css; Swift keeps system materials; toolbars have
  labels when space permits.

- 2026-10-27 Swift foundation: the sidebar is one continuous system-material column,
  not a glass card; History/Command Palette/Activity use opaque reading surfaces.
  Preserve Reduce Transparency fallback and native focus in rounded toolbars.

- Native Windows selection replacement: use UI Automation with content/selection snapshots and verified Undo; do not overwrite subsequent user edits, and preserve copy for unsupported controls (source implemented, runtime not yet tested).

- 2026-11-02 macOS Debug: use Development and ⌘⇧R to build incrementally and
  relaunch through normal Quit. A fixed cache and one previous build shorten the
  edit/test loop while retaining the running app on compilation errors. Release
  has no development menu.
