import { spawn } from 'node:child_process'
import { createHash, timingSafeEqual } from 'node:crypto'
import { accessSync, createReadStream, createWriteStream, constants as fsConstants } from 'node:fs'
import { chmod, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { get } from 'node:https'
import path from 'node:path'
import type { BrowserWindow, IpcMain } from 'electron'
import { app, net, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { isAllowedExternalUrl } from './externalUrl'
import { isSenderWindow } from './senderGuard'

// ─── GitHub repo for update checks (macOS fallback) ────────────────────────
// On macOS we build with identity: null (unsigned). Squirrel.Mac — which
// electron-updater uses on macOS — requires a valid code signature and will
// always error on unsigned bundles.  Instead of going through Squirrel, we
// call the GitHub Releases API directly: check the latest tag, compare with
// the running version, then download the DMG directly and open it for the user.
const GITHUB_OWNER = 'trunghieupham59'
const GITHUB_REPO  = 'viezan'
const MAX_DOWNLOAD_REDIRECTS = 5

// ─── Error-detection patterns ──────────────────────────────────────────────
// A missing update metadata file (first release, 404 on GitHub) means "no
// update". Only an error that names a real latest*.yml file together with a
// not-found signal qualifies; any other HttpError / 404 is a genuine failure.
const UPDATE_METADATA_FILE_PATTERN = /latest[\w.-]*\.ya?ml/
const NOT_FOUND_SIGNAL_PATTERN = /\b404\b|cannot find|not found|enoent/

// Patterns that indicate a macOS code-signature validation failure.
// Kept as a safety-net for non-macOS builds or if the fallback is disabled.
const CODE_SIGNATURE_PATTERNS = [
  'code signature',
  'did not pass validation',
  'code object is not signed',
  'a sealed resource is missing',
  'shipit',
  'codesign',
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────
function errMsg(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).toLowerCase()
}

/** True only for a real "latest*.yml is missing" error from electron-updater. */
export function isMissingUpdateMetadataError(err: unknown): boolean {
  const msg = errMsg(err)
  return UPDATE_METADATA_FILE_PATTERN.test(msg) && NOT_FOUND_SIGNAL_PATTERN.test(msg)
}

function matchesPatterns(err: unknown, patterns: readonly string[]): boolean {
  const msg = errMsg(err)
  return patterns.some((p) => msg.includes(p))
}

/**
 * Simple semver comparison.
 * Returns true if `remote` is strictly newer than `current`.
 */
export function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const [rMaj = 0, rMin = 0, rPat = 0] = parse(remote)
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current)
  if (rMaj !== cMaj) return rMaj > cMaj
  if (rMin !== cMin) return rMin > cMin
  return rPat > cPat
}

interface GithubRelease {
  version: string
  /** Direct link to the best asset (DMG on macOS) or the release page. */
  downloadUrl: string
  /** Release asset filename when a platform installer was found. */
  assetName?: string
  /** Lowercase hex SHA-256 of the asset, from the API `digest` field (when well-formed). */
  sha256?: string
}

const SHA256_DIGEST_PATTERN = /^sha256:([0-9a-fA-F]{64})$/

/**
 * Parse a GitHub release-asset `digest` (`sha256:<64 hex>`) into a lowercase hex
 * string. Anything missing or malformed yields null (treated as "no digest").
 */
export function parseSha256Digest(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = SHA256_DIGEST_PATTERN.exec(value.trim())
  return match ? match[1].toLowerCase() : null
}

/** Constant-time comparison of two lowercase-normalized SHA-256 hex digests. */
export function sha256DigestsMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected.trim().toLowerCase(), 'hex')
  const b = Buffer.from(actual.trim().toLowerCase(), 'hex')
  return a.length === 32 && a.length === b.length && timingSafeEqual(a, b)
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

function githubLatestReleasePage(): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
}

function githubReleaseApiUrl(): string {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
}

function githubDownloadUrl(tagName: string, assetName: string): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tagName}/${assetName}`
}

export function parseLatestGithubTagFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    const expectedPrefix = `/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/`.toLowerCase()
    const pathname = url.pathname.toLowerCase()
    if (url.hostname.toLowerCase() !== 'github.com' || !pathname.startsWith(expectedPrefix)) {
      return null
    }
    const tag = decodeURIComponent(url.pathname.slice(expectedPrefix.length)).trim()
    return tag || null
  } catch {
    return null
  }
}

export function buildMacGithubReleaseFromTag(tagName: string, arch: NodeJS.Architecture = process.arch): GithubRelease | null {
  const tag = tagName.trim()
  const version = tag.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) return null

  const assetName = `Viezan-${version}-${arch}.dmg`
  return {
    version,
    downloadUrl: githubDownloadUrl(tag.startsWith('v') ? tag : `v${tag}`, assetName),
    assetName,
  }
}

function pickGithubReleaseAsset(
  assets: Array<{ name: string; browser_download_url: string; digest?: string | null }>,
  version: string,
): GithubRelease {
  let downloadUrl = githubLatestReleasePage()

  if (process.platform === 'darwin') {
    const arch = process.arch // 'arm64' | 'x64'
    // Prefer arch-specific DMG, then any DMG, then the release page.
    const dmg =
      assets.find(a => a.name.endsWith('.dmg') && a.name.includes(arch)) ??
      assets.find(a => a.name.endsWith('.dmg'))
    if (dmg) downloadUrl = dmg.browser_download_url
    const sha256 = parseSha256Digest(dmg?.digest) ?? undefined
    return { version, downloadUrl, assetName: dmg?.name, ...(sha256 ? { sha256 } : {}) }
  } else if (process.platform === 'win32') {
    const exe = assets.find(a => a.name.endsWith('.exe'))
    if (exe) downloadUrl = exe.browser_download_url
  } else {
    const appImg = assets.find(a => a.name.endsWith('.AppImage'))
    if (appImg) downloadUrl = appImg.browser_download_url
  }

  return { version, downloadUrl }
}

type GithubFetchInit = {
  method?: 'GET' | 'HEAD'
  redirect?: 'follow' | 'manual' | 'error'
  headers?: Record<string, string>
}

async function githubFetch(url: string, init: GithubFetchInit = {}) {
  return net.fetch(url, {
    ...init,
    headers: {
      'User-Agent': `Viezan/${app.getVersion()}`,
      Accept: 'application/vnd.github.v3+json',
      ...init.headers,
    },
  })
}

/**
 * Fetch the latest release from GitHub Releases API.
 * Picks the most appropriate asset for the running platform/arch.
 */
async function fetchLatestGithubReleaseFromApi(): Promise<GithubRelease | null> {
  const response = await githubFetch(githubReleaseApiUrl())

  if (!response.ok) return null

  const data = await response.json() as {
    tag_name: string
    html_url: string
    assets: Array<{ name: string; browser_download_url: string; digest?: string | null }>
  }

  const version = data.tag_name.replace(/^v/, '')
  return pickGithubReleaseAsset(data.assets, version)
}

async function hasDownloadAsset(url: string): Promise<boolean> {
  try {
    const response = await githubFetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { Accept: 'application/octet-stream' },
    })
    return response.ok
  } catch {
    return false
  }
}

async function fetchLatestGithubReleaseFromRedirect(): Promise<GithubRelease | null> {
  const response = await githubFetch(githubLatestReleasePage(), {
    redirect: 'follow',
    headers: { Accept: 'text/html,application/xhtml+xml' },
  })

  if (!response.ok) {
    throw new Error(`GitHub latest release lookup failed with HTTP ${response.status}`)
  }

  const tagName = parseLatestGithubTagFromUrl(response.url)
  if (!tagName) return null

  const release = buildMacGithubReleaseFromTag(tagName)
  if (!release) return null

  if (!(await hasDownloadAsset(release.downloadUrl))) {
    throw new Error(`No macOS DMG asset found for ${tagName}`)
  }

  return release
}

async function fetchLatestGithubRelease(): Promise<GithubRelease | null> {
  const release = await fetchLatestGithubReleaseFromApi().catch(() => null)
  if (release?.assetName || process.platform !== 'darwin') return release

  // The REST API is unauthenticated in the installed app and can hit GitHub's
  // low public rate limit. The public /releases/latest redirect is enough to
  // discover the latest tag, then our deterministic artifact name gives the DMG.
  return fetchLatestGithubReleaseFromRedirect()
}

function sanitizeDownloadName(name: string, version: string): string {
  const fallback = `Viezan-${version}-${process.arch}.dmg`
  const clean = name.trim().replace(/[/\\?%*:|"<>]/g, '-')
  return clean.endsWith('.dmg') ? clean : fallback
}

function isTrustedGithubAssetUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    const pathname = url.pathname.toLowerCase()
    return (
      url.protocol === 'https:' &&
      url.hostname.toLowerCase() === 'github.com' &&
      pathname.startsWith(`/${GITHUB_OWNER.toLowerCase()}/${GITHUB_REPO.toLowerCase()}/releases/download/`) &&
      pathname.endsWith('.dmg')
    )
  } catch {
    return false
  }
}

/**
 * Update downloads may only follow redirects to https GitHub hosts
 * (github.com and the *.githubusercontent.com release-asset CDNs).
 */
export function isTrustedGithubDownloadUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    const host = url.hostname.toLowerCase()
    return host === 'github.com' || host === 'githubusercontent.com' || host.endsWith('.githubusercontent.com')
  } catch {
    return false
  }
}

interface DownloadedFileInfo {
  /** Lowercase hex SHA-256 of the bytes written to disk (computed while streaming). */
  sha256: string
  /** Number of bytes received. */
  size: number
}

async function downloadFile(
  url: string,
  destination: string,
  onProgress: (progress: {
    percent: number
    bytesPerSecond: number
    transferred: number
    total: number
  }) => void,
  redirectsLeft = MAX_DOWNLOAD_REDIRECTS,
): Promise<DownloadedFileInfo> {
  if (!isTrustedGithubDownloadUrl(url)) {
    throw new Error('Refusing to download from an untrusted host')
  }
  return new Promise<DownloadedFileInfo>((resolve, reject) => {
    const startedAt = Date.now()
    const request = get(url, {
      headers: {
        'User-Agent': `Viezan/${app.getVersion()}`,
        Accept: 'application/octet-stream',
      },
    }, (response) => {
      const status = response.statusCode ?? 0
      const location = response.headers.location

      if (status >= 300 && status < 400 && location) {
        response.resume()
        if (redirectsLeft <= 0) {
          reject(new Error('Too many redirects while downloading update'))
          return
        }
        let redirectedUrl: string
        try {
          redirectedUrl = new URL(location, url).toString()
        } catch {
          reject(new Error('Invalid redirect while downloading update'))
          return
        }
        if (!isTrustedGithubDownloadUrl(redirectedUrl)) {
          reject(new Error('Refusing to follow redirect to an untrusted download host'))
          return
        }
        downloadFile(redirectedUrl, destination, onProgress, redirectsLeft - 1).then(resolve, reject)
        return
      }

      if (status < 200 || status >= 300) {
        response.resume()
        reject(new Error(`Download failed with HTTP ${status}`))
        return
      }

      const total = Number.parseInt(String(response.headers['content-length'] ?? '0'), 10) || 0
      let transferred = 0
      const file = createWriteStream(destination)
      const hash = createHash('sha256')

      response.on('data', (chunk: Buffer) => {
        hash.update(chunk)
        transferred += chunk.length
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001)
        onProgress({
          percent: total ? Math.min(100, Math.round((transferred / total) * 100)) : 0,
          bytesPerSecond: Math.round(transferred / elapsedSeconds),
          transferred,
          total,
        })
      })

      response.pipe(file)
      file.on('finish', () => file.close(() => resolve({ sha256: hash.digest('hex'), size: transferred })))
      file.on('error', reject)
    })

    request.on('error', reject)
  })
}

/**
 * Derive the running .app bundle path from the executable path
 * (e.g. /Applications/Viezan.app/Contents/MacOS/Viezan -> /Applications/Viezan.app).
 * Returns null when the executable is not inside an .app bundle.
 */
export function resolveMacBundlePath(exePath: string): string | null {
  const marker = '.app/Contents/MacOS/'
  const index = exePath.indexOf(marker)
  if (index <= 0 || !exePath.startsWith('/')) return null
  const bundle = exePath.slice(0, index + '.app'.length)
  // Never target a bare ".app" or a root-level path component without a name.
  return path.posix.basename(bundle).length > '.app'.length ? bundle : null
}

const DEFAULT_MAC_APP_PATH = '/Applications/Viezan.app'

/**
 * Pick the bundle path the install helper should replace. The running bundle is
 * only usable when it lives in a normal, writable location: Gatekeeper
 * translocation (/AppTranslocation/) and mounted disk images (/Volumes/) are
 * read-only, and so is any bundle whose parent directory is not writable. In all
 * those cases (or when the bundle cannot be derived) fall back to /Applications.
 */
export function selectMacInstallDestination(
  exePath: string,
  canWrite: (dir: string) => boolean = (dir) => {
    try {
      accessSync(dir, fsConstants.W_OK)
      return true
    } catch {
      return false
    }
  },
): string {
  const bundle = resolveMacBundlePath(exePath)
  if (!bundle) return DEFAULT_MAC_APP_PATH
  if (bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) return DEFAULT_MAC_APP_PATH
  if (!canWrite(path.posix.dirname(bundle))) return DEFAULT_MAC_APP_PATH
  return bundle
}

export function buildMacInstallScript(): string {
  return `#!/bin/zsh
set -euo pipefail

DMG_PATH="$1"
APP_PID="$2"
DEST_PATH="\${3:-${DEFAULT_MAC_APP_PATH}}"
APP_NAME="Viezan.app"
SCRIPT_PATH="$0"
LOG_PATH="$HOME/Library/Logs/Viezan-updater.log"
MOUNT_DIR="$(mktemp -d /tmp/viezan-update.XXXXXX)"
DEST_DIR="$(dirname "$DEST_PATH")"
STAGE_PATH="$DEST_DIR/.Viezan-update-$$.app"
BACKUP_PATH="$DEST_DIR/.Viezan-backup-$$.app"

mkdir -p "$(dirname "$LOG_PATH")"
exec >>"$LOG_PATH" 2>&1

# Always runs on exit (success or failure): unmount, drop temp files and this
# script. The backup is only removed once an app is in place at the destination
# (the new one, or the restored old one), so it is never the last copy.
cleanup() {
  hdiutil detach "$MOUNT_DIR" -quiet || true
  rm -rf "$MOUNT_DIR" "$STAGE_PATH" || true
  if [ -e "$DEST_PATH" ]; then
    rm -rf "$BACKUP_PATH" || true
  fi
  rm -f "$SCRIPT_PATH" || true
}

# Report the failure and reopen the previous app so the user is never left
# with nothing running.
fail() {
  local message="$1"
  echo "[$(date)] $message"
  osascript -e "display alert \\"Viezan update failed\\" message \\"$message. See ~/Library/Logs/Viezan-updater.log for details.\\"" || true
  if [ -e "$DEST_PATH" ]; then
    open "$DEST_PATH" || true
  fi
  exit 1
}

trap cleanup EXIT

echo "[$(date)] Installing Viezan update from $DMG_PATH into $DEST_PATH"
hdiutil attach "$DMG_PATH" -nobrowse -quiet -mountpoint "$MOUNT_DIR" || fail "Could not mount the downloaded DMG"

SOURCE_PATH="$MOUNT_DIR/$APP_NAME"
if [ ! -d "$SOURCE_PATH" ]; then
  fail "The downloaded DMG does not contain $APP_NAME"
fi

for _ in {1..80}; do
  if ! kill -0 "$APP_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if kill -0 "$APP_PID" >/dev/null 2>&1; then
  fail "The running Viezan app did not quit"
fi

# Copy the new app next to the destination first so a failed copy never
# leaves the user without an app, then swap it in with a backup.
rm -rf "$STAGE_PATH" "$BACKUP_PATH"
ditto "$SOURCE_PATH" "$STAGE_PATH" || fail "Could not copy the new Viezan app"
xattr -dr com.apple.quarantine "$STAGE_PATH" || true

if [ -e "$DEST_PATH" ]; then
  mv "$DEST_PATH" "$BACKUP_PATH" || fail "Could not back up the old Viezan app"
fi

if ! mv "$STAGE_PATH" "$DEST_PATH"; then
  if [ -e "$BACKUP_PATH" ]; then
    mv "$BACKUP_PATH" "$DEST_PATH" || true
  fi
  fail "Could not install the new Viezan app"
fi

# The new app is installed. A failed relaunch must not roll back or skip cleanup.
if ! open "$DEST_PATH"; then
  echo "[$(date)] Viezan was updated but could not be reopened automatically"
  osascript -e "display alert \\"Viezan updated\\" message \\"Please open Viezan manually.\\"" || true
fi

echo "[$(date)] Viezan update installed"
`
}

async function runMacInstallHelper(dmgPath: string): Promise<void> {
  const scriptPath = path.join(app.getPath('temp'), `viezan-install-${Date.now()}.zsh`)
  await writeFile(scriptPath, buildMacInstallScript(), { encoding: 'utf8', mode: 0o700 })
  await chmod(scriptPath, 0o700)

  const destPath = selectMacInstallDestination(app.getPath('exe'))

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('/bin/zsh', [scriptPath, dmgPath, String(process.pid), destPath], {
        detached: true,
        stdio: 'ignore',
      })
      child.once('error', reject)
      child.once('spawn', () => {
        child.unref()
        resolve()
      })
    })
  } catch (err) {
    await rm(scriptPath, { force: true }).catch(() => undefined)
    throw err
  }

  // Only quit once the helper is really running.
  app.quit()
}

// ─── Types ─────────────────────────────────────────────────────────────────
export type UpdaterStatus =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'available';     version: string; downloadUrl?: string }
  | { type: 'not-available'; version: string }
  | { type: 'downloading';   percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { type: 'downloaded';    version: string; installMode?: 'restart' | 'open-installer' }
  | { type: 'error-codesign' }
  | { type: 'error';         error: string }

interface DownloadedInstaller {
  path: string
  size: number
  /** Lowercase hex SHA-256 of the file as downloaded. */
  sha256: string
  /** True when the hash matched a digest published by GitHub. */
  verified: boolean
}

// ─── Registration ──────────────────────────────────────────────────────────
export function registerUpdaterHandlers(
  ipc: IpcMain,
  getMainWindow: () => BrowserWindow | null,
) {
  const isDev = !app.isPackaged

  // On macOS, Squirrel.Mac requires code signing.  Since we ship without a
  // Developer ID certificate (identity: null in package.json), we bypass
  // Squirrel entirely and use the GitHub Releases API directly.
  const useMacFallback = process.platform === 'darwin'
  let latestMacRelease: GithubRelease | null = null
  // The only installer this session may open or install: the file produced by
  // the last successful (and, when a digest was published, verified) download.
  let downloadedMacInstaller: DownloadedInstaller | null = null

  autoUpdater.autoDownload         = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger               = null

  const push = (payload: UpdaterStatus) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:status', payload)
    }
  }

  /** Only the main window may drive the updater (relevant for install/open actions). */
  const isTrusted = (event: Parameters<typeof isSenderWindow>[0]) => isSenderWindow(event, getMainWindow)
  const UNTRUSTED = { success: false, error: 'Untrusted sender' } as const

  // electron-updater emits 'error' AND rejects the awaited call for the same
  // failure. Report each failure to the UI once per operation so it never sees
  // a contradictory not-available followed by error.
  let errorReported = false
  const beginOperation = () => {
    errorReported = false
  }
  const reportUpdaterError = (err: unknown) => {
    if (errorReported) return
    errorReported = true
    if (isMissingUpdateMetadataError(err)) {
      // Metadata file not found → treat as "up to date"
      push({ type: 'not-available', version: app.getVersion() })
    } else if (matchesPatterns(err, CODE_SIGNATURE_PATTERNS)) {
      // Safety net — should not reach here on macOS because we use the
      // GitHub API fallback above, but kept for non-macOS edge cases.
      push({ type: 'error-codesign' })
    } else {
      push({ type: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── electron-updater events (Windows / Linux only) ──────────────────────
  autoUpdater.on('checking-for-update', () => push({ type: 'checking' }))

  autoUpdater.on('update-available', (info) =>
    push({ type: 'available', version: info.version })
  )

  autoUpdater.on('update-not-available', (info) =>
    push({ type: 'not-available', version: info.version })
  )

  autoUpdater.on('download-progress', (progress) =>
    push({
      type: 'downloading',
      percent: Math.round(progress.percent),
      bytesPerSecond: Math.round(progress.bytesPerSecond),
      transferred: progress.transferred,
      total: progress.total,
    })
  )

  autoUpdater.on('update-downloaded', (info) =>
    push({ type: 'downloaded', version: info.version })
  )

  autoUpdater.on('error', (err) => reportUpdaterError(err))

  // ── macOS download (single in-flight) ───────────────────────────────────
  type MacDownloadResult = {
    success: boolean
    error?: string
    errorCode?: 'CHECKSUM_MISMATCH'
    filePath?: string
    /** True when the file matched the SHA-256 published by GitHub; false when none was published. */
    verified?: boolean
  }
  let macDownloadInFlight: Promise<MacDownloadResult> | null = null

  const downloadMacUpdate = async (): Promise<MacDownloadResult> => {
    // Any earlier download is about to be overwritten: it is no longer installable.
    downloadedMacInstaller = null
    try {
      const release = latestMacRelease ?? await fetchLatestGithubRelease()
      if (!release || !isNewerVersion(release.version, app.getVersion())) {
        push({ type: 'not-available', version: app.getVersion() })
        return { success: false, error: 'No update available' }
      }
      if (!release.assetName || !isTrustedGithubAssetUrl(release.downloadUrl)) {
        return { success: false, error: 'No trusted macOS DMG asset found' }
      }

      const filename = sanitizeDownloadName(release.assetName, release.version)
      const downloadsDir = app.getPath('downloads')
      await mkdir(downloadsDir, { recursive: true })
      const destination = path.join(downloadsDir, filename)

      push({ type: 'downloading', percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 })
      let downloaded: DownloadedFileInfo
      try {
        downloaded = await downloadFile(release.downloadUrl, destination, (progress) => push({ type: 'downloading', ...progress }))
      } catch (err) {
        await rm(destination, { force: true }).catch(() => undefined)
        throw err
      }

      let verified = false
      if (release.sha256) {
        if (!sha256DigestsMatch(release.sha256, downloaded.sha256)) {
          await rm(destination, { force: true }).catch(() => undefined)
          const error = 'Update download failed integrity verification (SHA-256 mismatch); the file was discarded'
          push({ type: 'error', error })
          return { success: false, error, errorCode: 'CHECKSUM_MISMATCH' }
        }
        verified = true
      } else {
        console.warn('[updater] No SHA-256 digest published for the update asset; download is unverified')
      }

      downloadedMacInstaller = { path: destination, size: downloaded.size, sha256: downloaded.sha256, verified }
      push({ type: 'downloaded', version: release.version, installMode: 'restart' })
      return { success: true, filePath: destination, verified }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      push({ type: 'error', error: msg })
      return { success: false, error: msg }
    }
  }

  /**
   * Resolve the installer path for install/open actions. Only the file produced
   * by this session's download is allowed, and it is re-checked against the size
   * and SHA-256 recorded at download time so a swap in the Downloads folder
   * between download and install is refused.
   */
  const resolveDownloadedInstaller = async (
    requestedPath?: unknown,
  ): Promise<{ ok: true; path: string } | { ok: false; error: string }> => {
    const record = downloadedMacInstaller
    if (!record) return { ok: false, error: 'No downloaded installer found' }
    if (requestedPath !== undefined && requestedPath !== record.path) {
      return { ok: false, error: 'Installer path does not match the update downloaded in this session' }
    }
    try {
      const info = await stat(record.path)
      if (!info.isFile() || info.size !== record.size || !sha256DigestsMatch(record.sha256, await sha256File(record.path))) {
        throw new Error('changed')
      }
    } catch {
      downloadedMacInstaller = null
      await rm(record.path, { force: true }).catch(() => undefined)
      return { ok: false, error: 'The downloaded installer is missing or was modified; please download the update again' }
    }
    return { ok: true, path: record.path }
  }

  // ── IPC handlers ────────────────────────────────────────────────────────

  ipc.handle('updater:check', async (event) => {
    if (!isTrusted(event)) return UNTRUSTED
    if (isDev) {
      setTimeout(() => push({ type: 'not-available', version: app.getVersion() }), 800)
      return { success: true }
    }

    // ── macOS: GitHub Releases API (bypasses Squirrel code-signing check) ──
    if (useMacFallback) {
      push({ type: 'checking' })
      try {
        const release = await fetchLatestGithubRelease()
        if (!release) {
          push({ type: 'not-available', version: app.getVersion() })
          return { success: true }
        }
        if (isNewerVersion(release.version, app.getVersion())) {
          latestMacRelease = release
          push({ type: 'available', version: release.version, downloadUrl: release.downloadUrl })
        } else {
          latestMacRelease = null
          push({ type: 'not-available', version: app.getVersion() })
        }
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        push({ type: 'error', error: msg })
        return { success: false, error: msg }
      }
    }

    // ── Windows / Linux: electron-updater (Squirrel / NSIS) ────────────────
    beginOperation()
    try {
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (err) {
      reportUpdaterError(err)
      // A missing latest*.yml is "no update", not a failed check.
      if (isMissingUpdateMetadataError(err)) return { success: true }
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  })

  ipc.handle('updater:download', async (event) => {
    if (!isTrusted(event)) return UNTRUSTED
    if (isDev)          return { success: false, error: 'Not available in development mode' }
    if (useMacFallback) {
      // Concurrent calls share one download instead of racing on the same file.
      if (!macDownloadInFlight) {
        macDownloadInFlight = downloadMacUpdate().finally(() => {
          macDownloadInFlight = null
        })
      }
      return macDownloadInFlight
    }
    beginOperation()
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      reportUpdaterError(err)
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  })

  ipc.handle('updater:install', async (event, requestedPath?: unknown) => {
    if (!isTrusted(event)) return UNTRUSTED
    if (isDev)          return { success: false, error: 'Not available in development mode' }
    if (useMacFallback) {
      const installer = await resolveDownloadedInstaller(requestedPath)
      if (!installer.ok) return { success: false, error: installer.error }
      try {
        await runMacInstallHelper(installer.path)
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        push({ type: 'error', error: msg })
        return { success: false, error: msg }
      }
    }
    autoUpdater.quitAndInstall(false, true)
    return { success: true }
  })

  ipc.handle('updater:openInstaller', async (event) => {
    if (!isTrusted(event)) return UNTRUSTED
    const installer = await resolveDownloadedInstaller()
    if (!installer.ok) return { success: false, error: installer.error }
    const openError = await shell.openPath(installer.path)
    if (openError) {
      push({ type: 'error', error: openError })
      return { success: false, error: openError }
    }
    return { success: true }
  })

  ipc.handle('updater:getVersion', () => {
    return { version: app.getVersion() }
  })

  /**
   * Open the download URL in the default system browser.
   * Used on macOS where we can't silently install without code signing.
   * Optionally accepts a specific URL; falls back to the GitHub releases page.
   */
  ipc.handle('updater:openDownload', async (event, url?: string) => {
    if (!isTrusted(event)) return UNTRUSTED
    const target = url ?? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
    if (!isAllowedExternalUrl(target)) {
      return { success: false, error: 'Blocked external URL' }
    }
    try {
      await shell.openExternal(target)
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[updater] openExternal failed:', err)
      return { success: false, error: msg }
    }
  })
}
