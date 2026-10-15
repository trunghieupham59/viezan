import { BrowserWindow, nativeTheme, screen } from 'electron'

export type HotkeyIndicatorState = 'busy' | 'copying' | 'translating' | 'done' | 'warning' | 'error'

// ── Constants ─────────────────────────────────────────────────────────────────
// The indicator is a standalone data: URL window, so it cannot load
// src/styles/tokens.css. Every literal value (colors, copy) is centralised here
// so the window stays consistent with the renderer palette and is easy to
// re-point at tokens when a main-process token bridge exists.

const INDICATOR_WIDTH = 320
const INDICATOR_HEIGHT = 76
const INDICATOR_TOP_MARGIN = 28
const DEFAULT_HIDE_DELAY_MS = 1_500
const TRANSPARENT_BACKGROUND = '#00000000'

/** Colors, keyed by CSS custom property name (without the leading `--`). */
const INDICATOR_COLORS = {
  light: {
    'vzn-surface': 'rgba(255, 255, 255, 0.94)',
    'vzn-text': '#18202b',
    'vzn-text-muted': '#5e6a78',
    'vzn-border': 'rgba(216, 224, 232, 0.92)',
    'vzn-accent': '#0f766e',
    'vzn-accent-soft': 'rgba(15, 118, 110, 0.20)',
    'vzn-success': '#15803d',
    'vzn-warning': '#b45309',
    'vzn-danger': '#be123c',
    'vzn-mark-text': '#ffffff',
    'vzn-shadow': '0 16px 44px rgba(15, 23, 32, 0.22), 0 2px 8px rgba(15, 23, 32, 0.10)',
  },
  dark: {
    'vzn-surface': 'rgba(24, 27, 33, 0.94)',
    'vzn-text': '#e8edf2',
    'vzn-text-muted': '#a4afbb',
    'vzn-border': 'rgba(72, 81, 95, 0.70)',
    'vzn-accent': '#2dd4bf',
    'vzn-accent-soft': 'rgba(45, 212, 191, 0.22)',
    'vzn-success': '#4ade80',
    'vzn-warning': '#fbbf24',
    'vzn-danger': '#fb7185',
    'vzn-mark-text': '#ffffff',
    'vzn-shadow': '0 16px 44px rgba(0, 0, 0, 0.34), 0 2px 8px rgba(0, 0, 0, 0.18)',
  },
} as const

export type HotkeyIndicatorLanguage = 'vi' | 'en' | 'ja'

interface IndicatorCopy {
  title: string
  messages: Record<HotkeyIndicatorState, string>
}

/** Indicator copy by UI language. Vietnamese stays the default (historic behavior). */
const INDICATOR_COPY: Record<HotkeyIndicatorLanguage, IndicatorCopy> = {
  vi: {
    title: 'Dịch nhanh',
    messages: {
      busy: 'Đang xử lý yêu cầu trước...',
      copying: 'Đang lấy văn bản đang chọn...',
      translating: 'Đang dịch và chuẩn bị thay thế...',
      done: 'Đã thay thế văn bản.',
      warning: 'Không có văn bản được chọn.',
      error: 'Không thể dịch văn bản.',
    },
  },
  en: {
    title: 'Quick translate',
    messages: {
      busy: 'Finishing the previous request...',
      copying: 'Reading the selected text...',
      translating: 'Translating and preparing to replace...',
      done: 'Text replaced.',
      warning: 'No text is selected.',
      error: 'Could not translate the text.',
    },
  },
  ja: {
    title: 'クイック翻訳',
    messages: {
      busy: '前のリクエストを処理しています...',
      copying: '選択したテキストを取得しています...',
      translating: '翻訳して置き換えを準備しています...',
      done: 'テキストを置き換えました。',
      warning: 'テキストが選択されていません。',
      error: 'テキストを翻訳できませんでした。',
    },
  },
}

const DEFAULT_INDICATOR_LANGUAGE: HotkeyIndicatorLanguage = 'vi'
const INDICATOR_MARKS: Record<HotkeyIndicatorState, string> = {
  busy: 'V',
  copying: 'V',
  translating: 'V',
  done: '✓',
  warning: '!',
  error: '!',
}
const IN_PROGRESS_STATES: ReadonlySet<HotkeyIndicatorState> = new Set(['copying', 'translating'])

export function isHotkeyIndicatorLanguage(value: unknown): value is HotkeyIndicatorLanguage {
  return value === 'vi' || value === 'en' || value === 'ja'
}

let indicatorLanguage: HotkeyIndicatorLanguage = DEFAULT_INDICATOR_LANGUAGE

/**
 * Select the indicator copy language. The main process has no UI-language
 * source of its own, so the renderer must push it (see `uiLanguage` on
 * `hotkey:update`).
 */
export function setHotkeyIndicatorLanguage(language: HotkeyIndicatorLanguage): void {
  indicatorLanguage = language
}

// ── Window state ──────────────────────────────────────────────────────────────

let indicatorWindow: BrowserWindow | null = null
let hideTimer: NodeJS.Timeout | null = null
/** State currently displayed (null when no live window). */
let currentState: HotkeyIndicatorState | null = null
/** Windows for which close() was requested but 'closed' has not fired yet. */
const closingWindows = new WeakSet<BrowserWindow>()

function cssVariables(palette: Record<string, string>): string {
  return Object.entries(palette).map(([name, value]) => `      --${name}: ${value};`).join('\n')
}

function buildIndicatorHtml(): string {
  const copy = INDICATOR_COPY[indicatorLanguage]
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    * { box-sizing: border-box; }
    :root {
${cssVariables(INDICATOR_COLORS.light)}
    }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
      user-select: none;
    }

    body {
      display: grid;
      place-items: center;
      padding: 8px;
    }

    .pill {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      color: var(--vzn-text);
      background: var(--vzn-surface);
      border: 1px solid var(--vzn-border);
      border-radius: 8px;
      box-shadow: var(--vzn-shadow);
      transform: translateY(8px) scale(0.98);
      opacity: 0;
      animation: enter 160ms ease-out forwards;
    }

    .mark {
      position: relative;
      width: 34px;
      height: 34px;
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      color: var(--vzn-mark-text);
      background: var(--vzn-accent);
      border-radius: 8px;
      font-size: 14px;
      font-weight: 800;
    }

    .mark::after {
      content: "";
      position: absolute;
      inset: -4px;
      border: 2px solid var(--vzn-accent-soft);
      border-radius: 11px;
      animation: pulse 900ms ease-out infinite;
    }

    .content {
      min-width: 0;
      display: grid;
      gap: 3px;
    }

    .title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.2;
    }

    .message {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--vzn-text-muted);
      font-size: 12px;
      line-height: 1.25;
    }

    body[data-state="done"] .mark {
      background: var(--vzn-success);
    }

    body[data-state="done"] .mark::after,
    body[data-state="warning"] .mark::after,
    body[data-state="error"] .mark::after {
      animation: none;
      opacity: 0.32;
    }

    body[data-state="warning"] .mark {
      background: var(--vzn-warning);
    }

    body[data-state="error"] .mark {
      background: var(--vzn-danger);
    }

    @keyframes enter {
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes pulse {
      0% {
        opacity: 0.64;
        transform: scale(0.84);
      }
      100% {
        opacity: 0;
        transform: scale(1.22);
      }
    }

    @media (prefers-color-scheme: dark) {
      :root {
${cssVariables(INDICATOR_COLORS.dark)}
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .pill, .mark::after {
        animation: none;
      }

      .pill {
        opacity: 1;
        transform: none;
      }
    }
  </style>
</head>
<body data-state="copying">
  <div class="pill" role="status" aria-live="polite">
    <div class="mark" id="mark">${INDICATOR_MARKS.copying}</div>
    <div class="content">
      <div class="title" id="title">${copy.title}</div>
      <div class="message" id="message">${copy.messages.copying}</div>
    </div>
  </div>
  <script>
    window.setHotkeyIndicator = function (state, title, message, mark) {
      document.body.dataset.state = state;
      document.getElementById('title').textContent = title;
      document.getElementById('message').textContent = message;
      document.getElementById('mark').textContent = mark;
    };
  </script>
</body>
</html>`
}

function createIndicatorWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    backgroundColor: TRANSPARENT_BACKGROUND,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.setIgnoreMouseEvents(true)
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildIndicatorHtml())}`)
  win.on('closed', () => {
    closingWindows.delete(win)
    // A replacement window may already be active — only clear our own reference.
    if (indicatorWindow === win) {
      indicatorWindow = null
      currentState = null
    }
  })

  return win
}

/** True when `win` can still be shown (exists, not destroyed, not mid-close). */
function isUsable(win: BrowserWindow | null): win is BrowserWindow {
  return Boolean(win) && !win?.isDestroyed() && !closingWindows.has(win as BrowserWindow)
}

function getIndicatorWindow(): BrowserWindow {
  if (!isUsable(indicatorWindow)) {
    indicatorWindow = createIndicatorWindow()
    currentState = null
  }
  return indicatorWindow
}

function closeIndicatorWindow(win: BrowserWindow): void {
  if (win.isDestroyed() || closingWindows.has(win)) return
  closingWindows.add(win)
  win.close()
  if (indicatorWindow === win) currentState = null
}

function positionIndicatorWindow(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(cursor)

  win.setBounds({
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    x: Math.round(workArea.x + workArea.width / 2 - INDICATOR_WIDTH / 2),
    y: Math.round(workArea.y + INDICATOR_TOP_MARGIN),
  })
}

function getIndicatorCopy(state: HotkeyIndicatorState, message?: string): { title: string; message: string; mark: string } {
  const copy = INDICATOR_COPY[indicatorLanguage]
  return { title: copy.title, message: message ?? copy.messages[state], mark: INDICATOR_MARKS[state] }
}

export function showHotkeyIndicator(
  state: HotkeyIndicatorState,
  message?: string,
  hideAfterMs?: number
): void {
  // A repeated press while a translation is in flight must not replace the live
  // copying/translating indicator, nor schedule a close that would hide it.
  if (state === 'busy' && currentState && IN_PROGRESS_STATES.has(currentState) && isUsable(indicatorWindow)) {
    return
  }

  const win = getIndicatorWindow()
  const copy = getIndicatorCopy(state, message)

  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }

  positionIndicatorWindow(win)
  currentState = state

  const prefersDark = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'

  const applyState = () => {
    if (win.isDestroyed()) return
    win.webContents.executeJavaScript(
      `document.documentElement.style.colorScheme = ${JSON.stringify(prefersDark)};` +
      `window.setHotkeyIndicator(${JSON.stringify(state)}, ${JSON.stringify(copy.title)}, ${JSON.stringify(copy.message)}, ${JSON.stringify(copy.mark)});`,
      true
    ).catch(() => undefined)
  }

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', applyState)
  } else {
    applyState()
  }

  win.showInactive()

  if (typeof hideAfterMs === 'number') {
    hideTimer = setTimeout(() => {
      closeIndicatorWindow(win)
      hideTimer = null
    }, hideAfterMs)
  }
}

export function hideHotkeyIndicator(delayMs = DEFAULT_HIDE_DELAY_MS): void {
  if (!isUsable(indicatorWindow)) return
  if (hideTimer) clearTimeout(hideTimer)
  const win = indicatorWindow
  hideTimer = setTimeout(() => {
    closeIndicatorWindow(win)
    hideTimer = null
  }, delayMs)
}
