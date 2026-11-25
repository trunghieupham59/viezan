# Changelog

Curated user-facing changes. This file starts with 2.4.0; see
[GitHub Releases](https://github.com/trunghieupham59/Viezan/releases) for earlier versions.
Entries describe their version's source and do not certify that an installer has been published.

## [Unreleased]

## [2.6.1]

- On Windows, Alt+T translates the selected text in a floating card while the
  original app keeps keyboard focus. It replaces only the verified selection,
  including when the card is closed and reopened. The Viezan tray menu can
  reopen the last result for keyboard actions and Undo.
- The macOS Quiet fan profile ignores isolated CPU temperature spikes, ramps up under sustained load and slows down gradually. A CPU reading of 100 °C or higher still requests maximum fan speed immediately.
- Choosing an AI model updates the default across features and quick actions. Existing chats remember their model, and running requests and retries keep the model they started with.

- macOS uninstall plans let you select verified app-owned files in `/Library` and move them to the Trash with Finder authentication.
- macOS groups app shortcuts with their target and lets you select the shortcut during uninstall. This fixes OpenVPN Connect’s own LaunchAgent appearing as shared when a shortcut points to the same installation.

- macOS Applications gives the uninstall plan more room, wraps long paths and shows the full Trash button label in narrow windows.
- Team-signed macOS development builds enable Hardened Runtime. The team-signed fan helper also checks it on the running Viezan client.
- When the macOS file helper loses track of a broken app link after moving it, it reports failure and leaves the destination alone.
- On Windows, replacing a selection with identical text gives neutral feedback. Undo is offered after the editor confirms the change.

- Qt Settings adds a chat appearance preview, consistent form controls and grouped benchmark results. Importing preferences on either platform explains when a legacy appearance will change to Glass.
- Qt Launcher groups Quick AI turns and opens the session's model picker. Quick Translate links to the active model. Application selection, shortcut errors and thermal readings use their Glass states.
- Chat's tools button and panel announce “Composer tools” on both platforms. macOS Local AI sizes follow the app language.

- History search suggests disabling Archive only while that filter is active.
- macOS Dictionary adds the context command to the menu, preserves folded context and adapts entry actions to narrower windows.
- macOS Launcher can retry an unavailable application catalog. The Qt currency picker shows localized names and file results describe future modification dates.
- Windows/Linux screen capture announces its keyboard controls. The shortcut recorder announces when it is saving a shortcut.
- Measured local models show GPU or CPU + GPU in Settings on both platforms.
- macOS fan rules and the temperature list agree on the CPU/GPU group of an SMC sensor. Tied readings keep a stable order. Each failed fan action issues its own VoiceOver announcement.
- macOS Settings shows cumulative Ollama download progress with localized phases and updates installed model sizes on refresh.
- Restoring backup preferences on macOS and Qt now restores pinned models in order. Older backups without a pin list preserve local pins.
- The macOS model picker shows the pin shortcut and count, keeps the selection mark on the right and allows unpinning at the eight-model limit.
- On macOS, a failed backup import rolls back newly added images. If the previous workspace cannot be restored, Viezan keeps the images it references and prompts for a reload.
- macOS Thermal distinguishes missing readers, read errors and empty sensor readings. Retry waits for the previous reader to exit. The fan control card offers registration when the service is not registered.
- macOS Applications can resume an interrupted Undo from 2.6.0. If restoring
  the original bundle name requires Finder, the journal can reveal the bundle
  and verify it after you put it back.
- Windows release notes give 2.5.2 users the upgrade instructions for the
  actual installer's Authenticode status.
- The Windows installer and portable ZIP include the Visual C++ runtime needed
  to launch Viezan on a clean system.
- Qt Chat accepts pasted clipboard images, including PNG data copied without a file.
- macOS Dictionary keeps pasted context over 500 characters and shows how to shorten it before lookup.
- macOS Thermal provides removal, System Settings and a permission check in the fan helper approval notice.

- The macOS app loads its resources from the installed bundle so a GitHub-built
  DMG opens on a machine without the Swift build directory.

- Internal macOS Previews now use one pinned Apple Development certificate across
  builds so macOS can match prior Accessibility and Screen Recording grants.
- Public macOS updates require notarized Apple Silicon and Intel disk images.
  The release workflow checks a visible window after a fresh install and upgrades
  from 2.4.2, 2.5.2 and 2.6.0. Electron's fallback download name points to the
  same verified disk image. Draft builds can still produce manual-install Previews.

## [2.6.0]

- Translate: "Use as source" can be undone, restoring the draft and the
  language pair it replaced, and on macOS no longer sets the same language on
  both sides when the source was automatic.
- The macOS Launcher labels Spotlight content matches and adds a “Find files with AI” row whose requests are blocked until the provider supports the exact planning prompt.
- Notifications appear at the top right below the header with distinct icons for information, success, warning and error (macOS, Windows and Linux). Errors stay until closed; Applications and Interpretation report a failed action or its result there instead of in a coloured band in the page.
- Windows/Linux: a failed image, screen capture or export no longer shows as a storage error or keeps the window from closing.
- On macOS, apply fan rules directly, preview their targets, and see which profile, rule or manual speed is controlling each fan. The rule editor supports keyboard navigation and text composition. VoiceOver identifies current, selected and target speeds. Returning to automatic is confirmed after the fan helper replies. Vietnamese fan controls use “cấu hình” and “dịch vụ quạt” throughout.
- Windows/Linux: in Dictionary, Enter looks up a newly typed word instead of
  the first suggestion of the previous lookup, and Ctrl+Shift+C leaves a text
  selection alone; "Use as source" never sets the same language on both sides.
- Windows/Linux: AI Chat sends with Enter and breaks the line with Shift+Enter,
  as on macOS; Ctrl+Enter still sends, and Enter while an input method is
  composing only confirms the text.
- Clearing all history and importing a backup now change the workspace and the
  Interpret store together or not at all: a failed write no longer leaves one
  cleared or imported and the other not (macOS, Windows and Linux). On
  Windows/Linux a failed delete of an archived session keeps it, and an
  Interpret store with a field of the wrong type is no longer overwritten.
- Interpretation: each analysis (summary, action items, decisions, speaker analysis) is now requested on its own, so the summary no longer repeats the other three, and results render Markdown. On macOS the analysis card shows the tab you select, offers to create an empty one, scrolls inside at most half the transcript column and can be collapsed. On Windows and Linux, choosing an analysis that already exists shows it instead of writing it again, with a separate Regenerate button.
- Glass is now the only theme. Graphite, Paper, Corporate and Midnight are removed and the theme style picker is gone from Settings; light, dark and system modes, accent colours and reading size stay. A saved older theme opens as Glass, and Midnight opens as Glass in dark mode.
- On macOS, create floating notes from the menu bar or pin a Quick Translate result or a completed AI Chat reply. Up to five notes are saved on this Mac.
- On macOS, the Launcher can prevent sleep until Viezan quits, mute the audio output or toggle system-wide Dark mode. The menu bar shows when Prevent sleep is on and lets you toggle it.
- macOS fan control rolls back failed target writes and retries failed restores, including for up to three seconds at shutdown. It restores fans if all SMC temperature readings are lost, reports thermal events while a restore is pending, and drops queued commands after a console-user switch. Its watchdog counts time asleep, and Intel fan control rejects fans outside the hardware mask.
- The macOS temperature page shows IOHID sensors by name alongside SMC readings. Fan profiles use a HID reading only when a rule selects its exact sensor key. Selecting one shows that the helper checks the temperature ceiling only on SMC sensors.
- macOS Quick Translate can translate a screen region from the menu bar or the optional ⌥⇧T shortcut and show the original text above the translation.
- macOS: the temperature page says when the system has stopped a fan because the Mac is cool.
- macOS Applications now names the paths that lock uninstall and reset, explains each scan issue, and offers Show in Finder and Rescan.
- macOS Applications keeps uninstall and reset available when the only scan issue is an empty `.app` folder.
- macOS Applications no longer treats a system folder watcher as an app in use, which stopped uninstall and Move to Trash.
- macOS Applications tells you when an item is in use during Uninstall, Reset, or Move to Trash and records the reason if the action is already in the journal.
- macOS Applications can move a damaged bundle or leftover `.app` folder to the Trash from its scan result, keep related data, and undo the move.
- macOS Applications can move a broken `.app` link to the Trash and undo the move while preserving its target and related data.
- macOS Applications keeps uninstall and reset available when a `.app` link points to an app that has been removed. A link whose folder is missing or unreadable still locks changes.
- macOS Applications also lists data the app itself declares: bundled helpers and extensions, app groups from its signature, and privileged helpers. These items are shown with Show in Finder and stay locked.
- macOS Applications scans Application Scripts, synced preferences, cookies, recent-document lists and installer receipts for exact bundle ID matches. Cookies and recent-document lists of the app can be selected by hand; the rest stay locked.
- macOS Applications can preview a plan item with Quick Look, undo the latest removal with ⌘Z, and open an app's plan when you drag it in from Finder. Clicking an app row now opens its plan.
- macOS Applications warns in the confirmation when personal data is selected, and offers a button to open Full Disk Access in System Settings when a folder could not be read. Viezan does not request the permission itself.
- macOS Applications can uninstall an app that needs administrator permission, such as an App Store app owned by root: Finder moves the bundle to the Trash and macOS asks for your password or Touch ID. Undo asks again, and cancelling the prompt changes nothing.
- On macOS, scan actions move below the text in narrow Applications views, and Escape or Return cancels the Classic Move to Trash confirmation.
- macOS Applications now finds Riot Client in `/Users/Shared/Riot Games` and allows uninstall when the current user owns the bundle, leaving adjacent launcher files in place.
- macOS: ⌘⇧C opens and closes the dictionary's context line. The Launcher
  takes "t …", "d …", "? …" and "= …" to translate, look up, ask AI or
  calculate, and shows these prefixes before anything is typed; the update prompt
  names the new version, its size and the version in use; the temperature page
  offers Retry when the sensor reader stopped.
- macOS: the history library says whether nothing is saved, nothing is
  archived or a search found nothing, and confirms a rename; deleting a key or
  a local model names what is deleted; a failed Launcher open offers Retry.
- macOS: downloading a local model shows the bytes received and the size, and
  installed models show their size on disk; Launcher file results show the
  folder and when the item last changed; a running research shows its elapsed
  time.
- Windows/Linux: input limits count the characters a person sees, so letters
  with combining marks and joined emoji count once, as on macOS.
- Windows/Linux: Translate has Clear source and Use as source, and locks the
  languages, swap and Compare while translating; Dictionary picks the first
  suggestion with Enter when a word is not found and reads each sense aloud;
  finished Chat answers can be read aloud; Tab leaves the Quick Chat editor.
- Windows/Linux: a workspace whose task list has the wrong type is no longer
  overwritten, a failed session delete keeps the draft in memory, and clearing
  history stops before touching Chat when the Interpret store is damaged.
- macOS: the activity layer's heading counts the running work.
- Windows/Linux: Ctrl+Shift+C opens and closes the dictionary's context line;
  a prefixed Launcher query is not offered again under "Use with", and Retry
  after a failed open runs the row that failed.
- Windows/Linux: every interactive control on the main screens has an
  accessible name in all three languages, open and selected states are
  reported, streaming answers and the recording timer are not re-read token by
  token, and Escape returns focus when moving between layers.
- Windows/Linux: the keyboard focus ring shows on a switch that is on,
  confirmation dialogs keep their backdrop outside Glass and return focus, and
  typing or a streaming answer no longer recomputes suggestions and the model
  list.
- Windows/Linux: the Launcher finds files when the home folder is reached
  through a symbolic link or Documents sits on another drive; choosing the Fast
  or Balanced purpose resets a Low or Medium reasoning level; very small
  exchange rates read as plain decimals.
- Windows/Linux: installed local models show their size on disk and measured
  speed, a running research shows its elapsed time with Stop beside it, and the Launcher opens a matching Settings
  section directly.
- macOS: the Launcher opens a matching Settings section directly, a running
  research has Stop beside its elapsed time, and installed local models show
  their measured speed.
- Windows/Linux: downloading a local model shows the bytes received and the
  size; Launcher file results show their kind, folder and when they last
  changed, and skip hidden and build folders.
- Windows/Linux: switches follow the dark palette, status chips can show
  success, warning and error tones, the application list and confirmation
  dialogs work from the keyboard and return focus, and the Launcher announces
  calculator and currency results.
- macOS: models can be pinned in the model panel (pin control on each row,
  ⌘P on the highlighted row, or the context menu); pinned models stay in their
  own group above Recent. ⌘⇧M opens the model panel and ⌘⇧T the composer's
  "+" menu. Arrow keys no longer loop when a model is listed in two groups.
- Windows/Linux: models can be pinned in the model list (pin control, Ctrl+P,
  context menu); Ctrl+Shift+M opens the model list and Ctrl+Shift+T the
  composer's "+" menu. The Launcher converts currencies with aliases, a
  remembered target currency, the rate with its date, and loading and error
  states.
- Windows/Linux: AI Chat has the four reasoning levels (Auto, Low, Medium,
  Careful) and suggestions from recurring work; Interpret copies and exports
  "translation only" when that mode is on, and each sentence's speaker button
  shows preparing, reading and stop.
- Windows/Linux Glass: Settings keeps its section list beside the content at
  the default window size with the sidebar open, in a narrower column, and
  rows keep their control on the right in narrow cards.
- Windows/Linux Glass: labels sit on the centre of compact buttons, filter
  segments, header actions and status chips; the dictionary search field, the
  chat composer and the Send arrow are centred; panes no longer show a second
  line across their top edge in dark mode.
- Windows/Linux: Translate, Dictionary and Interpret open the same searchable,
  grouped model list as Chat, and their language, swap and model controls use
  the 32 pt size of header actions and Settings pickers.
- Windows/Linux: the sidebar scrolls its destinations in a short window
  instead of overflowing its pane; the dictionary result tabs are a readable
  segmented group; a refreshed Apps list is announced as a toast, only when
  you asked for the refresh; the two quick-translate language pickers share
  one width.

- The Windows installer asks you to close a running Viezan before updating
  instead of failing on each locked file.
- Make the Windows/Linux Glass theme easier to read: settings card titles sit
  inside their card, switches follow the theme instead of the system accent,
  dark-mode glass buttons lose their bright streak, Home quick-start tiles are
  white cards, and model pickers show a real chevron and the full short name.
- Remove the ghost edge beside header and rail buttons after the window narrows.
- Windows/Linux: slightly larger reading and composer text, lighter icon
  strokes, a grid icon for Apps, and a visible disabled Send button.
- Windows/Linux: the translation style panel no longer cuts off its last
  option, and the Translate/Dictionary model list shows each model's ID so
  models with the same short name can be told apart.
- Windows/Linux: the chat "+" menu opens below the composer when there is
  more room there, instead of covering the header in an empty chat.
- Windows/Linux: the logo and search button line up with the other icons on
  the collapsed navigation rail.
- Updates are verified with Viezan's own Ed25519 signature on each package
  manifest instead of an operating-system certificate. Windows no longer
  refuses to open a downloaded installer because it lacks a trusted signature.
- "Install and restart" installs a downloaded update and reopens Viezan,
  instead of leaving the disk image, installer or AppImage to the user. Linux
  keeps the previous AppImage beside the new one.
  The package still opens for a manual install where the app cannot replace
  itself.

## [2.5.2]

- Keep Windows/Linux responsive with a long history: opening the window, typing
  and streaming replies no longer slow down as conversations accumulate.
- Save a draft shortly after typing pauses instead of on every keystroke.
- Stop the workspace file growing with the square of a conversation's length;
  existing files shrink the next time they are loaded on Windows/Linux.

## [2.5.1]

- Let the retired Electron app (2.4.x and earlier) update itself to the native app on
  Windows and Linux. The Windows installer removes the Electron app first, keeps its
  data, may ask for administrator approval, and reopens Viezan after an in-app update.

## [2.5.0]

- Officially retire the Electron desktop app. Viezan now ships only as native apps:
  SwiftUI/AppKit on macOS and Qt Quick/QML on Windows/Linux.
- Bring Liquid Glass 2.0 to Windows/Linux: redesigned pages, system pages and
  Settings, Launcher home suggestions, Quick Chat/Translate notices, an automatic
  update sheet, compact and minimum window layouts, and Ctrl+K calculation, Ask AI,
  translate and look-up rows.
- Uninstall Windows/Linux applications from the Applications page after one
  confirmation; package removal has no undo.
- Switch Glass surfaces to solid fills when reduced transparency or high contrast
  is on.
- Retire the Viezan browser extension and its local pairing service. Use the desktop selection shortcut to translate text, or paste it into Quick Translate when the operating system restricts selection access.

- Fix Applications inventory for plist date/data values, wrapped iOS metadata and protected Apple identifiers; ignore non-bundle Spotlight suffix matches. Read backup checksums through one no-follow file descriptor and add a full native-runtime uninstall/restart/Undo fixture test.

- Harden Applications removal: lock ambiguous ownership and incomplete scans, require opt-in for persistent data, stop on errors, verify preference state/backups, and reconcile interrupted Undo. Containers and launch agents remain read-only in this draft.

- Add macOS Applications: inspect related files, uninstall or reset one app, and
  restore through a local journal. Protect shared/in-use data, retain items needing
  administrator access, and recheck the supported locations after each operation.

- Restore the active chat and text drafts, plus translation and dictionary work
  across navigation and restart. Optionally start fresh after completed work has
  been left for 2 hours (Translate) or 30 minutes (Dictionary), with a way to reopen
  the prior result. Show storage failures and history capacity warnings.
- Packaged macOS builds can install a background fan helper once, reconnect after
  app restarts, and reapply remembered settings after sleep/wake. Quitting still
  returns fans to system control; development builds retain session helpers.
- Keep README facts synchronized with source and require a current documentation
  review before tagging or publishing. Publish curated version notes from this file.

## [2.4.2]

- Improve readability of floating controls in the Glass theme.
- Add a task option flyout and more forgiving language search.
- Update AI provider SDKs, state management and build/lint dependencies.

## [2.4.1]

- Align Settings typography with the shared hierarchy and standardize Vietnamese
  tone-mark placement in interface copy.

## [2.4.0]

### Added

- Thermal monitoring on macOS through SMC and Linux through hwmon, with optional
  menu bar/tray readings. Available sensors and fans depend on the hardware.
- Optional macOS fan control through a privileged session helper, including fixed
  speeds, sensor rules, saved profiles and calibration. Windows thermal monitoring
  and Linux fan control are not supported.
- Feature module toggles with persisted enabled state.

### Changed

- A redesigned workspace shell, Home and Settings, with consistent feature layouts
  and English, Vietnamese and Japanese interface copy.
- Shared header language pairs, navigation typography and text-size scaling.

### Fixed

- IME-safe message submission, Escape handling in open selectors, saved-key
  replacement and keyboard focus behavior.
