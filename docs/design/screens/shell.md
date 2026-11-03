# Application shell and global surfaces

## Shared Glass components (2026-11-03)

Search fields follow a capsule silhouette at their actual control height. Their
opaque inset center supports native editing; focus strengthens the neutral edge
and shows the caret, following `foundations.md`. It does not add an accent ring
around a text field. The command, history, model and Settings searches retain
their existing keyboard, clear, filtering and IME behavior.

Filters use one quiet inset group, clear idle segments and a raised selected
lens with semibold text. Selection and keyboard focus remain separate. Settings
destinations and the command palette's active result reuse the sidebar lens;
the command search still owns arrow-key navigation and composition. History, Activity, Commands and anchored
composer panels share a rounded reading surface, directional perimeter and
local shadow. Qt dialogs use that same surface. Text-bearing centers remain
opaque; Reduce Transparency / Increase Contrast remove decorative depth.
Native system menus and switches retain platform behavior. This pass changes
neither palette nor theme/route/session preferences.

## Sidebar selection lens (2026-11-03)

The capsule navigation and translucent sidebar references define material and
geometry only; the current palette is unchanged. Keep one shared frosted pane,
transparent idle destinations, a persistent raised lens for the selected route,
and a separate Search lens. All Glass row lenses are full capsules; the compact
rail centers round targets on the same icon axis without changing row height.
Hover reveals a weaker lens and press adds feedback without moving the label.
Selection keeps its semibold label, accent glyph and accessible selected state.
Keyboard focus has its own outline, including on an unselected destination.

macOS replaces the painted selection fill with the shared native control
material; Qt uses its existing translucent face and directional edge effect.
Reduce Transparency and Increase Contrast keep opaque, outlined controls.
The static storage footer remains text; interactive background-service rows
receive transient hover/press feedback. No wallpaper, palette, navigation
preference or route/session behavior changes are part of this refinement.

## Native sidebar refinement (2026-11-02)

Keep the 236 pt column and existing navigation-row heights. The brand row uses
`compactControl` as its minimum height and grows to fit the overlay close button.
macOS removes the extra spacer between Search and Home. Selection retains its
background and semibold text; native keyboard focus remains separate. The newer
reference-image pass below defines the Glass selection surface and edge.

The fixed top row owns macOS traffic-light alignment. It tracks late native
button/titlebar geometry changes as well as resize and activation, so the
sidebar toggle and standard window buttons stay vertically centered together.
Fullscreen keeps AppKit ownership; alignment resumes on exit.

The static "History saved on this device" footer has a neutral storage/device
icon and its own divider, separate from live background-service rows. The label
wraps when needed. Its tooltip and accessibility description explain that AI
processing runs on the device or in the cloud depending on the model. The rail
hides the footer. Qt uses the same storage wording and distinction; this change
does not add macOS background-service rows to Qt. Layout tables below describe
the historical Electron shell; native geometry follows this section and
`direction.md`.

## Native Glass material (2026-11-02)

The selected cyan dashboard supersedes the earlier continuous sky/sage
Finder treatment in **light Glass**. Four distinct shared roles create depth:
`app-bg` blue scene, `sidebar-bg` navigation, `canvas` ice workspace and
`surface` brighter milky cards. A broad low-contrast blue scene gradient is
allowed; card edges and shadows remain quiet. Text/reading/composer surfaces
are opaque, and no duplicate icon rail or invented dashboard data is added.

Both Glass modes keep the navigation pane below the native 48 pt control row
plus 8 pt, with 8 pt side/bottom gutters and 26 pt corners. The 28 pt logo retains
12 pt inner top clearance. Light macOS uses a passive tinted visual-effect
surface; dark macOS 26+ retains its existing glass material. The background
cannot take pointer input or become an accessibility element.

Light Glass adds one stable rounded workspace below the existing header,
with 16 pt horizontal gutters (12 pt compact), 8 pt top and 12 pt bottom.
WorkspacePage subtracts the outer gutter from its original 44 pt inner inset.
The route view and its state are not duplicated when switching appearance.
Home groups real quick actions, running work, recents and model status into
cards; Settings receives the same hierarchy through shared card components.

Header actions remain native controls with accessible names, disabled states,
keyboard focus and equal hit targets. Reduce Transparency/Increase Contrast
use solid chrome and clear edges. Mode, preset and optional accent remain
independent. Dark and non-Glass palettes/layouts remain unchanged.

Qt implements the same cyan hierarchy with opaque color composition; it does
not simulate or claim desktop backdrop blur. Windows/Linux runtime acceptance
is separate from local Qt builds and isolated fixtures.

The native default window remains 1044 × 760 with a 640 × 480 minimum, free
resizing and the existing 900 pt navigation breakpoint; no aspect ratio is fixed.

## Reference-image refinement (2026-11-02)

The supplied capsule navigation, Finder and glass-card references refine the
existing Glass preset. Selection uses a neutral raised lens, semibold text and
an accent glyph; hover and keyboard focus remain distinct. Search always exposes
its magnifier and accessible command name. Expanded search is a capsule; the rail
uses a separate round target without changing navigation row sizes or saved state.

Shared content cards remain opaque with 18 pt corners and a fine illuminated edge;
Shared SwiftUI buttons and Qt toolbar controls use 16 pt corners; other Qt controls
retain their toolkit presentation. SwiftUI filter tabs sit on one quiet inset group.
Other presets retain their current shapes. No new route, KPI widget or background
image is introduced. High-contrast/reduced-transparency presentation uses solid
surfaces and clear borders instead of decorative edge lighting.

## macOS development tools (Debug)

Builds created with `npm run dev` include **Development → Rebuild and relaunch**,
with the **⌘⇧R** shortcut. During a build, the item changes to **Rebuilding…** and
is disabled; the app remains usable. Build errors show a message and an action to
open the log while retaining the running build. Only after the new build has been
compiled, signed and verified does the app save the workspace, quit normally and
relaunch. Do not reload during active IME composition or a performance benchmark.
Active tasks are interrupted through normal Quit; drafts, history and the last
page recover through the existing workspace. Release has no development menu;
Debug builds created outside the dev runner do not enable reload.

> Original designs: `boards/Main.dc.html`, `boards/Sidebar.dc.html`, `boards/Narrow.dc.html`, `boards/CommandPalette.dc.html`, `boards/Toasts.dc.html`, `boards/UpdatePopup.dc.html`, `boards/Welcome.dc.html`, `boards/WelcomeSteps.dc.html`, `boards/SmallSurfaces.dc.html`, `boards/Launcher.dc.html` · Detailed board: `specs/shell.html` · Source: `src/App.tsx`, `src/components/templates/AppShell.tsx`, `src/components/templates/PageHeader.tsx`, `src/components/organisms/PrimaryNavigationSidebar.tsx`, `src/components/organisms/CommandPalette.tsx`, `src/components/organisms/NotificationViewport.tsx`, `src/components/organisms/UpdateNotification.tsx`, `src/pages/UpdatePopupPage.tsx`, `electron/updateNotification.ts`, `electron/trayManager.ts`

Shared rules (tokens, Button, surface hierarchy, z-index, responsive behavior and shared states) live in [`foundations.md`](../foundations.md). This document covers only the window shell and surfaces shared across pages.

## 1. Purpose

The application shell surrounds every page: a draggable title bar, primary navigation, page header, ⌘K command palette, notification toast stack, update notifications (a separate popup managed by the main process), and surfaces outside the window (the Windows/Linux system tray and the Thermal module's macOS menu-bar item). Users interact with the shell when switching pages, finding commands, checking action results or learning about updates. Success means users always know their current page, can reach any page with one click or a ⌘K query, can see background activity, and receive action feedback in one consistent place (bottom right) without covering the Chat composer.

## 2. Entry and exit points

| From | Entry | Notes |
| --- | --- | --- |
| App launch | Main window at 1200 × 700 (minimum 640 × 480, `electron/mainWindowGeometry.ts`) | Restore saved `activePage`; if its module is disabled, open Home (`resolveActivePage`, `src/App.tsx`). |
| Navigation | Click a page item | `setActivePage`; the destination retains its state (Translate keeps its draft). |
| Command palette | `⌘K` (macOS) / `Ctrl K` (Windows, Linux), or the sidebar Search button | The shortcut toggles the palette; opening it first closes any navigation overlay (`src/App.tsx:128-151`). |
| Running in background | Click a row | Fans → Temperature & fans; Global shortcuts → Launcher & shortcuts; Chrome extension → Translate Everywhere. |
| Update popup | Separate window opened by main when a background check finds an update | Does not take focus (`showInactive`). |
| System tray (Windows, Linux) | Click/double-click the icon, or select Open Viezan | Closing the window with X / Alt+F4 only hides it; the app keeps running (`electron/trayManager.ts`). |
| macOS menu bar | Temperature reading menu › Open Viezan | Available only when menu-bar readings are enabled in Thermal. |
| Launcher, Quick Chat | Open in Chat, Open Settings, or open a feature | Main sends an event; `App.tsx` navigates and seeds content (Chat, Translate, Dictionary). |

Exit points: select a page (the shell stays; only `app-main` changes), close the window (macOS: the app remains in the Dock; Windows/Linux: it goes to the tray), or select Quit Viezan from the tray.

## 3. Layout

At 1200 × 760, with expanded navigation and no contextual sidebar:

```
┌ .app-titlebar-drag 40 px ── [● ● ●] 80 px ┬ .app-header-navigation 60 px [▣] ┬── window drag region ──┐
├ .app-titlebar-divider (1 px, --vzn-divider) ────────────────────────────────────────────────────────┤
├ nav.primary-navigation-sidebar 236 px ┬ main.app-main ─────────────────────────────────────────────┤
│ .sidebar-brand-row  [V] Viezan        │ header.page-header ≥ 56 px                                 │
│ [Search                       ⌘K]    │ Title 18 · description 12       [status] [primary action]   │
│ ───── .app-sidebar-divider ────────── ├────────────────────────────────────────────────────────────┤
│ .sidebar-nav-scroll (scrollable)     │ Page content on the --vzn-bg canvas                         │
│   Home                              │ (--vzn-surface cards, 24 px padding)                        │
│   AI        · AI Chat                │                                                            │
│   LANGUAGE  · Translate · Interpret  │                                                            │
│             · Dictionary            │                                                            │
│             · Translate Everywhere  │                                                            │
│   SYSTEM    · Temperature & fans    │                                                            │
│   TOOLS     · Launcher & shortcuts  │                                                            │
│ .sidebar-bottom-group (pinned)      │                                                            │
│   ● Fans · Balanced                 │                                               ┌ toast ───┐ │
│   ● Global shortcuts            2   │                                               │ ≤ 400 px │ │
│   ───────                           │                                               └──────────┘ │
│   Settings        • Missing key     │                                  16 px from right/bottom   │
└─────────────────────────────────────┴────────────────────────────────────────────────────────────┘
```

AI Chat inserts its history sidebar (a separate organism, `AIChatSidebar`) between primary navigation and the page column. The page header then spans only the feature column (`.app-feature-workspace` › `.app-feature-body`, `AppShell.tsx:66-75`).

| Region | Component | Dimensions / tokens | Scrolling |
| --- | --- | --- | --- |
| Title bar | `AppShell` (`.app-titlebar-drag`) | Height `--vzn-titlebar-height` (40); background `--vzn-titlebar-bg` (Glass/system on macOS: `--vzn-titlebar-material`); macOS reserves `--vzn-titlebar-mac-controls-width` (80) for traffic lights at (16, 14) | None; the whole strip is draggable, with `titlebar-no-drag` on buttons |
| Collapse-button slot | `.app-header-navigation` (portal host) | Width `--vzn-sidebar-width` (60), centered `sm` 32 button | None |
| Primary navigation | `PrimaryNavigationSidebar` (`nav.primary-navigation-sidebar` › `.primary-navigation-panel`) | Expanded `--vzn-sidebar-expanded-width` (236; 208 below 900 px), rail `--vzn-sidebar-width` (60); background `--vzn-sidebar-bg`, right border `--vzn-chrome-divider`; text uses `--vzn-chrome-*` | Only `.sidebar-nav-scroll` scrolls (`overscroll-behavior: contain`) |
| Brand row | `.sidebar-brand-row` | Minimum height 40; `AppLogoIcon size="sm"`; "Viezan" text only when expanded | None |
| Search button | `.sidebar-search-trigger` | Button `sm` 32, `.sidebar-shortcut` key chip | None |
| Page groups | `.sidebar-space` (one `section` per group) | Group label `--vzn-font-size-caption`, uppercase, `--vzn-tracking-caps`; rail hides labels and uses `--vzn-divider` separators | Inside scroll region |
| Background activity | `.sidebar-background` | Button `xs` 28 rows, `StatusDot tone="ok"`, `--vzn-font-size-sm` text, `--vzn-font-size-caption` counts | None (pinned bottom) |
| Settings | Last item in `.sidebar-bottom-group` | Button `sm` 32; `.sidebar-nav-badge` uses `--vzn-space-1-5` | None (pinned bottom) |
| Page header | `PageHeader` (`header.page-header`) | Minimum height `--vzn-page-header-min-height` (40 + 2 × 8 = 56); horizontal padding `--vzn-space-6` (16 below `app-main` 560); background `--vzn-surface`, bottom border `--vzn-border`; title `--vzn-font-size-title-lg`, `--vzn-font-display`; description `--vzn-font-size-sm`, `--vzn-text-soft` | None |
| Page column | `main.app-main` | `app-main` container (all page container queries use this width) | Defined by the page |
| Command palette | `CommandPalette` (`.cmd-palette-panel`) | Maximum width 560, maximum height 480; background `--vzn-overlay-material`, shadow `--vzn-shadow-overlay`, radius `--vzn-radius-lg`; `--vzn-scrim` begins below the title bar | `.cmd-palette-list` scrolls |
| Toast stack | `NotificationViewport` (`.notification-viewport--app`) | Fixed bottom right, offset `--vzn-space-4`; width `min(--vzn-notification-max-inline (400), 100% − 32)`; layer `--vzn-layer-notification` | None |
| Update popup | `UpdatePopupPage` in a separate `BrowserWindow` | 440 × 320 DIP, frameless, nonresizable; padding `--vzn-space-6`; title `--vzn-font-size-heading` | None |
| In-app update dialog (fallback) | `UpdateNotification` (`.update-notification`) | Maximum width `--vzn-update-dialog-max-inline` (560), maximum height `--vzn-modal-viewport-block`; padding `--vzn-space-6` | Body scrolls when height is limited |

Stacking order (low → high): contextual overlay 60 → navigation backdrop 65 → navigation overlay 70 → dialog/command palette 80 → picker 90 → toast 100 (`--vzn-layer-*`, `resources/tokens.css:269-276`). Every dialog scrim starts below the title bar (`.app-shell[data-titlebar="app"] .modal-backdrop`) because OS-drawn window controls cannot be dimmed.

## 4. Components and actions

### 4.1 Title bar and primary navigation

| # | Control | Type (Button size · variant · appearance) | Trigger | Result | Feedback | Disabled/hidden conditions |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Collapse/expand sidebar (`.primary-navigation-toggle`) | `sm` · `neutral` · `ghost`, square, `SidebarPanelIcon` | Click; Enter/Space when focused | ≥ 900 px: toggle saved `sidebarCollapsed`. < 900 px: toggle a temporary overlay without changing the saved preference, and close Chat history | Sidebar resizes (`width` transition, 180 ms); icon direction, `aria-expanded` and Collapse/Expand label update | Never disabled |
| 2 | Logo + "Viezan" | Noninteractive | — | — | `title="Viezan"` | — |
| 3 | Search (accessible name and `title`: Search or run a command) + `⌘K` / `Ctrl K` chip | `sm` · `neutral` · `outline`, rectangular; icon-only in rail | Click; `⌘K`/`Ctrl K` anywhere in the window | Close navigation overlay and open command palette (`viezan:open-command-palette`) | Palette appears; search receives focus | Never disabled |
| 4 | Page item (Home, AI Chat, Translate, Interpretation, Dictionary, Translate Everywhere, Temperature & fans, Launcher & shortcuts) | `sm` · active item `primary` · `soft` (`--vzn-shadow-xs`, semibold); others `neutral` · `ghost` | Click | Navigate; Translate still clears the existing translation; close any open overlay | Active item uses `--vzn-chrome-item-active` and `aria-current="page"`; `app-main` shows a Loading {page}… skeleton while the chunk loads | Disabled modules are not rendered, rather than grayed out |
| 5 | Running in background: Fans · {profile} / Fans · custom | `xs` · `neutral` · `ghost`, green dot | Click | Open Temperature & fans | Page changes | Only when the fan helper is `ready` and Thermal is enabled |
| 6 | Global shortcuts + count | As #5 | Click | Open Launcher & shortcuts | Page changes | Only when at least one shortcut (Quick Translate or Launcher) is enabled |
| 7 | Chrome extension + ready | As #5 | Click | Open Translate Everywhere | Page changes | Only when browser-bridge is enabled and at least one extension token exists |
| 8 | Background summary in rail | `StatusDot` (not a button) | Hover | Tooltip lists the rows | `aria-label`: Running in background: {count} items | Hidden when no rows exist |
| 9 | Settings | `sm` · as #4; dot + Missing key badge when the selected provider requires a missing key (`selectedProviderMissingKey`; never flags local AI) | Click | Open Settings | As #4; accessible label becomes Settings: Missing key when badged | Always visible and pinned bottom |
| 10 | Overlay backdrop (`.primary-navigation-backdrop`) | Transparent, not a button | Click outside overlay | Close overlay | Overlay disappears | Present only while overlay is open |

### 4.2 Command palette ⌘K

| # | Control | Type | Trigger | Result | Feedback | Disabled/hidden conditions |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | Search (`Input size="lg"`, `role="combobox"`) | Input `lg` | Type | Filter commands without diacritics (Vietnamese "đ" = "d"); recognize `?`, `??`, `t `, `d ` prefixes; return from answer mode to the list | List updates; first item highlighted | — |
| 12 | Close (X) | `lg` · `neutral` · `ghost`, square, accessible label Close | Click; `Esc`; backdrop click; `⌘K` again | Close palette and restore previous focus | Palette disappears | — |
| 13 | Page-command row | `lg` · highlighted `primary` · `soft`, otherwise `neutral` · `ghost`; `role="option"` | Click; `↑`/`↓` then `Enter`; hover to highlight | Navigate and close palette | Page changes | Disabled modules are omitted |
| 14 | Calculator row "= {result}" | As #13, tabular numerals | `Enter` / click | Copy result to clipboard and close | Palette closes, without a toast | Only for valid arithmetic expressions |
| 15 | Ask AI — Quick answer for “{query}” | As #13 | `Enter` / click; `?` prefix | Enter answer mode and send to the selected model | Question at top, Thinking… spinner, then streaming Markdown | Present for nonempty text; missing keys still enter answer mode but show an error (see §5) |
| 16 | Ask AI and search the web — Verify “{query}” with web sources | As #13 | `Enter` / click; `??` prefix | As #15, with web search | Searching the web… spinner | Only when a web-search API is configured (`hasWebSearchApi`) |
| 17 | Translate — Translate “{text}” | As #13 | `t ` + text, `Enter` | Open Translate with that source text, clearing the old translation | Translate opens | — |
| 18 | Dictionary — Look up “{text}” | As #13 | `d ` + word, `Enter` | Open Dictionary and look up the word | Dictionary opens | — |
| 19 | Copy (answer mode) | `sm` · `neutral` · `ghost`, icon | Click | Copy the answer | Label becomes Copied! for 1.2 seconds | `disabled` until text exists |
| 20 | Open in Chat ⌘↵ | `sm` · `neutral` · `ghost`, `⌘` `↵` chips | Click; `⌘/Ctrl + Enter` | Create a conversation containing the question and answer, then open AI Chat | AI Chat opens with two messages | `disabled` until the answer is complete (`status === 'done'`) |
| 21 | Open Settings (missing-key error box) | `sm` · `neutral` · `outline` | Click | Close palette and open Settings | Settings opens | — |

### 4.3 Toasts

| # | Control | Type | Trigger | Result | Feedback | Disabled/hidden conditions |
| --- | --- | --- | --- | --- | --- | --- |
| 22 | First toast action (e.g. Retry, Open Settings) | `sm` · `primary` · `outline`, pill | Click | Defined by the `notify` caller | Usually a new toast replaces the previous one with the same `key` | `disabled` if the caller passes `disabled: true` |
| 23 | Second and subsequent actions | `sm` · `neutral` · `ghost`, pill | Click | As above | As above | As above |
| 24 | Dismiss toast | `sm` · `neutral` · `ghost`, square, accessible label Close | Click | Remove toast and invoke its `onDismiss` | Toast disappears; an older open toast becomes visible if present | Not rendered for `dismissible: false` |
| 25 | Entire toast stack | `section` region with accessible label Notifications | Hover/focus within | Pause all timers; leaving resumes remaining time | Toasts remain visible | — |

### 4.4 Updates

| # | Control | Type | Trigger | Result | Feedback | Disabled/hidden conditions |
| --- | --- | --- | --- | --- | --- | --- |
| 26 | Popup › Minimize | `md` · `neutral` · `ghost`, square | Click | Minimize popup to Dock/taskbar | Window minimizes | — |
| 27 | Popup › Close (X), or OS window-close shortcut | `md` · `neutral` · `ghost`, square, accessible label/tooltip Close and remind me in 24 hours | Click | Same as Remind me in 24 hours: snooze this version and hide | Popup hides | — |
| 28 | Popup › Remind me in 24 hours | `md` · `neutral` · `outline` | Click | Save snooze in `update-notifications.json`, hide popup | If saving fails, popup remains with an error | — |
| 29 | Popup › Download update / Install & restart | `md` · `primary` · `solid` | Click | `available` → download; `downloaded` → install and restart | Downloading… {percent}% (`role="status"`); title becomes Ready to install on completion | `disabled` while busy/downloading |
| 30 | In-app dialog › View changes | `md` · `neutral` · `ghost` | Click | Open the GitHub release page for `v{version}` in a browser | — | `disabled` while an operation runs |
| 31 | In-app dialog › Later | `md` · `neutral` · `outline` (initial focus) | Click; `Esc` | Snooze this version for 24 hours (`localStorage`) | Dialog closes and focus returns | — |
| 32 | In-app dialog › Download update / Install & restart | `md` · `primary` · `solid` | Click | As #29 | Progress line; errors use an error toast with key `update-notification-action` | `disabled` while busy/downloading |

### 4.5 Tray and menu bar (native OS menus)

| # | Item | Platform | Result |
| --- | --- | --- | --- |
| 33 | Click/double-click tray icon | Windows, Linux | Show main window |
| 34 | Open Viezan | Windows, Linux (tray); macOS (reading menu) | Show main window |
| 35 | Quit Viezan | Windows, Linux | Quit the app (window X only hides it to the tray) |
| 36 | Hide temperature from menu bar | macOS | Disable menu-bar readings by removing the status item |

Tray labels follow the **OS language** (`app.getLocale()`), not the selected app language (`electron/trayManager.ts:16-32`). On Windows/Linux, temperature readings appear in the tray icon tooltip (`electron/thermal/tray.ts`).

## 5. States

### Primary navigation

| State | Condition | Display | Available actions |
| --- | --- | --- | --- |
| Expanded | Window ≥ 900 px and `sidebarCollapsed = false` | 236 px column, labels, uppercase group headings, ⌘K chip, full background strip | #1–#9 |
| Rail | Window ≥ 900 px and `sidebarCollapsed = true`, or window < 900 px by default | 60 px icon-only column with centered 40 px buttons; group separators; background activity reduced to a tooltip dot; Settings badge becomes a dot | As above; page names via `title`/`aria-label` |
| Temporary overlay | Window < 900 px, expand clicked | 236 px panel (208 px below 900 px) portaled to `body`, anchored to and as tall as the rail, `--vzn-shadow-lg`, transparent backdrop | Select page (auto-closes), `Esc`, outside click, `⌘K`; resizing to ≥ 900 px also closes it |
| Short window | Insufficient height for all items | Only `.sidebar-nav-scroll` scrolls; background activity and Settings remain visible at bottom | Mouse-wheel/trackpad scrolling |
| No background activity | All three sources inactive | No strip; only divider and Settings | — |
| Missing key | Selected provider requires a key absent from Keychain (`keyStatus`) | Dot + Missing key badge beside Settings | Open Settings |
| Module disabled | User disables it in Settings › Modules | Its item disappears; empty groups disappear; if active, navigate Home | — |
| Page loading | Page chunk loading (`Suspense`) | `FeatureLoadingState` follows the page's `loadingLayout` (`list`/`split`), labeled Loading {page}…; AI Chat and Translate use `blank` | Navigation remains available |

### Command palette

| State | Condition | Display | Available actions |
| --- | --- | --- | --- |
| Empty (just opened) | Search empty | All pages in sidebar order, first highlighted; footer ↑↓ Navigate · ↵ Open · esc Close | #11–#13 |
| Results | Nonempty text | [Calculator] + matching commands + Ask AI (+ Ask AI and search the web) | #13–#16 |
| No matching commands | No command match and not arithmetic | No matching commands (`role="status"`), with Ask AI rows still below | #15, #16 |
| Prefix | `?`, `??`, `t `, `d ` | Only the matching action row | #15–#18 |
| Answering | After #15/#16 | Question, Thinking… / Searching the web… spinner, `aria-busy` | `Esc` to return |
| Answer available | Streaming or complete | Markdown, AI may make mistakes… notice, Copy, Open in Chat; footer esc Back | #19, #20 |
| Error | Model returns an error | `ui-error-box` with `role="alert"` and message; preserve any partial answer with the error below | `Esc`, copy partial answer |
| Missing key | Selected provider is not `local` and has no key | No API key. Add one in Settings. + Open Settings | #21 |
| Too long | Question exceeds `MAX_CHAT_INPUT_CHARS` | Content is too long. Shorten it before sending. (no request sent) | `Esc`, edit text |
| Module disabled | — | Module commands omitted | — |

### Toasts

| Tone | Icon / color | `role` / `aria-live` | Auto-dismiss |
| --- | --- | --- | --- |
| `info` | Circled i, `--vzn-action-text`, `--vzn-action-border` | `status` / `polite` | 4 seconds; 8 with actions |
| `success` | Checkmark, `--vzn-success`, `--vzn-success-border` | `status` / `polite` | 4 seconds; 8 with actions |
| `warning` | Triangle, `--vzn-warning`, `--vzn-warning-border` | `status` / `polite` | None; user dismisses |
| `error` | Triangle, `--vzn-danger`, `--vzn-danger-border` | `alert` / `assertive` | None; user dismisses |

Callers may override `durationMs`. At most three toasts are visible (newest at bottom); identical `key` values replace rather than stack (`src/store/useNotificationStore.ts`). If the Chat composer is in the same column and would be covered, the stack lifts above its top edge (`data-lifted`).

### Update popup

| State | Condition | Display | Available actions |
| --- | --- | --- | --- |
| Update available | Background check finds `available`, notifications enabled, not snoozed | Update available · Version {version} · description | #26–#29 |
| Downloading | `downloading` | Adds Downloading… {percent}%; primary button disabled | #26–#28 |
| Ready | `downloaded` | Ready to install · restart description · Install & restart | #26–#29 |
| Error | Download/install fails, or snooze cannot be saved | `role="alert"`: Action failed. Try again or check Updates in Settings. | Retry #29, or #28 |
| Hidden | Snoozed, disabled in Settings › Updates, or a manual Settings check takes over | No window | — |

## 6. Main interaction flows

**A. Collapse and expand navigation (window ≥ 900 px)**

1. Window at 1200 px, sidebar at 236 px. The ▣ button is in the title bar immediately after traffic lights, with `aria-expanded="true"`.
2. Click ▣ → `toggleSidebar()` saves `sidebarCollapsed = true`; the column shrinks to 60 px over 180 ms; labels, group headings and ⌘K chip hide; background activity becomes a dot.
3. Switch to AI Chat → navigation remains a rail; Chat history retains its own independent state.
4. Click ▣ again → expand to 236 px.

**B. Narrow window (< 900 px): temporary overlay**

1. Resize to 820 px → navigation becomes a 60 px rail; saved `sidebarCollapsed` is **not** overwritten (`data-user-collapsed` retains the old value).
2. Click ▣ → measure the rail position, close Chat history if open, portal the 208 px panel to `body`, overlay content with a large shadow; leave the rail slot empty underneath.
3. Click Dictionary → navigate and close the overlay. Alternatively, `Esc` closes and returns focus to ▣; outside click also closes.
4. Resize back to ≥ 900 px → close the overlay and restore the saved sidebar state.

**C. Find and run commands**

1. Press `⌘K` on any page → close any navigation overlay; scrim begins below the title bar; the 560 px palette appears about 12% from the top; search receives focus; Home is highlighted.
2. In Vietnamese, type "tu dien" → match "Từ điển" (Dictionary) without diacritics; Ask AI appears at the bottom.
3. `↓` highlights the next row, wrapping at the end; `Enter` opens Dictionary, closes the palette and restores previous focus.

**D. Quick calculation**

1. Type `1250*1.9885` → the first row is "= 2.485,625" (formatted for the app locale in this example), with description "1250*1.9885 · Copy result".
2. `Enter` copies to the clipboard and closes the palette.

**E. Ask AI inside the command palette**

1. Type `? which local model translates well` → only Ask AI remains.
2. `Enter` replaces the list with the answer region: bold question above, Thinking… spinner.
3. The answer streams with `aria-live="polite"`. When complete, Open in Chat ⌘↵ becomes enabled.
4. `⌘↵` creates a conversation using the selected provider/model, adds the question and answer, and opens AI Chat.
5. Alternatively, `Esc` cancels the request and returns to the list with the original text; a second `Esc` closes it.

**F. Toasts**

1. A page calls `notify({ tone: 'success', message: 'Translation copied' })` → a toast appears bottom right and dismisses after 4 seconds.
2. Three more toasts arrive → only the three newest remain visible; the oldest still-open toast moves out of view and returns when a newer one leaves.
3. Hover over the stack → pause all timers; move away → resume remaining time.
4. Error toasts remain until the user clicks X or a corrective action.

**G. Updates**

1. A background check finds `available` → main creates a 440 × 320 window centered on the pointer's display, using `showInactive` without stealing another app's focus, with the app theme and locale.
2. Click Download update → disable the primary button and update Downloading… 46%.
3. On completion → title Ready to install, button Install & restart.
4. Click Remind me in 24 hours or X → hide the popup and snooze this version for 24 hours.
5. A manual check in Settings › Updates hides the popup and transfers the flow to Settings.

## 7. Responsive behavior

Navigation breakpoints use **window width** (`window.innerWidth` in `PrimaryNavigationSidebar.tsx:28,81`); page headers use the `app-main` container.

| Width | Changes |
| --- | --- |
| Window ≥ 900 px | Sidebar follows saved preference (236 / 60). Palette is top-anchored at `clamp(64px, 12vh, 112px)`. |
| Window < 900 px | CSS (`max-width: 899px`): `--vzn-sidebar-expanded-width` becomes 208 px; `--vzn-chat-sidebar-width` becomes 220 px. JS: navigation is always a 60 px rail; expansion is a temporary portaled overlay. Chat history and navigation overlay are mutually exclusive. |
| Window ≤ 720 px | Force all `.app-sidebar[data-collapsed]` to 60 px and hide labels as a fallback for all states; `--vzn-chat-sidebar-width` is 200 px. |
| Window ≤ 560 px | Vertically center the palette, use 16 px margins, hide row descriptions and center the footer. |
| `app-main` < 560 px | Header horizontal padding drops to 16 px; actions wrap below the title (`flex-wrap`). |
| Limited height | Only the page list scrolls; Settings and background activity remain visible. Palette maximum height is `100vh − 72px`. Update dialog maximum height is 90vh with internal scrolling. |
| Minimum window | 640 × 480 DIP: always uses rail mode. |

## 8. Keyboard and accessibility

- **Shell Tab order:** title-bar ▣ → Search → page items in reading order → background rows → Settings → page content (header, then body).
- **Shortcut:** `⌘K` / `Ctrl K` toggles the palette anywhere in the window, ignoring active IME composition and key repeats. Search declares `aria-keyshortcuts="Meta+K"` / `"Control+K"`.
- **Primary navigation:** `nav` has the accessible name Primary navigation; each group is a `section` labeled with its group name (visible headings are `aria-hidden` to avoid duplicate announcements). The active item has `aria-current="page"`. All items have `title` and `aria-label` so rail items retain names. ▣ has `aria-expanded` and `aria-controls` pointing to the panel. When the overlay opens, `nav` uses `aria-owns` to retain the portaled panel in the accessibility tree. `Esc` closes it and restores focus to ▣.
- **Command palette:** `role="dialog" aria-modal="true"`, accessible name Command palette; search uses `role="combobox"`, `aria-controls` and `aria-activedescendant`; list uses `role="listbox"`, rows use `role="option"`, `aria-selected`, `tabIndex=-1` (arrow navigation, not Tab). `Tab` / `Shift+Tab` are trapped within the palette, cycling between search and buttons. `↑ ↓ Home End Enter Esc` follow §6. Focus enters search on open and returns to the previous element on close. The answer region uses `aria-live="polite"` and `aria-busy`; errors use `role="alert"`.
- **Toasts:** a `section` named Notifications; each toast uses `role="status"` (errors: `role="alert"`, `aria-live="assertive"`). Focus within the stack pauses timers.
- **In-app update dialog:** `role="dialog" aria-modal` with `aria-labelledby`/`aria-describedby`; initial focus on Later; Tab trapped by `trapTabFocus`; `Esc` means Later.
- **Update popup:** `main aria-labelledby="update-title"`; progress uses `role="status"`; errors use `role="alert"`; window buttons have accessible names Minimize and Close and remind me in 24 hours. The header is draggable.
- **Motion:** disable palette `fadeSlideIn` for `prefers-reduced-motion`. For `prefers-reduced-transparency` / `prefers-contrast: more`, the palette, title bar and sidebar replace translucent materials with opaque surfaces.

## 9. Copy reference (English translations)

The following values translate the original Vietnamese copy reference into English for documentation. Locale keys and placeholders remain unchanged; this table does not modify the app's locale catalogs.

| Key | English meaning |
| --- | --- |
| `nav_primary_sidebar` | Primary navigation |
| `nav_collapse_sidebar` / `nav_expand_sidebar` | Collapse sidebar / Expand sidebar |
| `nav_search_label` / `nav_search_or_run` | Search / Search or run a command |
| `nav_home` | Home |
| `nav_space_ai` · `nav_space_language` · `nav_space_system` · `nav_space_tools` | AI · Language · System · Tools |
| `nav_chat` · `nav_translate` · `nav_live_translate` · `nav_dictionary` · `nav_everywhere` | AI Chat · Translate · Interpretation · Dictionary · Translate Everywhere |
| `nav_thermal` · `nav_utilities` · `nav_settings` | Temperature & fans · Launcher & shortcuts · Settings |
| `nav_background_title` | Running in background |
| `nav_background_fans_profile` / `nav_background_fans_custom` | Fans · {profile} / Fans · custom |
| `nav_background_hotkeys` | Global shortcuts |
| `nav_background_browser` · `nav_background_ready` | Chrome extension · ready |
| `nav_background_summary` | Running in background: {count} items |
| `model_no_key` | Missing key |
| `route_loading` | Loading {feature}… |
| `nav_command_palette` | Command palette |
| `command_palette_search_placeholder` | Find commands, calculate or ask AI… |
| `command_palette_no_results` | No matching commands |
| `command_palette_hint_navigate` · `_open` · `_close` · `_back` | Navigate · Open · Close · Back |
| `command_palette_home_description` | Shortcuts, work in progress and system status |
| `command_palette_chat_description` | Chat with local and cloud AI |
| `command_palette_translate_description` | Translate text, images and speech |
| `command_palette_live_description` | Interpret speech in real time |
| `command_palette_dictionary_description` | Look up words and definitions |
| `command_palette_everywhere_description` | Quick selection translation and Chrome extension |
| `command_palette_thermal_description` | Monitor temperature, fan speed and CPU load |
| `command_palette_utilities_description` | Launcher and all shortcuts |
| `command_palette_settings_description` | API keys, appearance, models and updates |
| `command_palette_calc_description` | {expression} · Copy result |
| `command_palette_ask_ai_label` / `_description` | Ask AI / Quick answer for “{query}” |
| `command_palette_verify_label` / `_description` | Ask AI and search the web / Verify “{query}” with web sources |
| `command_palette_translate_text_description` | Translate “{text}” |
| `command_palette_dictionary_text_description` | Look up “{text}” |
| `command_palette_answer_disclaimer` | AI may make mistakes. Verify important information. |
| `chat_thinking` · `chat_smart_thinking_searching` | Thinking… · Searching the web… |
| `chat_copy` · `chat_copied` | Copy · Copied! |
| `ai_chat_popup_open_in_chat` | Open in Chat |
| `chat_error_no_key` · `chat_error_open_settings` | No API key. Add one in Settings. · Open Settings |
| `ai_chat_popup_input_too_long` | Content is too long. Shorten it before sending. |
| `notifications_region` | Notifications |
| `translate_error_dismiss` | Close (toast dismissal button) |
| `update_popup_title` / `update_popup_ready_title` | Update available / Ready to install |
| `update_popup_version` | Version {version} |
| `update_popup_description` | Download the new version now. You choose when to install and restart. |
| `update_popup_ready_description` | The update is ready. Viezan will restart when you choose to install it. |
| `update_popup_later` · `update_popup_download` | Remind me in 24 hours · Download update |
| `update_popup_minimize` · `update_popup_close` | Minimize · Close and remind me in 24 hours |
| `settings_update_available` / `settings_update_downloaded` | Update available: v{version} / Ready to install: v{version} |
| `settings_update_downloading` | Downloading… {percent}% |
| `settings_update_download` · `settings_update_install` | Download update · Install & restart |
| `update_notification_description` | Download when ready. Installation and restart happen only when you choose. Later snoozes this version's notifications for 24 hours. |
| `update_notification_later` · `update_notification_release_notes` | Later · View changes |
| `update_notification_action_error` | Action failed. Try again or check Updates in Settings. |
| (main, `TRAY_LABELS`) | Open Viezan · Quit Viezan · Hide temperature from menu bar |

## 10. Differences from the current build

**Primary navigation**

1. **Collapse-button placement.** `boards/Sidebar.dc.html` puts ▣ at the end of the sidebar brand row. The code puts it in the title bar, portaled into `.app-header-navigation`, following AGENTS.md's separate logo/toggle slots. Keep the code placement and update the design.
2. **Two missing background sources.** The designs (`Sidebar`, `Main` principle 06) include Local AI · qwen3:4b and menu-bar readings. The code intentionally omits local AI because `discoverLocalAi` can start Ollama (`useBackgroundStatus.ts:32-34`); menu-bar readings also have no row. Both are **proposed**, pending a cache-only status command in main.
3. **Fan row lacks a reading.** Design: Fans · Cool 58°. Code: profile name only, no `detail`. **Proposed.**
4. **Chrome extension status copy.** Design says connected; code says ready and only knows a token exists, not whether the extension is connected. Keep ready until real connection status is available.
5. **Rail summary is not clickable.** In rail mode, background activity is only a `StatusDot` with a tooltip. Control pages cannot be reached through it without expanding navigation. **Proposed:** make the dot open an overlay or expand navigation.
6. **Narrow overlay.** `SmallSurfaces` includes a separate Close sidebar button inside the overlay. The code reuses the title-bar ▣ button above the overlay, plus `Esc` and outside click. This is sufficient; no extra button is needed.

**Command palette** (`boards/CommandPalette.dc.html`)

7. The design groups rows under Use with / Go to; the code has one flat list. **Proposed.**
8. The design includes deep navigation such as Settings › AI models; the code offers page-level commands only. **Proposed** (Settings already has `openSettingsAt(section)`).
9. The design footer says ⇥ Ask AI; `Tab` in code only moves focus within the palette. **Proposed**, or update the design.
10. The design's answer region has a Local · qwen3:4b chip and Verify with web button. The code does not show the active model, and web search is only a row before submission. **Proposed:** show a read-only `ModelChip` in the answer region.
11. No matching commands appears **above** the remaining Ask AI rows. The intent is correct (AI is a fallback), but the wording can imply nothing is available. Consider No matching commands — ask AI?
12. Commands do not show shortcuts beside their names (`Main` principle 02). **Proposed.**

**Toasts** (`boards/Toasts.dc.html`)

13. The design includes a countdown (5 seconds remaining); the code has no countdown bar. **Proposed.** Conversation deleted · Undo already exists.

**Updates** (`boards/UpdatePopup.dc.html`, `boards/SmallSurfaces.dc.html`)

14. The popup lacks: You are using [current version], release highlights + View full notes, progress with download size, Hide / Cancel download while downloading, a warning about active Interpretation and restoring automatic fan control during installation, and Install on quit. All are **proposed**; the updater does not yet support download cancellation or install-on-quit.
15. The design's Remind me menu has multiple options (1 hour, tomorrow, next week, skip version); code uses a fixed 24 hours (`NOTIFICATION_SNOOZE_MS`). **Proposed.**
16. Main accepts `view` (open Settings › Updates), and i18n defines `update_popup_view`, View update, but no popup button invokes it. Add a ghost View update button or remove the unused path.

**Tray and menu bar** (`boards/SmallSurfaces.dc.html`)

17. The Windows/Linux tray design includes Launcher Alt+Space; code only offers Open Viezan and Quit Viezan. **Proposed.**
18. The macOS readings menu design includes Open Temperature & fans and Hide readings. Code offers Open Viezan (show window without navigation) and Hide temperature from menu bar. The full readings summary is missing. **Proposed.**
19. Tray labels follow the OS language rather than the selected app language, diverging from the principle of using the main window's voice.

**First-run welcome** (`boards/Welcome.dc.html`, `boards/WelcomeSteps.dc.html`)

20. The app **has no welcome flow**: no components, store or i18n keys (`welcome`, `onboarding`). The entire flow is **proposed**, in three steps: (1) Choose AI execution: local AI (recommended, install Ollama + `qwen3:4b`, with a This machine runs local AI well assessment) or a cloud key (Keychain), with Skip, set up later (`outline`) and Install local AI and continue (`primary` · `solid`). (2) Shortcuts and permissions: Launcher `⌘ Space`, Quick Translate `⌥ T`, Accessibility (Grant permission), optional Screen Recording (Later), Open at login toggle, Back / Continue. (3) Choose modules: a toggle grid for AI Chat, Translate, Interpretation, Dictionary, Temperature & fans, Launcher and Browser extension, with Start using Viezan. Reuse existing components in each step (`CredentialCard`, `CapabilityNotice`, `KeyCap`, module toggles from Settings › Modules) and state that all choices can be changed later in Settings. Add a persisted seen flag, EN/VI/JA translations and an entry point in Settings › About.

**Tokens and code**

21. Some shell values remain hardcoded in `src/styles/codex.css`: sidebar padding `10px 8px`, `gap: 2px`, `.app-sidebar` transition `180ms ease` (duplicating `--vzn-duration-normal`), `.sidebar-shortcut` text size `10px` without a token, brand row 40 px, palette `560px` / `480px` / `56px` / `clamp(64px, 12vh, 112px)`. Convert them to tokens when touching these rules.

## Native preview foundation (2026-10-27)

Native panel/search/shortcut refinements are tracked separately in
[Foundation 09](../../migration/native-implementation/foundation-09.md). Search
keeps the platform focus ring; submit shortcuts never toggle into cancellation.
This does not change the Electron shell specification above.

Native preview navigation remains selected when the current page is activated
again; see [Foundation 10](../../migration/native-implementation/foundation-10.md).

Native panel accessibility grouping and keyboard Enter parity are recorded in
[Foundation 11](../../migration/native-implementation/foundation-11.md).

Native visual alignment with Review 18 is tracked in
[Foundation 12](../../migration/native-implementation/foundation-12.md): labeled
adaptive toolbars, soft selected navigation, generated Graphite Qt palettes and
opaque rounded panels. This remains a partial native implementation, not design
acceptance or a change to the released Electron shell.

Swift/macOS Review 18 alignment continues in
[Foundation 13](../../migration/native-implementation/foundation-13.md). Navigation
uses continuous sidebar material, reading panels stay opaque, and history uses
its toolbar anchor with bounded placement.
