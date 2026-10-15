# Viezan Chrome Extension

The Viezan Chrome/Chromium extension translates selected text through the Viezan desktop app running on your machine.

```text
Browser extension
  -> http://127.0.0.1:39875
  -> Viezan desktop app
  -> Local AI runtime or selected cloud provider
```

The extension is a browser client only. It does not store Gemini, Claude, OpenAI, Groq, Tavily or Brave API keys. Provider keys stay in the desktop app and are encrypted with Electron safeStorage.

## Requirements

- Viezan desktop app installed and running.
- A Browser Extension connection API key from **Viezan -> Settings -> Browser Extension**.
- Chrome, Arc, Brave, Edge or another Chromium browser that supports Manifest V3 extensions.

## Install From a Release

1. Download the Chrome Extension package from the Viezan release that matches your app version.
2. If the package is a `.zip`, unzip it first.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the extracted `chrome-extension/` folder.

## Local Development Install

1. Clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository's `chrome-extension/` folder.

## Connect to Viezan

1. Open the Viezan desktop app.
2. Go to **Settings -> Browser Extension**.
3. Copy or create a **Connection API Key**.
4. Open the extension **Options** page.
5. Paste the API key, choose your target language/provider and save.
6. Use **Test Connection** to verify that the desktop app is reachable.

If the test fails, confirm that Viezan is running and that local requests to `127.0.0.1:39875` are not blocked.

## Features

| Feature | How it works |
| --- | --- |
| Floating button | Select text on a page, then click the Viezan button near the selection. |
| Popup translate | Open the toolbar popup to type, paste or auto-fill selected text. |
| Keyboard shortcut | Press `Alt+T` on Windows/Linux or `Option+T` on macOS to translate the current selection. |
| Context menu | Right-click selected text and choose **Translate with Viezan**. |
| Translation style | Choose the same style options used by the desktop app where supported. |

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3 metadata, permissions and commands. |
| `background.js` | Service worker and context menu handling. |
| `local-bridge.js` | Shared local-server, app-config and TTS helpers used by all extension entrypoints. |
| `content.js` | Injected selected-text button and tooltip flow. |
| `content.css` | Styles for the injected page UI. |
| `popup.html` / `popup.js` | Toolbar quick-translate panel. |
| `options.html` / `options.js` | API key, language and provider settings. |
| `extension-ui.css` | Shared popup/options visual system. |
| `icons/` | Extension icon assets. |

## Security Model

- The extension talks only to the Viezan local server at `127.0.0.1:39875`.
- Every request sends the connection API key through the local auth header.
- The API key is generated in the desktop app, always starts with `sk-vie-`, and is stored in Chrome `storage.local`.
- Provider API keys are never stored in the extension.
- Webpage content is sent only when you trigger a translation.
- The desktop app decides whether translation uses Local AI or a configured cloud provider.

### Permission notes

- `host_permissions` keeps `<all_urls>` on purpose. The content script is declared for every page, and `background.js` re-injects it (`chrome.scripting`) into background and stale tabs after an extension reload or update. `activeTab` only covers the tab the user just invoked, so it cannot replace this for tabs the user has not clicked. Narrowing the list to the content-script `matches` would not reduce access because those are also `<all_urls>`. Removing it would disable automatic recovery, so users would have to refresh each open page after a reload.
- `web_accessible_resources` exposes only `icons/icon48.png` (the floating button and tooltip logo, loaded through `chrome.runtime.getURL`). It uses `use_dynamic_url`, so the resource URL is per-session and a website cannot probe a fixed extension ID to detect the install. Popup, options and toolbar icons are extension pages and do not need to be web-accessible.

## Known Limitations

- The selection button and tooltip run in the top frame only (`all_frames` is not enabled). Text selected inside an iframe (embedded editors, some documents, cross-origin widgets) shows no floating button. The toolbar popup and `Alt+T` also act on the top frame only. Enabling `all_frames` is not safe today: background messages (`Alt+T`, context menu, ping) are broadcast to every frame, so each frame would open its own tooltip, and positioning is relative to each frame's small viewport. Frame-aware messaging (`frameId` targeting) is needed first. Workaround: use the context menu or open the framed document in its own tab.

## Localization Policy

The desktop app owns the localized product experience. The Chrome Extension UI is intentionally English-only in this package; translate/provider output still follows the target language and model settings selected by the user.
