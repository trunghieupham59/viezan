import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import {
  GitHubIcon, KeyIcon,
  PlusIcon, RefreshIcon, SpinnerIcon, TrashIcon, XIcon,
} from '../../components/ui/icons'
import { SettingsFormActions } from '../../components/ui/SettingsFormActions'
import { TokenTtlPicker } from '../../components/ui/TokenTtlPicker'
import { GITHUB_RELEASES_URL } from '../../constants/urls'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import { formatDate, tpl } from '../../utils/tpl'

// ── Token-scoped constants ────────────────────────────────────────────────────

/** Default TTL (days) pre-selected when opening the create-token form. */
const DEFAULT_TOKEN_TTL_DAYS = 30

/** Days remaining below which the expiry badge switches to the warning state. */
const TOKEN_EXPIRY_WARNING_DAYS = 7

/** Milliseconds in one day — used to convert expiry timestamps to days. */
const ONE_DAY_MS = 1_000 * 60 * 60 * 24

/** How long (ms) the "Copied!" badge stays visible after copying a token. */
const TOKEN_COPY_FEEDBACK_MS = 2_000

/** Prefix used when auto-generating a default token name. */
const DEFAULT_TOKEN_NAME_PREFIX = 'Chrome Extension'
/** Toast owner keys so repeated failures replace each other instead of stacking. */
const TOKEN_ACTION_ERROR_KEY = 'settings-ext-token-action'
const TOKEN_LIST_ERROR_KEY = 'settings-ext-token-list'

// ── Types ─────────────────────────────────────────────────────────────────────

type ExtTokenInfo = { id: string; name: string; createdAt: number; expiresAt: number }

// ── Main component ────────────────────────────────────────────────────────────

export function BrowserIntegrationSection() {
  const locale = useAppStore((state) => state.locale)
  const t = useT()

  // ── Extension token state ──────────────────────────────────────────────────
  const [extTokens, setExtTokens] = useState<ExtTokenInfo[]>([])
  const [extTokensLoading, setExtTokensLoading] = useState(false)
  const [extTokensError, setExtTokensError] = useState('')
  const [revealedToken, setRevealedToken] = useState<{ token: string; name: string; expiresAt: number } | null>(null)
  const [revealedCopied, setRevealedCopied] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTokenName, setNewTokenName] = useState('')
  const [newTokenTtl, setNewTokenTtl] = useState(DEFAULT_TOKEN_TTL_DAYS)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const notify = useNotificationStore((state) => state.notify)
  const dismissNotification = useNotificationStore((state) => state.dismiss)
  /** Token create/delete/regenerate failures go to the toast stack. */
  const reportTokenActionError = useCallback((message: string) => {
    notify({ key: TOKEN_ACTION_ERROR_KEY, tone: 'error', message })
  }, [notify])

  const defaultTokenName = () => {
    const today = formatDate(Date.now(), locale)
    return `${DEFAULT_TOKEN_NAME_PREFIX} - ${today}`
  }

  // ── D-2: Token request helper — removes guard+try/catch duplication ────────
  async function tokenRequest<T>(fn: () => Promise<T>): Promise<T | null> {
    if (!window.api?.localServer) return null
    dismissNotification(TOKEN_ACTION_ERROR_KEY)
    try {
      return await fn()
    } catch (e) {
      reportTokenActionError(e instanceof Error ? e.message : String(e))
      return null
    }
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadTokenList = useCallback(async () => {
    if (!window.api?.localServer) {
      setExtTokensError(t.settings_token_error_connect)
      return
    }
    setExtTokensLoading(true)
    setExtTokensError('')
    try {
      const res = await window.api.localServer.listTokens()
      if (res?.success) {
        setExtTokens(res.tokens ?? [])
      } else {
        setExtTokensError(t.settings_token_error_load)
      }
    } catch (e) {
      setExtTokensError(`${t.settings_token_ipc_error} ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExtTokensLoading(false)
    }
  }, [t])

  useEffect(() => { loadTokenList() }, [loadTokenList])

  // A failed list load is reported as a toast with a retry path; the state itself
  // still gates the empty-state copy below.
  useEffect(() => {
    if (!extTokensError) {
      dismissNotification(TOKEN_LIST_ERROR_KEY)
      return
    }
    notify({
      key: TOKEN_LIST_ERROR_KEY,
      tone: 'error',
      message: extTokensError,
      actions: [{ label: t.settings_token_retry, onClick: () => void loadTokenList() }],
    })
  }, [extTokensError, loadTokenList, notify, dismissNotification, t])

  // ── Token mutation handlers ────────────────────────────────────────────────

  const handleCreateToken = async () => {
    setCreating(true)
    const res = await tokenRequest(() =>
      window.api.localServer.createToken({
        name: newTokenName.trim() || defaultTokenName(),
        ttlDays: newTokenTtl,
      })
    )
    if (res?.success && res.token) {
      setRevealedToken({ token: res.token, name: res.name ?? '', expiresAt: res.expiresAt ?? 0 })
      setRevealedCopied(false)
      setShowCreateForm(false)
      setNewTokenName('')
      setNewTokenTtl(DEFAULT_TOKEN_TTL_DAYS)
      await loadTokenList()
    } else if (res && !res.success) {
      reportTokenActionError(res.error ?? t.settings_token_error_create)
    }
    setCreating(false)
  }

  const handleDeleteToken = async (id: string) => {
    setDeletingId(id)
    const res = await tokenRequest(() =>
      window.api.localServer.deleteToken({ id })
    )
    if (res) {
      setExtTokens(prev => prev.filter(tk => tk.id !== id))
      if (revealedToken) setRevealedToken(null)
    }
    setDeletingId(null)
  }

  const handleRegenerateToken = async (id: string) => {
    setRegeneratingId(id)
    const res = await tokenRequest(() =>
      window.api.localServer.regenerateToken({ id })
    )
    if (res?.success && res.token) {
      setRevealedToken({ token: res.token, name: res.name ?? '', expiresAt: res.expiresAt ?? 0 })
      setRevealedCopied(false)
      await loadTokenList()
    } else if (res && !res.success) {
      reportTokenActionError(res.error ?? t.settings_token_error_regenerate)
    }
    setRegeneratingId(null)
  }

  const handleCopyRevealed = async () => {
    if (!revealedToken) return
    await navigator.clipboard.writeText(revealedToken.token)
    setRevealedCopied(true)
    setTimeout(() => setRevealedCopied(false), TOKEN_COPY_FEEDBACK_MS)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="space-y-3">
      <div>
        <h2 className="settings-section-title">{t.settings_extension_section}</h2>
        <p className="settings-section-desc mt-1">{t.settings_legacy_section_desc}</p>
      </div>

      {/* ── Chrome Extension token card ── */}
      <div className="card divide-y divide-gray-100 dark:divide-gray-700">

        <div className="px-4 pt-3 pb-1">
          <p className="ui-kicker">{t.settings_chrome_extension_label}</p>
        </div>

        {/* Download & Install */}
        <div className="px-4 py-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_extension_download_title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_extension_download_desc}</p>
          </div>
          <div className="space-y-1.5">
            {([
              t.settings_extension_install_step1,
              t.settings_extension_install_step2,
              t.settings_extension_install_step3,
              t.settings_extension_install_step4,
            ] as const).map((step, i) => (
              <div key={step} className="flex items-start gap-2.5">
                <span className="ui-index-dot mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-gray-600 dark:text-gray-400">{step}</p>
              </div>
            ))}
          </div>
          {/* H-1 + H-2: use GitHubIcon component + GITHUB_RELEASES_URL constant */}
          <Button
            size="md"
            shape="rect"
            variant="primary"
            appearance="solid"
            type="button"
            onClick={() => window.api?.openExternal(GITHUB_RELEASES_URL)}
          >
            <GitHubIcon />
            {t.settings_extension_download_btn}
          </Button>
        </div>

        <div className="px-4 py-3.5 space-y-3">
          {/* Header: Manage tokens + Create button */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_token_manage}</p>
            <Button
              size="md"
              shape="rect"
              variant="neutral"
              appearance="outline"
              type="button"
              onClick={() => setShowCreateForm(v => !v)}
            >
              <PlusIcon />
              {t.settings_token_create}
            </Button>
          </div>

          {/* Create form */}
          {showCreateForm && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-3 border border-gray-200 dark:border-gray-700">
              <div className="space-y-1">
                <label htmlFor="new-token-name" className="text-xs font-medium text-gray-700 dark:text-gray-300">{t.settings_token_name_label}</label>
                <input
                  id="new-token-name"
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder={defaultTokenName()}
                  className="w-full text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600
                             rounded-lg px-3 py-2 outline-none focus:border-gray-400 dark:focus:border-gray-600
                             text-gray-800 dark:text-gray-200 placeholder-gray-400"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{t.settings_token_ttl_label}</p>
                <TokenTtlPicker
                  value={newTokenTtl}
                  onChange={setNewTokenTtl}
                  options={[
                    { days: 7,   label: t.settings_token_ttl_7 },
                    { days: 30,  label: t.settings_token_ttl_30 },
                    { days: 90,  label: t.settings_token_ttl_90 },
                    { days: 365, label: t.settings_token_ttl_365 },
                  ]}
                />
              </div>
              <SettingsFormActions
                onCancel={() => {
                  setShowCreateForm(false)
                  setNewTokenName('')
                  setNewTokenTtl(DEFAULT_TOKEN_TTL_DAYS)
                }}
                onSubmit={handleCreateToken}
                cancelLabel={t.settings_token_cancel}
                submitLabel={t.settings_token_generate}
                submitting={creating}
                topPadding
              />
            </div>
          )}

          {/* One-time token reveal */}
          {revealedToken && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/30 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <KeyIcon className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    {tpl(t.settings_token_reveal_title, { name: revealedToken.name })}
                  </p>
                  <p className="ui-meta mt-0.5 text-gray-600 dark:text-gray-400">
                    {t.settings_token_reveal_body}
                  </p>
                </div>
                <Button
                  size="md"
                  shape="icon"
                  variant="neutral"
                  appearance="ghost"
                  aria-label={t.settings_token_close}
                  type="button"
                  onClick={() => setRevealedToken(null)}
                  className="flex-shrink-0"
                  title={t.settings_token_close}
                >
                  <XIcon />
                </Button>
              </div>
              <div className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-800">
                <code className="text-xs text-gray-800 dark:text-gray-200 font-mono break-all flex-1 select-all">
                  {revealedToken.token}
                </code>
                <Button
                  size="md"
                  shape="rect"
                  variant={revealedCopied ? 'primary' : 'neutral'}
                  appearance={revealedCopied ? 'soft' : 'outline'}
                  type="button"
                  onClick={handleCopyRevealed}
                  className={`flex-shrink-0`}
                >
                  {revealedCopied ? t.settings_token_copied : t.settings_token_copy}
                </Button>
              </div>
              <p className="ui-meta">
                {t.settings_token_expires_label} {formatDate(revealedToken.expiresAt, locale)}
              </p>
            </div>
          )}

          {/* Loading */}
          {extTokensLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
              <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
              {t.settings_token_loading}
            </div>
          )}

          {/* Empty state */}
          {!extTokensLoading && extTokens.length === 0 && !extTokensError && (
            <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-3 italic">
              {t.settings_token_empty}
            </p>
          )}

          {/* Token list */}
          {extTokens.length > 0 && (
            <div className="space-y-2">
              {extTokens.map((tk) => {
                const now = Date.now()
                const msLeft = tk.expiresAt - now
                // H-5: use named constant instead of magic expression
                const daysLeft = Math.ceil(msLeft / ONE_DAY_MS)
                const expired = msLeft <= 0
                const expireDate = formatDate(tk.expiresAt, locale)
                const isRegen = regeneratingId === tk.id
                const isDel = deletingId === tk.id
                return (
                  <div key={tk.id} className="flex items-center gap-3 bg-white dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{tk.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {expired ? (
                          <span className="ui-micro ui-error-text font-medium">{t.settings_token_expired}</span>
                        ) : daysLeft <= TOKEN_EXPIRY_WARNING_DAYS ? (
                          // H-4: TOKEN_EXPIRY_WARNING_DAYS instead of magic 7
                          <span className="ui-micro font-medium text-gray-500">{tpl(t.settings_token_days_warning, { days: daysLeft, date: expireDate })}</span>
                        ) : (
                          <span className="ui-micro dark:text-gray-500">{tpl(t.settings_token_days_info, { date: expireDate, days: daysLeft })}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Regenerate */}
                      <Button
                        size="md"
                        shape="rect"
                        variant="neutral"
                        appearance="outline"
                        type="button"
                        onClick={() => handleRegenerateToken(tk.id)}
                        disabled={isRegen || isDel}
                        title={t.settings_token_regenerate_title}
                      >
                        {isRegen ? <SpinnerIcon className="w-3 h-3 animate-spin" /> : <RefreshIcon />}
                        {t.settings_token_regenerate}
                      </Button>
                      {/* Delete */}
                      <Button
                        size="md"
                        shape="icon"
                        variant="danger"
                        appearance="soft"
                        aria-label={t.settings_token_delete_title}
                        type="button"
                        onClick={() => handleDeleteToken(tk.id)}
                        disabled={isDel || isRegen}
                        title={t.settings_token_delete_title}
                      >
                        {isDel ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : <TrashIcon />}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </section>
  )
}
