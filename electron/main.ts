import path from 'node:path'
import type { Session, Tray } from 'electron'
import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, nativeImage, nativeTheme, screen, session, shell } from 'electron'
import { configureApplicationMenu, isDevelopmentRuntime } from './applicationMenu'
import { registerChatHandlers } from './ipc/chat'
import { initGlobalHotkey } from './ipc/globalHotkey'
import { registerImageTranslateHandlers } from './ipc/imageTranslate'
import { registerKeychainHandlers } from './ipc/keychain'
import { initLegacyAssistant, setLocalServerAccessors } from './ipc/legacyAssistant'
import { registerLocalAiHandlers, stopManagedLocalAiRuntime } from './ipc/localAi'
import { getServerToken, LOCAL_SERVER_PORT, startLocalServer, stopLocalServer } from './ipc/localServer'
import { registerModelsHandlers } from './ipc/models'
import { createWindowOpenHandler, isAllowedAppNavigation, isAllowedPermission, type NavigationPolicy } from './ipc/navigationGuard'
import { registerQuickChatHandlers } from './ipc/quickChat'
import { registerSubtitleHandlers } from './ipc/subtitle'
import { registerSystemHandlers } from './ipc/system'
import { registerTranscribeHandlers } from './ipc/transcribe'
import { registerTranslateHandlers } from './ipc/translate'
import { registerTtsHandlers } from './ipc/tts'
import { registerUpdaterHandlers } from './ipc/updater'
import { registerWebSearchHandlers } from './ipc/webSearch'
import { isQuitRequest } from './quitRequest'
import { resolveRuntimeProfile } from './runtimeProfile'
import { createAppTray, promptCloseAction, shouldHideMainWindowOnClose, supportsTrayResidency } from './trayManager'

// Allow audio autoplay after async operations (TTS API calls lose user-gesture context)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Suppress macOS Metal/Skia mailbox noise from Chromium's GPU compositor.
if (process.platform === 'darwin') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-features', 'UseSkiaRenderer')
}

// ── Runtime profile (official build vs development run) ───────────────────────
// A development run gets its own userData folder, local-server port and window
// title so it can coexist with the installed app (which may be resident in the
// tray). This MUST run before the single-instance lock below: the lock is keyed
// on userData, so a shared folder would make `npm run dev` quit immediately.
const runtimeProfile = resolveRuntimeProfile(app.isPackaged, process.env)
if (runtimeProfile.userDataDirName) {
  app.setPath('userData', path.join(app.getPath('appData'), runtimeProfile.userDataDirName))
}

// ── Single-instance guard ─────────────────────────────────────────────────────
// Prevent a second launch of the SAME build from binding the same local-server
// port (EADDRINUSE). If that build is already running, focus its window and quit
// immediately.
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // The Windows installer/uninstaller asks the tray-resident app to exit
    // cleanly (`Viezan.exe --quit`) before it resorts to killing the process.
    if (isQuitRequest(argv)) {
      app.quit()
      return
    }
    if (!app.isReady()) return // whenReady() creates the window
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
    }
    showMainWindow({ focus: true })
  })
}

const isDev = isDevelopmentRuntime(app.isPackaged)

// Set app name ("Viezan Dev" in development so the OS can tell the two apart)
app.setName(runtimeProfile.appName)

// Windows taskbar grouping/pinning keys off the AppUserModelID. Match the
// electron-builder `appId` so the running window shares the NSIS shortcut's
// identity (and its icon). Skipped in dev so `electron.exe` doesn't hijack the
// installed app's taskbar group.
if (process.platform === 'win32' && app.isPackaged) {
  app.setAppUserModelId('com.Viezan.app')
}

// ── Window constants ──────────────────────────────────────────────────────────
/** Keep native startup/fallback colors aligned with renderer design tokens. */
const WIN_BG_DARK = '#161618'
const WIN_BG_LIGHT = '#EEEEEF'
/** Windows title bar overlay: strip colour = --vzn-titlebar-bg, glyphs = --vzn-text-muted family. */
const WIN_TITLEBAR_DARK = { color: '#242426', symbolColor: '#E5E5EA' }
const WIN_TITLEBAR_LIGHT = { color: '#EEEEEF', symbolColor: '#48484A' }
/** Must match --vzn-titlebar-height in tokens.css. */
const TITLEBAR_HEIGHT_PX = 40
const MACOS_WINDOW_VIBRANCY = 'under-window' as const
const QUICK_CHAT_WIDTH = 860
const QUICK_CHAT_HEIGHT = 540

const navigationPolicy: NavigationPolicy = {
  isDev,
  distDir: path.resolve(__dirname, '..', 'dist'),
}

let mainWindow: BrowserWindow | null = null
let appTray: Tray | null = null
/** True once a real quit has begun, so closing the main window must not just hide it. */
let isQuitting = false
/** Guards against stacking close-confirmation dialogs on repeated X clicks. */
let isClosePromptOpen = false

function getMainWindowBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? WIN_BG_DARK : WIN_BG_LIGHT
}

function getWindowsTitleBarOverlay() {
  const colors = nativeTheme.shouldUseDarkColors ? WIN_TITLEBAR_DARK : WIN_TITLEBAR_LIGHT
  return { ...colors, height: TITLEBAR_HEIGHT_PX }
}

function shouldUseMacWindowMaterial(): boolean {
  return process.platform === 'darwin'
    && !nativeTheme.prefersReducedTransparency
    && !nativeTheme.shouldUseHighContrastColors
}

function syncMainWindowAppearance(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  mainWindow.setBackgroundColor(getMainWindowBackgroundColor())
  if (process.platform === 'darwin') {
    mainWindow.setVibrancy(shouldUseMacWindowMaterial() ? MACOS_WINDOW_VIBRANCY : null)
  }
  if (process.platform === 'win32') {
    mainWindow.setTitleBarOverlay(getWindowsTitleBarOverlay())
  }
}

function showMainWindow(options: { focus?: boolean } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.webContents.setZoomLevel(0)
  mainWindow.show()
  if (options.focus) mainWindow.focus()
}

function createWindow() {
  const useMacWindowMaterial = shouldUseMacWindowMaterial()

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 700,
    minWidth: 1200,
    minHeight: 700,
    title: runtimeProfile.windowTitle,
    // macOS and Windows hide the native title bar; the renderer's AppShell
    // draws the draggable strip and the OS keeps its window controls on top.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : process.platform === 'win32' ? 'hidden' : 'default',
    trafficLightPosition: { x: 16, y: 14 },
    ...(process.platform === 'win32'
      ? { titleBarOverlay: getWindowsTitleBarOverlay(), autoHideMenuBar: true }
      : {}),
    backgroundColor: getMainWindowBackgroundColor(),
    ...(useMacWindowMaterial
      ? { vibrancy: MACOS_WINDOW_VIBRANCY, visualEffectState: 'followWindow' as const }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
    },
    show: false,
    icon: process.platform === 'win32'
      ? path.join(__dirname, '..', 'build', 'icon.ico')
      : path.join(__dirname, '..', 'build', 'icon.png'),
  })

  // The renderer's <title> is the product name; keep the dev marker visible in
  // the taskbar / Alt-Tab instead of letting the page title overwrite it.
  if (isDev) {
    mainWindow.on('page-title-updated', (event) => event.preventDefault())
  }

  mainWindow.once('ready-to-show', () => {
    showMainWindow()
  })

  mainWindow.webContents.once('did-finish-load', () => {
    if (!mainWindow?.isVisible()) showMainWindow()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[mainWindow] Failed to load renderer:', { errorCode, errorDescription, validatedURL })
    showMainWindow({ focus: true })
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Disable default Cmd+=/Cmd+- zoom shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isMac = process.platform === 'darwin'
    const ctrlOrCmd = isMac ? input.meta : input.control
    if (ctrlOrCmd && (input.key === '+' || input.key === '=' || input.key === '-' || input.key === '_' || input.key === '0')) {
      event.preventDefault()
    }
  })

  // Child windows / external links are handled for every webContents in the
  // `web-contents-created` hook below.

  // Windows/Linux: the X button asks whether to keep the app running in the system
  // tray or quit completely (a resident process keeps the local server port bound).
  // Real quits (tray menu, updater, relaunch, OS shutdown) set `isQuitting` first
  // so this handler lets the window close.
  mainWindow.on('close', (event) => {
    if (!shouldHideMainWindowOnClose({ platform: process.platform, isQuitting, hasTray: appTray !== null })) return
    event.preventDefault()
    const window = mainWindow
    if (!window || isClosePromptOpen) return
    isClosePromptOpen = true
    promptCloseAction(window, app.getLocale())
      .then((action) => {
        if (action === 'tray') {
          if (!window.isDestroyed()) window.hide()
        } else if (action === 'quit') {
          app.quit()
        }
      })
      .catch((err) => {
        console.error('[main] close prompt failed, hiding to tray:', err)
        if (!window.isDestroyed()) window.hide()
      })
      .finally(() => {
        isClosePromptOpen = false
      })
  })

  // Windows emits this when the user logs off or shuts down; never block it.
  mainWindow.on('session-end', () => {
    isQuitting = true
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** Bring the main window back (recreating it if it was destroyed), e.g. from the tray. */
function openMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  showMainWindow({ focus: true })
}

function resolveTrayIconPath(): string {
  // Public assets are copied into `dist/` by Vite, so they ship inside the app
  // bundle (the `build/` folder is not packaged).
  const filename = process.platform === 'win32' ? 'tray.ico' : 'icon.png'
  return isDev
    ? path.join(__dirname, '..', 'public', filename)
    : path.join(__dirname, '..', 'dist', filename)
}

function setupTray(): void {
  // Development runs quit with their window (opt in with VIEZAN_DEV_TRAY=1) so a
  // stale dev process never keeps the dev port and hotkeys bound in the background.
  if (!runtimeProfile.trayEnabled || !supportsTrayResidency(process.platform) || appTray) return
  appTray = createAppTray({
    iconPath: resolveTrayIconPath(),
    tooltip: runtimeProfile.windowTitle,
    osLocale: app.getLocale(),
    onOpen: openMainWindow,
    onQuit: () => app.quit(),
  })
}

async function openExternalSafely(url: string): Promise<void> {
  try {
    await shell.openExternal(url)
  } catch (err) {
    console.error('[main] openExternal failed:', err)
  }
}

/**
 * Default-session hardening: permission allow-list plus the display-media
 * handler. All app windows share the default session.
 */
function configureSessionSecurity(ses: Session): void {
  // Required for getDisplayMedia to work in Electron renderer process.
  // Without this handler, getDisplayMedia throws "Not supported".
  // 'loopback' captures system audio on macOS (requires Screen Recording permission).
  ses.setDisplayMediaRequestHandler((request, callback) => {
    const frameUrl = request.frame?.url
    if (frameUrl !== undefined && !isAllowedAppNavigation(frameUrl, navigationPolicy)) {
      callback({})
      return
    }
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' })
      } else {
        callback({})
      }
    }).catch(() => {
      callback({})
    })
  })

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL()
    callback(isAllowedPermission(permission) && isAllowedAppNavigation(requestingUrl, navigationPolicy))
  })

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const requestingUrl = details.requestingUrl || webContents?.getURL() || requestingOrigin
    return isAllowedPermission(permission) && isAllowedAppNavigation(requestingUrl, navigationPolicy)
  })
}

// ── Raycast-style Quick Chat Window ──────────────────────────────────────────
let quickChatWindow: BrowserWindow | null = null

function positionQuickChatWindow(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(cursor)
  win.setBounds({
    width: QUICK_CHAT_WIDTH,
    height: QUICK_CHAT_HEIGHT,
    x: Math.round(workArea.x + workArea.width / 2 - QUICK_CHAT_WIDTH / 2),
    y: Math.round(workArea.y + workArea.height * 0.22),
  })
}

function createQuickChatWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: QUICK_CHAT_WIDTH,
    height: QUICK_CHAT_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    backgroundColor: '#00000000',
    // On macOS, use a panel-style window so showing/hiding the Quick Chat
    // does NOT activate the Viezan app or transfer focus to the main window
    // when it gets hidden. Behaves like Raycast/Spotlight.
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
    },
  })

  win.setAlwaysOnTop(true, 'pop-up-menu')

  if (isDev) {
    win.loadURL('http://localhost:5173/quick-chat.html')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'quick-chat.html'))
  }

  win.on('blur', () => {
    if (!win.webContents.isDevToolsOpened()) win.hide()
  })

  win.on('closed', () => {
    quickChatWindow = null
  })

  return win
}

function sendQuickChatShow(win: BrowserWindow): void {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  win.webContents.send('quick-chat:show')
}

function toggleQuickChatWindow(): void {
  if (!quickChatWindow || quickChatWindow.isDestroyed()) {
    quickChatWindow = createQuickChatWindow()
  } else if (quickChatWindow.isVisible()) {
    quickChatWindow.hide()
    return
  }

  const win = quickChatWindow
  positionQuickChatWindow(win)
  win.show()
  win.focus()

  // While the renderer is still loading (freshly created or reloading) an
  // immediate send would be lost. Deliver it once the page finished loading.
  // The renderer also runs its show-time logic itself on mount, so a missed
  // first event is harmless.
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => sendQuickChatShow(win))
  } else {
    sendQuickChatShow(win)
  }
}

// ── Floating Subtitle Window ──────────────────────────────────────────────────
let subtitleWindow: BrowserWindow | null = null

/** HC-NEW-08: px gap between subtitle window bottom edge and the screen's taskbar/dock */
const SUBTITLE_BOTTOM_MARGIN = 40

function createSubtitleWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay()
  const winW = 660
  const winH = 300

  subtitleWindow = new BrowserWindow({
    width:  winW,
    height: winH,
    minWidth:  400,
    minHeight: 252,
    x: Math.round(workAreaSize.width  / 2 - winW / 2),
    y: Math.round(workAreaSize.height - winH - SUBTITLE_BOTTOM_MARGIN),
    frame:     false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow:   false,
    skipTaskbar: true,
    resizable:   true,
    movable:     true,
    webPreferences: {
      preload: path.join(__dirname, 'subtitle-preload.js'),
      spellcheck: false,
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox: true,
      devTools: isDev,
    },
  })

  // Float above all other app windows in the current workspace.
  // We deliberately avoid setVisibleOnAllWorkspaces() because it triggers a
  // macOS activation-policy side-effect that hides the app's dock icon.
  // 'pop-up-menu' is high enough to overlay most app windows while keeping
  // the main window's dock icon visible at all times.
  subtitleWindow.setAlwaysOnTop(true, 'pop-up-menu')

  if (isDev) {
    subtitleWindow.loadURL('http://localhost:5173/subtitle.html')
  } else {
    subtitleWindow.loadFile(path.join(__dirname, '..', 'dist', 'subtitle.html'))
  }

  subtitleWindow.once('ready-to-show', () => subtitleWindow?.show())

  subtitleWindow.on('closed', () => {
    subtitleWindow = null
    // Notify the main window so the toggle button goes back to off state.
    // This is the single place `subtitle:closed` is emitted (every close path
    // ends in this event).
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subtitle:closed')
    }
  })
}

app.whenReady().then(() => {
  // A second instance has already called app.quit(); do not register windows,
  // the local server or global hotkeys from it.
  if (!hasSingleInstanceLock) return

  // Set macOS dock icon using base64 (no file path dependency)
  if (process.platform === 'darwin') {
    try {
      // Try base64 first (generated by generate-icons.js)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const iconBase64: string = require(path.join(__dirname, '..', 'build', 'icon-base64.js'))
      const icon = nativeImage.createFromDataURL(iconBase64)
      if (!icon.isEmpty()) {
        app.dock?.setIcon(icon)
      }
    } catch {
      // Fallback to file path
      const iconPath = path.join(__dirname, '..', 'build', 'icon.png')
      const icon = nativeImage.createFromPath(iconPath)
      if (!icon.isEmpty()) {
        app.dock?.setIcon(icon)
      }
    }
  }

  nativeTheme.on('updated', syncMainWindowAppearance)
  configureApplicationMenu({ isPackaged: app.isPackaged, platform: process.platform })
  configureSessionSecurity(session.defaultSession)
  setupTray()
  createWindow()

  // Register IPC handlers
  registerKeychainHandlers(ipcMain, () => mainWindow)
  registerTranslateHandlers(ipcMain)
  registerModelsHandlers(ipcMain)
  registerTranscribeHandlers(ipcMain)
  registerTtsHandlers(ipcMain)
  registerImageTranslateHandlers(ipcMain)
  registerChatHandlers(ipcMain)
  registerWebSearchHandlers(ipcMain)
  registerLocalAiHandlers(ipcMain, () => mainWindow)
  registerQuickChatHandlers(ipcMain, () => mainWindow, () => quickChatWindow)

  // Global hotkey — translate selected text in any OS application
  initGlobalHotkey(ipcMain, () => mainWindow, toggleQuickChatWindow)

  // Local HTTP server — used by the Viezan Chrome Extension
  startLocalServer(ipcMain)

  // Legacy Assistant — floating icon injected directly into browsers via osascript
  setLocalServerAccessors(() => getServerToken(), () => LOCAL_SERVER_PORT)
  initLegacyAssistant(ipcMain)

  // Subtitle window IPC handlers
  registerSubtitleHandlers(ipcMain, () => subtitleWindow, () => mainWindow, createSubtitleWindow)

  // System handlers — screen permission & openExternal
  registerSystemHandlers(ipcMain, () => mainWindow)

  // Auto-updater — check & install updates from GitHub Releases
  registerUpdaterHandlers(ipcMain, () => mainWindow)

  app.on('activate', () => {
    // Recreate the main window if it has been closed (X button on macOS).
    // We must NOT rely on `BrowserWindow.getAllWindows().length === 0` because
    // auxiliary windows (Quick Chat panel, Subtitle floating window) may still
    // be alive — that would prevent the main window from ever being reopened
    // via the dock icon.
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

})

// Every quit path (tray menu, updater, relaunch, OS shutdown, Cmd+Q) goes through
// `before-quit`; flag it so window close handlers stop hiding to the tray.
app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  // Unregister all global shortcuts before quitting
  globalShortcut.unregisterAll()
  stopLocalServer()
  stopManagedLocalAiRuntime()
  appTray?.destroy()
  appTray = null
})

app.on('window-all-closed', () => {
  // With a tray icon the app stays resident (reachable from the tray) even if the
  // main window was destroyed; without one nothing could reopen it, so quit.
  if (process.platform !== 'darwin' && !appTray) {
    app.quit()
  }
})

// Security: pin every webContents to the app's own renderer build (and the
// dev server origin in development). Covers direct navigation, server
// redirects and subframe navigation.
app.on('web-contents-created', (_event, contents) => {
  const blockUnlessAppUrl = (event: { url?: string; preventDefault: () => void }, positionalUrl?: string) => {
    const target = event.url ?? positionalUrl
    if (!isAllowedAppNavigation(target, navigationPolicy)) {
      event.preventDefault()
    }
  }

  contents.on('will-navigate', (event, navigationUrl) => blockUnlessAppUrl(event, navigationUrl))
  contents.on('will-redirect', (event, redirectUrl) => blockUnlessAppUrl(event, redirectUrl))
  contents.on('will-frame-navigate', (event) => blockUnlessAppUrl(event))

  // Main, Quick Chat and Subtitle windows all expose the privileged preload, so
  // none of them may open a child window; allowed http(s) links open externally.
  contents.setWindowOpenHandler(createWindowOpenHandler(openExternalSafely))
})
