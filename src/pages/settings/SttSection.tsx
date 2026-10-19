/**
 * SttSection — Speech-to-Text settings section.
 *
 * Lets users choose between four STT engines:
 *   - Auto (recommended) — Whisper → Gemini STT → Groq (free) smart routing
 *   - OpenAI Whisper      — highest accuracy, requires OpenAI key
 *   - Gemini STT          — uses Gemini API key, no extra GCP setup
 *   - Groq Whisper (Free) — whisper-large-v3-turbo, 28,800 sec/day, no credit card
 *
 * The selected provider is persisted in the Zustand store (sttProvider field).
 * The Groq API key is stored in the OS keychain — add it in the card below the selector.
 */
import { type ReactNode, useEffect, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { CredentialSecretInputRow, CredentialStatusBadge, CredentialStatusMessage } from '../../components/ui/CredentialCard'
import {
  AlertTriangleIcon,
  AutoModeIcon,
  GeminiProviderIcon,
  GroqIcon,
  OpenAIProviderIcon,
} from '../../components/ui/icons'
import { TOAST_DISMISS_DELAY_MS } from '../../constants/ui'
import { GROQ_CONSOLE_URL } from '../../constants/urls'
import { useAppStore, useT } from '../../store/useAppStore'
import type { SttProvider } from '../../types'
import { tpl } from '../../utils/tpl'

// ─── Provider card definitions ────────────────────────────────────────────────

interface ProviderOption {
  id: SttProvider
  label: string
  description: string
  statusBadge: ReactNode
  icon: ReactNode
  note?: string
}

interface ProviderCardProps extends ProviderOption {
  selected: boolean
  onSelect: () => void
}

function ProviderLogoFrame({
  children,
  selected,
}: {
  children: ReactNode
  selected: boolean
}) {
  return (
    <span
      className={[
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
        selected
          ? 'border-gray-200 bg-white text-gray-950 dark:border-gray-900 dark:bg-gray-950 dark:text-white'
          : 'border-gray-200 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

function ProviderCard({ label, description, statusBadge, icon, note, selected, onSelect }: ProviderCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'btn-secondary btn-choice-card min-h-[104px] gap-2',
        selected
          ? 'btn-active'
          : '',
      ].join(' ')}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <span className="flex min-w-0 items-start gap-2">
          <ProviderLogoFrame selected={selected}>
            {icon}
          </ProviderLogoFrame>
          <span className="block min-w-0 text-sm font-semibold leading-snug pt-0.5">
            {label}
          </span>
        </span>
        <span className="flex-shrink-0">
          {statusBadge}
        </span>
      </div>

      <div className="min-w-0">
        <p className={[
          'text-xs leading-snug',
          selected ? 'text-gray-600 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400',
        ].join(' ')}>
          {description}
        </p>
        {note && (
          <p className="ui-micro mt-1 flex items-start gap-1 leading-relaxed text-gray-500 dark:text-gray-400">
            <AlertTriangleIcon className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>{note}</span>
          </p>
        )}
      </div>
    </button>
  )
}

// ─── Status badge helpers ─────────────────────────────────────────────────────

function BadgeReady({ label }: { label: string }) {
  return (
    <span className="ui-badge-xs gap-1.5 whitespace-nowrap text-gray-700 dark:bg-gray-800 dark:text-gray-300">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 flex-shrink-0" />
      {label}
    </span>
  )
}

function BadgeWarning({ label }: { label: string }) {
  return (
    <span className="ui-badge-xs gap-1.5 whitespace-nowrap text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
      {label}
    </span>
  )
}

// ─── Section component ────────────────────────────────────────────────────────

export function SttSection() {
  const keyStatus = useAppStore((state) => state.keyStatus)
  const sttProvider = useAppStore((state) => state.sttProvider)
  const setSttProvider = useAppStore((state) => state.setSttProvider)
  const bumpSttCredentialsRevision = useAppStore((state) => state.bumpSttCredentialsRevision)
  const t = useT()
  const hasOpenAIKey = keyStatus.openai
  const hasGeminiKey = keyStatus.gemini

  // ── Groq key state (optional free fallback — not in main keyStatus) ────────
  const [groqKeyExists,  setGroqKeyExists]  = useState(false)
  const [groqMasked,     setGroqMasked]     = useState<string | null>(null)
  const [groqInput,      setGroqInput]      = useState('')
  const [groqSaveMsg,    setGroqSaveMsg]    = useState<{ text: string; ok: boolean } | null>(null)
  const [groqSaving,     setGroqSaving]     = useState(false)
  const [groqDeleting,   setGroqDeleting]   = useState(false)

  // Load Groq key status on mount
  useEffect(() => {
    if (!window.api) return
    window.api.keychain.get('groq')
      .then((result) => {
        setGroqKeyExists(result.exists ?? false)
        setGroqMasked(result.masked ?? null)
      })
      .catch(() => {/* ignore */})
  }, [])

  const handleSaveGroq = async () => {
    if (!groqInput.trim() || !window.api) return
    setGroqSaving(true)
    setGroqSaveMsg(null)
    try {
      const saved = await window.api.keychain.save('groq', groqInput.trim())
      if (!saved.success) {
        setGroqSaveMsg({ text: saved.error ?? t.settings_stt_groq_failed, ok: false })
        return
      }
      const updated = await window.api.keychain.get('groq')
      setGroqKeyExists(updated.exists ?? false)
      setGroqMasked(updated.masked ?? null)
      setGroqInput('')
      bumpSttCredentialsRevision()
      setGroqSaveMsg({ text: t.settings_stt_groq_saved, ok: true })
      setTimeout(() => setGroqSaveMsg(null), TOAST_DISMISS_DELAY_MS)
    } catch (err) {
      setGroqSaveMsg({
        text: err instanceof Error ? err.message : t.settings_stt_groq_failed,
        ok: false,
      })
    } finally {
      setGroqSaving(false)
    }
  }

  const handleDeleteGroq = async () => {
    if (!window.api) return
    setGroqDeleting(true)
    try {
      const removed = await window.api.keychain.delete('groq')
      if (!removed.success) {
        setGroqSaveMsg({ text: t.settings_key_store_failed, ok: false })
        return
      }
      setGroqKeyExists(false)
      setGroqMasked(null)
      setGroqInput('')
      setGroqSaveMsg(null)
      bumpSttCredentialsRevision()
    } catch {
      setGroqSaveMsg({ text: t.settings_key_store_failed, ok: false })
    } finally {
      setGroqDeleting(false)
    }
  }

  const showGroqMasked = groqKeyExists && groqInput === ''

  const providers: ProviderOption[] = [
    {
      id: 'auto',
      label: t.settings_stt_auto,
      description: t.settings_stt_auto_desc,
      icon: <AutoModeIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />,
      statusBadge: (
        hasOpenAIKey || hasGeminiKey || groqKeyExists
          ? <BadgeReady label={t.settings_stt_ready} />
          : <BadgeWarning label={t.settings_stt_needs_key} />
      ),
    },
    {
      id: 'whisper',
      label: t.settings_stt_whisper,
      description: t.settings_stt_whisper_desc,
      icon: <OpenAIProviderIcon size={20} />,
      statusBadge: (
        hasOpenAIKey
          ? <BadgeReady label={t.settings_stt_ready} />
          : <BadgeWarning label={t.settings_stt_needs_key} />
      ),
    },
    {
      id: 'google',
      label: t.settings_stt_google,
      description: t.settings_stt_google_desc,
      icon: <GeminiProviderIcon size={20} />,
      note: t.settings_stt_google_note,
      statusBadge: (
        hasGeminiKey
          ? <BadgeReady label={t.settings_stt_ready} />
          : <BadgeWarning label={t.settings_stt_needs_gemini} />
      ),
    },
    {
      id: 'groq',
      label: t.settings_stt_groq,
      description: t.settings_stt_groq_desc,
      icon: <GroqIcon size={10} />,
      statusBadge: (
        groqKeyExists
          ? <BadgeReady label={t.settings_stt_ready} />
          : <BadgeWarning label={t.settings_stt_needs_groq} />
      ),
    },
  ]

  return (
    <section className="space-y-3">
      <h2 className="section-label">{t.settings_stt_section}</h2>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">
        {/* STT provider selector */}
        <div className="px-4 py-3.5 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_stt_select_provider}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_stt_provider_desc}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {providers.map((p) => (
              <ProviderCard
                key={p.id}
                {...p}
                selected={sttProvider === p.id}
                onSelect={() => setSttProvider(p.id)}
              />
            ))}
          </div>
        </div>

        {/* Groq API Key */}
        <div className="px-4 py-3.5 space-y-2">
          {/* Header: title + link on left, badge on right */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <ProviderLogoFrame selected={false}>
                <GroqIcon size={10} />
              </ProviderLogoFrame>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {t.settings_stt_groq_key}
                </h3>
                <Button
                  size="md"
                  shape="rect"
                  variant="neutral"
                  appearance="ghost"
                  type="button"
                  onClick={() => window.api?.openExternal(GROQ_CONSOLE_URL)}
                >
                  {t.settings_get_key}
                </Button>
              </div>
            </div>
            <CredentialStatusBadge
              hasSecret={groqKeyExists}
              labels={{
                saved: t.settings_key_saved,
                empty: t.settings_no_key,
                invalid: t.settings_key_invalid,
              }}
            />
          </div>

          <CredentialSecretInputRow
            inputValue={groqInput}
            maskedValue={groqMasked}
            showMasked={showGroqMasked}
            placeholder={tpl(t.settings_key_placeholder_paste, { name: 'Groq' })}
            hasSecret={groqKeyExists}
            isBusy={groqSaving}
            isDeleting={groqDeleting}
            labels={{
              remove: t.settings_remove,
              verifying: t.settings_verifying,
              verified: t.settings_verified,
              tryAgain: t.settings_try_again,
              submit: t.settings_verify_save,
            }}
            onInputChange={(value) => {
              setGroqInput(value)
              if (groqSaveMsg) setGroqSaveMsg(null)
            }}
            onSubmit={handleSaveGroq}
            onDelete={handleDeleteGroq}
          />

          {groqSaveMsg && (
            <CredentialStatusMessage
              message={groqSaveMsg.text}
              tone={groqSaveMsg.ok ? 'success' : 'error'}
            />
          )}
        </div>
      </div>

    </section>
  )
}
